/**
 * Secondary entry point `caelum/multi-select` (issue #135, Book 09 §3.5) — importable and
 * tree-shakable on its own, mirroring Angular Material's per-component entry points
 * ("pay only for what you import", Book 18 §3.3). Everything here is also re-exported from
 * the primary `caelum` barrel, which stays intact (this split is additive).
 */
export * from './multi-select';
// Re-exported so a consumer importing only `caelum/multi-select` can type its `appearance` and
// `errorMessages` inputs without reaching back to the barrel (this control exposes both).
export type { CaeErrorMessages, CaeFormFieldAppearance } from 'caelum/shared';
