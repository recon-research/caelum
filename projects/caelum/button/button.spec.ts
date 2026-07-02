import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';

import { CaeButton } from './button';

describe('CaeButton', () => {
  let fixture: ComponentFixture<CaeButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeButton] }).compileComponents();
    fixture = TestBed.createComponent(CaeButton);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a Material button carrying the requested variant', () => {
    fixture.componentRef.setInput('variant', 'outlined');
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.directive(MatButton));
    expect(button).toBeTruthy();
    // Material aliases the `appearance` input to the `matButton` binding.
    expect(button.injector.get(MatButton).appearance).toBe('outlined');
  });

  it('forwards the disabled state to the native button', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
  });

  it('applies the tooltip to the inner focusable button, not the wrapper host (#36)', () => {
    fixture.componentRef.setInput('tooltip', 'Save the workspace');
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip));
    // The directive must sit on the real <button> — the element a keyboard/SR user focuses —
    // so its hover/focus trigger and aria-describedby land where they are announced.
    expect(tip).toBeTruthy();
    expect((tip.nativeElement as HTMLElement).tagName).toBe('BUTTON');
    expect(tip.injector.get(MatTooltip).message).toBe('Save the workspace');
  });

  it('forwards the tooltip position', () => {
    fixture.componentRef.setInput('tooltip', 'Save');
    fixture.componentRef.setInput('tooltipPosition', 'above');
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.position).toBe('above');
  });

  it('disables the tooltip when empty (default) so a plain button attaches nothing', () => {
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.disabled).toBe(true);
  });

  it('enables the tooltip once text is set', () => {
    fixture.componentRef.setInput('tooltip', 'Now described');
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.disabled).toBe(false);
  });

  it('puts aria-describedby on the inner button only when a tooltip is present (#36)', async () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    // Empty default → no description on a plain button.
    await fixture.whenStable();
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    // With text → the description (rendered by AriaDescriber after the next render) lands on
    // the focusable inner <button>, the element a screen-reader user actually reaches.
    fixture.componentRef.setInput('tooltip', 'Save the workspace');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
  });
});
