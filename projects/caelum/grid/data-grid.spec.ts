import { ComponentRef } from '@angular/core';
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
});
