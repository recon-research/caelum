import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { DateAdapter, provideNativeDateAdapter } from '@angular/material/core';
import {
  DateRange,
  type DateFilterFn,
  MatDatepickerModule,
  MatEndDate,
  MatStartDate,
} from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { CaeFormFieldControlBase } from 'caelum/form-field';

/**
 * How many dates `cae-datepicker` selects — the value shape follows this (issue #666). Stage 1 ships
 * `'single'` and `'range'`; `'multiple'` (a `Date[]` value) is added in stage 2, so it is deliberately
 * NOT in this union yet — a not-yet-supported mode is a compile error rather than a silent degrade to
 * single mode that would clobber the consumer's model.
 */
export type CaeDateSelectionMode = 'single' | 'range';

/**
 * The value shape for `selectionMode="range"` — a library-owned pair, so a consumer types their
 * form model without importing Material's `DateRange` (adapter isolation: Material stays behind
 * `cae-datepicker`). `cae-datepicker` converts to/from Material's `DateRange` internally.
 */
export interface CaeDateRange {
  /** The range's start, or `null` while only the end is set / nothing is set. */
  start: Date | null;
  /** The range's end, or `null` while only the start is set / nothing is set. */
  end: Date | null;
}

/**
 * The CVA value of `cae-datepicker`, whose shape follows `[selectionMode]` (Book 07 §3.1 — the model
 * is the value, never the display text): a `Date | null` for `single`, a {@link CaeDateRange} for
 * `range`. Empty is always `null` (including a range whose start *and* end are both cleared).
 * Stage 2 widens this with a `Date[]` arm for `multiple` (a backward-compatible addition).
 */
export type CaeDatepickerValue = Date | CaeDateRange | null;

/** A disabled-dates predicate — `true` keeps a date selectable. Receives a real (non-null) `Date`. */
export type CaeDateFilter = (date: Date) => boolean;

/**
 * `cae-datepicker` — the full-parity date picker over Material's datepicker family
 * (`reference/COMPARISON.md`: `p-datepicker`, was `p-calendar`, → `cae-datepicker`; Book 09 §3.5 —
 * a datepicker is the canonical *value-bearing overlay*, so the overlay is an implementation detail
 * and the **CVA is the public contract**). It joins the `mat-form-field`-wrapping control family via
 * {@link CaeFormFieldControlBase} — a text-input surface, so the shared inputs
 * (`label`/`placeholder`/`hint`/`required`/`disabled`/`appearance`/`ariaLabel`/`errorMessages`), the
 * `ControlValueAccessor`, and the validation-error forwarding all come from the base; this class adds
 * the picker modes.
 *
 * **Staged delivery (issue #666).** Full parity is the ticket's definition of done; it lands as the
 * ticket's pre-authorised two-stage *sequencing* (not a scope cut):
 * - **Stage 1 (this component today):** `single` + `range`, each as an input-with-overlay *and*
 *   `[inline]` calendar; `[minDate]`/`[maxDate]`/`[dateFilter]` enforced on *both* paths — click
 *   (Material disables out-of-range/filtered calendar cells) *and* keyboard: this component is a
 *   `Validator` on the OUTER control (Material's own `validate()` runs only against a control bound to
 *   the *inner* input, which the wrapper never has), so a typed out-of-range/filtered date flags
 *   `matDatepickerMin`/`matDatepickerMax`/`matDatepickerFilter` — map those keys in `errorMessages`.
 *   Plus `[startView]`; focus into the overlay on open and back to the trigger on close (Material's
 *   `restoreFocus`, Book 09 §3.6 gate 2).
 * - **Stage 2 (follow-up PR under #666):** `multiple` (the one genuine *build* — a
 *   `CaeMultiDateSelectionModel` driving `<mat-calendar>` via `[dateClass]`/`(_userSelection)`,
 *   since Material ships no multi-date model and no DI seam to inject one), time/datetime via
 *   `MatTimepicker`, month-only/year-only via `startView` + `(monthSelected)`/`(yearSelected)`, and
 *   the `showToday`/`showClear` affordances.
 *
 * **Date adapter.** Provides Material's native adapter at the *component* injector
 * (`provideNativeDateAdapter()`), so a consumer adopts `cae-datepicker` with no app-level config and
 * **no new runtime dependency** — the US-origin/free provenance gate stays green (no Moment/Luxon/
 * date-fns). Trade-off: a component-level provider also *overrides* any app-root `DateAdapter` /
 * `MAT_DATE_FORMATS` for this subtree, so app-level locale/format customization does not currently
 * reach `cae-datepicker`; a `[dateFormats]`/custom-adapter seam is its own future slice.
 *
 * Zoneless-compatible: `OnPush` + signal state, no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-datepicker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, MatDatepickerModule],
  providers: [provideNativeDateAdapter()],
  template: `
    <!-- The MatFormFieldControl (matInput / mat-date-range-input) must be a DIRECT child of its
         mat-form-field — a control nested inside @switch/@case is not seen by the field's control
         query, so its label-float/error wiring throws at change detection. So the mode branch lives
         OUTSIDE the form field: each branch is a complete, self-contained field. -->
    @if (inline()) {
      <div class="cae-datepicker__inline">
        @if (selectionMode() === 'range') {
          <mat-calendar
            [selected]="materialRange()"
            [startAt]="startAt()"
            [startView]="startView()"
            [minDate]="minDate()"
            [maxDate]="maxDate()"
            [dateFilter]="calendarFilter()"
            (selectedChange)="onInlineRangeChange($event)"
          />
        } @else {
          <mat-calendar
            [selected]="singleValue()"
            [startAt]="startAt()"
            [startView]="startView()"
            [minDate]="minDate()"
            [maxDate]="maxDate()"
            [dateFilter]="calendarFilter()"
            (selectedChange)="onSingleChange($event)"
          />
        }
        @if (shouldShowInlineErrors()) {
          @for (message of activeErrorMessages(); track $index) {
            <div class="cae-datepicker__error">{{ message }}</div>
          }
        }
      </div>
    } @else if (selectionMode() === 'range') {
      <mat-form-field [appearance]="appearance()">
        @if (label()) {
          <mat-label>{{ label() }}</mat-label>
        }
        <mat-date-range-input
          [rangePicker]="rangePicker"
          [min]="minDate()"
          [max]="maxDate()"
          [dateFilter]="inputFilter()"
          [disabled]="isDisabled()"
          [required]="required()"
        >
          <input
            matStartDate
            [value]="rangeStart()"
            [errorStateMatcher]="errorStateMatcher"
            [attr.aria-label]="startAriaLabel() || null"
            (dateChange)="onRangeStart($event.value)"
            (blur)="onTouched()"
          />
          <input
            matEndDate
            [value]="rangeEnd()"
            [errorStateMatcher]="errorStateMatcher"
            [attr.aria-label]="endAriaLabel() || null"
            (dateChange)="onRangeEnd($event.value)"
            (blur)="onTouched()"
          />
        </mat-date-range-input>
        <mat-datepicker-toggle matSuffix [for]="rangePicker" [disabled]="isDisabled()" />
        <mat-date-range-picker #rangePicker [startView]="startView()" [startAt]="startAt()" />
        @if (hint()) {
          <mat-hint>{{ hint() }}</mat-hint>
        }
        @for (message of activeErrorMessages(); track $index) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>
    } @else {
      <mat-form-field [appearance]="appearance()">
        @if (label()) {
          <mat-label>{{ label() }}</mat-label>
        }
        <input
          matInput
          [matDatepicker]="picker"
          [value]="singleValue()"
          [min]="minDate()"
          [max]="maxDate()"
          [matDatepickerFilter]="inputFilter()"
          [disabled]="isDisabled()"
          [required]="required()"
          [errorStateMatcher]="errorStateMatcher"
          [placeholder]="placeholder()"
          [attr.aria-label]="ariaLabel() || null"
          (dateChange)="onSingleChange($event.value)"
          (blur)="onTouched()"
        />
        <mat-datepicker-toggle matSuffix [for]="picker" [disabled]="isDisabled()" />
        <mat-datepicker #picker [startView]="startView()" [startAt]="startAt()" />
        @if (hint()) {
          <mat-hint>{{ hint() }}</mat-hint>
        }
        @for (message of activeErrorMessages(); track $index) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>
    }
  `,
  styles: `
    :host,
    mat-form-field {
      display: block;
    }
    .cae-datepicker__inline {
      display: inline-block;
      /* Token-only surface (Book 09 §3.6 gate 5): frame the bare calendar like every other
         Caelum overlay pane, since it has no mat-form-field chrome of its own. */
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface);
    }
    .cae-datepicker__error {
      color: var(--cae-color-error);
      font-size: var(--cae-text-sm);
      padding: var(--cae-space-1) var(--cae-space-2);
    }
  `,
})
export class CaeDatepicker extends CaeFormFieldControlBase<CaeDatepickerValue> {
  private readonly adapter = inject<DateAdapter<Date>>(DateAdapter);

  constructor() {
    super();
    // Detach the imperatively-attached validator when this control is destroyed, so it never lingers
    // on a control that outlives it (e.g. a reused `[formControl]`).
    inject(DestroyRef).onDestroy(() => this.detachValidator());
    // A changed *bound* (min/max/filter) must re-run the outer control's validation — the value
    // itself already re-validates through the CVA on change, but a bound change does not on its own.
    effect(() => {
      this.minDate();
      this.maxDate();
      this.dateFilter();
      this.validatedControl?.updateValueAndValidity();
    });
  }

  /** How many dates to pick — drives the value shape (`Date | null` for single, {@link CaeDateRange} for range). */
  readonly selectionMode = input<CaeDateSelectionMode>('single');
  /** Render the calendar in place (no text input / overlay) instead of an input with a popup. */
  readonly inline = input(false, { transform: booleanAttribute });
  /** Earliest selectable date; blocks earlier dates by keyboard entry *and* calendar click. */
  readonly minDate = input<Date | null>(null);
  /** Latest selectable date; blocks later dates by keyboard entry *and* calendar click. */
  readonly maxDate = input<Date | null>(null);
  /** Predicate disabling individual dates (`true` = selectable). Enforced in input and calendar. */
  readonly dateFilter = input<CaeDateFilter | null>(null);
  /** Which panel the calendar opens on — `month` (default), `year`, or `multi-year`. */
  readonly startView = input<'month' | 'year' | 'multi-year'>('month');
  /** The date the calendar first focuses when opened with no value. */
  readonly startAt = input<Date | null>(null);
  /** Accessible name for the range's start input (`range` mode). */
  readonly startAriaLabel = input('');
  /** Accessible name for the range's end input (`range` mode). */
  readonly endAriaLabel = input('');

  protected override emptyValue(): CaeDatepickerValue {
    return null;
  }

  // --- Per-mode reads off the single CVA value seam ---
  /** The value as a single `Date`, or `null` when empty / a different-shaped mode. */
  protected readonly singleValue = computed<Date | null>(() => {
    const v = this.value();
    return v instanceof Date ? v : null;
  });
  private currentRange(): CaeDateRange {
    const v = this.value();
    // A stale single `Date` (e.g. left over across a mode switch) reads as an empty range, not a crash.
    return v && !(v instanceof Date) ? v : { start: null, end: null };
  }
  protected readonly rangeStart = computed<Date | null>(() => this.currentRange().start);
  protected readonly rangeEnd = computed<Date | null>(() => this.currentRange().end);
  /** Material's `DateRange` view of the value — what `<mat-calendar>` renders in inline range mode. */
  protected readonly materialRange = computed(
    () => new DateRange<Date>(this.rangeStart(), this.rangeEnd()),
  );

  // --- Disabled-date wiring: two filter shapes, recomputed so a filter swap re-renders the panel ---
  /** `MatDatepickerInput`'s filter — receives a possibly-null date. Recomputed on filter change. */
  protected readonly inputFilter = computed<DateFilterFn<Date | null>>(() => {
    const f = this.dateFilter();
    return f ? (d) => (d ? f(d) : true) : () => true;
  });
  /** `MatCalendar`/`MatDateRangeInput`'s filter — receives a non-null date. Recomputed on filter change. */
  protected readonly calendarFilter = computed<(date: Date) => boolean>(() => {
    const f = this.dateFilter();
    return f ? (d) => f(d) : () => true;
  });

  // --- Inner Material controls, poked to recompute the bridged error state (base contract) ---
  private readonly matInput = viewChild(MatInput);
  private readonly startInput = viewChild(MatStartDate);
  private readonly endInput = viewChild(MatEndDate);
  protected updateInnerErrorState(): void {
    // Only the rendered mode's control resolves; the others are undefined (guarded).
    this.matInput()?.updateErrorState();
    this.startInput()?.updateErrorState();
    this.endInput()?.updateErrorState();
  }

  /**
   * Whether to surface the inline calendar's error text. The `mat-form-field` modes get their
   * `<mat-error>` gated by MatFormField's error state; the bare inline calendar has no field, so it
   * would otherwise show `activeErrorMessages()` (which is untriggered) while pristine. Reuse the base's
   * `errorStateMatcher` (invalid && touched) so inline matches the sibling modes and the base contract.
   */
  protected shouldShowInlineErrors(): boolean {
    return this.errorStateMatcher.isErrorState(null, null);
  }

  // --- Commit handlers (push the mode-shaped value out through the CVA) ---
  /** Emit the empty value (`null`) when a range collapses to both-endpoints-null; a real pair otherwise. */
  private commitRange(start: Date | null, end: Date | null): void {
    this.commitValue(start === null && end === null ? this.emptyValue() : { start, end });
  }
  protected onSingleChange(date: Date | null): void {
    this.onTouched(); // the inline calendar has no blur to mark touched; picking IS the interaction
    this.commitValue(date);
  }
  protected onRangeStart(date: Date | null): void {
    this.commitRange(date, this.rangeEnd());
  }
  protected onRangeEnd(date: Date | null): void {
    this.commitRange(this.rangeStart(), date);
  }
  /**
   * A bare `<mat-calendar>` has no range selection model, so build the range here from successive
   * clicks (Material's standard standalone-calendar range recipe): the first click — or a click
   * before the current start, or a click once a full range exists — starts a new range; the next
   * click on/after the start closes it.
   */
  protected onInlineRangeChange(date: Date | null): void {
    this.onTouched();
    const { start, end } = this.currentRange();
    if (!start || end || (date && this.adapter.compareDate(date, start) < 0)) {
      this.commitRange(date, null);
    } else {
      this.commitRange(start, date);
    }
  }

  // --- Validator: enforce min/max/filter on the OUTER control (the keyboard path) ---
  // The base self-injects its NgControl, so this component cannot ALSO be an NG_VALIDATORS provider
  // (that forms a DI cycle). Instead the validator is attached to the bound control imperatively,
  // re-targeted on control swap (`ngDoCheck`) and removed on destroy.
  private validatedControl: AbstractControl | null = null;
  private readonly boundValidator: ValidatorFn = (control) => this.validate(control);

  override ngDoCheck(): void {
    const control = this.boundControl();
    if (control !== this.validatedControl) {
      this.validatedControl?.removeValidators(this.boundValidator);
      this.validatedControl = control;
      control?.addValidators(this.boundValidator);
      control?.updateValueAndValidity({ emitEvent: false });
    }
    super.ngDoCheck();
  }

  private detachValidator(): void {
    this.validatedControl?.removeValidators(this.boundValidator);
    this.validatedControl?.updateValueAndValidity({ emitEvent: false });
    this.validatedControl = null;
  }

  /**
   * Flag a committed value that violates `[minDate]`/`[maxDate]`/`[dateFilter]` with Material's own
   * error keys, so the existing `errorMessages` bridge surfaces it (mirrors `MatDatepickerInput`'s
   * validators, which never run here because the consumer's control binds to the outer element).
   */
  validate(control: AbstractControl): ValidationErrors | null {
    const min = this.minDate();
    const max = this.maxDate();
    const filter = this.dateFilter();
    for (const date of this.datesOf(control.value)) {
      if (min && this.adapter.compareDate(date, min) < 0) {
        return { matDatepickerMin: { min, actual: date } };
      }
      if (max && this.adapter.compareDate(date, max) > 0) {
        return { matDatepickerMax: { max, actual: date } };
      }
      if (filter && !filter(date)) {
        return { matDatepickerFilter: true };
      }
    }
    return null;
  }
  /** Every concrete `Date` inside a value, whatever the mode's shape (empty range endpoints skipped). */
  private datesOf(value: CaeDatepickerValue): Date[] {
    if (value == null) return [];
    if (value instanceof Date) return [value];
    return [value.start, value.end].filter((d): d is Date => d instanceof Date);
  }
}
