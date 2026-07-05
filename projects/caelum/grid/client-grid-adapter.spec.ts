import { CAE_GRID } from './grid-adapter';
import {
  ClientGridAdapter,
  defaultGridAdapterFactory,
  provideCaelumGrid,
} from './client-grid-adapter';
import { CaeColumn } from './grid-types';

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

describe('ClientGridAdapter', () => {
  let adapter: ClientGridAdapter<Row>;

  beforeEach(() => {
    adapter = new ClientGridAdapter<Row>();
    adapter.setData(DATA, COLUMNS);
  });

  it('exposes all rows unsorted + unpaginated by default', () => {
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Bob', 'Ann', 'Cy']);
    expect(adapter.total()).toBe(3);
    expect(adapter.sort()).toBeNull();
    expect(adapter.pageSize()).toBe(0);
    expect(adapter.dataRequest()).toBeNull();
  });

  it('assigns stable source-index ids for tracking', () => {
    expect(adapter.viewRows().map((r) => r.id)).toEqual([0, 1, 2]);
  });

  it('sorts ascending, carrying the stable ids with the moved rows', () => {
    adapter.sortBy({ columnId: 'age', dir: 'asc' });
    expect(adapter.viewRows().map((r) => r.data.age)).toEqual([20, 25, 30]);
    expect(adapter.viewRows().map((r) => r.id)).toEqual([1, 2, 0]);
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

  it('applyServerResult overrides the view + total, bypassing client sort/paginate', () => {
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

  it('exports the full sorted set as RFC-4180 CSV, escaping quotes + commas', async () => {
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
    expect(text).toBe('Name,Age\r\n"Bob ""B""",30\r\n"Ann, A.",20');
  });

  it('always reports a null dataRequest (the client engine serves its own rows)', () => {
    adapter.sortBy({ columnId: 'age', dir: 'asc' });
    adapter.setPage(1, 2);
    expect(adapter.dataRequest()).toBeNull();
  });

  it('the default factory + provider build a working client adapter under CAE_GRID', () => {
    const instance = defaultGridAdapterFactory<Row>();
    instance.setData(DATA, COLUMNS);
    expect(instance).toBeInstanceOf(ClientGridAdapter);
    expect(instance.viewRows().length).toBe(3);
    expect(typeof provideCaelumGrid).toBe('function');
    expect(CAE_GRID.toString()).toContain('CAE_GRID');
  });
});
