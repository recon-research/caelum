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
 * The `ControlValueAccessor`, the shared form-field inputs (`label`/`placeholder`/`hint`/
 * `required`/`disabled`/`appearance`/`ariaLabel`/`errorMessages`), and the validation-error
 * forwarding into the inner `mat-form-field` all come from {@link CaeFormFieldControlBase} (#46,
 * extracted from #29) — this class adds only what's specific to a single-line text input.
 * Material sets `aria-invalid` from the bridged error state, except on an empty *required*
 * field, where it suppresses `aria-invalid` by design and `aria-required` conveys the
 * requirement instead (Book 07 §3.3/§3.4).
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
export class CaeInput extends CaeFormFieldControlBase {
  /** Input type. */
  readonly type = input<CaeInputType>('text');

  // --- Forwarded native attributes (a component wrapper hides the real <input>). ---
  /** `autocomplete` token — load-bearing for browser autofill + password managers. */
  readonly autocomplete = input('');
  /** `name` attribute (autofill grouping, native form submission). */
  readonly name = input('');
  /** `inputmode` hint for on-screen keyboards. */
  readonly inputMode = input('');
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
    // Skip while composing: don't fire onChange and don't rewrite `value()` (which
    // would re-bind [value] and can abort the IME composition in some browsers).
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
