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
import { MatCheckboxModule } from '@angular/material/checkbox';

/**
 * `cae-checkbox` — the Direct (1:1) wrapper over Material's `mat-checkbox`
 * (`reference/COMPARISON.md`: `p-checkbox` → `cae-checkbox`). A real form control: it is
 * a `ControlValueAccessor`, so `[(ngModel)]` and `[formControl]` bind to it exactly as
 * they did to `p-checkbox` (Book 07 §3.1). The value seam is CVA — not a `model()` — to
 * match the PrimeNG migration target. Reactive-forms disabling (`setDisabledState`) is
 * merged with the template `disabled` input. Zoneless-compatible: `OnPush` + signal
 * state, no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckboxModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeCheckbox), multi: true },
  ],
  template: `
    <mat-checkbox
      [checked]="checked()"
      [disabled]="isDisabled()"
      [required]="required()"
      [labelPosition]="labelPosition()"
      (change)="handleChange($event.checked)"
      (focusout)="onTouched()"
    >
      <ng-content />
    </mat-checkbox>
  `,
})
export class CaeCheckbox implements ControlValueAccessor {
  /** Marks the control required (drives Material's `aria-required`). */
  readonly required = input(false, { transform: booleanAttribute });
  /** Label side relative to the box, 1:1 with Material. */
  readonly labelPosition = input<'before' | 'after'>('after');
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });

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
