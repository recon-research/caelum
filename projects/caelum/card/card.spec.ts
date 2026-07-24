import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeCard } from './card';
import { expectNoA11yViolations } from '../testing/a11y';

describe('CaeCard', () => {
  let fixture: ComponentFixture<CaeCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeCard] }).compileComponents();
    fixture = TestBed.createComponent(CaeCard);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('has no axe violations (titled/subtitled card)', async () => {
    fixture.componentRef.setInput('title', 'Workspace');
    fixture.componentRef.setInput('subtitle', 'Overview');
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('renders the title into a card header when provided', () => {
    fixture.componentRef.setInput('title', 'Workspace');
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('mat-card-title');
    expect(title?.textContent).toContain('Workspace');
  });

  it('omits the header entirely when no title or subtitle is set', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-card-header')).toBeNull();
  });
});
