import {
  EnvironmentProviders,
  Signal,
  computed,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
import {
  ColumnDef,
  PaginationState,
  SortingState,
  Table,
  TableState,
  createTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
} from '@tanstack/table-core';
import { CAE_GRID, CaeGridAdapter, CaeGridAdapterFactory } from './grid-adapter';
import { toCsvBlob } from './grid-csv';
import type {
  CaeColumn,
  CaeGridDataRequest,
  CaeGridExportFormat,
  CaeRow,
  CaeSort,
} from './grid-types';

/**
 * `TanStackGridAdapter<T>` — the **headless-engine** implementation of the {@link CaeGridAdapter} port
 * (issue #171, M2 — Adapters), driving `@tanstack/table-core@8.21.3` (MIT, dependency-free, US-origin;
 * D-07 ratified, provenance sign-off `docs/provenance/M2-grid-tanstack-signoff.md`). It is a drop-in
 * swap for the {@link import('./client-grid-adapter').ClientGridAdapter} default: `cae-data-grid` and
 * every consumer see only the neutral port + `Cae*` value types, so switching engines is a provider
 * change and **nothing else** — that swap is the M2 isolation proof (D-03; Book 13 §3.2, Book 12 §3.2).
 *
 * **This is the one and only file in `caelum/grid` allowed to import `@tanstack/*`** — the ESLint
 * adapter fence (`eslint.config.js`, pinned to this exact path) fails any other file that does, and the
 * neutral port `grid-adapter.ts` (hyphen) stays engine-free. No vendor type escapes this module: the
 * public surface is entirely `CaeGridAdapter`/`Cae*`.
 *
 * **The bridge.** table-core is an *imperative, memoized* store (`createTable` → `getRowModel()`), while
 * the port is *signal-first*. So this adapter keeps the grid state in signals and, inside the reactive
 * {@link viewRows} read, pushes that state into the engine via `setOptions` and reads back the freshly
 * computed row model (Book 13 §3.2 — the adapter owns the impedance match). Only the opt-in row models
 * the grid needs are composed — `getCoreRowModel` + `getSortedRowModel` + `getPaginationRowModel` — so
 * unused engine features tree-shake away. It is behaviourally interchangeable with the client default:
 * same stable ids, same page-clamping, same sort-resets-to-page-0 contract, same CSV bytes (shared
 * {@link toCsvBlob}).
 *
 * @typeParam T - the row model (unconstrained — a plain typed interface binds, as in the port).
 */
export class TanStackGridAdapter<T> extends CaeGridAdapter<T> {
  private readonly _data = signal<readonly T[]>([]);
  private readonly _columns = signal<readonly CaeColumn<T>[]>([]);
  private readonly _sort = signal<CaeSort | null>(null);
  private readonly _page = signal(0);
  private readonly _pageSize = signal(0);
  /** A manual view override set by {@link applyServerResult}; `null` = compute through the engine. */
  private readonly _serverRows = signal<readonly CaeRow<T>[] | null>(null);
  private readonly _serverTotal = signal(0);

  /** The headless engine instance. State is pushed in from the signals on each read via {@link sync}. */
  private readonly table: Table<T>;
  /** The engine's full default state (every built-in feature slice) — the base each {@link sync} spreads. */
  private readonly baseState: TableState;

  constructor() {
    super();
    this.table = createTable<T>({
      data: [],
      columns: [],
      // We are the sole state owner: push it via setOptions, never let the engine self-mutate/reset.
      state: {},
      onStateChange: () => {},
      renderFallbackValue: null,
      autoResetPageIndex: false,
      autoResetAll: false,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      // Stable id = source index, so a row keeps its identity across sort/paginate (client parity).
      getRowId: (_row, index) => String(index),
    });
    this.baseState = this.table.initialState;
  }

  /** table-core column defs from the neutral columns; identity stable while columns are unchanged. */
  private readonly columnDefs = computed<ColumnDef<T, unknown>[]>(() =>
    this._columns().map((c) => ({
      id: c.id,
      accessorFn: (row: T) => c.value(row),
      enableSorting: c.sortable === true,
    })),
  );

  /**
   * The port's single-column {@link CaeSort} mapped to table-core's multi-sort state (0 or 1 entry).
   * An unknown `columnId` maps to *no* sort (natural order) — matching the client engine exactly and
   * sparing table-core a dev-mode `getColumn` error for a non-existent column id.
   */
  private readonly sortingState = computed<SortingState>(() => {
    const s = this._sort();
    if (!s || !this._columns().some((c) => c.id === s.columnId)) return [];
    return [{ id: s.columnId, desc: s.dir === 'desc' }];
  });

  /**
   * table-core pagination state. `pageSize 0` (the port's "unpaginated") maps to a single page holding
   * every row (`pageSize` = row count) so one code path — `getRowModel()` — serves both modes and
   * table-core never divides by a zero page size.
   */
  private readonly paginationState = computed<PaginationState>(() => {
    const size = this._pageSize();
    const effective = size > 0 ? size : Math.max(1, this._data().length);
    return { pageIndex: this.page(), pageSize: effective };
  });

  readonly total = computed(() =>
    this._serverRows() !== null ? this._serverTotal() : this._data().length,
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
    this.sync();
    // getRowModel() is the fully-processed (sorted, then paginated) model.
    return this.table.getRowModel().rows.map((r) => ({ id: r.id, data: r.original }));
  });

  readonly sort: Signal<CaeSort | null> = this._sort.asReadonly();

  /** table-core sorts/paginates in-memory, so like the client engine it never asks a server: `null`. */
  readonly dataRequest: Signal<CaeGridDataRequest | null> = signal<CaeGridDataRequest | null>(
    null,
  ).asReadonly();

  setData(data: readonly T[], columns: readonly CaeColumn<T>[]): void {
    this._data.set(data);
    this._columns.set(columns);
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
    // v1 supports CSV only; the signature is future-proofed for xlsx/etc. (a followup).
    void format;
    const override = this._serverRows();
    if (override !== null) return toCsvBlob(this._columns(), override);
    this.sync();
    // The full sorted set (all pages) — getPrePaginationRowModel() is sorted but not sliced.
    const sorted = this.table
      .getPrePaginationRowModel()
      .rows.map((r) => ({ id: r.id, data: r.original }));
    return toCsvBlob(this._columns(), sorted);
  }

  /**
   * Push the current signal state into the engine before reading a row model. The `state` object is
   * new each call, but its slices ({@link sortingState}/{@link paginationState}, and the untouched
   * {@link baseState} defaults) keep stable identity while their inputs are unchanged, so table-core's
   * per-feature memoization still short-circuits — it recomputes a row model only when a slice it
   * depends on actually changed.
   */
  private sync(): void {
    this.table.setOptions((prev) => ({
      ...prev,
      data: this._data() as T[],
      columns: this.columnDefs(),
      state: {
        ...this.baseState,
        sorting: this.sortingState(),
        pagination: this.paginationState(),
      },
    }));
  }
}

/** The TanStack engine factory — provide it via {@link provideTanStackGrid} or the {@link CAE_GRID} token. */
export const tanStackGridAdapterFactory: CaeGridAdapterFactory = <T>() =>
  new TanStackGridAdapter<T>();

/**
 * Swap every `cae-data-grid` in scope onto the **TanStack** engine (issue #171). Provide it at the app
 * (or a route/component) level *instead of* {@link import('./client-grid-adapter').provideCaelumGrid}:
 *
 * ```ts
 * providers: [provideTanStackGrid()]
 * ```
 *
 * It is a **separate provider from `provideCaelumGrid()` on purpose**: routing the engine choice through
 * one function with a runtime flag would statically pull `@tanstack/table-core` into every client-default
 * consumer's bundle (a runtime branch can't be tree-shaken). As a distinct entry, only apps that call
 * this one reference — and therefore ship — the engine; the client default stays dependency-free. For a
 * lazy/deferred subtree, provide the neutral token directly at that element injector instead:
 * `{ provide: CAE_GRID, useValue: tanStackGridAdapterFactory }` (keeps the engine in the lazy chunk).
 */
export function provideTanStackGrid(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CAE_GRID, useValue: tanStackGridAdapterFactory }]);
}
