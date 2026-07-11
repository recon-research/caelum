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
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { LiveAnnouncer } from '@angular/cdk/a11y';

/** Per-instance id source for the aria-describedby instructions (SSR/hydration-stable, unlike random). */
let nextUniqueId = 0;

/** The payload of {@link CaeOrderList.reorder} — the new order plus the indices that moved. */
export interface CaeOrderListReorderEvent<T = unknown> {
  /** The full list in its new order (a fresh array; the bound `[(value)]` receives the same). */
  readonly items: readonly T[];
  /** Where the moved item was. */
  readonly previousIndex: number;
  /** Where the moved item now is (also the new active index). */
  readonly currentIndex: number;
}

/** The context handed to a `caeOrderListItem` template: the item, its index, and whether it is active. */
export interface CaeOrderListItemContext<T = unknown> {
  /** The item to render. */
  $implicit: T;
  /** The item's current index in the list. */
  readonly index: number;
  /** Whether this item is the active (selected, move-target) row. */
  readonly active: boolean;
}

/**
 * Marks the `<ng-template>` that renders one `cae-order-list` row, so the list is content-agnostic
 * (order rich rows, not just strings). Usage: `<ng-template caeOrderListItem let-item let-i="index">`.
 * Absent ⇒ the list falls back to `{{ item }}`. Import it alongside `CaeOrderList`. Rows must be
 * **non-interactive** — a `role="option"` must not contain focusable descendants (a nested `<a>`/
 * `<button>` both breaks ARIA and collides with the roving tabindex). `let-item` is typed `unknown`
 * (Angular can't infer the projected template's `T` from the sibling `[value]`), so annotate or cast
 * (`$any(item)`) in the template.
 */
@Directive({ selector: 'ng-template[caeOrderListItem]' })
export class CaeOrderListItemDef<T = unknown> {
  /** The captured template, typed for the `let-`bindings below. */
  readonly template = inject<TemplateRef<CaeOrderListItemContext<T>>>(TemplateRef);

  /** Narrows the `let-` context types for the template type-checker. */
  static ngTemplateContextGuard<T>(
    _dir: CaeOrderListItemDef<T>,
    ctx: unknown,
  ): ctx is CaeOrderListItemContext<T> {
    // Compile-time only (Angular never calls this at runtime); `void` marks ctx intentionally unused
    // in the body — it earns its keep solely in the return-type predicate above.
    void ctx;
    return true;
  }
}

/**
 * `cae-order-list` — a keyboard-operable, drag-reorderable list (`p-orderList` parity; Book 11 §3.3,
 * the drag-drop cluster). Book 11 §3.3 settles the build: *"One `cdkDropList`; reorder within.
 * Provide non-drag controls (move up/down/top/bottom buttons) and announce moves via the CDK
 * `LiveAnnouncer` so a screen-reader user can reorder without a pointer."* Built on
 * `@angular/cdk/drag-drop` + `@angular/cdk/a11y` only — no foreign drag library (Book 03 keeps the
 * provenance surface clean).
 *
 * **The two reorder paths.** (1) **Drag** — one `cdkDropList` of `cdkDrag` rows; a drop reorders the
 * bound list. (2) **Keyboard/pointer, no drag** — a control column of four buttons (move up / to top /
 * down / to bottom) acts on the **active** row. Either path updates the same `[(value)]` model and
 * emits `(reorder)`, and every move is announced *"Moved to position N of M"* via `LiveAnnouncer` — so
 * the §3.5 parity leg holds: a keyboard path for every drag, announced for non-visual users.
 *
 * **Selection & focus model.** The list is a `role="listbox"` whose rows are `role="option"`. Exactly
 * one row is *active* (the move target): it carries `aria-selected` and is the single tab stop
 * (roving tabindex). Arrow keys move the active row (Home/End jump to the ends); clicking or focusing
 * a row activates it. This mirrors `cae-input-otp`'s deliberate **roving-tabindex-without-a-key-manager**
 * choice (its class docstring): the CDK key managers operate over a `QueryList` of `Highlightable`
 * child directives, but this is a **data-driven** `@for` over the `[value]` signal with no child option
 * components — a clamped four-key handler (Up/Down/Home/End, no wrap/typeahead) is the deterministic
 * minimum, and keeping the active index in a signal lets it *follow the item* through a reorder for
 * free. Because rows track by identity, the active `<li>` element itself moves on reorder, so focus is
 * never stranded.
 *
 * **Accessibility.** Name the list with `[ariaLabel]` (default `"Order list"`) or `[ariaLabelledby]`
 * (a `role="listbox"` needs an accessible name). Move buttons are real `<button>`s with `aria-label`s,
 * disabled at the bounds (up/top when the active row is first; down/bottom when last). State (order,
 * active index) lives in signals, so it repaints under a zoneless host (Book 01 §3.2); drag pointer
 * math is CDK's, and the drop result lands in the `[(value)]` signal (Book 05 §3.4 zoneless note).
 *
 * **Content-agnostic.** Project a `<ng-template caeOrderListItem let-item let-i="index">` to render rich
 * rows; without one, rows render `{{ item }}`. Rows must be **distinct references** (objects, or unique
 * primitives) — reorder tracks by identity so the moved DOM node follows the item; a custom `trackBy`,
 * multi-select, filtering, and RTL are additive follow-ups.
 *
 * **Binding the value.** `[value]` is a `model()` — bind it **two-way**. With a `WritableSignal`
 * (the library's idiom) decompose it as below; a plain field can use `[(value)]`. A **one-way**
 * `[value]` leaves the list *uncontrolled*: a reorder still shows, but the parent's source drifts out
 * of sync and the move is lost the next time the parent reassigns `value` — persist `(reorder)` /
 * `(valueChange)` instead.
 *
 * ```html
 * <cae-order-list
 *   [value]="columns()"
 *   (valueChange)="columns.set($event)"
 *   ariaLabel="Selected columns"
 * >
 *   <ng-template caeOrderListItem let-col>{{ $any(col).header }}</ng-template>
 * </cae-order-list>
 * ```
 */
@Component({
  selector: 'cae-order-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, CdkDropList, CdkDrag],
  host: { class: 'cae-order-list' },
  template: `
    <div class="cae-order-list__controls" role="group" aria-label="Reorder controls">
      <button
        type="button"
        class="cae-order-list__btn"
        aria-label="Move up"
        [attr.aria-disabled]="!canMoveUp() ? 'true' : null"
        (click)="moveUp()"
      >
        <span aria-hidden="true">&#8593;</span>
      </button>
      <button
        type="button"
        class="cae-order-list__btn"
        aria-label="Move to top"
        [attr.aria-disabled]="!canMoveUp() ? 'true' : null"
        (click)="moveTop()"
      >
        <span aria-hidden="true">&#8607;</span>
      </button>
      <button
        type="button"
        class="cae-order-list__btn"
        aria-label="Move down"
        [attr.aria-disabled]="!canMoveDown() ? 'true' : null"
        (click)="moveDown()"
      >
        <span aria-hidden="true">&#8595;</span>
      </button>
      <button
        type="button"
        class="cae-order-list__btn"
        aria-label="Move to bottom"
        [attr.aria-disabled]="!canMoveDown() ? 'true' : null"
        (click)="moveBottom()"
      >
        <span aria-hidden="true">&#8609;</span>
      </button>
    </div>

    <span [id]="instructionsId" class="cae-order-list__sr-only">
      Select a row, then use the move buttons or drag to reorder it.
    </span>
    <ul
      class="cae-order-list__list"
      role="listbox"
      cdkDropList
      [attr.aria-label]="ariaLabelledby() ? null : ariaLabel().trim() || 'Order list'"
      [attr.aria-labelledby]="ariaLabelledby() || null"
      [attr.aria-describedby]="instructionsId"
      (cdkDropListDropped)="onDrop($event)"
    >
      @for (item of value(); track item; let i = $index) {
        <li
          #optionEl
          class="cae-order-list__option"
          [class.cae-order-list__option--active]="i === active()"
          role="option"
          cdkDrag
          [attr.aria-selected]="i === active()"
          [tabindex]="i === activeTabStop() ? 0 : -1"
          (focus)="activate(i)"
          (click)="activate(i)"
          (keydown)="onKeydown(i, $event)"
        >
          @if (itemDef(); as def) {
            <ng-container
              [ngTemplateOutlet]="def.template"
              [ngTemplateOutletContext]="{ $implicit: item, index: i, active: i === active() }"
            />
          } @else {
            {{ item }}
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      gap: var(--cae-space-2);
      align-items: stretch;
    }
    .cae-order-list__controls {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--cae-space-1);
    }
    .cae-order-list__btn {
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
    .cae-order-list__btn:hover:not([aria-disabled='true']) {
      background: var(--cae-surface-sunken);
    }
    /* aria-disabled (not native [disabled]) so a button that reaches a bound stays focusable — a
       focused native-disabled button blurs to <body>, stranding the keyboard user mid-reorder. */
    .cae-order-list__btn[aria-disabled='true'] {
      opacity: 0.5;
      cursor: default;
    }
    .cae-order-list__list {
      flex: 1 1 auto;
      margin: 0;
      padding: var(--cae-space-1);
      list-style: none;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-base);
      overflow: auto;
    }
    .cae-order-list__option {
      display: block;
      padding: var(--cae-space-2) var(--cae-space-3);
      border-radius: var(--cae-radius-sm);
      color: var(--cae-color-on-surface);
      cursor: grab;
    }
    /* Active row differs by colour + aria-selected (Caelum ships no font-weight token). */
    .cae-order-list__option--active {
      background: var(--cae-color-primary);
      color: var(--cae-color-on-primary);
    }
    .cae-order-list__btn:focus-visible,
    .cae-order-list__option:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* Surface halo keeps the ring visible over the primary-filled active row (WCAG 1.4.11). */
      box-shadow: 0 0 0 4px var(--cae-surface-raised);
    }
    /* The CDK drag preview/placeholder inherit the row's emulated styles (same _ngcontent attr). */
    .cae-order-list__option.cdk-drag-placeholder {
      opacity: 0.5;
    }
    .cae-order-list__list.cdk-drop-list-dragging
      .cae-order-list__option:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
    /* Visually-hidden but AT-readable (the standard sr-only recipe) — the reorder instructions the
       listbox is aria-describedby-linked to. */
    .cae-order-list__sr-only {
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
export class CaeOrderList<T = unknown> {
  private readonly announcer = inject(LiveAnnouncer);
  private readonly optionEls = viewChildren<ElementRef<HTMLElement>>('optionEl');

  /** Stable id linking the listbox to its visually-hidden reorder instructions (aria-describedby). */
  protected readonly instructionsId = `cae-order-list-instructions-${nextUniqueId++}`;

  /** The ordered list, two-way. Reordering (drag or button) replaces it with a fresh array. */
  readonly value = model<readonly T[]>([]);
  /** Accessible name for the `role="listbox"` (default `"Order list"`); ignored if `ariaLabelledby` is set. */
  readonly ariaLabel = input('');
  /** `id` of a visible element labelling the list — preferred when a heading is shown. */
  readonly ariaLabelledby = input('');
  /** Emits on every reorder (drag or button) with the new order and the moved indices. */
  readonly reorder = output<CaeOrderListReorderEvent<T>>();

  /** The projected row template, if the consumer supplied one. */
  protected readonly itemDef = contentChild(CaeOrderListItemDef<T>);

  /** Raw active index; may momentarily exceed the list length after a shrink (clamped by {@link active}). */
  private readonly activeIndex = signal(0);
  /** Active index clamped into range, or `-1` when the list is empty (the a11y-authoritative value). */
  protected readonly active = computed(() => {
    const n = this.value().length;
    return n ? Math.min(Math.max(this.activeIndex(), 0), n - 1) : -1;
  });
  /** The single tab stop — `active()` floored at 0 so the list always has exactly one tabbable row. */
  protected readonly activeTabStop = computed(() => Math.max(this.active(), 0));

  protected readonly canMoveUp = computed(() => this.active() > 0);
  protected readonly canMoveDown = computed(() => {
    const a = this.active();
    return a >= 0 && a < this.value().length - 1;
  });

  constructor() {
    // Clamp the RAW active index whenever the list changes externally, so a shrink can't leave a stale
    // out-of-range index that would "resurrect" (jump to a different item) if the list later grows back.
    // `active()` already clamps on read; this keeps the stored index coherent too. The guard makes it a
    // no-op once clamped, so it can't loop.
    effect(() => {
      const n = this.value().length;
      const clamped = n ? Math.min(Math.max(this.activeIndex(), 0), n - 1) : 0;
      if (clamped !== this.activeIndex()) this.activeIndex.set(clamped);
    });
  }

  /** Make row `index` the active (move-target) row. */
  protected activate(index: number): void {
    this.activeIndex.set(index);
  }

  protected moveUp(): void {
    if (this.canMoveUp()) this.move(this.active(), this.active() - 1);
  }
  protected moveTop(): void {
    if (this.canMoveUp()) this.move(this.active(), 0);
  }
  protected moveDown(): void {
    if (this.canMoveDown()) this.move(this.active(), this.active() + 1);
  }
  protected moveBottom(): void {
    if (this.canMoveDown()) this.move(this.active(), this.value().length - 1);
  }

  /** A drop reorders the list; the dropped item becomes active. */
  protected onDrop(event: CdkDragDrop<readonly T[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      this.move(event.previousIndex, event.currentIndex);
    }
  }

  /** Arrow / Home / End move the active row (navigation only — moves are the buttons' job). */
  protected onKeydown(index: number, event: KeyboardEvent): void {
    const last = this.value().length - 1;
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
    this.activate(target);
    this.optionEls()[target]?.nativeElement.focus();
  }

  /** The single reorder primitive: replace `value`, follow the item with `active`, announce, emit. */
  private move(from: number, to: number): void {
    const next = [...this.value()];
    moveItemInArray(next, from, to);
    this.value.set(next);
    this.activeIndex.set(to);
    this.reorder.emit({ items: next, previousIndex: from, currentIndex: to });
    this.announcer.announce(`Moved to position ${to + 1} of ${next.length}`);
  }
}
