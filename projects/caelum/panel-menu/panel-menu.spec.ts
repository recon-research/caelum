import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import type { CaeMenuItem } from '@recon-research/caelum/menu';
import { CaePanelMenu } from './panel-menu';
import { expectNoA11yViolations } from '../testing/a11y';

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
    <!--
      A TEXT-FREE glyph (#963, the D-596 sweep). This fixture already carried its index in a data
      attribute, but still stamped the label as visible text — the slot is inside the leaf's own
      button, so that text joined the leaf's accessible name. Both facts now ride attributes.
      (No backticks in here: this is inside a template literal, and one would terminate it.)
    -->
    <ng-template #tpl let-item let-index="index">
      <span
        class="custom-icon"
        [attr.data-index]="index"
        [attr.data-cx]="item.label"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 12h16" /></svg>
      </span>
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

  it('has no axe violations (named nav, collapsed by default)', async () => {
    await expectNoA11yViolations(fixture.nativeElement);
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

  it('keeps a panel’s open state with its ITEM when the model changes ahead of it (#774)', async () => {
    await expand('Files'); // MODEL[0] open, MODEL[1] (Edit) collapsed
    expect(headerByLabel('Edit').getAttribute('aria-expanded')).toBe('false');

    // The consumer drops the open branch — a live nav filtering by permission/search does this.
    host.model.set([MODEL[1]]);
    await settle();

    // Edit is now at index 0. Tracking by $index would hand it Files' surviving open panel;
    // tracking by item identity destroys Files' panel and leaves Edit as the user left it.
    expect(headerByLabel('Edit').getAttribute('aria-expanded')).toBe('false');
  });

  it('carries the open state across a reorder rather than leaving it at the position (#774)', async () => {
    await expand('Files');
    host.model.set([MODEL[1], MODEL[0]]); // swap: Edit first
    await settle();
    expect(headerByLabel('Files').getAttribute('aria-expanded')).toBe('true');
    expect(headerByLabel('Edit').getAttribute('aria-expanded')).toBe('false');
  });

  it('isolates a nested accordion — opening a sub-panel never closes its ancestor', async () => {
    // Single-open is dispatcher-coordinated per accordion; the recursion stamps one per level, so a
    // deeper level must coordinate only with its own siblings (MAT_ACCORDION resolves skipSelf to
    // the nearest). Without that, expanding a child would collapse the branch containing it.
    await expand('Files');
    await expand('Export');
    await expand('Advanced');
    expect(headerByLabel('Files').getAttribute('aria-expanded')).toBe('true');
    expect(headerByLabel('Export').getAttribute('aria-expanded')).toBe('true');
    expect(headerByLabel('Advanced').getAttribute('aria-expanded')).toBe('true');
  });

  it('has no axe violations with the deep tree EXPANDED (not just the collapsed root)', async () => {
    // Collapsed, the tree is one named <nav> and two headers — an axe pass there says almost
    // nothing about the composition. Expanded is where the nested accordions, the <a>/<button>
    // leaves and the icon glyphs actually exist.
    await expand('Files');
    await expand('Export');
    await expand('Advanced');
    expect(leafByLabel('Custom')).not.toBeNull(); // the deep path really is stamped
    await expectNoA11yViolations(fixture.nativeElement);
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
    expect(custom?.getAttribute('data-cx')).toBe('Open');
    // Open is index 0 among Files' children — the single-homed caeItemIconContext carried it through.
    expect(custom?.getAttribute('data-index')).toBe('0');
    // The leaf's accessible name is still EXACTLY its label — the assertion that catches the
    // class, since the icon slot lives inside the leaf button and its text would join that name.
    expect(open.textContent?.trim()).toBe('Open');
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

  describe('a cyclic model (#960)', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    /** Builds `{label}` objects whose `items` can be wired into a cycle after construction. */
    const node = (
      label: string,
    ): { label: string; value: string; items?: readonly CaeMenuItem[] } => ({
      label,
      value: label.toLowerCase(),
    });
    const headerLabels = (): string[] =>
      Array.from(root().querySelectorAll('mat-panel-title')).map(
        (t) => t.textContent?.trim() ?? '',
      );
    /**
     * THIS component's cycle diagnostic, not "console.warn was silent". Swapping the model wholesale
     * makes Angular itself warn (NG0956 — `track item` re-creating a same-sized collection), so a
     * bare `not.toHaveBeenCalled()` fails on a fixture artefact that has nothing to do with the
     * claim. Not vacuous: the specs above prove this filter DOES match on a real cycle.
     */
    const cycleWarnings = (): unknown[] =>
      warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes('is on a cycle'));

    /**
     * Without the break this does not terminate at the FIRST change detection — a branch's nested
     * level is `ngTemplateOutlet` content inside a `cae-expansion-panel`, which projects it eagerly,
     * so the recursion runs before anything has been expanded. The assertion that matters most is
     * therefore that `settle()` returns at all: this test would not *fail* without the fix, it would
     * die with `RangeError: Maximum call stack size exceeded` — the measured #960 repro.
     */
    it('renders a self-referential item as a disabled leaf, not a section', async () => {
      const a = node('A');
      a.items = [a as CaeMenuItem];
      host.model.set([a as CaeMenuItem]);
      await settle();

      expect(headerLabels()).not.toContain('A');
      expect(leafByLabel('A').hasAttribute('disabled')).toBe(true);
      expect(cycleWarnings()).toHaveLength(1);
      expect(warn.mock.calls[0][0]).toContain('"A" is on a cycle');
    });

    it('stops a MUTUAL pair too — the cycle, not just self-reference', async () => {
      const a = node('A');
      const b = node('B');
      a.items = [b as CaeMenuItem];
      b.items = [a as CaeMenuItem];
      host.model.set([a as CaeMenuItem]);
      await settle();

      expect(headerLabels()).not.toContain('A');
      expect(leafByLabel('A').hasAttribute('disabled')).toBe(true);
      expect(cycleWarnings()).toHaveLength(1);
    });

    /**
     * A cycle longer than two: a guard that only looks a fixed distance up the ancestry — self plus
     * one level — passes both specs above and then fails to terminate here.
     */
    it('stops a THREE-cycle', async () => {
      const a = node('A');
      const b = node('B');
      const c = node('C');
      a.items = [b as CaeMenuItem];
      b.items = [c as CaeMenuItem];
      c.items = [a as CaeMenuItem];
      host.model.set([a as CaeMenuItem]);
      await settle();

      expect(headerLabels()).not.toContain('A');
      expect(leafByLabel('A').hasAttribute('disabled')).toBe(true);
      expect(cycleWarnings()).toHaveLength(1);
    });

    /**
     * The false-positive direction, and the reason `done` and `onPath` have to be different sets. A
     * DAG is legal: one subtree object reused under two SIBLING branches must still render in full
     * under each. A cheaper visited-ever check passes every cycle spec above and silently kills this
     * one — which is why both siblings are expanded rather than just the first.
     */
    it('does NOT flag a subtree shared by two sibling branches, under either one', async () => {
      const shared: CaeMenuItem = { label: 'Shared', items: [{ label: 'Deep', value: 'deep' }] };
      host.model.set([
        { label: 'One', items: [shared] },
        { label: 'Two', items: [shared] },
      ]);
      await settle();
      await expand('One');
      await expand('Two');

      expect(headerLabels()).toContain('One');
      expect(headerLabels()).toContain('Two');
      // The shared branch renders as a real section under BOTH parents, not a broken leaf.
      expect(headerLabels().filter((l) => l === 'Shared')).toHaveLength(2);
      expect(cycleWarnings()).toHaveLength(0);
    });

    /**
     * The rule `cae-menu` has and this component deliberately does NOT (#880 vs #960). Material
     * parks focus on an empty `role="menu"` panel with no way out but Escape, which is why a menu
     * disables an all-disabled branch; an expansion panel has no such trap — the header stays
     * focusable and the rows are simply inert — so the section must still render.
     */
    it('leaves an all-disabled section expandable — the menu dead-end rule does not transfer', async () => {
      host.model.set([{ label: 'Bulk', items: [{ label: 'Archive', disabled: true }] }]);
      await settle();
      await expand('Bulk');

      expect(headerLabels()).toContain('Bulk');
      expect(leafByLabel('Archive').hasAttribute('disabled')).toBe(true);
      expect(cycleWarnings()).toHaveLength(0);
    });

    /**
     * The `done` memo is what keeps the walk linear, and NOTHING else in this file notices if it
     * goes: every other arm here is a 1-3 node cycle that is found either way. Without it the
     * traversal enumerates every simple path — a symmetric twelve-node graph is ~10^8 — and the
     * first change detection never returns. So this arm does not fail without the memo, it hangs,
     * and the explicit timeout is the oracle: leaving it to the global `testTimeout` would let a
     * future raise of that unrelated knob silently retire this guard.
     */
    it('does not unroll a dense cyclic graph', async () => {
      const nodes = Array.from({ length: 12 }, (_, i) => node(`N${i}`));
      for (const n of nodes) n.items = nodes.filter((o) => o !== n) as CaeMenuItem[];
      host.model.set([nodes[0] as CaeMenuItem]);
      await settle();

      expect(headerLabels()).not.toContain('N0');
      expect(leafByLabel('N0').hasAttribute('disabled')).toBe(true);
    }, 3000);

    /** A cycle at a root index > 0 — the root loop must walk every root, not stop at the first. */
    it('finds a cycle at a LATER root index', async () => {
      const a = node('A');
      a.items = [a as CaeMenuItem];
      host.model.set([
        { label: 'Files', items: [{ label: 'Open', value: 'open' }] },
        a as CaeMenuItem,
      ]);
      await settle();

      expect(headerLabels()).not.toContain('A');
      expect(leafByLabel('A').hasAttribute('disabled')).toBe(true);
      expect(cycleWarnings()).toHaveLength(1);
    });

    /**
     * The `@else if (item.url && !rowDisabled(item))` arm: a navigation leaf that is disabled — or
     * broken by a cycle — must NOT render as a live `<a href>`. Nothing else in this file pairs a
     * `url` with `disabled`, so without this the term could be dropped and a disabled row would
     * still navigate.
     */
    it('renders a DISABLED navigation leaf as an inert button, never a live link', async () => {
      host.model.set([
        { label: 'Files', items: [{ label: 'Gone', url: '/gone', disabled: true }] },
      ]);
      await settle();
      await expand('Files');

      const gone = leafByLabel('Gone');
      expect(gone.tagName).toBe('BUTTON');
      expect(gone.hasAttribute('disabled')).toBe(true);
      expect(gone.hasAttribute('href')).toBe(false);
    });
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
