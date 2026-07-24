import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatInput } from '@angular/material/input';
import { By } from '@angular/platform-browser';

import { CaeInputNumber } from './input-number';
import { expectNoA11yViolations } from '../testing/a11y';

describe('CaeInputNumber', () => {
  let component: CaeInputNumber;
  let fixture: ComponentFixture<CaeInputNumber>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeInputNumber] }).compileComponents();
    fixture = TestBed.createComponent(CaeInputNumber);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const nativeInput = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
  const type = (text: string): void => {
    const el = nativeInput();
    el.value = text;
    el.dispatchEvent(new Event('input'));
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has no axe violations (named via ariaLabel)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Quantity');
    await fixture.whenStable();
    fixture.detectChanges();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('formats a written number for display (writeValue: model → view)', () => {
    component.writeValue(1234.5);
    fixture.detectChanges();
    expect(nativeInput().value).toBe('1,234.5'); // en-US default
  });

  it('parses typing back to a real number, not a string (registerOnChange: view → model)', () => {
    let latest: number | null | undefined;
    component.registerOnChange((v) => (latest = v));
    type('1234');
    expect(latest).toBe(1234);
    expect(typeof latest).toBe('number');
  });

  it('keeps 0 distinct from empty (0 is a value, null is empty; Book 08 §2.2)', () => {
    const emitted: (number | null)[] = [];
    component.registerOnChange((v) => emitted.push(v));

    component.writeValue(0);
    fixture.detectChanges();
    expect(nativeInput().value).toBe('0'); // 0 shows as "0", never ""

    component.writeValue(null);
    fixture.detectChanges();
    expect(nativeInput().value).toBe(''); // null shows as empty

    type('0');
    type('');
    expect(emitted).toEqual([0, null]); // typed 0 emits 0; cleared emits null (distinct)
  });

  it('parses negatives (and treats a lone "-" as intermediate/empty)', () => {
    const emitted: (number | null)[] = [];
    component.registerOnChange((v) => emitted.push(v));
    type('-');
    type('-5');
    expect(emitted).toEqual([null, -5]);
  });

  it('reformats the view from the model on blur (not mid-typing — caret discipline)', () => {
    type('1234.5');
    // mid-typing the view keeps the raw text (no grouping injected while typing)
    expect(nativeInput().value).toBe('1234.5');
    nativeInput().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(nativeInput().value).toBe('1,234.5'); // grouping lands on blur
  });

  it('round-trips through a de-DE locale (decimal comma, "." grouping)', () => {
    fixture.componentRef.setInput('locale', 'de-DE');
    fixture.detectChanges();
    let latest: number | null | undefined;
    component.registerOnChange((v) => (latest = v));

    component.writeValue(1234.5);
    fixture.detectChanges();
    expect(nativeInput().value).toBe('1.234,5'); // formats German

    type('1.234,5'); // user types German
    expect(latest).toBe(1234.5); // model is still the canonical number
  });

  it('parses a pasted grouped de-DE string to the canonical number', () => {
    fixture.componentRef.setInput('locale', 'de-DE');
    fixture.detectChanges();
    let latest: number | null | undefined;
    component.registerOnChange((v) => (latest = v));
    type('1.234.567,89'); // as if pasted
    expect(latest).toBe(1234567.89);
  });

  it('formats and parses currency mode', () => {
    fixture.componentRef.setInput('mode', 'currency');
    fixture.componentRef.setInput('currency', 'USD');
    fixture.detectChanges();
    let latest: number | null | undefined;
    component.registerOnChange((v) => (latest = v));

    component.writeValue(1234.5);
    fixture.detectChanges();
    expect(nativeInput().value).toBe('$1,234.50'); // currency forces 2 fraction digits

    type('$2,000.25');
    expect(latest).toBe(2000.25); // symbol + grouping stripped
  });

  it('falls back to a plain decimal (dev-warn, no throw) when currency mode lacks a code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixture.componentRef.setInput('mode', 'currency');
    fixture.detectChanges();
    expect(() => {
      component.writeValue(1234.5);
      fixture.detectChanges();
    }).not.toThrow();
    expect(nativeInput().value).toBe('1,234.5'); // decimal fallback
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('honors min/max fraction digits', () => {
    fixture.componentRef.setInput('minFractionDigits', 2);
    fixture.componentRef.setInput('maxFractionDigits', 2);
    fixture.detectChanges();
    component.writeValue(5);
    fixture.detectChanges();
    expect(nativeInput().value).toBe('5.00');
  });

  it('disables via the template input (merged with setDisabledState)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(nativeInput().disabled).toBe(true);
  });

  it('exposes inputmode=decimal for on-screen numeric keyboards', () => {
    expect(nativeInput().getAttribute('inputmode')).toBe('decimal');
  });

  it('allows overriding inputMode (e.g. "text" for a negative-capable field)', () => {
    fixture.componentRef.setInput('inputMode', 'text');
    fixture.detectChanges();
    expect(nativeInput().getAttribute('inputmode')).toBe('text');
  });

  it('reformats the visible value when a formatting input changes at runtime (no stale display)', () => {
    fixture.componentRef.setInput('mode', 'currency');
    fixture.componentRef.setInput('currency', 'USD');
    fixture.detectChanges();
    component.writeValue(1234.5);
    fixture.detectChanges();
    expect(nativeInput().value).toBe('$1,234.50');
    // Flip the currency at runtime (e.g. a currency switcher beside the amount) — the field must
    // not keep showing dollars while the model is unchanged (2-lens review, Finding 1).
    fixture.componentRef.setInput('currency', 'EUR');
    fixture.detectChanges();
    expect(nativeInput().value).toBe('€1,234.50');
  });

  it('snaps the model to the displayed precision on blur (WYSIWYG — matches p-inputNumber)', () => {
    fixture.componentRef.setInput('mode', 'currency');
    fixture.componentRef.setInput('currency', 'USD');
    fixture.detectChanges();
    let latest: number | null | undefined;
    component.registerOnChange((v) => (latest = v));
    const el = nativeInput();
    el.dispatchEvent(new Event('focus'));
    el.value = '1.999';
    el.dispatchEvent(new Event('input'));
    expect(latest).toBe(1.999); // full precision while typing
    el.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(latest).toBe(2); // model rounded to the 2-dp the field actually shows
    expect(nativeInput().value).toBe('$2.00'); // display agrees with the committed model
  });

  it('does not throw when minFractionDigits > maxFractionDigits (guards like the currency path)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixture.componentRef.setInput('minFractionDigits', 3);
    fixture.componentRef.setInput('maxFractionDigits', 2);
    fixture.detectChanges();
    expect(() => {
      component.writeValue(5);
      fixture.detectChanges();
    }).not.toThrow();
    expect(nativeInput().value).toBe('5'); // both bounds dropped → plain decimal
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders empty (not "NaN") for a NaN model', () => {
    component.writeValue(Number.NaN);
    fixture.detectChanges();
    expect(nativeInput().value).toBe('');
  });

  it('rejects a malformed multi-decimal string to null', () => {
    let latest: number | null | undefined;
    component.registerOnChange((v) => (latest = v));
    type('1.2.3');
    expect(latest).toBeNull();
  });

  it('disables via the reactive-forms setDisabledState path (not just the template input)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(nativeInput().disabled).toBe(true);
  });
});

// Validation-error forwarding (#29/#47): the consumer binds their control to the OUTER
// <cae-input-number>; a range rule stays the form's ValidatorFn and its message surfaces
// through the inherited bridge — the same seam cae-input uses.
@Component({
  imports: [CaeInputNumber, ReactiveFormsModule],
  template: `
    <cae-input-number [formControl]="ctrl" [errorMessages]="messages" label="Quantity" required />
  `,
})
class NumberErrorHost {
  readonly ctrl = new FormControl<number | null>(null, {
    validators: [Validators.required, Validators.min(1)],
  });
  messages: Record<string, string> = {
    required: 'Quantity is required',
    min: 'Must be at least 1',
  };
}

describe('CaeInputNumber — validation errors', () => {
  let fixture: ComponentFixture<NumberErrorHost>;
  let host: NumberErrorHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [NumberErrorHost] }).compileComponents();
    fixture = TestBed.createComponent(NumberErrorHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const matInputErrorState = (): boolean =>
    fixture.debugElement.query(By.directive(MatInput)).injector.get(MatInput).errorState;
  const errorText = (): string =>
    fixture.nativeElement.querySelector('mat-error')?.textContent?.trim() ?? '';

  it('stays silent while untouched', () => {
    expect(host.ctrl.invalid).toBe(true);
    expect(matInputErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });

  it('forwards the form range rule (min) once invalid and touched', async () => {
    host.ctrl.setValue(0); // 0 is a real value, but fails Validators.min(1)
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(matInputErrorState()).toBe(true);
    expect(errorText()).toContain('Must be at least 1');
  });

  it('clears the error when the control becomes valid', async () => {
    host.ctrl.setValue(0);
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    host.ctrl.setValue(5);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(matInputErrorState()).toBe(false);
    expect(errorText()).toBe('');
  });
});
