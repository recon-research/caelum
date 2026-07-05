/**
 * Secondary entry point `caelum/shared` (issue #28, Book 19 §3.2) — the home for
 * cross-component types (the shared form-field appearance + the error-message map),
 * mirroring Angular Material's `@angular/material/core`. It carries no runtime code
 * (type-only), so it adds nothing to a consumer's bundle; it exists so a form control and
 * a consumer can name `CaeFormFieldAppearance`/`CaeErrorMessages` without either owning
 * the file twice (ng-packagr requires each source file to belong to exactly one entry
 * point). Also re-exported from the primary `caelum` barrel.
 */
export * from './appearance';
export * from './error-messages';
export * from './menu-panel-host';
export * from './sort-direction';
export * from './tooltip-position';
