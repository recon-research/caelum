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
 * that is a disallowed child of `role="table"` (#718 — still open, and the one
 * rule disabled below). The second matters twice over: the jsdom spec had been
 * scope-disabling that rule for years, blaming the empty rowgroup, so the
 * carve-out was masking a real critical violation rather than papering over a
 * jsdom artefact.
 *
 * Run it: `npm run test:browser`.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeDataGrid } from './data-grid';
import { CaeColumn } from './grid-types';
import { expectNoA11yViolations } from '../testing/a11y';

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

  it('has no axe violations except the known role=status defect (#718)', async () => {
    await setup({ caption: 'Team roster' });
    // The ONE disabled rule, and not for the reason the jsdom spec assumed: it
    // fires here *with rows rendered*, because the role=status live region is a
    // disallowed child of role=table. #718 restructures the frame; this comes off
    // with it. Everything else — including color-contrast, which axe can only
    // report as `incomplete` under jsdom — is evaluated for real.
    await expectNoA11yViolations(el, { disableRules: ['aria-required-children'] });
  });
});
