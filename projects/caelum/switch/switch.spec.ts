import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeSwitch } from './switch';

describe('CaeSwitch', () => {
  let component: CaeSwitch;
  let fixture: ComponentFixture<CaeSwitch>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeSwitch] }).compileComponents();
    fixture = TestBed.createComponent(CaeSwitch);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  // MatSlideToggle's focusable control is a <button role="switch"> (M3), not an <input> — so
  // state is read from aria-checked and the native disabled attribute.
  const nativeSwitch = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[role="switch"]');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue(true);
    fixture.detectChanges();
    expect(nativeSwitch().getAttribute('aria-checked')).toBe('true');
  });

  it('propagates a user toggle back to the form (registerOnChange)', () => {
    let latest: boolean | undefined;
    component.registerOnChange((v) => (latest = v));
    nativeSwitch().click();
    fixture.detectChanges();
    expect(latest).toBe(true);
    expect(nativeSwitch().getAttribute('aria-checked')).toBe('true');
  });

  it('marks touched on blur (registerOnTouched via focusout)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    nativeSwitch().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(touched).toBe(true);
  });

  it('disables the control when the form model disables it (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(nativeSwitch().disabled).toBe(true);
  });

  it('disables via the template input too (merged with the form model)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(nativeSwitch().disabled).toBe(true);
  });

  it('coerces a bare disabled attribute (booleanAttribute)', () => {
    fixture.componentRef.setInput('disabled', '');
    fixture.detectChanges();
    expect(component.disabled()).toBe(true);
    expect(nativeSwitch().disabled).toBe(true);
  });

  it('sets aria-required when required (booleanAttribute)', () => {
    fixture.componentRef.setInput('required', '');
    fixture.detectChanges();
    expect(component.required()).toBe(true);
    expect(nativeSwitch().getAttribute('aria-required')).toBe('true');
  });

  it('forwards ariaDescribedby to the focusable button (the consumer-error a11y hook, #47)', () => {
    // Absent by default (no dangling reference to a non-existent id).
    expect(nativeSwitch().getAttribute('aria-describedby')).toBeNull();
    fixture.componentRef.setInput('ariaDescribedby', 'notify-hint');
    fixture.detectChanges();
    expect(nativeSwitch().getAttribute('aria-describedby')).toBe('notify-hint');
  });
});
