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
import type { CaeFormFieldAppearance } from 'caelum/shared';

/**
 * `cae-textarea` — the Direct (1:1) wrapper over a `matInput` `<textarea>` inside a
 * `mat-form-field` (`reference/COMPARISON.md`: `pTextarea` → `cae-textarea`). The
 * multi-line sibling of `cae-input`: a real `ControlValueAccessor` (string value seam,
 * not a `model()`) so `[(ngModel)]` / `[formControl]` bind exactly as they did to
 * `pTextarea` (Book 07 §3.1). Native attributes a real form needs (`name`, `readonly`,
 * `maxlength`) are forwarded to the inner `<textarea>`, and IME composition is buffered
 * (onChange fires on `compositionend`, matching Angular's `DefaultValueAccessor`).
 * Validation-error forwarding rides on the same later pass as `cae-input` (#29).
 * Zoneless-compatible: `OnPush` + signal state (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeTextarea), multi: true },
  ],
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
export class CaeTextarea implements ControlValueAccessor {
  /** Floating label text; omitted → no label. Prefer over placeholder for a11y. */
  readonly label = input('');
  /** Native placeholder. Not an accessible name — set `label` or `ariaLabel` too. */
  readonly placeholder = input('');
  /** Assistive hint under the field; omitted → no hint. */
  readonly hint = input('');
  /** Visible rows (the textarea's initial height). */
  readonly rows = input(3);
  /** Marks the field required (Material renders the required marker). */
  readonly required = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Form-field appearance (shared with `cae-input`). Defaults to `outline`. */
  readonly appearance = input<CaeFormFieldAppearance>('outline');

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
