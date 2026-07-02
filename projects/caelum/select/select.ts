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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import type { CaeFormFieldAppearance } from 'caelum/shared';

/** A single option in a `cae-select`. */
export interface CaeSelectOption {
  /** The value bound into the form when this option is chosen. */
  value: string;
  /** Visible label. */
  label: string;
  /** Disable just this option. */
  disabled?: boolean;
}

/**
 * `cae-select` — the Direct (1:1) wrapper over Material's `mat-select` inside a
 * `mat-form-field` (`reference/COMPARISON.md`: `p-select` → `cae-select`). Options are
 * data (`CaeSelectOption[]`); the control is a real `ControlValueAccessor`, so
 * `[(ngModel)]` / `[formControl]` bind the chosen value exactly as they did to `p-select`
 * (Book 07 §3.1). The CVA value seam (a string) — not a `model()` — matches the PrimeNG
 * migration target; single-select only (a multi-select surface is a later component).
 * Touched fires on `focusout` (leaving the trigger — whether or not the panel opened),
 * matching the radio/checkbox blur semantics. Template `disabled` merges with
 * reactive-forms `setDisabledState`. Theme + label association come free through Material
 * and the token bridge. Zoneless-compatible: `OnPush` + signal state (provisional on #9).
 */
@Component({
  selector: 'cae-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeSelect), multi: true },
  ],
  template: `
    <mat-form-field [appearance]="appearance()">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      <mat-select
        [value]="value()"
        [disabled]="isDisabled()"
        [required]="required()"
        [placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel() || null"
        (selectionChange)="handleChange($event.value)"
        (focusout)="onTouched()"
      >
        @for (option of options(); track option.value) {
          <mat-option [value]="option.value" [disabled]="option.disabled ?? false">
            {{ option.label }}
          </mat-option>
        }
      </mat-select>
      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
    </mat-form-field>
  `,
  styles: `
    :host,
    mat-form-field {
      display: block;
    }
  `,
})
export class CaeSelect implements ControlValueAccessor {
  /** The selectable options, as data. */
  readonly options = input<readonly CaeSelectOption[]>([]);
  /** Floating label text; omitted → no label. */
  readonly label = input('');
  /** Placeholder shown when nothing is selected. */
  readonly placeholder = input('');
  /** Assistive hint under the field; omitted → no hint. */
  readonly hint = input('');
  /** Marks the field required (Material renders the required marker). */
  readonly required = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Form-field appearance (shared with `cae-input`). Defaults to `outline`. */
  readonly appearance = input<CaeFormFieldAppearance>('outline');
  /** Accessible name when no visible `label` is used. */
  readonly ariaLabel = input('');

  protected readonly value = signal('');
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  private onChangeFn: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  protected handleChange(value: string): void {
    this.value.set(value);
    this.onChangeFn(value);
  }

  // --- ControlValueAccessor ---
  writeValue(value: string): void {
    this.value.set(value ?? '');
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
