import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

/**
 * `cae-switch` — the Direct (1:1) wrapper over Material's `mat-slide-toggle`
 * (`reference/COMPARISON.md`: `p-toggleSwitch` / `p-inputSwitch` → `cae-switch`). A real form
 * control: it is a `ControlValueAccessor`, so `[(ngModel)]` and `[formControl]` bind to it exactly
 * as they did to `p-toggleSwitch` (Book 07 §3.1). The value seam is CVA — not a `model()` — to
 * match the PrimeNG migration target. Reactive-forms disabling (`setDisabledState`) is merged with
 * the template `disabled` input. Zoneless-compatible: `OnPush` + signal state, no zone-coupled
 * APIs (provisional on #9; Book 01 §3.2).
 *
 * Like `cae-checkbox`, a switch is not a `MatFormFieldControl`, so it has no built-in `<mat-error>`;
 * for validation feedback the consumer renders the message and points `ariaDescribedby` at it
 * (Caelum's consumer-owned error pattern for non-form-field controls, #47). It's forwarded to the
 * focusable inner `<button role="switch">` (Material's `aria-describedby` seam).
 */
@Component({
  selector: 'cae-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSlideToggleModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeSwitch), multi: true },
  ],
  template: `
    <mat-slide-toggle
      [checked]="checked()"
      [disabled]="isDisabled()"
      [required]="required()"
      [labelPosition]="labelPosition()"
      [aria-describedby]="$any(ariaDescribedby() || null)"
      (change)="handleChange($event.checked)"
      (focusout)="onTouched()"
    >
      <ng-content />
    </mat-slide-toggle>
  `,
})
export class CaeSwitch implements ControlValueAccessor {
  /** Marks the control required (drives Material's `aria-required`). */
  readonly required = input(false, { transform: booleanAttribute });
  /** Label side relative to the toggle, 1:1 with Material. */
  readonly labelPosition = input<'before' | 'after'>('after');
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * `id`(s) of element(s) describing the control — the a11y hook for a consumer-owned error or
   * hint (see the class docstring and `cae-checkbox`). Forwarded to the focusable inner
   * `<button role="switch">`, read by a screen reader on focus; pair with a form-level live region
   * for submit.
   * (`$any` in the template bridges Material's `aria-describedby` input, typed `string`, so an
   * empty value passes `null` and the attribute is dropped rather than rendered empty.)
   */
  readonly ariaDescribedby = input('');

  protected readonly checked = signal(false);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  private onChangeFn: (value: boolean) => void = () => {};
  protected onTouched: () => void = () => {};

  protected handleChange(value: boolean): void {
    this.checked.set(value);
    this.onChangeFn(value);
  }

  // --- ControlValueAccessor ---
  writeValue(value: boolean): void {
    this.checked.set(!!value);
  }
  registerOnChange(fn: (value: boolean) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
