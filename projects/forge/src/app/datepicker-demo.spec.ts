import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatCalendar } from '@angular/material/datepicker';

import { DatepickerDemo } from './datepicker-demo';

describe('DatepickerDemo', () => {
  let fixture: ComponentFixture<DatepickerDemo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DatepickerDemo] }).compileComponents();
    fixture = TestBed.createComponent(DatepickerDemo);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders every mode (single, range, multiple, datetime, time, month, inline)', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.forge-datepicker-card')).toBeTruthy();
    expect(el.querySelectorAll('cae-datepicker').length).toBe(7);
    // Only the inline picker renders a calendar in place; the others render inputs / closed overlays.
    expect(el.querySelectorAll('mat-calendar').length).toBe(1);
    expect(el.querySelector('input[matInput]')).toBeTruthy();
    expect(el.querySelector('mat-date-range-input')).toBeTruthy();
    // Multiple mode shows a read-only trigger with its own calendar-open button.
    expect(el.querySelector('.cae-datepicker__multi-toggle')).toBeTruthy();
    // Datetime + time modes bring the Material timepicker toggle into the demo.
    expect(el.querySelector('mat-timepicker-toggle')).toBeTruthy();
  });

  it('round-trips an inline calendar selection into the aria-live status (end-to-end CVA)', async () => {
    const status = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(status()).toContain('Selected: —'); // nothing picked yet

    const calendar = fixture.debugElement.query(By.directive(MatCalendar))
      .componentInstance as MatCalendar<Date>;
    const picked = new Date(2026, 5, 15);
    calendar.selectedChange.emit(picked); // user picks a day in the inline calendar
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // The pick flowed cae-datepicker CVA → ngModel → the demo's signal → the fmt() status text.
    expect(status()).toContain(picked.toLocaleDateString());
  });
});
