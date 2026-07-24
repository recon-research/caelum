/**
 * Real-browser verification for `cae-data-grid` (#240) — the first spec on the
 * browser harness, and the proof that the harness is live rather than inert.
 *
 * **Why this component.** The grid's body is a `cdk-virtual-scroll-viewport`,
 * which sizes its rendered range from `getBoundingClientRect()`. jsdom has no
 * layout engine, so that measures 0 there and the range collapses to whatever
 * `CdkFixedSizeVirtualScroll`'s default 200px buffer covers — about 5 rows,
 * independent of the configured viewport. In a real browser the same grid renders
 * 13: the 8 that fill a 384px viewport, plus the buffer.
 *
 * That gap is what the assertions key on. Two of them cannot hold under jsdom by
 * construction — the measured viewport height, and a row count sufficient to fill
 * it — so this file is a live-harness detector, not just a second copy of the
 * jsdom suite. (`*.browser.spec.ts` is excluded from the jsdom target in
 * `angular.json`; if these ever run there, that exclusion regressed.)
 *
 * **What it found.** Running axe against a *rendered* grid immediately surfaced
 * two defects jsdom structurally cannot see: a scrollable region with no keyboard
 * access (fixed with #240 — asserted below), and a `role="status"` live region
 * that is a disallowed child of `role="table"` (#718, since fixed by moving the
 * role off the visual frame onto an inner element). The second matters twice
 * over: the jsdom spec had been scope-disabling that rule for years, blaming the
 * empty rowgroup, so the carve-out was masking a real critical violation rather
 * than papering over a jsdom artefact.
 *
 * The axe runs below therefore disable **no** rules, and cover the pager arm too —
 * its buttons and rows-per-page `<select>` are the other disallowed table children
 * #718 would have exposed.
 *
 * Run it: `npm run test:browser`.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeDataGrid } from './data-grid';
import { CaeColumn } from './grid-types';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme, themeToken } from '../testing/theme';

interface Person {
  name: string;
  age: number;
  role: string;
}

const COLUMNS: CaeColumn<Person>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name, sortable: true },
  { id: 'age', header: 'Age', value: (r) => r.age, sortable: true, align: 'end' },
  { id: 'role', header: 'Role', value: (r) => r.role },
];

// The component's defaults, restated so the assertions can derive from them.
const VIEWPORT_PX = 384; // viewportHeight default '24rem' at a 16px root
const ROW_PX = 48; // rowHeight default
/** Rows needed to fill the viewport — 8. jsdom manages ~5 (buffer only). */
const ROWS_FILLING_VIEWPORT = Math.floor(VIEWPORT_PX / ROW_PX);

// Far more rows than the viewport can show, so "windowed, not all" is a real
// assertion rather than an artefact of a short list.
const TOTAL_ROWS = 200;
const PEOPLE: Person[] = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
  name: `Person ${i + 1}`,
  age: 20 + (i % 40),
  role: i % 2 === 0 ? 'Eng' : 'Lead',
}));

describe('CaeDataGrid (real browser)', () => {
  let fixture: ComponentFixture<CaeDataGrid<Person>>;
  let el: HTMLElement;

  /**
   * cdk-virtual-scroll measures the viewport and emits its rendered range off
   * animation frames, outside Angular — so `detectChanges` alone is always too
   * early. Pump a few frames, re-rendering between them, so the range settles.
   */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      fixture.detectChanges();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(inputs: Record<string, unknown> = {}): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CaeDataGrid] });
    // Before the component: axe must see the colours Caelum actually ships, not the
    // unstyled defaults a themeless page would give it (#724).
    loadCaelumTheme();
    fixture = TestBed.createComponent(CaeDataGrid<Person>);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', PEOPLE);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  }

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  const body = () => el.querySelector('.cae-data-grid__body') as HTMLElement;
  const bodyRows = () => Array.from(body().querySelectorAll<HTMLElement>('[role="row"]'));

  it('gives the virtual-scroll viewport real layout', async () => {
    await setup();
    // 0 under jsdom — the root cause of everything else on this page.
    expect(body().getBoundingClientRect().height).toBe(VIEWPORT_PX);
  });

  it('renders enough rows to fill the viewport, windowed against the full set', async () => {
    await setup();
    const rows = bodyRows();
    // Fills the viewport (jsdom's buffer-only ~5 would fail this) …
    expect(rows.length).toBeGreaterThanOrEqual(ROWS_FILLING_VIEWPORT);
    // … but is still a window, which is the point of virtualizing at all.
    expect(rows.length).toBeLessThan(TOTAL_ROWS);
  });

  it('anchors aria-rowindex to the full set, past the header row', async () => {
    await setup();
    // Header is row 1, so the first body row is 2 (pageOffset + i + 2).
    expect(bodyRows()[0].getAttribute('aria-rowindex')).toBe('2');
  });

  it('renders each row as cells carrying aria-colindex', async () => {
    await setup();
    const cells = Array.from(bodyRows()[0].querySelectorAll<HTMLElement>('[role="cell"]'));
    expect(cells.length).toBe(COLUMNS.length);
    expect(cells.map((c) => c.getAttribute('aria-colindex'))).toEqual(['1', '2', '3']);
    expect(cells[0].textContent!.trim()).toBe('Person 1');
  });

  it('is keyboard-reachable so the scrollable body can be scrolled without a mouse', async () => {
    await setup();
    // WCAG 2.1.1 / axe scrollable-region-focusable, fixed in this slice.
    expect(body().tabIndex).toBe(0);
    body().focus();
    expect(document.activeElement).toBe(body());
  });

  it('resolves the real token layer, so colour rules are not vacuous', async () => {
    await setup();
    // The guard for every colour assertion below. Absent tokens read '' and would make
    // axe's color-contrast a check against unstyled defaults (#724). The semantic colours
    // are `light-dark(…)`, which only a real engine resolves — jsdom stores them raw.
    expect(themeToken('--cae-color-border')).not.toBe('');
    // A custom property computes as a token stream, so the semantic colours read back as the
    // literal `light-dark(…)` here just as in jsdom. What axe actually reads is the USED value,
    // which only a real engine resolves — that is the assertion worth making.
    expect(themeToken('--cae-color-on-surface')).toContain('light-dark(');
    const frame = el.querySelector('.cae-data-grid') as HTMLElement;
    expect(getComputedStyle(frame).color).toMatch(/^rgba?\(/);
    // …and the grid is really painting with the tokens: the frame's border comes back.
    expect(getComputedStyle(frame).borderTopWidth).toBe('1px');
    expect(getComputedStyle(frame).borderTopStyle).toBe('solid');
  });

  it('has no axe violations, no rules disabled', async () => {
    await setup({ caption: 'Team roster' });
    // Nothing disabled: with rows really rendered, the table role really scoped
    // (#718) and layout really computed, color-contrast — which axe can only
    // report as `incomplete` under jsdom — is evaluated for real here.
    await expectNoA11yViolations(el);
  });

  it('really evaluates color-contrast — a low-contrast override fails the run', async () => {
    await setup({ caption: 'Team roster' });
    // The teeth check for the whole colour story. Before #724 no theme was loaded, so axe
    // compared unstyled near-black-on-white defaults: the rule passed trivially and could
    // not fail whatever Caelum shipped. Force a near-invisible foreground on the frame and
    // the very same run must now report color-contrast — proving the green above is earned.
    const frame = el.querySelector('.cae-data-grid') as HTMLElement;
    frame.style.setProperty('--cae-color-on-surface', '#f7f7f8');
    await expect(expectNoA11yViolations(el)).rejects.toThrow(/color-contrast/);
  });

  it('has no axe violations with the pager rendered', async () => {
    await setup({
      caption: 'Team roster',
      paginated: true,
      pageSize: 25,
      pageSizeOptions: [25, 50],
    });
    // The pager sits inside the visual frame but outside role="table" (#718) — its
    // buttons and rows-per-page select would otherwise be disallowed table children.
    expect(el.querySelector('.cae-data-grid__pager')).not.toBeNull();
    const pager = el.querySelector('.cae-data-grid__pager');
    expect(el.querySelector('[role="table"]')!.contains(pager)).toBe(false);
    // Mutation-checked: with the pager back inside the role, axe alone (structural
    // guard removed) reports critical aria-required-children — "Element has children
    // which are not allowed: span[aria-live], button[aria-label], select".
    await expectNoA11yViolations(el);
  });

  it('splits the table role off the frame without adding a box of its own', async () => {
    await setup({ caption: 'Team roster', paginated: true, pageSize: 25 });
    const rect = (sel: string) => (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
    const frameEl = el.querySelector('.cae-data-grid') as HTMLElement;
    const frame = rect('.cae-data-grid');
    const wrapper = rect('.cae-data-grid__table');
    const caption = rect('.cae-data-grid__caption');
    const body = rect('.cae-data-grid__body');
    const pager = rect('.cae-data-grid__pager');
    // The frame's 1px token border is real here (#724), so compare against its CONTENT box —
    // an earlier version of this test compared to the border box and only passed because the
    // themeless page computed the border to 0.
    const cs = getComputedStyle(frameEl);
    const bx = Number.parseFloat(cs.borderLeftWidth) + Number.parseFloat(cs.borderRightWidth);
    const by = Number.parseFloat(cs.borderBottomWidth);
    // The role wrapper spans exactly its content — no border/padding/margin of its own …
    expect(wrapper.top).toBe(caption.top);
    expect(wrapper.bottom).toBe(body.bottom);
    expect(wrapper.width).toBe(frame.width - bx);
    // … and the frame still stacks contiguously through the pager, which is what makes
    // the #718 restructure visually inert. Measured against a `display: contents` control
    // (which reproduces the pre-split box tree): every rect was byte-identical. The frame
    // keeps the clipping + the busy-overlay anchor.
    expect(pager.top).toBe(body.bottom);
    expect(frame.bottom - by).toBe(pager.bottom);
    expect(cs.overflow).toBe('hidden');
  });

  it('keeps the status live region outside the table role but inside the frame', async () => {
    await setup();
    const status = el.querySelector('.cae-data-grid__empty')!;
    // Both halves matter: outside the role (the #718 violation) …
    expect(el.querySelector('[role="table"]')!.contains(status)).toBe(false);
    // … and still inside the frame, so it is clipped/positioned as before.
    expect(el.querySelector('.cae-data-grid')!.contains(status)).toBe(true);
  });
});
