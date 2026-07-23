/**
 * Secondary entry point `caelum/datepicker` (issue #666) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18
 * §3.3). It composes Material's datepicker family behind one `ControlValueAccessor` (Book 09 §3.5 —
 * a value-bearing overlay; the CVA is the contract, Book 07 §3.1) and imports only first-party code
 * (`@angular/material`, `caelum/form-field`) — no optional peer — so per D-652 it **rides the primary
 * `caelum` barrel** and is re-exported there (this split is additive).
 */
export * from './datepicker';
// Re-exported so a consumer importing only `caelum/datepicker` can type the inherited
// `appearance` / `errorMessages` inputs without reaching back to the barrel.
export type { CaeErrorMessages, CaeFormFieldAppearance } from 'caelum/shared';
