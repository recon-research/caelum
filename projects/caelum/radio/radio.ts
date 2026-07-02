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
import { MatRadioModule } from '@angular/material/radio';

/** Per-instance counter for the fallback group name (see `name` below). */
let nextUniqueId = 0;

/** A single choice in a `cae-radio` group. */
export interface CaeRadioOption {
  /** The value bound into the form when this option is selected. */
  value: string;
  /** Visible label. */
  label: string;
  /** Disable just this option (the group can also be disabled as a whole). */
  disabled?: boolean;
}

/**
 * `cae-radio` — the Direct (1:1) wrapper over Material's `mat-radio-group`
 * (`reference/COMPARISON.md`: `p-radiobutton` → `cae-radio`). Establishes the
 * grouped-options + name-propagation pattern: options are data (`CaeRadioOption[]`), and
 * the group is a real form control via `ControlValueAccessor`, so `[(ngModel)]` /
 * `[formControl]` bind the selected value exactly as they did to a PrimeNG radio group
 * (Book 07 §3.1). The CVA value seam (a string) — not a `model()` — matches the PrimeNG
 * migration target. Setting `name` propagates to the native `<input>`s (native grouping /
 * autofill); selection itself is coordinated by the group. Template `disabled` merges
 * with reactive-forms `setDisabledState`. Zoneless-compatible: `OnPush` + signal state, no
 * zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-radio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatRadioModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeRadio), multi: true }],
  template: `
    <mat-radio-group
      [value]="value()"
      [name]="name() || uid"
      [disabled]="isDisabled()"
      [required]="required()"
      [labelPosition]="labelPosition()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-labelledby]="ariaLabelledby() || null"
      (change)="handleChange($event.value)"
      (focusout)="onTouched()"
    >
      @for (option of options(); track option.value) {
        <mat-radio-button [value]="option.value" [disabled]="option.disabled ?? false">
          {{ option.label }}
        </mat-radio-button>
      }
    </mat-radio-group>
  `,
  styles: `
    :host {
      display: block;
    }
    mat-radio-group {
      display: flex;
      flex-direction: column;
    }
  `,
})
export class CaeRadio implements ControlValueAccessor {
  /**
   * A stable, unique fallback group name. Material coordinates radios globally by name,
   * so an empty name would make two unnamed `cae-radio` groups collide (selecting in one
   * clears the other). Used only when `name` is not set.
   */
  protected readonly uid = `cae-radio-${nextUniqueId++}`;

  /** The selectable options, as data. */
  readonly options = input<readonly CaeRadioOption[]>([]);
  /** Native `name`; propagates to each radio's `<input>`. Falls back to a unique id. */
  readonly name = input('');
  /** Marks the group required (drives Material's `aria-required`). */
  readonly required = input(false, { transform: booleanAttribute });
  /** Label side relative to each radio, 1:1 with Material. */
  readonly labelPosition = input<'before' | 'after'>('after');
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Accessible name for the group when no visible label wraps it. */
  readonly ariaLabel = input('');
  /** `id` of a visible element that labels the group (preferred when a label is shown). */
  readonly ariaLabelledby = input('');

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
