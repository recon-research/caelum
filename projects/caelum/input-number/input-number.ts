import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  LOCALE_ID,
  signal,
  viewChild,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { CaeFormFieldControlBase } from 'caelum/form-field';

/**
 * Formatting style. `decimal` (plain grouped number) and `currency` (needs a `currency` code)
 * are the v1 modes — the two `p-inputNumber` modes teams migrate first. `percent` (whose model
 * is a *fraction*, `0.5` → `50%`, per `Intl.NumberFormat`) is deferred to a follow-up so its
 * ×100 value semantics get their own decision + tests before the API commits to them.
 */
export type CaeInputNumberMode = 'decimal' | 'currency';

/**
 * `cae-input-number` — the dedicated numeric text input (`reference/COMPARISON.md`:
 * `pInputNumber` → `cae-input-number`). `cae-input` deliberately excludes `type=number` and
 * reserves the numeric model for this control (see `../input/input.ts`): the CVA value seam
 * here is a **`number | null`**, never the formatted string (Book 08 §2.2, the R3 scar — a
 * `1,234` must not reach a backend as a string, and a `de-DE` user's `1.234,50` must not
 * round-trip to `1234`).
 *
 * **Component, not a bare directive.** Book 08 §2.1 makes directive-on-`matInput` the generic
 * default, but Caelum's house pattern wraps the `matInput` inside a `cae-*` component extending
 * {@link CaeFormFieldControlBase} so consumers write `<cae-input-number [(ngModel)]>` exactly
 * like `<cae-input>` and inherit label/hint/appearance/required/disabled/ariaLabel/errorMessages
 * + the #29/#47 validation-error bridge for free. A lone `[caeInputNumber]` directive would be
 * the family's odd one out and skip that uniform wiring (deliberate deviation, plan_work #301).
 *
 * **The model/view split** (Book 08 §2.2). The base `value()` holds the canonical
 * `number | null`; a private {@link viewValue} holds the *localized formatted string* bound to
 * the inner `<input matInput [value]>`. `writeValue` (model → view: format in) and blur reformat
 * the view; a keystroke parses out to `commitValue(number|null)` and does **not** rewrite the
 * view mid-typing (don't fight the caret — reformat lands on blur, Book 08 §3.1). Formatting is
 * `Intl.NumberFormat` only — **no foreign mask/number library** (Book 08 §2.3, D-11 provenance).
 *
 * Range/business rules ("must be ≥ 18") stay the form's `ValidatorFn`s and surface through the
 * inherited error bridge; this control only owns the number↔string fidelity (Book 08 §3.1).
 *
 * Zoneless-compatible: `OnPush` + signal state, no zone-coupled APIs (provisional on #9; Book
 * 01 §3.2).
 */
@Component({
  selector: 'cae-input-number',
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
        [attr.inputmode]="inputMode()"
        [value]="viewValue()"
        [placeholder]="placeholder()"
        [required]="required()"
        [disabled]="isDisabled()"
        [errorStateMatcher]="errorStateMatcher"
        [attr.aria-label]="ariaLabel() || null"
        (focus)="focused.set(true)"
        (input)="onInput(inputEl.value)"
        (blur)="onBlur()"
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
export class CaeInputNumber extends CaeFormFieldControlBase<number | null> {
  /** BCP-47 locale for formatting + parsing. Defaults to the app's `LOCALE_ID`. */
  readonly locale = input(inject(LOCALE_ID));
  /** Formatting style — `decimal` (default) or `currency` (set `currency` too). */
  readonly mode = input<CaeInputNumberMode>('decimal');
  /** ISO 4217 code (e.g. `'USD'`) — required when `mode="currency"`. */
  readonly currency = input<string | null>(null);
  /** `Intl` `minimumFractionDigits`; omit (null) to use the locale/currency default. */
  readonly minFractionDigits = input<number | null>(null);
  /** `Intl` `maximumFractionDigits`; omit (null) to use the locale/currency default. */
  readonly maxFractionDigits = input<number | null>(null);
  /**
   * `inputmode` hint for on-screen keyboards. Defaults to `'decimal'` (digits + separator).
   * A negative-capable field may want `'text'` — the decimal pad has no minus key on iOS / many
   * Android keyboards, though parsing still accepts a typed `-` (a11y review #301).
   */
  readonly inputMode = input('decimal');

  /** The localized formatted string shown in the inner input (view value; distinct from the model). */
  protected readonly viewValue = signal('');
  /**
   * True while the inner input holds focus. Suppresses the reactive reformat below so a runtime
   * change to a formatting input can't rewrite (and clobber the caret of) text the user is typing.
   */
  protected readonly focused = signal(false);

  constructor() {
    super();
    // Finding 1 (2-lens review): when a formatting input (locale/mode/currency/fraction digits)
    // changes at runtime, reformat the visible value so it can't go stale (wrong symbol/grouping/
    // precision) — but only while NOT focused, so it never fights active typing. `viewValue` is
    // written but not read here, so there is no reactive cycle.
    effect(() => {
      this.formatter(); // dep: re-run when any formatting input changes
      if (!this.focused()) this.viewValue.set(this.format(this.value()));
    });
  }

  /** The inner MatInput directive — poked to recompute its (bridged) error state. */
  private readonly matInput = viewChild(MatInput);
  protected updateInnerErrorState(): void {
    this.matInput()?.updateErrorState();
  }

  /** A `number | null` model is empty as `null` (kept distinct from `0`, a real value; Book 08 §2.2). */
  protected override emptyValue(): number | null {
    return null;
  }

  private readonly formatter = computed(() => {
    const options: Intl.NumberFormatOptions = {};
    if (this.mode() === 'currency') {
      const currency = this.currency();
      if (currency) {
        options.style = 'currency';
        options.currency = currency;
      } else if (isDevMode()) {
        // Intl.NumberFormat throws without a currency code — fall back to a plain decimal
        // format and warn rather than crash the view.
        console.warn(
          '[cae-input-number] mode="currency" needs a [currency] ISO code (e.g. "USD"); ' +
            'formatting as a plain decimal until one is set.',
        );
      }
    }
    // Fraction-digit bounds: clamp to Intl's legal [0, 100] and drop both on min > max — Intl
    // throws RangeError otherwise, so guard it like the currency path rather than crash (Finding 3).
    const clamp = (v: number | null): number | null =>
      v == null ? null : Math.min(100, Math.max(0, Math.trunc(v)));
    let min = clamp(this.minFractionDigits());
    let max = clamp(this.maxFractionDigits());
    if (min != null && max != null && min > max) {
      if (isDevMode()) {
        console.warn(
          `[cae-input-number] minFractionDigits (${min}) > maxFractionDigits (${max}); ignoring both.`,
        );
      }
      min = max = null;
    }
    if (min != null) options.minimumFractionDigits = min;
    if (max != null) options.maximumFractionDigits = max;
    return new Intl.NumberFormat(this.locale(), options);
  });

  /** model → view. `null` shows as empty (never `"0"`), keeping empty distinct from a real `0`. */
  private format(value: number | null): string {
    return value == null ? '' : this.formatter().format(value);
  }

  /**
   * view → model. Strip the locale's grouping separator, normalize its decimal mark and a
   * leading sign, then `Number()`. A lone `-` or `''` is an intermediate/empty state → `null`;
   * anything that can't parse → `null` (Book 08 §3.1). Reject rather than silently coerce.
   *
   * Scope: v1 assumes ASCII digits (`0-9`), covering the Latin-digit locale matrix (en-US, de-DE,
   * most European / Latin-American locales). Alternate numbering systems whose digits aren't
   * `0-9` (e.g. `ar`/`fa` Arabic-Indic) would need a per-locale digit map before `Number()` — a
   * follow-up, not a v1 claim (Book 08 §3.6's alt-numeral leg, gated with the fuller matrix).
   */
  private parse(text: string): number | null {
    const decimal = (1.1).toLocaleString(this.locale()).charAt(1);
    const cleaned = text.replace(new RegExp(`[^0-9\\-${decimal}]`, 'g'), '').replace(decimal, '.');
    if (cleaned === '' || cleaned === '-') return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  }

  /**
   * A keystroke: parse out to the model and emit. Keep {@link viewValue} equal to the raw text
   * so the `[value]` binding stays truthful — a stale bound value would let a change-detection
   * pass clobber what the user just typed (mirrors `cae-input`, which syncs its bound signal on
   * input). Deliberately does NOT reformat here — grouping lands on blur, not mid-typing, so the
   * caret is never thrown to the end (Book 08 §3.1).
   */
  protected onInput(raw: string): void {
    this.viewValue.set(raw);
    this.commitValue(this.parse(raw));
  }

  /**
   * Blur: snap the model to the precision the field actually displays, so it never shows a value
   * it wouldn't submit (Finding 2 — e.g. typing `1.999` into a 2-dp currency field shows `$2.00`
   * *and* commits `2`, matching p-inputNumber). Then reformat the view and mark touched.
   */
  protected onBlur(): void {
    this.focused.set(false);
    const current = this.value();
    const snapped = this.parse(this.format(current)); // round to the displayed fraction digits
    if (snapped !== current) this.commitValue(snapped);
    this.viewValue.set(this.format(snapped));
    this.onTouched();
  }

  /** model → view on a programmatic write (formats in; keeps `0` distinct from empty). */
  override writeValue(value: number | null): void {
    // A NaN/Infinity model (external garbage) collapses to empty rather than rendering "NaN".
    super.writeValue(Number.isFinite(value as number) ? value : null);
    this.viewValue.set(this.format(this.value()));
  }
}
