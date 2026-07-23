/**
 * Secondary entry point `caelum/grid-tanstack` (issue #652, **D-652**) — the `@tanstack/table-core`
 * implementation of the neutral {@link CaeGridAdapter} port, split out of `caelum/grid` so its
 * OPTIONAL peer stays optional.
 *
 * **Why its own entry point.** `@tanstack/table-core` is an optional `peerDependency`; the intent is
 * that a consumer using the dependency-free client default (or the server adapter) — or no grid at
 * all — installs it never and ships zero engine bytes. But a bundler resolves the whole static import
 * graph at scan time, *before* tree-shaking, so any entry point that both imports the peer **and** is
 * re-exported by the primary `caelum` barrel forces every `import … from 'caelum'` to resolve it —
 * making "optional" a fiction (measured in #652: with the peer absent, even `import { CaeButton } from
 * 'caelum'` failed to build). The fix is structural, mirroring `caelum/breadcrumb-router`'s
 * `@angular/router` split (D-595): the `@tanstack` adapter lives here, this entry point is deliberately
 * **barrel-exempt** (never re-exported by `caelum`'s `public-api.ts`), and consumers opt in by importing
 * `caelum/grid-tanstack` directly. `caelum/grid` itself is now engine-free and stays in the barrel.
 *
 * The guard is derived, not listed: `scripts/check-lib-exports.mjs` scans each emitted FESM and fails
 * if any entry point that imports a declared-optional peer is barrel-re-exported (#652 retired the old
 * hand-maintained `BARREL_EXEMPT` list).
 *
 * Everything here is the neutral surface: `provideTanStackGrid()` / `tanStackGridAdapterFactory` and the
 * `TanStackGridAdapter` class — no `@tanstack/*` type crosses the boundary. The shared vendor-free
 * collation ({@link compareValues}) and CSV ({@link toCsvBlob}) contracts it honours are imported from
 * `caelum/grid`, so this engine and the client default stay byte-identical in sort order and export.
 */
export * from './grid.adapter';
