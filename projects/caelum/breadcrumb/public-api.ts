/**
 * Secondary entry point `caelum/breadcrumb` (issue #332) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * The navigation-trail component (`p-breadcrumb` parity, COMPARISON row 119): a semantic
 * `<nav>` + `<ol>` with `aria-current="page"` on the current page and CSS-drawn token separators —
 * no overlay, just honest navigation markup (Book 09 §3.4). Everything here is also re-exported from
 * the primary `caelum` barrel (the split is additive).
 */
export * from './breadcrumb';
