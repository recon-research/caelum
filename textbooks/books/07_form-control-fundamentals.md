# Book 07 — Form Control Fundamentals

> Volume II — Building on Primitives. The control-author's complete contract: how a `cae-*` field becomes a first-class form control, validates honestly, shows errors at the right moment, and lives correctly inside `mat-form-field`. Book 02 §3.4 introduced the seam; this book is the depth behind it.

## 1. TL;DR

Every Caelum text-like control is the **same shape**: a `ControlValueAccessor` (the forms-API-agnostic value seam, Book 02 §3.4) that *also* implements `MatFormFieldControl` (the presentation seam into `mat-form-field`, Book 02 §3.6), validated by `ValidatorFn`s the **form** owns, with error *timing* governed by **one library-wide `ErrorStateMatcher`** so every field shows errors identically. The control transports a value and reports its state; it does **not** decide validation policy and it does **not** invent its own error-display rules. The single opinionated default this book lands on: *author the control once against CVA + `MatFormFieldControl`, wire a11y through the form-field, and keep error behavior uniform across the whole library* — that uniformity is the parity (R4) a team leaving PrimeNG actually notices. FloatLabel, IconField, and InputGroup are not new controls; they are `mat-form-field` features (and one thin compose) mapped onto PrimeNG's names.

## 2. Conceptual Foundations

A form field has three separable responsibilities, and the commonest control bug is letting one bleed into another. Separating them cleanly is what makes a control reusable, accessible, and forms-system-agnostic.

### 2.1 The control is not the form — three responsibilities, three owners

- **Value transport — the control owns this.** Move a value in (`writeValue`) and out (`onChange`), nothing more. The control is a faithful pipe, not a validator and not a policy engine.
- **Validity — the *form* owns this.** Whether a field is `required`, matches a `pattern`, or passes a server check is decided by `ValidatorFn`s attached to the `FormControl` (Book 02 §3.3), not baked into the component. A control may *contribute* structural validity it alone can judge (a mask control reporting "this isn't a parseable value"), but it never owns business rules — see §3.2.
- **Presentation — `mat-form-field` owns this.** Label, hint, error slot, prefix/suffix, and the float behavior are the container's job; the control exposes the *state* (`empty`, `focused`, `errorState`) the container renders from. Error *timing* is a third-party policy object (`ErrorStateMatcher`), deliberately outside both control and form so it can be made uniform library-wide.

Keep these three apart and a control composes with any forms API, any validators, and the standard error UX for free. Conflate them — validate inside `writeValue`, hard-code when errors show — and you get the control that demos fine and fails the first real form.

### 2.2 The four states a control must render honestly

A "looks the same" control and an "is the same" control differ in exactly four channels, each with a contract member behind it (R3 = fidelity, R4 = parity):

| State | In via | Out via | The bug if you skip it |
|---|---|---|---|
| **value** | `writeValue(v)` | `onChange(v)` | echoing `writeValue` back through `onChange` (feedback loop); coercing `0`/`''`/`null` together (value corruption) |
| **disabled** | `setDisabledState(d)` | — | a "disabled" field that still accepts keystrokes |
| **touched** | — | `onTouched()` on blur | errors that never appear (or appear instantly, before the user typed) |
| **errorState** | derived (matcher) | `stateChanges` + `aria-invalid` | invalid state seen visually but never announced |

The asymmetry in the value row is the one authors get wrong most: `writeValue` is the form *pushing in* and must **never** re-emit through `onChange`; `onChange` fires only on a *user* edit. Value **fidelity** (R3) is round-tripped with tests, not eyeballed (Book 17) — `writeValue(null)` ≠ `writeValue('')`, a numeric control must keep `0`, a multi-value control must keep order. These are exactly the failures that survive a demo.

### 2.3 What v22 changed for control authors (and what didn't)

Almost nothing changed, and that is the point. `ControlValueAccessor` is **stable and not deprecated in v22** (platform note); a CVA control written today is forms-API-agnostic and therefore already works under **both** classic Reactive Forms and the newly-stable **Signal Forms** (Book 02 §3.5) without a second implementation. Signal Forms adds a *second consumer* of the same value/disabled/touched channels, not a new control contract — which is precisely why Caelum builds on CVA (maximum reach) rather than chasing the newer surface. The version-specific frontier (Signal Forms validation ergonomics, async validators via `resource()`/`rxResource()`) is tracked in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md) and revisited in §5 — never asserted from memory.

## 3. Architecture & Design

### 3.1 The CVA contract in full

Book 02 §3.4 named the four methods; here is the discipline behind each, the part that separates a correct control from a plausible one:

- **`writeValue(value)`** — render it; do **not** call `onChange`. Treat `null`, `''`, and `0` as distinct. If your internal model is richer than the wire value (a parsed number vs a formatted string), `writeValue` parses *in* and the template formats *out*.
- **`registerOnChange(fn)` / `registerOnTouched(fn)`** — store the callbacks; call `onChange` only on genuine user edits, `onTouched` on blur. Calling `onTouched` is what lets the matcher (§3.3) know the field was visited.
- **`setDisabledState(isDisabled)`** — reflect in the DOM *and* refuse input while disabled. A purely visual disable is a defect.
- **Registration** — provide `NG_VALUE_ACCESSOR` with `useExisting: forwardRef(() => CaeX), multi: true`. The `forwardRef` is required because the token is referenced before the class is defined.

The CVA is the *public* contract. When a control is built on an Aria pattern that holds its own value signal (a listbox, select, combobox), `[formField]` is the *internal* wire between that signal and the CVA — public CVA outside, `[formField]` inside (Book 06 §3.4). Consumers always see a normal form control regardless of what the control is built from.

### 3.2 Validation — where it lives, and the one thing a control may contribute

The form owns validation *policy*: `Validators.required`, `Validators.pattern`, custom `ValidatorFn`s, and `AsyncValidatorFn`s are attached to the `FormControl`/`FormGroup`, and the control surfaces errors without choosing them (Book 02 §3.3). Two patterns a control author must know:

- **Reusable `ValidatorFn`s** — pure `control => ValidationErrors | null` functions, composed by the consumer. Library-shipped validators (e.g. `caeIban()`, `caeStrongPassword()`) are *offered*, never auto-applied.
- **A control contributing structural validity via `NG_VALIDATORS`** — the *one* legitimate case for a control to self-validate: when only the control can judge whether its input is even well-formed (a mask/format control whose raw text can't be parsed into the modelled value, Book 08). Implement the `Validator` interface (`validate(control): ValidationErrors | null`) and register `NG_VALIDATORS` with `multi: true`. This reports *structural* invalidity ("not a date"), never *business* rules ("must be after today") — those stay with the form.
- **Cross-field & async** — multi-field rules (password-confirm) are `ValidatorFn`s on the **group**, not any one control; async checks (uniqueness) are `AsyncValidatorFn`s, increasingly fed by `resource()`/`rxResource()` at the edge (§5, Book 02 §5). Caelum commits to **one** documented pattern for each so error shapes stay consistent (the gap Book 02 §6 flagged, closed here).

### 3.3 Error state & timing — one matcher, library-wide

*When* an error shows is policy, and inconsistent error timing is a parity tell. Angular Material routes this through `ErrorStateMatcher` — `isErrorState(control, form): boolean` — whose default is **invalid && (touched || form submitted)**. Caelum ships **one** `CaelumErrorStateMatcher` and provides it once at the library root so every `cae-*` field shows errors on the same trigger (R4); a consumer can still override per-field for special cases, but the default is uniform by construction. The boolean it returns becomes the control's `errorState`, which drives both the visible error slot **and** `aria-invalid` — visual and assistive states move together or the a11y-parity invariant fails (`docs/ARCHITECTURE.md` §2). Keeping the matcher external to both control and form is what makes "show errors the same way everywhere" a single decision rather than N components' worth of duplicated conditionals.

### 3.4 `mat-form-field` integration — the second contract

A text-like control that wants the label/hint/error/prefix/suffix chrome implements `MatFormFieldControl<T>` *in addition to* CVA (Book 02 §3.6). The members the container reads:

- **State the field renders from:** `value`, `empty`, `focused`, `required`, `disabled`, `errorState`, `shouldLabelFloat`, `placeholder`, `controlType` (a class hook for styling), `id`.
- **`stateChanges: Observable<void>`** — the control **must** emit on this whenever any of the above changes, or the form-field won't re-render (the most common "why won't my label float" bug). Emit and complete it in the lifecycle.
- **`ngControl`** — the link back to the bound `NgControl`, so the field can read validity/touched.
- **a11y wiring:** `setDescribedByIds(ids)` — the field calls this with the hint/error element ids; the control must apply them as `aria-describedby` so screen readers announce the help and error text. `onContainerClick(event)` focuses the control when the user clicks the field chrome.

That `setDescribedByIds` → `aria-describedby` hop plus `errorState` → `aria-invalid` (§3.3) is the entire a11y association; a CVA that renders but skips these is announced as a bare textbox with no label/error linkage and fails parity verification (Book 16).

### 3.5 FloatLabel, IconField, InputGroup — PrimeNG names, Material mechanisms

These three PrimeNG features are **not** new controls; they map onto `mat-form-field` (brief §3):

- **FloatLabel** → the form-field's `floatLabel` input plus the float *driven by state*: the label floats when `shouldLabelFloat` is true (control non-`empty` or `focused`). No custom component — a `cae-input` that reports `empty`/`focused` honestly (§3.4) gets float-label parity for free.
- **IconField** → an icon in `matPrefix`/`matSuffix` (or the text variants for currency-symbol-style affixes). A `cae-icon-field` is a thin convenience wrapper, not new machinery.
- **InputGroup** → the honest gap. PrimeNG's InputGroup wraps **multiple** inputs/addons in one bordered group; `mat-form-field` styles a **single** control. Parity needs a small composing component — **`cae-input-group`** — that lays out addon prefixes/suffixes and member controls in one bordered row, each still its own `mat-form-field` (or borderless control) underneath. This is a Build-S compose (Book 09 territory for the overlay-bearing siblings), called out so no one expects `mat-form-field` to do it natively.

### 3.6 The control-authoring checklist — the forms leg of the four-legged stool

Book 05 §3.6 framed every Build-* control as a four-legged stool (CDK behavior + token-bridge design + signal-driven OnPush CD + CVA for forms). This book is the depth of that **forms leg**. A control is forms-*done* when:

1. **Value fidelity** — `null`/`''`/`0`/order round-trip under test (Book 17); `writeValue` never re-emits.
2. **Touched & disabled** honored — `onTouched` on blur; `setDisabledState` actually blocks input.
3. **Error parity** — uses the library `ErrorStateMatcher`; `errorState` drives `aria-invalid`.
4. **Form-field contract** — `MatFormFieldControl` members correct; `stateChanges` emits; `setDescribedByIds` applied.
5. **Forms-API-agnostic** — verified pleasant under Reactive Forms **and** Signal Forms (Book 02 §3.5), not just one.
6. **Signal-driven OnPush** (Book 01 §3.2) and **token-only styling** (Book 04 §3.6) — the other three legs hold.

All six green is the slice's exit; anything less is a control that looks like a control.

## 4. Implementation

Illustrative, not necessarily compileable.

**A `cae-input` that is both a CVA and a `MatFormFieldControl`** (the full text-control skeleton; the CVA half deepens Book 02 §4):

```ts
// projects/caelum/src/lib/input/input.ts  →  <cae-input>, class CaeInput
import {
  ChangeDetectionStrategy, Component, ElementRef, inject, input, signal, OnDestroy,
} from '@angular/core';
import { Subject } from 'rxjs';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { MatFormFieldControl } from '@angular/material/form-field';
import { ErrorStateMatcher } from '@angular/material/core';

let nextId = 0;

@Component({
  selector: 'cae-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input #el [value]="value() ?? ''" [disabled]="disabled()"
           [attr.aria-invalid]="errorState" [attr.aria-describedby]="describedBy()"
           (input)="onInput($event)" (blur)="onBlur()" (focus)="setFocused(true)" />`,
  providers: [{ provide: MatFormFieldControl, useExisting: CaeInput }], // NG_VALUE_ACCESSOR via ngControl, see note
})
export class CaeInput implements ControlValueAccessor, MatFormFieldControl<string | null>, OnDestroy {
  readonly stateChanges = new Subject<void>();          // MUST emit on any state change
  readonly id = `cae-input-${nextId++}`;
  readonly controlType = 'cae-input';
  readonly ngControl = inject(NgControl, { optional: true, self: true });
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly matcher = inject(ErrorStateMatcher);

  protected readonly value = signal<string | null>(null);
  protected readonly disabled = signal(false);
  protected readonly focused = signal(false);
  protected readonly describedBy = signal<string | null>(null);

  constructor() { if (this.ngControl) this.ngControl.valueAccessor = this; } // wire CVA without a provider cycle

  // --- MatFormFieldControl surface the form-field renders from ---
  get empty() { return (this.value() ?? '') === ''; }
  get shouldLabelFloat() { return this.focused() || !this.empty; }
  get required() { return this.ngControl?.control?.hasValidator?.(/* required */ null as any) ?? false; }
  get errorState() {
    return this.matcher.isErrorState(this.ngControl?.control as any, /* parent form */ null);
  }
  setDescribedByIds(ids: string[]) { this.describedBy.set(ids.join(' ') || null); }
  onContainerClick() { this.host.nativeElement.querySelector('input')?.focus(); }
  private setFocused(f: boolean) { this.focused.set(f); this.stateChanges.next(); }

  // --- ControlValueAccessor: the forms-API-agnostic value seam ---
  writeValue(v: string | null) { this.value.set(v); this.stateChanges.next(); } // NO onChange here
  registerOnChange(fn: (v: string | null) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(d: boolean) { this.disabled.set(d); this.stateChanges.next(); }

  private onChange: (v: string | null) => void = () => {};
  private onTouched: () => void = () => {};
  protected onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.value.set(v); this.onChange(v); this.stateChanges.next(); // user edit -> out
  }
  protected onBlur() { this.setFocused(false); this.onTouched(); }
  ngOnDestroy() { this.stateChanges.complete(); }
}
```

**One library-wide error-state policy** (provided once, so every field agrees):

```ts
// projects/caelum/src/lib/forms/error-state-matcher.ts
import { ErrorStateMatcher } from '@angular/material/core';
import { FormControl, FormGroupDirective, NgForm } from '@angular/forms';

export class CaelumErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    return !!(control && control.invalid && (control.touched || form?.submitted)); // the library default, in one place
  }
}
// provideCaelum(): { provide: ErrorStateMatcher, useClass: CaelumErrorStateMatcher }
```

**A control contributing structural validity** (the one legitimate self-validation, §3.2):

```ts
// a mask control reporting only "this raw text isn't a well-formed value" — never a business rule
providers: [{ provide: NG_VALIDATORS, useExisting: CaeMaskInput, multi: true }],
validate(c: AbstractControl): ValidationErrors | null {
  return this.parse(c.value) === undefined ? { caeMaskFormat: true } : null;
}
```

## 5. Bleeding Edge

Tracked in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted from memory:

- **Signal Forms validation ergonomics.** Validators expressed in a `schema` function (`required()`/`email()`, platform note) are a different authoring model than `ValidatorFn`s on a `FormControl`. A CVA control is agnostic to which drives it, but Caelum's *shipped* validators and the cross-field pattern (§3.2) should be verified pleasant under both before the API surface is leaned on.
- **Async validation via `resource()`/`rxResource()`.** Newly stable (platform note); a cleaner substrate for uniqueness/server checks than hand-rolled `AsyncValidatorFn` + `Subject`. Used at the edge — the library exposes the seam, not an opinionated fetcher (Book 01 §3.5).
- **Is `MatFormFieldControl` the durable integration surface?** It is the stable contract today (Book 02 §3.6); whether Material's own evolution keeps it as the seam (vs a more signal-native one) is a watch item, not a present concern.

## 6. Gaps & Opportunities

- **InputGroup has no native `mat-form-field` equivalent** (§3.5) — the multi-control bordered container is a real (small) build, tracked as a `coverage_gap` until `cae-input-group` ships.
- **Cross-field & async validation ergonomics** are thin across the whole ecosystem under *both* forms systems; Caelum's contribution is committing to one documented pattern (§3.2) rather than new framework capability — worth a worked example once Books 08–09 give it concrete controls to validate.
- **Locale/format/paste/negative parity** for numeric and masked inputs (R3) is deliberately **out of scope here** and is Book 08's entire subject; this book establishes the control *contract*, not the formatting behavior.

## 7. AI & Claude Code Integration

High-multiplier: the CVA + `MatFormFieldControl` skeleton is boilerplate-heavy and pattern-stable, so an agent scaffolds a correct dual-contract control (with `stateChanges` discipline, `forwardRef`/`self` wiring, and the a11y attributes) fast and consistently — exactly the mechanical surface to delegate. The ~1× judgment stays human-checked: **value-fidelity edge cases** (`null` vs `''` vs `0`, paste, IME composition, leading zeros) are subtle and silent, and **error-timing** decisions (when an override of the library matcher is actually warranted) are design calls. An agent should generate the control, then *prove* fidelity with round-trip tests (Book 17) rather than assert it — the contract is easy to write and easy to write subtly wrong.

## 8. Exercises & Further Reading

**Exercises**

1. Implement a `cae-input` CVA whose tests prove `writeValue(null)`, `writeValue('')`, and `writeValue(0 as any)` are each preserved distinctly and that `writeValue` never triggers `onChange`.
2. Write `CaelumErrorStateMatcher`, provide it once, and verify two different `cae-*` fields show errors on the identical trigger (touched-or-submitted), then override it for one field only.
3. Build a minimal `cae-input-group` that lays out a prefix addon + two member controls in one bordered row, and confirm each member is independently focusable and validated.
4. Add `NG_VALIDATORS` structural validation to a format control so unparseable text reports `{ format: true }` while a business rule ("after today") stays a `ValidatorFn` on the form — and show the two errors render through the same slot.

**Further reading**

- Angular — [ControlValueAccessor](https://angular.dev/api/forms/ControlValueAccessor) · [Validator / NG_VALIDATORS](https://angular.dev/api/forms/Validator) · [Form validation guide](https://angular.dev/guide/forms/form-validation)
- Angular Material — [MatFormFieldControl (custom form-field control)](https://material.angular.io/guide/creating-a-custom-form-field-control) · [ErrorStateMatcher](https://material.angular.io/components/input/overview#changing-when-error-messages-are-shown)
- In-library: Book 02 §3.4 (CVA), §3.6 (form-field & error-state), §3.3 (Reactive Forms), §3.5 (Signal Forms); Book 06 §3.4 (`[formField]` inside / CVA outside); Book 05 §3.6 (the four-legged stool); Book 08 (numeric/mask formatting parity); Book 16 (parity verification); Book 17 (round-trip testing).
