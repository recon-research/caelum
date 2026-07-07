import { Component, ComponentRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeDataGrid } from './data-grid';
import { CAE_GRID } from './grid-adapter';
import { ClientGridAdapter } from './client-grid-adapter';
import { ServerGridAdapter, provideServerGrid } from './server-grid-adapter';
import { CaeColumn, CaeGridDataRequest, CaeSort } from './grid-types';

// A plain typed interface (no index signature) — the grid generic is unconstrained (like cae-table).
interface Person {
  name: string;
  age: number;
  role: string;
}

const COLUMNS: CaeColumn<Person>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name, sortable: true },
  { id: 'age', header: 'Age', value: (r) => r.age, sortable: true, align: 'end' },
  { id: 'role', header: 'Role', value: (r) => r.role }, // not sortable
];

const PEOPLE: Person[] = [
  { name: 'Bob', age: 30, role: 'Lead' },
  { name: 'Ann', age: 20, role: 'Eng' },
  { name: 'Cy', age: 25, role: 'Eng' },
];

/** Records sortBy calls, to prove the component drives whatever engine CAE_GRID hands it. */
class RecordingAdapter<T> extends ClientGridAdapter<T> {
  readonly sortCalls: (CaeSort | null)[] = [];
  override sortBy(sort: CaeSort | null): void {
    this.sortCalls.push(sort);
    super.sortBy(sort);
  }
}

// NOTE (test scope): the body rows are rendered by cdk-virtual-scroll, which measures its viewport
// via getBoundingClientRect — 0 in jsdom, so it renders no rows here. The DATA that would populate
// them is proven exhaustively in client-grid-adapter.spec.ts; the component's rendering + recycling
// of those rows at scale is an M4 real-browser verify follow-up. These specs assert the jsdom-stable
// wiring: header, sort, pager (via the adapter-derived range/disabled state), aria, empty, and the
// engine-swap isolation — none of which depend on rendered body rows.
describe('CaeDataGrid', () => {
  let fixture: ComponentFixture<CaeDataGrid<Person>>;
  let ref: ComponentRef<CaeDataGrid<Person>>;
  let el: HTMLElement;

  function setup(inputs: Record<string, unknown> = {}, providers: unknown[] = []): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CaeDataGrid],
      providers: providers as never[],
    });
    fixture = TestBed.createComponent(CaeDataGrid<Person>);
    ref = fixture.componentRef;
    ref.setInput('columns', COLUMNS);
    ref.setInput('data', PEOPLE);
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    flush();
  }

  // Two CD passes: the first creates the view, the second lets the wiring effects settle (zoneless).
  function flush(): void {
    fixture.detectChanges();
    fixture.detectChanges();
  }

  // Focus assertions (document.activeElement) require the host to be connected to the live document.
  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  const grid = () => el.querySelector('[role="table"]') as HTMLElement;
  const headerCells = () => Array.from(el.querySelectorAll('[role="columnheader"]'));
  const headerByText = (text: string) => headerCells().find((h) => h.textContent!.includes(text))!;
  const sortButtons = () =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.cae-data-grid__sort'));
  const pageBtn = (label: string) =>
    el.querySelector<HTMLButtonElement>(`.cae-data-grid__page-btn[aria-label="${label}"]`);

  it('renders a role=table with aria-rowcount (incl. header) + aria-colcount', () => {
    setup();
    const g = grid();
    expect(g).not.toBeNull();
    expect(g.getAttribute('aria-rowcount')).toBe('4'); // 3 rows + header
    expect(g.getAttribute('aria-colcount')).toBe('3');
  });

  it('renders one columnheader per column, in order, with header text', () => {
    setup();
    const text = headerCells().map((h) => h.textContent!.replace(/[↕↑↓]/g, '').trim());
    expect(text).toEqual(['Name', 'Age', 'Role']);
  });

  it('makes only sortable columns a sort button carrying aria-sort', () => {
    setup();
    expect(sortButtons().length).toBe(2); // name + age; role is not sortable
    const withSort = headerCells().filter((h) => h.hasAttribute('aria-sort'));
    expect(withSort.length).toBe(2);
    expect(withSort.every((h) => h.getAttribute('aria-sort') === 'none')).toBe(true);
    expect(headerByText('Role').hasAttribute('aria-sort')).toBe(false);
  });

  it('cycles a sortable header three-state (none -> asc -> desc -> none) and emits sortChange', () => {
    const emitted: (CaeSort | null)[] = [];
    setup();
    ref.instance.sortChange.subscribe((s) => emitted.push(s));
    const nameBtn = () => headerByText('Name').querySelector('button') as HTMLButtonElement;

    nameBtn().click();
    flush();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('ascending');

    nameBtn().click();
    flush();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('descending');

    nameBtn().click();
    flush();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('none');

    expect(emitted).toEqual([
      { columnId: 'name', dir: 'asc' },
      { columnId: 'name', dir: 'desc' },
      null,
    ]);
  });

  it('reflects the initial sort (sortActive + sortDirection) on the header aria-sort', () => {
    setup({ sortActive: 'age', sortDirection: 'asc' });
    expect(headerByText('Age').getAttribute('aria-sort')).toBe('ascending');
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('none');
  });

  it('shows no pager by default', () => {
    setup();
    expect(el.querySelector('.cae-data-grid__pager')).toBeNull();
  });

  it('wires the pager from adapter state when [paginated] (range + disabled + advance)', () => {
    setup({ paginated: true, pageSize: 2 });
    expect(el.querySelector('.cae-data-grid__pager')).not.toBeNull();
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-2 of 3');
    // Prev disabled on the first page, Next enabled (3 rows over pages of 2).
    expect(pageBtn('Previous page')?.disabled).toBe(true);
    expect(pageBtn('Next page')?.disabled).toBe(false);

    pageBtn('Next page')!.click();
    flush();
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('3-3 of 3');
    expect(pageBtn('Next page')?.disabled).toBe(true);
    expect(pageBtn('Previous page')?.disabled).toBe(false);
  });

  // ---- Rows-per-page menu ([pageSizeOptions], #177) ----
  const pageSizeSelect = () =>
    el.querySelector<HTMLSelectElement>('.cae-data-grid__page-size-select');

  it('rows-per-page menu: renders a labelled select and re-paginates on change (client, #177)', () => {
    setup({ paginated: true, pageSize: 2, pageSizeOptions: [2, 5] });
    const select = pageSizeSelect()!;
    expect(select).not.toBeNull();
    expect(select.closest('label')?.textContent).toContain('Rows per page'); // the accessible name
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-2 of 3');
    select.value = '5';
    select.dispatchEvent(new Event('change'));
    flush();
    // 5 > 3 rows -> a single page of all rows.
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-3 of 3');
  });

  it('rows-per-page menu: a size change resets to the first page (#177)', () => {
    setup({ paginated: true, pageSize: 2, pageSizeOptions: [2, 5] });
    pageBtn('Next page')!.click(); // -> page 1 ("3-3 of 3")
    flush();
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('3-3 of 3');
    const select = pageSizeSelect()!;
    select.value = '5';
    select.dispatchEvent(new Event('change'));
    flush();
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-3 of 3'); // back to page 0
  });

  it('shows no rows-per-page menu unless [pageSizeOptions] is set', () => {
    setup({ paginated: true, pageSize: 2 });
    expect(pageSizeSelect()).toBeNull();
  });

  it('rows-per-page menu: always shows the size in effect even if [pageSize] is not among the options (#177)', () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
    try {
      setup({ paginated: true, pageSize: 25, pageSizeOptions: [10, 50] }); // 25 is not listed
      const select = pageSizeSelect()!;
      // renderedPageSizes appends the effective size so the control can never show a size the grid isn't
      // using (WCAG 4.1.2) — it is present AND selected, and the range confirms the grid paginates by 25.
      expect(Array.from(select.options).map((o) => o.value)).toContain('25');
      expect(select.value).toBe('25'); // the effective size is shown + selected (no false Value to AT)
      expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-3 of 3'); // 25 >= 3 rows
      expect(warnings.some((w) => w.includes('is not among [pageSizeOptions]'))).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });

  it('rows-per-page menu: dedupes [pageSizeOptions] (no NG0955 track-key crash) and dev-warns (#177)', () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
    try {
      // A duplicate value would crash the @for track with NG0955 if not deduped first (this test would throw).
      setup({ paginated: true, pageSize: 10, pageSizeOptions: [10, 25, 25] });
      expect(Array.from(pageSizeSelect()!.options).map((o) => o.value)).toEqual(['10', '25']);
      expect(warnings.some((w) => w.includes('unique positive integers'))).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });

  it('rows-per-page menu: emits (pageSizeChange) so a client consumer can observe the pick (#177)', () => {
    setup({ paginated: true, pageSize: 2, pageSizeOptions: [2, 5] });
    const sizes: number[] = [];
    ref.instance.pageSizeChange.subscribe((n) => sizes.push(n));
    const select = pageSizeSelect()!;
    select.value = '5';
    select.dispatchEvent(new Event('change'));
    flush();
    expect(sizes).toEqual([5]);
  });

  it('server mode: a rows-per-page change emits a dataRequest with the new size, page reset to 0 (#177)', () => {
    setup(
      {
        data: [PEOPLE[0], PEOPLE[1]],
        total: 812,
        paginated: true,
        pageSize: 2,
        pageSizeOptions: [2, 25],
      },
      [provideServerGrid()],
    );
    const requests: CaeGridDataRequest[] = [];
    ref.instance.dataRequest.subscribe((req) => requests.push(req));
    const select = pageSizeSelect()!;
    select.value = '25';
    select.dispatchEvent(new Event('change'));
    flush();
    expect(requests).toContainEqual({ sort: null, page: 0, pageSize: 25 });
  });

  it('rows-per-page menu: the select is natively disabled while loading — genuinely inert, no racing request (#177/#192)', () => {
    setup(
      {
        data: [PEOPLE[0], PEOPLE[1]],
        total: 812,
        paginated: true,
        pageSize: 2,
        pageSizeOptions: [2, 25],
        loading: true,
      },
      [provideServerGrid()],
    );
    // Native [disabled] (not aria-disabled): a real user cannot change it, so no racing dataRequest is
    // possible, and AT hears an honest "disabled" (the select would otherwise complete its whole announced
    // interaction before any handler no-op could revert it — the #192 pager-button trick does not translate).
    expect(pageSizeSelect()!.disabled).toBe(true);
  });

  it('announces the empty state in a persistent role=status live region', () => {
    setup({ data: [], emptyMessage: 'Nobody here.' });
    const region = el.querySelector('.cae-data-grid__empty') as HTMLElement;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent!.trim()).toBe('Nobody here.');
    expect(grid().getAttribute('aria-rowcount')).toBe('1'); // header only
  });

  it('keeps the empty region mounted-but-empty while rows are present (announced transition)', () => {
    setup();
    const region = () => el.querySelector('.cae-data-grid__empty') as HTMLElement;
    const first = region();
    expect(first.textContent!.trim()).toBe('');
    ref.setInput('data', []);
    flush();
    expect(region()).toBe(first); // same element gains text
    expect(region().textContent!.trim()).toBe('No data.');
  });

  it('names the table via aria-labelledby -> the visible caption (not a nameless role=table)', () => {
    setup({ caption: 'Team roster', ariaLabel: 'People' });
    const captionEl = el.querySelector('.cae-data-grid__caption') as HTMLElement;
    expect(captionEl.textContent!.trim()).toBe('Team roster');
    // The accessible name comes from the caption via aria-labelledby; aria-label is suppressed so
    // the visible caption wins (role=table is NOT name-from-content, so this link is required).
    const labelledby = grid().getAttribute('aria-labelledby');
    expect(labelledby).toBe(captionEl.id);
    expect(captionEl.id).toBeTruthy();
    expect(grid().hasAttribute('aria-label')).toBe(false);
  });

  it('sets aria-label when there is no caption, and omits both label mechanisms otherwise', () => {
    setup({ ariaLabel: 'People' });
    expect(grid().getAttribute('aria-label')).toBe('People');
    expect(grid().hasAttribute('aria-labelledby')).toBe(false);
    setup();
    expect(grid().hasAttribute('aria-label')).toBe(false);
    expect(grid().hasAttribute('aria-labelledby')).toBe(false);
  });

  it('exposes exportRows() as a public passthrough to the engine (RFC-4180 CSV of the sorted set)', async () => {
    setup();
    const blob = ref.instance.exportRows();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('text/csv');
    const text = await blob.text();
    // Header + one line per (unsorted) row, read through the column value accessors.
    expect(text.split('\r\n')[0]).toBe('Name,Age,Role');
    expect(text).toContain('Bob,30,Lead');
    expect(text.split('\r\n').length).toBe(4); // header + 3 rows
  });

  it('throws a clear cae-data-grid error on a duplicate column id (dev config guard)', () => {
    expect(() =>
      setup({
        columns: [
          { id: 'name', header: 'Name', value: (r: Person) => r.name },
          { id: 'name', header: 'Name again', value: (r: Person) => r.role },
        ],
      }),
    ).toThrowError(/cae-data-grid: duplicate column id/);
  });

  it('reacts to a data change, updating the aria-rowcount', () => {
    setup();
    expect(grid().getAttribute('aria-rowcount')).toBe('4');
    ref.setInput('data', [{ name: 'Solo', age: 1, role: 'X' }]);
    flush();
    expect(grid().getAttribute('aria-rowcount')).toBe('2'); // 1 row + header
  });

  it('drives a swapped-in engine through the CAE_GRID token (adapter isolation proof)', () => {
    // Proves the component uses the INJECTED engine (the DI swap seam) rather than the built-in
    // default. Full engine interchangeability (a from-scratch, non-Client engine rendering the
    // grid) is proven end-to-end when #171 drops @tanstack/table-core behind this same port.
    setup({}, [{ provide: CAE_GRID, useValue: <T>() => new RecordingAdapter<T>() }]);
    const adapter = (fixture.componentInstance as unknown as { adapter: RecordingAdapter<Person> })
      .adapter;
    expect(adapter).toBeInstanceOf(RecordingAdapter);
    // Clicking a header goes through the injected engine, not the built-in default.
    const nameBtn = headerByText('Name').querySelector('button') as HTMLButtonElement;
    nameBtn.click();
    flush();
    expect(adapter.sortCalls).toEqual([{ columnId: 'name', dir: 'asc' }]);
  });

  // ---- Server-side / lazy mode (#176) ----
  // A server engine (provideServerGrid) + a non-null [total] switches the grid to lazy mode: [data]
  // is the fetched PAGE, [total] the server's full count, and (dataRequest) drives the fetch.

  it('server mode: routes [data]/[total] through applyServerResult (renders the slice, reports the server total)', () => {
    setup({ data: [PEOPLE[0], PEOPLE[1]], total: 812, paginated: true, pageSize: 2 }, [
      provideServerGrid(),
    ]);
    const adapter = (fixture.componentInstance as unknown as { adapter: unknown }).adapter;
    expect(adapter).toBeInstanceOf(ServerGridAdapter);
    // aria-rowcount + pager reflect the SERVER total (812), not the 2-row fetched slice.
    expect(grid().getAttribute('aria-rowcount')).toBe('813'); // 812 + header
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-2 of 812');
    expect(pageBtn('Next page')?.disabled).toBe(false); // 812 rows remain past this page
    expect(pageBtn('Previous page')?.disabled).toBe(true);
  });

  it('server mode: emits the initial dataRequest (page 0) so the consumer fetches the first slice', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CaeDataGrid], providers: [provideServerGrid()] });
    const f = TestBed.createComponent(CaeDataGrid<Person>);
    const r = f.componentRef;
    r.setInput('columns', COLUMNS);
    r.setInput('data', []);
    r.setInput('total', 0);
    r.setInput('paginated', true);
    r.setInput('pageSize', 25);
    const requests: CaeGridDataRequest[] = [];
    r.instance.dataRequest.subscribe((req) => requests.push(req)); // subscribe BEFORE the effects flush
    f.detectChanges();
    f.detectChanges();
    // The initial request fires once, with the configured page size (not a stray pageSize-0 request).
    expect(requests).toContainEqual({ sort: null, page: 0, pageSize: 25 });
    expect(requests.filter((q) => q.pageSize === 0)).toEqual([]);
  });

  it('server mode: a Next-page click emits a new dataRequest for the next slice', () => {
    setup({ data: [PEOPLE[0], PEOPLE[1]], total: 812, paginated: true, pageSize: 2 }, [
      provideServerGrid(),
    ]);
    const requests: CaeGridDataRequest[] = [];
    ref.instance.dataRequest.subscribe((req) => requests.push(req));
    pageBtn('Next page')!.click();
    flush();
    expect(requests).toContainEqual({ sort: null, page: 1, pageSize: 2 });
  });

  it('server mode: a shrunk [total] re-clamps the page and emits a fresh dataRequest for it (#190)', () => {
    setup({ data: [PEOPLE[0], PEOPLE[1]], total: 812, paginated: true, pageSize: 2 }, [
      provideServerGrid(),
    ]);
    const requests: CaeGridDataRequest[] = [];
    ref.instance.dataRequest.subscribe((req) => requests.push(req));
    pageBtn('Next page')!.click(); // advance to page 1 (of 406)
    flush();
    requests.length = 0; // focus on what the shrink emits next
    // The server now reports far fewer rows (a deletion between fetches): the new slice + count arrive
    // via [data]/[total] — the applyServerResult seam. Page 1 no longer exists (1 row = 1 page), so the
    // grid must re-fetch page 0 rather than sit on a stranded slice.
    ref.setInput('data', [PEOPLE[0]]);
    ref.setInput('total', 1);
    flush();
    expect(requests).toContainEqual({ sort: null, page: 0, pageSize: 2 });
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-1 of 1');
  });

  it('mode follows the ENGINE, not [total]: the client engine ignores [total] and dev-warns', () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
    try {
      // Default CLIENT engine + a stray server-style [total]. Pre-fix this silently killed client
      // sort/paginate (applyServerResult override); now [total] is ignored — the client still derives
      // its own total from [data], so aria-rowcount is the 3 client rows (+header), not 999.
      setup({ total: 999 });
      expect(grid().getAttribute('aria-rowcount')).toBe('4');
      expect(warnings.some((w) => w.includes('[total] is set but the client grid engine'))).toBe(
        true,
      );
    } finally {
      console.warn = realWarn;
    }
  });

  it('mode follows the ENGINE: a server engine with [total] unset falls back to page length + dev-warns', () => {
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));
    try {
      setup({ data: [PEOPLE[0], PEOPLE[1]] }, [provideServerGrid()]); // server engine, no [total]
      expect(grid().getAttribute('aria-rowcount')).toBe('3'); // 2-row page fallback + header
      expect(warnings.some((w) => w.includes('[total] is unset'))).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });

  it('server mode: a sort click emits a request carrying the sort with the page reset to 0', () => {
    setup({ data: [PEOPLE[0], PEOPLE[1]], total: 812, paginated: true, pageSize: 2 }, [
      provideServerGrid(),
    ]);
    pageBtn('Next page')!.click(); // advance so the sort's page-reset is observable
    flush();
    const requests: CaeGridDataRequest[] = [];
    ref.instance.dataRequest.subscribe((req) => requests.push(req));
    (headerByText('Name').querySelector('button') as HTMLButtonElement).click();
    flush();
    expect(requests).toContainEqual({
      sort: { columnId: 'name', dir: 'asc' },
      page: 0,
      pageSize: 2,
    });
  });

  // ---- Loading / busy state (#188) ----
  // The consumer-owned [loading] input (p-table [loading] parity): aria-busy on the row area + a
  // loading message that suppresses the empty state, so an in-flight fetch reads as loading not empty.

  const viewport = () => el.querySelector('.cae-data-grid__body') as HTMLElement;
  const statusRegion = () => el.querySelector('.cae-data-grid__empty') as HTMLElement;

  it('loading defaults off: no aria-busy on the row area (client path unchanged)', () => {
    setup();
    expect(viewport().hasAttribute('aria-busy')).toBe(false);
    expect(statusRegion().textContent!.trim()).toBe(''); // rows present -> collapsed
  });

  it('loading: sets aria-busy on the row area and shows the loading message instead of the empty state', () => {
    // No rows AND loading — this is the initial-fetch case that must read as *loading*, not "No data."
    setup({ data: [], loading: true });
    expect(viewport().getAttribute('aria-busy')).toBe('true');
    expect(statusRegion().textContent!.trim()).toContain('Loading');
  });

  it('loading: renders a custom loadingMessage', () => {
    setup({ data: [], loading: true, loadingMessage: 'Fetching orders' });
    expect(statusRegion().textContent!.trim()).toBe('Fetching orders');
  });

  it('loading clears: aria-busy drops and the empty state announces once the fetch settles', () => {
    setup({ data: [], loading: true });
    expect(statusRegion().textContent!.trim()).toContain('Loading');
    ref.setInput('loading', false);
    flush();
    expect(viewport().hasAttribute('aria-busy')).toBe(false);
    expect(statusRegion().textContent!.trim()).toBe('No data.'); // now genuinely empty
  });

  it('loading with rows present (a paging fetch): aria-busy holds the stale rows, status shows loading', () => {
    setup({ loading: true }); // PEOPLE still in the DOM while the next page is fetched
    expect(viewport().getAttribute('aria-busy')).toBe('true');
    expect(statusRegion().textContent!.trim()).toContain('Loading');
  });

  // ---- Pager focus preservation (#189) ----
  // Clicking Prev/Next to the first/last page self-disables the pressed button; without this, focus
  // falls to <body>. Focus should move to the still-enabled sibling so a keyboard user keeps their place.

  it('advancing to the last page moves focus off the disabling Next to the enabled Prev', () => {
    setup({ paginated: true, pageSize: 2 }); // 3 rows -> pages 0, 1
    document.body.appendChild(el);
    const prev = pageBtn('Previous page')!;
    const next = pageBtn('Next page')!;
    next.focus();
    expect(document.activeElement).toBe(next);
    next.click(); // -> last page: Next disables
    flush();
    expect(next.disabled).toBe(true);
    expect(document.activeElement).toBe(prev); // not dropped to <body>
  });

  it('returning to the first page moves focus off the disabling Prev to the enabled Next', () => {
    setup({ paginated: true, pageSize: 2 });
    document.body.appendChild(el);
    const prev = pageBtn('Previous page')!;
    const next = pageBtn('Next page')!;
    next.focus();
    next.click(); // to the last page: focus handed to Prev by the component (keyboard path)
    flush();
    expect(document.activeElement).toBe(prev);
    prev.click(); // Prev owns focus -> first page: Prev disables
    flush();
    expect(prev.disabled).toBe(true);
    expect(document.activeElement).toBe(next);
  });

  it('does not steal focus when the pager did not own it (mouse / programmatic click)', () => {
    // Safari/Firefox do not focus a clicked <button>, and a programmatic .click() never does — moving
    // focus then would be an unexpected change (WCAG 3.2.x). The rescue must fire ONLY if the pressed
    // button held focus.
    setup({ paginated: true, pageSize: 2 });
    document.body.appendChild(el);
    const sortBtn = sortButtons()[0]; // a focusable element OUTSIDE the pager
    const next = pageBtn('Next page')!;
    sortBtn.focus();
    expect(document.activeElement).toBe(sortBtn);
    next.click(); // Next never received focus
    flush();
    expect(next.disabled).toBe(true); // reached the last page
    expect(document.activeElement).toBe(sortBtn); // focus NOT yanked to the pager
  });

  // ---- Loading blocks interaction + busy slot (#192) ----
  // While [loading], the grid's own sort headers + pager go aria-disabled (focusable, so focus is
  // retained) and their handlers no-op — closing the overlapping-dataRequest footgun at the source —
  // and an optional [caeDataGridLoading] slot renders a projected spinner over the grid.

  it('loading: sort headers are aria-disabled and a sort click no-ops (no sortChange, no re-sort)', () => {
    const emitted: (CaeSort | null)[] = [];
    setup({ loading: true });
    ref.instance.sortChange.subscribe((s) => emitted.push(s));
    const btns = sortButtons();
    expect(btns.length).toBeGreaterThan(0);
    expect(btns.every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    btns[0].click(); // the Name header
    flush();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('none'); // unchanged
    expect(emitted).toEqual([]); // inert while loading
  });

  it('loading: pager buttons are aria-disabled and Prev/Next no-op (no page change)', () => {
    setup({ paginated: true, pageSize: 2, loading: true });
    const next = pageBtn('Next page')!;
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(pageBtn('Previous page')!.getAttribute('aria-disabled')).toBe('true');
    next.click();
    flush();
    expect(el.querySelector('.cae-data-grid__range')?.textContent).toContain('1-2 of 3'); // did not advance
  });

  it('loading closes the overlapping-request footgun: a Next click during a server load emits no dataRequest', () => {
    setup(
      { data: [PEOPLE[0], PEOPLE[1]], total: 812, paginated: true, pageSize: 2, loading: true },
      [provideServerGrid()],
    );
    const requests: CaeGridDataRequest[] = [];
    ref.instance.dataRequest.subscribe((req) => requests.push(req)); // AFTER the initial page-0 fetch
    const next = pageBtn('Next page')!;
    expect(next.getAttribute('aria-disabled')).toBe('true');
    next.click();
    flush();
    expect(requests).toEqual([]); // the click was inert — no second, racing fetch
  });

  it('not loading: no aria-disabled on sort or pager (interaction unblocked, client path unchanged)', () => {
    setup({ paginated: true, pageSize: 2 });
    expect(sortButtons().some((b) => b.hasAttribute('aria-disabled'))).toBe(false);
    expect(pageBtn('Next page')!.hasAttribute('aria-disabled')).toBe(false);
  });

  it('busy slot: projects [caeDataGridLoading] content (aria-hidden) over the grid only while loading', () => {
    @Component({
      imports: [CaeDataGrid],
      template: `<cae-data-grid [columns]="cols" [data]="rows" [loading]="loading()">
        <div class="my-busy" caeDataGridLoading>Spinner</div>
      </cae-data-grid>`,
    })
    class BusyHost {
      cols = COLUMNS;
      rows: Person[] = PEOPLE;
      loading = signal(false);
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [BusyHost] });
    const f = TestBed.createComponent(BusyHost);
    f.detectChanges();
    f.detectChanges();
    const host = f.nativeElement as HTMLElement;
    // Not loading: the overlay is unrendered, so the projected content is absent from the DOM.
    expect(host.querySelector('.cae-data-grid__busy')).toBeNull();
    expect(host.querySelector('.my-busy')).toBeNull();
    // Loading: the overlay renders and the projected spinner appears inside it, aria-hidden.
    f.componentInstance.loading.set(true);
    f.detectChanges();
    f.detectChanges();
    const busy = host.querySelector('.cae-data-grid__busy') as HTMLElement;
    expect(busy).not.toBeNull();
    expect(busy.getAttribute('aria-hidden')).toBe('true');
    expect(busy.querySelector('.my-busy')?.textContent).toBe('Spinner');
  });
});
