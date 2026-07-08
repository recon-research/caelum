/**
 * Secondary entry point `caelum/table` (issue #141, Book 09 §3.5) — importable and
 * tree-shakable on its own, mirroring Angular Material's per-component entry points
 * ("pay only for what you import", Book 18 §3.3). Everything here is also re-exported from
 * the primary `caelum` barrel, which stays intact (this split is additive).
 */
export * from './table';
export * from './cell-def';
export * from './row-detail-def';
