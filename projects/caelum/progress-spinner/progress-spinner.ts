import { ChangeDetectionStrategy, Component, input, numberAttribute } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

/** The mode of {@link CaeProgressSpinner}. */
export type CaeProgressSpinnerMode = 'determinate' | 'indeterminate';

/**
 * `cae-progress-spinner` — the Direct (1:1) wrapper over Material's `mat-progress-spinner`
 * (`reference/COMPARISON.md`: `p-progressspinner` → `cae-progress-spinner`; Book 11). A circular
 * progress indicator. Not a form control — no CVA.
 *
 * Defaults to **`indeterminate`** (a continuously spinning loader), matching PrimeNG's
 * `p-progressSpinner` — a deliberate flip from Material's own `mat-progress-spinner` default of
 * `determinate` (Material reserves the indeterminate default for its bare `mat-spinner` selector).
 * Set `mode="determinate"` + `value` for a percentage ring.
 *
 * The inner host is `role="progressbar"` (`aria-valuenow` bound only when `determinate`). Material
 * provides no accessible name → pass `ariaLabel` (e.g. `"Loading"`). `strokeWidth` defaults to `0`
 * meaning *auto* (`diameter / 10`); this wrapper computes the auto value in the template rather than
 * relying on Material's `value || 0` setter, which would otherwise collapse an explicit `0`.
 *
 * No `color` input (token-bridge theming). Zoneless-compatible: `OnPush` + signal inputs
 * (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-progress-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressSpinner],
  template: `
    <mat-progress-spinner
      [mode]="mode()"
      [value]="value()"
      [diameter]="diameter()"
      [strokeWidth]="strokeWidth() || diameter() / 10"
      [attr.aria-label]="ariaLabel() || null"
    />
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class CaeProgressSpinner {
  /** Progress value, 0–100. Only used in `determinate` mode. */
  readonly value = input(0, { transform: numberAttribute });
  /** `indeterminate` (default, `p-progressSpinner` parity) · `determinate`. */
  readonly mode = input<CaeProgressSpinnerMode>('indeterminate');
  /** Outer diameter in px (default 48). */
  readonly diameter = input(48, { transform: numberAttribute });
  /** Ring stroke width in px; `0` (default) = auto (`diameter / 10`). */
  readonly strokeWidth = input(0, { transform: numberAttribute });
  /** Accessible name for the spinner (`role=progressbar` needs one — Material provides none). */
  readonly ariaLabel = input('');
}
