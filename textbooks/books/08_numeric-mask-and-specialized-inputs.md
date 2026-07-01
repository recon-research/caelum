# Book 08 — Numeric, Mask & Specialized Inputs

> Volume II — Building on Primitives. The directive-heavy parity tier: InputNumber, InputMask, KeyFilter, InputOtp, and the Password strength meter. These are not new control *kinds* — they layer formatting/parsing behavior onto the Book 07 control contract. Their whole difficulty is the **R3 scar**: "looks the same" hides real differences in grouping, locale, paste, and negatives (brief §8).

## 1. TL;DR

Almost everything in this book is a **format/parse directive on a native `matInput`**, not a new component — composition over invention (Book 07's laziest-sufficient-code rung). The single opinionated default: **model the typed value, display a formatted string, and keep the two in a disciplined parse↔format round-trip** built on the platform's `Intl.NumberFormat` rather than a foreign mask library (provenance, Book 03 — the brief's standing "avoid foreign mask libs"). The scar to respect everywhere: grouping separators, locale decimal marks, currency/percent, paste handling, negative values, caret position, and IME composition — the things a demo never exercises and a real form does. The two genuine *components* (InputOtp's N segments, Password's meter) still wear the Book 07 contract (CVA + `MatFormFieldControl` + the library `ErrorStateMatcher`); the rest are directives that leave the host `matInput` exactly as accessible as Material made it.

## 2. Conceptual Foundations

### 2.1 Directive or component? — the default is directive

These widgets split by **whether the DOM shape changes**:

- **A native `<input matInput>` is enough → write a directive.** InputNumber, InputMask, and KeyFilter add behavior (format, restrict, parse) to an input whose structure is unchanged. A directive inherits Material's label/error/a11y wiring for free and is the laziest sufficient code (Book 07 §3.6's checklist still applies — the directive participates in the host control's value via the host's CVA).
- **The DOM shape itself differs → write a thin component.** InputOtp is *N* single-character inputs; Password-with-meter adds a toggle and a meter region. These earn a `cae-*` component implementing CVA (Book 02 §3.4) + `MatFormFieldControl` (Book 07 §3.4).

Reach for the directive first; promote to a component only when one input element can't express the widget. Most of this book is directives.

### 2.2 The model/view split — the heart of the R3 scar

Every formatted input holds **two** representations, and conflating them is the parity bug:

- the **model value** — typed and canonical: a `number` for InputNumber, the unmasked digit string for InputMask, the combined code for InputOtp;
- the **view value** — a *localized formatted string* the user sees and edits: `"1,234.50"`, `"(212) 555-0142"`, `"4"` per OTP cell.

The CVA bridges them in one direction each: `writeValue(model)` **formats in**; a user keystroke **parses out** to `onChange(model)`. The form only ever sees the model. Skipping this — storing the formatted string as the value — is exactly how `1,234` reaches a backend as a string, or a German user's `1.234,50` round-trips to `1.234`. Value fidelity (R3) means `0` stays `0` and isn't coerced to empty, and `null` (no value) stays distinct from `0` (a real value) — Book 07 §2.2.

### 2.3 Why a foreign mask library is the wrong reach

The temptation is a ready-made mask/number library. Two reasons not to: **provenance** — most carry non-US-origin or deep transitive trees that fail the admit/reject gate (Book 03), and a formatting concern is not worth a supply-chain liability; and **fidelity** — the platform already ships `Intl.NumberFormat` (locale, grouping, currency, percent, sign display, rounding) and `Intl.DateTimeFormat`, so a *small custom directive* over a stable browser API beats a dependency on every axis that matters here. The cheapest dependency is the one you don't add (Book 03). Masking is the one genuinely fiddly part the platform doesn't fully solve (§3.2); even there a ~100-line directive is the right cost, not a library.

## 3. Architecture & Design

### 3.1 InputNumber — `Intl.NumberFormat`, parsing, and the caret problem

Model a `number | null`; display via an `Intl.NumberFormat` configured for the active locale (Book 04's RTL/locale context), `minimumFractionDigits`/`maximumFractionDigits`, and `style: 'currency' | 'percent'` when needed. The hard parts:

- **Parsing back** — strip the locale's grouping separators and normalize its decimal mark (a `de-DE` user types `,` for the decimal), then `Number()`. Reject what doesn't parse rather than silently coercing.
- **Caret preservation** — reformatting on every keystroke moves the caret; preserve it by counting significant characters before the caret, reformatting, then restoring the caret to the same logical position. This is the single fiddliest behavior in the book and is where a custom directive earns its tests.
- **`0` vs empty, and negatives** — `0` is a value, not blank; a lone `-` mid-typing is an intermediate state, not invalid-yet. Don't fight the user mid-entry; validate on blur.
- **Structural validity** — when the field's text can't be parsed into a number at all, the directive may contribute a structural error via `NG_VALIDATORS` (Book 07 §3.2) — *structural only* ("not a number"); range/business rules ("must be ≥ 18") stay `ValidatorFn`s the form owns.

### 3.2 InputMask — a small pattern directive

A mask directive applies a fixed template (`(999) 999-9999`, `99/99/9999`, `aa-9999`) where tokens (`9` digit, `a` alpha, `*` alnum) mark editable slots and the rest is literal. Design decisions:

- **Model = unmasked.** Expose the raw value (`2125550142`) through the CVA, not the decorated string, unless the consumer explicitly wants the literal form. The view shows the mask; the model stays clean (§2.2).
- **Paste & `beforeinput`.** Handle paste by filtering the pasted text through the mask rather than dropping it; drive edits off the `beforeinput`/`InputEvent` channel so insertions, deletions, and replacements all route through one parse, and the caret lands after the next editable slot.
- **Placeholder slots** and an `inputmode` hint (`numeric`/`tel`) for mobile keyboards and screen-reader sanity. Keep the directive small; resist growing it into a general mask engine — date/number masks that `Intl` already covers should use §3.1, not a mask string.

### 3.3 KeyFilter & input sanitization — a UX nicety, not validation

A KeyFilter restricts allowed characters (integer, money, alphabetic, a regex). The discipline that keeps it accessible:

- **Filter on `beforeinput`, never by swallowing `keydown` blindly.** `keydown`-level blocking breaks paste, IME composition, and assistive input; `beforeinput` lets you cancel a disallowed *insertion* while leaving navigation, deletion, paste, and composition intact. Always allow composition events through (CJK/accent input) and re-validate the composed result on `compositionend`.
- **It is not validation.** Key-filtering shapes typing for convenience; the field is still validated by the form's `ValidatorFn`s (Book 07 §3.2). A screen-reader or programmatic value-set must not be silently corrupted by the filter — sanitize the *result*, don't trust the *keystroke*.

### 3.4 InputOtp — segments, roving focus, paste-spread

OTP is *N* single-character inputs presenting as one control. The mechanics:

- **One value, many cells.** The component holds the combined code as its CVA value; each cell is a view of one character. `writeValue("482913")` distributes across cells; editing any cell recomposes and emits.
- **Roving focus** across cells via the CDK `FocusKeyManager` (Book 05 §3.2) — typing a digit advances; Backspace on an empty cell retreats; arrow keys move; one tab stop for the group.
- **Paste spreads.** Pasting `482913` into the first cell fills all cells, not just one — the most-missed OTP behavior.
- **A11y/mobile**: `inputmode="numeric"`, `autocomplete="one-time-code"` so iOS/Android offer the SMS code, and an accessible group label so the set announces as one field.

### 3.5 Password + strength meter — advisory UI over a real validator

A `matInput[type=password]` with two additions:

- **Visibility toggle** — a `matSuffix` icon button that flips `type` between `password`/`text`, with an `aria-label` and `aria-pressed` that announce the state (and never logs the value).
- **Strength meter** — a `computed()` signal derives a 0–4 score from the value and renders a bar styled entirely through `--cae-*` tokens (Book 04 §3.6), no hardcoded colors. **The meter is advisory**: it guides the user, but the *enforced* policy (min length, classes, breach check) is a `ValidatorFn` the form owns (Book 07 §3.2) — a green meter never substitutes for validation. Scoring uses a small local heuristic, or a **vetted US-origin** scoring library run through the Book 03 admit/reject gate before adoption — never an unvetted dependency pulled in "just for the meter." Async breach-list checks (if any) are `AsyncValidatorFn`s at the edge (Book 07 §3.2).

### 3.6 The shared discipline — one contract, locale-matrix tested

Every widget here sits on the Book 07 control contract: a directive participates in its host `matInput`'s value; a component implements CVA + `MatFormFieldControl` + uses the library `ErrorStateMatcher` so error timing matches the rest of the library (R4). What's *additional* in this tier, and non-negotiable:

1. **Round-trip the model across the locale matrix** — `en-US`, `de-DE` (decimal comma, `.` grouping), and an RTL/alternate-numeral locale — plus paste, negatives, and `0`/`null` distinctness, as tests, not eyeballing (Book 17). This is the R3 scar made into a test plan.
2. **IME/composition safe** — never corrupt a composing value (§3.3).
3. **Caret discipline** — formatting must not throw the caret to the end (§3.1).

Pass these and a numeric/mask input is *parity-done*; skip the locale matrix and it's the input that demos in English and fails the first `de-DE` user.

## 4. Implementation

Illustrative, not necessarily compileable.

**`caeInputNumber` — a directive that formats/parses on a `matInput`** (model `number | null`, view localized):

```ts
// projects/caelum/src/lib/input-number/input-number.ts  →  [caeInputNumber]
import { Directive, ElementRef, inject, input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({
  selector: 'input[caeInputNumber]',
  standalone: true,
  host: { '(input)': 'onInput()', '(blur)': 'onBlur()', 'inputmode': 'decimal' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeInputNumber), multi: true }],
})
export class CaeInputNumber implements ControlValueAccessor {
  readonly locale = input('en-US');
  readonly currency = input<string | null>(null);          // e.g. 'USD' -> currency formatting
  private readonly el = inject(ElementRef<HTMLInputElement>).nativeElement;
  private fmt() {
    return new Intl.NumberFormat(this.locale(), this.currency()
      ? { style: 'currency', currency: this.currency()! } : { maximumFractionDigits: 2 });
  }
  private onChange: (v: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: number | null) {                            // model -> view: FORMAT in
    this.el.value = v == null ? '' : this.fmt().format(v);  // keeps 0 distinct from '' (null)
  }
  registerOnChange(fn: (v: number | null) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(d: boolean) { this.el.disabled = d; }

  protected onInput() {                                     // view -> model: PARSE out
    const caret = this.el.selectionStart ?? this.el.value.length;
    const parsed = this.parse(this.el.value);
    this.onChange(parsed);                                  // emit the typed number, not the string
    // (reformat + caret-restore happens on blur to avoid fighting the user mid-entry)
    this.el.setSelectionRange(caret, caret);
  }
  protected onBlur() {                                      // reformat cleanly, preserve caret
    const v = this.parse(this.el.value);
    if (v != null) this.el.value = this.fmt().format(v);
    this.onTouched();
  }
  private parse(s: string): number | null {                // strip locale grouping, normalize decimal
    const decimal = (1.1).toLocaleString(this.locale()).charAt(1);
    const cleaned = s.replace(new RegExp(`[^0-9\\-${decimal}]`, 'g'), '').replace(decimal, '.');
    if (cleaned === '' || cleaned === '-') return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  }
}
```

**`cae-otp-input` — the segmented component** (combined value, roving focus, paste-spread):

```ts
// the value is ONE string; cells are views of it. Roving focus via CDK FocusKeyManager (Book 05 §3.2).
@Component({
  selector: 'cae-otp-input',
  host: { 'role': 'group', '[attr.aria-label]': 'label()' },
  template: `
    @for (i of slots(); track i) {
      <input #cell maxlength="1" inputmode="numeric" autocomplete="one-time-code"
             (input)="setChar(i, cell.value)" (paste)="spread($event)" />
    }`,
  // ...implements ControlValueAccessor: writeValue distributes chars across cells; setChar recomposes + onChange
})
export class CaeOtpInput { /* keyManager.onKeydown advances/retreats; spread() fills all cells from one paste */ }
```

**Password strength as a computed signal** (advisory UI; the real rule is a `ValidatorFn`):

```ts
protected readonly score = computed(() => estimateStrength(this.value())); // 0..4, local heuristic
// template: a bar whose width/color read --cae-strength-* tokens (Book 04 §3.6) — never hardcoded colors
// enforcement lives on the form: new FormControl('', [Validators.minLength(12), strongPasswordValidator()])
```

## 5. Bleeding Edge

Version-specific points are tracked in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted from memory:

- **`Intl.NumberFormat` modern options** — `signDisplay`, `roundingMode`, `numberingSystem`, and `unit` style cover most parity needs the old PrimeNG props hand-rolled; prefer them over manual string surgery where the browser baseline allows.
- **`beforeinput`/`InputEvent` as the canonical edit channel** — now broadly supported, it's the right seam for masks/filters (§3.2–§3.3); it replaces the brittle `keydown`-blocking patterns and composes with IME correctly.
- **Native masked input** — there is still no good first-party HTML mask control, so the small directive remains the answer; watch the platform but don't wait on it.

## 6. Gaps & Opportunities

- **No first-party Material numeric/mask** — every widget here is a Build-S directive/component (the migration map's "Build-S" rows); that's expected, but it means the library owns the locale-matrix test burden.
- **Caret preservation under reformat** is fiddly and historically under-tested across browsers — a good candidate for a shared utility plus a dedicated test fixture rather than per-component reinvention.
- **Strength-scoring library provenance is an open vet** — a richer estimator (zxcvbn-style) would improve the meter, but adoption is gated on the Book 03 admit/reject gate (license + US-origin + transitive tree); until one clears, ship the local heuristic and say so.

## 7. AI & Claude Code Integration

High-multiplier on the scaffolding: the directive shell, the `Intl.NumberFormat` wiring, the OTP cell loop, and the CVA boilerplate are pattern-stable and fast for an agent to generate consistently. The ~1× judgment that must stay human-verified is exactly the R3 surface — **caret behavior, paste handling, IME composition, and the locale matrix** are silent, locale-specific failures an agent will not feel and a single-locale test will not catch. The correct division: let the agent generate the widget and the locale-matrix *test* fixtures (Book 17), then read the failing locales rather than trusting the implementation. "Formats a US number" is the trap that looks done.

## 8. Exercises & Further Reading

**Exercises**

1. Implement `caeInputNumber` and prove with tests that `1234.5` round-trips correctly under `en-US`, `de-DE` (`1.234,5`), and an Arabic-numeral locale, that `0` is preserved (not blanked), and that a lone `-` mid-typing isn't treated as invalid.
2. Build an InputMask directive for `(999) 999-9999` whose CVA value is the *unmasked* `2125550142`, and verify pasting a fully-formatted number fills correctly and the caret lands in the next slot.
3. Add a KeyFilter that allows only money characters using `beforeinput`, and demonstrate that paste, Backspace, and IME composition still work (i.e. you didn't block `keydown`).
4. Build `cae-otp-input` for a 6-digit code where pasting the whole code spreads across all cells, Backspace retreats focus, and the combined value is one CVA string.
5. Add a password strength meter as a `computed()` signal styled only through tokens, and prove the form still rejects a weak password via a `ValidatorFn` even when the meter is hidden.

**Further reading**

- MDN — [`Intl.NumberFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) · [`beforeinput` / InputEvent](https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event) · [`autocomplete="one-time-code"`](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete)
- Angular CDK — [`text-field` (autosize, autofill)](https://material.angular.io/cdk/text-field/overview)
- In-library: Book 07 (the control contract — §3.2 structural validity via `NG_VALIDATORS`, §3.4 `mat-form-field`, §2.2 value fidelity); Book 02 §3.4 (CVA); Book 05 §3.2 (FocusKeyManager) & §3.3 (CDK text-field); Book 04 §3.6 (token-only styling); Book 03 (the provenance gate for any scoring/mask dependency); Book 17 (locale-matrix round-trip testing).
