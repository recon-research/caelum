/**
 * Secondary entry point `caelum/dialog` (issue #100, D-15, Book 09 §3.2/§3.3) — the second SERVICE
 * passthrough in Caelum (after `caelum/toast`): an injectable `CaeDialog` over Material's `MatDialog`
 * (`reference/COMPARISON.md` row 103: `p-dialog` / DynamicDialog → `cae-dialog`), plus the content
 * directives (`caeDialogTitle` / `caeDialogContent` / `caeDialogActions` / `caeDialogClose`) and the
 * `CAE_DIALOG_DATA` / `injectCaeDialogRef` seams that let a consumer author a dialog body without any
 * `@angular/material` import. Tree-shakable on its own, and re-exported from the primary `caelum`
 * barrel (#28). The `role=alertdialog` `CaeConfirmService` wrapper (row 104) builds ON this — #101.
 */
export * from './dialog';
