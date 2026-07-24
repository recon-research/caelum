import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CaeProgressBar } from './progress-bar';
import { expectNoA11yViolations } from '../testing/a11y';

describe('CaeProgressBar', () => {
  let fixture: ComponentFixture<CaeProgressBar>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CaeProgressBar] });
    fixture = TestBed.createComponent(CaeProgressBar);
  });

  function bar(): HTMLElement {
    return fixture.nativeElement.querySelector('mat-progress-bar')!;
  }

  it('has no axe violations (named via ariaLabel)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Upload progress');
    fixture.componentRef.setInput('value', 42);
    fixture.detectChanges();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('renders a progressbar with static min/max', () => {
    fixture.detectChanges();
    expect(bar()).toBeTruthy();
    expect(bar().getAttribute('role')).toBe('progressbar');
    expect(bar().getAttribute('aria-valuemin')).toBe('0');
    expect(bar().getAttribute('aria-valuemax')).toBe('100');
  });

  it('reflects value as aria-valuenow in determinate mode', () => {
    fixture.componentRef.setInput('value', 42);
    fixture.detectChanges();
    expect(bar().getAttribute('aria-valuenow')).toBe('42');
  });

  it('omits aria-valuenow while indeterminate', () => {
    fixture.componentRef.setInput('mode', 'indeterminate');
    fixture.componentRef.setInput('value', 42);
    fixture.detectChanges();
    expect(bar().getAttribute('aria-valuenow')).toBeNull();
  });

  it('forwards ariaLabel as an accessible name (absent when empty)', () => {
    fixture.detectChanges();
    expect(bar().hasAttribute('aria-label')).toBe(false);
    fixture.componentRef.setInput('ariaLabel', 'Upload progress');
    fixture.detectChanges();
    expect(bar().getAttribute('aria-label')).toBe('Upload progress');
  });
});
