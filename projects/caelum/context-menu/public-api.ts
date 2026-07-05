/**
 * Secondary entry point `caelum/context-menu` (issue #157, Book 19 §3.2) — importable and
 * tree-shakable on its own. Re-exports the shared `CaeMenuItem` type (borrowed from
 * `caelum/menu`) so consumers can type their model from this entry point alone; the identical
 * re-export dedupes in the primary `caelum` barrel (same pattern as `caelum/menubar`).
 */
export * from './context-menu';
export type { CaeMenuItem } from 'caelum/menu';
