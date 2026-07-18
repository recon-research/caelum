import { hasModifierKey } from '@angular/cdk/keycodes';
import {
  afterRenderEffect,
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
  untracked,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
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
  /** Whether this row is disabled (`[disabledMatch]`) — not selectable, movable, or draggable. */
  readonly disabled: boolean;
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
 * through a reorder for free. Because rows track by their {@link trackBy} key (identity by default),
 * the focused `<li>` moves on reorder, so focus is never stranded.
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
 * let-selected="selected" let-disabled="disabled">` to render rich rows (context: item, `index`,
 * `active` = focused, `selected`, `disabled`); without one, rows render `{{ item }}`. Rows are keyed by
 * `[trackBy]` (default: the item itself, so distinct references / unique primitives work out of the box);
 * key object rows by a business field (`[trackBy]="(c) => c.id"`) to survive an immutable `[value]`
 * refresh and to reorder rows with repeated display values. Mark rows non-actionable
 * with `[disabledMatch]` (a predicate; disabled rows are dimmed + `aria-disabled`, can't be selected,
 * moved, or dragged, but stay focusable), and set `[dragHandle]` to restrict drag initiation to a
 * rendered grip (the whole row is the drag surface by default). The reorder-button column sits at the
 * inline-start by default; `[controlsPosition]="'after'"` moves it to the inline-end (DOM-reordered, so
 * tab order tracks visual order). **RTL** needs no code: the control column mirrors for free through the host's logical
 * flex row (either `controlsPosition`) and the reorder glyphs are vertical (nothing to flip), unlike
 * `cae-pick-list`'s horizontal transfer axis (Book 04 §3.5; visual-regression gated at M4/#240).
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
  imports: [NgTemplateOutlet, CdkDropList, CdkDrag, CdkDragHandle],
  host: { class: 'cae-order-list' },
  template: `
    <ng-template #controlsTpl>
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
    </ng-template>

    <!-- 'after' is the special case; anything else (incl. an out-of-contract runtime value) renders the
         default inline-start layout, so the reorder buttons — the only non-drag path — never vanish. -->
    @if (controlsPosition() !== 'after') {
      <ng-container [ngTemplateOutlet]="controlsTpl" />
    }

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
        (focusin)="onListFocusIn($event)"
        (focusout)="onListFocusOut($event)"
      >
        @for (item of filtered(); track keyOf(item); let i = $index) {
          <li
            #optionEl
            class="cae-order-list__option"
            [class.cae-order-list__option--active]="i === active()"
            [class.cae-order-list__option--selected]="isSelected(item)"
            [class.cae-order-list__option--disabled]="isDisabled(item)"
            [class.cae-order-list__option--has-handle]="dragHandle()"
            role="option"
            cdkDrag
            [cdkDragDisabled]="isFiltering() || isDisabled(item)"
            [attr.aria-selected]="isSelected(item)"
            [attr.aria-disabled]="isDisabled(item) ? 'true' : null"
            [attr.aria-describedby]="instructionsId"
            [tabindex]="i === activeTabStop() ? 0 : -1"
            (focus)="activate(i)"
            (click)="onOptionClick(i, $event)"
            (keydown)="onKeydown(i, $event)"
          >
            @if (dragHandle()) {
              <!-- Pointer-only drag affordance: aria-hidden and non-focusable, so it stays out of the
                   roving tabindex and the "options hold no focusable descendants" rule holds — the
                   keyboard reorder path is the move buttons, not the grip (CDK drag is pointer-only). -->
              <span class="cae-order-list__handle" cdkDragHandle aria-hidden="true">&#10303;</span>
            }
            <!-- Content wrapper: display:contents (layout-transparent) in the default block layout, but a
                 single flex child in handle mode — so a multi-root projected row lays out as ONE unit
                 beside the grip, not N gap-separated flex items. -->
            <span class="cae-order-list__content">
              @if (itemDef(); as def) {
                <ng-container
                  [ngTemplateOutlet]="def.template"
                  [ngTemplateOutletContext]="{
                    $implicit: item,
                    index: i,
                    active: i === active(),
                    selected: isSelected(item),
                    disabled: isDisabled(item),
                  }"
                />
              } @else {
                {{ item }}
              }
            </span>
          </li>
        }
        @if (isFiltering() && filtered().length === 0) {
          <li [id]="emptyMessageId" class="cae-order-list__empty" role="presentation">
            {{ emptyMessage() }}
          </li>
        }
      </ul>
    </div>

    @if (controlsPosition() === 'after') {
      <ng-container [ngTemplateOutlet]="controlsTpl" />
    }
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
      /* Floor the hit target to the density-INVARIANT --cae-target-min (24px, == --cae-space-5 at the
         comfortable default) so it holds WCAG 2.5.8 under [data-density=compact], where --cae-space-5
         tightens to 16px (interactive-hit-target floor convention). */
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
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
    /* Disabled row (aria-disabled, not native): dimmed and not-selectable/movable, but still focusable
       so a keyboard/AT user can perceive it (WAI-ARIA listbox). Selection/move/drag guards are in TS. */
    .cae-order-list__option--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    /* Content wrapper: layout-transparent in the default block layout (so a projected row renders exactly
       as if unwrapped), a single flex child in handle mode (so a multi-root row stays one unit, not N
       gap-separated flex items beside the grip). */
    .cae-order-list__content {
      display: contents;
    }
    /* Drag-handle mode: only the grip initiates drag, so the row itself is no longer grab-cursored and
       lays out as a row (grip | content). The grip is a pointer affordance only — aria-hidden above. */
    .cae-order-list__option--has-handle {
      display: flex;
      align-items: center;
      gap: var(--cae-space-2);
      cursor: default;
    }
    .cae-order-list__option--has-handle .cae-order-list__content {
      display: block;
      flex: 1 1 auto;
      min-width: 0;
    }
    /* Floor the grab target to the density-INVARIANT --cae-target-min (WCAG 2.5.8, #456): the grip is a
       bare glyph, so its box is the ~14px line box and it tracks the *type* scale, not the target token.
       Unlike the splitter divider this grip sits in normal flow, so it can take a *visible* floor, which is
       strictly better than an invisible slop here — nothing can be claimed from the row content beside it.
       It widens the grip column and floors the row to 24px + padding (~36px → 40px), confined to opt-in
       [dragHandle] mode. inline-flex re-centres the glyph; border-box because Caelum ships no reset (a bare
       consumer defaults to content-box). PATTERNS.md §10. */
    .cae-order-list__handle {
      flex: none;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-inline-size: var(--cae-target-min);
      min-block-size: var(--cae-target-min);
      cursor: grab;
      color: var(--cae-color-on-surface);
      opacity: 0.6;
      line-height: 1;
      user-select: none;
    }
    .cae-order-list__option--disabled .cae-order-list__handle {
      cursor: not-allowed;
    }
    .cae-order-list__btn:focus-visible,
    .cae-order-list__option:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
      /* Surface halo keeps the ring visible over a primary-filled selected row (WCAG 1.4.11). */
      box-shadow: 0 0 0 4px var(--cae-surface-raised);
    }
    /* Both the bound-reaching move buttons and disabled rows stay keyboard-focusable by design, but the
       0.5 opacity dim would halve their focus ring — restore full opacity while focused so the outline
       paints at full strength (WCAG 2.4.7 / 1.4.11); the aria-disabled/cursor cues still convey state. */
    .cae-order-list__btn[aria-disabled='true']:focus-visible,
    .cae-order-list__option--disabled:focus-visible {
      opacity: 1;
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
   * The multi-selection, two-way — the *items* (by {@link trackBy} key) the move buttons act on. Empty by
   * default (`p-orderList` parity); the emitted array is always in list order. Selection follows items
   * through a reorder for free (it matches by key, not index), and is pruned to keys still present in
   * {@link value} — re-pointed onto `value`'s current references so an immutable refresh keeps it live.
   * A row that becomes **disabled** while selected stays selected (its key survives, as it does across a
   * reorder) but is barred from moves — it clears only when
   * removed from {@link value} or explicitly deselected, so `selection()` may momentarily hold a disabled
   * row. With nothing selected, the move buttons fall back to acting on the focused row.
   */
  readonly selection = model<readonly T[]>([]);
  /**
   * How a row's **identity** is derived (`p-orderList` `dataKey`, expressed as the Angular `trackBy` idiom
   * the sibling data components use). A pure function from an item to a **stable, unique key**; the default
   * is identity (`(item) => item`), so the shipped behaviour is byte-for-byte unchanged. Supply one to key
   * **object rows by a business field** — `[trackBy]="(c) => c.id"` — which does two things: a `[value]`
   * refresh yielding *new object instances with the same keys* keeps the current selection and roving focus
   * (they match by key, not reference — the identity-decoupling `p-orderList`'s `dataKey` gives), and the
   * "distinct references" requirement is lifted, so a dataset with **repeated primitive display values**
   * works once wrapped with a unique key (`{ id, label }` keyed by `id`). The key must be a pure function of
   * the *item*, never its position: an index-derived key would change under a reorder and strand
   * selection/focus, so the signature deliberately omits the index. Bare, genuinely-identical primitives
   * (`['a', 'a']`) have no unique key to give and still collide (`@for` NG0955) — wrap them. Keys must be
   * **non-null** (a `null`/`undefined` key aliases the internal "no range anchor" sentinel, so such a row
   * can't seed a Shift-range) — `null`/`undefined` fails the stable-unique contract anyway.
   */
  readonly trackBy = input<(item: T) => unknown>((item) => item);
  /** Accessible name for the `role="listbox"` (default `"Order list"`); ignored if `ariaLabelledby` is set. */
  readonly ariaLabel = input('');
  /** `id` of a visible element labelling the list — preferred when a heading is shown. */
  readonly ariaLabelledby = input('');
  /**
   * Which side the reorder-button column sits on (`p-orderList` `controlsPosition`, ported to logical
   * values like the library's `labelPosition`): `'before'` (default) = inline-start, `'after'` =
   * inline-end — both mirror under RTL. DOM-reordered (not CSS `order`) so tab order tracks visual
   * order (WCAG 2.4.3).
   */
  readonly controlsPosition = input<'before' | 'after'>('before');

  /**
   * Predicate marking rows as **disabled** (`p-orderList` per-item disabling). A disabled row is
   * dimmed and `aria-disabled` — it cannot be selected, moved by the buttons, or dragged — but stays
   * **focusable** so a keyboard/AT user can still navigate onto and perceive it (WAI-ARIA listbox; the
   * same `aria-disabled`-not-native discipline the move buttons use, so focus is never blurred to
   * `<body>`). Range and select-all include only the enabled rows in their span. Default: nothing
   * disabled. Evaluated per row against {@link value}, so it may depend on external state. **Pair it with
   * a visible indicator** rendered from the item template's `disabled` context (as the demo's "(locked)"
   * tag) — the built-in dim is a colour-independent but subtle cue. Avoid disabling the row most likely to
   * be the initial focus (index 0), which would make a dimmed row the default tab stop.
   */
  readonly disabledMatch = input<(item: T) => boolean>(() => false);
  /**
   * Restrict drag initiation to a rendered **grip handle** (`p-orderList` + `cdkDragHandle`; Book 05
   * §3.4). Off by default — the whole row is the drag surface. When on, each row renders a small,
   * `aria-hidden`, non-focusable grip and only it starts a drag, so a click-drag on the row body just
   * selects. The grip is a pointer affordance only; the keyboard reorder path is unchanged (the move
   * buttons), so the grip stays out of the roving tabindex.
   */
  readonly dragHandle = input(false);

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
  /**
   * Memo backing the roving-focus *follow* (the constructor effect): the `value` array + the focused
   * item's key as of the last settled focus. On an EXTERNAL `value` change the effect looks up
   * `prevFocusKey` in the new list and moves the tab stop with its item; INTERNAL reorders
   * (onDrop/reorderSelection) stamp `prevFocusValue` themselves, so the effect leaves their deliberate
   * focus placement (e.g. onDrop focusing the *dropped* row) alone rather than chasing the old item.
   */
  private prevFocusValue: readonly T[] | null = null;
  private prevFocusKey: unknown = null;
  /** Focused (roving tab stop) index clamped into range, or `-1` when the list is empty. Focus ≠ selection. */
  protected readonly active = computed(() => {
    const n = this.filtered().length;
    return n ? Math.min(Math.max(this.focusIndex(), 0), n - 1) : -1;
  });
  /** The single tab stop — `active()` floored at 0 so the list always has exactly one tabbable row. */
  protected readonly activeTabStop = computed(() => Math.max(this.active(), 0));

  /** A row's identity key (via {@link trackBy}; default = the item itself). Item-pure, so it survives reorders. */
  protected keyOf(item: T): unknown {
    return this.trackBy()(item);
  }
  /**
   * Range anchor for Shift+click / Shift+Arrow — stored as the anchor row's *key* (not an index) so it
   * survives a reorder or an external `value` edit that shifts indices (an index anchor would mis-range);
   * `null` means no live anchor.
   */
  private readonly selectionAnchor = signal<unknown>(null);
  /** The selection's keys as a `Set` for O(1) membership tests (keyed via {@link trackBy}). */
  private readonly selectedKeys = computed(
    () => new Set(this.selection().map((it) => this.keyOf(it))),
  );
  /** Whether `item` is in the current selection (template hot path). */
  protected isSelected(item: T): boolean {
    return this.selectedKeys().has(this.keyOf(item));
  }
  /** Disabled rows' keys as a `Set` (evaluated over {@link value}) for O(1) membership in template/guards. */
  private readonly disabledKeys = computed<ReadonlySet<unknown>>(() => {
    const match = this.disabledMatch();
    return new Set(
      this.value()
        .filter(match)
        .map((it) => this.keyOf(it)),
    );
  });
  /** Whether `item` is disabled — not selectable, movable, or draggable (template hot path). */
  protected isDisabled(item: T): boolean {
    return this.disabledKeys().has(this.keyOf(item));
  }

  /** Ascending indices the move buttons act on: the selected rows, or the focused row when none selected. */
  private readonly moveIndices = computed<readonly number[]>(() => {
    if (this.isFiltering()) return []; // reorder is disabled while filtering (partial-view indices are ambiguous)
    const items = this.value();
    const sel = this.selectedKeys();
    const dis = this.disabledKeys();
    // Disabled rows never move — excluded from the selected picks (a row selected *then* disabled by a
    // dynamic predicate is dropped here, not just at selection time) and from the focused-row fallback.
    const picked = items.reduce<number[]>((acc, it, i) => {
      const k = this.keyOf(it);
      if (sel.has(k) && !dis.has(k)) acc.push(i);
      return acc;
    }, []);
    if (picked.length) return picked;
    // A non-empty selection whose every row is disabled has nothing movable — stay inert; do NOT fall
    // back to the focused (unselected) row, which would silently move a row the user never picked.
    if (sel.size) return [];
    const a = this.active();
    return a >= 0 && !dis.has(this.keyOf(items[a])) ? [a] : [];
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
    // Keep the roving tab stop coherent whenever `value` changes externally — two jobs:
    // (1) FOLLOW the focused item by key across an external reorder/immutable refresh, so the tab stop
    //     (and `--active` highlight) stay on the same row the reused DOM node — and browser focus — moved
    //     to. Guarded on `items !== prevValue` so ordinary focus navigation (value unchanged) never gets
    //     overridden, and so it can't fight the user's Arrow keys. Mirrors the remaps in
    //     onFilterInput/reorderSelection; only fires on a value *reference* change, so filtering (which
    //     leaves value untouched) is unaffected — the #341 focus-follow leg.
    // (2) CLAMP the raw index so a shrink can't leave a stale out-of-range index that would "resurrect"
    //     if the list later grows back. Clamp against value() (the stable data), NOT filtered(): clamping
    //     to the filtered length would destructively shrink the stored index while filtering and strand
    //     the tab stop after the query clears. active() read-clamps to the filtered length for rendering.
    // The guard makes both a no-op once settled, so the effect converges (no loop).
    effect(() => {
      const items = this.value();
      const fi = this.focusIndex();
      let idx = fi;
      if (items !== this.prevFocusValue && this.prevFocusKey != null) {
        const found = items.findIndex((it) => this.keyOf(it) === this.prevFocusKey);
        if (found >= 0) idx = found;
      }
      const n = items.length;
      const clamped = n ? Math.min(Math.max(idx, 0), n - 1) : 0;
      if (clamped !== fi) this.focusIndex.set(clamped);
      this.prevFocusValue = items;
      this.prevFocusKey = n ? this.keyOf(items[clamped]) : null;
    });
    // Reconcile selection against `value` after an external change: drop keys no longer present (prune)
    // AND re-point surviving keys onto `value`'s current references, so an immutable refresh that swaps
    // in new same-key instances keeps the selection live (matching by key, not reference). Compare
    // element-wise by reference — a pure length guard would miss the same-count ref-swap. Converges:
    // once `selection` holds `value`'s own refs the recomputed `kept` is reference-equal, so it stops.
    effect(() => {
      const present = this.selectedKeys(); // reads selection (as keys)
      if (present.size === 0) return;
      const cur = this.selection();
      const kept = this.value().filter((it) => present.has(this.keyOf(it)));
      const changed = kept.length !== cur.length || kept.some((it, i) => it !== cur[i]);
      if (changed) this.selection.set(kept);
    });
    // #350: restore roving focus when an external `value` change destroys the focused row. `@for` removing
    // the focused `<li>` sends `document.activeElement` to `<body>` (WCAG 2.4.3 Focus Order); the follow/
    // clamp effect above moves the tab stop but never re-focuses the DOM, so the next Tab restarts from the
    // top of the page. Re-run after each render where `value` changed and, only when the listbox held focus,
    // move DOM focus onto the (clamped) tab stop. `value()` is the sole tracked dep; the rest reads inside
    // `untracked` so a `focus()`-driven re-entry can't feed back.
    afterRenderEffect(() => {
      this.value(); // trigger: re-check after each external value change
      untracked(() => this.restoreFocusIfLost());
    });
  }

  /**
   * The listbox option that currently (or most recently) held DOM focus, or `null` when focus is outside
   * the listbox. Captured on the listbox `focusin` and kept through a focus loss to `<body>`, so
   * {@link restoreFocusIfLost} can tell a **removed** focused row (this node becomes disconnected) from a
   * user who merely **parked** focus on `<body>` by clicking blank space (the node stays connected — and
   * must NOT be yanked back, WCAG 3.2.5). Cleared when focus moves to a real element outside the listbox.
   */
  private focusedRow: HTMLElement | null = null;

  /** Track the option that took focus, so a later removal can be distinguished from a park-on-`<body>`. */
  protected onListFocusIn(event: FocusEvent): void {
    this.focusedRow = event.target as HTMLElement;
  }

  /** Drop the pending restore when focus genuinely leaves the listbox for another element (not `<body>`). */
  protected onListFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    const list = event.currentTarget as HTMLElement;
    if (next && !list.contains(next)) this.focusedRow = null;
  }

  /**
   * Re-focus the tab-stop row after an external `value` change, but ONLY when the row that held focus was
   * genuinely REMOVED — {@link focusedRow} is now disconnected from the document. A user who parked focus
   * on `<body>` (row still connected) or a surviving/reordered row (its reused node still connected) is left
   * alone; re-focusing them would steal focus (WCAG 3.2.5). Also bail when focus has since landed on a live
   * real element, or the list is empty. `activeElement` may be `<body>`/`<html>` (real browsers null focus
   * there) or a detached node (jsdom keeps focus on a removed node) — all count as "focus lost".
   */
  private restoreFocusIfLost(): void {
    if (this.active() < 0) return;
    const row = this.focusedRow;
    if (!row || row.isConnected) return; // no focused row, or it survived (park-on-body / reorder) — don't steal
    const ae = document.activeElement;
    const lost = !ae || ae === document.body || ae === document.documentElement || !ae.isConnected;
    if (!lost) return; // focus already moved to a live real element — don't steal
    const target = this.optionEls()[this.activeTabStop()]?.nativeElement ?? null;
    target?.focus();
    this.focusedRow = target; // track the row we restored to (focusin also sets this; explicit for jsdom)
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
    const prevKey = prevItem === undefined ? undefined : this.keyOf(prevItem);
    this.filterQuery.set((event.target as HTMLInputElement).value);
    const remapped =
      prevItem === undefined ? -1 : this.filtered().findIndex((it) => this.keyOf(it) === prevKey);
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
    // Focus lands on a disabled row (it's navigable), but it can't be selected — bail before any mutation.
    if (item === undefined || this.isDisabled(item)) return;
    if (event.shiftKey) {
      this.selectRange(index, index);
    } else if (event.ctrlKey || event.metaKey) {
      this.toggle(index);
      this.selectionAnchor.set(this.keyOf(item));
    } else {
      this.commitSelection(new Set([this.keyOf(item)]));
      this.selectionAnchor.set(this.keyOf(item));
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
    // A drop deliberately focuses the DROPPED row — stamp the focus memo so the roving-follow effect
    // treats this as handled, not as an external reorder to chase the previously-focused item.
    this.prevFocusValue = next;
    // Keep the emitted selection in list order if the dragged row was selected (drag can reorder it
    // relative to other selected rows; the length-only prune guard wouldn't catch a same-size reorder).
    const set = this.selectedKeys();
    if (set.has(this.keyOf(next[event.currentIndex]))) {
      this.selection.set(next.filter((it) => set.has(this.keyOf(it))));
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
      // Select-all means all *visible, enabled* rows — identical to the whole list when nothing is
      // filtered or disabled. commitSelection takes a set of KEYS, so map through keyOf.
      this.commitSelection(
        new Set(
          this.filtered()
            .filter((it) => !this.isDisabled(it))
            .map((it) => this.keyOf(it)),
        ),
      );
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      const item = this.filtered()[index];
      // Space toggles + re-anchors, but only on an enabled row: a disabled row is a no-op and must not
      // silently move the range anchor onto itself (a later Shift+range would extend from the wrong origin).
      if (item !== undefined && !this.isDisabled(item)) {
        this.toggle(index);
        this.selectionAnchor.set(this.keyOf(item));
      }
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
    // Shift is ours (range-extend, below); Alt/Ctrl/Meta stay the browser's — Ctrl+Home/End, Cmd+Arrow (#581).
    if (hasModifierKey(event, 'altKey', 'ctrlKey', 'metaKey')) return;
    event.preventDefault();
    // Shift + a navigation key extends the range from the anchor (or this origin row) to the target.
    if (event.shiftKey) this.selectRange(target, index);
    this.activate(target);
    this.optionEls()[target]?.nativeElement.focus();
  }

  /** Toggle one row's membership in the selection (no-op on a disabled row). */
  private toggle(index: number): void {
    const item = this.filtered()[index];
    if (item === undefined || this.isDisabled(item)) return;
    const key = this.keyOf(item);
    const set = new Set(this.selection().map((it) => this.keyOf(it)));
    if (set.has(key)) set.delete(key);
    else set.add(key);
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
    const anchorKey = this.selectionAnchor();
    const anchorIdx =
      anchorKey != null ? items.findIndex((it) => this.keyOf(it) === anchorKey) : -1;
    const from = anchorIdx >= 0 ? anchorIdx : fallbackFrom;
    if (anchorIdx < 0) {
      const seed = items[fallbackFrom];
      this.selectionAnchor.set(seed === undefined ? null : this.keyOf(seed));
    }
    const lo = Math.max(0, Math.min(from, focus));
    const hi = Math.min(items.length - 1, Math.max(from, focus));
    const set = new Set<unknown>();
    // Only enabled rows in the span join the selection; disabled ones are skipped (they can't be moved).
    for (let i = lo; i <= hi; i++) {
      if (!this.isDisabled(items[i])) set.add(this.keyOf(items[i]));
    }
    this.commitSelection(set);
  }

  /** Commit a new selection (a set of *keys*): emit the matching items in list order, announce the count. */
  private commitSelection(set: ReadonlySet<unknown>): void {
    const ordered = this.value().filter((it) => set.has(this.keyOf(it)));
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
    const firstMovedKey = this.keyOf(items[idx[0]]);
    const picked = new Set(idx.map((i) => this.keyOf(items[i])));
    const isPicked = (it: T): boolean => picked.has(this.keyOf(it));

    let next: T[];
    if (dir === 'top') {
      next = [...idx.map((i) => items[i]), ...items.filter((it) => !isPicked(it))];
    } else if (dir === 'bottom') {
      next = [...items.filter((it) => !isPicked(it)), ...idx.map((i) => items[i])];
    } else if (dir === 'up') {
      next = [...items];
      for (let i = 1; i < next.length; i++) {
        if (isPicked(next[i]) && !isPicked(next[i - 1])) {
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
        }
      }
    } else {
      next = [...items];
      for (let i = next.length - 2; i >= 0; i--) {
        if (isPicked(next[i]) && !isPicked(next[i + 1])) {
          [next[i + 1], next[i]] = [next[i], next[i + 1]];
        }
      }
    }

    this.value.set(next);
    if (focusedItem !== undefined) {
      const fk = this.keyOf(focusedItem);
      const ni = next.findIndex((it) => this.keyOf(it) === fk);
      if (ni >= 0) this.focusIndex.set(ni);
    }
    // This path already moved focus with its item; stamp the memo so the roving-follow effect doesn't
    // re-run the same remap (belt-and-suspenders — it would compute the identical index anyway).
    this.prevFocusValue = next;
    const count = idx.length;
    const currentIndex = next.findIndex((it) => this.keyOf(it) === firstMovedKey);
    this.reorder.emit({
      items: next,
      previousIndex: idx[0],
      currentIndex,
      movedIndices: idx,
    });
    this.announcer.announce(
      count === 1
        ? `Moved to position ${currentIndex + 1} of ${next.length}`
        : `Moved ${count} items ${dir === 'top' ? 'to top' : dir === 'bottom' ? 'to bottom' : dir}`,
    );
  }
}
