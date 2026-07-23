/**
 * Secondary entry point `caelum/grid` (issue #170, M2 — Adapters) — the **neutral, engine-swappable**
 * data-grid contract. Everything here is vendor-free: the `Cae*` value types, the {@link CaeGridAdapter}
 * engine port + its {@link CAE_GRID} DI token, the dependency-free {@link ClientGridAdapter} default,
 * and the {@link CaeDataGrid} component that renders its own DOM. #171 added the `@tanstack/table-core`
 * adapter (`grid.adapter.ts`) behind this exact surface with no consumer change (the isolation proof) —
 * it exports only the neutral `provideTanStackGrid()`/factory, never an engine type. #176 added the
 * dependency-free {@link ServerGridAdapter} (`provideServerGrid()`) behind the same port — the lazy/
 * remote seam (`dataRequest` out, `[total]`/`applyServerResult` in). Importable + tree-shakable on its
 * own, and re-exported from the primary `caelum` barrel — everything here is engine-free, so the barrel
 * stays clean.
 *
 * The `@tanstack/table-core` adapter that #171 added behind this same surface now lives in its own
 * barrel-exempt entry point `caelum/grid-tanstack` (#652, **D-652**) — the optional peer must not ride
 * the barrel (see that entry point's doc). The two vendor-free helpers that adapter shares with the
 * client/server defaults — {@link toCsvBlob} (byte-identical CSV) and {@link compareValues} (one
 * collation rule across engines) — are therefore exported here as the cross-entry-point shared contract
 * rather than kept file-internal; they carry no engine dependency of their own.
 */
export * from './grid-types';
export * from './grid-adapter';
export * from './client-grid-adapter';
export * from './server-grid-adapter';
export * from './data-grid';
export * from './grid-csv';
export * from './grid-sort';
