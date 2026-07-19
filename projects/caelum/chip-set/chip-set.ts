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
  viewChild,
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
  // Witnesses the focus arrival that Material's SYNCHRONOUS sibling redirect produces, which is gone by the
  // time any post-render hook could read document.activeElement (#556 — see {@link onFocusIn}).
  host: { '(focusin)': 'onFocusIn($event)' },
  template: `
    <mat-chip-grid
      #grid
      [tabIndex]="gridTabIndex()"
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

  /**
   * A focus-holding removal that left an enabled sibling behind and whose drop hasn't landed yet — the
   * counterpart to {@link pendingEmptyRemoval} for the NOT-last branch (#556). Armed in {@link onRemoved},
   * consumed by {@link restoreAfterSiblingGrab} on the render where the item actually departs. Same accepted
   * residual as the empty marker (#448): a *cancelled* removal leaves it armed, so a later items change that
   * coincides with an external focus arrival could restore once — bounded by the witness gates below, and
   * there is no clean causal expiry signal.
   *
   * Second residual, shared with {@link pendingEmptyRemoval} and inherent to the identity contract on
   * {@link items} (values are the `@for` track key): departure is tested with `includes`, so an immutable
   * **refetch** that replaces every item with a fresh instance while the drop is in flight reads as "the item
   * departed", consuming the marker early and leaving the real grab unguarded. Object items on a polling data
   * source are the realistic shape. Not fixed here — a value-keyed alternative would need an item-identity
   * API this component deliberately doesn't have (#618).
   */
  private pendingSiblingRemoval: { readonly item: T } | null = null;

  /**
   * Where focus was immediately before Material pulled it into the set during the CURRENT items change — the
   * `relatedTarget` of the arrival, captured by {@link onFocusIn}. Cleared at the end of every effect run, so
   * it can only ever bind to the flush it was captured in.
   */
  private grabWitness: HTMLElement | null = null;

  /**
   * The `items` array as of the last completed post-render effect run. Compared by identity in
   * {@link onFocusIn} to tell "an items change is mid-flight" (a programmatic grab) from "the set is settled"
   * (the user's own Tab back in). Sound because a signal input only fires on a NEW reference.
   */
  private renderedItems: readonly T[] = [];

  /**
   * The chip grid element. The steal always lands *in here*, so this — not the host — is what "focus was
   * already in the set" means: with {@link textEntry} the input is a separate composite control inside the
   * same host, and a grab that drags the user out of the field they are typing in is every bit the WCAG 3.2.5
   * steal that one out of an external field is. Testing against the host would classify it as an internal
   * move and silently drop it (#556).
   */
  private readonly gridEl = viewChild.required('grid', { read: ElementRef<HTMLElement> });

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
   * clear) but deferred on the added state a departure-diff would cost (#448). Separately, when an async drop
   * leaves a **sibling** chip standing, Material's own redirect into that sibling is likewise unconditional —
   * so it can pull a user who has since moved away back into the set (#556); only the empty-set form of that
   * grab is undone today.
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
   * A drop landing after the user has moved on cannot drag them back into the field — Material's grab is
   * unconditional, so it is undone (#551) — nor pull them **out** of it into a chip, the mirror case, which is
   * why the witness in {@link onFocusIn} is scoped to the grid rather than the host (#556). Both directions are
   * covered. Behind a **disabled first chip** the grid leaves the tab order so
   * Shift+Tab can escape (#550); the chips themselves are then reachable only by Backspace from the empty
   * field, and **not at all** when the last chip is disabled too (Material's step-back targets the last chip
   * without skipping disabled ones) — the open half of #550. Further residuals, all `[textEntry]`-only: the
   * field renders **below** the chips rather than inline (#552); rejected-add text loss, IME commits, and
   * runtime toggling (#553). Form-control shape: open decision #549.
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

  /**
   * Tab-order position of the chip grid — normally `0` (the single tab stop leading into the roving chip
   * navigation), but `-1` when {@link textEntry} is on **and the first chip is disabled**, where Material
   * turns the grid into a one-way valve that forwards every arrival to the input: Shift+Tab out of the field
   * can then never get past the component, a keyboard trap (WCAG 2.1.2, Level A). Leaving the tab order costs
   * no reachability — behind a disabled first chip the grid already forwarded every arrival. Full trace and
   * the arity arms live in `chip-set.spec.ts` (#550).
   *
   * A plain method, not a `computed()` — it must re-evaluate on the same cadence as the template's
   * `[disabled]="isDisabled(item)"`, or a {@link chipDisabled} predicate over non-signal data leaves the grid
   * tabbable beside a chip that renders disabled, silently restoring the trap. Pinned by the `TRACKS a runtime
   * change` spec; O(1), so there is nothing to memoize anyway.
   */
  protected gridTabIndex(): number {
    const items = this.items();
    return this.textEntry() && items.length > 0 && this.isDisabled(items[0]) ? -1 : 0;
  }

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
      // Undoing Material's focus grab (#551) is deliberately NOT gated on the marker below: Material grabs
      // whenever the set reaches no-enabled-chip, regardless of whose removal caused it, so anything that
      // empties the set without arming the marker — an async CASCADE most of all (a handler that drops the
      // removed item AND its siblings in a later task, which takes onRemoved's not-last branch and leaves no
      // marker) — would otherwise still drag a departed user back into the field. Safe to run unconditionally:
      // it self-gates on the grab having actually landed inside this host.
      this.undoMaterialGrabIfUserHasLeft(items);
      this.restoreAfterSiblingGrab(items);
      this.resolveEmptyRedirect(items);
      // Bookkeeping LAST, and outside every early return above: the witness must bind only to the flush it was
      // captured in, and renderedItems is the "is a change mid-flight" baseline onFocusIn compares against.
      this.renderedItems = items;
      this.grabWitness = null;
    });
  }

  /**
   * The last-enabled-chip redirect, resolved once {@link items} actually reaches no-enabled-chip (the marker is
   * armed in {@link onRemoved}). Split out of the effect body so its early returns can't skip the effect's
   * end-of-run bookkeeping.
   */
  private resolveEmptyRedirect(items: readonly T[]): void {
    const pending = this.pendingEmptyRemoval;
    if (!pending) return;
    if (items.includes(pending.item)) return; // async drop hasn't landed yet — keep waiting
    this.pendingEmptyRemoval = null; // resolved either way — consume the marker
    // An ENABLED chip remains → Material's FocusKeyManager redirected focus to it; nothing to do. A
    // disabled-only remainder is NOT skippable (the grid can't focus it), so fall through and land on
    // emptyFocusTarget exactly like the fully-empty case (#201).
    if (items.some((x) => !this.isDisabled(x))) return;
    this.focusEmptyTargetIfOurs();
  }

  /**
   * Capture the focus arrival produced by Material's sibling redirect (#556). `MatChipSet` destroys the removed
   * chip and calls `chipToFocus.focus()` **synchronously**, inside the chips-changed subscription — so unlike
   * the empty-set grab (queued in a microtask, undone by {@link undoMaterialGrabIfUserHasLeft}), it has already
   * happened by the time any post-render hook runs, and `document.activeElement` no longer remembers where the
   * user was. The browser does: it hands us the departed element as the arrival's `relatedTarget`.
   *
   * The discriminator between that grab and a user Tabbing back into the set is whether an items change is
   * **mid-flight** — the consumer's drop has written the signal but this render's effect hasn't run yet. A
   * user's own move can only happen with the set settled (`items() === renderedItems`), because the grab is
   * synchronous JS inside the flush and nothing can interleave with it.
   */
  protected onFocusIn(event: FocusEvent): void {
    if (!this.pendingSiblingRemoval) return; // no focus-holding removal in flight → nothing to undo
    const from = event.relatedTarget;
    // <body> means focus was already stranded (the removed chip took it down with it) — Material's landing is
    // an improvement on that, never something to "restore". Engines disagree on which of `null` / `<body>` they
    // report here, so both arms are rejected. The `<body>` arm is deliberately NOT unit-pinned: jsdom only ever
    // produces `null`, and `document.body.focus()` is a silent no-op there (verified) while it genuinely BLURS
    // in a browser — so a jsdom test of it passes with or without this guard and would be a false witness.
    // Real-browser check tracked in #617 (with the #405 pointer-remove variants).
    if (!(from instanceof HTMLElement) || from === document.body) return;
    if (this.gridEl().nativeElement.contains(from)) return; // already in the set — a roving move, not a steal
    // Settled set ⇒ the user's own move, not a grab. Sound because `items` is a signal INPUT: it does not
    // update when the consumer writes the parent signal, only when change detection propagates the binding.
    // So the window where it differs from the last rendered value lies INSIDE the synchronous flush, after
    // the binding update and before this render's effect — where no user-driven focus event can interleave.
    // (Both adversarial lenses read this as a wall-clock gap a click could land in, and filed a steal against
    // it; the `witnesses no grab when the user clicks in during the drop's scheduling gap` spec drives exactly
    // that sequence and stays green. It fails if this line goes.)
    if (this.items() === this.renderedItems) return;
    this.grabWitness = from;
  }

  /**
   * Put focus back where the user left it when Material's SYNCHRONOUS sibling redirect fires after an async
   * drop lands (#556) — the not-last mirror of {@link undoMaterialGrabIfUserHasLeft}. Normally that redirect is
   * the whole point of a managed chip set; it is wrong only when the removal was async and focus has since
   * legitimately left, which is a WCAG 3.2.5 steal out of whatever the user moved on to.
   *
   * Conservative in the same way as the empty-set restore: it acts only on a removal that held focus when it
   * was requested, only on the render where that item actually departs, only when a same-flush arrival from
   * outside was witnessed, and only when the grab really did land inside this host. A witness that has left
   * the DOM is dropped rather than chased (focusing a detached node silently strands the user on `<body>`).
   */
  private restoreAfterSiblingGrab(items: readonly T[]): void {
    const pending = this.pendingSiblingRemoval;
    if (!pending) return;
    if (items.includes(pending.item)) return; // the async drop hasn't landed — keep waiting
    this.pendingSiblingRemoval = null; // the item departed — consume the marker either way
    const heldBy = this.grabWitness;
    // A witness exists only because a focusin landed in the grid during THIS flush — which is already the
    // proof that the grab happened, so no "did focus land inside the host" re-check is needed. One was
    // written and then removed: no mutation could falsify it (both review lenses flagged it), and it is worse
    // than redundant — if a cascade destroys the grabbed chip later in the same flush, focus falls to <body>
    // and such a check would block the restore that would rescue it. Not chasing a witness that has left the
    // DOM is kept, though: focusing a detached node is a silent no-op.
    if (!heldBy || !heldBy.isConnected) return;
    heldBy.focus({ preventScroll: true });
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
    // would STEAL focus out of the field the user is typing in (WCAG 3.2.5). Checked before the ownsFocus gate
    // below, not folded into it: the input lives inside the host, so `host.contains(active)` reads as "still
    // ours" and would wave the steal straight through (#201). A blanket skip would instead STRAND the ≥2
    // -disabled arity — see {@link materialWillFocusInput}. Teeth: the two-disabled-chips spec.
    const left = this.items();
    if (this.textEntry() && this.materialWillFocusInput(left)) return;
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
   * Whether Material will pull focus into the {@link textEntry} field once `left` is all that remains. Mirrors
   * Material 22's `MatChipSet._redirectDestroyedChipFocus`: it calls `grid.focus()` — which forwards to the
   * registered input — only when **no** chips remain, or when exactly **one** remains and it is disabled. With
   * two or more disabled chips left it calls `_keyManager.setPreviousItemActive()` instead, whose skip-predicate
   * walks off the end and focuses nothing at all, dropping the user on `<body>` (WCAG 2.4.3 — the very defect
   * this component exists to prevent), so that arity must NOT be treated as "Material has it covered".
   */
  private materialWillFocusInput(left: readonly T[]): boolean {
    return left.length === 0 || (left.length === 1 && this.isDisabled(left[0]));
  }

  /**
   * Put focus back where the user left it when Material pulls it into the {@link textEntry} field after the set
   * empties behind their back (#551) — the one steal this component cannot prevent by declining to act, since
   * `MatChipGrid.focus()` schedules `_chipInput.focus()` unconditionally, never checking that focus is still in
   * the widget. Runs from the post-render hook of the tick that queued that microtask, so the restore is
   * deterministically *behind* it in the FIFO queue — no timer, no polling, no race.
   *
   * Conservative: it re-focuses only when the grab actually landed **inside this host**, and never chases a
   * `heldBy` that has left the DOM (focusing a detached node is a silent no-op that would strand the user on
   * `<body>` — worse than Material's field, which is at least real). Not silent, though: the field genuinely
   * takes focus first, so a screen reader announces it before the restored element. Harmless with
   * {@link addOnBlur}, whose blur-commit finds the field already empty and swallows it.
   */
  private undoMaterialGrabIfUserHasLeft(items: readonly T[]): void {
    if (!this.textEntry() || !this.materialWillFocusInput(items)) return;
    const heldBy = document.activeElement;
    // Only a focus that is genuinely elsewhere is worth restoring: <body>/null means nothing was strandable,
    // and a focus already inside the host is the normal case Material's landing is CORRECT for.
    if (!(heldBy instanceof HTMLElement) || this.host.nativeElement.contains(heldBy)) return;
    queueMicrotask(() => {
      if (!heldBy.isConnected) return;
      if (!this.host.nativeElement.contains(document.activeElement)) return; // no grab happened — leave it
      heldBy.focus({ preventScroll: true });
    });
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
      // ...and, for the async case the one-shot deliberately declines, arm the sibling marker: when the drop
      // lands later, Material redirects into a surviving sibling synchronously and unconditionally, which is a
      // steal if the user has moved on by then (#556). Harmless on the synchronous path — the item is gone by
      // the first effect run, and the witness gates find nothing to restore.
      this.pendingSiblingRemoval = { item };
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
