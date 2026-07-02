/**
 * Secondary entry point `caelum/form-field` (issue #46, extracted from #29/#47) — the
 * shared base for Caelum's `mat-form-field`-wrapping form controls (`cae-input`,
 * `cae-textarea`, `cae-select`). It ships the abstract `CaeFormFieldControlBase` directive:
 * the string `ControlValueAccessor` seam plus the validation-error-forwarding bridge that
 * all three controls previously carried byte-for-byte. Unlike `caelum/shared` (type-only),
 * this entry point carries runtime code, so it lives on its own so the three controls can
 * extend one copy (ng-packagr requires each source file to belong to exactly one entry
 * point). Also re-exported from the primary `caelum` barrel.
 *
 * The base is thus mechanically part of the public API (the packaging model publishes every
 * entry point and the three controls import its type across entry points, so it cannot be
 * `@internal`-stripped). Its shape is **experimental** for external subclassing — see the
 * `CaeFormFieldControlBase` docstring and #54.
 *
 * NB: the class is DECLARED in this entry file rather than re-exported from a sibling module.
 * The base is an abstract `@Directive()` that nothing instantiates within this entry point, and
 * ng-packagr's `.d.ts` flattener (rollup-plugin-dts) tree-shakes such a re-exported declaration
 * out of the bundled typings (shipping an empty `export {}`); declaring it here keeps it (#46).
 */
import {
  booleanAttribute,
  ChangeDetectorRef,
  computed,
  DestroyRef,
  Directive,
  DoCheck,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type AbstractControl, ControlValueAccessor, NgControl } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { Subscription } from 'rxjs';
import type { CaeErrorMessages, CaeFormFieldAppearance } from 'caelum/shared';

// Re-exported so a consumer subclassing the base can type the inherited `appearance` /
// `errorMessages` inputs without reaching to `caelum/shared` (matches the control entry points).
export type { CaeErrorMessages, CaeFormFieldAppearance } from 'caelum/shared';

/**
 * `CaeFormFieldControlBase` — the abstract base for Caelum's `mat-form-field`-wrapping form
 * controls (`cae-input`, `cae-textarea`, `cae-select`). It is an *abstract directive*
 * (`@Directive()`, no selector), never used on its own; each control `extends` it and adds
 * its own `@Component` decorator, template, and inner Material control. This is Angular's
 * sanctioned way to share inputs/lifecycle/DI across components (mirroring Material's own
 * control bases), and it consolidates the two seams all three controls duplicated verbatim
 * (issue #46).
 *
 * The `Base` suffix is deliberate: it disambiguates from Material's `MatFormFieldControl` (a
 * *different* concept — the contract a control IMPLEMENTS to sit INSIDE a `mat-form-field`,
 * whereas this base WRAPS one) and signals the class is not meant for direct use.
 *
 * **Stability.** This exists to share implementation across Caelum's own controls. The
 * packaging model publishes every entry point, so the symbol is importable — and you *may*
 * extend it to build a custom `mat-form-field`-wrapping control — but treat its shape as
 * **experimental**: Caelum may reshape the protected surface (`commitValue`, `errorStateMatcher`,
 * the abstract `updateInnerErrorState`) as the control set grows. Pin a version if you subclass
 * it externally (revisited by #54).
 *
 * 1. **String `ControlValueAccessor`.** These controls own an inner Material control, so the
 *    consumer binds `[(ngModel)]`/`[formControl]` to the OUTER `<cae-*>` and the value round-trips
 *    through here (Book 07 §3.1). The value seam is a `string` (not a `model()`) to match the
 *    PrimeNG migration target. Subclasses push a new value out with {@link commitValue} once they
 *    decide it is final (`cae-input`/`cae-textarea` buffer IME composition first; `cae-select`
 *    commits on each `selectionChange`).
 * 2. **Validation-error forwarding (#29/#47).** Because the consumer's control binds to the outer
 *    element, the inner Material control has no `NgControl` and its error state stays inert (Book
 *    07 §3.3). This base self-injects the OUTER `NgControl` (so it drops the `NG_VALUE_ACCESSOR`
 *    provider — the two are mutually exclusive), bridges that control's validity into the inner
 *    field with a per-control {@link errorStateMatcher} (which ignores the inner field's absent
 *    control and evaluates the outer one, delegating the *timing* to the DI `ErrorStateMatcher`
 *    so every field — and any app-root override — agrees), and recomputes the inner control's
 *    error state each `ngDoCheck` via the abstract {@link updateInnerErrorState} hook. `errorMessages`
 *    maps validator keys → text, rendered as `<mat-error>` by each subclass template through
 *    {@link activeErrorMessages}.
 *
 * a11y note (whose exact shape is the inner control's, not this base's): Material sets
 * `aria-invalid` from the bridged error state — `matInput` suppresses it on an empty *required*
 * field (only the linked `<mat-error>` text announces), whereas `mat-select` reflects it
 * unconditionally. Either way, map `required` so the message carries text (Book 07 §3.3/§3.4).
 *
 * Zoneless-compatible: subclasses are `OnPush` + signal state, and this base adds no zone-coupled
 * API (provisional on #9; Book 01 §3.2).
 */
@Directive()
export abstract class CaeFormFieldControlBase implements ControlValueAccessor, DoCheck {
  // --- Shared form-field inputs (identical across the three controls) ---
  /** Floating label text; omitted → no label. Prefer over placeholder for a11y. */
  readonly label = input('');
  /** Native placeholder. Not an accessible name — set `label` or `ariaLabel` too. */
  readonly placeholder = input('');
  /** Assistive hint under the field; omitted → no hint. */
  readonly hint = input('');
  /**
   * Marks the field required (Material renders the required marker + sets `aria-required`).
   * Mirror the bound control's `Validators.required`: for `matInput`-backed controls it also
   * drives Material's empty-field `aria-invalid` suppression, so the validator and this input
   * must agree or the a11y state diverges.
   */
  readonly required = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with any reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Form-field appearance. Defaults to `outline`. */
  readonly appearance = input<CaeFormFieldAppearance>('outline');
  /** Accessible name when no visible `label` is used. */
  readonly ariaLabel = input('');
  /**
   * Maps a bound control's validator error keys → the message shown when that error is active
   * (see `CaeErrorMessages`). Errors show on the library-wide trigger (invalid && (touched ||
   * form submitted)). An unmapped failure still styles the field invalid but shows no text — so
   * map every key you validate, `required` especially (a required-empty `matInput` suppresses
   * `aria-invalid`, so only the linked text announces it to a screen reader; Book 07 §3.3).
   */
  readonly errorMessages = input<CaeErrorMessages>({});

  // --- CVA value + disabled state ---
  /** The current string value; bound by each subclass template into its inner control. */
  protected readonly value = signal('');
  private readonly formDisabled = signal(false);
  /** Template disable OR a reactive-forms `setDisabledState` disable. */
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  private onChangeFn: (value: string) => void = () => {};
  /** Bound to the inner control's blur/focusout by each subclass template. */
  protected onTouched: () => void = () => {};

  // --- Validation-error forwarding (#29/#47) ---
  /** The OUTER control bound to `<cae-*>` — the source of validity the inner field lacks. */
  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  /** Library-wide error-timing policy (Material's default, or a consumer app-root override). */
  private readonly defaultErrorMatcher = inject(ErrorStateMatcher);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** The control instance the error subscription is bound to (re-wired if it's swapped). */
  private wiredControl: AbstractControl | null = null;
  private errorSub?: Subscription;

  /**
   * Per-control matcher bound on the inner Material control: it ignores the inner field's
   * (absent) control and evaluates the OUTER control, delegating the timing to the DI matcher
   * so the trigger is uniform library-wide and still overridable at the app root (Book 07 §3.3).
   */
  protected readonly errorStateMatcher: ErrorStateMatcher = {
    isErrorState: (_control, form) =>
      this.defaultErrorMatcher.isErrorState(this.ngControl?.control ?? null, form),
  };

  /**
   * Recompute the inner Material control's (bridged) error state. The inner control type
   * differs per subclass — `MatInput` for `cae-input`/`cae-textarea`, `MatSelect` for
   * `cae-select` — and neither recomputes on its own here (it owns no `NgControl`), so each
   * subclass queries its own inner control via `viewChild` and calls its `updateErrorState()`.
   * It may be undefined before the view initializes — guard with `?.`.
   */
  protected abstract updateInnerErrorState(): void;

  constructor() {
    // Self-injected CVA (no NG_VALUE_ACCESSOR provider) so this control can read the bound
    // NgControl's validity for error forwarding (Book 07 §4). `this` is the concrete subclass
    // instance, which carries the (inherited) CVA methods.
    if (this.ngControl) this.ngControl.valueAccessor = this;
  }

  ngDoCheck(): void {
    // (Re)wire the CD nudge whenever the bound control instance changes — the initial resolve,
    // a [formControl] swap, or form.setControl — tearing down the prior subscription.
    const control = this.ngControl?.control ?? null;
    if (control !== this.wiredControl) {
      this.wiredControl = control;
      this.wireErrorState(control);
    }
    // Recompute the bridged error state against the LIVE touched/submitted flags every check.
    // The inner control skips this itself (it has no NgControl), and `submitted` changes emit
    // no control event — and resetForm() clears the model before `submitted`, so an event-only
    // refresh would latch stale (Book 07 §3.3). Cheap: updateErrorState emits only on a flip.
    this.updateInnerErrorState();
  }

  /** The mapped messages for the bound control's currently-active errors, in error order. */
  protected activeErrorMessages(): string[] {
    const errors = this.ngControl?.control?.errors;
    if (!errors) return [];
    const messages = this.errorMessages();
    const out: string[] = [];
    for (const key of Object.keys(errors)) {
      const entry = messages[key];
      if (entry == null) continue;
      out.push(typeof entry === 'function' ? entry(errors[key]) : entry);
    }
    return out;
  }

  private wireErrorState(control: AbstractControl | null): void {
    this.errorSub?.unsubscribe();
    this.errorSub = undefined;
    if (!control) return;
    // Programmatic changes (setValue/setErrors/markAsTouched) emit no DOM event, so in a
    // zoneless app nothing schedules change detection; nudge it so ngDoCheck recomputes the
    // error state and the <mat-error> text re-renders. DOM-driven changes (blur, submit) already
    // schedule CD. takeUntilDestroyed cleans up on destroy; the stored sub is torn down on swap.
    this.errorSub = control.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());
    // One CD so ngDoCheck runs again with the inner control resolved — syncs a control that
    // starts touched + invalid.
    this.cdr.markForCheck();
  }

  /**
   * Push a new string value out through the CVA. Subclasses call this from their view handler
   * once they've decided the value is final (e.g. after IME composition ends, or on a select
   * change) — the base stays agnostic to *when* a value is committed.
   */
  protected commitValue(value: string): void {
    this.value.set(value);
    this.onChangeFn(value);
  }

  // --- ControlValueAccessor ---
  writeValue(value: string): void {
    this.value.set(value ?? '');
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
