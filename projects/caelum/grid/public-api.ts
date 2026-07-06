/**
 * Secondary entry point `caelum/grid` (issue #170, M2 — Adapters) — the **neutral, engine-swappable**
 * data-grid contract. Everything here is vendor-free: the `Cae*` value types, the {@link CaeGridAdapter}
 * engine port + its {@link CAE_GRID} DI token, the dependency-free {@link ClientGridAdapter} default,
 * and the {@link CaeDataGrid} component that renders its own DOM. #171 added the `@tanstack/table-core`
 * adapter (`grid.adapter.ts`) behind this exact surface with no consumer change (the isolation proof) —
 * it exports only the neutral `provideTanStackGrid()`/factory, never an engine type. Importable +
 * tree-shakable on its own, and re-exported from the primary `caelum` barrel. (`grid-csv.ts` is an
 * internal shared writer — imported by both adapters, deliberately **not** part of the public surface.)
 */
export * from './grid-types';
export * from './grid-adapter';
export * from './client-grid-adapter';
export * from './data-grid';
export * from './grid.adapter';
