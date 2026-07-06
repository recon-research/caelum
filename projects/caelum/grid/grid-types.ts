/**
 * The **vendor-free** value vocabulary of the Caelum data grid (`caelum/grid`, issue #170,
 * M2 — Adapters). Every type here is a plain app-owned shape — no import from any grid engine
 * (`@tanstack/*` or otherwise). This is the whole point of the M2 neutral-interface step
 * (D-03 adapter isolation; Book 13 §3.1, Book 12 §3.1): consumer code and the `cae-data-grid`
 * component name only these types, so the engine behind {@link CaeGridAdapter} can be swapped
 * (the client default here in #170, TanStack in #171) with **zero** change to anything that
 * imports from this file. If a vendor type ever reached this surface the ESLint adapter fence
 * (`grid.adapter.ts`, wired in #171) would still catch it in the adapter, but the discipline
 * starts here: keep this file free of engine types.
 */

/** Sort direction for a grid column. Unlike `CaeSortDirection` (the form/table shared type) there
 *  is no empty member — "no sort" is the *absence* of a {@link CaeSort}, not a third direction. */
export type CaeSortDir = 'asc' | 'desc';

/**
 * A column definition for {@link CaeGridAdapter}/`cae-data-grid`. Deliberately a superset of
 * `CaeTableColumn` (#141): instead of a flat `key`, a grid column carries a **value accessor**
 * `value(row)` so a computed or nested field works without a index-signature constraint on `T`
 * (the same reason `cae-table` left `T` unconstrained). `id` is the stable identity (the sort id
 * and the `@for`/`aria-colindex` anchor); it need not be a property name.
 *
 * @typeParam T - the row model. Unconstrained, so a plain typed interface binds.
 */
export interface CaeColumn<T> {
  /** Stable column identity — the sort id and the render track key. Need not be a field name. */
  id: string;
  /** Visible header-cell label, and the column's accessible name. */
  header: string;
  /** Reads this column's display value off a row. Pure + cheap — it runs per rendered cell. */
  value: (row: T) => string | number;
  /** When `true`, the header becomes a sort control (keyboard-operable, reflects `aria-sort`). */
  sortable?: boolean;
  /** Cell + header text alignment. `end` is the convention for numeric columns. Default `start`. */
  align?: 'start' | 'end';
  /** Optional fixed track width (any CSS length, e.g. `"12rem"`). Columns are equal-flex if unset. */
  width?: string;
}

/** An active sort: a column {@link CaeColumn.id} plus a direction. `null` everywhere means unsorted. */
export interface CaeSort {
  /** The {@link CaeColumn.id} being sorted. */
  columnId: string;
  /** The sort direction. */
  dir: CaeSortDir;
}

/**
 * A **view row** — the adapter wraps each datum so it can carry grid-owned metadata (a stable
 * `id` for track/recycle, a future `level` for tree-grid) without polluting the consumer model
 * `T`. The component renders `data` through the column accessors; it never mutates the wrapper.
 *
 * @typeParam T - the row model.
 */
export interface CaeRow<T> {
  /** Stable identity across sort/paginate — anchors `@for`/`cdkVirtualFor` recycling. */
  id: string | number;
  /** The underlying consumer datum. */
  data: T;
  /** Nesting depth for a future tree-grid (0 = top level). Unused by the flat v1 grid. */
  level?: number;
}

/** Supported {@link CaeGridAdapter.exportRows} formats. CSV in v1; more (xlsx…) are followups. */
export type CaeGridExportFormat = 'csv';

/**
 * What a **server-side** data source is being asked to return — the neutral seam for lazy/remote
 * grids (Book 13 §3.4, the p-table `onLazyLoad` analogue). The client + TanStack engines compute
 * everything in-memory and never emit one of these; the server engine
 * ({@link import('./server-grid-adapter').ServerGridAdapter}, #176) emits it on every sort/page change
 * so the consumer can fetch the matching slice and push it back via
 * {@link CaeGridAdapter.applyServerResult}. Typed in #170; wired in #176.
 */
export interface CaeGridDataRequest {
  /** The requested sort, or `null` for the natural order. */
  sort: CaeSort | null;
  /** Zero-based page index. */
  page: number;
  /** Rows per page. `0` means unpaginated — the server should return the whole set. */
  pageSize: number;
}
