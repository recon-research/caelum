import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CaeTab, CaeTabs } from './tabs';

@Component({
  imports: [CaeTabs, CaeTab],
  template: `
    <cae-tabs ariaLabel="Sections">
      <cae-tab label="One"><p class="panel-1">First panel</p></cae-tab>
      <cae-tab label="Two"><p class="panel-2">Second panel</p></cae-tab>
    </cae-tabs>
  `,
})
class TabsHost {}

describe('CaeTabs', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TabsHost] }).compileComponents();
  });

  it('renders one tab per projected cae-tab, with its label', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const tabs = el.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('One');
    expect(tabs[1].textContent).toContain('Two');
  });

  it('projects the active tab’s content into the Material tab body', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.panel-1')?.textContent).toContain('First panel');
  });

  it('labels the tab list for assistive tech', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    await fixture.whenStable();
    const list = (fixture.nativeElement as HTMLElement).querySelector('[role="tablist"]');
    expect(list?.getAttribute('aria-label')).toBe('Sections');
  });
});
