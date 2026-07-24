import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { OverlayModule } from '@angular/cdk/overlay';
import { MatButtonModule } from '@angular/material/button';
import { DateAdapter, provideNativeDateAdapter } from '@angular/material/core';
import {
  DateRange,
  type DateFilterFn,
  MatCalendar,
  type MatDatepicker,
  MatDatepickerModule,
  MatEndDate,
  MatStartDate,
} from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { CaeFormFieldControlBase } from 'caelum/form-field';

import { CaeMultiDateSelectionModel } from './multi-date-selection-model';

/**
 * How many dates `cae-datepicker` selects — the value shape follows this (issue #666): a
 * `Date | null` for `'single'`, a {@link CaeDateRange} for `'range'`, and a `Date[]` for
 * `'multiple'`. Time/datetime, month-only and year-only are *modifiers* on single selection
 * (`[timeOnly]`/`[showTime]`/`[view]`), not selection modes — their value stays a single `Date`.
 */
export type CaeDateSelectionMode = 'single' | 'range' | 'multiple';

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
 * is the value, never the display text): a `Date | null` for `single` (and its time/datetime/month/
 * year modifiers), a {@link CaeDateRange} for `range`, a `Date[]` for `multiple`. Empty is `null`
 * for single/range; for `multiple` it is an empty array `[]` — an array model stays an array so a
 * consumer's `.length` read never hits `null` (the one carve-out from the "empty is null" rule).
 */
export type CaeDatepickerValue = Date | Date[] | CaeDateRange | null;

/** A disabled-dates predicate — `true` keeps a date selectable. Receives a real (non-null) `Date`. */
export type CaeDateFilter = (date: Date) => boolean;

/** The calendar's granularity for single selection — a full date, a whole month, or a whole year. */
export type CaeDatepickerView = 'date' | 'month' | 'year';

/**
 * `cae-datepicker` — the full-parity date/time picker over Material's datepicker family
 * (`reference/COMPARISON.md`: `p-datepicker`, was `p-calendar`, → `cae-datepicker`; Book 09 §3.5 —
 * a datepicker is the canonical *value-bearing overlay*, so the overlay is an implementation detail
 * and the **CVA is the public contract**). It joins the `mat-form-field`-wrapping control family via
 * {@link CaeFormFieldControlBase} — a text-input surface, so the shared inputs
 * (`label`/`placeholder`/`hint`/`required`/`disabled`/`appearance`/`ariaLabel`/`errorMessages`), the
 * `ControlValueAccessor`, and the validation-error forwarding all come from the base; this class adds
 * the picker modes.
 *
 * **Modes (full parity, #666).**
 * - `[selectionMode]` — `single` (default), `range` (a {@link CaeDateRange}), or `multiple` (a
 *   `Date[]`). `range` and `single` each render as an input-with-overlay *and*, under `[inline]`, a
 *   bare `<mat-calendar>`.
 * - `multiple` — Material ships no multi-date model, so `cae-datepicker` drives a bare
 *   `<mat-calendar>` from {@link CaeMultiDateSelectionModel} (the one genuine *build*): inline, or a
 *   read-only input opening a CDK-overlay calendar (Material's own popup hard-wires single selection
 *   in its providers, so it cannot be repurposed). `[dateClass]` highlights the set; each pick toggles.
 * - `[timeOnly]` / `[showTime]` — a time picker (`MatTimepicker`), alone or paired with the date input
 *   for a datetime; the value stays a single `Date` carrying the chosen time.
 * - `[view]` — `date` (default), `month` (pick a whole month), or `year` (pick a whole year), for the
 *   non-inline single form; the value is the first of the chosen month / Jan 1 of the chosen year.
 *   (Inline month/year is deferred — MatCalendar always drills to the day view; see #666 follow-ups.)
 * - `[minDate]`/`[maxDate]`/`[dateFilter]` enforced on click (Material disables cells) *and* keyboard
 *   (this component is a `Validator` on the OUTER control — Material's own validators run only against
 *   the inner input, which the wrapper never has — flagging `matDatepickerMin`/`Max`/`Filter`; map
 *   those keys in `errorMessages`). `[showToday]`/`[showClear]` add quick-set / clear affordances.
 *
 * **Date adapter.** Provides Material's native adapter at the *component* injector
 * (`provideNativeDateAdapter()`), so a consumer adopts `cae-datepicker` with no app-level config and
 * **no new runtime dependency** — the US-origin/free provenance gate stays green (no Moment/Luxon/
 * date-fns). Trade-off: a component-level provider also *overrides* any app-root `DateAdapter` /
 * `MAT_DATE_FORMATS` for this subtree, so app-level locale/format customization (and month/year
 * display formats) do not currently reach `cae-datepicker`; a `[dateFormats]`/custom-adapter seam is
 * its own future slice. Time combination (datetime) is likewise native-`Date`-based.
 *
 * Zoneless-compatible: `OnPush` + signal state, no zone-coupled APIs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-datepicker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    A11yModule,
    OverlayModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatTimepickerModule,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    <!-- The MatFormFieldControl (matInput / mat-date-range-input) must be a DIRECT child of its
         mat-form-field — a control nested inside @switch/@case is not seen by the field's control
         query, so its label-float/error wiring throws at change detection. So the mode branch lives
         OUTSIDE the form field: each branch is a complete, self-contained field. -->
    @if (timeOnly()) {
      <!-- Time-only: a single MatTimepicker input; the value is a Date carrying the chosen time. -->
      <mat-form-field [appearance]="appearance()">
        @if (label()) {
          <mat-label>{{ label() }}</mat-label>
        }
        <input
          matInput
          [matTimepicker]="timeOnlyPicker"
          [value]="singleValue()"
          [disabled]="isDisabled()"
          [required]="required()"
          [errorStateMatcher]="errorStateMatcher"
          [placeholder]="placeholder()"
          [attr.aria-label]="ariaLabel() || null"
          (valueChange)="onTimeOnlyChange($event)"
          (blur)="onTouched()"
        />
        <mat-timepicker-toggle matSuffix [for]="timeOnlyPicker" [disabled]="isDisabled()" />
        <mat-timepicker #timeOnlyPicker />
        @if (hint()) {
          <mat-hint>{{ hint() }}</mat-hint>
        }
        @for (message of activeErrorMessages(); track $index) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>
      <ng-container [ngTemplateOutlet]="actions" />
    } @else if (selectionMode() === 'multiple') {
      @if (inline()) {
        <div class="cae-datepicker__inline">
          <mat-calendar
            [selected]="null"
            [startAt]="startAt()"
            [minDate]="minDate()"
            [maxDate]="maxDate()"
            [dateFilter]="calendarFilter()"
            [dateClass]="multiDateClass()"
            (selectedChange)="onMultipleChange($event)"
          />
          <ng-container [ngTemplateOutlet]="actions" />
          @if (shouldShowInlineErrors()) {
            @for (message of activeErrorMessages(); track $index) {
              <div class="cae-datepicker__error">{{ message }}</div>
            }
          }
        </div>
      } @else {
        <mat-form-field
          class="cae-datepicker__field"
          cdkOverlayOrigin
          #multiOrigin="cdkOverlayOrigin"
          [appearance]="appearance()"
        >
          @if (label()) {
            <mat-label>{{ label() }}</mat-label>
          }
          <input
            matInput
            readonly
            [value]="multiDisplay()"
            [disabled]="isDisabled()"
            [required]="required()"
            [errorStateMatcher]="errorStateMatcher"
            [placeholder]="placeholder()"
            [attr.aria-label]="ariaLabel() || null"
            [attr.aria-haspopup]="'dialog'"
            [attr.aria-expanded]="multiOpen()"
            (click)="openMulti()"
            (keydown)="onMultiTriggerKeydown($event)"
            (blur)="onTouched()"
          />
          <button
            matIconButton
            matSuffix
            type="button"
            class="cae-datepicker__multi-toggle"
            [disabled]="isDisabled()"
            [attr.aria-label]="'Open calendar'"
            (click)="toggleMulti()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="24" height="24">
              <path
                fill="currentColor"
                d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H5V10h14v10Zm0-12H5V6h14v2Z"
              />
            </svg>
          </button>
          @if (hint()) {
            <mat-hint>{{ hint() }}</mat-hint>
          }
          @for (message of activeErrorMessages(); track $index) {
            <mat-error>{{ message }}</mat-error>
          }
        </mat-form-field>
        <ng-template
          cdkConnectedOverlay
          [cdkConnectedOverlayOrigin]="multiOrigin"
          [cdkConnectedOverlayOpen]="multiOpen()"
          [cdkConnectedOverlayHasBackdrop]="true"
          cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
          (backdropClick)="closeMulti()"
          (detach)="closeMulti()"
        >
          <div
            class="cae-datepicker__panel"
            role="dialog"
            [attr.aria-label]="label() || ariaLabel() || 'Choose dates'"
            cdkTrapFocus
            [cdkTrapFocusAutoCapture]="true"
            (keydown.escape)="closeMulti()"
          >
            <mat-calendar
              [selected]="null"
              [startAt]="startAt()"
              [minDate]="minDate()"
              [maxDate]="maxDate()"
              [dateFilter]="calendarFilter()"
              [dateClass]="multiDateClass()"
              (selectedChange)="onMultipleChange($event)"
            />
            <ng-container [ngTemplateOutlet]="actions" />
          </div>
        </ng-template>
      }
    } @else if (inline()) {
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
        <ng-container [ngTemplateOutlet]="actions" />
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
      <ng-container [ngTemplateOutlet]="actions" />
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
        <mat-datepicker
          #picker
          [startView]="effectiveStartView()"
          [startAt]="startAt()"
          (monthSelected)="onMonthSelected($event, picker)"
          (yearSelected)="onYearSelected($event, picker)"
        />
        @if (hint()) {
          <mat-hint>{{ hint() }}</mat-hint>
        }
        @for (message of activeErrorMessages(); track $index) {
          <mat-error>{{ message }}</mat-error>
        }
      </mat-form-field>
      @if (showTime()) {
        <!-- Datetime: a companion time input; date + time combine into one Date value. -->
        <mat-form-field class="cae-datepicker__time" [appearance]="appearance()">
          <mat-label>{{ timeLabel() }}</mat-label>
          <input
            matInput
            [matTimepicker]="dateTimePicker"
            [value]="singleValue()"
            [disabled]="isDisabled()"
            [errorStateMatcher]="errorStateMatcher"
            [attr.aria-label]="timeLabel()"
            (valueChange)="onTimePartChange($event)"
            (blur)="onTouched()"
          />
          <mat-timepicker-toggle matSuffix [for]="dateTimePicker" [disabled]="isDisabled()" />
          <mat-timepicker #dateTimePicker />
        </mat-form-field>
      }
      <ng-container [ngTemplateOutlet]="actions" />
    }

    <!-- Shared Today / Clear affordances (Book 09 §3.6 gate 5 — token-only), stamped per branch. -->
    <ng-template #actions>
      @if (showToday() || showClear()) {
        <div class="cae-datepicker__actions">
          @if (showClear()) {
            <button matButton type="button" [disabled]="isDisabled()" (click)="clear()">
              {{ clearLabel() }}
            </button>
          }
          @if (showToday()) {
            <button matButton type="button" [disabled]="isDisabled()" (click)="selectToday()">
              {{ todayLabel() }}
            </button>
          }
        </div>
      }
    </ng-template>
  `,
  styles: `
    :host,
    mat-form-field {
      display: block;
    }
    .cae-datepicker__inline,
    .cae-datepicker__panel {
      display: inline-block;
      /* Token-only surface (Book 09 §3.6 gate 5): frame the bare calendar like every other
         Caelum overlay pane, since it has no mat-form-field chrome of its own. */
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-raised);
    }
    .cae-datepicker__time {
      margin-block-start: var(--cae-space-2);
    }
    .cae-datepicker__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--cae-space-2);
      padding: var(--cae-space-2);
    }
    .cae-datepicker__error {
      color: var(--cae-color-error);
      font-size: var(--cae-text-sm);
      padding: var(--cae-space-1) var(--cae-space-2);
    }
    /* A day in the multiple-selection set — filled like Material's own selected cell, token-driven. */
    .cae-datepicker__multi-selected .mat-calendar-body-cell-content {
      background: var(--cae-color-primary);
      color: var(--cae-color-on-primary);
      border-color: var(--cae-color-primary);
    }
  `,
})
export class CaeDatepicker extends CaeFormFieldControlBase<CaeDatepickerValue> {
  private readonly adapter = inject<DateAdapter<Date>>(DateAdapter);
  /** The multi-date engine (toggle + ordering); re-synced from the canonical value before each pick. */
  private readonly multiModel = new CaeMultiDateSelectionModel(this.adapter);

  constructor() {
    super();
    // Detach the imperatively-attached validator when this control is destroyed, so it never lingers
    // on a control that outlives it (e.g. a reused `[formControl]`).
    inject(DestroyRef).onDestroy(() => {
      this.detachValidator();
      this.multiModel.ngOnDestroy();
    });
    // A changed *bound* (min/max/filter) must re-run the outer control's validation — the value
    // itself already re-validates through the CVA on change, but a bound change does not on its own.
    effect(() => {
      this.minDate();
      this.maxDate();
      this.dateFilter();
      this.validatedControl?.updateValueAndValidity();
    });
    // `[dateClass]` is NOT reactive in MatCalendar — its ngOnChanges re-renders only on
    // minDate/maxDate/dateFilter — so a changed multiple-selection set would leave the calendar's
    // highlight stale. Force the current view to re-init (re-reading dateClass) on every set change.
    // This MUST run in the afterRender phase: at that point the nested MatCalendar → MatMonthView
    // `[dateClass]` input has propagated, so `_init()` rebuilds the cells with the *current* function
    // (a plain `effect` fires mid-flush, before the grandchild input settles, and re-inits stale).
    afterRenderEffect(() => {
      if (this.selectionMode() !== 'multiple') return;
      this.currentMultiple(); // the reactive dep — the set the highlight must track
      for (const cal of this.calendars()) cal.updateTodaysDate();
    });
  }

  /** How many dates to pick — drives the value shape (see {@link CaeDatepickerValue}). */
  readonly selectionMode = input<CaeDateSelectionMode>('single');
  /** Render the calendar in place (no text input / overlay) instead of an input with a popup. */
  readonly inline = input(false, { transform: booleanAttribute });
  /** Time-only picker — a `MatTimepicker`; the value is a `Date` carrying the chosen time. */
  readonly timeOnly = input(false, { transform: booleanAttribute });
  /** Pair the single date input with a time input, so the value is a datetime (`Date` with a time). */
  readonly showTime = input(false, { transform: booleanAttribute });
  /** Single-selection granularity — a full date, a whole month, or a whole year (non-inline form). */
  readonly view = input<CaeDatepickerView>('date');
  /** Show a "Today" quick-set affordance. */
  readonly showToday = input(false, { transform: booleanAttribute });
  /** Show a "Clear" affordance that empties the value. */
  readonly showClear = input(false, { transform: booleanAttribute });
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
  /** Label for the companion time input (`showTime`). */
  readonly timeLabel = input('Time');
  /** Text of the "Today" button. */
  readonly todayLabel = input('Today');
  /** Text of the "Clear" button. */
  readonly clearLabel = input('Clear');

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
    return v && !(v instanceof Date) && !Array.isArray(v) ? v : { start: null, end: null };
  }
  protected readonly rangeStart = computed<Date | null>(() => this.currentRange().start);
  protected readonly rangeEnd = computed<Date | null>(() => this.currentRange().end);
  /** Material's `DateRange` view of the value — what `<mat-calendar>` renders in inline range mode. */
  protected readonly materialRange = computed(
    () => new DateRange<Date>(this.rangeStart(), this.rangeEnd()),
  );
  /** The value as a `Date[]` (`multiple` mode); `[]` for any other shape. */
  private currentMultiple(): Date[] {
    const v = this.value();
    return Array.isArray(v) ? v : [];
  }
  /** The comma-separated display for the read-only `multiple` trigger input. */
  protected readonly multiDisplay = computed(() =>
    this.currentMultiple()
      .map((d) => this.adapter.format(d, { year: 'numeric', month: 'short', day: 'numeric' }))
      .join(', '),
  );
  /** `[dateClass]` for the `multiple` calendar — marks every day in the set as selected. */
  protected readonly multiDateClass = computed<
    (date: Date, view: 'month' | 'year' | 'multi-year') => string
  >(() => {
    const dates = this.currentMultiple();
    const adapter = this.adapter;
    return (cellDate, view) =>
      view === 'month' && dates.some((d) => adapter.sameDate(d, cellDate))
        ? 'cae-datepicker__multi-selected'
        : '';
  });

  /** The calendar's start panel — forced by `[view]` (month → year panel, year → multi-year panel). */
  protected readonly effectiveStartView = computed<'month' | 'year' | 'multi-year'>(() => {
    switch (this.view()) {
      case 'month':
        return 'year';
      case 'year':
        return 'multi-year';
      default:
        return this.startView();
    }
  });

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

  /** Every rendered `<mat-calendar>` (inline and/or the multiple overlay), for forced re-highlight. */
  private readonly calendars = viewChildren(MatCalendar);

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
    // Datetime: preserve any time already picked in the companion time input — a bare commit of the
    // date would silently reset the value to midnight when the user sets time *before* the date.
    if (this.showTime() && date) {
      const next = this.combine(date, this.singleValue());
      if (!this.sameInstant(next, this.singleValue())) this.commitValue(next);
      return;
    }
    this.commitValue(date);
  }
  /** Two dates are the same instant (or both null). Guards the time handlers against echo-commit loops. */
  private sameInstant(a: Date | null, b: Date | null): boolean {
    if (a === b) return true;
    return !!a && !!b && a.getTime() === b.getTime();
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

  /** Toggle the clicked day in/out of the multiple-selection set (via the model), then commit `Date[]`. */
  protected onMultipleChange(date: Date | null): void {
    this.onTouched();
    const model = this.multiModel;
    model.updateSelection(this.currentMultiple(), this); // sync to the canonical value
    model.add(date);
    this.commitValue([...model.selection]);
  }

  // --- month/year granularity (non-inline single) — intercept + close so it never drills to days ---
  protected onMonthSelected(date: Date, picker: MatDatepicker<Date>): void {
    if (this.view() !== 'month') return;
    this.onTouched();
    this.commitValue(this.adapter.createDate(this.adapter.getYear(date), this.adapter.getMonth(date), 1));
    picker.close();
  }
  protected onYearSelected(date: Date, picker: MatDatepicker<Date>): void {
    if (this.view() !== 'year') return;
    this.onTouched();
    this.commitValue(this.adapter.createDate(this.adapter.getYear(date), 0, 1));
    picker.close();
  }

  // --- time / datetime ---
  /** Combine a date's Y/M/D with a time's H/M/S (native-`Date`-based; see the class docstring). */
  private combine(datePart: Date, timePart: Date | null): Date {
    const out = new Date(datePart);
    if (timePart) out.setHours(timePart.getHours(), timePart.getMinutes(), timePart.getSeconds(), 0);
    else out.setHours(0, 0, 0, 0);
    return out;
  }
  protected onTimeOnlyChange(time: Date | null): void {
    // Idempotent: MatTimepickerInput echoes valueChange when its [value] is re-bound after a commit,
    // so re-committing an equal instant would spin change detection (NG0103). No-op on no change.
    if (this.sameInstant(time, this.singleValue())) return;
    this.onTouched();
    this.commitValue(time);
  }
  protected onTimePartChange(time: Date | null): void {
    const base = this.singleValue() ?? (time ? this.adapter.today() : null);
    const next = base ? this.combine(base, time) : null;
    if (this.sameInstant(next, this.singleValue())) return;
    this.onTouched();
    this.commitValue(next);
  }

  // --- multiple-mode overlay control (CDK connected overlay open state) ---
  protected readonly multiOpen = signal(false);
  protected openMulti(): void {
    if (!this.isDisabled()) this.multiOpen.set(true);
  }
  protected closeMulti(): void {
    this.multiOpen.set(false);
  }
  protected toggleMulti(): void {
    if (this.isDisabled()) return;
    this.multiOpen.update((open) => !open);
  }
  protected onMultiTriggerKeydown(event: KeyboardEvent): void {
    // Open on Enter / Space / ArrowDown — the APG combobox-popup open keys.
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.openMulti();
    }
  }

  // --- Today / Clear affordances ---
  protected selectToday(): void {
    this.onTouched();
    if (this.timeOnly() || this.showTime()) {
      this.commitValue(new Date());
      return;
    }
    const today = this.adapter.today();
    switch (this.selectionMode()) {
      case 'multiple':
        this.onMultipleChange(today);
        return;
      case 'range':
        this.commitRange(today, null);
        return;
      default:
        if (this.view() === 'month') {
          this.commitValue(
            this.adapter.createDate(this.adapter.getYear(today), this.adapter.getMonth(today), 1),
          );
        } else if (this.view() === 'year') {
          this.commitValue(this.adapter.createDate(this.adapter.getYear(today), 0, 1));
        } else {
          this.commitValue(today);
        }
    }
  }
  protected clear(): void {
    this.onTouched();
    if (this.selectionMode() === 'multiple') {
      this.multiModel.updateSelection([], this);
      this.commitValue([]);
    } else {
      this.commitValue(this.emptyValue());
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
    if (Array.isArray(value)) return value.filter((d): d is Date => d instanceof Date);
    return [value.start, value.end].filter((d): d is Date => d instanceof Date);
  }
}
