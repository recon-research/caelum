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
  /** The item(s) moved, in their source order (the selected block, or the whole list for move-all). */
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

/** The context handed to a `caePickListItem` template: the item, its index, focus, and selection. */
export interface CaePickListItemContext<T = unknown> {
  /** The item to render. */
  $implicit: T;
  /** The item's current index within its list. */
  readonly index: number;
  /** Whether this is the *focused* (roving tab stop) row of its list — distinct from selection. */
  readonly active: boolean;
  /** Whether this row is in its list's multi-selection (part of the move-source block). */
  readonly selected: boolean;
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
 * follow-on (#342) — as are per-side header slots, in-list filtering, and RTL of the transfer axis.
 * Transfer — the pick-list's defining operation — ships complete and accessible.
 *
 * **Selection & focus model (per list; ARIA listbox multiselect).** Each list is an independent
 * `role="listbox"` (`aria-multiselectable`) whose rows are `role="option"`. Focus and selection are
 * **separate**: exactly one row per list is *focused* (its roving tab stop), while a `[(sourceSelection)]`
 * / `[(targetSelection)]` set is the block the transfer buttons act on. Selection is **empty by default**
 * (`p-pickList` parity) and stores *item references*, so it survives an external reorder/edit and prunes
 * to items still present in its list (items moved out drop from it). Pointer: click selects one,
 * Ctrl/Cmd+click toggles, Shift+click ranges. Keyboard:
 * Arrow/Home/End move focus, Space toggles the focused row, Shift+Arrow/Home/End range-extend from the
 * anchor, Ctrl/Cmd+A selects all in that list, Escape clears it. With nothing selected the buttons fall
 * back to the focused row. Like `cae-order-list` (and `cae-input-otp` before it), focus is a deliberate
 * roving-tabindex-without-a-key-manager over a `@for` — no child option components — and keeping focus +
 * anchor in signals lets them follow the item through a transfer for free.
 *
 * **Accessibility.** Each list needs an accessible name: `[sourceAriaLabel]`/`[targetAriaLabel]`
 * (defaults `"Source list"`/`"Target list"`) or `[sourceAriaLabelledby]`/`[targetAriaLabelledby]`
 * (preferred when a visible heading is shown). Transfer buttons are real `<button>`s with `aria-label`s,
 * disabled — via `aria-disabled`, **not** the native attribute, so a button that empties its source
 * stays focusable instead of blurring to `<body>` and stranding the keyboard user — when the relevant
 * list is empty. State (both orders, both focus indices, both selections) lives in signals, so it
 * repaints under a zoneless host (Book 01 §3.2); drag pointer math is CDK's, and the drop result lands
 * in the models (Book 05 §3.4 zoneless note).
 *
 * **Binding the value.** `[source]` and `[target]` are `model()`s — bind them **two-way**. With
 * `WritableSignal`s (the library's idiom) decompose as below; plain fields can use `[(source)]` /
 * `[(target)]`. A **one-way** `[source]` leaves that list *uncontrolled*: a transfer still shows, but
 * the parent's array drifts out of sync and the move is lost the next time the parent reassigns it —
 * persist `(transfer)` / `(sourceChange)` / `(targetChange)` instead. `[(sourceSelection)]` /
 * `[(targetSelection)]` are optional two-way selection bindings (each defaults to empty).
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
        aria-multiselectable="true"
        cdkDropList
        cdkDropListSortingDisabled
        #sourceDrop="cdkDropList"
        [cdkDropListData]="source()"
        [cdkDropListConnectedTo]="[targetDrop]"
        [attr.aria-label]="
          sourceAriaLabelledby() ? null : sourceAriaLabel().trim() || 'Source list'
        "
        [attr.aria-labelledby]="sourceAriaLabelledby() || null"
        (cdkDropListDropped)="onDrop($event, 'source')"
      >
        @for (item of source(); track item; let i = $index) {
          <li
            #sourceOption
            class="cae-pick-list__option"
            [class.cae-pick-list__option--active]="i === sourceActive()"
            [class.cae-pick-list__option--selected]="isSelected('source', item)"
            role="option"
            cdkDrag
            [attr.aria-selected]="isSelected('source', item)"
            [attr.aria-describedby]="instructionsId"
            [tabindex]="i === sourceTabStop() ? 0 : -1"
            (focus)="activate('source', i)"
            (click)="onOptionClick('source', i, $event)"
            (keydown)="onKeydown('source', i, $event)"
          >
            @if (itemDef(); as def) {
              <ng-container
                [ngTemplateOutlet]="def.template"
                [ngTemplateOutletContext]="{
                  $implicit: item,
                  index: i,
                  active: i === sourceActive(),
                  selected: isSelected('source', item),
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
        aria-multiselectable="true"
        cdkDropList
        cdkDropListSortingDisabled
        #targetDrop="cdkDropList"
        [cdkDropListData]="target()"
        [cdkDropListConnectedTo]="[sourceDrop]"
        [attr.aria-label]="
          targetAriaLabelledby() ? null : targetAriaLabel().trim() || 'Target list'
        "
        [attr.aria-labelledby]="targetAriaLabelledby() || null"
        (cdkDropListDropped)="onDrop($event, 'target')"
      >
        @for (item of target(); track item; let i = $index) {
          <li
            #targetOption
            class="cae-pick-list__option"
            [class.cae-pick-list__option--active]="i === targetActive()"
            [class.cae-pick-list__option--selected]="isSelected('target', item)"
            role="option"
            cdkDrag
            [attr.aria-selected]="isSelected('target', item)"
            [attr.aria-describedby]="instructionsId"
            [tabindex]="i === targetTabStop() ? 0 : -1"
            (focus)="activate('target', i)"
            (click)="onOptionClick('target', i, $event)"
            (keydown)="onKeydown('target', i, $event)"
          >
            @if (itemDef(); as def) {
              <ng-container
                [ngTemplateOutlet]="def.template"
                [ngTemplateOutletContext]="{
                  $implicit: item,
                  index: i,
                  active: i === targetActive(),
                  selected: isSelected('target', item),
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
      Space toggles selection; Shift plus Arrow, Home, or End extends it; Control plus A selects
      all; Escape clears. Use the transfer buttons or drag to move the selection to the other list.
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
    /* Focused (roving tab stop) row, when not also selected: a subtle fill so the move target is
       discoverable before the ring appears. Selection (below) overrides it. */
    .cae-pick-list__option--active {
      background: var(--cae-surface-sunken);
    }
    /* Selected rows carry the strong colour + aria-selected (Caelum ships no font-weight token);
       ordered after --active so a focused+selected row reads as selected. */
    .cae-pick-list__option--selected {
      background: var(--cae-color-primary);
      color: var(--cae-color-on-primary);
    }
    .cae-pick-list__btn:focus-visible,
    .cae-pick-list__option:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* Surface halo keeps the ring visible over the primary-filled selected row (WCAG 1.4.11). */
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
  /**
   * The source list's multi-selection, two-way — the *items* (by identity) the transfer buttons move.
   * Empty by default (`p-pickList` parity); the emitted array is always in source order and stores
   * references (not indices), so it survives an external reorder/edit; items moved out of the list (or
   * removed) prune from it. With nothing selected, the buttons fall back to the focused source row.
   */
  readonly sourceSelection = model<readonly T[]>([]);
  /** The target list's multi-selection, two-way — the target-side mirror of {@link sourceSelection}. */
  readonly targetSelection = model<readonly T[]>([]);
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

  /**
   * Range anchors for Shift+click / Shift+Arrow — stored as the *item* (not an index) so they survive a
   * transfer or external edit that shifts indices (an index anchor would silently mis-range).
   */
  private readonly sourceAnchor = signal<T | null>(null);
  private readonly targetAnchor = signal<T | null>(null);
  /** Each side's selection as a `Set` for O(1) membership tests in the template hot path. */
  private readonly sourceSelectedSet = computed(() => new Set<T>(this.sourceSelection()));
  private readonly targetSelectedSet = computed(() => new Set<T>(this.targetSelection()));
  /** Whether `item` is in `side`'s selection (template hot path — called per row). */
  protected isSelected(side: CaePickListSide, item: T): boolean {
    return this.selectedSetOf(side).has(item);
  }

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
    // Prune each side's selection to items still present after an external change or a transfer
    // (selection is by identity, so removed/moved items must drop out). Guarded on length so it
    // converges — no effect loop. Mirrors cae-order-list's prune.
    effect(() => this.prune('source'));
    effect(() => this.prune('target'));
  }

  /** Drop from `side`'s selection any items no longer present in that list. */
  private prune(side: CaePickListSide): void {
    const present = this.selectedSetOf(side); // reads the side's selection
    if (present.size === 0) return;
    const model = this.selectionModel(side);
    const kept = this.read(side).filter((it) => present.has(it));
    if (kept.length !== model().length) model.set(kept);
  }

  private reclamp(idx: WritableSignal<number>, n: number): void {
    const clamped = n ? Math.min(Math.max(idx(), 0), n - 1) : 0;
    if (clamped !== idx()) idx.set(clamped);
  }

  /** Move `side`'s roving focus (its tab stop) to row `index` — does not change selection. */
  protected activate(side: CaePickListSide, index: number): void {
    this.activeSignal(side).set(index);
  }

  /**
   * Pointer selection within `side` (ARIA listbox multiselect): plain click selects only this row;
   * Ctrl/Cmd-click toggles it; Shift-click selects the contiguous range from the anchor. Always focuses.
   */
  protected onOptionClick(side: CaePickListSide, index: number, event: MouseEvent): void {
    this.activeSignal(side).set(index);
    const item = this.read(side)[index];
    if (item === undefined) return;
    if (event.shiftKey) {
      this.selectRange(side, index, index);
    } else if (event.ctrlKey || event.metaKey) {
      this.toggle(side, index);
      this.anchorSignal(side).set(item);
    } else {
      this.commitSelection(side, new Set([item]));
      this.anchorSignal(side).set(item);
    }
  }

  protected moveSelectedToTarget(): void {
    if (this.canMoveToTarget()) this.transferSelected('source', 'target');
  }
  protected moveSelectedToSource(): void {
    if (this.canMoveToSource()) this.transferSelected('target', 'source');
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

  /**
   * Keyboard model within `side` (ARIA listbox multiselect): Arrow/Home/End move focus; Space toggles
   * the focused row; Shift+Arrow / Shift+Home/End range-extend from the anchor; Ctrl/Cmd+A selects all
   * in that list; Escape clears it. Transfers are the buttons' job (a data list has no default action).
   */
  protected onKeydown(side: CaePickListSide, index: number, event: KeyboardEvent): void {
    const items = this.read(side);
    const last = items.length - 1;
    if (last < 0) return;

    if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault();
      this.commitSelection(side, new Set(items));
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.toggle(side, index);
      this.anchorSignal(side).set(items[index] ?? null);
      return;
    }
    if (event.key === 'Escape') {
      // A keyboard path to clear the whole selection (pointer users just click one row to reduce it).
      if (this.selectionModel(side)().length) {
        event.preventDefault();
        this.commitSelection(side, new Set());
      }
      return;
    }

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
    // Shift + a navigation key extends the range from the anchor (or this origin row) to the target.
    if (event.shiftKey) this.selectRange(side, target, index);
    this.activeSignal(side).set(target);
    const els = side === 'source' ? this.sourceOptionEls() : this.targetOptionEls();
    els[target]?.nativeElement.focus();
  }

  /** Toggle row `index` of `side` in/out of that list's selection. */
  private toggle(side: CaePickListSide, index: number): void {
    const item = this.read(side)[index];
    if (item === undefined) return;
    const set = new Set(this.selectionModel(side)());
    if (set.has(item)) set.delete(item);
    else set.add(item);
    this.commitSelection(side, set);
  }

  /**
   * Select the contiguous range from `side`'s anchor to `focus` (inclusive), replacing its selection.
   * The anchor is resolved from the stored *item* (index-stable across transfers); with no live anchor
   * one is established at `fallbackFrom` (the origin row) so subsequent extends grow from there.
   */
  private selectRange(side: CaePickListSide, focus: number, fallbackFrom: number): void {
    const items = this.read(side);
    const anchorItem = this.anchorSignal(side)();
    const anchorIdx = anchorItem != null ? items.indexOf(anchorItem) : -1;
    const from = anchorIdx >= 0 ? anchorIdx : fallbackFrom;
    if (anchorIdx < 0) this.anchorSignal(side).set(items[fallbackFrom] ?? null);
    const lo = Math.max(0, Math.min(from, focus));
    const hi = Math.min(items.length - 1, Math.max(from, focus));
    const set = new Set<T>();
    for (let i = lo; i <= hi; i++) set.add(items[i]);
    this.commitSelection(side, set);
  }

  /** Commit `side`'s new selection: store it in list order and announce the count. */
  private commitSelection(side: CaePickListSide, set: ReadonlySet<T>): void {
    const items = this.read(side);
    const ordered = items.filter((it) => set.has(it));
    this.selectionModel(side).set(ordered);
    this.announcer.announce(
      ordered.length === 0
        ? `Selection cleared in the ${side} list`
        : `${ordered.length} of ${items.length} selected in the ${side} list`,
    );
  }

  /** Ascending indices the transfer acts on for `side`: its selected rows, or its focused row when none. */
  private moveIndicesOf(side: CaePickListSide): readonly number[] {
    const items = this.read(side);
    const sel = this.selectedSetOf(side);
    const picked = items.reduce<number[]>((acc, it, i) => {
      if (sel.has(it)) acc.push(i);
      return acc;
    }, []);
    if (picked.length) return picked;
    const a = this.activeOf(side);
    return a >= 0 ? [a] : [];
  }

  /**
   * Move `fromSide`'s selected block (or, with nothing selected, its focused row) onto the end of
   * `toSide`, preserving the rows' relative order; focus the first moved row there; announce + emit.
   * The source-side selection then prunes to empty (its items are gone) via the prune effect.
   */
  private transferSelected(fromSide: CaePickListSide, toSide: CaePickListSide): void {
    const idx = this.moveIndicesOf(fromSide);
    if (!idx.length) return;
    const fromArr = this.read(fromSide);
    const movedItems = idx.map((i) => fromArr[i]);
    const movedSet = new Set<T>(movedItems);
    const remaining = fromArr.filter((it) => !movedSet.has(it));
    const firstAt = this.read(toSide).length;
    const toArr = [...this.read(toSide), ...movedItems];
    this.write(fromSide, remaining);
    this.write(toSide, toArr);
    this.activeSignal(toSide).set(firstAt); // the first moved item is focused in its new list
    // The moved block has left the source, so clear its selection now — *before* the emit — so the
    // two-way sourceSelection is coherent for a consumer reading it inside (transfer); the length-guarded
    // prune effect then no-ops. (Every selected row moves, so clearing the whole set is exact.)
    if (this.selectionModel(fromSide)().length) this.selectionModel(fromSide).set([]);
    const n = movedItems.length;
    this.announcer.announce(
      n === 1
        ? `Moved to the ${toSide} list, position ${firstAt + 1} of ${toArr.length}.`
        : `Moved ${n} items to the ${toSide} list.`,
    );
    this.emitTransfer(movedItems, fromSide, toSide);
  }

  /**
   * Move one item from `fromSide[fromIndex]` into `toSide` at `toIndex`; announce + emit. The drag
   * path (a cross-list drop transfers exactly the dragged row, at the drop position).
   */
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
  private selectionModel(side: CaePickListSide): WritableSignal<readonly T[]> {
    return side === 'source' ? this.sourceSelection : this.targetSelection;
  }
  private selectedSetOf(side: CaePickListSide): ReadonlySet<T> {
    return side === 'source' ? this.sourceSelectedSet() : this.targetSelectedSet();
  }
  private anchorSignal(side: CaePickListSide): WritableSignal<T | null> {
    return side === 'source' ? this.sourceAnchor : this.targetAnchor;
  }
  private activeOf(side: CaePickListSide): number {
    return side === 'source' ? this.sourceActive() : this.targetActive();
  }
}
