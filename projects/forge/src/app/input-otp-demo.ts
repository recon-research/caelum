import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CaeCard } from 'caelum/card';
import { CaeInputOtp } from 'caelum/input-otp';

/**
 * The deferred "One-time code" `cae-input-otp` demo (#303) — the segmented member of the M3 input
 * family (sibling of `cae-input-number` #301). It shows the control end-to-end: a 6-cell numeric code
 * whose model is a single `string` (the live readout proves the recompose — type, Backspace, or paste
 * the whole code into any cell and the one value tracks it), plus a 4-cell alphanumeric variant
 * (`integerOnly=false`) for a product-serial style field.
 *
 * `@defer`'d from App (#85): the control rides its own lazy chunk off Forge's initial bundle, like the
 * other below-the-fold demos.
 */
@Component({
  selector: 'app-input-otp-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CaeCard, CaeInputOtp],
  templateUrl: './input-otp-demo.html',
  styleUrl: './input-otp-demo.scss',
})
export class InputOtpDemo {
  /** The 6-digit code — a single string model recomposed from the cells. */
  protected readonly code = signal('');
  /** A 4-character alphanumeric serial (the `integerOnly=false` variant). */
  protected readonly serial = signal('');

  /** Whether all six digits are entered (completeness is the consumer's call, not the control's). */
  protected readonly complete = computed(() => this.code().length === 6);

  /** Per-cell accessible name for the numeric field — "Digit N of M" reads better than the default
   * "Character N of M" (demonstrates the `cellAriaLabel` override the a11y review recommended). */
  protected readonly digitLabel = (index: number, length: number): string =>
    `Digit ${index + 1} of ${length}`;
}
