import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { CaeAutocomplete, CaeAutocompleteOption } from './autocomplete';
import { expectNoA11yViolations } from '../testing/a11y';

/**
 * MatAutocomplete opens its panel in a CDK overlay that needs real focus/layout to attach, which
 * jsdom stubs out — so the panel's options and keyboard navigation aren't exercised here (that is
 * deferred to the M4 real-browser a11y pass, like the slider #110). These tests drive the CVA + the
 * client-side filter at the component boundary: `writeValue` → the rendered input display, the
 * `(optionSelected)` handler → the committed value, `(input)` → the filtered list, and the strict
 * blur reconciliation. The error-forwarding bridge is exercised through a host with a real
 * `[formControl]`.
 */
const OPTIONS: CaeAutocompleteOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'de', label: 'Germany', disabled: true },
];

describe('CaeAutocomplete', () => {
  let component: CaeAutocomplete;
  let fixture: ComponentFixture<CaeAutocomplete>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
    fixture = TestBed.createComponent(CaeAutocomplete);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  const inputEl = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
  // The (optionSelected) template binding passes $event.option.value straight to the handler.
  const pick = (value: string): void => component['onSelected'](value);

  it('creates and renders a matInput wired to a mat-autocomplete', () => {
    expect(component).toBeTruthy();
    expect(inputEl()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('mat-autocomplete')).not.toBeNull();
  });

  it('has no axe violations (named via ariaLabel; the panel is a real-browser check per the header note)', async () => {
    // Named via ariaLabel, not the visible [label] — mat-form-field's MDC floating label is
    // CSS-positioned and axe judges it "hidden" in jsdom (same fix as input.spec.ts). The
    // suggestion panel needs real focus/layout to attach in jsdom (this file's header comment),
    // so — like every other test in this file — this stays at the CVA/rendered-input boundary.
    fixture.componentRef.setInput('ariaLabel', 'Country');
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('renders the chosen label in the input when the form writes a value (writeValue)', async () => {
    component.writeValue('uk');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['selectedOption']()?.label).toBe('United Kingdom');
    expect(inputEl().value).toBe('United Kingdom');
  });

  it('commits the chosen suggestion key when an option is selected (registerOnChange)', () => {
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    pick('us');
    expect(latest).toBe('us');
    expect(component['value']()).toBe('us');
  });

  it('does not echo onChange when the form writes a value (the CVA no-echo invariant)', () => {
    let calls = 0;
    component.registerOnChange(() => calls++);
    component.writeValue('uk');
    fixture.detectChanges();
    expect(calls).toBe(0);
  });

  it('filters the suggestions by the typed text (case-insensitive label match)', () => {
    component['onType']('king'); // matches "United Kingdom"
    expect(component['filtered']().map((o) => o.value)).toEqual(['uk']);
  });

  it('shows all suggestions when nothing is typed, or when the input still shows the chosen label', () => {
    expect(component['filtered']().length).toBe(3); // empty query → all
    component.writeValue('us');
    fixture.detectChanges();
    component['onType']('United States'); // equals the chosen label → not a filter, show all
    expect(component['filtered']().length).toBe(3);
  });

  it('resets the filter query on a programmatic write so the panel is not stale-filtered (#121 review)', () => {
    // Regression for the CONFIRMED MAJOR: a prior filter left `query` stale, then a form patch/reset
    // (writeValue) must not leave the panel filtered by the old text.
    component['onType']('king'); // query='king' → filters to only United Kingdom
    expect(component['filtered']().length).toBe(1);
    component.writeValue('us'); // a programmatic write (form patch / reset)
    fixture.detectChanges();
    expect(component['filtered']().length).toBe(3); // full list again, not the stale [uk]
  });

  it('clears whitespace-only text on blur even when the model is already empty', () => {
    const el = inputEl();
    el.value = '   ';
    component['onBlur'](el); // model already '' → no commit fires, so onBlur must clear directly
    expect(el.value).toBe('');
  });

  it('honours a custom filterWith predicate', () => {
    fixture.componentRef.setInput('filterWith', (o: CaeAutocompleteOption, q: string) =>
      o.value.startsWith(q),
    );
    component['onType']('u'); // both us + uk start with "u"
    expect(
      component['filtered']()
        .map((o) => o.value)
        .sort(),
    ).toEqual(['uk', 'us']);
  });

  it('reverts un-selected typed text to the chosen label on blur (strict combobox)', () => {
    let calls = 0;
    component.writeValue('us');
    fixture.detectChanges();
    component.registerOnChange(() => calls++);
    const el = inputEl();
    el.value = 'typed but never picked';
    component['query'].set(el.value);
    component['onBlur'](el);
    expect(el.value).toBe('United States'); // reverted to the committed label
    expect(calls).toBe(0); // model unchanged — no spurious commit
  });

  it('commits the empty selection when the input is cleared then blurred', () => {
    let latest: unknown = 'unset';
    component.writeValue('us');
    fixture.detectChanges();
    component.registerOnChange((v) => (latest = v));
    const el = inputEl();
    el.value = '';
    component['onBlur'](el);
    expect(latest).toBe('');
    expect(component['value']()).toBe('');
  });

  it('marks touched on blur (registerOnTouched)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    component['onBlur'](inputEl());
    expect(touched).toBe(true);
  });

  it('disables the input via the form model and the template input (merged)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(inputEl().disabled).toBe(true);
    component.setDisabledState(false);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(inputEl().disabled).toBe(true);
  });

  it('coerces a bare disabled attribute (booleanAttribute, from the base)', () => {
    fixture.componentRef.setInput('disabled', '');
    fixture.detectChanges();
    expect(component.disabled()).toBe(true);
  });

  it('marks the input required when required is set', () => {
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(inputEl().required).toBe(true);
  });
});

// --- Error-forwarding bridge (needs a real NgControl on the OUTER element) ---
@Component({
  imports: [CaeAutocomplete, ReactiveFormsModule],
  template: `
    <cae-autocomplete
      [formControl]="ctrl"
      [options]="opts"
      [errorMessages]="{ required: 'Pick a country' }"
      label="Country"
    />
  `,
})
class HostCmp {
  readonly ctrl = new FormControl('', { validators: [Validators.required] });
  readonly opts = OPTIONS;
}

describe('CaeAutocomplete — validation-error forwarding', () => {
  it('forwards the bound control validity into a <mat-error> once touched', async () => {
    const fixture = TestBed.createComponent(HostCmp);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    // Untouched required-empty: invalid but no error shown yet (library-wide timing).
    expect(fixture.nativeElement.querySelector('mat-error')).toBeNull();
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement;
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('Pick a country');
  });
});
