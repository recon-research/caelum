/**
 * Real-browser verification for `cae-tree-table` (#405, was #263) — the box's three parts:
 * focus ring, SR announcements, focus restoration. Each needed a browser for a different reason,
 * and one of them turned up a defect rather than a confirmation.
 *
 * ## The live region was pruned from the a11y tree (fixed in this slice)
 *
 * `tree-table.ts` calls the empty state *"a **persistent** `role="status"` live region intended to
 * announce a populated→empty transition"*. It was hidden with `display: none` while `:empty` —
 * measured: `populated: text="" display=none`. That is the state the region sits in for the entire
 * time the table has rows, i.e. **immediately before the transition it exists to announce**, so the
 * message arrived on a region the a11y tree was not watching: the reliably-silent case.
 *
 * The sibling `cae-data-grid` already carries the rule and the reason in its own stylesheet —
 * *"collapse VISUALLY but stay in the accessibility tree … NOT display:none (which prunes the node
 * from the a11y tree and un-watches the live region)"* — so this was a straight inconsistency
 * between two components with an identical region, not a design question. Fixed by mirroring the
 * clip-based hide; the tests below pin both halves so it cannot regress to `display: none`.
 *
 * **What is still not claimed.** That a screen reader *utters* it. Same honest limit as the grid's
 * #228: this harness verifies the region is watched and that the text arrives as an in-place
 * mutation, which is the mechanism an announcement needs — not the announcement.
 *
 * ## Focus ring — the non-obvious half is `:focus-visible` under *programmatic* focus
 *
 * Arrow navigation moves focus by calling `.focus()` from `focusRow()`. `:focus-visible` is a
 * heuristic, so a ring that appears on Tab can be absent on the arrow keys that actually drive this
 * grid — which would be a WCAG 2.4.7 failure invisible to every jsdom test (no layout, no
 * `:focus-visible` matching, no computed outline). Measured: it matches in both cases, and the
 * outline resolves to the real token (`solid/2px/rgb(21, 101, 192)`), not a fallback.
 *
 * ## Focus restoration — a documented limitation, pinned as such
 *
 * A programmatic collapse that removes the focused descendant drops DOM focus to `<body>` while the
 * roving tab stop re-homes correctly. That is what `tree-table.ts` says, now measured, and filed as
 * **#769** (sibling of cae-table's #241). Asserting current behaviour means this test **must fail**
 * when #769 is fixed — deliberately, so the fix updates the claim instead of silently diverging.
 *
 * Run it: `npm run test:browser`.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';

import { CaeTreeTable, CaeTreeTableColumn, CaeTreeTableNode } from './tree-table';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme } from '../testing/theme';

interface Item {
  name: string;
  size: string;
}

const MAIN: CaeTreeTableNode<Item> = { data: { name: 'main.ts', size: '2 KB' } };
const APP_TS: CaeTreeTableNode<Item> = { data: { name: 'app.ts', size: '5 KB' } };
const APP: CaeTreeTableNode<Item> = { data: { name: 'app', size: '—' }, children: [MAIN, APP_TS] };
const SRC: CaeTreeTableNode<Item> = { data: { name: 'src', size: '—' }, children: [APP] };
const README: CaeTreeTableNode<Item> = { data: { name: 'README.md', size: '3 KB' } };
const TREE = [SRC, README];

const COLS: CaeTreeTableColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'size', header: 'Size' },
];

describe('CaeTreeTable (real browser, #263)', () => {
  let fixture: ComponentFixture<CaeTreeTable<Item>>;
  let el: HTMLElement;

  const rows = (): HTMLElement[] => Array.from(el.querySelectorAll<HTMLElement>('tbody tr'));
  const region = (): HTMLElement => el.querySelector<HTMLElement>('.cae-tree-table__empty')!;
  const frame = (): Promise<unknown> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [CaeTreeTable] }).compileComponents();
    loadCaelumTheme();
    fixture = TestBed.createComponent(CaeTreeTable<Item>);
    fixture.componentRef.setInput('nodes', TREE);
    fixture.componentRef.setInput('columns', COLS);
    fixture.componentRef.setInput('caption', 'Files');
    await settle();
    el = fixture.nativeElement as HTMLElement;
  });

  describe('empty-state live region', () => {
    it('stays rendered while empty, so the a11y tree is watching it before the transition', () => {
      // The whole point: while the table HAS rows the region is blank, and that is exactly when it
      // must already be registered. `display: none` here prunes it and un-watches it — the defect
      // this slice fixed. A computed-style read, so only a browser can make this assertion.
      //
      // This test is the ONLY guard on that defect, confirmed by mutation: restoring
      // `display: none` fails here and leaves the mutation-type test below GREEN. Angular updates the
      // same text node either way, so the record type is unchanged; and by the time the region holds
      // text it is `display: block` even when buggy. The pruning only exists in the populated state.
      expect(region().textContent).toBe('');
      expect(getComputedStyle(region()).display).not.toBe('none');
      expect(getComputedStyle(region()).visibility).not.toBe('hidden');
    });

    it('delivers the empty message as an in-place mutation of that same watched node', async () => {
      const born = region();
      expect(born.textContent).toBe('');

      let textMutations = 0;
      const insertedCarryingText: string[] = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'characterData') textMutations++;
          for (const node of Array.from(record.addedNodes)) {
            const added = node as HTMLElement;
            if (added.classList?.contains('cae-tree-table__empty') && added.textContent?.trim()) {
              insertedCarryingText.push(added.textContent.trim());
            }
          }
        }
      });
      observer.observe(el, { characterData: true, childList: true, subtree: true });

      fixture.componentRef.setInput('nodes', []);
      await settle();
      await frame();
      observer.disconnect();

      // A live region announces a CHANGE to a watched node. Text arriving on a node that was itself
      // just inserted is the case screen readers do not reliably announce, so assert the mutation
      // type — no `textContent` read can tell these two apart.
      expect(region().textContent).toContain('No data.');
      expect(textMutations).toBeGreaterThan(0);
      expect(insertedCarryingText).toEqual([]);
      expect(region()).toBe(born);
      expect(getComputedStyle(region()).display).not.toBe('none');
    });
  });

  describe('focus ring', () => {
    it('paints the resolved --cae-focus-ring token on a keyboard-focused row', async () => {
      rows()[0].focus();
      fixture.detectChanges();

      const ring = getComputedStyle(rows()[0]);
      expect(rows()[0].matches(':focus-visible')).toBe(true);
      expect(ring.outlineStyle).toBe('solid');
      // Not just "an outline exists": 2px is the token's width, and a real rgb() colour proves the
      // custom property RESOLVED rather than falling back (an unloaded theme computes to nothing).
      expect(ring.outlineWidth).toBe('2px');
      expect(ring.outlineColor).toMatch(/^rgb/);
    });

    it('keeps the ring when the arrow keys move focus programmatically', async () => {
      rows()[0].focus();
      fixture.detectChanges();

      await userEvent.keyboard('{ArrowDown}');
      fixture.detectChanges();

      // `focusRow()` calls `.focus()` itself, and `:focus-visible` is a heuristic — a ring that shows
      // on Tab can vanish on the very keys this grid navigates with.
      const active = document.activeElement as HTMLElement;
      expect(rows()).toContain(active);
      expect(active.matches(':focus-visible')).toBe(true);
      expect(getComputedStyle(active).outlineWidth).toBe('2px');
    });
  });

  describe('focus restoration on a programmatic collapse (#769 — limitation, not behaviour)', () => {
    it('drops focus to <body> while the roving tab stop re-homes to a valid row', async () => {
      fixture.componentRef.setInput('expanded', [SRC, APP]);
      await settle();
      expect(rows().length).toBeGreaterThan(2);

      const deep = rows()[2];
      deep.focus();
      fixture.detectChanges();
      expect(document.activeElement).toBe(deep);

      fixture.componentRef.setInput('expanded', []);
      await settle();
      await frame();

      // The documented gap, measured. When #769 lands this line must change — that is the point of
      // pinning a limitation rather than leaving it as prose nothing can falsify.
      expect(document.activeElement).toBe(document.body);
      // ...but the grid stays reachable: exactly one row still owns the tab stop.
      expect(rows().filter((r) => r.tabIndex === 0)).toHaveLength(1);

      // Vacuity guard, in this test rather than a sibling. "Focus is on <body>" also passes when the
      // component is inert or the rows never rendered. Re-enter the grid and drive it: if the arrows
      // still move focus, the assertions above described a real state, not a dead fixture.
      const tabStop = rows().find((r) => r.tabIndex === 0)!;
      tabStop.focus();
      await userEvent.keyboard('{ArrowDown}');
      fixture.detectChanges();
      expect(document.activeElement).not.toBe(tabStop);
      expect(rows()).toContain(document.activeElement as HTMLElement);
    });
  });

  it('has no axe violations', async () => {
    await expectNoA11yViolations(el);
  });
});
