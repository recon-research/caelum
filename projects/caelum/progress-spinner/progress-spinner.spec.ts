import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { CaeProgressSpinner } from './progress-spinner';
import { expectNoA11yViolations } from '../testing/a11y';

describe('CaeProgressSpinner', () => {
  let fixture: ComponentFixture<CaeProgressSpinner>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CaeProgressSpinner] });
    fixture = TestBed.createComponent(CaeProgressSpinner);
  });

  function spinner(): HTMLElement {
    return fixture.nativeElement.querySelector('mat-progress-spinner')!;
  }

  it('has no axe violations (named via ariaLabel)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Loading');
    fixture.detectChanges();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('defaults to an indeterminate progressbar (min/max pinned, no aria-valuenow)', () => {
    fixture.detectChanges();
    expect(spinner().getAttribute('role')).toBe('progressbar');
    expect(spinner().getAttribute('aria-valuemin')).toBe('0');
    expect(spinner().getAttribute('aria-valuemax')).toBe('100');
    expect(spinner().getAttribute('aria-valuenow')).toBeNull();
  });

  it('computes an auto strokeWidth (diameter / 10) by default and honours an explicit value', () => {
    // The wrapper binds `strokeWidth() || diameter() / 10`, computing the auto value itself rather
    // than relying on Material's `value || 0` setter (which would render an invisible 0-stroke).
    fixture.componentRef.setInput('diameter', 50);
    fixture.detectChanges();
    const inner = fixture.debugElement.query(By.directive(MatProgressSpinner))
      .componentInstance as MatProgressSpinner;
    expect(inner.strokeWidth).toBe(5); // 0 (default) → auto = 50 / 10
    fixture.componentRef.setInput('strokeWidth', 8);
    fixture.detectChanges();
    expect(inner.strokeWidth).toBe(8); // explicit value passes straight through
  });

  it('reflects value as aria-valuenow in determinate mode', () => {
    fixture.componentRef.setInput('mode', 'determinate');
    fixture.componentRef.setInput('value', 60);
    fixture.detectChanges();
    expect(spinner().getAttribute('aria-valuenow')).toBe('60');
  });

  it('applies diameter to the host size', () => {
    fixture.componentRef.setInput('diameter', 64);
    fixture.detectChanges();
    expect(spinner().style.width).toBe('64px');
    expect(spinner().style.height).toBe('64px');
  });

  it('forwards ariaLabel as an accessible name (absent when empty)', () => {
    fixture.detectChanges();
    expect(spinner().hasAttribute('aria-label')).toBe(false);
    fixture.componentRef.setInput('ariaLabel', 'Loading');
    fixture.detectChanges();
    expect(spinner().getAttribute('aria-label')).toBe('Loading');
  });
});
