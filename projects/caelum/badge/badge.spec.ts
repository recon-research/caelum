import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatBadge } from '@angular/material/badge';

import { CaeBadge } from './badge';
import { expectNoA11yViolations } from '../testing/a11y';

@Component({
  imports: [CaeBadge],
  template: `
    <button
      [caeBadge]="count"
      caeBadgePosition="below after"
      caeBadgeSize="large"
      caeBadgeDescription="3 unread notifications"
      caeBadgeOverlap="false"
      [caeBadgeDisabled]="disabled()"
      [caeBadgeHidden]="hidden()"
    >
      Inbox
    </button>
  `,
})
class BadgeHost {
  count: string | number = 3;
  readonly disabled = signal(false);
  readonly hidden = signal(false);
}

describe('CaeBadge', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BadgeHost] }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(BadgeHost);
    fixture.detectChanges();
    const badge = fixture.debugElement.query(By.directive(MatBadge)).injector.get(MatBadge);
    return { fixture, badge };
  }

  it('has no axe violations (described badge count on a named host)', async () => {
    const { fixture } = render();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('applies MatBadge as a host directive with the aliased content', () => {
    const { badge } = render();
    expect(`${badge.content}`).toBe('3');
  });

  it('forwards the aliased position, size, and (a11y) description', () => {
    const { badge } = render();
    expect(badge.position).toBe('below after');
    expect(badge.size).toBe('large');
    expect(badge.description).toBe('3 unread notifications');
  });

  it('forwards the aliased overlap and disabled inputs (a typo in either alias would slip)', () => {
    const { fixture, badge } = render();
    expect(badge.overlap).toBe(false);
    expect(badge.disabled).toBe(false);
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    expect(badge.disabled).toBe(true);
  });

  it('renders the badge count into the DOM', () => {
    const { fixture } = render();
    const content = fixture.nativeElement.querySelector('.mat-badge-content');
    expect(content?.textContent).toContain('3');
  });

  it('hides the badge via caeBadgeHidden while keeping the host element mounted', () => {
    const { fixture, badge } = render();
    expect(badge.hidden).toBe(false);
    fixture.componentInstance.hidden.set(true);
    fixture.detectChanges();
    expect(badge.hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('button')).toBeTruthy();
  });
});
