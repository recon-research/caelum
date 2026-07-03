import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatSliderModule } from '@angular/material/slider';

/**
 * The value of a {@link CaeSlider}. In the default (single-thumb) mode it's a `number`; in `range`
 * mode it's a `[start, end]` pair — the mode-dependent value seam of `cae-select-button` (#73),
 * applied to a slider. The bound form control's value is one or the other depending on `range`.
 */
export type CaeSliderValue = number | [number, number];

/**
 * `cae-slider` — the Direct (1:1) wrapper over Material's `MatSlider`
 * (`reference/COMPARISON.md` row 44: `p-slider` → `cae-slider`; Book 07 §3.1). A real form
 * control: it is a `ControlValueAccessor`, so `[(ngModel)]` and `[formControl]` bind to it exactly
 * as they did to `p-slider`. The value seam is CVA — not a `model()` — to match the PrimeNG
 * migration target. Reactive-forms disabling (`setDisabledState`) is merged with the template
 * `disabled` input. Zoneless-compatible: `OnPush` + signal state, no zone-coupled APIs (provisional
 * on #9; Book 01 §3.2).
 *
 * **Single vs range.** By default one thumb selects one `number`. Set `range` for a two-thumb range
 * slider whose value is a `[start, end]` pair (`p-slider [range]` parity). `range` is read
 * structurally by the template — the two modes stamp different thumbs — so **set it statically**
 * (like `cae-select-button`'s `multiple`); toggling it at runtime re-stamps the thumbs and resets
 * their positions.
 *
 * **Accessibility.** Each thumb is a native `<input type="range">`, so it needs an accessible name —
 * a range input with none is an axe / WCAG 4.1.2 failure. Name a single slider with `ariaLabel` or
 * `ariaLabelledby`. In `range` mode, name the two thumbs distinctly with `startAriaLabel` /
 * `endAriaLabel` (each falls back to `ariaLabel`); a shared `ariaLabelledby` is only a fallback there —
 * it names BOTH thumbs identically and is suppressed on any thumb that already has an `aria-label`, so
 * a per-thumb name always wins (ARIA ranks `aria-labelledby` above `aria-label`; #111 tracks a
 * per-thumb `aria-labelledby`). The thumb's value is conveyed by `aria-valuenow`/`aria-valuetext`
 * (Material) — keep the accessible NAME static, not the live value. Unlike `cae-input`, a slider is
 * not a `MatFormFieldControl`, so it has no built-in `<mat-error>`; for validation feedback the
 * consumer renders the message and points `ariaDescribedby` at it (Caelum's consumer-owned error
 * pattern for non-form-field controls, #47), forwarded onto the focusable thumb input(s). (These
 * `aria*` names are essential for a slider, not the *optional* label-less seam tracked as #70.)
 *
 * **Parity note.** `p-slider` supports `orientation="vertical"`; Material dropped vertical sliders in
 * its MDC rewrite, so `MatSlider` (and this wrapper) is horizontal only — a vertical slider would need
 * a bespoke build (tracked as #111).
 *
 * No `color` input: theming comes through the `--cae-*`/`--mat-sys-*` token bridge, not Material's
 * palette input (the library's token-only discipline).
 */
@Component({
  selector: 'cae-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSliderModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeSlider), multi: true },
  ],
  template: `
    <mat-slider
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [disabled]="isDisabled()"
      [discrete]="discrete()"
      [showTickMarks]="showTickMarks()"
      [displayWith]="displayWith()"
    >
      @if (range()) {
        <input
          matSliderStartThumb
          [value]="start()"
          [attr.aria-label]="startAriaLabel() || ariaLabel() || null"
          [attr.aria-labelledby]="startLabelledby()"
          [attr.aria-describedby]="ariaDescribedby() || null"
          (valueChange)="onStartInput($event)"
          (blur)="onTouched()"
        />
        <input
          matSliderEndThumb
          [value]="end()"
          [attr.aria-label]="endAriaLabel() || ariaLabel() || null"
          [attr.aria-labelledby]="endLabelledby()"
          [attr.aria-describedby]="ariaDescribedby() || null"
          (valueChange)="onEndInput($event)"
          (blur)="onTouched()"
        />
      } @else {
        <input
          matSliderThumb
          [value]="single()"
          [attr.aria-label]="ariaLabel() || null"
          [attr.aria-labelledby]="ariaLabelledby() || null"
          [attr.aria-describedby]="ariaDescribedby() || null"
          (valueChange)="onSingleInput($event)"
          (blur)="onTouched()"
        />
      }
    </mat-slider>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeSlider implements ControlValueAccessor {
  /** Minimum value. 1:1 with Material (default `0`). */
  readonly min = input(0, { transform: numberAttribute });
  /** Maximum value. 1:1 with Material (default `100`). */
  readonly max = input(100, { transform: numberAttribute });
  /** Step increment the thumb snaps to. 1:1 with Material (default `1`). */
  readonly step = input(1, { transform: numberAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Show a numeric value label above the thumb while it's pressed (Material's `discrete`). */
  readonly discrete = input(false, { transform: booleanAttribute });
  /** Draw tick marks along the track (Material's `showTickMarks`). */
  readonly showTickMarks = input(false, { transform: booleanAttribute });
  /**
   * Two-thumb range mode (`p-slider [range]`). The value becomes a `[start, end]` pair. Read
   * structurally by the template — **set it statically**, not toggled at runtime (see the class
   * docstring).
   */
  readonly range = input(false, { transform: booleanAttribute });
  /**
   * Formats the number shown in the `discrete` value label (Material's `displayWith`). Defaults to
   * the plain number, matching Material — override to add a unit or thousands separators.
   */
  readonly displayWith = input<(value: number) => string>((value) => `${value}`);
  /** Accessible name for the (single) thumb; also the fallback name for both `range` thumbs. */
  readonly ariaLabel = input('');
  /** `id` of an element labelling the thumb(s) (`aria-labelledby`). */
  readonly ariaLabelledby = input('');
  /** Accessible name for the range **start** thumb (falls back to `ariaLabel`). */
  readonly startAriaLabel = input('');
  /** Accessible name for the range **end** thumb (falls back to `ariaLabel`). */
  readonly endAriaLabel = input('');
  /**
   * `id`(s) of element(s) describing the control — the a11y hook for a consumer-owned error or hint
   * (see the class docstring). Forwarded onto the focusable thumb input(s), read by a screen reader
   * on focus; pair with a form-level live region for submit. Empty → the attribute is dropped.
   */
  readonly ariaDescribedby = input('');

  /** The single-thumb value (single mode). */
  protected readonly single = signal(0);
  /** The range start value (range mode). */
  protected readonly start = signal(0);
  /** The range end value (range mode). */
  protected readonly end = signal(0);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  // In range mode a shared `ariaLabelledby` is a FALLBACK: it's suppressed on a thumb that already has
  // its own `aria-label` (startAriaLabel/endAriaLabel/ariaLabel) so the per-thumb name wins. ARIA gives
  // aria-labelledby higher precedence than aria-label, so forwarding both would SILENTLY clobber the
  // distinct thumb names — this keeps the per-thumb label authoritative (#111 tracks per-thumb labelledby).
  protected readonly startLabelledby = computed(() =>
    this.startAriaLabel() || this.ariaLabel() ? null : this.ariaLabelledby() || null,
  );
  protected readonly endLabelledby = computed(() =>
    this.endAriaLabel() || this.ariaLabel() ? null : this.ariaLabelledby() || null,
  );

  private onChangeFn: (value: CaeSliderValue) => void = () => {};
  protected onTouched: () => void = () => {};

  protected onSingleInput(value: number): void {
    this.single.set(value);
    this.onChangeFn(value);
  }
  protected onStartInput(value: number): void {
    this.start.set(value);
    this.onChangeFn([value, this.end()]);
  }
  protected onEndInput(value: number): void {
    this.end.set(value);
    this.onChangeFn([this.start(), value]);
  }

  // --- ControlValueAccessor ---
  writeValue(value: CaeSliderValue | null | undefined): void {
    if (this.range()) {
      // A `[start, end]` pair is taken as-is; a non-array or wrong-length value (null on reset, or a
      // single number mis-bound to a range slider) falls back to the full span — the natural "unset"
      // for a range. Member coercion is best-effort (`Number(...)`): like Material, writeValue does NOT
      // clamp/snap the model to min/max/step — the thumb clamps only the DISPLAY, so an out-of-range
      // initial value leaves the model as written. Material keeps start <= end via the sibling thumbs.
      if (Array.isArray(value) && value.length === 2) {
        this.start.set(Number(value[0]));
        this.end.set(Number(value[1]));
      } else {
        this.start.set(this.min());
        this.end.set(this.max());
      }
    } else {
      // null on reset (or a stray array from a range value) falls back to the minimum; no clamp (above).
      this.single.set(typeof value === 'number' ? value : this.min());
    }
  }
  registerOnChange(fn: (value: CaeSliderValue) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
