import { CAE_GRID } from './grid-adapter';
import {
  ServerGridAdapter,
  provideServerGrid,
  serverGridAdapterFactory,
} from './server-grid-adapter';
import { CaeColumn } from './grid-types';

interface Row {
  name: string;
  age: number;
}

const COLUMNS: CaeColumn<Row>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name, sortable: true },
  { id: 'age', header: 'Age', value: (r) => r.age, sortable: true, align: 'end' },
];

/** A single server "page" — the slice the server would return for the current request. */
const PAGE: readonly Row[] = [
  { name: 'Bob', age: 30 },
  { name: 'Ann', age: 20 },
];

describe('ServerGridAdapter', () => {
  let adapter: ServerGridAdapter<Row>;

  beforeEach(() => {
    adapter = new ServerGridAdapter<Row>();
    // The component feeds only columns (an empty dataset) in server mode; rows arrive via applyServerResult.
    adapter.setData([], COLUMNS);
  });

  it('emits a non-null dataRequest from the start (the server-engine marker)', () => {
    expect(adapter.dataRequest()).toEqual({ sort: null, page: 0, pageSize: 0 });
  });

  it('renders exactly the server-pushed slice, unsorted + unsliced client-side', () => {
    adapter.applyServerResult(PAGE, 812);
    // The order is the server's order — NOT re-sorted client-side even though no sort is set.
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Bob', 'Ann']);
    // Total is the SERVER count (all pages), not the slice length.
    expect(adapter.total()).toBe(812);
  });

  it('assigns page-global ids so they stay unique across pages (not page-local 0..n)', () => {
    adapter.setPage(0, 25);
    adapter.applyServerResult(PAGE, 812);
    expect(adapter.viewRows().map((r) => r.id)).toEqual([0, 1]); // page 0: offset 0
    adapter.setPage(3, 25);
    adapter.applyServerResult(PAGE, 812);
    expect(adapter.viewRows().map((r) => r.id)).toEqual([75, 76]); // page 3: offset 3*25
  });

  it('does not client-sort — sortBy only records the sort + emits a new request', () => {
    adapter.applyServerResult(PAGE, 812); // Bob(30), Ann(20) — server order
    adapter.sortBy({ columnId: 'age', dir: 'asc' });
    // The view is UNCHANGED (still the last server slice) until the consumer pushes a new one.
    expect(adapter.viewRows().map((r) => r.data.name)).toEqual(['Bob', 'Ann']);
    expect(adapter.sort()).toEqual({ columnId: 'age', dir: 'asc' });
    // ...but the request now carries the new sort for the consumer to fetch.
    expect(adapter.dataRequest().sort).toEqual({ columnId: 'age', dir: 'asc' });
  });

  it('emits a fresh dataRequest object on every sort + page change', () => {
    const initial = adapter.dataRequest();
    adapter.setPage(2, 25);
    const paged = adapter.dataRequest();
    expect(paged).toEqual({ sort: null, page: 2, pageSize: 25 });
    expect(paged).not.toBe(initial); // new reference so the component's forward effect re-emits

    adapter.sortBy({ columnId: 'name', dir: 'desc' });
    expect(adapter.dataRequest()).toEqual({
      sort: { columnId: 'name', dir: 'desc' },
      page: 0, // sort reset the page (port contract)
      pageSize: 25,
    });
  });

  it('returns to the first page on a sort change (port contract)', () => {
    adapter.setPage(3, 25);
    adapter.sortBy({ columnId: 'name', dir: 'asc' });
    expect(adapter.dataRequest().page).toBe(0);
  });

  it('does not re-trigger a request while the current page stays in range (no fetch loop)', () => {
    adapter.setPage(1, 25);
    const before = adapter.dataRequest();
    // Pushing an IN-RANGE result must not change the request descriptor — else the component re-fetches.
    // (1 of 400/25=16 pages is in range.) The shrink exception is the next test.
    adapter.applyServerResult(PAGE, 400);
    adapter.applyServerResult(PAGE, 400);
    expect(adapter.dataRequest()).toBe(before); // same computed value, not recomputed
  });

  it('re-clamps the raw page and re-emits a request when a shrunk total strands it (#190)', () => {
    adapter.setPage(9, 25);
    const stale = adapter.dataRequest();
    expect(stale.page).toBe(9); // the request that was in flight when the set shrank
    adapter.applyServerResult(PAGE, 60); // total shrinks to 60/25 = 3 pages (0,1,2) -> last page is 2
    // The display clamps AND the raw page is re-clamped, so a fresh request goes out for the last page
    // (page 9 no longer exists) — the recovery that stops a stranded, un-refetched slice.
    expect(adapter.page()).toBe(2);
    expect(adapter.dataRequest().page).toBe(2);
    expect(adapter.dataRequest()).not.toBe(stale); // a new descriptor -> the component re-fetches
  });

  it('recovery converges: the corrected in-range page applies without a further re-emit (#190)', () => {
    adapter.setPage(9, 25);
    adapter.applyServerResult(PAGE, 60); // strands page 9 -> re-clamps to page 2, re-emits
    const corrected = adapter.dataRequest();
    expect(corrected.page).toBe(2);
    // The consumer fetches page 2 (now in range) and pushes it back: no further re-clamp, no re-emit.
    adapter.applyServerResult(PAGE, 60);
    expect(adapter.dataRequest()).toBe(corrected);
  });

  it('a total that shrinks to zero rows re-clamps to page 0 and re-fetches (#190)', () => {
    adapter.setPage(9, 25);
    adapter.applyServerResult([], 0); // every row deleted server-side
    expect(adapter.page()).toBe(0);
    expect(adapter.dataRequest().page).toBe(0);
    expect(adapter.total()).toBe(0);
  });

  it('exports the current server page as RFC-4180 CSV', async () => {
    adapter.applyServerResult(
      [
        { name: 'Ann, A.', age: 20 },
        { name: 'Bob "B"', age: 30 },
      ],
      999,
    );
    const blob = adapter.exportRows('csv');
    expect(blob.type).toContain('text/csv');
    const text = await blob.text();
    expect(text).toBe('Name,Age\r\n"Ann, A.",20\r\n"Bob ""B""",30');
  });

  it('setData with rows seeds a self-consistent view (standalone use)', () => {
    const standalone = new ServerGridAdapter<Row>();
    standalone.setData(PAGE, COLUMNS);
    expect(standalone.viewRows().map((r) => r.data.name)).toEqual(['Bob', 'Ann']);
    expect(standalone.total()).toBe(2); // fallback total until a server result refines it
  });

  it('the factory + provider build a working server adapter under CAE_GRID', () => {
    const instance = serverGridAdapterFactory<Row>();
    expect(instance).toBeInstanceOf(ServerGridAdapter);
    expect(instance.dataRequest()).not.toBeNull(); // a server engine always has a pending request
    expect(typeof provideServerGrid).toBe('function');
    expect(CAE_GRID.toString()).toContain('CAE_GRID');
  });
});
