import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CaeDivider } from './divider';

describe('CaeDivider', () => {
  let fixture: ComponentFixture<CaeDivider>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CaeDivider] });
    fixture = TestBed.createComponent(CaeDivider);
  });

  function divider(): HTMLElement {
    return fixture.nativeElement.querySelector('mat-divider')!;
  }

  it('renders a horizontal separator by default', () => {
    fixture.detectChanges();
    expect(divider().getAttribute('role')).toBe('separator');
    expect(divider().getAttribute('aria-orientation')).toBe('horizontal');
    expect(divider().classList).toContain('mat-divider-horizontal');
  });

  it('reflects vertical as aria-orientation + class', () => {
    fixture.componentRef.setInput('vertical', true);
    fixture.detectChanges();
    expect(divider().getAttribute('aria-orientation')).toBe('vertical');
    expect(divider().classList).toContain('mat-divider-vertical');
  });

  it('applies the inset class', () => {
    fixture.componentRef.setInput('inset', true);
    fixture.detectChanges();
    expect(divider().classList).toContain('mat-divider-inset');
  });
});
