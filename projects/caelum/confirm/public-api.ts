/**
 * Secondary entry point `caelum/confirm` (issue #101, D-15 — the confirm half of the dialog slice;
 * `reference/COMPARISON.md` rows 104/109, Book 09 §3.3). An injectable `CaeConfirmService` with two
 * presentations of ONE confirm contract: `confirm()` (centered modal, built ON `caelum/dialog`) and
 * `confirmAt(origin, …)` (anchored popover next to its trigger — `p-confirmPopup` parity, #664). Both
 * share `CaeConfirmOptions`, the same defaults, role=alertdialog, and safe-default reject focus +
 * Escape/outside-click = reject. A SIBLING entry point, deliberately NOT folded into `caelum/dialog`,
 * so a plain-dialog consumer doesn't pull in the confirm bodies + `cae-button`. Tree-shakable on its
 * own, and re-exported from the primary `caelum` barrel (#28). The `CaeConfirmDialog` /
 * `CaeConfirmPopup` bodies are internal — reach them only through `confirm()` / `confirmAt()`.
 */
export { CaeConfirmService } from './confirm';
export type { CaeConfirmOptions, CaeConfirmDefaultFocus, CaeConfirmOrigin } from './confirm';
