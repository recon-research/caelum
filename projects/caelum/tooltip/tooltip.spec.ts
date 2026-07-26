import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';

import { CaeTooltip } from './tooltip';
import { expectNoA11yViolations } from '../testing/a11y';

@Component({
  imports: [CaeTooltip],
  template: `<button caeTooltip="Save changes" caeTooltipPosition="above">Go</button>`,
})
class TipHost {}

describe('CaeTooltip', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TipHost] }).compileComponents();
  });

  it('applies MatTooltip as a host directive with the aliased message', () => {
    const fixture = TestBed.createComponent(TipHost);
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.message).toBe('Save changes');
  });

  it('forwards the aliased position input', () => {
    const fixture = TestBed.createComponent(TipHost);
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tip.position).toBe('above');
  });

  // Scanned SHOWN, and at the default (whole-body) root rather than the fixture — both deliberate.
  // A resting tooltip is just a button, so a fixture-scoped scan of it would assert almost nothing;
  // and the directive's one a11y mechanism is `aria-describedby`, whose target MatTooltip renders
  // through AriaDescriber into a container *outside* this fixture. Scoping to `fixture.nativeElement`
  // would therefore leave the describedby pointing at an id the scan cannot see — which is both less
  // coverage and a different question than the one worth asking.
  it('has no axe violations with the tooltip shown (the aria-describedby target resolves)', async () => {
    const fixture = TestBed.createComponent(TipHost);
    fixture.detectChanges();
    const tip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    tip.show(0);
    fixture.detectChanges();
    await fixture.whenStable();

    await expectNoA11yViolations();

    // Not vacuous: prove the state under scan is the SHOWN one. If MatTooltip ever stops rendering
    // synchronously here, this fails loudly instead of leaving the axe call to pass on a bare page.
    expect(tip._isTooltipVisible()).toBe(true);
    tip.hide(0);
  });
});
