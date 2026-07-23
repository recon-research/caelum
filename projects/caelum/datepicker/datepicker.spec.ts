import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';
import {
  DateRange,
  MatCalendar,
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerInputEvent,
  MatDateRangeInput,
  MatEndDate,
  MatStartDate,
} from '@angular/material/datepicker';

import { CaeDatepicker, CaeDateRange } from './datepicker';

const jan = (day: number): Date => new Date(2026, 0, day); // 2026-01-<day>, local time

/** A minimal `(dateChange)` payload — the range handlers only read `.value` (`Date | null`). */
const dateChange = (value: Date | null): MatDatepickerInputEvent<Date, DateRange<Date>> =>
  ({ value }) as unknown as MatDatepickerInputEvent<Date, DateRange<Date>>;

describe('CaeDatepicker — single mode', () => {
  let component: CaeDatepicker;
  let fixture: ComponentFixture<CaeDatepicker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeDatepicker] }).compileComponents();
    fixture = TestBed.createComponent(CaeDatepicker);
    component = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement); // real focus/overlay anchoring
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy(); // closes any open picker overlay
    fixture.nativeElement.remove();
    TestBed.inject(OverlayContainer).ngOnDestroy(); // drop the CDK overlay container (document.body)
  });

  const dateInput = (): MatDatepickerInput<Date> =>
    fixture.debugElement.query(By.directive(MatDatepickerInput)).injector.get(MatDatepickerInput);
  const picker = (): MatDatepicker<Date> =>
    fixture.debugElement.query(By.directive(MatDatepicker)).injector.get(MatDatepicker);

  it('creates and renders an input inside a mat-form-field (not an inline calendar)', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('mat-form-field')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[matInput]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('mat-calendar')).toBeNull(); // overlay-only until opened
  });

  it('renders a datepicker toggle button as the open affordance', () => {
    expect(fixture.nativeElement.querySelector('mat-datepicker-toggle button')).toBeTruthy();
  });

  it('reflects a Date written by the form model into the input (writeValue)', () => {
    component.writeValue(jan(15));
    fixture.detectChanges();
    expect(dateInput().value).toEqual(jan(15));
  });

  it('propagates a picked Date back to the form as a Date (registerOnChange)', () => {
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    picker().select(jan(9));
    picker().close();
    fixture.detectChanges();
    expect(latest).toEqual(jan(9));
  });

  it('renders the calendar in a CDK overlay while the picker is open', async () => {
    expect(document.querySelector('mat-calendar')).toBeNull(); // nothing before open
    picker().open();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(picker().opened).toBe(true);
    // The calendar renders in the CDK overlay (document.body) only while open — the structural
    // precondition for "focus moves into the calendar". The actual focus-INTO on open + restore-to-
    // trigger on close are Material's async (afterNextRender + focus-trap) behaviour, which jsdom
    // cannot run deterministically, so they are verified in a real browser (#683), not flakily here.
    expect(document.querySelector('mat-calendar')).toBeTruthy();

    picker().close(); // cleanup; the CDK overlay tears down asynchronously
  });

  it('marks touched on input blur (registerOnTouched)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    const el = fixture.nativeElement.querySelector('input[matInput]') as HTMLElement;
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(touched).toBe(true);
  });

  it('disables the inner input when the form model disables it (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(dateInput().disabled).toBe(true);
  });

  it('binds [minDate]/[maxDate] onto the inner input', () => {
    fixture.componentRef.setInput('minDate', jan(5));
    fixture.componentRef.setInput('maxDate', jan(25));
    fixture.detectChanges();
    expect(dateInput().min).toEqual(jan(5));
    expect(dateInput().max).toEqual(jan(25));
  });

  // KEYBOARD path: Material's own MatDatepickerInput validators never run here (the consumer's
  // control binds to the OUTER element), so cae-datepicker is itself a Validator on the outer control.
  it('flags a typed out-of-range date on the OUTER control (keyboard-path min/max enforcement)', () => {
    fixture.componentRef.setInput('minDate', jan(5));
    fixture.componentRef.setInput('maxDate', jan(25));
    fixture.detectChanges();
    expect(component.validate(new FormControl(jan(1)))).toEqual({
      matDatepickerMin: { min: jan(5), actual: jan(1) },
    });
    expect(component.validate(new FormControl(jan(30)))).toEqual({
      matDatepickerMax: { max: jan(25), actual: jan(30) },
    });
    expect(component.validate(new FormControl(jan(10)))).toBeNull();
  });

  it('flags a typed filtered date on the OUTER control (matDatepickerFilter)', () => {
    fixture.componentRef.setInput('dateFilter', (d: Date) => d.getDate() !== 10);
    fixture.detectChanges();
    expect(component.validate(new FormControl(jan(10)))).toEqual({ matDatepickerFilter: true });
    expect(component.validate(new FormControl(jan(11)))).toBeNull();
  });

  it('validates BOTH endpoints of a range value', () => {
    fixture.componentRef.setInput('minDate', jan(5));
    fixture.detectChanges();
    expect(component.validate(new FormControl({ start: jan(1), end: jan(20) }))).toEqual({
      matDatepickerMin: { min: jan(5), actual: jan(1) },
    });
    expect(component.validate(new FormControl({ start: jan(6), end: jan(20) }))).toBeNull();
  });

  // CLICK path: Material disables out-of-range / filtered calendar cells.
  it('disables out-of-range cells in the calendar (minDate blocks the click)', async () => {
    fixture.componentRef.setInput('minDate', jan(15));
    fixture.componentRef.setInput('startAt', jan(20));
    fixture.detectChanges();
    picker().open();
    fixture.detectChanges();
    await fixture.whenStable();
    const cells = Array.from(document.querySelectorAll('.mat-calendar-body-cell')) as HTMLElement[];
    // Disabled cells carry aria-disabled="true"; enabled cells carry no such attribute (null).
    expect(cells.find((c) => c.textContent?.trim() === '10')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(
      cells.find((c) => c.textContent?.trim() === '20')?.getAttribute('aria-disabled'),
    ).not.toBe('true');
    picker().close();
  });

  it('disables filtered dates in the calendar (dateFilter blocks the click)', async () => {
    // Reject the 10th of any month.
    fixture.componentRef.setInput('dateFilter', (d: Date) => d.getDate() !== 10);
    fixture.componentRef.setInput('startAt', jan(1));
    fixture.detectChanges();
    picker().open();
    fixture.detectChanges();
    await fixture.whenStable();
    const cells = Array.from(document.querySelectorAll('.mat-calendar-body-cell')) as HTMLElement[];
    const tenth = cells.find((c) => c.textContent?.trim() === '10');
    expect(tenth?.getAttribute('aria-disabled')).toBe('true');
    picker().close();
  });
});

describe('CaeDatepicker — range mode', () => {
  let component: CaeDatepicker;
  let fixture: ComponentFixture<CaeDatepicker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeDatepicker] }).compileComponents();
    fixture = TestBed.createComponent(CaeDatepicker);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('selectionMode', 'range');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy(); // closes any open picker overlay
    fixture.nativeElement.remove();
    TestBed.inject(OverlayContainer).ngOnDestroy(); // drop the CDK overlay container (document.body)
  });

  const startInput = (): MatStartDate<Date> =>
    fixture.debugElement.query(By.directive(MatStartDate)).injector.get(MatStartDate);
  const endInput = (): MatEndDate<Date> =>
    fixture.debugElement.query(By.directive(MatEndDate)).injector.get(MatEndDate);

  it('renders a mat-date-range-input with start + end inputs', () => {
    expect(fixture.nativeElement.querySelector('mat-date-range-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[matStartDate]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[matEndDate]')).toBeTruthy();
    expect(fixture.debugElement.query(By.directive(MatDateRangeInput))).toBeTruthy();
  });

  it('populates both inputs from a CaeDateRange written by the form model', () => {
    const range: CaeDateRange = { start: jan(3), end: jan(9) };
    component.writeValue(range);
    fixture.detectChanges();
    expect(startInput().value).toEqual(jan(3));
    expect(endInput().value).toEqual(jan(9));
  });

  it('emits a CaeDateRange object (not display text) when the start changes', () => {
    let latest: unknown;
    component.writeValue({ start: null, end: jan(20) });
    component.registerOnChange((v) => (latest = v));
    fixture.detectChanges();
    startInput().dateChange.emit(dateChange(jan(4)));
    expect(latest).toEqual({ start: jan(4), end: jan(20) });
  });

  it('emits a CaeDateRange preserving the existing start when the end changes', () => {
    let latest: unknown;
    component.writeValue({ start: jan(4), end: null });
    component.registerOnChange((v) => (latest = v));
    fixture.detectChanges();
    endInput().dateChange.emit(dateChange(jan(11)));
    expect(latest).toEqual({ start: jan(4), end: jan(11) });
  });

  it('emits the empty value (null), not {start:null,end:null}, when both endpoints are cleared', () => {
    // A filled-then-cleared range must equal the reset/initial empty, so Validators.required still
    // treats it as empty (an object would read as "present").
    let latest: unknown = 'unset';
    component.writeValue({ start: jan(4), end: null });
    component.registerOnChange((v) => (latest = v));
    fixture.detectChanges();
    startInput().dateChange.emit(dateChange(null)); // clear the only remaining endpoint
    expect(latest).toBeNull();
  });

  it('disables both range inputs when the form model disables the control (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(startInput().disabled).toBe(true);
    expect(endInput().disabled).toBe(true);
  });
});

describe('CaeDatepicker — inline mode', () => {
  let component: CaeDatepicker;
  let fixture: ComponentFixture<CaeDatepicker>;

  async function make(mode: 'single' | 'range'): Promise<void> {
    await TestBed.configureTestingModule({ imports: [CaeDatepicker] }).compileComponents();
    fixture = TestBed.createComponent(CaeDatepicker);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('inline', true);
    fixture.componentRef.setInput('selectionMode', mode);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    fixture.destroy(); // closes any open picker overlay
    fixture.nativeElement.remove();
    TestBed.inject(OverlayContainer).ngOnDestroy(); // drop the CDK overlay container (document.body)
  });

  const calendar = (): MatCalendar<Date> =>
    fixture.debugElement.query(By.directive(MatCalendar)).componentInstance;

  it('renders a bare mat-calendar in place, with no mat-form-field', async () => {
    await make('single');
    expect(fixture.nativeElement.querySelector('mat-calendar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('mat-form-field')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cae-datepicker__inline')).toBeTruthy();
  });

  it('emits the picked Date through the CVA in inline single mode', async () => {
    await make('single');
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    calendar().selectedChange.emit(jan(14));
    expect(latest).toEqual(jan(14));
  });

  it('builds a CaeDateRange from two successive clicks in inline range mode', async () => {
    await make('range');
    let latest: CaeDateRange | undefined;
    component.registerOnChange((v) => (latest = v as CaeDateRange));
    calendar().selectedChange.emit(jan(5)); // first click → start
    expect(latest).toEqual({ start: jan(5), end: null });
    component.writeValue(latest!);
    fixture.detectChanges();
    calendar().selectedChange.emit(jan(12)); // second click on/after start → closes range
    expect(latest).toEqual({ start: jan(5), end: jan(12) });
  });

  it('restarts the range when a click precedes the current start', async () => {
    await make('range');
    let latest: CaeDateRange | undefined;
    component.registerOnChange((v) => (latest = v as CaeDateRange));
    component.writeValue({ start: jan(10), end: null });
    fixture.detectChanges();
    calendar().selectedChange.emit(jan(4)); // earlier than start → begin a new range at jan(4)
    expect(latest).toEqual({ start: jan(4), end: null });
  });

  it('restarts the range when a click lands after an already-complete range', async () => {
    await make('range');
    let latest: CaeDateRange | undefined;
    component.registerOnChange((v) => (latest = v as CaeDateRange));
    component.writeValue({ start: jan(2), end: jan(8) });
    fixture.detectChanges();
    calendar().selectedChange.emit(jan(20)); // complete range exists → start fresh
    expect(latest).toEqual({ start: jan(20), end: null });
  });
});

// Validation-error forwarding (via CaeFormFieldControlBase): the consumer binds their control to
// the OUTER <cae-datepicker>, so this exercises the bridge that reflects that control's validity
// into the inner input's error state — identical contract to cae-input/cae-select.
@Component({
  imports: [CaeDatepicker, ReactiveFormsModule],
  template: `
    <cae-datepicker [formControl]="ctrl" [errorMessages]="messages" label="Start date" />
  `,
})
class DatepickerErrorHost {
  readonly ctrl = new FormControl<Date | null>(null, { validators: [Validators.required] });
  messages: Record<string, string> = { required: 'A date is required' };
}

describe('CaeDatepicker — validation errors', () => {
  let fixture: ComponentFixture<DatepickerErrorHost>;
  let host: DatepickerErrorHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DatepickerErrorHost] }).compileComponents();
    fixture = TestBed.createComponent(DatepickerErrorHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const errorText = (): string =>
    fixture.nativeElement.querySelector('mat-error')?.textContent?.trim() ?? '';

  it('stays silent while the control is untouched', () => {
    expect(host.ctrl.invalid).toBe(true);
    expect(errorText()).toBe('');
  });

  it('shows the mapped message once the control is invalid and touched', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(errorText()).toContain('A date is required');
  });

  it('clears the error when the control becomes valid', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    host.ctrl.setValue(jan(15));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(errorText()).toBe('');
  });
});

// Inline mode has no mat-form-field to gate its error text, so the component gates the inline
// error region with the same invalid-&&-touched trigger (regression guard: it previously rendered
// errors while pristine).
@Component({
  imports: [CaeDatepicker, ReactiveFormsModule],
  template: `
    <cae-datepicker
      [formControl]="ctrl"
      [inline]="true"
      [errorMessages]="messages"
      ariaLabel="Date"
    />
  `,
})
class InlineDatepickerErrorHost {
  readonly ctrl = new FormControl<Date | null>(null, { validators: [Validators.required] });
  messages: Record<string, string> = { required: 'A date is required' };
}

describe('CaeDatepicker — inline error gating', () => {
  let fixture: ComponentFixture<InlineDatepickerErrorHost>;
  let host: InlineDatepickerErrorHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InlineDatepickerErrorHost],
    }).compileComponents();
    fixture = TestBed.createComponent(InlineDatepickerErrorHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const inlineError = (): string =>
    fixture.nativeElement.querySelector('.cae-datepicker__error')?.textContent?.trim() ?? '';

  it('does NOT show inline errors while the control is pristine/untouched', () => {
    expect(host.ctrl.invalid).toBe(true);
    expect(inlineError()).toBe('');
  });

  it('shows the inline error once the control is invalid and touched', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(inlineError()).toContain('A date is required');
  });
});

// Proves the min/max/filter validator is actually ATTACHED to the bound control (not just a method
// the unit tests call) — the keyboard-path enforcement the component exists to provide. Without the
// imperative wiring, ctrl.value stays "valid" and no error surfaces.
@Component({
  imports: [CaeDatepicker, ReactiveFormsModule],
  template: `
    <cae-datepicker [formControl]="ctrl" [minDate]="min" [errorMessages]="messages" label="Due" />
  `,
})
class DatepickerBoundValidatorHost {
  readonly min = new Date(2026, 0, 10);
  readonly ctrl = new FormControl<Date | null>(new Date(2026, 0, 1)); // before min → invalid
  messages: Record<string, string> = { matDatepickerMin: 'Too early' };
}

describe('CaeDatepicker — min/max validator wiring (keyboard path)', () => {
  let fixture: ComponentFixture<DatepickerBoundValidatorHost>;
  let host: DatepickerBoundValidatorHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatepickerBoundValidatorHost],
    }).compileComponents();
    fixture = TestBed.createComponent(DatepickerBoundValidatorHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const errorText = (): string =>
    fixture.nativeElement.querySelector('mat-error')?.textContent?.trim() ?? '';

  it('marks the bound control invalid when its value violates minDate (validator IS wired)', () => {
    expect(host.ctrl.hasError('matDatepickerMin')).toBe(true);
  });

  it('surfaces the mapped message once the control is touched', async () => {
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(errorText()).toContain('Too early');
  });

  it('clears the error once the value moves into range', async () => {
    host.ctrl.setValue(new Date(2026, 0, 15));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.ctrl.hasError('matDatepickerMin')).toBe(false);
  });
});
