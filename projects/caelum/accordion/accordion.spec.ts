import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeAccordion, CaeExpansionPanel } from './accordion';
import { expectNoA11yViolations } from '../testing/a11y';

// ---------------------------------------------------------------------------
// CaeExpansionPanel — a single collapsible panel, standalone (no accordion).
// ---------------------------------------------------------------------------
describe('CaeExpansionPanel', () => {
  let component: CaeExpansionPanel;
  let fixture: ComponentFixture<CaeExpansionPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeExpansionPanel] }).compileComponents();
    fixture = TestBed.createComponent(CaeExpansionPanel);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Section');
    await fixture.whenStable();
  });

  const header = (): HTMLElement =>
    fixture.nativeElement.querySelector('mat-expansion-panel-header');

  it('renders its title in the header', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.querySelector('mat-panel-title')?.textContent).toContain(
      'Section',
    );
  });

  it('renders a description only when one is provided', async () => {
    expect(fixture.nativeElement.querySelector('mat-panel-description')).toBeNull();
    fixture.componentRef.setInput('description', 'more detail');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('mat-panel-description')?.textContent).toContain(
      'more detail',
    );
  });

  it('starts collapsed and opens when [expanded] is set', async () => {
    expect(header().getAttribute('aria-expanded')).toBe('false');
    fixture.componentRef.setInput('expanded', true);
    await fixture.whenStable();
    expect(header().getAttribute('aria-expanded')).toBe('true');
  });

  it('emits expandedChange and opened when the user toggles it open', async () => {
    let changed: boolean | undefined;
    let openedFired = false;
    component.expandedChange.subscribe((v) => (changed = v));
    component.opened.subscribe(() => (openedFired = true));
    header().click();
    await fixture.whenStable();
    expect(changed).toBe(true);
    expect(openedFired).toBe(true);
    expect(header().getAttribute('aria-expanded')).toBe('true');
  });

  it('emits closed when toggled shut', async () => {
    fixture.componentRef.setInput('expanded', true);
    await fixture.whenStable();
    let closedFired = false;
    component.closed.subscribe(() => (closedFired = true));
    header().click();
    await fixture.whenStable();
    expect(closedFired).toBe(true);
    expect(header().getAttribute('aria-expanded')).toBe('false');
  });

  it('announces and enforces the disabled state (no toggle)', async () => {
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(header().getAttribute('aria-disabled')).toBe('true');
    header().click();
    await fixture.whenStable();
    expect(header().getAttribute('aria-expanded')).toBe('false');
  });

  it('hides the toggle indicator when hideToggle is set', async () => {
    expect(fixture.nativeElement.querySelector('.mat-expansion-indicator')).not.toBeNull();
    fixture.componentRef.setInput('hideToggle', true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.mat-expansion-indicator')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CaeAccordion — coordination of projected panels (the DI-through-projection
// contract): single-expand by default, multi when opted in.
// ---------------------------------------------------------------------------
@Component({
  imports: [CaeAccordion, CaeExpansionPanel],
  template: `
    <cae-accordion [multiple]="multi()">
      <cae-expansion-panel title="One" [(expanded)]="p1">first body</cae-expansion-panel>
      <cae-expansion-panel title="Two" [(expanded)]="p2">second body</cae-expansion-panel>
    </cae-accordion>
  `,
})
class AccordionHost {
  readonly multi = signal(false);
  p1 = false;
  p2 = false;
}

describe('CaeAccordion', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AccordionHost] }).compileComponents();
  });

  const headers = (f: ComponentFixture<AccordionHost>): HTMLElement[] =>
    Array.from(f.nativeElement.querySelectorAll('mat-expansion-panel-header'));

  it('has no axe violations (two titled, collapsed panels)', async () => {
    const f = TestBed.createComponent(AccordionHost);
    await f.whenStable();
    await expectNoA11yViolations(f.nativeElement);
  });

  it('applies MatAccordion to its host and projects one panel per child', async () => {
    const f = TestBed.createComponent(AccordionHost);
    await f.whenStable();
    // The host directive is what makes projected panels a coordinated group.
    expect(f.nativeElement.querySelector('cae-accordion').classList).toContain('mat-accordion');
    expect(headers(f).length).toBe(2);
  });

  it('coordinates single-expand by default — opening one panel closes the other', async () => {
    const f = TestBed.createComponent(AccordionHost);
    await f.whenStable();
    headers(f)[0].click();
    await f.whenStable();
    expect(headers(f)[0].getAttribute('aria-expanded')).toBe('true');

    headers(f)[1].click();
    await f.whenStable();
    // Material's UniqueSelectionDispatcher auto-closed panel one; the auto-close fires
    // expandedChange, so the two-way-bound model tracked it with no reconciliation on our side.
    expect(headers(f)[1].getAttribute('aria-expanded')).toBe('true');
    expect(headers(f)[0].getAttribute('aria-expanded')).toBe('false');
    expect(f.componentInstance.p1).toBe(false);
    expect(f.componentInstance.p2).toBe(true);
  });

  it('keeps multiple panels open when [multiple] is set', async () => {
    const f = TestBed.createComponent(AccordionHost);
    f.componentInstance.multi.set(true);
    await f.whenStable();
    headers(f)[0].click();
    headers(f)[1].click();
    await f.whenStable();
    expect(headers(f)[0].getAttribute('aria-expanded')).toBe('true');
    expect(headers(f)[1].getAttribute('aria-expanded')).toBe('true');
  });
});
