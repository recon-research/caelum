import { InjectionToken, Signal } from '@angular/core';
import type {
  CaeColumn,
  CaeGridDataRequest,
  CaeGridExportFormat,
  CaeRow,
  CaeSort,
} from './grid-types';

/**
 * `CaeGridAdapter<T>` — the **engine port** behind `cae-data-grid` (issue #170, M2 — Adapters).
 * The component and every consumer talk only to this abstract surface and the vendor-free value
 * types in `grid-types.ts`; the concrete engine (the in-memory {@link import('./client-grid-adapter').ClientGridAdapter}
 * default here in #170, `@tanstack/table-core` behind `grid.adapter.ts` in #171) is chosen by DI
 * and swapped **without touching the component or its specs** — that swap is the M2 isolation proof
 * (D-03; Book 13 §3.2, Book 12 §3.2/§3.4).
 *
 * It is a signal-first port: the component reads {@link viewRows}/{@link sort}/{@link page}/… in its
 * template, so any engine must project its state into signals (a headless engine like table-core
 * exposes an imperative store → the #171 adapter bridges `onStateChange` into a `signal`). It is
 * **stateful and per-grid**: each `cae-data-grid` owns one adapter instance (created from the
 * injected {@link CaeGridAdapterFactory}), holding that grid's data, sort, and page.
 *
 * @typeParam T - the row model (unconstrained — a plain typed interface binds).
 */
export abstract class CaeGridAdapter<T> {
  /** Feed the raw dataset + the column model. Re-called by the component whenever either input changes. */
  abstract setData(data: readonly T[], columns: readonly CaeColumn<T>[]): void;

  /** The rows to render **right now** — sorted, then (when paginated) sliced to the current page. */
  abstract readonly viewRows: Signal<readonly CaeRow<T>[]>;

  /** Total row count across all pages (drives the pager range + `aria-rowcount`). */
  abstract readonly total: Signal<number>;

  /** The active sort, or `null` for the natural order. */
  abstract readonly sort: Signal<CaeSort | null>;
  /** Set (or clear, with `null`) the sort. The component calls this from a header sort control. */
  abstract sortBy(sort: CaeSort | null): void;

  /** Current zero-based page index. */
  abstract readonly page: Signal<number>;
  /** Current page size (`0` = unpaginated: {@link viewRows} is the whole sorted set). */
  abstract readonly pageSize: Signal<number>;
  /** Move to `page` with `pageSize` rows (`pageSize` `0` turns pagination off). */
  abstract setPage(page: number, pageSize: number): void;

  /**
   * The pending **server-side** fetch descriptor, or `null` when the adapter serves rows itself
   * (the client default is always `null`). A server-backed adapter (followup) emits this on every
   * sort/page change; the consumer fetches and pushes the slice back via {@link applyServerResult}.
   */
  abstract readonly dataRequest: Signal<CaeGridDataRequest | null>;

  /**
   * Push a server-fetched slice into the grid: replace {@link viewRows} with exactly `rows` and set
   * {@link total} to the server count, **bypassing** client sort/paginate (the server did it). The
   * neutral half of the lazy-data seam — the client default implements it as a manual view override.
   */
  abstract applyServerResult(rows: readonly T[], total: number): void;

  /** Serialize the **full** (all-pages, sorted) dataset to a downloadable {@link Blob} (CSV in v1). */
  abstract exportRows(format?: CaeGridExportFormat): Blob;
}

/**
 * Creates a fresh {@link CaeGridAdapter} for one `cae-data-grid`. Held by the {@link CAE_GRID} token
 * so the engine is chosen at the app/route level yet each grid still gets its **own** stateful
 * instance. Generic per-call so a single provided factory serves grids of any row type.
 */
export type CaeGridAdapterFactory = <T>() => CaeGridAdapter<T>;

/**
 * DI seam for the grid engine. Provide it with {@link import('./client-grid-adapter').provideCaelumGrid}
 * (client default) or, in #171, a TanStack factory — `cae-data-grid` reads it (optional; it falls back
 * to the built-in client factory when unprovided, so the grid works with zero setup). Swapping the
 * value here is how the whole app changes engines without any component edit.
 */
export const CAE_GRID = new InjectionToken<CaeGridAdapterFactory>('CAE_GRID');
