import { Directive } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * `caeTooltip` — the Direct (1:1) wrapper over Material's `matTooltip`
 * (`reference/COMPARISON.md`: `pTooltip` → `caeTooltip`). An attribute directive, not a
 * component: it composes `MatTooltip` as a `hostDirective` and re-exposes its inputs under
 * the `cae*` names, so a team leaving PrimeNG writes `caeTooltip="…"` on any element
 * without binding to Material directly (D-01/D-02; Book 09). Zero logic — the aliasing is
 * the whole wrapper, so behaviour and a11y are Material's, unchanged.
 *
 * a11y contract (inherited from `MatTooltip`): apply `caeTooltip` to the **focusable,
 * interactive element itself** (a `<button>`, `<a>`, or an element with `tabindex`). The
 * tooltip shows on hover/focus of its host and sets `aria-describedby` on that host, so a
 * tooltip placed on a non-focusable wrapper (e.g. the host of `<cae-button>`, whose real
 * `<button>` is nested) is pointer-only and never announced to keyboard / screen-reader
 * users. For a wrapper component, use its own forwarding seam instead — `cae-button` exposes
 * a `tooltip` input that binds `MatTooltip` to its inner focusable `<button>` (#36). Never
 * make a tooltip the *sole* source of essential information.
 */
@Directive({
  selector: '[caeTooltip]',
  hostDirectives: [
    {
      directive: MatTooltip,
      inputs: [
        'matTooltip: caeTooltip',
        'matTooltipPosition: caeTooltipPosition',
        'matTooltipDisabled: caeTooltipDisabled',
        'matTooltipShowDelay: caeTooltipShowDelay',
        'matTooltipHideDelay: caeTooltipHideDelay',
      ],
    },
  ],
})
export class CaeTooltip {}
