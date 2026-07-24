import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, vi } from 'vitest';
import { CAE_ICON_GLYPHS } from 'caelum/icon';

import { CaeBreadcrumb, CaeBreadcrumbItem, CaeBreadcrumbSelectEvent } from './breadcrumb';
import { expectNoA11yViolations } from '../testing/a11y';

/** Host that drives the breadcrumb's inputs from signals so a test can flip them at runtime. */
@Component({
  selector: 'cae-breadcrumb-host',
  imports: [CaeBreadcrumb],
  template: `
    <cae-breadcrumb
      [items]="items()"
      [home]="home()"
      [separator]="separator()"
      [ariaLabel]="ariaLabel()"
      (itemSelect)="onSelect($event)"
    />
  `,
})
class BreadcrumbHost {
  readonly items = signal<readonly CaeBreadcrumbItem[]>([]);
  readonly home = signal<CaeBreadcrumbItem | null>(null);
  readonly separator = signal('/');
  readonly ariaLabel = signal('');
  readonly selected = signal<CaeBreadcrumbSelectEvent | null>(null);
  /** When true, the handler intercepts the trail by preventing the crumb's native navigation. */
  intercept = false;
  /** Stand-in for a real consumer's (itemSelect) handler — records the event and optionally intercepts. */
  onSelect(event: CaeBreadcrumbSelectEvent): void {
    this.selected.set(event);
    if (this.intercept) event.originalEvent.preventDefault();
  }
}

describe('CaeBreadcrumb', () => {
  let fixture: ComponentFixture<BreadcrumbHost>;
  let hostCmp: BreadcrumbHost;
  let nav: HTMLElement;

  function render(
    opts: {
      items?: readonly CaeBreadcrumbItem[];
      home?: CaeBreadcrumbItem | null;
      separator?: string;
      ariaLabel?: string;
    } = {},
  ): void {
    fixture = TestBed.createComponent(BreadcrumbHost);
    hostCmp = fixture.componentInstance;
    if (opts.items !== undefined) hostCmp.items.set(opts.items);
    if (opts.home !== undefined) hostCmp.home.set(opts.home);
    if (opts.separator !== undefined) hostCmp.separator.set(opts.separator);
    if (opts.ariaLabel !== undefined) hostCmp.ariaLabel.set(opts.ariaLabel);
    fixture.detectChanges();
    nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
  }

  /** The rendered crumbs' visible text, in order (excluding the aria-hidden separators). */
  function crumbTexts(): string[] {
    return Array.from(
      nav.querySelectorAll(
        '.cae-breadcrumb__link, .cae-breadcrumb__text, .cae-breadcrumb__current',
      ),
    ).map((el) => el.textContent!.trim());
  }

  const TRAIL: CaeBreadcrumbItem[] = [
    { label: 'Reports', url: '/reports' },
    { label: 'Q3', url: '/reports/q3' },
    { label: 'Summary' },
  ];

  it('has no axe violations (named nav trail)', async () => {
    render({ items: TRAIL, ariaLabel: 'Breadcrumb' });
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('renders a named nav landmark wrapping an ordered list', () => {
    render({ items: TRAIL });
    expect(nav).toBeTruthy();
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb'); // default name
    expect(nav.querySelector('ol')).toBeTruthy();
    expect(nav.querySelectorAll('li').length).toBe(3);
  });

  it('overrides the nav accessible name from [ariaLabel]', () => {
    render({ items: TRAIL, ariaLabel: 'You are here' });
    expect(nav.getAttribute('aria-label')).toBe('You are here');
  });

  it('marks only the last crumb as the current page, as non-link text', () => {
    render({ items: TRAIL });
    const currents = nav.querySelectorAll('[aria-current="page"]');
    expect(currents.length).toBe(1);
    expect(currents[0].textContent!.trim()).toBe('Summary');
    // The current page is never a link, even if it had a url.
    expect(currents[0].tagName.toLowerCase()).toBe('span');
    expect(nav.querySelectorAll('a').length).toBe(2); // only the two ancestors
  });

  it('renders url ancestors as real hyperlinks and url-less ancestors as inert text', () => {
    render({
      items: [{ label: 'Docs', url: '/docs' }, { label: 'Guides' }, { label: 'Routing' }],
    });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/docs');
    expect(links[0].textContent!.trim()).toBe('Docs');
    // 'Guides' (no url, not last) is inert text, not a link.
    const guides = Array.from(nav.querySelectorAll('span')).find(
      (s) => s.textContent!.trim() === 'Guides',
    );
    expect(guides).toBeTruthy();
    expect(guides!.getAttribute('aria-current')).toBeNull();
  });

  it('the current page (last crumb) is never a link even with a url', () => {
    render({
      items: [
        { label: 'Home', url: '/' },
        { label: 'Current', url: '/current' },
      ],
    });
    const current = nav.querySelector('[aria-current="page"]')!;
    expect(current.tagName.toLowerCase()).toBe('span');
    expect(nav.querySelectorAll('a').length).toBe(1); // only 'Home'
  });

  it('renders a disabled crumb as inert aria-disabled text even if it has a url', () => {
    render({
      items: [{ label: 'Locked', url: '/locked', disabled: true }, { label: 'Now' }],
    });
    const locked = Array.from(nav.querySelectorAll('span')).find(
      (s) => s.textContent!.trim() === 'Locked',
    )!;
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(nav.querySelectorAll('a').length).toBe(0); // no link despite the url
  });

  it('pins the optional home crumb first as an ancestor (never the current page)', () => {
    render({ home: { label: 'Home', url: '/' }, items: TRAIL });
    expect(crumbTexts()).toEqual(['Home', 'Reports', 'Q3', 'Summary']);
    const home = nav.querySelector('a')!; // first link
    expect(home.textContent!.trim()).toBe('Home');
    expect(home.getAttribute('href')).toBe('/');
    expect(home.getAttribute('aria-current')).toBeNull();
    // aria-current is still only on the true last crumb.
    expect(nav.querySelector('[aria-current="page"]')!.textContent!.trim()).toBe('Summary');
  });

  it('marks a home-only trail (empty items) as the current page, not a self-link', () => {
    render({ home: { label: 'Home', url: '/' }, items: [] });
    const current = nav.querySelector('[aria-current="page"]')!;
    expect(current.textContent!.trim()).toBe('Home');
    expect(current.tagName.toLowerCase()).toBe('span'); // the current page never self-links
    expect(nav.querySelectorAll('a').length).toBe(0);
  });

  it('renders no landmark at all when there are no crumbs (empty items, no home)', () => {
    render({ items: [], home: null });
    expect(fixture.nativeElement.querySelector('nav')).toBeNull(); // no empty "Breadcrumb" region
  });

  it('falls back to the default name when [ariaLabel] is whitespace-only', () => {
    render({ items: TRAIL, ariaLabel: '   ' });
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb'); // trimmed → default, never nameless
  });

  it('draws separators as silent aria-hidden spans — one fewer than the crumbs, none before the first', () => {
    render({ items: TRAIL, separator: '›' });
    const seps = Array.from(nav.querySelectorAll('.cae-breadcrumb__sep'));
    expect(seps.length).toBe(2); // 3 crumbs → 2 separators (none precedes the first crumb)
    for (const s of seps) {
      expect(s.getAttribute('aria-hidden')).toBe('true'); // never announced
      expect(s.textContent).toBe('›');
    }
    // The glyph is reactive to the input (and no separator precedes the first crumb).
    hostCmp.separator.set('/');
    fixture.detectChanges();
    expect(nav.querySelector('.cae-breadcrumb__sep')!.textContent).toBe('/');
    expect(nav.querySelector('li:first-child .cae-breadcrumb__sep')).toBeNull();
  });

  it('emits (itemSelect) with { item, originalEvent } when a link crumb is activated, but not for text/current crumbs', () => {
    render({ items: TRAIL });
    const links = Array.from(nav.querySelectorAll('a'));
    // Swallow the native href navigation (jsdom can't navigate) — the component itself does NOT
    // preventDefault, so a real browser follows the link unless the consumer intercepts.
    links[0].addEventListener('click', (e) => e.preventDefault());
    const ev = new MouseEvent('click', { cancelable: true });
    (links[0] as HTMLAnchorElement).dispatchEvent(ev);
    expect(hostCmp.selected()?.item.label).toBe('Reports');
    expect(hostCmp.selected()?.originalEvent).toBe(ev); // the DOM event is handed to the consumer

    // The current page is a span, so there is nothing to click for it — assert it stays uninvolved.
    hostCmp.selected.set(null);
    const current = nav.querySelector('[aria-current="page"]') as HTMLElement;
    current.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    expect(hostCmp.selected()).toBeNull();
  });

  it('lets a consumer intercept a link crumb by calling originalEvent.preventDefault() through (itemSelect)', () => {
    render({ items: TRAIL });
    hostCmp.intercept = true; // the host's (itemSelect) handler will preventDefault the originalEvent
    const link = nav.querySelector('a') as HTMLAnchorElement;
    const ev = new MouseEvent('click', { cancelable: true });
    link.dispatchEvent(ev);
    // The suppression runs through the real path: component emit → host onSelect → originalEvent.preventDefault().
    expect(hostCmp.selected()?.item.label).toBe('Reports'); // event emitted
    expect(ev.defaultPrevented).toBe(true); // and the consumer's preventDefault took effect on the live event
  });

  it('renders a url-less [command] crumb as a real <button> that emits without an href', () => {
    render({
      items: [
        { label: 'Workspace', url: '/ws' },
        { label: 'Reindex', command: true },
        { label: 'Done' },
      ],
    });
    // 'Reindex' has no url but is command → a button, not inert text and not a link.
    const button = nav.querySelector('button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    // A real <button type="button"> carries native keyboard activation (Enter AND Space → click) and
    // never form-submits; the template adds no (keydown) that could suppress it, so activation rides the
    // platform (jsdom can't synthesize click-from-keydown — we assert the semantics, not re-test the UA).
    expect(button.type).toBe('button');
    expect(button.textContent!.trim()).toBe('Reindex');
    expect(button.hasAttribute('href')).toBe(false);
    expect(nav.querySelectorAll('a').length).toBe(1); // only 'Workspace' is a link

    const ev = new MouseEvent('click', { cancelable: true });
    button.dispatchEvent(ev);
    expect(hostCmp.selected()?.item.label).toBe('Reindex');
    expect(hostCmp.selected()?.originalEvent).toBe(ev);
  });

  it('ignores [command] when the crumb also has a url (a link takes precedence)', () => {
    render({ items: [{ label: 'Both', url: '/both', command: true }, { label: 'End' }] });
    expect(nav.querySelector('a')?.getAttribute('href')).toBe('/both'); // rendered as a link
    expect(nav.querySelector('button')).toBeNull();
  });

  it('never makes the current page or a disabled crumb a command button', () => {
    // A command crumb that is the LAST crumb is the current page (inert span), never a button.
    render({
      items: [
        { label: 'Root', url: '/' },
        { label: 'Current', command: true },
      ],
    });
    expect(nav.querySelector('button')).toBeNull();
    expect(nav.querySelector('[aria-current="page"]')!.tagName.toLowerCase()).toBe('span');

    // A disabled command crumb falls through to inert aria-disabled text.
    render({ items: [{ label: 'Off', command: true, disabled: true }, { label: 'Here' }] });
    expect(nav.querySelector('button')).toBeNull();
    const off = Array.from(nav.querySelectorAll('span')).find(
      (s) => s.textContent!.trim() === 'Off',
    )!;
    expect(off.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders a single-crumb trail as just the current page, with no ancestors', () => {
    render({ items: [{ label: 'Only', url: '/only' }] });
    expect(crumbTexts()).toEqual(['Only']);
    expect(nav.querySelectorAll('a').length).toBe(0); // the sole crumb is the current page
    expect(nav.querySelector('[aria-current="page"]')!.textContent!.trim()).toBe('Only');
  });

  it('reacts to a trail replaced at runtime', () => {
    render({ items: TRAIL });
    expect(crumbTexts()).toEqual(['Reports', 'Q3', 'Summary']);
    hostCmp.items.set([{ label: 'Root', url: '/' }, { label: 'Leaf' }]);
    fixture.detectChanges();
    expect(crumbTexts()).toEqual(['Root', 'Leaf']);
    expect(nav.querySelector('[aria-current="page"]')!.textContent!.trim()).toBe('Leaf');
  });

  // The hit-target floor (#456 residual: --cae-target-min on .cae-breadcrumb__link) is CSS-only; jsdom
  // can't measure painted layout, so it's verified by review + the M4 browser pass (#405), not a unit
  // test — matching how the #530 first-pass floors shipped. The list-semantics and dev-warn below ARE
  // DOM/console-observable, so they carry unit teeth.

  describe('list semantics (#385)', () => {
    it('marks the <ol>/<li> with explicit role=list/listitem so VoiceOver keeps list semantics under list-style:none', () => {
      render({ items: TRAIL });
      expect(nav.querySelector('ol')!.getAttribute('role')).toBe('list');
      const listitems = Array.from(nav.querySelectorAll('li'));
      expect(listitems.length).toBe(3);
      for (const li of listitems) {
        expect(li.getAttribute('role')).toBe('listitem');
      }
    });
  });

  describe('nameless-crumb dev-warn (#384)', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it('warns once when an interactive link crumb has an empty label', () => {
      render({ items: [{ label: '', url: '/x' }, { label: 'Here' }] });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('nameless'));
      // 'interactive link crumb' (not the bare 'link', which the static "link-name" text always
      // matches) — so this pins the crumb.url ? 'link' : 'command' branch.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('interactive link crumb'));
    });

    it('warns when an interactive command crumb has a whitespace-only label', () => {
      render({ items: [{ label: '   ', command: true }, { label: 'Here' }] });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('command'));
    });

    it('does NOT warn for a well-formed trail (every interactive crumb is named)', () => {
      render({ items: TRAIL });
      expect(warn).not.toHaveBeenCalled();
    });

    it('does NOT warn for a nameless current page, a disabled crumb, or inert url-less text', () => {
      // The last crumb is the current page (inert text) even with a url — a nameless one is a different,
      // non-4.1.2 concern, out of #384's scope (teeth for the isCurrent guard).
      render({
        items: [
          { label: 'Root', url: '/' },
          { label: '', url: '/current' },
        ],
      });
      // A disabled crumb (even with a url) is inert, and a url-less non-command crumb is inert text
      // (teeth for the !disabled and interactive guards).
      render({
        items: [{ label: '', url: '/x', disabled: true }, { label: '' }, { label: 'End' }],
      });
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

@Component({
  imports: [CaeBreadcrumb],
  template: `
    <cae-breadcrumb [items]="items()" [iconTemplate]="useTpl() ? tpl : null" />
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon">{{ index }}:{{ item.label }}</span>
    </ng-template>
  `,
})
class IconHost {
  readonly items = signal<readonly CaeBreadcrumbItem[]>([]);
  readonly useTpl = signal(false);
}

describe('CaeBreadcrumb per-item icons (D-596)', () => {
  let fixture: ComponentFixture<IconHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [IconHost] }).compileComponents();
    fixture = TestBed.createComponent(IconHost);
  });

  function render(items: readonly CaeBreadcrumbItem[], useTpl = false): HTMLElement {
    fixture.componentInstance.items.set(items);
    fixture.componentInstance.useTpl.set(useTpl);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const glyphD = (scope: Element | null): string | null | undefined =>
    scope?.querySelector('svg path')?.getAttribute('d');

  it('renders the glyph INSIDE the link crumb, sharing its hit target', () => {
    const el = render([{ label: 'Home', url: '/', icon: 'home' }, { label: 'Q3' }]);
    // Inside the <a> — not a sibling — so an icon-carrying crumb's glyph is part of the
    // link's clickable area and focus outline.
    const link = el.querySelector('a.cae-breadcrumb__link');
    expect(glyphD(link)).toBe(CAE_ICON_GLYPHS.home);
    expect(link?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    // The icon-less current crumb renders none.
    expect(el.querySelector('.cae-breadcrumb__current svg')).toBeNull();
  });

  it('renders the glyph inside the current-page, command, and inert-text leaves too', () => {
    const el = render([
      { label: 'Act', command: true, icon: 'plus' },
      { label: 'Off', url: '/x', disabled: true, icon: 'folder' },
      { label: 'Q3', icon: 'file' },
    ]);
    expect(glyphD(el.querySelector('button.cae-breadcrumb__button'))).toBe(CAE_ICON_GLYPHS.plus);
    expect(glyphD(el.querySelector('span.cae-breadcrumb__text'))).toBe(CAE_ICON_GLYPHS.folder);
    expect(glyphD(el.querySelector('span.cae-breadcrumb__current'))).toBe(CAE_ICON_GLYPHS.file);
  });

  it('iconTemplate wins over item.icon, for every crumb (D-596)', () => {
    const el = render([{ label: 'Home', url: '/', icon: 'home' }, { label: 'Q3' }], true);
    const custom = Array.from(el.querySelectorAll('.custom-icon')).map((n) => n.textContent);
    expect(custom).toEqual(['0:Home', '1:Q3']);
    // The built-in glyph gives way even where item.icon is set.
    expect(el.querySelector('svg')).toBeNull();
    // Still stamped inside the interactive element, not beside it.
    expect(el.querySelector('a.cae-breadcrumb__link .custom-icon')).not.toBeNull();
  });
});
