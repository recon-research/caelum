import {
  booleanAttribute,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  DoCheck,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type AbstractControl, ControlValueAccessor, NgControl } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';
import type { CaeErrorMessages, CaeFormFieldAppearance } from 'caelum/shared';

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
 * and the token bridge.
 *
 * **Validation errors (#47, extending #29).** Because the CONSUMER binds their control to
 * the outer `<cae-select>`, the inner `mat-select` has no `NgControl` and so its error state
 * stays inert (Book 07 §3.3): `mat-select.ngDoCheck` only recomputes `updateErrorState()`
 * when it owns an `NgControl`. This control self-injects the outer `NgControl`, bridges its
 * error state into the inner field with a per-control `ErrorStateMatcher` (delegating the
 * *timing* to the DI `ErrorStateMatcher`, so every field — and any app-root override — agrees
 * with `cae-input`), and drives `matSelect.updateErrorState()` from `ngDoCheck`. `errorMessages`
 * maps validator keys → text, rendered as `<mat-error>` and linked via `aria-describedby`.
 * Note: unlike `matInput`, `mat-select` reflects the error state into `aria-invalid`
 * *unconditionally* (it has no empty-required suppression), so a required-empty select does
 * expose `aria-invalid="true"` — map `required` all the same so the announcement carries text.
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
export class CaeSelect implements ControlValueAccessor, DoCheck {
  /** The selectable options, as data. */
  readonly options = input<readonly CaeSelectOption[]>([]);
  /** Floating label text; omitted → no label. */
  readonly label = input('');
  /** Placeholder shown when nothing is selected. */
  readonly placeholder = input('');
  /** Assistive hint under the field; omitted → no hint. */
  readonly hint = input('');
  /**
   * Marks the field required (Material renders the required marker). Mirror the control's
   * `Validators.required`: this drives the marker and `aria-required`. (Unlike `cae-input`,
   * `mat-select` does not suppress `aria-invalid` on an empty required field, so mapping
   * `required` here is about the visible/announced message, not unblocking `aria-invalid`.)
   */
  readonly required = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Form-field appearance (shared with `cae-input`). Defaults to `outline`. */
  readonly appearance = input<CaeFormFieldAppearance>('outline');
  /** Accessible name when no visible `label` is used. */
  readonly ariaLabel = input('');
  /**
   * Maps a bound control's validator error keys → the message shown when that error is
   * active (see `CaeErrorMessages`). Errors show on the library-wide trigger (invalid &&
   * (touched || form submitted)) — identical to `cae-input`. An unmapped failure still styles
   * the field invalid but shows no text, so map every key you validate, `required` especially.
   */
  readonly errorMessages = input<CaeErrorMessages>({});

  protected readonly value = signal('');
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  private onChangeFn: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  // --- Validation-error forwarding (#47, mirroring cae-input #29) ---
  /** The OUTER control bound to `<cae-select>` — the source of validity the inner field lacks. */
  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  /** Library-wide error-timing policy (Material's default, or a consumer app-root override). */
  private readonly defaultErrorMatcher = inject(ErrorStateMatcher);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** The inner MatSelect — poked to recompute its (bridged) error state. */
  private readonly matSelect = viewChild(MatSelect);
  /** The control instance the error subscriptions are bound to (re-wired if it's swapped). */
  private wiredControl: AbstractControl | null = null;
  private errorSub?: Subscription;

  /**
   * Per-control matcher bound on the inner `<mat-select>`: it ignores the inner field's
   * (absent) control and evaluates the OUTER control, delegating the timing to the DI matcher
   * so the trigger is uniform library-wide and still overridable at the app root (Book 07 §3.3).
   */
  protected readonly errorStateMatcher: ErrorStateMatcher = {
    isErrorState: (_control, form) =>
      this.defaultErrorMatcher.isErrorState(this.ngControl?.control ?? null, form),
  };

  constructor() {
    // Self-injected CVA (no NG_VALUE_ACCESSOR provider) so this control can read the bound
    // NgControl's validity for error forwarding (Book 07 §4).
    if (this.ngControl) this.ngControl.valueAccessor = this;
  }

  ngDoCheck(): void {
    // (Re)wire the CD nudge whenever the bound control instance changes — the initial resolve,
    // a [formControl] swap, or form.setControl — tearing down the prior subscription.
    const control = this.ngControl?.control ?? null;
    if (control !== this.wiredControl) {
      this.wiredControl = control;
      this.wireErrorState(control);
    }
    // Recompute the bridged error state against the LIVE touched/submitted flags every check.
    // The inner mat-select skips this itself (it has no NgControl), and `submitted` changes emit
    // no control event — and resetForm() clears the model before `submitted`, so an event-only
    // refresh would latch stale (Book 07 §3.3). Cheap: updateErrorState emits only on a flip.
    this.matSelect()?.updateErrorState();
  }

  /** The mapped messages for the bound control's currently-active errors, in error order. */
  protected activeErrorMessages(): string[] {
    const errors = this.ngControl?.control?.errors;
    if (!errors) return [];
    const messages = this.errorMessages();
    const out: string[] = [];
    for (const key of Object.keys(errors)) {
      const entry = messages[key];
      if (entry == null) continue;
      out.push(typeof entry === 'function' ? entry(errors[key]) : entry);
    }
    return out;
  }

  private wireErrorState(control: AbstractControl | null): void {
    this.errorSub?.unsubscribe();
    this.errorSub = undefined;
    if (!control) return;
    // Programmatic changes (setValue/setErrors/markAsTouched) emit no DOM event, so in a
    // zoneless app nothing schedules change detection; nudge it so ngDoCheck recomputes the
    // error state and the <mat-error> text re-renders. DOM-driven changes (blur, submit) already
    // schedule CD. takeUntilDestroyed cleans up on destroy; the stored sub is torn down on swap.
    this.errorSub = control.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());
    // One CD so ngDoCheck runs again with the inner MatSelect resolved — syncs a control that
    // starts touched + invalid.
    this.cdr.markForCheck();
  }

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
