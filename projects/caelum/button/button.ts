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
 * otherwise announce every plain button as a collapsed disclosure. Exported only so Angular accepts
 * it in {@link CaeButton}'s `imports`; deliberately kept out of `public-api.ts` (a consumer binds
 * `cae-button`'s `menuTriggerFor` input and never names a Material type — D-01/D-02).
 *
 * **Why `hostDirectives` and not a sibling directive.** A directive's own `host` block is applied
 * *after* its `hostDirectives`', so this binding out-ranks the composed `MatMenuTrigger`'s for the
 * same attribute — an ordering the framework constructs from the host-directive index block. The
 * two cheaper-looking routes both fail here: a template `[attr.aria-expanded]` binding **loses** to
 * a directive's host binding, and a *sibling* directive wins only by `tView.directiveRegistry`
 * order, which flips when the `imports` array is reordered. Measured on a throwaway branch, not
 * assumed (#993; `docs/PATTERNS.md` §4 carries the table).
 *
 * **This is deliberately smaller than `caeMenuTriggerFor`, and the asymmetry is the finding.** That
 * one overrides *two* attributes, guards `open()`/`toggle()`, and closes an open panel when it goes
 * dead. None of those are needed here, because there deadness is a separate input and `trigger.menu`
 * is *never* null (`cae-menu` stamps its `<mat-menu>` unconditionally, #993/D-859), whereas here the
 * panel **is** the discriminator. Each was written first and then measured away:
 * - `aria-haspopup` — Material's own `menu ? "menu" : null` already yields the right value in both
 *   states. Note *why* an override is not merely redundant: these bindings write through per-slot
 *   change detection, so a duplicate only wins on ticks where **its own** value changed, and never
 *   restores what the 3p's later write removed. Copying the menu family's host block over here
 *   would be a silent regression, not a simplification.
 * - `aria-controls` (`menuOpen ? menu?.panelId : null`) can never fire on a trigger that cannot open.
 * - closing an open panel on unbind — `MatMenuTriggerBase`'s `_menu` setter already calls
 *   `_destroyMenu()` when set to null (`menu.mjs`, the `else` branch). The menu family cannot reach
 *   that path, which is exactly why it must close by hand.
 *
 * Each removal was confirmed by mutation, not by reading: deleting the guard changed no assertion.
 * The behaviours are still pinned by `button.spec.ts` — they are Material's to provide now, so the
 * arms are what would catch a Material change taking them away.
 *
 * The static `mat-mdc-menu-trigger` class now lands on every `cae-button` — Material ships no rules
 * for it (it is an integration hook, not a style hook), and nothing in this repo selects on it.
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
export class CaeButtonMenuTrigger {
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
