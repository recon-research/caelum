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
import { compareValues } from './grid-sort';

/**
 * The **default, dependency-free** grid engine (issue #170) — plain-TypeScript client-side sort +
 * pagination + CSV export over an in-memory dataset, projected into signals. It imports **no** grid
 * library: it is both the zero-config default a consumer gets when nothing is provided, and the
 * reference implementation the TanStack adapter (#171) must stay behaviourally interchangeable with.
 * Book 10 §2.2/§3.5 (the reach-for ladder): most grids do not need a headless engine — the client
 * default carries them, and the engine is opt-in for scale.
 *
 * @typeParam T - the row model (unconstrained).
 */
export class ClientGridAdapter<T> extends CaeGridAdapter<T> {
  private readonly _columns = signal<readonly CaeColumn<T>[]>([]);
  /** Source rows wrapped in original order; `id` is the source index, stable across sort/paginate. */
  private readonly _rows = signal<readonly CaeRow<T>[]>([]);
  private readonly _sort = signal<CaeSort | null>(null);
  private readonly _page = signal(0);
  private readonly _pageSize = signal(0);
  /** A manual view override set by {@link applyServerResult}; `null` = compute client-side. */
  private readonly _serverRows = signal<readonly CaeRow<T>[] | null>(null);
  private readonly _serverTotal = signal(0);

  /** Full dataset in sort order (pagination not yet applied) — shared by {@link viewRows} + export. */
  private readonly sorted = computed<readonly CaeRow<T>[]>(() => {
    const sort = this._sort();
    const rows = this._rows();
    if (!sort) return rows;
    const col = this._columns().find((c) => c.id === sort.columnId);
    if (!col) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    // Copy before sorting — never mutate the source array (it mirrors the consumer input).
    return [...rows].sort((a, b) => compareValues(col.value(a.data), col.value(b.data)) * factor);
  });

  readonly total = computed(() =>
    this._serverRows() !== null ? this._serverTotal() : this._rows().length,
  );

  readonly pageSize: Signal<number> = this._pageSize.asReadonly();

  /** The current page, clamped to the valid range so a stale/oversized index shows the last page. */
  readonly page = computed(() => {
    const size = this._pageSize();
    if (size <= 0) return 0;
    const lastPage = Math.max(0, Math.ceil(this.total() / size) - 1);
    return Math.min(Math.max(this._page(), 0), lastPage);
  });

  readonly viewRows = computed<readonly CaeRow<T>[]>(() => {
    const override = this._serverRows();
    if (override !== null) return override;
    const sorted = this.sorted();
    const size = this._pageSize();
    if (size <= 0) return sorted;
    const start = this.page() * size;
    return sorted.slice(start, start + size);
  });

  readonly sort: Signal<CaeSort | null> = this._sort.asReadonly();

  /** The client engine serves its own rows, so it never asks a server: always `null`. */
  readonly dataRequest: Signal<CaeGridDataRequest | null> = signal<CaeGridDataRequest | null>(
    null,
  ).asReadonly();

  setData(data: readonly T[], columns: readonly CaeColumn<T>[]): void {
    this._columns.set(columns);
    this._rows.set(data.map((datum, index) => ({ id: index, data: datum })));
    // Fresh client data supersedes any prior server override.
    this._serverRows.set(null);
  }

  sortBy(sort: CaeSort | null): void {
    this._sort.set(sort);
    // A new sort returns to the first page (the row under the old page offset is meaningless now).
    this._page.set(0);
  }

  setPage(page: number, pageSize: number): void {
    this._page.set(page);
    this._pageSize.set(pageSize);
  }

  applyServerResult(rows: readonly T[], total: number): void {
    this._serverRows.set(rows.map((datum, index) => ({ id: index, data: datum })));
    this._serverTotal.set(total);
  }

  exportRows(format: CaeGridExportFormat = 'csv'): Blob {
    // v1 supports CSV only; the signature is future-proofed for xlsx/etc. (a followup). Export
    // the full sorted set (or the server override) through the shared writer both engines use.
    void format;
    return toCsvBlob(this._columns(), this._serverRows() ?? this.sorted());
  }
}

/** The built-in factory `cae-data-grid` falls back to when {@link CAE_GRID} is unprovided. */
export const defaultGridAdapterFactory: CaeGridAdapterFactory = <T>() => new ClientGridAdapter<T>();

/**
 * Provide the **client-side** grid engine explicitly (issue #170). `cae-data-grid` already falls back
 * to it when {@link CAE_GRID} is unprovided, so this is only needed to be explicit — or as the shape
 * a swap follows: #171 ships a TanStack factory that replaces the value here, changing every grid in
 * the app to the headless engine with no component edit (the M2 isolation proof).
 */
export function provideCaelumGrid(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CAE_GRID, useValue: defaultGridAdapterFactory }]);
}
