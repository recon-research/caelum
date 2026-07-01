import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';

import { CaeTooltip } from './tooltip';

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
});
