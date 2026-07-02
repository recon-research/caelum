import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  input,
  viewChild,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { CaeFormFieldControlBase } from 'caelum/form-field';

/**
 * `cae-textarea` — the Direct (1:1) wrapper over a `matInput` `<textarea>` inside a
 * `mat-form-field` (`reference/COMPARISON.md`: `pTextarea` → `cae-textarea`). The
 * multi-line sibling of `cae-input`: a real `ControlValueAccessor` (string value seam,
 * not a `model()`) so `[(ngModel)]` / `[formControl]` bind exactly as they did to
 * `pTextarea` (Book 07 §3.1). Native attributes a real form needs (`name`, `readonly`,
 * `maxlength`) are forwarded to the inner `<textarea>`, and IME composition is buffered
 * (onChange fires on `compositionend`, matching Angular's `DefaultValueAccessor`).
 *
 * The `ControlValueAccessor`, the shared form-field inputs, and the validation-error
 * forwarding come from {@link CaeFormFieldControlBase} (#46) — same seam as `cae-input`; this
 * class adds only the multi-line specifics. Material sets `aria-invalid` from the bridged
 * state, except on an empty *required* field where it suppresses it by design and
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
export class CaeTextarea extends CaeFormFieldControlBase {
  /** Visible rows (the textarea's initial height). */
  readonly rows = input(3);

  // --- Forwarded native attributes (a component wrapper hides the real <textarea>). ---
  /** `name` attribute (native form submission grouping). */
  readonly name = input('');
  /** `maxlength`; omit (null) for no limit. */
  readonly maxlength = input<number | null>(null);
  /** Render read-only (value visible, not editable). */
  readonly readonly = input(false, { transform: booleanAttribute });

  /** The inner MatInput directive — poked to recompute its (bridged) error state. */
  private readonly matInput = viewChild(MatInput);
  protected updateInnerErrorState(): void {
    this.matInput()?.updateErrorState();
  }

  /** True between `compositionstart`/`end` so onChange isn't spammed mid-IME. */
  private composing = false;

  protected handleInput(value: string): void {
    if (this.composing) return;
    this.commitValue(value);
  }

  protected onCompositionStart(): void {
    this.composing = true;
  }

  protected onCompositionEnd(value: string): void {
    this.composing = false;
    this.handleInput(value);
  }
}
