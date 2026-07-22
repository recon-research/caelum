/**
 * Secondary entry point `caelum/breadcrumb-router` (issue #333, **D-595**) — the router-aware half
 * of `cae-breadcrumb`, kept in its own entry point so the base `caelum/breadcrumb` stays
 * router-free and a consumer who never routes never installs `@angular/router` (declared an
 * **optional** peerDependency). This is the first application of the D-595 pattern; `cae-tab-menu`
 * (#165) and `cae-menu`/`cae-split-button` (#150) follow the same shape.
 *
 * Not re-exported from the primary `caelum` barrel *by design*: the barrel is imported by
 * consumers who may not have `@angular/router` installed, and a re-export would make the optional
 * peer effectively required. Import this path directly.
 */
export * from './breadcrumb-router';
