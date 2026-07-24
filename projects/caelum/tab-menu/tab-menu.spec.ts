import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ENTER, SPACE } from '@angular/cdk/keycodes';
import { CAE_ICON_GLYPHS } from 'caelum/icon';

import { CaeTabMenu, type CaeTabMenuItem } from './tab-menu';
import { expectNoA11yViolations } from '../testing/a11y';

type Section = 'overview' | 'activity' | 'settings';

@Component({
  imports: [CaeTabMenu],
  template: `
    <cae-tab-menu
      [items]="items"
      [(activeValue)]="active"
      ariaLabel="Sections"
      (itemSelect)="emits.push($event)"
    >
      <span class="panel-body">Body for {{ active() }}</span>
    </cae-tab-menu>
  `,
})
class Host {
  items: CaeTabMenuItem<Section>[] = [
    { label: 'Overview', value: 'overview' },
    { label: 'Activity', value: 'activity' },
    { label: 'Settings', value: 'settings', disabled: true },
  ];
  readonly active = signal<Section | undefined>('overview');
  readonly emits: CaeTabMenuItem<Section>[] = [];
}

/** Dispatch a keydown carrying a CDK keyCode (KeyboardEvent init has no keyCode field). */
function keyActivate(target: HTMLElement, keyCode: number): void {
  const event = new KeyboardEvent('keydown', { bubbles: true });
  Object.defineProperty(event, 'keyCode', { get: () => keyCode });
  target.dispatchEvent(event);
}

describe('CaeTabMenu', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  function setup() {
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    return fixture.whenStable().then(() => {
      const el = fixture.nativeElement as HTMLElement;
      const tabs = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'));
      return { fixture, host, el, tabs };
    });
  }

  it('has no axe violations (labeled tablist, projected panel content)', async () => {
    const { el } = await setup();
    await expectNoA11yViolations(el);
  });

  it('renders one role=tab link per item, with its label', async () => {
    const { tabs } = await setup();
    expect(tabs.length).toBe(3);
    expect(tabs[0].textContent).toContain('Overview');
    expect(tabs[1].textContent).toContain('Activity');
    expect(tabs[2].textContent).toContain('Settings');
  });

  it('marks the item matching activeValue as selected, the rest not', async () => {
    const { tabs } = await setup();
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('aria-selected')).toBe('false');
  });

  it('wires the ARIA tabs pattern — tablist bar, tabpanel content, tabs point at the panel', async () => {
    const { el, tabs } = await setup();
    expect(el.querySelector('[role="tablist"]')).toBeTruthy();
    const panel = el.querySelector<HTMLElement>('[role="tabpanel"]');
    expect(panel).toBeTruthy();
    // Every tab controls the single shared panel (aria-controls === panel id).
    expect(panel!.id).toBeTruthy();
    for (const tab of tabs) {
      expect(tab.getAttribute('aria-controls')).toBe(panel!.id);
    }
  });

  it('projects the consumer content into the tabpanel', async () => {
    const { el } = await setup();
    const panel = el.querySelector<HTMLElement>('[role="tabpanel"]');
    expect(panel?.querySelector('.panel-body')?.textContent).toContain('Body for overview');
  });

  it('labels the tab list for assistive tech', async () => {
    const { el } = await setup();
    expect(el.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Sections');
  });

  it('activates a tab on click — updates activeValue and emits itemSelect exactly once', async () => {
    const { fixture, host, tabs } = await setup();
    tabs[1].click();
    await fixture.whenStable();
    expect(host.active()).toBe('activity');
    expect(host.emits.length).toBe(1);
    expect(host.emits[0].value).toBe('activity');
    // The clicked tab is now the selected one.
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
  });

  it('activates a tab from the keyboard — Enter selects it and emits exactly once', async () => {
    const { fixture, host, tabs } = await setup();
    keyActivate(tabs[1], ENTER);
    await fixture.whenStable();
    expect(host.active()).toBe('activity');
    expect(host.emits.length).toBe(1);
    expect(host.emits[0].value).toBe('activity');
  });

  it('activates a tab from the keyboard — Space selects it and emits exactly once', async () => {
    const { fixture, host, tabs } = await setup();
    keyActivate(tabs[1], SPACE);
    await fixture.whenStable();
    expect(host.active()).toBe('activity');
    expect(host.emits.length).toBe(1);
    expect(host.emits[0].value).toBe('activity');
  });

  it('reflects a disabled item and refuses to activate it', async () => {
    const { fixture, host, tabs } = await setup();
    expect(tabs[2].getAttribute('aria-disabled')).toBe('true');
    expect(tabs[2].classList).toContain('mat-mdc-tab-disabled');
    // Programmatic click bypasses pointer-events; the wrapper's own guard must still refuse it,
    // and the keyboard path must be inert too — no selection, no emission.
    tabs[2].click();
    keyActivate(tabs[2], ENTER);
    await fixture.whenStable();
    expect(host.active()).toBe('overview');
    expect(host.emits.length).toBe(0);
  });

  it('follows activeValue when the consumer drives it externally', async () => {
    const { fixture, host, tabs } = await setup();
    host.active.set('activity');
    await fixture.whenStable();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
  });

  it('opts the content panel into the tab order only when panelTabIndex is set', async () => {
    const fixture = TestBed.createComponent(CaeTabMenu<Section>);
    fixture.componentRef.setInput('items', [{ label: 'Overview', value: 'overview' }]);
    await fixture.whenStable();
    const panel = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[role="tabpanel"]',
    );
    // Default: no tabindex (matches Material — no spurious tab stop for interactive panels).
    expect(panel?.hasAttribute('tabindex')).toBe(false);
    // Opt-in: the static panel becomes keyboard-focusable/scrollable.
    fixture.componentRef.setInput('panelTabIndex', 0);
    await fixture.whenStable();
    expect(panel?.getAttribute('tabindex')).toBe('0');
  });
});

@Component({
  imports: [CaeTabMenu],
  template: `
    <cae-tab-menu [items]="items()" [iconTemplate]="useTpl() ? tpl : null" ariaLabel="Sections" />
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon">{{ index }}:{{ item.value }}</span>
    </ng-template>
  `,
})
class IconHost {
  readonly items = signal<readonly CaeTabMenuItem[]>([
    { label: 'Home', value: 'home', icon: 'home' },
    { label: 'Files', value: 'files' },
  ]);
  readonly useTpl = signal(false);
}

describe('CaeTabMenu per-item icons (D-596)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [IconHost] }).compileComponents();
  });

  async function setup() {
    const fixture = TestBed.createComponent(IconHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const links = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('a[mat-tab-link]'),
      );
    return { fixture, links };
  }

  it('renders a registry glyph for item.icon inside that tab link, none without one', async () => {
    const { links } = await setup();
    const glyph = links()[0].querySelector('svg');
    expect(glyph?.querySelector('path')?.getAttribute('d')).toBe(CAE_ICON_GLYPHS.home);
    // Decorative: hidden from AT; the tab's accessible name stays EXACTLY its label
    // (trimmed equality, not toContain — name pollution must fail, #632 discipline).
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(links()[0].textContent?.trim()).toBe('Home');
    expect(links()[1].querySelector('svg')).toBeNull();
  });

  it('iconTemplate wins over item.icon, for every tab (D-596)', async () => {
    const { fixture, links } = await setup();
    fixture.componentInstance.useTpl.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const custom = links().map((el) => el.querySelector('.custom-icon')?.textContent);
    expect(custom).toEqual(['0:home', '1:files']);
    expect(links()[0].querySelector('svg')).toBeNull();
  });
});
