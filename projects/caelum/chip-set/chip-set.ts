import {
  afterNextRender,
  afterRenderEffect,
  booleanAttribute,
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
import {
  MatChipGrid,
  MatChipInput,
  type MatChipInputEvent,
  MatChipRemove,
  MatChipRow,
} from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';

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
 * **list** (`p-chip` rows) with **per-item `[chipRemovable]`/`[chipDisabled]`** accessors (#201) for mixed
 * lists of removable, locked, and disabled chips, and an opt-in **text-entry tag field** ({@link textEntry},
 * `p-chips` parity, #201) that turns typed text into {@link added} requests. A selectable listbox
 * (`mat-chip-listbox`) remains a deferred follow-up — it is a `role=listbox` mode switch, not an addition.
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
  imports: [MatChipGrid, MatChipRow, MatChipRemove, MatChipInput],
  template: `
    <mat-chip-grid
      #grid
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-labelledby]="ariaLabelledby() || null"
    >
      @for (item of items(); track item; let i = $index) {
        <mat-chip-row
          [removable]="isRemovable(item)"
          [disabled]="isDisabled(item)"
          (removed)="onRemoved(item, i)"
        >
          {{ label()(item) }}
          @if (isRemovable(item)) {
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
          }
        </mat-chip-row>
      }
    </mat-chip-grid>
    @if (textEntry()) {
      <input
        class="cae-chip-set__input"
        [matChipInputFor]="grid"
        [matChipInputAddOnBlur]="addOnBlur()"
        [matChipInputSeparatorKeyCodes]="separatorKeyCodes"
        [attr.aria-label]="textEntryLabel() || null"
        [placeholder]="textEntryPlaceholder()"
        (matChipInputTokenEnd)="onTokenEnd($event)"
      />
    }
  `,
  styles: `
    /* The field is used bare (no mat-form-field wrapper, #201), so it carries its own minimal box: borderless
       and transparent, inheriting the host's type. Sizing is deliberately NOT restated here — Material already
       ships it for this exact adjacent arrangement (input.mat-mdc-chip-input { flex: 1 0 150px }).
       Known: mat-chip-grid is a block-level flex box, so the field currently renders on its OWN LINE beneath
       the chips rather than inline with them (the p-chips visual). Fixing that needs a host flex container and
       a real browser to verify — #552, not guessed at here.
       It must carry its OWN focus ring: with no surrounding form field there is nothing else to indicate
       focus, and a borderless input whose UA outline was suppressed would be invisible to a keyboard user
       (WCAG 2.4.7). The interactive floor uses the density-invariant token, per PATTERNS.md §10. */
    .cae-chip-set__input {
      box-sizing: border-box;
      border: 0;
      background: transparent;
      color: var(--cae-color-on-surface);
      font: inherit;
      padding-block: var(--cae-space-2);
      padding-inline: var(--cae-space-2);
      min-block-size: var(--cae-target-min);
    }
    .cae-chip-set__input:focus-visible {
      outline: 2px solid var(--cae-color-primary);
      outline-offset: 2px;
    }
    .cae-chip-set__input::placeholder {
      color: var(--cae-color-on-surface-variant);
    }
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

  /**
   * A focus-holding removal of the LAST enabled chip whose async drop hasn't emptied the set yet — armed in
   * {@link onRemoved} (only when removing that chip alone would leave no enabled chip), consumed by the redirect
   * effect (constructor) once {@link items} actually reaches no-enabled-chip, which may be a later, **async**
   * render (#205). A **synchronous cascade** multi-drop takes the separate one-shot path in {@link onRemoved}
   * instead (#448). `null` when nothing is pending. Wrapped (not a bare `T`) so any item value, including a
   * falsy one, stays distinguishable from "not armed".
   */
  private pendingEmptyRemoval: { readonly item: T } | null = null;

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

  /**
   * Per-item predicate for whether a chip is removable — mirrors the {@link label} accessor shape (#201).
   * Defaults to `() => true` (every chip removable, the v1 behaviour). Return `false` to render a **locked**
   * chip: no × affordance and no remove request. A {@link chipDisabled} chip is always locked regardless of
   * this, so a mixed list can hold both removable, non-removable, and disabled chips.
   */
  readonly chipRemovable = input<(item: T) => boolean>(() => true);

  /**
   * Per-item predicate for whether a chip is disabled — mirrors the {@link label} accessor shape (#201).
   * Defaults to `() => false`. A disabled chip is greyed and `aria-disabled` (Material handles the presentation
   * and removes it from actioning), and is implicitly **locked** — its × is dropped — so a keyboard user can't
   * remove a chip that is meant to be inert. Material also drops a disabled chip from the roving tab order, so
   * it is **not keyboard-reachable**; for a value that must stay readable/focusable but not removable, use a
   * **locked** chip (`[chipRemovable]` → false) instead of disabling it.
   */
  readonly chipDisabled = input<(item: T) => boolean>(() => false);

  /** Accessible name for the whole set (the `role=grid`). Use this or {@link ariaLabelledby}, not both. */
  readonly ariaLabel = input('');
  /** Id of a visible element naming the set (preferred over {@link ariaLabel} when a label is on-screen). */
  readonly ariaLabelledby = input('');

  /**
   * Optional focus landing spot for when a removal leaves **no focusable chip** — the set empties, or only
   * disabled chips remain (Material skips disabled chips, so it can't redirect to one). While an enabled
   * sibling remains the set redirects focus to it; with no focusable chip left there is no in-set target, so
   * focus would otherwise fall to `<body>`. Point this at a **focusable** element — a non-interactive one (e.g. a heading or a
   * `role="status"` region) needs `tabindex="-1"` — and the set moves focus there after the emptying
   * render.
   *
   * The move fires **only when the removal left focus inside the set**: a keyboard remove, or a pointer
   * remove in a browser that focuses the clicked button. A pointer remove that does *not* focus the button
   * (Safari/Firefox) leaves focus untouched — as does any *programmatic* `[items]` clear, which never runs
   * this path at all — so the hook never steals focus from elsewhere (WCAG 3.2.x, the #189 principle).
   * **Sync or async drop:** the move is keyed off the set *actually* emptying, so dropping the removed item
   * later (a confirm dialog, `http.delete().subscribe(...)`) still lands focus; at that moment it re-checks
   * that focus is still stranded (`<body>`) or inside the set, so a focus that legitimately moved during the
   * async gap is never stolen (#205). Scope: covers a removal that **alone** leaves no focusable chip (the last
   * enabled chip, dropped sync or async), and a **synchronous cascade / multi-item drop** — a `(removed)` handler
   * that filters several items at once, emptying a `>1` set inside the emit (#448). Still out, both falling back
   * to the consumer: (a) an **async cascade** — the handler drops *untracked* sibling items in a later task,
   * genuinely indistinguishable from a coincident programmatic clear once deferred; and (b) **concurrent**
   * overlapping async removals — distinguishable in principle (every departed item was removal-tracked, unlike a
   * clear) but deferred on the added state a departure-diff would cost (#448).
   *
   * If the target is itself a live region being updated (as Forge's count is) its text may be announced a
   * second time when focus lands — a plain heading/container avoids that. Accepts a raw `HTMLElement` (a
   * `#ref` template variable), an `ElementRef`, or a `viewChild()` result (bind it directly — `undefined`
   * is tolerated). Unset ⇒ unchanged: the consumer owns the empty case.
   */
  readonly emptyFocusTarget = input<HTMLElement | ElementRef<HTMLElement> | null | undefined>(null);

  /**
   * Opt into the **text-entry tag field** (`p-chips` parity, #201): renders a bare `<input>` after the chips
   * that turns typed text into new-chip requests on **Enter** or **comma** (and on blur with {@link addOnBlur}).
   * Off by default — the set stays a pure display/removal list.
   *
   * The input is a sibling of the `role=grid`, wired to it by Material, so the two share one composite widget:
   * the grid's roving arrow keys are untouched, and Backspace in an empty input steps back into the chips
   * (unless the last chip is `[chipDisabled]` — Material's step-back doesn't skip to the previous enabled one).
   * Give it an accessible name with {@link textEntryLabel}.
   *
   * **With text entry on the input is normally the empty-set focus landing spot**, so {@link emptyFocusTarget}
   * is skipped there (redirecting would steal focus from the field the user is typing in, WCAG 3.2.5). That
   * skip is *narrow*, matching where Material actually lands focus: with **two or more disabled chips** left it
   * lands nothing, so the redirect still runs (a blanket skip stranded the user on `<body>`).
   *
   * Known residuals, all `[textEntry]`-only: a **disabled first chip** makes the chips keyboard-unreachable and
   * bounces Shift+Tab (#550); an **async** drop that lands after the user has moved away can let *Material*
   * pull focus into the field (#551 — the one steal this component cannot gate, since the landing decision is
   * Material's); the field renders **below** the chips rather than inline (#552); rejected-add text loss, IME
   * commits, and runtime toggling (#553). The form-control shape is an open decision (#549).
   */
  readonly textEntry = input(false, { transform: booleanAttribute });

  /**
   * Accessible name for the {@link textEntry} input (e.g. `"Add a tag"`). The chips' own `role=grid` name
   * ({@link ariaLabel}) does **not** name the input — it is a separate control — so set this whenever text
   * entry is on; a dev-mode warning fires if both this and {@link textEntryPlaceholder} are missing.
   */
  readonly textEntryLabel = input('');

  /** Visible placeholder for the {@link textEntry} input. A placeholder is *not* a substitute for a label. */
  readonly textEntryPlaceholder = input('');

  /**
   * Whether blurring the {@link textEntry} input commits its pending text. Defaults to `false` (Material's
   * default) so a click elsewhere can't mint a chip the user didn't intend; the text stays in the field.
   */
  readonly addOnBlur = input(false, { transform: booleanAttribute });

  /**
   * Fires when a chip's remove affordance is activated (× click, Enter/Space, or Backspace/Delete on the
   * focused chip). Removal is a **request**: the consumer owns it — drop `event.item` from `[items]`, which
   * destroys the chip and lets the set redirect focus to the adjacent chip.
   */
  readonly removed = output<CaeChipRemoveEvent<T>>();

  /**
   * Fires when {@link textEntry} text is committed (Enter, comma, or blur with {@link addOnBlur}) — the
   * **trimmed** typed string; blank/whitespace-only entries are swallowed and never emitted. Like
   * {@link removed}, addition is a **request**: the consumer appends to `[items]`. The payload is the raw
   * `string` (not `T`) because only the consumer knows how to build an item — for an object `T`, map it:
   * `(added)="tags.set([...tags(), { id: uid(), name: $event }])"`.
   *
   * **Dedupe before appending.** `[items]` values must be unique (identity is the `@for` track key and the
   * focus-redirect key), and a tag field is exactly where a user re-types an existing value. Appending a
   * duplicate raises the framework's own **NG0955** — *not* the friendly error `validateConfig` throws, which
   * runs once at init and so can never see a runtime duplicate; a dev-mode warning fires here instead. The set
   * cannot dedupe for you: for an object `T`, two items may legitimately share a label while being distinct.
   * Guard on your own key, e.g. `if (!tags().some((t) => t.name === $event))`.
   */
  readonly added = output<string>();

  /** Keys that commit typed text: Enter (Material's default) + comma (the `p-chips` convention). */
  protected readonly separatorKeyCodes: readonly number[] = [ENTER, COMMA];

  constructor() {
    // Drive the empty-set focus redirect off {@link items} actually reaching no-enabled-chip — NOT a
    // request-time afterNextRender — so an ASYNC drop (a confirm dialog, or `(removed)=>http.delete()
    // .subscribe(drop)`) still lands focus once its later render empties the set (#205). afterRenderEffect runs
    // post-render (the emptied DOM is in place) and re-runs whenever items() changes. This effect owns the
    // last-enabled-chip path (marker armed in {@link onRemoved}); a SYNCHRONOUS cascade multi-drop takes the
    // one-shot path there instead (#448). Three outcomes once the marker is armed:
    //   • the removed item is still present → the async drop hasn't landed; keep the marker armed and wait.
    //   • it's gone but an enabled chip remains → the grid's own FocusKeyManager redirected; just disarm.
    //   • it's gone and no enabled chip is left → land focus on emptyFocusTarget IF it's still ours to move
    //     (see {@link focusEmptyTargetIfOurs}). This BOUNDS a stale marker's harm rather than eliminating it: a
    //     *cancelled* last-chip removal (item never dropped) leaves the marker armed, so a later unrelated
    //     empty-on-<body> would redirect — benign (body→target strands no meaningful focus), and there is no
    //     clean causal expiry signal, so it is an accepted residual (#448).
    afterRenderEffect(() => {
      const items = this.items();
      const pending = this.pendingEmptyRemoval;
      if (!pending) return;
      if (items.includes(pending.item)) return; // async drop hasn't landed yet — keep waiting
      this.pendingEmptyRemoval = null; // resolved either way — consume the marker
      // An ENABLED chip remains → Material's FocusKeyManager redirected focus to it; nothing to do. A
      // disabled-only remainder is NOT skippable (the grid can't focus it), so fall through and land on
      // emptyFocusTarget exactly like the fully-empty case (#201).
      if (items.some((x) => !this.isDisabled(x))) return;
      this.focusEmptyTargetIfOurs();
    });
  }

  /**
   * Land focus on {@link emptyFocusTarget} after the set reached no-enabled-chip — but ONLY after re-validating
   * that focus is still ours to move (stranded on `<body>`/null, or still inside the set). If focus legitimately
   * moved elsewhere (an async gap, or a concurrent interaction) we don't steal it (WCAG 3.2.5) — the move-time
   * counterpart to onRemoved's request-time heldFocus gate. Shared by the async last-chip effect (constructor)
   * and the synchronous-cascade one-shot ({@link redirectAfterSyncCascade}).
   */
  private focusEmptyTargetIfOurs(): void {
    // With [textEntry], skip the redirect ONLY where Material will itself land focus in the input — else it
    // would STEAL focus out of the field the user is typing in (WCAG 3.2.5). This must be checked before the
    // ownsFocus gate below, not folded into it: the input lives inside the host, so `host.contains(active)`
    // reads as "still ours" and would wave the steal straight through (#201).
    //
    // The condition mirrors Material 22's MatChipSet._redirectDestroyedChipFocus exactly, because a blanket
    // skip is a STRAND: it calls grid.focus() — which forwards to the registered input — only when no chips
    // remain, or when exactly ONE remains and it is disabled. With two or more disabled chips left it calls
    // _keyManager.setPreviousItemActive() instead, whose skip-predicate loop walks off the end and focuses
    // nothing at all, dropping the user on <body> (WCAG 2.4.3 — the defect this component exists to prevent).
    // Every caller reaches here only when no ENABLED chip remains, so "1 left and disabled" is the whole of
    // the one-chip case. Teeth: the two-disabled-chips spec.
    const left = this.items();
    const materialWillFocusInput =
      left.length === 0 || (left.length === 1 && this.isDisabled(left[0]));
    if (this.textEntry() && materialWillFocusInput) return;
    const active = document.activeElement;
    const ownsFocus =
      active === null || active === document.body || this.host.nativeElement.contains(active);
    if (!ownsFocus) return; // focus moved away — don't steal it (WCAG 3.2.5)
    const target = this.emptyFocusTarget();
    const el = target instanceof ElementRef ? target.nativeElement : target;
    el?.focus({ preventScroll: true });
    // Dev-only DX nudge (zero prod cost): a non-focusable target (a non-interactive element missing
    // tabindex="-1") or one detached from the DOM makes .focus() a silent no-op, dropping the keyboard user to
    // <body> — the same as no redirect at all, but hidden. Unlike validateConfig (own inputs, knowable at init)
    // an EXTERNAL element's focusability is only knowable here, after the call — so the guard lives here (#206).
    // Only nudge when a target was actually bound. The activeElement compare assumes the documented light-DOM
    // target (a heading / status region); a shadow-DOM or focus-forwarding target can retarget activeElement to
    // its host, a benign dev-only false positive — accepted rather than shipping an untestable shadow-walk.
    if (isDevMode() && el && document.activeElement !== el) {
      console.warn(
        'cae-chip-set: [emptyFocusTarget] did not receive focus after the set emptied — the element is likely not focusable (a non-interactive target needs tabindex="-1") or is detached from the DOM.',
      );
    }
  }

  /**
   * Chip-removal request handler. Emits {@link removed} (the consumer owns the drop), then — when the removal
   * **held focus inside the set** — routes the empty-set focus redirect down one of two paths by the pre-emit
   * last-ness (captured before the emit, since a synchronous drop mutates {@link items} during it):
   *  - **Last enabled chip** → arm {@link pendingEmptyRemoval}; the constructor effect lands focus once `items`
   *    actually empties, so an **async** drop (a confirm dialog, `http.delete().subscribe(...)`) still works (#205).
   *  - **Not last** → schedule a one-shot post-render check ({@link redirectAfterSyncCascade}) that redirects
   *    only if the (removed) handler **synchronously** cascaded the set empty from `>1` (#448); an async or
   *    concurrent emptying falls back to the consumer (scope + why → {@link emptyFocusTarget}).
   * A remove that didn't hold focus (a non-focusing pointer × in Safari/Firefox, or focus already elsewhere)
   * takes neither path — it must never yank focus (WCAG 3.2.x, the #189 anti-steal principle).
   */
  protected onRemoved(item: T, index: number): void {
    // Defence in depth: a locked/disabled chip renders no × and Material won't fire (removed) on a
    // non-removable chip, but never emit a removal request for one even if a stray event arrives.
    if (!this.isRemovable(item)) return;
    const heldFocus = this.host.nativeElement.contains(document.activeElement);
    // Whether removing THIS chip alone would leave no focusable chip — the set fully empties, OR only DISABLED
    // chips remain (Material skips disabled chips in its roving key manager and MatChipGrid.focus() no-ops on a
    // disabled-only set, so without a redirect a keyboard remove drops to <body> even though a disabled
    // "sibling" remains — the exact strand #201 prevents). Captured PRE-emit, since a synchronous drop mutates
    // items() during it.
    const emptiesAlone = !this.items().some((x) => x !== item && !this.isDisabled(x));
    this.removed.emit({ item, index }); // consumer owns the drop — sync or async, and may cascade to siblings
    if (!heldFocus) return; // the removal didn't hold focus → never steal it from elsewhere (WCAG 3.2.x, #189)
    if (emptiesAlone) {
      // Predicted last-enabled-chip removal — the async-safe path (#205): the drop may land later (a confirm
      // dialog / http.delete().subscribe(drop)), so let the effect redirect once items() actually empties.
      this.pendingEmptyRemoval = { item };
    } else {
      // Not last on its own — but the (removed) handler may have SYNCHRONOUSLY cascaded, dropping this chip AND
      // siblings and emptying a >1 set in the same change-detection flush (#448). Check ONCE after the removal's
      // render: a synchronous drop has propagated (the set is empty → redirect); an async drop has NOT (the item
      // is still present → no-op, leaving no stale marker). Async / concurrent emptyings stay the consumer
      // fallback (scope + why on {@link emptyFocusTarget}).
      afterNextRender(() => this.redirectAfterSyncCascade(item), { injector: this.injector });
    }
  }

  /**
   * One-shot post-render check for a **synchronous cascade** removal (#448): if the just-removed `item` is gone
   * and no enabled chip remains, the (removed) handler emptied a `>1` set inside the removal's change-detection
   * flush — a real removal-caused emptying — so land focus on {@link emptyFocusTarget}. If `item` is still
   * present the drop was async (no-op here — the deferred-emptying fallback lives on {@link emptyFocusTarget}),
   * and a surviving enabled chip means the grid's FocusKeyManager already redirected.
   */
  private redirectAfterSyncCascade(item: T): void {
    const items = this.items();
    if (items.includes(item)) return; // async drop — not a synchronous cascade
    if (items.some((x) => !this.isDisabled(x))) return; // an enabled chip remains → grid redirected
    this.focusEmptyTargetIfOurs();
  }

  /**
   * {@link textEntry} commit handler. Emits the **trimmed** text as an {@link added} request and clears the
   * field. A blank/whitespace-only entry is swallowed (it would mint an unnamed empty chip) but still clears.
   */
  protected onTokenEnd(event: MatChipInputEvent): void {
    const value = event.value.trim();
    // Clear BEFORE emitting, not after. Material's blur path calls _emitChipEnd() unconditionally, so with
    // [addOnBlur] a consumer whose (added) handler moves focus re-enters this method synchronously — and if
    // the field still held the text, the same entry would commit twice (two chips from one Enter, which for
    // string items is a *thrown* duplicate). Clearing first makes any re-entrant emit see '' and fall into
    // the blank guard below.
    event.chipInput.clear();
    if (!value) return;
    // Dev-only: the friendly duplicate error in validateConfig runs ONCE at ngOnInit, so it cannot see a
    // duplicate introduced at runtime — which is the only way a tag field ever makes one. Without this nudge
    // a consumer who skips the dedupe gets the raw framework NG0955 the validator exists to prevent. Sound
    // for the default string T; for object items a shared label may be legitimate, hence a warn, not a throw.
    if (isDevMode() && this.items().some((i) => this.label()(i) === value)) {
      console.warn(
        `cae-chip-set: (added) "${value}" duplicates an existing chip's label. [items] must stay unique — dedupe before appending, or Angular will throw NG0955 when the duplicate renders.`,
      );
    }
    this.added.emit(value);
  }

  /** The remove button's accessible name: the {@link removeAriaLabel} override, else `"Remove <label>"`. */
  protected removeAriaLabelFor(item: T): string {
    return this.removeAriaLabel()?.(item) ?? `Remove ${this.label()(item)}`;
  }

  /** Whether `item` is disabled ({@link chipDisabled}) — greyed, `aria-disabled`, and implicitly locked. */
  protected isDisabled(item: T): boolean {
    return this.chipDisabled()(item);
  }

  /**
   * Whether `item` shows a × and can be removed: {@link chipRemovable} AND not {@link chipDisabled} — a
   * disabled chip is always locked, so the × never renders on an inert chip.
   */
  protected isRemovable(item: T): boolean {
    return this.chipRemovable()(item) && !this.isDisabled(item);
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
    // A [textEntry] input with neither a label nor a placeholder ships an unnamed text field: a screen reader
    // announces bare "edit text". The set's own [ariaLabel] names the role=grid, NOT the input beside it (#201).
    if (this.textEntry() && !this.textEntryLabel()) {
      console.warn(
        'cae-chip-set: [textEntry] is on but the input has no accessible name — set [textEntryLabel] (e.g. textEntryLabel="Add a tag"). The set\'s [ariaLabel] names the chip grid, not the input, and a [textEntryPlaceholder] is not a substitute: it is only a last-resort accessible name and it disappears as soon as the user types.',
      );
    }
  }
}
