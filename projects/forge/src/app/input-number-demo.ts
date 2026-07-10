import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CaeCard } from 'caelum/card';
import { CaeInputNumber } from 'caelum/input-number';

/**
 * The deferred "Numeric input" `cae-input-number` demo (#301) — the first member of the M3 input
 * family (mask/otp/password follow in #302–#304). It shows the control end-to-end and makes the
 * model/view split visible (Book 08 §2.2): the **same** `quantity` number model is bound to two
 * fields — one `en-US`, one `de-DE` — so editing either shows the other reformat in its own locale
 * while the model stays a real `number` (the live readout proves `typeof` — never a `"1,234"`
 * string). A third field runs currency mode.
 *
 * `@defer`'d from App (#85): the control + its Material form-field imports ride their own lazy chunk
 * off Forge's initial bundle (the #142 / D-16 budget), like the other below-the-fold demos.
 */
@Component({
  selector: 'app-input-number-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CaeCard, CaeInputNumber],
  templateUrl: './input-number-demo.html',
})
export class InputNumberDemo {
  /** One number model, shown formatted in two locales below — editing either edits this. */
  protected readonly quantity = signal<number | null>(1234.5);
  /** Currency-mode model (USD). */
  protected readonly price = signal<number | null>(19.99);

  /** Proof the model is a real number, not the formatted string (Book 08 §2.2). */
  protected readonly quantityType = computed(() =>
    this.quantity() === null ? 'null' : typeof this.quantity(),
  );
}
