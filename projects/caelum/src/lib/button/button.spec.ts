import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatButton } from '@angular/material/button';

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
});
