import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuTrigger, type MatMenuPanel } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { CaeMenuPanelHost, CaeTooltipPosition } from 'caelum/shared';

/** Appearance variants Caelum surfaces — 1:1 with Material's `matButton`. */
export type CaeButtonVariant = 'filled' | 'tonal' | 'elevated' | 'outlined' | 'text';

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
 * trigger is not applied at all (a plain button carries no spurious `aria-expanded`).
 */
@Component({
  selector: 'cae-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatTooltipModule, MatMenuTrigger],
  // Two branches, identical but for `matMenuTriggerFor`: the trigger is applied ONLY when a menu
  // is bound. MatMenuTrigger binds `aria-expanded` unconditionally (`"false"` when closed), so an
  // always-present trigger would announce every plain button as a collapsed disclosure — the
  // opt-in branch keeps plain buttons clean. Keep the two <button>s' shared bindings in sync.
  template: `
    @if (menuTriggerFor()) {
      <button
        [matButton]="variant()"
        [type]="type()"
        [disabled]="disabled()"
        [disabledInteractive]="disabledInteractive()"
        [matTooltip]="tooltip()"
        [matTooltipPosition]="tooltipPosition()"
        [matTooltipDisabled]="!tooltip()"
        [attr.aria-label]="ariaLabel() || null"
        [matMenuTriggerFor]="menuPanel()"
      >
        <ng-content />
      </button>
    } @else {
      <button
        [matButton]="variant()"
        [type]="type()"
        [disabled]="disabled()"
        [disabledInteractive]="disabledInteractive()"
        [matTooltip]="tooltip()"
        [matTooltipPosition]="tooltipPosition()"
        [matTooltipDisabled]="!tooltip()"
        [attr.aria-label]="ariaLabel() || null"
      >
        <ng-content />
      </button>
    }
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
   * button can't still fire. A bound `menuTriggerFor` is likewise still openable while
   * interactive-disabled (its click belongs to `MatMenuTrigger`, not you) — unbind it to block that:
   * `[menuTriggerFor]="busy ? undefined : menu"` (Book 16 a11y).
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
