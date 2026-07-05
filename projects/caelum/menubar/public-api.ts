/**
 * Secondary entry point `caelum/menubar` (issue #153, Book 09 §3.4) — importable and
 * tree-shakable on its own, mirroring Angular Material's per-component entry points
 * ("pay only for what you import", Book 18 §3.3). At runtime it depends on `caelum/menu` (each
 * top-level group's dropdown) and Material's `MatToolbar` / `matButton`; the roving keyboard is
 * CDK a11y's `FocusKeyManager`. Everything here is also re-exported from the primary `caelum`
 * barrel, which stays intact (this split is additive).
 *
 * `CaeMenuItem` — the type a consumer needs to build each group's `items` and to type
 * `(itemSelect)` — is re-exported here so `caelum/menubar` is self-typing (no second import;
 * identical re-exports dedupe, so the barrel `export *` does not collide — verified in #148).
 */
export * from './menubar';
export type { CaeMenuItem } from 'caelum/menu';
