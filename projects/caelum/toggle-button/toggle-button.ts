import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

/**
 * `cae-toggle-button` — the Direct (1:1) wrapper over a standalone Material `mat-button-toggle`
 * (`reference/COMPARISON.md`: `p-togglebutton` → `cae-toggle-button`). A single two-state pressable
 * button: a `ControlValueAccessor`, so `[(ngModel)]` / `[formControl]` bind its boolean pressed
 * state exactly as they did to `p-togglebutton` (Book 07 §3.1). The value seam is CVA — not a
 * `model()` — to match the PrimeNG migration target. Reactive-forms disabling (`setDisabledState`)
 * merges with the template `disabled` input. Zoneless-compatible: `OnPush` + signal state
 * (provisional on #9; Book 01 §3.2). Its grouped sibling is `cae-select-button`.
 *
 * A standalone toggle follows the WAI-ARIA button pattern: the inner `<button>` gets `role="button"`
 * + `aria-pressed` (not the radio/`aria-checked` a grouped `cae-select-button` uses). Like
 * `cae-switch`/`cae-checkbox` it is not a `MatFormFieldControl`, so it has no built-in `<mat-error>`;
 * for validation feedback the consumer renders the message and points `ariaDescribedby` at it
 * (Caelum's consumer-owned error pattern, #47). A label-less/icon-only toggle also needs an
 * accessible name — that cross-control `ariaLabel`/`ariaLabelledby` seam is tracked in #70.
 */
@Component({
  selector: 'cae-toggle-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonToggleModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeToggleButton), multi: true },
  ],
  template: `
    <mat-button-toggle
      [checked]="checked()"
      [disabled]="isDisabled()"
      (change)="handleChange($event.source.checked)"
      (focusout)="onTouched()"
    >
      <ng-content />
    </mat-button-toggle>
  `,
  styles: `
    :host {
      display: inline-block;
    }
  `,
})
export class CaeToggleButton implements ControlValueAccessor {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * `id`(s) of element(s) describing the button — the a11y hook for a consumer-owned error or hint
   * (see the class docstring and `cae-switch`). Read by a screen reader when the button has focus.
   * Unlike the sibling controls, `mat-button-toggle` exposes no `aria-describedby` input and its host
   * is `role="presentation"`, so this is applied directly to the focusable inner `<button>`; pair it
   * with a form-level live region for submit-time announcement.
   */
  readonly ariaDescribedby = input('');

  protected readonly checked = signal(false);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  private onChangeFn: (value: boolean) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // `mat-button-toggle` has no `aria-describedby` input, so forward it to the inner focusable
    // <button> ourselves (post-render; re-runs when the id changes). See the `ariaDescribedby` docs.
    effect(() => {
      const id = this.ariaDescribedby();
      const button = this.host.nativeElement.querySelector('button');
      if (!button) return;
      if (id) button.setAttribute('aria-describedby', id);
      else button.removeAttribute('aria-describedby');
    });
  }

  protected handleChange(value: boolean): void {
    this.checked.set(value);
    this.onChangeFn(value);
  }

  // --- ControlValueAccessor ---
  writeValue(value: boolean): void {
    this.checked.set(!!value);
  }
  registerOnChange(fn: (value: boolean) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
