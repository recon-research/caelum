/**
 * Secondary entry point `caelum/confirm` (issue #101, D-15 — the confirm half of the dialog slice;
 * `reference/COMPARISON.md` row 104, Book 09 §3.3). An injectable `CaeConfirmService` with
 * `confirm(): Promise<boolean>` built ON `caelum/dialog` (role=alertdialog + safe-default reject
 * focus + Escape/backdrop = reject) — the "build once, reuse" confirm parity wrapper. A SIBLING entry
 * point, deliberately NOT folded into `caelum/dialog`, so a plain-dialog consumer doesn't pull in the
 * confirm component + `cae-button`. Tree-shakable on its own, and re-exported from the primary
 * `caelum` barrel (#28). The `CaeConfirmDialog` body is internal — reach it only through `confirm()`.
 */
export { CaeConfirmService } from './confirm';
export type { CaeConfirmOptions, CaeConfirmDefaultFocus } from './confirm';
