/**
 * Secondary entry point `caelum/tree-table` (issue #262) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * Self-contained: it carries its own tree-aware cell directive (`caeTreeCellDef`) rather than depending
 * on `caelum/table`, so importing a hierarchical table never pulls the flat one. Everything here is also
 * re-exported from the primary `caelum` barrel, which stays intact (this split is additive).
 */
export * from './tree-table';
export * from './tree-cell-def';
