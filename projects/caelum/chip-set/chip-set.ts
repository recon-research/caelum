import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  isDevMode,
  OnInit,
  output,
} from '@angular/core';
import { MatChipGrid, MatChipRemove, MatChipRow } from '@angular/material/chips';

/** Payload of {@link CaeChipSet.removed} — the item whose remove affordance was activated, and its index. */
export interface CaeChipRemoveEvent<T> {
  readonly item: T;
  readonly index: number;
}

/**
 * `cae-chip-set` — a **managed** removable-chip list (issue #84): the multi-chip companion to the
 * standalone `cae-chip` (#83). Where `cae-chip` is a single `p-chip` that does **not** manage focus
 * across siblings on removal, `cae-chip-set` provides the collection behaviours for free — **roving
 * keyboard navigation** across chips (arrow keys + Home/End) and, crucially, **focus redirect to an
 * adjacent chip when the focused chip is removed** *while a sibling remains* (so a keyboard user is not
 * dropped to `<body>` — the bug a plain chip hits even when siblings exist). Removing the **last** chip
 * leaves no in-set target; bind {@link emptyFocusTarget} to place focus on the now-empty set (e.g. a
 * status region) — else the consumer manages it, as the Forge demo did (#202). Maps to a removable chip
 * **list** (`p-chip` rows); a text-entry tag field (`p-chips` over an input), a selectable listbox, and
 * **per-item `removable`/`disabled`** (#201) are deferred follow-ups.
 *
 * **Why `mat-chip-grid`/`mat-chip-row` (not `mat-chip-set`/`mat-chip`).** Material's roving
 * `FocusKeyManager` and focus-redirect both live in the base `MatChipSet`, but the redirect calls
 * `chip.focus()`, which is a **no-op on a plain `mat-chip`** (it has no focusable primary action) — so
 * a `mat-chip-set` of plain chips silently drops focus to `<body>` on removal, the very bug this
 * component exists to fix. `mat-chip-row` **has** a focusable primary action (its grid cell), so the
 * redirect actually lands. `mat-chip-grid` does **not** require a `matChipInputFor` text input (it is
 * optional and fully guarded) and its form-control machinery is inert when used standalone. The a11y
 * shape is therefore a **grid** — `role="grid"` on the host, `role="row"` per chip, `role="gridcell"`
 * cells — the WAI-ARIA pattern for an interactive removable collection (Left/Right move within a chip
 * between its label and its × ; Up/Down move between chips; Backspace/Delete on a focused chip removes).
 *
 * **Data-driven, not projection** (adapter isolation, D-03). A `MatChipSet` manages its chips through a
 * `ContentChildren(MatChip)` query, which cannot see a `mat-chip` buried inside a projected `cae-chip`'s
 * *view*; and projecting a raw `<mat-chip>` would leak a Material type onto the consumer. So the set
 * renders its own `mat-chip-row`s from `[items]` — the consumer binds data and never touches a Material
 * symbol. Removal is a **request**: `(removed)` fires with the item; the consumer drops it from `[items]`
 * (which destroys the chip and triggers the focus redirect), exactly as `p-chip`/`mat-chip` removal works.
 *
 * ```html
 * <cae-chip-set [items]="tags()" ariaLabel="Workspace tags" (removed)="drop($event.item)" />
 * ```
 *
 * `[items]` values must be **unique** (they are the `@for` track key, and identity is what the focus
 * redirect keys off); for object items provide {@link label}. Token-only theming via the Material bridge
 * (D-04). Zoneless-compatible: `OnPush` + signal state.
 *
 * @typeParam T - the item shape. Defaults to `string` (a plain tag list); provide {@link label} for objects.
 */
@Component({
  selector: 'cae-chip-set',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipGrid, MatChipRow, MatChipRemove],
  template: `
    <mat-chip-grid
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-labelledby]="ariaLabelledby() || null"
    >
      @for (item of items(); track item; let i = $index) {
        <mat-chip-row removable (removed)="onRemoved(item, i)">
          {{ label()(item) }}
          <button matChipRemove type="button" [attr.aria-label]="removeAriaLabelFor(item)">
            <svg
              class="cae-chip-set__remove-glyph"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6 L18 18 M6 18 L18 6" />
            </svg>
          </button>
        </mat-chip-row>
      }
    </mat-chip-grid>
  `,
  styles: `
    .cae-chip-set__remove-glyph {
      inline-size: 1em;
      block-size: 1em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
    }
  `,
})
export class CaeChipSet<T = string> implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The chips to render, in order. Values must be **unique** (they are the `@for` track key). */
  readonly items = input.required<readonly T[]>();

  /**
   * Maps an item to its visible chip label. Defaults to `String(item)` (a plain string tag list); set
   * it for object items, e.g. `[label]="tagLabel"` where `tagLabel = (t: Tag) => t.name`.
   */
  readonly label = input<(item: T) => string>((item) => String(item));

  /**
   * Per-chip override for the remove button's accessible name (the label is otherwise announced as
   * `"Remove <label>"`, auto-distinct per chip). Leave unset for the default; set it to localise or reword.
   */
  readonly removeAriaLabel = input<((item: T) => string) | null>(null);

  /** Accessible name for the whole set (the `role=grid`). Use this or {@link ariaLabelledby}, not both. */
  readonly ariaLabel = input('');
  /** Id of a visible element naming the set (preferred over {@link ariaLabel} when a label is on-screen). */
  readonly ariaLabelledby = input('');

  /**
   * Optional focus landing spot for when the **last** chip is removed. While a sibling remains the set
   * redirects focus to it; the emptied set has no in-set target, so focus would otherwise fall to
   * `<body>`. Point this at a **focusable** element — a non-interactive one (e.g. a heading or a
   * `role="status"` region) needs `tabindex="-1"` — and the set moves focus there after the emptying
   * render.
   *
   * The move fires **only when the removal left focus inside the set**: a keyboard remove, or a pointer
   * remove in a browser that focuses the clicked button. A pointer remove that does *not* focus the button
   * (Safari/Firefox) leaves focus untouched — as does any *programmatic* `[items]` clear, which never runs
   * this path at all — so the hook never steals focus from elsewhere (WCAG 3.2.x, the #189 principle). It
   * also assumes the consumer drops the removed item **synchronously** in the `(removed)` handler (the
   * standard request pattern, as Forge does); an async drop leaves the empty case unmanaged (follow-up).
   *
   * If the target is itself a live region being updated (as Forge's count is) its text may be announced a
   * second time when focus lands — a plain heading/container avoids that. Accepts a raw `HTMLElement` (a
   * `#ref` template variable), an `ElementRef`, or a `viewChild()` result (bind it directly — `undefined`
   * is tolerated). Unset ⇒ unchanged: the consumer owns the empty case.
   */
  readonly emptyFocusTarget = input<HTMLElement | ElementRef<HTMLElement> | null | undefined>(null);

  /**
   * Fires when a chip's remove affordance is activated (× click, Enter/Space, or Backspace/Delete on the
   * focused chip). Removal is a **request**: the consumer owns it — drop `event.item` from `[items]`, which
   * destroys the chip and lets the set redirect focus to the adjacent chip.
   */
  readonly removed = output<CaeChipRemoveEvent<T>>();

  /**
   * Chip-removal request handler. Captures whether focus was inside the set **at removal time** (before
   * the consumer drops the item), emits {@link removed}, then — if that removal held focus and the set is
   * now empty after the render — moves focus to {@link emptyFocusTarget}. The move is deferred to
   * `afterNextRender` because the chip is destroyed during the pending CD (a synchronous focus would land
   * on the doomed DOM and be undone), and the post-render `length` check means a declined removal or a
   * surviving sibling (which the set redirects to itself) never triggers it — mirroring the grid pager's
   * focus-on-disable (#189, #202). Assumes a synchronous item drop (see {@link emptyFocusTarget}).
   */
  protected onRemoved(item: T, index: number): void {
    const heldFocus = this.host.nativeElement.contains(document.activeElement);
    this.removed.emit({ item, index });
    // Anti-steal gate (WCAG 3.2.x, the #189 principle): move focus for the emptied set ONLY when this
    // removal held focus inside the set. A pointer × that didn't focus the button (Safari/Firefox), or a
    // remove while focus is elsewhere, must not yank focus to emptyFocusTarget. (A programmatic [items]
    // clear is safe by construction — it never calls this method.) Locked by the "outside the set" test —
    // do not drop this line.
    if (!heldFocus) return;
    afterNextRender(
      () => {
        if (this.items().length > 0) return;
        const target = this.emptyFocusTarget();
        const el = target instanceof ElementRef ? target.nativeElement : target;
        el?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  /** The remove button's accessible name: the {@link removeAriaLabel} override, else `"Remove <label>"`. */
  protected removeAriaLabelFor(item: T): string {
    return this.removeAriaLabel()?.(item) ?? `Remove ${this.label()(item)}`;
  }

  /** Dev-only config validation (zero prod cost), mirroring `cae-data-grid` — before the first render. */
  ngOnInit(): void {
    if (isDevMode()) this.validateConfig();
  }

  /**
   * Dev-only: catch the two natural misconfigurations the generic-`T` + accessor shape allows.
   * **Duplicate items** *throw* a clear cae-chip-set error (before the render) — they are otherwise a
   * cryptic framework NG0955 (they cannot render at all: identity is the `@for` track key *and* what the
   * focus redirect keys off, which is why `track item`, not `track $index`, is required). An **object
   * item with no `[label]`** only *warns* — it is non-fatal but silently renders `"[object Object]"` as
   * both the visible label and the remove button's accessible name (a broken a11y name that ships
   * unnoticed). Mirrors `cae-data-grid`'s `validateConfig`.
   */
  private validateConfig(): void {
    const items = this.items();
    const seen = new Set<T>();
    const dupes = new Set<T>();
    for (const item of items) (seen.has(item) ? dupes : seen).add(item);
    if (dupes.size) {
      const shown = [...dupes].map((d) => JSON.stringify(this.label()(d))).join(', ');
      throw new Error(
        `cae-chip-set: [items] has duplicate value(s) ${shown} — each item must be unique (it is the @for track key and the focus-redirect identity). Dedupe before binding, e.g. [items]="[...new Set(tags)]".`,
      );
    }
    if (items.some((item) => this.label()(item) === '[object Object]')) {
      console.warn(
        'cae-chip-set: an item renders as "[object Object]" — provide a [label] accessor for object items, e.g. [label]="(t) => t.name".',
      );
    }
  }
}
