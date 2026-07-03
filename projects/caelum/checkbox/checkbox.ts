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
 *
 * Like `cae-radio`, a checkbox is not a `MatFormFieldControl`, so it has no built-in
 * `<mat-error>`; for validation feedback the consumer renders the message and points
 * `ariaDescribedby` at it (Caelum's consumer-owned error pattern for non-form-field controls,
 * #47). It's forwarded to the focusable inner `<input>` (Material's `aria-describedby` seam).
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
      [aria-label]="$any(ariaLabel() || null)"
      [aria-labelledby]="$any(ariaLabelledby() || null)"
      [aria-describedby]="$any(ariaDescribedby() || null)"
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
  /**
   * Accessible name for the control in the **label-less** case — when no visible label is projected
   * (e.g. a settings row whose descriptive text is a separate DOM element, a common switch/checkbox
   * pattern). Forwarded to Material's own `aria-label` input, which lands it on the focusable inner
   * `<input>` (the wrapper `<cae-checkbox>` isn't focusable, so a host `aria-label` would be
   * ignored by AT — hence forwarding it here, #70). Prefer a projected label (the default) whenever
   * one is shown: setting `ariaLabel` (or `ariaLabelledby`) alongside a visible label overrides it as
   * the accessible name, a WCAG 2.5.3 "label in name" mismatch — use one or the other. When both
   * naming inputs are set, `ariaLabelledby` wins over `ariaLabel` (WAI-ARIA precedence).
   * (`$any` with `|| null` bridges Material's aria inputs, which are typed inconsistently across
   * controls, and drops an empty value so the attribute is not rendered blank.)
   */
  readonly ariaLabel = input('');
  /**
   * `id` of a visible element that names the control — the preferred label-less seam when the naming
   * text already lives in the DOM (e.g. the settings-row heading). Forwarded to Material's
   * `aria-labelledby` input onto the focusable inner `<input>`. See `ariaLabel` for when to reach for
   * each; mirrors `cae-radio`'s naming seam (#70).
   */
  readonly ariaLabelledby = input('');
  /**
   * `id`(s) of element(s) describing the control — the a11y hook for a consumer-owned error or
   * hint (see the class docstring and `cae-radio`). Forwarded to the focusable inner `<input>`,
   * where a screen reader reads it on focus; pair with a form-level live region for submit.
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
