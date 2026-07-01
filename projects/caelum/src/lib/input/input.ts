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
import { MatInputModule } from '@angular/material/input';

/**
 * Text-like input types this control accepts. Deliberately excludes `number`: the CVA
 * value seam is a string, and a numeric model belongs to a dedicated numeric control
 * (Book 08, a batch-2+ component) that preserves `number` via coercion.
 */
export type CaeInputType = 'text' | 'email' | 'password' | 'tel' | 'url' | 'search';

/** Form-field surfaces Caelum surfaces — a Caelum-owned alias, not Material's type. */
export type CaeInputAppearance = 'fill' | 'outline';

/**
 * `cae-input` — the Direct (1:1) wrapper over a `matInput` inside a `mat-form-field`
 * (`reference/COMPARISON.md`: `pInputText` → `cae-input`). A real form control via
 * `ControlValueAccessor`, so `[(ngModel)]`/`[formControl]` bind to it like `pInputText`
 * (Book 07 §3.1). This is the Direct-tier wrap of Material — NOT a bespoke
 * `MatFormFieldControl` reimplementation (Book 07 §4, Build tier); validation-error
 * forwarding rides on that later pass (#29). Native input attributes a real form needs
 * (`autocomplete`, `name`, `readonly`, `maxlength`, `inputmode`) are forwarded to the
 * inner `<input>`, since a component wrapper hides the element `pInputText` exposed
 * directly. IME composition is buffered (onChange fires on `compositionend`, not on the
 * intermediate keystrokes) to match Angular's `DefaultValueAccessor`. Theme + label
 * association come free through Material and the token bridge. Zoneless-compatible:
 * `OnPush` + signal state, no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeInput), multi: true }],
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
    </mat-form-field>
  `,
  styles: `
    :host,
    mat-form-field {
      display: block;
    }
  `,
})
export class CaeInput implements ControlValueAccessor {
  /** Floating label text; omitted → no label. Prefer over placeholder for a11y. */
  readonly label = input('');
  /** Native placeholder. Not an accessible name — set `label` or `ariaLabel` too. */
  readonly placeholder = input('');
  /** Assistive hint under the field; omitted → no hint. */
  readonly hint = input('');
  /** Input type. */
  readonly type = input<CaeInputType>('text');
  /** Marks the field required (Material renders the required marker). */
  readonly required = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Form-field appearance. Defaults to `outline`. */
  readonly appearance = input<CaeInputAppearance>('outline');

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
