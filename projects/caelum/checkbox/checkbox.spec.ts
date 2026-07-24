import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeCheckbox } from './checkbox';
import { expectNoA11yViolations } from '../testing/a11y';

describe('CaeCheckbox', () => {
  let component: CaeCheckbox;
  let fixture: ComponentFixture<CaeCheckbox>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeCheckbox] }).compileComponents();
    fixture = TestBed.createComponent(CaeCheckbox);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const nativeBox = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('input[type="checkbox"]');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has no axe violations (named via ariaLabel)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Accept the terms');
    await fixture.whenStable();
    fixture.detectChanges();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue(true);
    fixture.detectChanges();
    expect(nativeBox().checked).toBe(true);
  });

  it('propagates a user toggle back to the form (registerOnChange)', () => {
    let latest: boolean | undefined;
    component.registerOnChange((v) => (latest = v));
    nativeBox().click();
    fixture.detectChanges();
    expect(latest).toBe(true);
  });

  it('disables the control when the form model disables it (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(nativeBox().disabled).toBe(true);
  });

  it('disables via the template input too (merged with the form model)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(nativeBox().disabled).toBe(true);
  });

  it('forwards ariaDescribedby to the focusable input (the consumer-error a11y hook, #47)', () => {
    // Absent by default (no dangling reference to a non-existent id).
    expect(nativeBox().getAttribute('aria-describedby')).toBeNull();
    fixture.componentRef.setInput('ariaDescribedby', 'agree-error');
    fixture.detectChanges();
    expect(nativeBox().getAttribute('aria-describedby')).toBe('agree-error');
  });

  it('forwards ariaLabel to the focusable input for the label-less case (#70)', () => {
    // Absent by default — the projected label is the normal path; no empty attribute rendered.
    expect(nativeBox().getAttribute('aria-label')).toBeNull();
    fixture.componentRef.setInput('ariaLabel', 'Accept the terms');
    fixture.detectChanges();
    expect(nativeBox().getAttribute('aria-label')).toBe('Accept the terms');
  });

  it('forwards ariaLabelledby to the focusable input (#70)', () => {
    expect(nativeBox().getAttribute('aria-labelledby')).toBeNull();
    fixture.componentRef.setInput('ariaLabelledby', 'terms-heading');
    fixture.detectChanges();
    expect(nativeBox().getAttribute('aria-labelledby')).toBe('terms-heading');
  });
});
