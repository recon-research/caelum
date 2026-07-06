import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeDataGrid } from './data-grid';
import { CAE_GRID } from './grid-adapter';
import {
  TanStackGridAdapter,
  provideTanStackGrid,
  tanStackGridAdapterFactory,
} from './grid.adapter';
import { CaeColumn, CaeSort } from './grid-types';

interface Row {
  name: string;
  age: number;
}

const COLUMNS: CaeColumn<Row>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name, sortable: true },
  { id: 'age', header: 'Age', value: (r) => r.age, sortable: true, align: 'end' },
];

const DATA: readonly Row[] = [
  { name: 'Bob', age: 30 },
  { name: 'Ann', age: 20 },
  { name: 'Cy', age: 25 },
];

// The TanStack adapter must be BEHAVIOURALLY INTERCHANGEABLE with ClientGridAdapter: these assertions
// deliberately mirror client-grid-adapter.spec.ts (same data, same expected orders), because the M2
// isolation proof is "swap the engine, observe nothing different". Only stable-id VALUES differ by
// engine (TanStack ids are the source index as a string); everything the port promises is identical.
describe('TanStackGridAdapter', () => {
  let adapter: TanStackGridAdapter<Row>;

  beforeEach(() => {
    adapter = new TanStackGridAdapter<Row>();
    adapter.setData(DATA, COLUMNS);
  });

  it('exposes all rows unsorted + unpaginated by default', () => {
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Bob', 'Ann', 'Cy']);
    expect(adapter.total()).toBe(3);
    expect(adapter.sort()).toBeNull();
    expect(adapter.pageSize()).toBe(0);
    expect(adapter.dataRequest()).toBeNull();
  });

  it('assigns stable source-index ids for tracking (carried with the row through sort)', () => {
    expect(adapter.viewRows().map((r) => r.id)).toEqual(['0', '1', '2']);
    adapter.sortBy({ columnId: 'age', dir: 'asc' }); // Ann(1), Cy(2), Bob(0)
    expect(adapter.viewRows().map((r) => r.id)).toEqual(['1', '2', '0']);
  });

  it('sorts ascending', () => {
    adapter.sortBy({ columnId: 'age', dir: 'asc' });
    expect(adapter.viewRows().map((r) => r.data.age)).toEqual([20, 25, 30]);
    expect(adapter.sort()).toEqual({ columnId: 'age', dir: 'asc' });
  });

  it('sorts descending', () => {
    adapter.sortBy({ columnId: 'name', dir: 'desc' });
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Cy', 'Bob', 'Ann']);
  });

  it('compares numbers numerically, not as strings', () => {
    adapter.setData(
      [
        { name: 'x', age: 100 },
        { name: 'y', age: 30 },
      ],
      COLUMNS,
    );
    adapter.sortBy({ columnId: 'age', dir: 'asc' });
    // 30 < 100 numerically (a string sort would put "100" before "30")
    expect(adapter.viewRows().map((r) => r.data.age)).toEqual([30, 100]);
  });

  it('leaves the order untouched when sortBy names an unknown column', () => {
    adapter.sortBy({ columnId: 'nope', dir: 'asc' });
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Bob', 'Ann', 'Cy']);
  });

  it('never mutates the source array when sorting', () => {
    const source = [...DATA];
    adapter.setData(source, COLUMNS);
    adapter.sortBy({ columnId: 'age', dir: 'asc' });
    void adapter.viewRows();
    expect(source.map((r) => r.name)).toEqual(['Bob', 'Ann', 'Cy']);
  });

  it('paginates to the page slice while total counts all pages', () => {
    adapter.setPage(0, 2);
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Bob', 'Ann']);
    expect(adapter.total()).toBe(3);
    adapter.setPage(1, 2);
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Cy']);
  });

  it('clamps an out-of-range page to the last page', () => {
    adapter.setPage(9, 2);
    expect(adapter.page()).toBe(1);
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Cy']);
  });

  it('returns to the first page on a sort change', () => {
    adapter.setPage(1, 2);
    adapter.sortBy({ columnId: 'name', dir: 'asc' });
    expect(adapter.page()).toBe(0);
  });

  it('sorts the whole set before slicing the page', () => {
    adapter.setPage(0, 2);
    adapter.sortBy({ columnId: 'age', dir: 'asc' }); // Ann20, Cy25, Bob30
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Ann', 'Cy']);
  });

  it('applyServerResult overrides the view + total, bypassing engine sort/paginate', () => {
    adapter.setPage(0, 2);
    adapter.sortBy({ columnId: 'age', dir: 'asc' });
    adapter.applyServerResult([{ name: 'Zoe', age: 99 }], 500);
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Zoe']);
    expect(adapter.total()).toBe(500);
  });

  it('clears a prior server override on the next setData', () => {
    adapter.applyServerResult([{ name: 'Zoe', age: 99 }], 500);
    adapter.setData(DATA, COLUMNS);
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Bob', 'Ann', 'Cy']);
    expect(adapter.total()).toBe(3);
  });

  it('exports the full sorted set as RFC-4180 CSV (byte-identical to the client engine)', async () => {
    adapter.setData(
      [
        { name: 'Ann, A.', age: 20 },
        { name: 'Bob "B"', age: 30 },
      ],
      COLUMNS,
    );
    adapter.sortBy({ columnId: 'age', dir: 'desc' }); // Bob(30) then Ann(20)
    const blob = adapter.exportRows('csv');
    expect(blob.type).toContain('text/csv');
    const text = await blob.text();
    // The SAME expected bytes asserted in client-grid-adapter.spec.ts — both engines share toCsvBlob.
    expect(text).toBe('Name,Age\r\n"Bob ""B""",30\r\n"Ann, A.",20');
  });

  it('exports only the current page-independent full set even while paginated', async () => {
    adapter.setPage(0, 1); // view shows 1 row, export must still hold all 3
    const text = await adapter.exportRows().text();
    expect(text.split('\r\n').length).toBe(4); // header + 3 rows
  });

  it('always reports a null dataRequest (the engine serves its own rows in-memory)', () => {
    adapter.sortBy({ columnId: 'age', dir: 'asc' });
    adapter.setPage(1, 2);
    expect(adapter.dataRequest()).toBeNull();
  });

  it('the TanStack factory + provider build a working engine under CAE_GRID', () => {
    const instance = tanStackGridAdapterFactory<Row>();
    instance.setData(DATA, COLUMNS);
    expect(instance).toBeInstanceOf(TanStackGridAdapter);
    expect(instance.viewRows().length).toBe(3);
    expect(typeof provideTanStackGrid).toBe('function');
    expect(CAE_GRID.toString()).toContain('CAE_GRID');
  });
});

// The isolation proof at the component seam: cae-data-grid is UNCHANGED (see data-grid.spec.ts), yet
// providing the TanStack engine makes it drive that engine end-to-end. Only jsdom-stable surface is
// asserted (header/sort/aria) — cdk-virtual-scroll renders no body rows in jsdom (0 viewport); the
// engine's row output is proven exhaustively above. This is the DI swap the whole M2 step exists for.
describe('CaeDataGrid over the TanStack engine (isolation proof)', () => {
  let fixture: ComponentFixture<CaeDataGrid<Row>>;
  let ref: ComponentRef<CaeDataGrid<Row>>;
  let el: HTMLElement;

  function setup(inputs: Record<string, unknown> = {}): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CaeDataGrid],
      providers: [provideTanStackGrid()],
    });
    fixture = TestBed.createComponent(CaeDataGrid<Row>);
    ref = fixture.componentRef;
    ref.setInput('columns', COLUMNS);
    ref.setInput('data', DATA);
    for (const [k, v] of Object.entries(inputs)) ref.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    fixture.detectChanges();
  }

  const headerByText = (text: string) =>
    Array.from(el.querySelectorAll('[role="columnheader"]')).find((h) =>
      h.textContent!.includes(text),
    )!;

  it('instantiates the TanStack engine via the injected CAE_GRID token', () => {
    setup();
    const adapter = (fixture.componentInstance as unknown as { adapter: unknown }).adapter;
    expect(adapter).toBeInstanceOf(TanStackGridAdapter);
  });

  it('renders the header + aria over the TanStack engine, unchanged component', () => {
    setup({ caption: 'Team' });
    const grid = el.querySelector('[role="table"]') as HTMLElement;
    expect(grid.getAttribute('aria-rowcount')).toBe('4'); // 3 rows + header
    expect(grid.getAttribute('aria-colcount')).toBe('2');
    const headers = Array.from(el.querySelectorAll('[role="columnheader"]')).map((h) =>
      h.textContent!.replace(/[↕↑↓]/g, '').trim(),
    );
    expect(headers).toEqual(['Name', 'Age']);
  });

  it('cycles sort through the TanStack engine + emits sortChange from the unchanged component', () => {
    const emitted: (CaeSort | null)[] = [];
    setup();
    ref.instance.sortChange.subscribe((s) => emitted.push(s));
    const nameBtn = () => headerByText('Name').querySelector('button') as HTMLButtonElement;

    nameBtn().click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('ascending');

    nameBtn().click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(headerByText('Name').getAttribute('aria-sort')).toBe('descending');

    expect(emitted).toEqual([
      { columnId: 'name', dir: 'asc' },
      { columnId: 'name', dir: 'desc' },
    ]);
  });
});
