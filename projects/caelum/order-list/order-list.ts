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
  /** Where the **first** moved row was (for a multi-row block move, the topmost selected row). */
  readonly previousIndex: number;
  /** Where that first moved row now is. */
  readonly currentIndex: number;
  /** Every moved row's *previous* index, ascending — one entry for a single move, N for a block move. */
  readonly movedIndices: readonly number[];
}

/** The context handed to a `caeOrderListItem` template: the item, its index, focus, and selection. */
export interface CaeOrderListItemContext<T = unknown> {
  /** The item to render. */
  $implicit: T;
  /** The item's current index in the list. */
  readonly index: number;
  /** Whether this is the *focused* (roving tab stop) row — distinct from selection. */
  readonly active: boolean;
  /** Whether this row is in the current multi-selection (the move-target set). */
  readonly selected: boolean;
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
 * Marks the `<ng-template>` that renders the list's header (`p-orderList`'s `header` parity). Usage:
 * `<ng-template caeOrderListHeader>Selected columns</ng-template>`. When present, the header is rendered
 * above the list **and** becomes the listbox's `aria-labelledby` accessible name — so a visible title
 * also names the list, the WCAG-preferred labelling (an on-screen name a sighted and an AT user share).
 * The header text therefore **is** the accessible name: an empty or icon-only header leaves the listbox
 * unnamed (WCAG 4.1.2), and because a present header always wins over `[ariaLabel]`, `[ariaLabel]` cannot
 * rescue a textless one. For an icon-only or empty title, name the list with `[ariaLabel]` and **omit the
 * header slot**, or point `[ariaLabelledby]` at an external heading (which outranks a header). If you also
 * enable `[filter]`, set `[filterLabel]` (or keep `[ariaLabel]`) so the filter box keeps a specific name
 * — the header's projected text can't be derived into it. It labels a `role="listbox"`, not a landmark.
 * Mirrors `cae-pick-list`'s per-pane header slots (#358).
 */
@Directive({ selector: 'ng-template[caeOrderListHeader]' })
export class CaeOrderListHeaderDef {
  /** The captured header template (no `let-` context — a header renders no per-row data). */
  readonly template = inject<TemplateRef<void>>(TemplateRef);
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
 * single dragged row. (2) **Keyboard/pointer, no drag** — a control column of four buttons (move up /
 * to top / down / to bottom) acts on the **selected block** (or, with nothing selected, the focused
 * row). Either path updates the same `[(value)]` model and emits `(reorder)`, and every move is
 * announced via `LiveAnnouncer` — so the §3.5 parity leg holds: a keyboard path for every drag,
 * announced for non-visual users.
 *
 * **Selection & focus model** (ARIA listbox multiselect; `aria-multiselectable`). Focus and selection
 * are **separate**: exactly one row is *focused* (the roving tab stop), while a `[(selection)]` set of
 * rows is what the move buttons act on. Selection is **empty by default** (`p-orderList` parity) and
 * stores *item references*, so it survives a reorder and prunes to items still present. Pointer: click
 * selects one, Ctrl/Cmd+click toggles, Shift+click ranges. Keyboard: Arrow/Home/End move focus, Space
 * toggles the focused row, Shift+Arrow/Home/End range-extend from the anchor, Ctrl/Cmd+A selects all,
 * Escape clears. Like `cae-input-otp`, focus is a **roving-tabindex-without-a-key-manager** over a `@for`
 * (no child option components), and keeping focus + anchor in signals lets them *follow the item*
 * through a reorder for free. Because rows track by identity, the focused `<li>` moves on reorder, so
 * focus is never stranded.
 *
 * **Accessibility.** Name the list one of three ways (a `role="listbox"` needs an accessible name):
 * a projected `<ng-template caeOrderListHeader>` (a visible title that *also* names the list — the
 * WCAG-preferred form, `p-orderList`'s `header` parity), `[ariaLabelledby]` (an external heading the
 * consumer owns — highest precedence), or the `[ariaLabel]` string (default `"Order list"`). Move
 * buttons are real `<button>`s with `aria-label`s,
 * `aria-disabled` at the bounds (up/top when the move set is already at the top; down/bottom when at
 * the bottom). State (order, focus index, selection) lives in signals, so it repaints under a zoneless
 * host (Book 01 §3.2); drag pointer math is CDK's, and the drop lands in the `[(value)]` signal.
 *
 * **Content-agnostic.** Project a `<ng-template caeOrderListItem let-item let-i="index"
 * let-selected="selected">` to render rich rows (context: item, `index`, `active` = focused,
 * `selected`); without one, rows render `{{ item }}`. Rows must be **distinct references** (objects, or
 * unique primitives) — reorder + selection track by identity so the moved DOM node follows the item; a
 * custom `trackBy` is an additive follow-up. **RTL** needs no code: the control column mirrors for
 * free through the host's logical flex row and the reorder glyphs are vertical (nothing to flip),
 * unlike `cae-pick-list`'s horizontal transfer axis (Book 04 §3.5; visual-regression gated at M4/#240).
 *
 * **Filtering** (opt-in via `[filter]`). A labelled `type="search"` box above the list narrows the
 * rendered rows through `[filterMatch]` (default: case-insensitive substring on `String(item)`).
 * Filtering is a *lens over the options*: selection is by reference so it survives filtering, and
 * **reorder (drag + move buttons) is disabled while a query is active** — reordering a partial view is
 * ambiguous for a keyboard/AT user (Book 11 §3.5). When the query is blank the filtered view *is*
 * `value()` by reference, so the unfiltered reorder/selection paths are byte-for-byte unchanged. The
 * visible-row count is announced via `LiveAnnouncer`; a no-match query shows `[emptyMessage]`.
 * Selection semantics while filtering match the unfiltered ones: *replace* actions (plain click,
 * Ctrl/Cmd+A = select-all-**visible**, Shift-range) set the selection to exactly the visible set they
 * compute — so a row the filter currently hides is dropped from a replace — while *additive* actions
 * (Ctrl/Cmd+click, Space) and the passive prune keep hidden selections intact.
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

    <div class="cae-order-list__main">
      @if (headerDef(); as header) {
        <div class="cae-order-list__header" [id]="headerId">
          <ng-container [ngTemplateOutlet]="header.template" />
        </div>
      }
      @if (filter()) {
        <input
          type="search"
          class="cae-order-list__filter"
          [attr.aria-label]="filterName()"
          [attr.placeholder]="filterPlaceholder() || null"
          [value]="filterQuery()"
          [attr.aria-describedby]="isFiltering() && filtered().length === 0 ? emptyMessageId : null"
          (input)="onFilterInput($event)"
        />
      }
      <span [id]="instructionsId" class="cae-order-list__sr-only">
        Space toggles selection; Shift plus Arrow, Home, or End extends it; Control plus A selects
        all; Escape clears.
        @if (isFiltering()) {
          Clear the filter to reorder.
        } @else {
          Use the move buttons to reorder the selection.
        }
      </span>
      <ul
        class="cae-order-list__list"
        role="listbox"
        aria-multiselectable="true"
        cdkDropList
        [attr.aria-label]="labelledby() ? null : ariaLabel().trim() || 'Order list'"
        [attr.aria-labelledby]="labelledby() || null"
        (cdkDropListDropped)="onDrop($event)"
      >
        @for (item of filtered(); track item; let i = $index) {
          <li
            #optionEl
            class="cae-order-list__option"
            [class.cae-order-list__option--active]="i === active()"
            [class.cae-order-list__option--selected]="isSelected(item)"
            role="option"
            cdkDrag
            [cdkDragDisabled]="isFiltering()"
            [attr.aria-selected]="isSelected(item)"
            [attr.aria-describedby]="instructionsId"
            [tabindex]="i === activeTabStop() ? 0 : -1"
            (focus)="activate(i)"
            (click)="onOptionClick(i, $event)"
            (keydown)="onKeydown(i, $event)"
          >
            @if (itemDef(); as def) {
              <ng-container
                [ngTemplateOutlet]="def.template"
                [ngTemplateOutletContext]="{
                  $implicit: item,
                  index: i,
                  active: i === active(),
                  selected: isSelected(item),
                }"
              />
            } @else {
              {{ item }}
            }
          </li>
        }
        @if (isFiltering() && filtered().length === 0) {
          <li [id]="emptyMessageId" class="cae-order-list__empty" role="presentation">
            {{ emptyMessage() }}
          </li>
        }
      </ul>
    </div>
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
    /* Column wrapper holding the filter box above the list, so the control button column stays a
       sibling to the left of both (host is a row). */
    .cae-order-list__main {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--cae-space-1);
    }
    /* Projected header: labels its listbox (aria-labelledby) and reads as the list's visible title. */
    .cae-order-list__header {
      padding: var(--cae-space-1) var(--cae-space-2);
      color: var(--cae-color-on-surface);
    }
    .cae-order-list__filter {
      padding: var(--cae-space-2) var(--cae-space-3);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-base);
      color: var(--cae-color-on-surface);
      font: inherit;
    }
    .cae-order-list__filter:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
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
    /* Empty-filter row — role="presentation" (not a fake option) so the listbox holds only real
       options; the visible-count is also announced via LiveAnnouncer for non-visual users. */
    .cae-order-list__empty {
      padding: var(--cae-space-2) var(--cae-space-3);
      color: var(--cae-color-on-surface);
      opacity: 0.7;
    }
    .cae-order-list__option {
      display: block;
      padding: var(--cae-space-2) var(--cae-space-3);
      border-radius: var(--cae-radius-sm);
      color: var(--cae-color-on-surface);
      cursor: grab;
    }
    /* Focused (roving tab stop) row, when not also selected: a subtle fill so the move target is
       discoverable before the ring appears. Selection (below) overrides it. */
    .cae-order-list__option--active {
      background: var(--cae-surface-sunken);
    }
    /* Selected rows carry the strong colour + aria-selected (Caelum ships no font-weight token);
       ordered after --active so a focused+selected row reads as selected. */
    .cae-order-list__option--selected {
      background: var(--cae-color-primary);
      color: var(--cae-color-on-primary);
    }
    .cae-order-list__btn:focus-visible,
    .cae-order-list__option:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* Surface halo keeps the ring visible over a primary-filled selected row (WCAG 1.4.11). */
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
  /** Stable id for the no-match row, so the filter box can persistently describe the empty state. */
  protected readonly emptyMessageId = `cae-order-list-empty-${nextUniqueId++}`;
  /** Stable id the projected header carries, so the listbox can point its `aria-labelledby` at it. */
  protected readonly headerId = `cae-order-list-header-${nextUniqueId++}`;

  /** The ordered list, two-way. Reordering (drag or button) replaces it with a fresh array. */
  readonly value = model<readonly T[]>([]);
  /**
   * The multi-selection, two-way — the *items* (by identity) the move buttons act on. Empty by default
   * (`p-orderList` parity); the emitted array is always in list order. Selection follows items through a
   * reorder for free (it stores references, not indices), and is pruned to items still present in
   * {@link value}. With nothing selected, the move buttons fall back to acting on the focused row.
   */
  readonly selection = model<readonly T[]>([]);
  /** Accessible name for the `role="listbox"` (default `"Order list"`); ignored if `ariaLabelledby` is set. */
  readonly ariaLabel = input('');
  /** `id` of a visible element labelling the list — preferred when a heading is shown. */
  readonly ariaLabelledby = input('');

  /**
   * Show a text filter above the list (`p-orderList` `[filter]`). Off by default — when off the
   * filter box, the {@link filtered} view, and every filter code path are inert, so the shipped
   * reorder/selection behaviour is byte-for-byte unchanged.
   */
  readonly filter = input(false);
  /**
   * Placeholder for the filter box (not an accessible name — see {@link filterLabel}). For
   * voice-control parity (WCAG 2.5.3) keep this text consistent with {@link filterLabel} so the
   * visible prompt and the spoken name don't diverge.
   */
  readonly filterPlaceholder = input('');
  /**
   * Accessible name for the filter box; a placeholder is not a name (WCAG 4.1.2). Defaults to
   * `"Filter <ariaLabel>"` when the list is named, else `"Filter list"`.
   */
  readonly filterLabel = input('');
  /** Row shown when a filter matches nothing (`p-orderList` `emptyFilterMessage`). */
  readonly emptyMessage = input('No results');
  /**
   * Predicate deciding whether a row survives the current filter query. The default is a
   * case-insensitive substring test over `String(item)`, so it only works for **string/primitive
   * rows** — object rows stringify to `"[object Object]"` and **must** supply a predicate
   * (e.g. `(u, q) => u.name.toLowerCase().includes(q.toLowerCase())`). The `p-orderList`
   * `filterBy`/`filterMatchMode` pair maps onto this single type-safe seam.
   */
  readonly filterMatch = input<(item: T, query: string) => boolean>((item, query) =>
    String(item).toLowerCase().includes(query.toLowerCase()),
  );

  /** Emits on every reorder (drag or button) with the new order and the moved indices. */
  readonly reorder = output<CaeOrderListReorderEvent<T>>();

  /** The projected row template, if the consumer supplied one. */
  protected readonly itemDef = contentChild(CaeOrderListItemDef<T>);
  /** The projected header template, if supplied — it labels the listbox and is its visible title. */
  protected readonly headerDef = contentChild(CaeOrderListHeaderDef);

  /**
   * The `id` the listbox points its `aria-labelledby` at (empty ⇒ it falls back to the `aria-label`
   * string). Precedence: an explicit `[ariaLabelledby]` (an external heading the consumer owns) wins;
   * else a projected header labels the list; else neither, and the `aria-label` string names it.
   */
  protected readonly labelledby = computed(
    () => this.ariaLabelledby().trim() || (this.headerDef() ? this.headerId : ''),
  );

  /** The current filter query (raw text from the box); blank ⇒ not filtering. */
  protected readonly filterQuery = signal('');
  /** Whether a filter is actively narrowing the list (box enabled AND query non-blank). */
  protected readonly isFiltering = computed(
    () => this.filter() && this.filterQuery().trim().length > 0,
  );
  /**
   * The rendered rows. **When not filtering this is `value()` by reference** — so indices, `track`
   * identity, and the whole reorder/selection path are identical to the unfiltered component. The
   * roving-focus and selection model operate over *this* (the rendered list); the reorder model
   * stays over {@link value}, and reorder is disabled while filtering so the two views stay coherent.
   */
  protected readonly filtered = computed<readonly T[]>(() => {
    if (!this.isFiltering()) return this.value();
    const q = this.filterQuery().trim();
    const match = this.filterMatch();
    return this.value().filter((it) => match(it, q));
  });
  /** Accessible name for the filter box (from {@link filterLabel}, else derived from {@link ariaLabel}). */
  protected readonly filterName = computed(() => {
    const explicit = this.filterLabel().trim();
    if (explicit) return explicit;
    const listName = this.ariaLabel().trim();
    return listName ? `Filter ${listName}` : 'Filter list';
  });

  /** Raw focus index; may momentarily exceed the list length after a shrink (clamped by {@link active}). */
  private readonly focusIndex = signal(0);
  /** Focused (roving tab stop) index clamped into range, or `-1` when the list is empty. Focus ≠ selection. */
  protected readonly active = computed(() => {
    const n = this.filtered().length;
    return n ? Math.min(Math.max(this.focusIndex(), 0), n - 1) : -1;
  });
  /** The single tab stop — `active()` floored at 0 so the list always has exactly one tabbable row. */
  protected readonly activeTabStop = computed(() => Math.max(this.active(), 0));

  /**
   * Range anchor for Shift+click / Shift+Arrow — stored as the *item* (not an index) so it survives a
   * reorder or an external `value` edit that shifts indices (an index anchor would silently mis-range).
   */
  private readonly selectionAnchor = signal<T | null>(null);
  /** The current selection as a `Set` for O(1) membership tests in the template. */
  private readonly selectedSet = computed(() => new Set<T>(this.selection()));
  /** Whether `item` is in the current selection (template hot path). */
  protected isSelected(item: T): boolean {
    return this.selectedSet().has(item);
  }

  /** Ascending indices the move buttons act on: the selected rows, or the focused row when none selected. */
  private readonly moveIndices = computed<readonly number[]>(() => {
    if (this.isFiltering()) return []; // reorder is disabled while filtering (partial-view indices are ambiguous)
    const items = this.value();
    const sel = this.selectedSet();
    const picked = items.reduce<number[]>((acc, it, i) => {
      if (sel.has(it)) acc.push(i);
      return acc;
    }, []);
    if (picked.length) return picked;
    return this.active() >= 0 ? [this.active()] : [];
  });
  protected readonly canMoveUp = computed(() => {
    const m = this.moveIndices();
    return m.length > 0 && m[0] > 0;
  });
  protected readonly canMoveDown = computed(() => {
    const m = this.moveIndices();
    return m.length > 0 && m[m.length - 1] < this.value().length - 1;
  });

  constructor() {
    // Clamp the RAW focus index whenever the list changes externally, so a shrink can't leave a stale
    // out-of-range index that would "resurrect" (jump to a different item) if the list later grows back.
    // `active()` already clamps on read; this keeps the stored index coherent too. The guard makes it a
    // no-op once clamped, so it can't loop.
    // Clamp against value() (the stable data), NOT filtered(): the effect *writes* focusIndex, so
    // clamping to the filtered length would destructively shrink the stored index while filtering and
    // strand the tab stop on the wrong row after the query clears. active() read-clamps to the
    // filtered length for rendering; because value() is unchanged across a filter toggle, keeping the
    // stored index coherent with value() makes index-preservation = item-preservation.
    effect(() => {
      const n = this.value().length;
      const clamped = n ? Math.min(Math.max(this.focusIndex(), 0), n - 1) : 0;
      if (clamped !== this.focusIndex()) this.focusIndex.set(clamped);
    });
    // Prune selection to items still present after an external `value` change (selection is by identity,
    // so replaced/removed items must drop out). Guarded on length so it converges (no effect loop).
    effect(() => {
      const present = this.selectedSet(); // reads selection
      if (present.size === 0) return;
      const kept = this.value().filter((it) => present.has(it));
      if (kept.length !== this.selection().length) this.selection.set(kept);
    });
  }

  /** Move the roving focus (tab stop) to row `index` — does not change selection. */
  protected activate(index: number): void {
    this.focusIndex.set(index);
  }

  /** Update the filter query from the box and announce the new visible-row count (or the clear). */
  protected onFilterInput(event: Event): void {
    // Keep the roving focus on the same ITEM across the query change: capture the focused item from the
    // OLD view, then remap the focus index to its position in the NEW view (or the top if it's now
    // filtered out). Without this, focus is index-stable but not item-stable across a filter round-trip.
    const prevItem = this.filtered()[this.active()];
    this.filterQuery.set((event.target as HTMLInputElement).value);
    const remapped = prevItem !== undefined ? this.filtered().indexOf(prevItem) : -1;
    this.focusIndex.set(remapped >= 0 ? remapped : 0);
    if (!this.isFiltering()) {
      this.announcer.announce('Filter cleared');
      return;
    }
    const n = this.filtered().length;
    // A no-match announces the SAME text the empty-state row shows, so the two channels agree.
    this.announcer.announce(n === 0 ? this.emptyMessage() : `${n} result${n === 1 ? '' : 's'}`);
  }

  /**
   * Pointer selection (ARIA listbox multiselect): plain click selects only this row; Ctrl/Cmd-click
   * toggles it; Shift-click selects the contiguous range from the anchor. Always focuses the row.
   */
  protected onOptionClick(index: number, event: MouseEvent): void {
    this.focusIndex.set(index);
    const item = this.filtered()[index];
    if (item === undefined) return;
    if (event.shiftKey) {
      this.selectRange(index, index);
    } else if (event.ctrlKey || event.metaKey) {
      this.toggle(index);
      this.selectionAnchor.set(item);
    } else {
      this.commitSelection(new Set([item]));
      this.selectionAnchor.set(item);
    }
  }

  protected moveUp(): void {
    if (this.canMoveUp()) this.reorderSelection('up');
  }
  protected moveTop(): void {
    if (this.canMoveUp()) this.reorderSelection('top');
  }
  protected moveDown(): void {
    if (this.canMoveDown()) this.reorderSelection('down');
  }
  protected moveBottom(): void {
    if (this.canMoveDown()) this.reorderSelection('bottom');
  }

  /** A drop reorders the single dragged row (multi-move is the buttons' job); it becomes focused. */
  protected onDrop(event: CdkDragDrop<readonly T[]>): void {
    if (this.isFiltering()) return; // drag is disabled while filtering; defensive no-op
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.value()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.value.set(next);
    this.focusIndex.set(event.currentIndex);
    // Keep the emitted selection in list order if the dragged row was selected (drag can reorder it
    // relative to other selected rows; the length-only prune guard wouldn't catch a same-size reorder).
    const set = this.selectedSet();
    if (set.has(next[event.currentIndex])) {
      this.selection.set(next.filter((it) => set.has(it)));
    }
    this.reorder.emit({
      items: next,
      previousIndex: event.previousIndex,
      currentIndex: event.currentIndex,
      movedIndices: [event.previousIndex],
    });
    this.announcer.announce(`Moved to position ${event.currentIndex + 1} of ${next.length}`);
  }

  /**
   * Keyboard model (ARIA listbox multiselect): Arrow/Home/End move focus; Space toggles the focused
   * row's selection; Shift+Arrow / Shift+Home/End range-extend from the anchor; Ctrl/Cmd+A selects all;
   * Escape clears. Moves are the buttons' job (a data list has no "activate" default action to overload).
   */
  protected onKeydown(index: number, event: KeyboardEvent): void {
    const last = this.filtered().length - 1;
    if (last < 0) return;

    if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault();
      // Select-all means all *visible* rows — identical to the whole list when not filtering.
      this.commitSelection(new Set(this.filtered()));
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.toggle(index);
      this.selectionAnchor.set(this.filtered()[index] ?? null);
      return;
    }
    if (event.key === 'Escape') {
      // A keyboard path to clear the whole selection (pointer users just click one row to reduce it).
      if (this.selection().length) {
        event.preventDefault();
        this.commitSelection(new Set());
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
    if (event.shiftKey) this.selectRange(target, index);
    this.activate(target);
    this.optionEls()[target]?.nativeElement.focus();
  }

  /** Toggle one row's membership in the selection. */
  private toggle(index: number): void {
    const item = this.filtered()[index];
    if (item === undefined) return;
    const set = new Set(this.selection());
    if (set.has(item)) set.delete(item);
    else set.add(item);
    this.commitSelection(set);
  }

  /**
   * Select the contiguous range from the anchor row to `focus` (inclusive), replacing the selection.
   * The anchor is resolved from the stored *item* (index-stable across reorders); with no live anchor
   * one is established at `fallbackFrom` (the origin row) so subsequent extends grow from there.
   */
  private selectRange(focus: number, fallbackFrom: number): void {
    // Ranges are drawn over the rendered (filtered) rows; `commitSelection` re-orders to full-list order.
    const items = this.filtered();
    const anchorItem = this.selectionAnchor();
    const anchorIdx = anchorItem != null ? items.indexOf(anchorItem) : -1;
    const from = anchorIdx >= 0 ? anchorIdx : fallbackFrom;
    if (anchorIdx < 0) this.selectionAnchor.set(items[fallbackFrom] ?? null);
    const lo = Math.max(0, Math.min(from, focus));
    const hi = Math.min(items.length - 1, Math.max(from, focus));
    const set = new Set<T>();
    for (let i = lo; i <= hi; i++) set.add(items[i]);
    this.commitSelection(set);
  }

  /** Commit a new selection: emit it in list order and announce the count. */
  private commitSelection(set: ReadonlySet<T>): void {
    const ordered = this.value().filter((it) => set.has(it));
    this.selection.set(ordered);
    this.announcer.announce(
      ordered.length === 0
        ? 'Selection cleared'
        : `${ordered.length} of ${this.value().length} selected`,
    );
  }

  /**
   * Reorder the selected block (or the focused row when nothing is selected) in `dir`, preserving the
   * rows' relative order. Up/Down bubble the block one step past non-selected neighbours; Top/Bottom
   * lift it to the edge. Focus follows its item; `(reorder)` reports the first moved row's old→new index.
   */
  private reorderSelection(dir: 'up' | 'down' | 'top' | 'bottom'): void {
    const idx = this.moveIndices();
    if (!idx.length) return;
    const items = [...this.value()];
    // Resolve the focused item from the filtered (rendered) view, so a filtered index never mis-slices
    // the full `items` array (reorder is gated off while filtering, so this is defensive parity).
    const focusedItem = this.active() >= 0 ? this.filtered()[this.active()] : undefined;
    const firstMoved = items[idx[0]];
    const picked = new Set(idx.map((i) => items[i]));

    let next: T[];
    if (dir === 'top') {
      next = [...idx.map((i) => items[i]), ...items.filter((it) => !picked.has(it))];
    } else if (dir === 'bottom') {
      next = [...items.filter((it) => !picked.has(it)), ...idx.map((i) => items[i])];
    } else if (dir === 'up') {
      next = [...items];
      for (let i = 1; i < next.length; i++) {
        if (picked.has(next[i]) && !picked.has(next[i - 1])) {
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
        }
      }
    } else {
      next = [...items];
      for (let i = next.length - 2; i >= 0; i--) {
        if (picked.has(next[i]) && !picked.has(next[i + 1])) {
          [next[i + 1], next[i]] = [next[i], next[i + 1]];
        }
      }
    }

    this.value.set(next);
    if (focusedItem !== undefined) {
      const ni = next.indexOf(focusedItem);
      if (ni >= 0) this.focusIndex.set(ni);
    }
    const count = idx.length;
    this.reorder.emit({
      items: next,
      previousIndex: idx[0],
      currentIndex: next.indexOf(firstMoved),
      movedIndices: idx,
    });
    this.announcer.announce(
      count === 1
        ? `Moved to position ${next.indexOf(firstMoved) + 1} of ${next.length}`
        : `Moved ${count} items ${dir === 'top' ? 'to top' : dir === 'bottom' ? 'to bottom' : dir}`,
    );
  }
}
