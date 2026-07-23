import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import type { CaeMenuItem } from 'caelum/menu';
import { CaePanelMenu } from './panel-menu';

const MODEL: CaeMenuItem[] = [
  {
    label: 'Files',
    icon: 'folder', // a BRANCH icon — text-only header in v1 (#78), so deliberately ignored
    items: [
      { label: 'Open', url: '/files/open', icon: 'file' }, // navigation leaf → <a href>
      { label: 'Recent', value: 'recent' }, // command leaf → <button>
      {
        label: 'Export',
        items: [
          { label: 'As PDF', value: 'pdf' },
          { label: 'Advanced', items: [{ label: 'Custom', value: 'custom' }] }, // level-4 path
        ],
      },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Undo', value: 'undo' },
      { label: 'Redo', value: 'redo' },
    ],
  },
];

@Component({
  imports: [CaePanelMenu],
  template: `
    <cae-panel-menu
      [model]="model()"
      [ariaLabel]="label()"
      [multiple]="multiple()"
      [iconTemplate]="useTemplate() ? tpl : null"
    />
    <ng-template #tpl let-item let-index="index">
      <span class="custom-icon" [attr.data-index]="index">{{ item.label }}-glyph</span>
    </ng-template>
  `,
})
class PanelMenuHost {
  readonly model = signal<CaeMenuItem[]>(MODEL);
  readonly label = signal('Main');
  readonly multiple = signal(false);
  readonly useTemplate = signal(false);
}

describe('CaePanelMenu', () => {
  let fixture: ComponentFixture<PanelMenuHost>;
  let host: PanelMenuHost;

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const key = (k: string): KeyboardEvent => new KeyboardEvent('keydown', { key: k, bubbles: true });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const headerByLabel = (label: string): HTMLElement => {
    const headers = Array.from(root().querySelectorAll('mat-expansion-panel-header'));
    const match = headers.find(
      (h) => h.querySelector('mat-panel-title')?.textContent?.trim() === label,
    );
    if (!match) throw new Error(`no panel header "${label}"`);
    return match as HTMLElement;
  };
  const leafByLabel = (label: string): HTMLElement => {
    const leaves = Array.from(root().querySelectorAll('.cae-panel-menu__leaf'));
    const match = leaves.find(
      (l) => l.querySelector('.cae-panel-menu__label')?.textContent?.trim() === label,
    );
    if (!match) throw new Error(`no leaf "${label}"`);
    return match as HTMLElement;
  };
  const expand = async (label: string): Promise<void> => {
    headerByLabel(label).click();
    await settle();
  };
  const panelMenu = (): CaePanelMenu =>
    fixture.debugElement.query(By.directive(CaePanelMenu)).componentInstance;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PanelMenuHost] }).compileComponents();
    fixture = TestBed.createComponent(PanelMenuHost);
    host = fixture.componentInstance;
    // Attach so focus() targets a live element (the roving assertions need this).
    document.body.appendChild(fixture.nativeElement);
    await settle();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  it('is a single <nav> landmark with the accessible name (no per-level duplication)', () => {
    const nav = fixture.nativeElement.querySelector('nav.cae-panel-menu');
    expect(nav).not.toBeNull();
    expect(nav!.getAttribute('aria-label')).toBe('Main');
    // The recursion must NOT stamp a nav per level — exactly one landmark.
    expect(fixture.nativeElement.querySelectorAll('nav').length).toBe(1);
  });

  it('composes cae-accordion / cae-expansion-panel — expansion is not reimplemented', () => {
    expect(fixture.nativeElement.querySelector('cae-accordion')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('cae-expansion-panel')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('mat-expansion-panel')).not.toBeNull();
  });

  it('renders top-level branches as expansion headers that expose aria-expanded', async () => {
    const files = headerByLabel('Files');
    expect(files.getAttribute('aria-expanded')).toBe('false');
    await expand('Files');
    expect(files.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders unbounded nesting — a 4-level path (Files › Export › Advanced › Custom) is reachable', async () => {
    await expand('Files');
    await expand('Export');
    await expand('Advanced');
    const custom = leafByLabel('Custom');
    expect(custom).not.toBeNull();
    // It really lives inside the deep panel chain, not flattened to the top.
    expect(custom.closest('cae-expansion-panel')).not.toBeNull();
  });

  it('renders a navigation leaf (has url) as a real focusable <a href>', async () => {
    await expand('Files');
    const open = leafByLabel('Open');
    expect(open.tagName).toBe('A');
    expect(open.getAttribute('href')).toBe('/files/open');
  });

  it('renders a command leaf (no url) as a <button> that emits the whole item on activation', async () => {
    const selected: CaeMenuItem[] = [];
    panelMenu().itemSelect.subscribe((i) => selected.push(i));
    await expand('Files');
    const recent = leafByLabel('Recent');
    expect(recent.tagName).toBe('BUTTON');
    recent.click();
    await settle();
    expect(selected.map((i) => i.label)).toEqual(['Recent']);
  });

  it('keeps sibling top-level panels open together when [multiple] is set', async () => {
    host.multiple.set(true);
    await settle();
    await expand('Files');
    await expand('Edit');
    expect(headerByLabel('Files').getAttribute('aria-expanded')).toBe('true');
    expect(headerByLabel('Edit').getAttribute('aria-expanded')).toBe('true');
  });

  it('is single-open by default — opening a sibling closes the first (delegated to cae-accordion)', async () => {
    await expand('Files');
    await expand('Edit');
    expect(headerByLabel('Files').getAttribute('aria-expanded')).toBe('false');
    expect(headerByLabel('Edit').getAttribute('aria-expanded')).toBe('true');
  });

  it('renders a built-in glyph for a leaf item.icon (D-596)', async () => {
    await expand('Files');
    const open = leafByLabel('Open');
    // item.icon 'file' → an inline cae-icon glyph beside the label.
    expect(open.querySelector('cae-icon svg')).not.toBeNull();
  });

  it('leaves branch headers text-only in v1 — a branch item.icon waits on the rich-header slot (#78)', () => {
    const files = headerByLabel('Files');
    expect(files.querySelector('cae-icon')).toBeNull();
    expect(files.textContent).toContain('Files');
  });

  it('lets iconTemplate override the built-in glyph on leaves, receiving { item, index }', async () => {
    host.useTemplate.set(true);
    await settle();
    await expand('Files');
    const open = leafByLabel('Open');
    expect(open.querySelector('cae-icon')).toBeNull(); // built-in suppressed
    const custom = open.querySelector('.custom-icon');
    expect(custom?.textContent).toContain('Open-glyph');
    // Open is index 0 among Files' children — the single-homed caeItemIconContext carried it through.
    expect(custom?.getAttribute('data-index')).toBe('0');
  });

  it('roves Arrow/Home/End over a level’s own leaves and never leaks into a nested level', async () => {
    // Expand Files AND its nested Export so As-PDF is live: proving roving still skips it is the point.
    await expand('Files');
    await expand('Export');
    const open = leafByLabel('Open'); // Files leaf 0
    const recent = leafByLabel('Recent'); // Files leaf 1

    open.focus();
    expect(document.activeElement).toBe(open);

    open.dispatchEvent(key('ArrowDown'));
    expect(document.activeElement).toBe(recent);

    // Wrap forward past the LAST of this level's leaves — back to Open, NOT down into As PDF.
    recent.dispatchEvent(key('ArrowDown'));
    expect(document.activeElement).toBe(open);

    open.dispatchEvent(key('End'));
    expect(document.activeElement).toBe(recent);

    recent.dispatchEvent(key('Home'));
    expect(document.activeElement).toBe(open);

    open.dispatchEvent(key('ArrowUp')); // wrap backward
    expect(document.activeElement).toBe(recent);
  });

  it('dev-warns when the nav has no accessible name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.label.set('');
    await settle();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cae-panel-menu'));
    warn.mockRestore();
  });

  it('draws its leaf chrome from tokens (no hardcoded design values)', () => {
    const styles = (CaePanelMenu as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join(
      '\n',
    );
    // A new interactive affordance floors on the invariant target token, not a spacing step.
    expect(styles).toMatch(/min-block-size:\s*var\(--cae-target-min\)/);
    expect(styles).toMatch(/outline:\s*var\(--cae-focus-ring\)/);
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
