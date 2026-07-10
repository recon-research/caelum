import { ChangeDetectionStrategy, Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { CaeCard } from 'caelum/card';
import { CaeInputMask } from 'caelum/input-mask';

/**
 * The deferred "Input mask" `cae-input-mask` demo (#302) — the input family's last member and
 * fourth sibling of `cae-input-number` #301, `cae-input-otp` #303, and `cae-password` #304. It
 * shows the control end-to-end AND makes the acceptance-critical **model/view split** visible
 * (Book 08 §2.2): the field displays the *masked* view (`(212) 555-0142`) while the form stores
 * the **unmasked** value (`2125550142`) — the readout prints exactly what a backend would receive,
 * so the split isn't a claim but something you can watch as you type. The enforced "all 10 digits"
 * rule lives on the form's `Validators` and surfaces through the inherited #29/#47 error bridge.
 *
 * `@defer`'d from App (#85): the control + its Material form-field imports ride their own lazy chunk
 * off Forge's initial bundle (the #142 / D-16 budget), like the other below-the-fold demos.
 */
@Component({
  selector: 'app-input-mask-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CaeCard, CaeInputMask],
  templateUrl: './input-mask-demo.html',
  styleUrl: './input-mask-demo.scss',
})
export class InputMaskDemo {
  /** The enforced policy lives here on the form's validators; the mask only shapes the view. */
  protected readonly phone = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(10)],
  });

  /** Error-key → message map for the inherited #29/#47 error bridge. */
  protected readonly errorMessages = {
    required: 'A phone number is required',
    minlength: 'Enter all 10 digits',
  };

  /** Reactive views of the control for the readout (OnPush-safe). `value()` is the UNMASKED model. */
  protected readonly value = toSignal(this.phone.valueChanges, { initialValue: '' });
  protected readonly status = toSignal(this.phone.statusChanges, {
    initialValue: this.phone.status,
  });
}
