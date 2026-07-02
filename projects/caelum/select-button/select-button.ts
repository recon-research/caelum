import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

/** A single choice in a `cae-select-button` group. */
export interface CaeSelectButtonOption {
  /** The value bound into the form when this option is selected. */
  value: string;
  /** Visible label. */
  label: string;
  /** Disable just this option (the group can also be disabled as a whole). */
  disabled?: boolean;
}

/**
 * `cae-select-button` — the Direct (1:1) wrapper over Material's `mat-button-toggle-group`
 * (`reference/COMPARISON.md`: `p-selectbutton` → `cae-select-button`). The grouped, button-bar
 * sibling of `cae-radio`: options are data (`CaeSelectButtonOption[]`) and the group is a real form
 * control via `ControlValueAccessor`, so `[(ngModel)]` / `[formControl]` bind the selection exactly
 * as they did to `p-selectbutton` (Book 07 §3.1). The CVA value seam — not a `model()` — matches the
 * PrimeNG migration target: a single `string` by default, a `string[]` when `multiple` is set.
 * Template `disabled` merges with reactive-forms `setDisabledState`. Zoneless-compatible: `OnPush` +
 * signal state (provisional on #9; Book 01 §3.2).
 *
 * Material renders the group host with `role="radiogroup"` (single) or `role="group"` (multiple),
 * so `ariaLabel`/`ariaLabelledby` name the group (as in `cae-radio`). Selection follows Material:
 * single mode → child buttons are `role="radio"` + `aria-checked`; multiple → `role="button"` +
 * `aria-pressed`. It is not a `MatFormFieldControl`, so validation feedback is consumer-owned:
 * `ariaDescribedby` is forwarded onto each option's focusable inner `<button>` (#47) — `mat-button-toggle`
 * exposes no `aria-describedby` input, so it's set directly. A label-less/icon-only variant is #70.
 */
@Component({
  selector: 'cae-select-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonToggleModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeSelectButton), multi: true },
  ],
  template: `
    <mat-button-toggle-group
      [value]="value()"
      [multiple]="multiple()"
      [vertical]="vertical()"
      [disabled]="isDisabled()"
      [hideSingleSelectionIndicator]="hideSelectionIndicator()"
      [hideMultipleSelectionIndicator]="hideSelectionIndicator()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-labelledby]="ariaLabelledby() || null"
      [attr.aria-required]="required() ? 'true' : null"
      (change)="handleChange($event.value)"
      (focusout)="onTouched()"
    >
      @for (option of options(); track option.value) {
        <mat-button-toggle [value]="option.value" [disabled]="option.disabled ?? false">
          {{ option.label }}
        </mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeSelectButton implements ControlValueAccessor {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** The selectable options, as data. */
  readonly options = input<readonly CaeSelectButtonOption[]>([]);
  /**
   * Allow more than one option selected; flips the value seam from `string` to `string[]`.
   * Set this ONCE, at first render (bind a static value, not a signal that toggles at runtime):
   * Material's `MatButtonToggleGroup` builds its selection model from `multiple` at init and never
   * rebuilds it, so flipping it later would desync the value shape from the selection semantics.
   */
  readonly multiple = input(false, { transform: booleanAttribute });
  /** Stack the buttons vertically, 1:1 with Material. */
  readonly vertical = input(false, { transform: booleanAttribute });
  /** Marks the group required — drives `aria-required` on the group (the sibling of cae-radio). */
  readonly required = input(false, { transform: booleanAttribute });
  /**
   * Hide the leading checkmark Material draws inside the selected button(s). Defaults to `false`
   * (Material's default — a faithful 1:1 wrapper); set it for the plain, indicator-less look of
   * `p-selectButton`, whose selected button is highlighted rather than check-marked.
   */
  readonly hideSelectionIndicator = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Accessible name for the group when no visible label wraps it. */
  readonly ariaLabel = input('');
  /** `id` of a visible element that labels the group (preferred when a label is shown). */
  readonly ariaLabelledby = input('');
  /**
   * `id`(s) of element(s) describing the group — the a11y hook for a consumer-owned error or hint
   * (see the class docstring and `cae-radio`). A button-toggle group uses roving focus (focus lands
   * on a button, never the group host), and `mat-button-toggle` exposes no `aria-describedby` input,
   * so this is applied directly to each option's focusable inner `<button>`, where a screen reader
   * reads it on focus; pair it with a form-level live region for submit-time announcement.
   */
  readonly ariaDescribedby = input('');

  protected readonly value = signal<string | readonly string[]>('');
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  private onChangeFn: (value: string | string[]) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // `mat-button-toggle` has no `aria-describedby` input, so forward it to every option's inner
    // focusable <button> ourselves. An afterRenderEffect runs AFTER the DOM is committed (unlike a
    // plain effect, whose timing vs. the @for render isn't guaranteed), and re-runs reactively —
    // reading `options()` makes freshly-stamped buttons pick up the description too. See the docs below.
    afterRenderEffect(() => {
      const id = this.ariaDescribedby();
      this.options();
      this.host.nativeElement.querySelectorAll('button').forEach((button) => {
        if (id) button.setAttribute('aria-describedby', id);
        else button.removeAttribute('aria-describedby');
      });
    });
  }

  protected handleChange(value: string | string[]): void {
    this.value.set(value);
    this.onChangeFn(value);
  }

  // --- ControlValueAccessor ---
  // In multiple mode the bound form value must be a `string[]` (Material throws on a non-array
  // truthy value); a null/undefined resets to the mode-appropriate empty (`[]` vs `''`).
  writeValue(value: string | string[]): void {
    this.value.set(value ?? (this.multiple() ? [] : ''));
  }
  registerOnChange(fn: (value: string | string[]) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
