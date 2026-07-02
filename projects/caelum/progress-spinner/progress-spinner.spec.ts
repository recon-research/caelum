import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CaeProgressSpinner } from './progress-spinner';

describe('CaeProgressSpinner', () => {
  let fixture: ComponentFixture<CaeProgressSpinner>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CaeProgressSpinner] });
    fixture = TestBed.createComponent(CaeProgressSpinner);
  });

  function spinner(): HTMLElement {
    return fixture.nativeElement.querySelector('mat-progress-spinner')!;
  }

  it('defaults to an indeterminate progressbar (no aria-valuenow)', () => {
    fixture.detectChanges();
    expect(spinner().getAttribute('role')).toBe('progressbar');
    expect(spinner().getAttribute('aria-valuenow')).toBeNull();
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
