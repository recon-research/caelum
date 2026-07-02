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
import { MatInput, MatInputModule } from '@angular/material/input';
import { Subscription } from 'rxjs';
import type { CaeErrorMessages, CaeFormFieldAppearance } from 'caelum/shared';

/**
 * Text-like input types this control accepts. Deliberately excludes `number`: the CVA
 * value seam is a string, and a numeric model belongs to a dedicated numeric control
 * (Book 08, a batch-2+ component) that preserves `number` via coercion.
 */
export type CaeInputType = 'text' | 'email' | 'password' | 'tel' | 'url' | 'search';

/**
 * `cae-input` — the Direct (1:1) wrapper over a `matInput` inside a `mat-form-field`
 * (`reference/COMPARISON.md`: `pInputText` → `cae-input`). A real form control via
 * `ControlValueAccessor`, so `[(ngModel)]`/`[formControl]` bind to it like `pInputText`
 * (Book 07 §3.1). Native input attributes a real form needs (`autocomplete`, `name`,
 * `readonly`, `maxlength`, `inputmode`) are forwarded to the inner `<input>`, since a
 * component wrapper hides the element `pInputText` exposed directly. IME composition is
 * buffered (onChange fires on `compositionend`, not on the intermediate keystrokes) to
 * match Angular's `DefaultValueAccessor`.
 *
 * **Validation errors (#29).** Because the CONSUMER binds their control to the outer
 * `<cae-input>`, the inner `matInput` has no `NgControl` and so its error state stays
 * inert (Book 07 §3.3). This control self-injects the outer `NgControl`, bridges its error
 * state into the inner field with a per-control `ErrorStateMatcher` (delegating the *timing*
 * to the DI `ErrorStateMatcher` so every field — and any app-root override — agrees), and
 * drives `matInput.updateErrorState()` from the control's own events. `errorMessages` maps
 * validator keys → text, rendered as `<mat-error>` and linked via `aria-describedby` (so a
 * screen reader announces it when the field is focused; for submit-time announcement keep a
 * form-level live region, as Forge does). Material sets `aria-invalid` from the bridged error
 * state — except on an empty *required* field, where it suppresses `aria-invalid` by design
 * and `aria-required` conveys the requirement instead (Book 07 §3.3/§3.4).
 *
 * Theme + label association come free through Material and the token bridge.
 * Zoneless-compatible: `OnPush` + signal state, no zone-coupled APIs (provisional on #9;
 * Book 01 §3.2).
 */
@Component({
  selector: 'cae-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field [appearance]="appearance()">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      <input
        #inputEl
        matInput
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [required]="required()"
        [disabled]="isDisabled()"
        [errorStateMatcher]="errorStateMatcher"
        [attr.autocomplete]="autocomplete() || null"
        [attr.name]="name() || null"
        [attr.inputmode]="inputMode() || null"
        [attr.maxlength]="maxlength()"
        [attr.aria-label]="ariaLabel() || null"
        [attr.readonly]="readonly() ? '' : null"
        (input)="handleInput(inputEl.value)"
        (compositionstart)="onCompositionStart()"
        (compositionend)="onCompositionEnd(inputEl.value)"
        (blur)="onTouched()"
      />
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
export class CaeInput implements ControlValueAccessor, DoCheck {
  /** Floating label text; omitted → no label. Prefer over placeholder for a11y. */
  readonly label = input('');
  /** Native placeholder. Not an accessible name — set `label` or `ariaLabel` too. */
  readonly placeholder = input('');
  /** Assistive hint under the field; omitted → no hint. */
  readonly hint = input('');
  /** Input type. */
  readonly type = input<CaeInputType>('text');
  /**
   * Marks the field required (Material renders the required marker). Mirror the control's
   * `Validators.required`: this drives the marker, `aria-required`, AND Material's
   * empty-field `aria-invalid` suppression, so the validator and this input must agree or the
   * a11y state diverges.
   */
  readonly required = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Form-field appearance. Defaults to `outline`. */
  readonly appearance = input<CaeFormFieldAppearance>('outline');
  /**
   * Maps a bound control's validator error keys → the message shown when that error is
   * active (see `CaeErrorMessages`). Errors show on the library-wide trigger (invalid &&
   * (touched || form submitted)). An unmapped failure still styles the field invalid (and, on
   * a non-empty field, sets `aria-invalid`) but shows no text — so map every key you validate,
   * `required` especially, or a required-empty field is invalid to sighted users yet silent to
   * a screen reader (Material suppresses `aria-invalid` there; only the linked text announces).
   */
  readonly errorMessages = input<CaeErrorMessages>({});

  // --- Forwarded native attributes (a component wrapper hides the real <input>). ---
  /** `autocomplete` token — load-bearing for browser autofill + password managers. */
  readonly autocomplete = input('');
  /** `name` attribute (autofill grouping, native form submission). */
  readonly name = input('');
  /** `inputmode` hint for on-screen keyboards. */
  readonly inputMode = input('');
  /** `maxlength`; omit (null) for no limit. */
  readonly maxlength = input<number | null>(null);
  /** Accessible name when no visible `label` is used. */
  readonly ariaLabel = input('');
  /** Render read-only (value visible, not editable). */
  readonly readonly = input(false, { transform: booleanAttribute });

  protected readonly value = signal('');
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  /** True between `compositionstart`/`end` so onChange isn't spammed mid-IME. */
  private composing = false;

  private onChangeFn: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  // --- Validation-error forwarding (#29) ---
  /** The OUTER control bound to `<cae-input>` — the source of validity the inner field lacks. */
  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  /** Library-wide error-timing policy (Material's default, or a consumer app-root override). */
  private readonly defaultErrorMatcher = inject(ErrorStateMatcher);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** The inner MatInput directive — poked to recompute its (bridged) error state. */
  private readonly matInput = viewChild(MatInput);
  /** The control instance the error subscriptions are bound to (re-wired if it's swapped). */
  private wiredControl: AbstractControl | null = null;
  private errorSub?: Subscription;

  /**
   * Per-control matcher bound on the inner `<input matInput>`: it ignores the inner field's
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
    // The inner matInput skips this itself (it has no NgControl), and `submitted` changes emit
    // no control event — and resetForm() clears the model before `submitted`, so an event-only
    // refresh would latch stale (Book 07 §3.3). Cheap: updateErrorState emits only on a flip.
    this.matInput()?.updateErrorState();
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
    // One CD so ngDoCheck runs again with the inner MatInput resolved — syncs a control that
    // starts touched + invalid.
    this.cdr.markForCheck();
  }

  protected handleInput(value: string): void {
    // Skip while composing: don't fire onChange and don't rewrite `value()` (which
    // would re-bind [value] and can abort the IME composition in some browsers).
    if (this.composing) return;
    this.value.set(value);
    this.onChangeFn(value);
  }

  protected onCompositionStart(): void {
    this.composing = true;
  }

  protected onCompositionEnd(value: string): void {
    this.composing = false;
    this.handleInput(value);
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
