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
 * `cae-textarea` — the Direct (1:1) wrapper over a `matInput` `<textarea>` inside a
 * `mat-form-field` (`reference/COMPARISON.md`: `pTextarea` → `cae-textarea`). The
 * multi-line sibling of `cae-input`: a real `ControlValueAccessor` (string value seam,
 * not a `model()`) so `[(ngModel)]` / `[formControl]` bind exactly as they did to
 * `pTextarea` (Book 07 §3.1). Native attributes a real form needs (`name`, `readonly`,
 * `maxlength`) are forwarded to the inner `<textarea>`, and IME composition is buffered
 * (onChange fires on `compositionend`, matching Angular's `DefaultValueAccessor`).
 *
 * **Validation errors (#29).** Same seam as `cae-input`: the inner `matInput` has no
 * `NgControl`, so this control self-injects the OUTER control, bridges its error state via a
 * per-control `ErrorStateMatcher` (timing delegated to the DI matcher for library-wide
 * uniformity), drives `matInput.updateErrorState()` from the control's events, and renders
 * `errorMessages` as `<mat-error>` linked via `aria-describedby` (announced on focus; keep a
 * form-level live region for submit-time announcement). Material sets `aria-invalid` from the
 * bridged state, except on an empty *required* field where it suppresses it by design and
 * `aria-required` conveys the requirement (Book 07 §3.3/§3.4).
 *
 * Zoneless-compatible: `OnPush` + signal state (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field [appearance]="appearance()">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      <textarea
        #textareaEl
        matInput
        [value]="value()"
        [rows]="rows()"
        [placeholder]="placeholder()"
        [required]="required()"
        [disabled]="isDisabled()"
        [errorStateMatcher]="errorStateMatcher"
        [attr.name]="name() || null"
        [attr.maxlength]="maxlength()"
        [attr.aria-label]="ariaLabel() || null"
        [attr.readonly]="readonly() ? '' : null"
        (input)="handleInput(textareaEl.value)"
        (compositionstart)="onCompositionStart()"
        (compositionend)="onCompositionEnd(textareaEl.value)"
        (blur)="onTouched()"
      ></textarea>
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
    textarea {
      resize: vertical;
    }
  `,
})
export class CaeTextarea implements ControlValueAccessor, DoCheck {
  /** Floating label text; omitted → no label. Prefer over placeholder for a11y. */
  readonly label = input('');
  /** Native placeholder. Not an accessible name — set `label` or `ariaLabel` too. */
  readonly placeholder = input('');
  /** Assistive hint under the field; omitted → no hint. */
  readonly hint = input('');
  /** Visible rows (the textarea's initial height). */
  readonly rows = input(3);
  /**
   * Marks the field required (Material renders the required marker). Mirror the control's
   * `Validators.required`: this drives the marker, `aria-required`, AND Material's
   * empty-field `aria-invalid` suppression, so the validator and this input must agree or the
   * a11y state diverges.
   */
  readonly required = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Form-field appearance (shared with `cae-input`). Defaults to `outline`. */
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

  // --- Forwarded native attributes (a component wrapper hides the real <textarea>). ---
  /** `name` attribute (native form submission grouping). */
  readonly name = input('');
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

  // --- Validation-error forwarding (#29); see cae-input for the full rationale. ---
  /** The OUTER control bound to `<cae-textarea>` — the source of validity the inner field lacks. */
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
   * Per-control matcher bound on the inner `<textarea matInput>`: it evaluates the OUTER
   * control, delegating timing to the DI matcher so the trigger is uniform library-wide and
   * still overridable at the app root (Book 07 §3.3).
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
    // (Re)wire the CD nudge when the bound control instance changes, then recompute the bridged
    // error state against the live touched/submitted flags every check; see cae-input.
    const control = this.ngControl?.control ?? null;
    if (control !== this.wiredControl) {
      this.wiredControl = control;
      this.wireErrorState(control);
    }
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
    // Nudge CD on programmatic control changes (which emit no DOM event) so ngDoCheck recomputes
    // + the <mat-error> text re-renders; see cae-input for the full note (Book 07 §3.3).
    this.errorSub = control.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());
    this.cdr.markForCheck(); // one CD so ngDoCheck runs with the inner MatInput resolved
  }

  protected handleInput(value: string): void {
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
