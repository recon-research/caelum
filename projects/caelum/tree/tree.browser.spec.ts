/**
 * Real-browser verification for `cae-tree` (#405, was #41).
 *
 * **The claim under test.** The component's doc block promises the WAI-ARIA tree pattern as the
 * CDK provides it: each node is a `treeitem` with *"a **single roving tab stop** (one node is
 * tabbable, the rest carry `tabindex="-1"`), arrow keys move between nodes, and `(activation)`
 * (Enter/Space) selects"*, with the toggle deliberately left a `tabindex="-1"` mouse affordance
 * because *"keyboard users expand/collapse with Left/Right"*.
 *
 * **Why it waited for the harness.** `tree.spec.ts` (jsdom) covers structure, labelling, the
 * collapse and `nodeSelect` — but contains **no keyboard test at all**. Roving is unverified
 * today, and it is the part that needs a real focus environment: keys delivered by the browser
 * rather than synthesised, and `document.activeElement` moved by the CDK's own `focus()` calls.
 *
 * The second browser-only lever is **whether a node is rendered**. The tree stamps children
 * eagerly — *"a nested `childrenAccessor` renders all descendants regardless of expansion,
 * collapsed subtrees are hidden with CSS bound to `isExpanded`"* — so a collapsed tree holds its
 * whole subtree in the DOM, `role="treeitem"` and all. jsdom cannot tell those nodes from the
 * visible ones (`offsetParent` is always `null` there); here it is the discriminator.
 *
 * **What the skip test does and does not prove.** Measured while writing this file: forcing the
 * collapsed subtree visible (`display: block !important`) and roving again still lands on the next
 * *sibling* — `appleRendered=true fruitAriaExpanded=false arrowDownLanded=Vegetables`. So the key
 * manager skips by the CDK's **expansion state**, not because the nodes are unrendered; that arm
 * alone would pass in jsdom too, and is not claimed as browser-only. What the pairing below pins
 * is that the two independent mechanisms — the CSS collapse and the rove — are driven by the same
 * state and therefore agree. A node the user cannot see is a node the keyboard cannot reach; let
 * either side drift and the tree strands focus on an invisible row.
 *
 * Run it: `npm run test:browser`.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';

import { CaeTree, type CaeTreeNode } from './tree';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme, themeToken } from '../testing/theme';

/**
 * Two expandable branches around a leaf. The trailing `Bread` leaf is the target of the
 * skip-the-hidden-subtree assertion: with `Fruit` collapsed, Down from `Fruit` must reach
 * `Vegetables` — never `Apple`, which is stamped but not rendered.
 */
const NODES: readonly CaeTreeNode[] = [
  { label: 'Fruit', children: [{ label: 'Apple' }, { label: 'Banana' }] },
  { label: 'Vegetables', children: [{ label: 'Carrot' }] },
  { label: 'Bread' },
];

/** Every label in the fixture, so a count assertion can't silently drift. */
const ALL_LABELS = ['Fruit', 'Apple', 'Banana', 'Vegetables', 'Carrot', 'Bread'];
const ROOT_LABELS = ['Fruit', 'Vegetables', 'Bread'];

@Component({
  imports: [CaeTree],
  template: `<cae-tree [nodes]="nodes" ariaLabel="Pantry" (nodeSelect)="selected.push($event)" />`,
})
class TreeHost {
  readonly nodes = NODES;
  readonly selected: CaeTreeNode[] = [];
}

describe('CaeTree (real browser)', () => {
  let el: HTMLElement;
  let host: TreeHost;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [TreeHost] });
    // The `display:none` collapse is a *token-layer-independent* rule, but the focus ring and row
    // metrics are not; load the real theme so this measures what Caelum ships (#724, PATTERNS §9).
    loadCaelumTheme();
    const fixture = TestBed.createComponent(TreeHost);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    host = fixture.componentInstance;
  });

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  /** Every stamped treeitem, expanded or not — DOM order. */
  const items = () => Array.from(el.querySelectorAll<HTMLElement>('[role="treeitem"]'));

  /**
   * The treeitems a sighted user can actually reach. `offsetParent === null` for a
   * `display: none` subtree — the check jsdom cannot make (it is always null there).
   */
  const visible = () => items().filter((n) => n.offsetParent !== null);

  const labelOf = (n: Element | null) => n?.querySelector('.cae-tree__label')?.textContent?.trim();
  const active = () => document.activeElement?.closest('[role="treeitem"]') ?? null;
  const byLabel = (label: string) => items().find((n) => labelOf(n) === label)!;

  it('resolves the real token layer, so the focus ring is a real rule', () => {
    // Liveness for the assertions below: a themeless page still roves, but the ring it draws is
    // invalid-at-computed-value-time, and any later ring assertion would be vacuous (#724).
    expect(themeToken('--cae-focus-ring')).not.toBe('');
    expect(items().length).toBeGreaterThan(1);
  });

  it('stamps every descendant but renders only the expanded ones', () => {
    // The premise the rest of the file rests on — and the exact shape jsdom cannot see.
    expect(items().map(labelOf)).toEqual(ALL_LABELS);
    expect(visible().map(labelOf)).toEqual(ROOT_LABELS);
  });

  it('exposes a single roving tab stop across the rendered nodes', () => {
    const tabbable = visible().filter((n) => n.getAttribute('tabindex') === '0');
    const roved = visible().filter((n) => n.getAttribute('tabindex') === '-1');

    expect(tabbable).toHaveLength(1);
    // Not vacuous: the remaining rendered nodes are explicitly parked at -1, and together the two
    // buckets account for every rendered node (so a node with no tabindex at all fails here).
    expect(roved).toHaveLength(visible().length - 1);
  });

  it('keeps the toggle out of the tab order, so the node stays the only stop', async () => {
    // The doc block's reason for the -1 toggle: a focusable button inside each row would add a
    // second tab stop per node and swallow the CDK's arrow handling.
    const toggles = el.querySelectorAll<HTMLElement>('.cae-tree__toggle');
    expect(toggles.length).toBeGreaterThan(0);
    for (const t of toggles) expect(t.getAttribute('tabindex')).toBe('-1');
  });

  it('moves real focus between rendered nodes with the arrow keys', async () => {
    byLabel('Fruit').focus();
    expect(active()).toBe(byLabel('Fruit'));

    await userEvent.keyboard('{ArrowDown}');
    // The #41 claim itself: focus actually moved, in a real focus environment.
    expect(labelOf(active())).toBe('Vegetables');

    await userEvent.keyboard('{ArrowUp}');
    expect(labelOf(active())).toBe('Fruit');
  });

  it('keeps the unrendered subtree out of the rove, so focus never strands on a hidden row', async () => {
    // `Apple` and `Banana` are in the DOM, carry role=treeitem, and sit between `Fruit` and
    // `Vegetables` in document order — so roving by DOM order would land on `Apple`.
    //
    // Both halves are asserted deliberately. The rove skips by the CDK's expansion state (proved
    // by probe: forcing the subtree visible does not change where Down lands), and the CSS hides
    // by the same state — two independent mechanisms. Pinning them together is the point: this
    // fails if either drifts, which is when a user would land on a row they cannot see.
    expect(labelOf(items()[1])).toBe('Apple');
    expect(byLabel('Apple').offsetParent).toBeNull();

    byLabel('Fruit').focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(labelOf(active())).toBe('Vegetables');
    expect(active()).not.toBe(byLabel('Apple'));
  });

  it('expands with Right, revealing the subtree to the rove', async () => {
    byLabel('Fruit').focus();
    await userEvent.keyboard('{ArrowRight}');

    // The keyboard expand/collapse route the -1 toggle delegates to.
    expect(byLabel('Fruit').getAttribute('aria-expanded')).toBe('true');
    expect(byLabel('Apple').offsetParent).not.toBeNull();

    // …and the newly rendered child is now the next stop, where it was skipped before.
    await userEvent.keyboard('{ArrowDown}');
    expect(labelOf(active())).toBe('Apple');
  });

  it('collapses with Left, removing the subtree from the rove again', async () => {
    byLabel('Fruit').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(byLabel('Apple').offsetParent).not.toBeNull();

    byLabel('Fruit').focus();
    await userEvent.keyboard('{ArrowLeft}');

    expect(byLabel('Fruit').getAttribute('aria-expanded')).toBe('false');
    expect(byLabel('Apple').offsetParent).toBeNull();

    await userEvent.keyboard('{ArrowDown}');
    expect(labelOf(active())).toBe('Vegetables');
  });

  it('selects the focused node with Enter', async () => {
    byLabel('Bread').focus();
    await userEvent.keyboard('{Enter}');

    expect(host.selected.map((n) => n.label)).toEqual(['Bread']);
  });

  it('has no axe violations, no rules disabled', async () => {
    await expectNoA11yViolations(el);
  });
});
