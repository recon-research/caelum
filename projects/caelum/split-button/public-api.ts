/**
 * Secondary entry point `caelum/split-button` (issue #148, Book 09 §3.4) — importable and
 * tree-shakable on its own, mirroring Angular Material's per-component entry points
 * ("pay only for what you import", Book 18 §3.3). At runtime it depends on `caelum/menu` (the
 * composed dropdown) and Material's `matButton`; `caelum/button` is referenced only for the
 * `CaeButtonVariant` type (a type-only import, erased). Everything here is also re-exported from
 * the primary `caelum` barrel, which stays intact (this split is additive).
 *
 * The `CaeMenuItem` and `CaeButtonVariant` types a consumer needs to type `model`/`variant`/
 * `itemSelect` are re-exported here so `caelum/split-button` is self-typing (no second import).
 */
export * from './split-button';
export type { CaeMenuItem } from 'caelum/menu';
export type { CaeButtonVariant } from 'caelum/button';
