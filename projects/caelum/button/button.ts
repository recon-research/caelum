import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  Directive,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuTrigger, type MatMenuPanel } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { CaeMenuPanelHost, CaeTooltipPosition } from '@recon-research/caelum/shared';

/** Appearance variants Caelum surfaces — 1:1 with Material's `matButton`. */
export type CaeButtonVariant = 'filled' | 'tonal' | 'elevated' | 'outlined' | 'text';

/**
 * The internal seam that lets `cae-button` render **one** `<button>` instead of two arms (#992).
 * Composes `MatMenuTrigger` as a *host directive* and re-binds the one ARIA attribute that would
 * otherwise announce every plain button as a collapsed disclosure. **Not exported** — a same-file
 * reference satisfies {@link CaeButton}'s `imports`, so the seam cannot reach `public-api.ts` by
 * construction rather than by a convention someone has to remember (a consumer binds `cae-button`'s
 * `menuTriggerFor` and never names a Material type — D-01/D-02). Measured, because the sibling
 * comment in `menubar/public-api.ts` asserts the opposite: `ng build caelum` exits 0 without it.
 *
 * **Why `hostDirectives` and not a sibling directive.** A directive's own `host` block is applied
 * *after* its `hostDirectives`', so this binding out-ranks the composed `MatMenuTrigger`'s for the
 * same attribute — an ordering the framework constructs from the host-directive index block. Both
 * cheaper-looking routes fail: a template `[attr.aria-expanded]` binding **loses** to a host
 * binding, and a *sibling* directive wins only by `tView.directiveRegistry` order, which flips when
 * `imports` is reordered. The table, the control arms and the reproduction on this component live
 * in `docs/PATTERNS.md` §4 (#993/#992) — single-homed there, not restated here.
 *
 * **Deliberately smaller than `caeMenuTriggerFor`.** That one overrides *two* attributes, guards
 * `open()`/`toggle()`, and closes an open panel when it goes dead; three of those were written
 * here, mutation-tested **inert**, and deleted. The structural reason is that its discriminator is
 * a separate deadness input while `trigger.menu` is never null, whereas here the panel is the
 * discriminator — but note exactly what that discriminates: **bound vs unbound, not dead vs live.**
 * A `cae-menu` whose rows are all disabled resolves a panel perfectly well, so this seam has no
 * D-859 posture at all (#1002 — pre-existing, and true under the two-arm template too).
 *
 * Two corrections from the review of this slice, both worth keeping because each is a way the
 * reasoning above goes wrong if compressed:
 * - The per-slot change-detection hazard runs in **one** direction. A duplicate override whose
 *   value moves in lockstep with the 3p's is merely redundant. It becomes a *silent regression*
 *   only where the two expressions can diverge — copying **this** block into the menu family, whose
 *   deadness term makes its slot hold still while Material's moves. `docs/PATTERNS.md` §4 is the
 *   single home of that rule; an earlier draft of this comment stated it backwards.
 * - `_destroyMenu()` on the null-unbind path is **not** `closeMenu()`. It detaches synchronously
 *   with no exit animation, never emits the panel's own `closed`, and skips the
 *   `PANELS_TO_TRIGGERS` cleanup. Equivalent for ARIA and focus restoration — which is all this
 *   seam relies on — and no longer equivalent the day `cae-menu` grows a `(closed)` output.
 *
 * The static `mat-mdc-menu-trigger` class now lands on every `cae-button`. Material ships no CSS
 * for it and nothing in this repo selects on it — but it is `MatMenuHarness.hostSelector`, so a
 * *consumer's* `getAllHarnesses(MatMenuHarness)` now matches every `cae-button`, not just the ones
 * with a menu (#1003).
 */
@Directive({
  selector: '[caeButtonMenuTriggerFor]',
  // The panel arrives through the composed trigger's own input, re-exposed under a Caelum name.
  // Re-exposing it as `matMenuTriggerFor` would work identically and read as a Material binding in
  // the template — an invitation to "tidy up" by adding MatMenuTrigger to the component's
  // `imports`, which would make it a SIBLING and hand precedence to `imports` order (#993).
  hostDirectives: [
    { directive: MatMenuTrigger, inputs: ['matMenuTriggerFor: caeButtonMenuTriggerFor'] },
  ],
  host: {
    '[attr.aria-expanded]': 'trigger.menu ? trigger.menuOpen : null',
  },
})
class CaeButtonMenuTrigger {
  protected readonly trigger = inject(MatMenuTrigger);
}

/**
 * `cae-button` — the Direct (1:1) wrapper over Material's `matButton`
 * (`reference/COMPARISON.md`: `p-button` → `cae-button`). A thin, stable Caelum API
 * seam so a team leaving PrimeNG swaps `p-button` for `cae-button` without binding to
 * Material directly (D-01/D-02; Book 20 §2.1). Colours flow from the token bridge
 * (`--mat-sys-*` ← `--cae-*`), so there is nothing to theme here. Zoneless-compatible:
 * `OnPush` + signal inputs, no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 *
 * **Tooltip (a11y forwarding seam, #36).** `caeTooltip`/`matTooltip` attach to their *host*
 * element and set `aria-describedby` on it; placed on `<cae-button>` that host is the
 * non-focusable custom element, so the tooltip would be pointer-only and its description
 * would land off the real, focusable control (`caeTooltip`'s JSDoc documents that contract).
 * The `tooltip` input instead binds `MatTooltip` to the **inner `<button>`**, so it shows on
 * keyboard focus and describes the element a screen-reader user actually lands on — this is
 * the natural `<p-button pTooltip>` → `<cae-button tooltip>` swap (Book 09; Book 16 a11y).
 * An empty `tooltip` (the default) disables the directive: no listeners, no `aria-describedby`.
 * A tooltip must never be the *sole* source of essential information.
 *
 * **Menu (a11y forwarding seam, #57).** The sibling of the tooltip seam: `caeMenuTriggerFor`
 * likewise attaches its `MatMenuTrigger` (overlay, keyboard, `aria-haspopup`/`aria-expanded`)
 * to its *host*, so on a `<cae-button>` wrapper the menu would be pointer-only with its ARIA on
 * the wrong element. The `menuTriggerFor` input instead binds `MatMenuTrigger` to the **inner
 * `<button>`** — the natural `<p-menu>` + `<p-button>` → `<cae-menu>` + `<cae-button
 * [menuTriggerFor]>` swap. Bind a `cae-menu` instance directly; the button never names a Material
 * type (it reads the panel through the {@link CaeMenuPanelHost} seam). With no menu bound the
 * trigger is attached but **silent** — no `aria-haspopup`, no `aria-expanded`, no `aria-controls`,
 * and nothing to open — so a plain button is announced as a plain button
 * ({@link CaeButtonMenuTrigger}, #992).
 */
@Component({
  selector: 'cae-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatTooltipModule, CaeButtonMenuTrigger],
  // ONE button. The trigger is always attached and announces nothing until a menu is bound — see
  // CaeButtonMenuTrigger for why that needs a composing directive rather than a template binding.
  // This was two arms, identical but for `matMenuTriggerFor`, because Material binds `aria-expanded`
  // unconditionally (`"false"` when closed) and every plain button would have read as a collapsed
  // disclosure. The arms were also an element swap: flipping `menuTriggerFor` live→unbound destroyed
  // the focused <button> and built its replacement in the other arm, stranding focus on <body>
  // (WCAG 2.4.3, #992). One element cannot be swapped, so the strand goes with the branch.
  template: `
    <button
      [matButton]="variant()"
      [type]="type()"
      [disabled]="disabled()"
      [disabledInteractive]="disabledInteractive()"
      [matTooltip]="tooltip()"
      [matTooltipPosition]="tooltipPosition()"
      [matTooltipDisabled]="!tooltip()"
      [attr.aria-label]="ariaLabel() || null"
      [caeButtonMenuTriggerFor]="menuPanel()"
    >
      <ng-content />
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }
  `,
})
export class CaeButton {
  /** Material button appearance. Defaults to `filled` — the primary action. */
  readonly variant = input<CaeButtonVariant>('filled');
  /** Native button type; `submit` participates in an enclosing `<form>`. */
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /** Disable the button (coerced, so bare `<cae-button disabled>` works). */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Keep a *disabled* button focusable and hoverable so it can still surface its `tooltip`
   * (Material's `disabledInteractive`, #58). With both `disabled` and this set, the button drops
   * the native `disabled` attribute — which suppresses focus and pointer events — for
   * `aria-disabled="true"`: assistive tech still announces it disabled and it stays tabbable, but
   * hover/focus now reveal the tooltip explaining *why* (the `<p-button pTooltip disabled>` parity
   * case). Opt-in, default off. The action is NOT auto-suppressed — guard it (a `(click)` handler,
   * or the enclosing form's `(ngSubmit)`, as Forge's *Send invite* does) so an interactive-disabled
   * button can't still fire. A bound `menuTriggerFor` is the **exception that needs no guard**:
   * `MatMenuTrigger._openMenu()` returns early when its host carries `aria-disabled`
   * (`_triggerIsAriaDisabled()` reads the attribute), which is exactly what this mode sets — so the
   * menu refuses to open by click, by keyboard, and by a programmatic `openMenu()`, and unbinding it
   * is unnecessary. Measured against the installed `@angular/material` 22.0.3, not assumed (#978);
   * pinned by a behavioural arm in `button.spec.ts` (`Book 16 §3.3`).
   */
  readonly disabledInteractive = input(false, { transform: booleanAttribute });
  /** Accessible name — set for icon-only or otherwise ambiguously-labelled buttons. */
  readonly ariaLabel = input('');
  /**
   * Tooltip text, shown on hover **and keyboard focus** of the button and forwarded to the
   * inner focusable control as `aria-describedby`. Empty (default) attaches nothing. Note: a
   * *disabled* button is not focusable and swallows pointer events, so its tooltip won't
   * display visually (though the description still reaches a screen reader) — set
   * `disabledInteractive` to keep the disabled button focusable so its tooltip shows (#58).
   */
  readonly tooltip = input('');
  /** Placement of the tooltip relative to the button. */
  readonly tooltipPosition = input<CaeTooltipPosition>('below');
  /**
   * A `cae-menu` this button opens (#57). Binds Material's `MatMenuTrigger` to the inner
   * focusable `<button>`, so the menu is keyboard- and screen-reader-reachable and its
   * `aria-haspopup`/`aria-expanded` land on the real control. Unset (default) = a plain button.
   */
  readonly menuTriggerFor = input<CaeMenuPanelHost>();

  /**
   * The resolved Material panel of {@link menuTriggerFor}. An effect bridges the bound menu's
   * panel — a viewChild signal that resolves only after ITS view initialises — into this local
   * signal, mirroring the `caeMenuTriggerFor` directive. Reading that cross-component signal
   * directly in the template would re-wire reactively too (Angular tracks signal reads inside
   * template-invoked methods), but resolving it in an effect (which runs after change detection)
   * keeps the binding order-independent and sidesteps a possible dev-mode
   * ExpressionChangedAfterChecked when a consumer declares the menu *after* the button.
   * @internal
   */
  protected readonly menuPanel = signal<MatMenuPanel | null>(null);

  constructor() {
    effect(() => {
      this.menuPanel.set(this.menuTriggerFor()?.getMenuPanel() ?? null);
    });
  }
}
