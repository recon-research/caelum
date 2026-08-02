import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  type TemplateRef,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { CaeButtonVariant } from '@recon-research/caelum/button';
import { CaeIcon, type CaeIconName, type CaeItemIconContext } from '@recon-research/caelum/icon';
import {
  CaeMenu,
  caeMenuHasUsableItems,
  CaeMenuTrigger,
  type CaeMenuItem,
} from '@recon-research/caelum/menu';

/**
 * `cae-split-button` — a **composed** default-command button joined to a dropdown of
 * secondary actions (`reference/COMPARISON.md`: `p-splitButton` → `cae-split-button`;
 * `MatButton` + `MatMenu`, Compose; Book 09 §3.4). The common admin-toolbar pattern
 * "Save ▾ / Save and close / Save as draft" in one control:
 *
 * ```html
 * <cae-split-button label="Save" [model]="saveOptions"
 *   (primaryClick)="save()" (itemSelect)="run($event)" />
 * ```
 *
 * **Composition (M1 thesis).** Two native `<button matButton>` (owned here, so the joined
 * visual — squared inner corners, the toggle tucked 1px onto the primary — needs no
 * cross-boundary styling), plus an embedded `cae-menu` for the dropdown: the data-driven
 * `CaeMenuItem[]`, the `caeMenuTriggerFor` a11y seam (menu `aria-haspopup`/`aria-expanded` land
 * on the focusable toggle `<button>`), and its `(itemSelect)` output all come for free.
 *
 * **a11y.** Both halves are native, keyboard-operable `<button>`s. The primary is named by its
 * required {@link label}; the icon-only chevron toggle by {@link menuAriaLabel}. Both are
 * `type="button"` by default so the control never submits an enclosing `<form>` by accident —
 * set {@link type} to `submit` to opt the primary in (the toggle is always `button`). The two are
 * wrapped in a `role="group"` (name it with {@link ariaLabel}); the toggle is disabled whenever
 * {@link model} holds nothing the user could reach — empty, all-disabled, or every branch bottoming
 * out in disabled rows ({@link toggleDisabled}, #961). Theming is free via the token bridge (D-04).
 *
 * **Two shades of disabled, deliberately** (D-859, and the scope correction from #989's review). A
 * toggle that is dead *because its menu is empty* renders `disabledInteractive` — `aria-disabled`,
 * focusable, advertising no popup — so it stays discoverable and can never strand focus. A toggle
 * disabled because the consumer set {@link disabled} on the **whole control** stays *natively*
 * disabled, matching the primary half. D-859 is scoped to the first case ("a dead trigger — one
 * whose dropdown has nothing reachable behind it"), and applying it to the second produced a
 * genuinely bad state: `[disabled]="true"` left the primary out of the tab order while the toggle
 * stayed in it, so a control the consumer had switched off kept exactly one tab stop — on the half
 * that does nothing, with the labelled half unreachable. Both halves now leave together.
 *
 * **The two-branch template** (D-859). The toggle's dead arm is stamped separately rather than
 * switched by a binding, because `MatMenuTrigger` host-binds `attr.aria-expanded` to `menuOpen`
 * **unconditionally** — only `aria-haspopup` is nulled by a null menu — so one button would still
 * announce as a collapsed disclosure. (#993 asks whether `CaeMenuTrigger` could bind that away and
 * retire the branch at all three sites.) Prose lives here rather than in the template: template
 * comments ship in the FESM, JSDoc does not (PATTERNS §15). Unlike `cae-menubar`'s triggers this
 * toggle is **not** inside a `@for`, so the arm swap is the *only* thing that destroys it — which
 * makes this the component where the two-branch focus strand is genuinely isolable.
 *
 * **v1 scope** (#148): shared `variant`, a required `label`, an optional-submit primary, and a
 * data-driven menu. Icons follow the library convention (D-596, #644): a primary {@link icon}
 * glyph before the label, per-item `model[].icon` glyphs rendered by the embedded `cae-menu`,
 * and an {@link iconTemplate} escape hatch forwarded to it (wins over per-item glyphs).
 * **Nested submenus arrive for free** (#150): the dropdown IS a `cae-menu`, so any `model[]` item
 * with non-empty `items` renders as a submenu branch, to any depth, with no split-button-side
 * wiring. Remaining follow-ups — button-side extras (projected content, per-half appearance,
 * `disabledInteractive`, `(dropdownClick)`) **#149**; router links / commands on the shared item
 * model **#150**.
 *
 * Zoneless-compatible: `OnPush` + signal inputs (D-12).
 */
@Component({
  selector: 'cae-split-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, CaeMenu, CaeMenuTrigger, CaeIcon],
  template: `
    <div
      class="cae-split-button"
      role="group"
      [attr.aria-label]="ariaLabel() || null"
      (focusin)="onFocusIn($event)"
      (focusout)="onFocusOut($event)"
    >
      <button
        class="cae-split-button__primary"
        [matButton]="variant()"
        [type]="type()"
        [disabled]="disabled()"
        (click)="primaryClick.emit($event)"
      >
        @if (icon(); as name) {
          <cae-icon class="cae-split-button__icon" [name]="name" />
        }
        {{ label() }}
      </button>

      <cae-menu
        #menu
        [items]="model()"
        [iconTemplate]="iconTemplate()"
        (itemSelect)="itemSelect.emit($event)"
      />

      <!-- D-859 two-branches the toggle on deadness (PATTERNS §4, and the class doc for why).
           Deltas between the arms: the two deadness bindings + caeMenuTriggerFor. Nothing else
           may differ — the parity spec is the only guard. -->
      @if (toggleDisabled()) {
        <button
          class="cae-split-button__toggle"
          type="button"
          [matButton]="variant()"
          [disabled]="true"
          [disabledInteractive]="!disabled()"
          [attr.aria-label]="menuAriaLabel() || 'More actions'"
        >
          <!-- The registry's chevron-down (D-596/#644) replaced the hand-drawn duplicate this
               component carried since #148; aria-hidden on the host keeps the whole decorative
               wrapper out of the a11y tree (the toggle is named by menuAriaLabel). -->
          <cae-icon class="cae-split-button__chevron" name="chevron-down" aria-hidden="true" />
        </button>
      } @else {
        <button
          class="cae-split-button__toggle"
          type="button"
          [matButton]="variant()"
          [disabled]="false"
          [attr.aria-label]="menuAriaLabel() || 'More actions'"
          [caeMenuTriggerFor]="menu"
        >
          <cae-icon class="cae-split-button__chevron" name="chevron-down" aria-hidden="true" />
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .cae-split-button {
      display: inline-flex;
      align-items: stretch;
    }
    /* Square the corners where the two halves meet so they read as one joined control. */
    .cae-split-button__primary {
      border-start-end-radius: 0;
      border-end-end-radius: 0;
    }
    .cae-split-button__toggle {
      border-start-start-radius: 0;
      border-end-start-radius: 0;
      /* Icon-only: replace Material's wide text min-width (64px) with the density-INVARIANT --cae-target-min
         (24px) so the chevron toggle stays a tight square-ish button yet can never clamp below the WCAG 2.5.8
         (AA) 24px minimum. Same physical property as Material's rule (clean cascade); the component's
         view-encapsulation attribute out-specifies it. Height is Material's own button height (≥24px). (#456) */
      min-width: var(--cae-target-min);
      padding-inline: var(--cae-space-3);
      /* Tuck the toggle 1px onto the primary so the halves read as one joined control: for bordered
         variants (outlined/text) the two adjacent outlines collapse into a single seam rather than
         doubling; for filled they sit flush. The shared chevron marks the dropdown affordance. */
      margin-inline-start: -1px;
    }
    .cae-split-button__icon {
      margin-inline-end: var(--cae-space-2);
    }
    /* cae-icon draws at 1em of the local font-size; scale it to the 1.25em the toggle's
       chevron has always used. */
    .cae-split-button__chevron {
      font-size: 1.25em;
    }
  `,
})
export class CaeSplitButton {
  /** Primary (default-command) button text — **required**; it is the primary button's accessible name. */
  readonly label = input.required<string>();
  /**
   * Optional leading glyph for the **primary** button, by built-in name (`caelum/icon`
   * registry — D-596; the #149 icon bullet). Rendered decoratively (`aria-hidden`) before
   * {@link label}, which stays the accessible name. Dropdown items carry their own
   * `model[].icon` instead. Typed to autocomplete the built-in names while accepting any
   * `string` (validated at render by `cae-icon`, like `model[].icon`).
   */
  readonly icon = input<CaeIconName | (string & {}) | null>(null);
  /**
   * Dropdown items, as data (reuses `cae-menu`'s {@link CaeMenuItem}). A model with nothing
   * reachable in it disables the toggle — see {@link toggleDisabled}.
   */
  readonly model = input<readonly CaeMenuItem[]>([]);
  /** Material button appearance, shared by both halves. Defaults to `filled` — the primary action. */
  readonly variant = input<CaeButtonVariant>('filled');
  /**
   * Native `type` of the **primary** button. Defaults to `button` so a split-button inside a
   * `<form>` never submits by accident; set `submit` to make the primary the form's submit control.
   * The dropdown toggle is always `type="button"` (it only opens the menu).
   */
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /**
   * Disable the whole control (both halves; coerced, so bare `disabled` works).
   *
   * Both halves go *natively* disabled and leave the tab order together — deliberately **not** the
   * `aria-disabled` posture D-859 gives a toggle whose menu is merely empty. See the class doc:
   * D-859 is scoped to a dead dropdown, not to a consumer switching the control off.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Accessible name for the icon-only chevron toggle (falls back to `More actions` if cleared). */
  readonly menuAriaLabel = input('More actions');
  /** Optional accessible name for the button group as a whole. */
  readonly ariaLabel = input('');

  /** Emits the click event when the primary (default-command) button is activated. */
  readonly primaryClick = output<MouseEvent>();
  /** Emits the chosen item when a dropdown item is activated (delegated from `cae-menu`). */
  readonly itemSelect = output<CaeMenuItem>();
  /**
   * Consumer escape hatch for the dropdown's per-item icon slot, forwarded verbatim to the
   * embedded `cae-menu` (D-596): an `ng-template` receiving `{ $implicit: item, index }`,
   * stamped once per item *instead of* the built-in `model[].icon` glyphs — the template
   * wins whenever both are supplied. See `CaeMenu.iconTemplate` for the full contract.
   */
  readonly iconTemplate = input<TemplateRef<CaeItemIconContext<CaeMenuItem>> | null>(null);

  /**
   * Whether the chevron toggle is inert: the whole control is disabled, or its dropdown would open
   * onto nothing focusable — the family's no-dead-end rule (#961), asked with `cae-menu`'s own
   * predicate so the two cannot drift. This was `model().length === 0`, which covers only the
   * *empty* arm: a model of purely disabled items, or one whose branches all bottom out in disabled
   * rows (#962), is not empty, so the toggle stayed live and Material parked focus on a panel that
   * answers no key but Escape. A `computed` rather than an inline expression because the predicate
   * walks the whole model and the binding is read on every change detection.
   */
  protected readonly toggleDisabled = computed(
    () => this.disabled() || !caeMenuHasUsableItems(this.model()),
  );

  /** The toggle element that last held focus, captured on the way IN (see the effect below). */
  private focusWitness: HTMLElement | null = null;
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The rendered toggle, whichever of D-859's two arms produced it. */
  private toggleElement(): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('.cae-split-button__toggle');
  }

  protected onFocusIn(event: FocusEvent): void {
    // Read the toggle off the EVENT rather than a viewChild: `#toggleBtn` sits inside an @if, and
    // a view query for it did not resolve here in time to witness the focus (measured — the
    // witness came back null on every capture, so the restore below never armed).
    const target = event.target as HTMLElement | null;
    this.focusWitness = target?.closest<HTMLElement>('.cae-split-button__toggle') ?? null;
  }

  /**
   * Drop the witness when focus genuinely **leaves** the toggle, so a later swap cannot mistake a
   * stale witness for a stranded user (#989 review).
   *
   * Both gates in the restore below pass on a sequence they were never meant to admit: focus the
   * toggle, blur to the page background — `activeElement` is `<body>`, and no `focusin` reaches
   * this host, because a focus move *to* `<body>` fires at `body` and bubbles upward — then let the
   * model go empty. The witness is stale but intact, so focus is yanked back to a control the user
   * had left, announcing "unavailable" out of nowhere.
   *
   * `isConnected` is what keeps this from breaking the restore: if a browser fires `focusout` while
   * removing the focused element, the witness is already disconnected and the clear is skipped.
   * Only a departure from a *live* toggle counts as leaving.
   */
  protected onFocusOut(event: FocusEvent): void {
    const witness = this.focusWitness;
    if (!witness || !witness.isConnected) return;
    if (witness.contains(event.relatedTarget as Node)) return;
    this.focusWitness = null;
  }

  constructor() {
    /**
     * Keep focus on the toggle when it flips live↔dead (#977).
     *
     * D-859's two-branch template is what makes this necessary: the toggle going dead **destroys**
     * the focused `<button>` and builds its replacement in the other arm, so focus falls to
     * `<body>` — the strand D-859 set out to fix, arriving by a different route. Focus stays on the
     * toggle (now `aria-disabled`, hence still focusable) rather than jumping to the primary
     * button: a silent jump would put the user on a *different command*, which is worse than
     * landing somewhere announced unavailable.
     *
     * Keyed on {@link toggleDisabled} — the flip that swaps the arms — and deferred one render,
     * because until the view updates the DOM still holds the OLD button. Gated on the witness
     * being genuinely **disconnected**, not on `activeElement` alone: that cannot tell "our button
     * was destroyed" from "the user clicked the page background", and restoring in the second case
     * is a focus steal. Both gates are mutation-pinned, in both directions.
     */
    effect(() => {
      this.toggleDisabled(); // the dependency: this flip is what swaps the arms
      const witness = this.focusWitness;
      if (!witness) return;
      // The element is still the OLD one until the view updates, so the check has to wait a render.
      afterNextRender(
        () => {
          if (witness.isConnected) return;
          if (document.activeElement !== document.body) return;
          this.toggleElement()?.focus();
        },
        { injector: this.injector },
      );
    });
  }
}
