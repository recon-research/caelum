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
import { MatListModule } from '@angular/material/list';
import type { MatSelectionListChange } from '@angular/material/list';

/** A single choice in a `cae-listbox`. */
export interface CaeListboxOption {
  /** The value bound into the form when this option is selected. */
  value: string;
  /** Visible label. */
  label: string;
  /** Disable just this option (the whole list can also be disabled). */
  disabled?: boolean;
}

/**
 * `cae-listbox` — the Direct (1:1) wrapper over Material's `mat-selection-list`
 * (`reference/COMPARISON.md` row 45: `p-listbox` → `cae-listbox`; Book 06). An always-visible
 * selectable list — the expanded-in-place sibling of the `cae-select` dropdown. Options are data
 * (`CaeListboxOption[]`) and the list is a real form control via `ControlValueAccessor`, so
 * `[(ngModel)]` / `[formControl]` bind the selection exactly as they did to `p-listbox` (Book 07
 * §3.1). The CVA value seam — not a `model()` — matches the PrimeNG migration target: a single
 * `string` by default, a `string[]` when `multiple` is set (a cleared list is `''` / `[]`). Template
 * `disabled` merges with reactive-forms `setDisabledState`. Zoneless-compatible: `OnPush` + signal
 * state (provisional on #9; Book 01 §3.2).
 *
 * **Single vs multiple.** By default one option is selected and the value is a `string`. Set
 * `multiple` for checkbox multi-select — the value becomes a `string[]`. Set it ONCE, statically:
 * `MatSelectionList` builds its selection model from `multiple` at init and throws if it changes
 * afterward, so bind a constant, not a signal that toggles at runtime (the mode-dependent value seam
 * of `cae-select-button`, #73).
 *
 * **Accessibility.** `mat-selection-list` is `role="listbox"` with the WAI-ARIA roving-tabindex +
 * arrow-key navigation built in (verify real-browser at M4, like #41/#79). Name the list with
 * `ariaLabel` or `ariaLabelledby` (a `role=listbox` needs an accessible name), and mark it `required`
 * to set `aria-required`. It is not a `MatFormFieldControl`, so validation feedback is consumer-owned:
 * point `ariaDescribedby` at your message (Caelum's consumer-owned error pattern for non-form-field
 * controls, #47). Because the list navigates by roving tabindex — focus moves onto the OPTION, never
 * the listbox host — the description is forwarded onto each focusable option (as in `cae-radio` /
 * `cae-select-button` / `cae-slider`), where a screen reader reads it on focus; pair it with a
 * form-level live region for submit-time announcement. A label-less variant is #70.
 *
 * **Parity note.** This is the core selection list; a `p-listbox`'s filter/search box, option groups,
 * empty-state message, and select-all are not yet wrapped (tracked as #116). `single` is the default
 * here — a deliberate flip from `MatSelectionList`'s own `multiple`-default — to match `p-listbox`.
 *
 * No `color` input: theming comes through the `--cae-*`/`--mat-sys-*` token bridge, not Material's
 * palette input (the library's token-only discipline).
 */
@Component({
  selector: 'cae-listbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatListModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeListbox), multi: true },
  ],
  template: `
    <mat-selection-list
      [multiple]="multiple()"
      [disabled]="isDisabled()"
      [hideSingleSelectionIndicator]="hideSingleSelectionIndicator()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-labelledby]="ariaLabelledby() || null"
      [attr.aria-required]="required() ? 'true' : null"
      (selectionChange)="handleChange($event)"
      (focusout)="onTouched()"
    >
      @for (option of options(); track option.value) {
        <mat-list-option
          [value]="option.value"
          [selected]="isSelected(option.value)"
          [disabled]="option.disabled ?? false"
        >
          {{ option.label }}
        </mat-list-option>
      }
    </mat-selection-list>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeListbox implements ControlValueAccessor {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** The selectable options, as data. */
  readonly options = input<readonly CaeListboxOption[]>([]);
  /**
   * Allow more than one option selected (checkbox multi-select); flips the value seam from `string`
   * to `string[]`. Set this ONCE, at first render — `MatSelectionList` fixes its mode at init (see
   * the class docstring).
   */
  readonly multiple = input(false, { transform: booleanAttribute });
  /** Marks the list required — drives `aria-required` on the listbox host (sibling of cae-radio). */
  readonly required = input(false, { transform: booleanAttribute });
  /**
   * Hide the leading indicator Material draws on the selected option in SINGLE mode. A faithful
   * `p-listbox` single-select shows NO indicator (highlight only), so set this `true` for that look;
   * default `false` keeps Material's indicator (the ratified `cae-select-button` precedent). No effect
   * in `multiple` mode, which always shows checkboxes. Named for Material's exact input (unlike
   * `cae-select-button`'s unified `hideSelectionIndicator`) because a selection list has no
   * multiple-mode indicator to hide — the `Single` qualifier is load-bearing, not a leaked name.
   */
  readonly hideSingleSelectionIndicator = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Accessible name for the list when no visible label wraps it. */
  readonly ariaLabel = input('');
  /** `id` of a visible element that labels the list (preferred when a label is shown). */
  readonly ariaLabelledby = input('');
  /**
   * `id`(s) of element(s) describing the list — the a11y hook for a consumer-owned error or hint
   * (see the class docstring and `cae-radio`). Forwarded onto each focusable option (the list roves
   * focus onto the options, not the host), where a screen reader reads it on focus; pair with a
   * form-level live region for submit-time announcement. Empty → the attribute is dropped.
   */
  readonly ariaDescribedby = input('');

  // The selection is tracked internally as a value array (0/1 entries in single mode, N in multiple),
  // then projected to the mode-appropriate seam (`string` | `string[]`) on emit / write.
  protected readonly selectedValues = signal<readonly string[]>([]);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  private onChangeFn: (value: string | string[]) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // mat-selection-list exposes no aria-describedby input, and it navigates by ROVING TABINDEX —
    // focus physically moves onto each <mat-list-option role=option>, never staying on the listbox
    // host — so a container-level describedby isn't reliably re-announced as focus roves the options.
    // Like cae-radio / cae-select-button / cae-slider (#47), forward the consumer-error description
    // onto each focusable option, where a screen reader reads it on focus. afterRenderEffect runs
    // after the DOM is committed and re-runs when options() change, so freshly-stamped options get it too.
    afterRenderEffect(() => {
      const id = this.ariaDescribedby();
      this.options();
      this.host.nativeElement.querySelectorAll('mat-list-option').forEach((option) => {
        if (id) option.setAttribute('aria-describedby', id);
        else option.removeAttribute('aria-describedby');
      });
    });
  }

  protected isSelected(value: string): boolean {
    return this.selectedValues().includes(value);
  }

  // Read the authoritative full selection back off Material after each change (the event carries only
  // the options that toggled) and emit it in the mode-appropriate shape. Re-binding [selected] to the
  // same values is a no-op, so there is no feedback loop (the controlled pattern, as in cae-slider).
  protected handleChange(event: MatSelectionListChange): void {
    const values = event.source.selectedOptions.selected.map((option) => option.value as string);
    this.selectedValues.set(values);
    this.onChangeFn(this.multiple() ? [...values] : (values[0] ?? ''));
  }

  // --- ControlValueAccessor ---
  // Normalizes to the mode-appropriate internal array; a value is never clamped/snapped (an unknown
  // value simply matches no option → nothing selected). Mismatched shapes (an array written to a
  // single list, or ''/a lone string written to a multiple list) resolve to a sensible empty rather
  // than a junk single-item array (as in cae-slider).
  writeValue(value: string | string[] | null | undefined): void {
    if (this.multiple()) {
      this.selectedValues.set(
        Array.isArray(value) ? value : value != null && value !== '' ? [value] : [],
      );
    } else {
      this.selectedValues.set(
        !Array.isArray(value) && value != null && value !== '' ? [value] : [],
      );
    }
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
