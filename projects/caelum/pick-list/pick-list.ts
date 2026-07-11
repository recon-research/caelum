import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  TemplateRef,
  viewChildren,
  WritableSignal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { LiveAnnouncer } from '@angular/cdk/a11y';

/** Per-instance id source for the aria-describedby instructions (SSR/hydration-stable, unlike random). */
let nextUniqueId = 0;

/** Which of the two lists — the left/`source` or the right/`target`. */
export type CaePickListSide = 'source' | 'target';

/** The payload of {@link CaePickList.transfer} — what moved, which way, and both lists' new orders. */
export interface CaePickListTransferEvent<T = unknown> {
  /** The item(s) moved, in their source order (one for move-selected, many for move-all). */
  readonly items: readonly T[];
  /** The list the items left. */
  readonly from: CaePickListSide;
  /** The list the items landed in. */
  readonly to: CaePickListSide;
  /** The full source list in its new order (a fresh array; the bound `[(source)]` receives the same). */
  readonly source: readonly T[];
  /** The full target list in its new order (a fresh array; the bound `[(target)]` receives the same). */
  readonly target: readonly T[];
}

/** The context handed to a `caePickListItem` template: the item, its index, and whether it is active. */
export interface CaePickListItemContext<T = unknown> {
  /** The item to render. */
  $implicit: T;
  /** The item's current index within its list. */
  readonly index: number;
  /** Whether this item is the active (selected, move-source) row of its list. */
  readonly active: boolean;
}

/**
 * Marks the `<ng-template>` that renders one `cae-pick-list` row (used for **both** lists), so the
 * component is content-agnostic (pick rich rows, not just strings). Usage:
 * `<ng-template caePickListItem let-item let-i="index">`. Absent ⇒ rows fall back to `{{ item }}`.
 * Import it alongside `CaePickList`. Rows must be **non-interactive** — a `role="option"` must not
 * contain focusable descendants (a nested `<a>`/`<button>` both breaks ARIA and collides with the
 * roving tabindex) — and **distinct references** (objects, or unique primitives) across *both* lists:
 * each list `track`s by identity, so transferring a primitive that already exists in the destination
 * would collide two rows on one key. `let-item` is typed `unknown` (Angular can't infer the projected
 * template's `T` from the sibling `[source]`/`[target]`), so annotate or cast (`$any(item)`) in it.
 */
@Directive({ selector: 'ng-template[caePickListItem]' })
export class CaePickListItemDef<T = unknown> {
  /** The captured template, typed for the `let-`bindings below. */
  readonly template = inject<TemplateRef<CaePickListItemContext<T>>>(TemplateRef);

  /** Narrows the `let-` context types for the template type-checker. */
  static ngTemplateContextGuard<T>(
    _dir: CaePickListItemDef<T>,
    ctx: unknown,
  ): ctx is CaePickListItemContext<T> {
    // Compile-time only (Angular never calls this at runtime); `void` marks ctx intentionally unused
    // in the body — it earns its keep solely in the return-type predicate above.
    void ctx;
    return true;
  }
}

/** Clamp a raw active index into `[0, n-1]`, or `-1` when the list is empty (the a11y-authoritative value). */
function clampActive(raw: number, n: number): number {
  return n ? Math.min(Math.max(raw, 0), n - 1) : -1;
}

/**
 * `cae-pick-list` — two connected, keyboard-operable lists you move items between (`p-pickList`
 * parity; Book 11 §3.3, the drag-drop cluster). Book 11 §3.3 settles the build: *"Two connected
 * `cdkDropList`s (transfer between source and target) with `cdkDropListConnectedTo`. Add
 * move-selected / move-all buttons so the transfer is reachable by keyboard, not only by dragging
 * across."* It reuses `cae-order-list`'s drag + move-button + `LiveAnnouncer` machinery — effectively
 * two order-lists wired together across a transfer axis. Built on `@angular/cdk/drag-drop` +
 * `@angular/cdk/a11y` only — no foreign drag library (Book 03 keeps the provenance surface clean).
 *
 * **The two transfer paths.** (1) **Drag** — drag a row from one list and drop it on the other; the
 * two `cdkDropList`s are wired with `cdkDropListConnectedTo`, so the drop transfers the item across.
 * (2) **Keyboard/pointer, no drag** — a control column between the lists: *move selected →*, *move all
 * →*, *← move selected*, *⇐ move all*, each acting on the **active** row (or the whole list). Either
 * path updates the same `[(source)]` / `[(target)]` models and emits `(transfer)`, and every move is
 * announced via `LiveAnnouncer` — so the §3.5 parity leg holds: a keyboard path for every drag,
 * announced for non-visual users.
 *
 * **Scope (v1 — transfer only).** Dragging **within** a list does not reorder it (`cdkDropList`
 * sorting is disabled): the only drag operation is the cross-list transfer, which is exactly the one
 * with a full keyboard path. Reordering **within** each list (drag *and* its own move-up/down buttons,
 * shipped together so §3.5's *keyboard-path-for-every-drag* invariant is never broken) is a deferred
 * follow-on (#342) — as are multi-select transfer, per-side header slots, in-list filtering, and RTL
 * of the transfer axis. Transfer — the pick-list's defining operation — ships complete and accessible.
 *
 * **Selection & focus model (per list).** Each list is an independent `role="listbox"` whose rows are
 * `role="option"`, with its own active row (the move source): it carries `aria-selected` and is that
 * list's single tab stop (roving tabindex). Arrow keys move the active row within a list (Home/End jump
 * to its ends); clicking or focusing a row activates it. This mirrors `cae-order-list` (and, before it,
 * `cae-input-otp`'s deliberate roving-tabindex-without-a-key-manager choice): a data-driven `@for` over
 * a `[source]`/`[target]` signal has no child option components for a CDK key manager to drive, so a
 * clamped four-key handler is the deterministic minimum, and keeping each active index in a signal lets
 * it survive a transfer (it re-clamps when its list shrinks).
 *
 * **Accessibility.** Each list needs an accessible name: `[sourceAriaLabel]`/`[targetAriaLabel]`
 * (defaults `"Source list"`/`"Target list"`) or `[sourceAriaLabelledby]`/`[targetAriaLabelledby]`
 * (preferred when a visible heading is shown). Transfer buttons are real `<button>`s with `aria-label`s,
 * disabled — via `aria-disabled`, **not** the native attribute, so a button that empties its source
 * stays focusable instead of blurring to `<body>` and stranding the keyboard user — when the relevant
 * list is empty. State (both orders, both active indices) lives in signals, so it repaints under a
 * zoneless host (Book 01 §3.2); drag pointer math is CDK's, and the drop result lands in the models
 * (Book 05 §3.4 zoneless note).
 *
 * **Binding the value.** `[source]` and `[target]` are `model()`s — bind them **two-way**. With
 * `WritableSignal`s (the library's idiom) decompose as below; plain fields can use `[(source)]` /
 * `[(target)]`. A **one-way** `[source]` leaves that list *uncontrolled*: a transfer still shows, but
 * the parent's array drifts out of sync and the move is lost the next time the parent reassigns it —
 * persist `(transfer)` / `(sourceChange)` / `(targetChange)` instead.
 *
 * ```html
 * <cae-pick-list
 *   [source]="available()"
 *   (sourceChange)="available.set($event)"
 *   [target]="selected()"
 *   (targetChange)="selected.set($event)"
 *   sourceAriaLabel="Available roles"
 *   targetAriaLabel="Assigned roles"
 * >
 *   <ng-template caePickListItem let-role>{{ $any(role).name }}</ng-template>
 * </cae-pick-list>
 * ```
 */
@Component({
  selector: 'cae-pick-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, CdkDropList, CdkDrag],
  host: { class: 'cae-pick-list' },
  template: `
    <div class="cae-pick-list__pane">
      <ul
        class="cae-pick-list__list"
        role="listbox"
        cdkDropList
        cdkDropListSortingDisabled
        #sourceDrop="cdkDropList"
        [cdkDropListData]="source()"
        [cdkDropListConnectedTo]="[targetDrop]"
        [attr.aria-label]="
          sourceAriaLabelledby() ? null : sourceAriaLabel().trim() || 'Source list'
        "
        [attr.aria-labelledby]="sourceAriaLabelledby() || null"
        [attr.aria-describedby]="instructionsId"
        (cdkDropListDropped)="onDrop($event, 'source')"
      >
        @for (item of source(); track item; let i = $index) {
          <li
            #sourceOption
            class="cae-pick-list__option"
            [class.cae-pick-list__option--active]="i === sourceActive()"
            role="option"
            cdkDrag
            [attr.aria-selected]="i === sourceActive()"
            [tabindex]="i === sourceTabStop() ? 0 : -1"
            (focus)="activate('source', i)"
            (click)="activate('source', i)"
            (keydown)="onKeydown('source', i, $event)"
          >
            @if (itemDef(); as def) {
              <ng-container
                [ngTemplateOutlet]="def.template"
                [ngTemplateOutletContext]="{
                  $implicit: item,
                  index: i,
                  active: i === sourceActive(),
                }"
              />
            } @else {
              {{ item }}
            }
          </li>
        }
      </ul>
    </div>

    <div class="cae-pick-list__controls" role="group" aria-label="Transfer controls">
      <button
        type="button"
        class="cae-pick-list__btn"
        aria-label="Move selected to target"
        [attr.aria-disabled]="!canMoveToTarget() ? 'true' : null"
        (click)="moveSelectedToTarget()"
      >
        <span aria-hidden="true">&#8594;</span>
      </button>
      <button
        type="button"
        class="cae-pick-list__btn"
        aria-label="Move all to target"
        [attr.aria-disabled]="!canMoveToTarget() ? 'true' : null"
        (click)="moveAllToTarget()"
      >
        <span aria-hidden="true">&#8658;</span>
      </button>
      <button
        type="button"
        class="cae-pick-list__btn"
        aria-label="Move selected to source"
        [attr.aria-disabled]="!canMoveToSource() ? 'true' : null"
        (click)="moveSelectedToSource()"
      >
        <span aria-hidden="true">&#8592;</span>
      </button>
      <button
        type="button"
        class="cae-pick-list__btn"
        aria-label="Move all to source"
        [attr.aria-disabled]="!canMoveToSource() ? 'true' : null"
        (click)="moveAllToSource()"
      >
        <span aria-hidden="true">&#8656;</span>
      </button>
    </div>

    <div class="cae-pick-list__pane">
      <ul
        class="cae-pick-list__list"
        role="listbox"
        cdkDropList
        cdkDropListSortingDisabled
        #targetDrop="cdkDropList"
        [cdkDropListData]="target()"
        [cdkDropListConnectedTo]="[sourceDrop]"
        [attr.aria-label]="
          targetAriaLabelledby() ? null : targetAriaLabel().trim() || 'Target list'
        "
        [attr.aria-labelledby]="targetAriaLabelledby() || null"
        [attr.aria-describedby]="instructionsId"
        (cdkDropListDropped)="onDrop($event, 'target')"
      >
        @for (item of target(); track item; let i = $index) {
          <li
            #targetOption
            class="cae-pick-list__option"
            [class.cae-pick-list__option--active]="i === targetActive()"
            role="option"
            cdkDrag
            [attr.aria-selected]="i === targetActive()"
            [tabindex]="i === targetTabStop() ? 0 : -1"
            (focus)="activate('target', i)"
            (click)="activate('target', i)"
            (keydown)="onKeydown('target', i, $event)"
          >
            @if (itemDef(); as def) {
              <ng-container
                [ngTemplateOutlet]="def.template"
                [ngTemplateOutletContext]="{
                  $implicit: item,
                  index: i,
                  active: i === targetActive(),
                }"
              />
            } @else {
              {{ item }}
            }
          </li>
        }
      </ul>
    </div>

    <span [id]="instructionsId" class="cae-pick-list__sr-only">
      Select an item, then use the transfer buttons or drag to move it to the other list.
    </span>
  `,
  styles: `
    :host {
      display: flex;
      gap: var(--cae-space-2);
      align-items: stretch;
    }
    .cae-pick-list__pane {
      flex: 1 1 0;
      min-inline-size: 0;
      display: flex;
    }
    .cae-pick-list__controls {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--cae-space-1);
    }
    .cae-pick-list__btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: var(--cae-space-5);
      min-height: var(--cae-space-5);
      padding: var(--cae-space-1);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-sm);
      background: var(--cae-surface-raised);
      color: var(--cae-color-on-surface);
      font: inherit;
      line-height: 1;
      cursor: pointer;
    }
    .cae-pick-list__btn:hover:not([aria-disabled='true']) {
      background: var(--cae-surface-sunken);
    }
    /* aria-disabled (not native [disabled]) so a button that empties its source stays focusable — a
       focused native-disabled button blurs to <body>, stranding the keyboard user mid-transfer. */
    .cae-pick-list__btn[aria-disabled='true'] {
      opacity: 0.5;
      cursor: default;
    }
    .cae-pick-list__list {
      flex: 1 1 auto;
      margin: 0;
      padding: var(--cae-space-1);
      list-style: none;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-base);
      overflow: auto;
    }
    .cae-pick-list__option {
      display: block;
      padding: var(--cae-space-2) var(--cae-space-3);
      border-radius: var(--cae-radius-sm);
      color: var(--cae-color-on-surface);
      cursor: grab;
    }
    /* Active row differs by colour + aria-selected (Caelum ships no font-weight token). */
    .cae-pick-list__option--active {
      background: var(--cae-color-primary);
      color: var(--cae-color-on-primary);
    }
    .cae-pick-list__btn:focus-visible,
    .cae-pick-list__option:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* Surface halo keeps the ring visible over the primary-filled active row (WCAG 1.4.11). */
      box-shadow: 0 0 0 4px var(--cae-surface-raised);
    }
    /* The CDK drag preview/placeholder inherit the row's emulated styles (same _ngcontent attr). */
    .cae-pick-list__option.cdk-drag-placeholder {
      opacity: 0.5;
    }
    /* Visually-hidden but AT-readable (the standard sr-only recipe) — the transfer instructions both
       listboxes are aria-describedby-linked to. */
    .cae-pick-list__sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      border: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }
  `,
})
export class CaePickList<T = unknown> {
  private readonly announcer = inject(LiveAnnouncer);
  private readonly sourceOptionEls = viewChildren<ElementRef<HTMLElement>>('sourceOption');
  private readonly targetOptionEls = viewChildren<ElementRef<HTMLElement>>('targetOption');

  /** Stable id linking both listboxes to their visually-hidden transfer instructions (aria-describedby). */
  protected readonly instructionsId = `cae-pick-list-instructions-${nextUniqueId++}`;

  /** The left/source list, two-way. Transfers replace it with a fresh array. */
  readonly source = model<readonly T[]>([]);
  /** The right/target list, two-way. Transfers replace it with a fresh array. */
  readonly target = model<readonly T[]>([]);
  /** Accessible name for the source `role="listbox"` (default `"Source list"`); ignored if labelledby is set. */
  readonly sourceAriaLabel = input('');
  /** Accessible name for the target `role="listbox"` (default `"Target list"`); ignored if labelledby is set. */
  readonly targetAriaLabel = input('');
  /** `id` of a visible element labelling the source list — preferred when a heading is shown. */
  readonly sourceAriaLabelledby = input('');
  /** `id` of a visible element labelling the target list — preferred when a heading is shown. */
  readonly targetAriaLabelledby = input('');
  /** Emits on every transfer (drag or button) with the moved item(s), the direction, and both new orders. */
  readonly transfer = output<CaePickListTransferEvent<T>>();

  /** The projected row template (shared by both lists), if the consumer supplied one. */
  protected readonly itemDef = contentChild(CaePickListItemDef<T>);

  /** Raw active indices; may momentarily exceed a list's length after a transfer (clamped on read). */
  private readonly sourceActiveIndex = signal(0);
  private readonly targetActiveIndex = signal(0);

  /** Active index of each list, clamped into range (or `-1` when empty) — the a11y-authoritative value. */
  protected readonly sourceActive = computed(() =>
    clampActive(this.sourceActiveIndex(), this.source().length),
  );
  protected readonly targetActive = computed(() =>
    clampActive(this.targetActiveIndex(), this.target().length),
  );
  /** Each list's single tab stop — its `active()` floored at 0 so a non-empty list always has one tabbable row. */
  protected readonly sourceTabStop = computed(() => Math.max(this.sourceActive(), 0));
  protected readonly targetTabStop = computed(() => Math.max(this.targetActive(), 0));

  /** Transfer to a side is possible iff its source (the *other* list) has items to move. */
  protected readonly canMoveToTarget = computed(() => this.source().length > 0);
  protected readonly canMoveToSource = computed(() => this.target().length > 0);

  constructor() {
    // Clamp each RAW active index whenever its list changes, so a shrink can't leave a stale
    // out-of-range index that would "resurrect" (jump to a different item) if the list grows back.
    // The `active()` computeds clamp on read; this keeps the stored indices coherent too. Guarded so
    // it's a no-op once clamped (can't loop).
    effect(() => {
      this.reclamp(this.sourceActiveIndex, this.source().length);
      this.reclamp(this.targetActiveIndex, this.target().length);
    });
  }

  private reclamp(idx: WritableSignal<number>, n: number): void {
    const clamped = n ? Math.min(Math.max(idx(), 0), n - 1) : 0;
    if (clamped !== idx()) idx.set(clamped);
  }

  /** Make row `index` of `side` the active (move-source) row. */
  protected activate(side: CaePickListSide, index: number): void {
    this.activeSignal(side).set(index);
  }

  protected moveSelectedToTarget(): void {
    if (this.canMoveToTarget())
      this.transferAt('source', this.sourceActive(), 'target', this.target().length);
  }
  protected moveSelectedToSource(): void {
    if (this.canMoveToSource())
      this.transferAt('target', this.targetActive(), 'source', this.source().length);
  }
  protected moveAllToTarget(): void {
    if (this.canMoveToTarget()) this.transferAll('source', 'target');
  }
  protected moveAllToSource(): void {
    if (this.canMoveToSource()) this.transferAll('target', 'source');
  }

  /** A drop on `dropSide` transfers the dragged row from the other list. Within-list drops are no-ops (v1). */
  protected onDrop(event: CdkDragDrop<readonly T[]>, dropSide: CaePickListSide): void {
    // Sorting is disabled, so a same-container drop can't reorder — ignore it (no within-list reorder in v1).
    if (event.previousContainer === event.container) return;
    const fromSide: CaePickListSide = dropSide === 'source' ? 'target' : 'source';
    this.transferAt(fromSide, event.previousIndex, dropSide, event.currentIndex);
  }

  /** Arrow / Home / End move the active row within `side` (navigation only — moves are the buttons' job). */
  protected onKeydown(side: CaePickListSide, index: number, event: KeyboardEvent): void {
    const last = this.read(side).length - 1;
    if (last < 0) return;
    let target: number | null = null;
    switch (event.key) {
      case 'ArrowUp':
        target = Math.max(0, index - 1);
        break;
      case 'ArrowDown':
        target = Math.min(last, index + 1);
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.activeSignal(side).set(target);
    const els = side === 'source' ? this.sourceOptionEls() : this.targetOptionEls();
    els[target]?.nativeElement.focus();
  }

  /** Move one item from `fromSide[fromIndex]` into `toSide` at `toIndex`; announce + emit. */
  private transferAt(
    fromSide: CaePickListSide,
    fromIndex: number,
    toSide: CaePickListSide,
    toIndex: number,
  ): void {
    const fromArr = [...this.read(fromSide)];
    const removed = fromArr.splice(fromIndex, 1);
    if (removed.length === 0) return; // nothing at that index (e.g. empty list) — no-op
    const item = removed[0];
    const toArr = [...this.read(toSide)];
    const insertAt = Math.min(Math.max(toIndex, 0), toArr.length);
    toArr.splice(insertAt, 0, item);
    this.write(fromSide, fromArr);
    this.write(toSide, toArr);
    this.activeSignal(toSide).set(insertAt); // the moved item is active in its new list
    this.announcer.announce(
      `Moved to the ${toSide} list, position ${insertAt + 1} of ${toArr.length}.`,
    );
    this.emitTransfer([item], fromSide, toSide);
  }

  /** Move every item of `fromSide` onto the end of `toSide`; announce + emit. */
  private transferAll(fromSide: CaePickListSide, toSide: CaePickListSide): void {
    const fromArr = [...this.read(fromSide)];
    if (fromArr.length === 0) return;
    const firstAt = this.read(toSide).length;
    const toArr = [...this.read(toSide), ...fromArr];
    this.write(fromSide, []);
    this.write(toSide, toArr);
    this.activeSignal(toSide).set(firstAt); // the first moved item is active in its new list
    const n = fromArr.length;
    this.announcer.announce(`Moved ${n} item${n === 1 ? '' : 's'} to the ${toSide} list.`);
    this.emitTransfer(fromArr, fromSide, toSide);
  }

  private emitTransfer(items: readonly T[], from: CaePickListSide, to: CaePickListSide): void {
    // `source()`/`target()` are read after the writes above, so they carry the new orders.
    this.transfer.emit({ items, from, to, source: this.source(), target: this.target() });
  }

  private read(side: CaePickListSide): readonly T[] {
    return side === 'source' ? this.source() : this.target();
  }
  private write(side: CaePickListSide, value: readonly T[]): void {
    if (side === 'source') this.source.set(value);
    else this.target.set(value);
  }
  private activeSignal(side: CaePickListSide): WritableSignal<number> {
    return side === 'source' ? this.sourceActiveIndex : this.targetActiveIndex;
  }
}
