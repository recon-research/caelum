import {
  EnvironmentProviders,
  Signal,
  computed,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
import { CAE_GRID, CaeGridAdapter, CaeGridAdapterFactory } from './grid-adapter';
import type {
  CaeColumn,
  CaeGridDataRequest,
  CaeGridExportFormat,
  CaeRow,
  CaeSort,
} from './grid-types';
import { toCsvBlob } from './grid-csv';

/**
 * The **server-side / lazy** grid engine (issue #176, M2 — Adapters) — the third adapter behind the
 * *identical* {@link CaeGridAdapter} port, and the one that proves the port's server seam (Book 13
 * §3.4 "the `DataSource` seam meets the adapter"). Unlike {@link import('./client-grid-adapter').ClientGridAdapter},
 * it holds **no full dataset**: a sort or page change becomes a {@link dataRequest} — the `p-table`
 * `onLazyLoad` analogue — and the consumer streams the matching slice back through
 * {@link applyServerResult}. It imports **no** grid library (same as the client default); the whole
 * point of the neutral port is that a remote data layer never touches a vendor type.
 *
 * The flow (Book 13 §3.4; the seam that keeps a 100k-row grid from ever loading 100k rows):
 * 1. On mount and on every sort/page change, {@link dataRequest} recomputes to `{ sort, page, pageSize }`.
 *    `cae-data-grid` forwards it out of its `(dataRequest)` output.
 * 2. The consumer fetches that slice and pushes it back by binding `[data]` (the page) + `[total]`
 *    (the server count); the component routes those through {@link applyServerResult}.
 * 3. {@link viewRows} is exactly what the server returned — no client sort or paginate — and
 *    {@link total} is the server's count (drives the pager range + `aria-rowcount`).
 *
 * Behaviourally it satisfies the same contract as the client engine (page clamping, sort resets to
 * page 0) but defers the actual sort/slice to the server. Export serializes the **current page** via
 * the shared {@link toCsvBlob} writer (a server engine cannot see other pages without a fetch-all —
 * a full-export followup, #177).
 *
 * @typeParam T - the row model (unconstrained).
 */
export class ServerGridAdapter<T> extends CaeGridAdapter<T> {
  private readonly _columns = signal<readonly CaeColumn<T>[]>([]);
  /** Exactly the rows the server returned for the current page — never client-sorted or sliced. */
  private readonly _slice = signal<readonly CaeRow<T>[]>([]);
  /** The server's total across all pages (not the slice length). */
  private readonly _total = signal(0);
  private readonly _sort = signal<CaeSort | null>(null);
  private readonly _page = signal(0);
  private readonly _pageSize = signal(0);

  readonly viewRows: Signal<readonly CaeRow<T>[]> = this._slice.asReadonly();
  readonly total: Signal<number> = this._total.asReadonly();
  readonly sort: Signal<CaeSort | null> = this._sort.asReadonly();
  readonly pageSize: Signal<number> = this._pageSize.asReadonly();

  /** The current page, clamped to the valid range so a stale/oversized index shows the last page. */
  readonly page = computed(() => {
    const size = this._pageSize();
    if (size <= 0) return 0;
    const lastPage = Math.max(0, Math.ceil(this._total() / size) - 1);
    return Math.min(Math.max(this._page(), 0), lastPage);
  });

  /**
   * The always-present fetch descriptor (never `null` — that is what marks this a server engine and
   * makes the component forward it). It reads the **raw** `_page` (not the clamped {@link page}) on
   * purpose: it must depend only on `_sort`/`_page`/`_pageSize` so that {@link applyServerResult}
   * (which touches only `_slice`/`_total`) can never recompute it — otherwise pushing a result would
   * re-emit a request and trigger a redundant second fetch. The component only ever calls
   * {@link setPage} with clamped-derived indices, so `_page` stays in range in practice.
   */
  readonly dataRequest = computed<CaeGridDataRequest>(() => ({
    sort: this._sort(),
    page: this._page(),
    pageSize: this._pageSize(),
  }));

  /**
   * A server engine has no full set to feed — the component passes only the column model here (an
   * empty `data`), which this stores for header/export. The page rows arrive via
   * {@link applyServerResult}. If called with rows directly (standalone use), it seeds the slice so
   * the adapter is self-consistent, but the total is then just the slice length until a server result
   * refines it.
   */
  setData(data: readonly T[], columns: readonly CaeColumn<T>[]): void {
    this._columns.set(columns);
    if (data.length) {
      this._slice.set(data.map((datum, index) => ({ id: index, data: datum })));
      this._total.set(data.length);
    }
  }

  sortBy(sort: CaeSort | null): void {
    this._sort.set(sort);
    // Port contract: a sort change returns to the first page (the offset is meaningless once the
    // order changes). Emitting page 0 in the next request lets the server return the right slice.
    this._page.set(0);
  }

  setPage(page: number, pageSize: number): void {
    this._page.set(page);
    this._pageSize.set(pageSize);
  }

  applyServerResult(rows: readonly T[], total: number): void {
    this._slice.set(rows.map((datum, index) => ({ id: index, data: datum })));
    this._total.set(total);
  }

  exportRows(format: CaeGridExportFormat = 'csv'): Blob {
    // v1 exports the CURRENT page only — a server engine cannot serialize pages it has not fetched
    // (a fetch-all "styled export" is #177). Uses the same RFC-4180 writer both other engines use.
    void format;
    return toCsvBlob(this._columns(), this._slice());
  }
}

/** Factory for {@link CAE_GRID}: a fresh {@link ServerGridAdapter} per `cae-data-grid`. */
export const serverGridAdapterFactory: CaeGridAdapterFactory = <T>() => new ServerGridAdapter<T>();

/**
 * Provide the **server-side / lazy** grid engine (issue #176). Swaps `CAE_GRID` to
 * {@link serverGridAdapterFactory} — every `cae-data-grid` under this scope then emits `(dataRequest)`
 * on sort/page change instead of serving rows itself, with **no** change to the component (the M2
 * isolation proof, now a third engine behind the one port). Provide it at a route/screen that binds
 * `[data]`/`[total]`/`(dataRequest)`; leave the app default as the client engine so grids that hold
 * their own data need no wiring.
 */
export function provideServerGrid(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CAE_GRID, useValue: serverGridAdapterFactory }]);
}
