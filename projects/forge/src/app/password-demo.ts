import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { CaeCard } from 'caelum/card';
import { CaePassword } from 'caelum/password';

/**
 * The deferred "Password" `cae-password` demo (#304) — the input family's component member with a
 * visibility toggle + advisory strength meter (sibling of `cae-input-number` #301 and `cae-input-otp`
 * #303). It shows the control end-to-end AND makes the acceptance-critical split visible (Book 08 §3.5):
 * the strength meter is a HINT, while the ENFORCED rule (at least 8 characters) lives on the form's
 * `Validators` — so the field stays invalid, and the inherited #29/#47 error bridge shows the message,
 * until that rule passes, whatever colour the meter reads.
 *
 * `@defer`'d from App (#85): the control + its Material form-field imports ride their own lazy chunk off
 * Forge's initial bundle (the #142 / D-16 budget), like the other below-the-fold demos.
 */
@Component({
  selector: 'app-password-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CaeCard, CaePassword],
  templateUrl: './password-demo.html',
  styleUrl: './password-demo.scss',
})
export class PasswordDemo {
  /** The ENFORCED policy lives here, on the form's validators — the meter is only a hint (Book 08 §3.5). */
  protected readonly password = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(8)],
  });

  /** Error-key → message map for the inherited #29/#47 error bridge. */
  protected readonly errorMessages = {
    required: 'A password is required',
    minlength: 'Use at least 8 characters',
  };

  /** Reactive views of the control for the readout (OnPush-safe). */
  protected readonly value = toSignal(this.password.valueChanges, { initialValue: '' });
  protected readonly status = toSignal(this.password.statusChanges, {
    initialValue: this.password.status,
  });
  /** True while a started-but-too-short password fails the ENFORCED rule (whatever the meter hints). */
  protected readonly tooShort = computed(() => {
    const v = this.value();
    return v.length > 0 && v.length < 8;
  });
}
