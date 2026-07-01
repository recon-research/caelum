# Book 02 — Reactivity & Forms in Angular 22

> Volume I, Book 2. Builds directly on Book 01 — signals and DI are introduced there as the platform spine (`Book 01 §3.3`); this book goes deep on the reactive primitives and then on forms, which is where a component library earns most of its keep. Version-specific claims about Angular 22 are grounded in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md) (cited inline as *(platform note)*); the form-control patterns (`ControlValueAccessor`, reactive forms) are stable Angular and taught from settled knowledge.

## 1. TL;DR

Two reactive systems coexist in Angular 22 — **signals** (pull-based, synchronous, the new default substrate) and **RxJS observables** (push-based, async, still first-class) — and a library author must know exactly when each is correct. On top of that sits the forms question, which is the one that actually decides whether teams can adopt Caelum: *a library does not own the form, it owns the control that plugs into someone else's form.* This book lands on one opinionated default: **build every Caelum form control on `ControlValueAccessor` — the stable, universal bridge that is not deprecated in v22 (platform note) — expose signal inputs for ergonomics, and make the control work unchanged under classic Reactive Forms *and* the new Signal Forms.** Betting the library on a single forms API (even the shiny new one) would strand every consumer who chose the other; CVA is the seam that refuses to make that bet.

## 2. Conceptual Foundations

### 2.1 Two reactivities: signals vs observables

A **signal** is a container whose read is tracked: anything that reads it during a reactive computation re-runs when it changes. It is *pull-based* (you read the current value synchronously, `count()`), *glitch-free* (a `computed` never observes an inconsistent intermediate), and has no concept of completion or error channels. An **observable** is *push-based*: it emits a stream of values over time, models async and cancellation natively, and carries error/complete semantics. The v22 platform is signal-first (Book 01), but observables did not go away — `HttpClient`, router events, and any time-based or cancellable async are still observable-shaped.

The library author's rule of thumb:

- **State the template reads → signal.** Component view state, derived values, input-driven UI — signals, so `OnPush` correctness is automatic (`Book 01 §3.2`).
- **Async streams, cancellation, time → observable**, then convert at the boundary with `toSignal()` / `toObservable()` (the `@angular/core/rxjs-interop` bridge) so the template still consumes a signal.
- **Never** `subscribe()` by hand inside a component to copy a value into a field — that is the manual-subscription anti-pattern (catalogued in `reference/ANTI_PATTERNS.md`); use `toSignal()` or `AsyncPipe`.

### 2.2 The forms problem: you own the control, not the form

This is the conceptual pivot of the whole book. When a consuming app builds a form, *the app* chooses the forms strategy, owns the `FormGroup`/model, runs the validators, and decides submission. Caelum ships the **controls** that sit inside that form — a `cae-input`, a `cae-select`, a `cae-datepicker`. So a Caelum control must:

- **Integrate with whatever the consumer's form is** — template-driven, reactive, or signal forms — without the control knowing which.
- **Round-trip value faithfully** — write a value in, emit changes out, and never lose, reorder, or coerce data silently (the parity scars in `brief §3` and R3 live here).
- **Expose the four control states** the form API expects: value, disabled, touched, and validity — through the one interface every forms system understands.

That interface is `ControlValueAccessor`. Everything in §3.4 follows from it.

### 2.3 What v22 changed (and what it didn't)

From the platform note: the signal APIs (`signal`/`computed`/`effect`/`linkedSignal`/`untracked`) and the signal component IO (`input`/`output`/`model`/the `viewChild`/`contentChild` queries) are stable; **Signal Forms** (`@angular/forms/signals`, the `form()` function) newly stabilized in v22; the Resource APIs (`resource`/`httpResource`/`rxResource`) are stable for async data. Crucially for this book, what *did not* change: classic **Reactive Forms** (`FormControl`/`FormGroup`/`Validators`) and **`ControlValueAccessor`** are not deprecated, and the `@Input` decorator still coexists with signal `input()` (platform note). So Caelum builds on the stable bridge and treats Signal Forms as additive upside, not a migration it forces on anyone.

## 3. Architecture & Design

### 3.1 Signals in depth — and the three rules that keep them honest

The primitives (all stable in v22 — platform note):

- **`signal(initial)`** — a writable signal; update with `.set(v)` or `.update(prev => next)`.
- **`computed(() => …)`** — a derived, memoized, read-only signal; recomputes lazily when a dependency changes.
- **`effect(() => …)`** — runs a side-effect when its tracked dependencies change; for imperative work (focus, DOM, third-party sync), *not* for deriving state.
- **`linkedSignal(…)`** — a writable signal that resets from a computation when a source changes (e.g. a selected row that clears when the data reloads).
- **`untracked(() => …)`** — read a signal *without* registering a dependency, to break unwanted reactive edges.

The three rules a library must not break:

1. **Derive with `computed`, never with an `effect` that writes a signal.** An effect that sets state creates a hidden second source of truth and can loop; `computed` is the declarative, glitch-free way to derive. (The single most common signal foot-gun — see `reference/ANTI_PATTERNS.md`.)
2. **Keep `effect`s for genuine side-effects** and keep them idempotent; they run inside the framework's reactive timing, not synchronously after every `.set()`.
3. **Don't smuggle async into a `computed`.** Computeds are synchronous and pure; async belongs in an observable or a `resource()` converted to a signal.

### 3.2 Signal-based component IO

For Caelum components, prefer the signal forms of component IO (stable in v22 — platform note), authored signal-first per `Book 01 §3.3`:

- **`input()` / `input.required()`** — inputs that read as signals inside the component, composing with `computed`/`effect` and making `OnPush` automatic. A transform option coerces/validates at the boundary (e.g. a numeric or boolean attribute).
- **`output()`** — typed event emitters; emit on user intent (`valueChange`, `opened`, `closed`).
- **`model()`** — a two-way signal input, the basis for `[(ngModel)]`-style binding and the value channel of a simple control.
- **Signal queries** — `viewChild`/`viewChildren`/`contentChild`/`contentChildren` return signals, so a component reactively reads its own projected/queried children (e.g. an overlay reading its trigger).

The `@Input` decorator is not deprecated (platform note), so consumers and older call-sites keep working — but new Caelum components are signal-first.

### 3.3 Reactive Forms — the model the library plugs into

Most serious Caelum consumers use **Reactive Forms**, so a control author must understand the shape it integrates with:

- **`FormControl<T>`** — a single field: a `value`, a validity state, and `touched`/`dirty` flags, exposed both synchronously (`.value`, `.status`) and as streams (`.valueChanges`, `.statusChanges`).
- **`FormGroup` / `FormArray` / `FormRecord`** — composites; a group's value is the aggregate of its children.
- **`Validators`** — synchronous (`required`, `min`, `pattern`) and asynchronous (returning an observable/promise of errors); a control surfaces errors but the *form* owns which validators run.
- **`NgControl`** — the directive link (`formControlName`, `formControl`, `ngModel`) that binds a DOM control to a `FormControl`. This is what a custom control hooks into via CVA.

A Caelum control never *requires* reactive forms — it must also work with a bare `[(ngModel)]` or inside a Signal Form — but reactive forms is the integration it is designed against first.

### 3.4 ControlValueAccessor — the bridge every custom control implements

`ControlValueAccessor` (CVA) is the four-method contract that lets *your* component act as a native form control. It is stable and not deprecated in v22 (platform note), and it is the load-bearing seam of Caelum's entire form layer:

- **`writeValue(value)`** — the form pushes a value *into* your control (initial value, `patchValue`, reset). Render it; do not echo it back out.
- **`registerOnChange(fn)`** — store `fn`; call it when the *user* changes the value, to push *out* to the model.
- **`registerOnTouched(fn)`** — store `fn`; call it on blur, so the form learns the field was visited (drives `touched`, and thus when errors show).
- **`setDisabledState(isDisabled)`** — the form disables/enables your control; reflect it in the DOM and ignore user input while disabled.

The discipline that separates a correct control from a "looks the same" one (R3, R4):

- **Value fidelity.** `writeValue(null)` and `writeValue('')` are different; numeric controls must not coerce `0` to empty; multi-value controls must preserve order. Round-trip tests, not eyeballing (Book 17 — Testing Strategy).
- **Touched/disabled are not decoration.** Forgetting `registerOnTouched` means errors never appear at the right time; ignoring `setDisabledState` means a "disabled" field still accepts input. These are the bugs that pass a demo and fail a real form.
- **A11y is part of the contract.** The control's label, error association (`aria-describedby`), and invalid state (`aria-invalid`) are wired through `mat-form-field` (§3.6) — a CVA that renders but isn't announced fails the a11y-parity invariant (`docs/ARCHITECTURE.md` §2).

### 3.5 Signal Forms (v22) — and how a CVA control coexists

Signal Forms newly stabilized in v22 (platform note): `form(model, schemaOrOptions?, options?)` from `@angular/forms/signals` builds a reactive form from a signal **model**, returning a `FieldTree<TModel>`; validation is expressed in a **schema** function with validators like `required()` / `email()`, and a `FormField` directive binds a field to an input in the template. It is a more declarative, signal-native form model than the imperative `FormGroup` graph.

Caelum's position (the reason §1's default holds): **a CVA-based control is forms-API-agnostic, so it works under Signal Forms without change** — the binding directive drives the same value/disabled/touched channels CVA already exposes. Caelum therefore builds controls on CVA (maximum reach) and additionally verifies they are *pleasant* under Signal Forms, rather than authoring two control implementations. Signal Forms specifics beyond this architectural framing are young and should be re-verified against the platform note (and the v22 docs) before relying on exact API details — flagged in §6.

### 3.6 `mat-form-field` integration & error-state matching

Most Caelum text-like controls live inside Angular Material's `mat-form-field`, which provides the label, hint, error slot, and floating-label behavior. A custom control participates by implementing `MatFormFieldControl` (in addition to CVA): it exposes `stateChanges`, `id`, `placeholder`, `focused`, `empty`, `errorState`, and `controlType`, and it associates its error text via `aria-describedby`. Error *timing* is governed by an `ErrorStateMatcher` — by default "show errors when the control is invalid and (touched or the form is submitted)" — which a library should keep consistent across all controls so error behavior doesn't vary component-to-component (a parity concern, R4). FloatLabel/IconField/InputGroup parity details are Book 07's depth; this section is the integration contract.

## 4. Implementation

Illustrative, not necessarily compileable.

**A minimal CVA control with signal IO** (the Caelum control skeleton):

```ts
// projects/caelum/src/lib/input/input.ts  →  <cae-input>, class CaeInput
import { ChangeDetectionStrategy, Component, forwardRef, input, model, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'cae-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input [value]="value() ?? ''" [disabled]="disabled()"
           (input)="onInput($event)" (blur)="onTouched()" />`,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeInput), multi: true }],
})
export class CaeInput implements ControlValueAccessor {
  readonly label = input('');               // signal input — ergonomics
  protected readonly value = signal<string | null>(null);
  protected readonly disabled = signal(false);

  private onChange: (v: string | null) => void = () => {};
  protected onTouched: () => void = () => {};

  // CVA contract — the forms-API-agnostic bridge
  writeValue(v: string | null) { this.value.set(v); }      // form -> control; do NOT call onChange here
  registerOnChange(fn: (v: string | null) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean) { this.disabled.set(isDisabled); }

  protected onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.value.set(v);
    this.onChange(v);                                       // control -> form, on USER change only
  }
}
```

The same `CaeInput` plugs into `formControlName="email"` (reactive), `[(ngModel)]` (template-driven), or a Signal Forms `FormField` binding — because all three speak CVA.

**A reusable synchronous validator** (the form, not the control, decides to use it):

```ts
export function notBlank(): ValidatorFn {
  return c => (c.value?.trim()?.length ? null : { blank: true });
}
// consumer: new FormControl('', { validators: [Validators.required, notBlank()] })
```

**Observable → signal at the boundary** (keep the template signal-driven):

```ts
readonly user = toSignal(this.http.get<User>('/me'), { initialValue: null }); // template reads user()
```

## 5. Bleeding Edge

Tracked live in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted here:

- **Signal Forms maturity.** Stable as of v22 but young; its interop with CVA-based custom controls and its cross-field/async-validation ergonomics are the things to watch before Caelum leans on exact APIs.
- **`resource()` / `rxResource()` for async validation and async option loading** — newly stable (platform note); promising for server-validated fields and remote select options, used sparingly at the edges (a library exposes data seams, not opinionated fetching — `Book 01 §3.5`).
- **`linkedSignal` for dependent control state** — e.g. a child select that resets when its parent changes — is a cleaner pattern than the `effect`-resets-state code it replaces.

## 6. Gaps & Opportunities

- **Signal-Forms API specifics are not yet curriculum.** This book frames the architecture (CVA stays the bridge); the exact `form()`/schema/`FieldTree` surface is sourced in the platform note and may evolve — a `coverage_gap` until it settles into a deep-dive section.
- **Locale/format parity for numeric & masked inputs (R3)** — grouping, currency, paste, negatives — is deliberately deferred to Book 08 (Numeric, Mask & Specialized Inputs); flagged here so a reader doesn't expect it in the base control.
- **Cross-field & async validation ergonomics** across both forms systems is thin everywhere in the ecosystem; Caelum should pick one consistent pattern and document it (Book 07).

## 7. AI & Claude Code Integration

- **High leverage:** generating CVA boilerplate (the four methods are mechanical and easy to get subtly wrong by hand); scaffolding validators and their tests; converting `@Input` to `input()`; writing round-trip value-fidelity tests across `null`/empty/zero/ordered-multi cases.
- **~1× (bring judgment):** the *silent* CVA bugs — a missing `registerOnTouched`, a `writeValue` that echoes back through `onChange` and loops, a numeric control coercing `0` — present as "works in the demo," so catching them needs the adversarial test discipline, not a generated happy path. Locale/format edge cases (R3) are judgment, not lookup.

## 8. Exercises & Further Reading

**Exercises:**

1. Implement `CaeInput` as above; bind it three ways (`formControlName`, `[(ngModel)]`, a Signal Forms `FormField`) and confirm all three round-trip value, disabled, and touched.
2. Write the value-fidelity test matrix: `writeValue(null)`, `writeValue('')`, a numeric `0`, and a multi-value control's ordering — prove none are silently coerced.
3. Add a `notBlank` validator and an `ErrorStateMatcher`; verify the error appears only after blur (touched), not on first render.
4. Replace an `effect`-that-resets-a-signal with `linkedSignal` and argue why the latter is safer.

**Further reading (external — verify currency against the platform note):**

- Angular signals guide — https://angular.dev/guide/signals
- Reactive forms — https://angular.dev/guide/forms/reactive-forms
- `ControlValueAccessor` API — https://angular.dev/api/forms/ControlValueAccessor
- Signal Forms overview — https://angular.dev/guide/forms/signals/overview
- RxJS interop (`toSignal`/`toObservable`) — https://angular.dev/ecosystem/rxjs-interop

**In-library:** `Book 01 §3.3` (signals & DI as the platform spine) and `Book 01 §3.2` (zoneless/OnPush — why signal-driven controls matter); Book 07 (Form Control Fundamentals) and Book 08 (Numeric, Mask & Specialized Inputs) build the depth this book frames; the frontier note [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md).

---

*Conventions: build controls on `ControlValueAccessor` (forms-API-agnostic); derive with `computed`, side-effect with `effect`, never the reverse; value fidelity and touched/disabled are contract, not decoration; version-specific claims are grounded in the `research/` layer.*
