import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeToggleButton } from './toggle-button';

describe('CaeToggleButton', () => {
  let component: CaeToggleButton;
  let fixture: ComponentFixture<CaeToggleButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeToggleButton] }).compileComponents();
    fixture = TestBed.createComponent(CaeToggleButton);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  // A standalone mat-button-toggle's focusable control is a <button> with role="button" and
  // aria-pressed (the WAI-ARIA toggle-button pattern), not the radio/aria-checked pattern.
  const nativeButton = (): HTMLButtonElement => fixture.nativeElement.querySelector('button');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses the toggle-button a11y pattern (role=button + aria-pressed)', () => {
    expect(nativeButton().getAttribute('role')).toBe('button');
    expect(nativeButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue(true);
    fixture.detectChanges();
    expect(nativeButton().getAttribute('aria-pressed')).toBe('true');
  });

  it('propagates a user toggle back to the form (registerOnChange)', () => {
    let latest: boolean | undefined;
    component.registerOnChange((v) => (latest = v));
    nativeButton().click();
    fixture.detectChanges();
    expect(latest).toBe(true);
    expect(nativeButton().getAttribute('aria-pressed')).toBe('true');
  });

  it('marks touched on blur (registerOnTouched via focusout)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    nativeButton().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(touched).toBe(true);
  });

  it('disables the control when the form model disables it (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(nativeButton().disabled).toBe(true);
  });

  it('disables via the template input too (merged with the form model)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(nativeButton().disabled).toBe(true);
  });

  it('coerces a bare disabled attribute (booleanAttribute)', () => {
    fixture.componentRef.setInput('disabled', '');
    fixture.detectChanges();
    expect(component.disabled()).toBe(true);
    expect(nativeButton().disabled).toBe(true);
  });

  it('forwards ariaDescribedby onto the focusable button (the consumer-error a11y hook, #47)', async () => {
    // Absent by default (no dangling reference), then applied directly to the inner <button>
    // since mat-button-toggle has no aria-describedby input.
    expect(nativeButton().getAttribute('aria-describedby')).toBeNull();
    fixture.componentRef.setInput('ariaDescribedby', 'pin-hint');
    await fixture.whenStable();
    expect(nativeButton().getAttribute('aria-describedby')).toBe('pin-hint');
  });
});
