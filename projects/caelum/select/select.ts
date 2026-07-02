import { ChangeDetectionStrategy, Component, input, viewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { CaeFormFieldControlBase } from 'caelum/form-field';

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
 * matching the radio/checkbox blur semantics. Theme + label association come free through
 * Material and the token bridge.
 *
 * The `ControlValueAccessor`, the shared form-field inputs, and the validation-error
 * forwarding come from {@link CaeFormFieldControlBase} (#46; #47 first added the seam here) —
 * this class adds only the options list + change wiring. Because the inner `mat-select` has
 * no `NgControl` (the consumer binds the outer element), its `ngDoCheck` never recomputes
 * `updateErrorState()` on its own, so the base drives it via {@link updateInnerErrorState}.
 * Note: unlike `matInput`, `mat-select` reflects the error state into `aria-invalid`
 * *unconditionally* (no empty-required suppression), so a required-empty select does expose
 * `aria-invalid="true"` — map `required` all the same so the announcement carries text.
 *
 * Zoneless-compatible: `OnPush` + signal state (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
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
        [errorStateMatcher]="errorStateMatcher"
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
      @for (message of activeErrorMessages(); track $index) {
        <mat-error>{{ message }}</mat-error>
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
export class CaeSelect extends CaeFormFieldControlBase {
  /** The selectable options, as data. */
  readonly options = input<readonly CaeSelectOption[]>([]);

  /** The inner MatSelect — poked to recompute its (bridged) error state. */
  private readonly matSelect = viewChild(MatSelect);
  protected updateInnerErrorState(): void {
    this.matSelect()?.updateErrorState();
  }

  protected handleChange(value: string): void {
    this.commitValue(value);
  }
}
