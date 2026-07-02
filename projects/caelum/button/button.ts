import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { CaeTooltipPosition } from 'caelum/shared';

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
 * Forwarding `caeMenuTriggerFor` to the inner button is the same seam, tracked separately.
 * A tooltip must never be the *sole* source of essential information.
 */
@Component({
  selector: 'cae-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatTooltipModule],
  template: `
    <button
      [matButton]="variant()"
      [type]="type()"
      [disabled]="disabled()"
      [matTooltip]="tooltip()"
      [matTooltipPosition]="tooltipPosition()"
      [matTooltipDisabled]="!tooltip()"
      [attr.aria-label]="ariaLabel() || null"
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
  /** Accessible name — set for icon-only or otherwise ambiguously-labelled buttons. */
  readonly ariaLabel = input('');
  /**
   * Tooltip text, shown on hover **and keyboard focus** of the button and forwarded to the
   * inner focusable control as `aria-describedby`. Empty (default) attaches nothing. Note: a
   * *disabled* button is not focusable and swallows pointer events, so its tooltip won't
   * display visually (though the description still reaches a screen reader) — don't rely on it
   * as the sole explanation of a disabled state (a `disabledInteractive` seam is #58).
   */
  readonly tooltip = input('');
  /** Placement of the tooltip relative to the button. */
  readonly tooltipPosition = input<CaeTooltipPosition>('below');
}
