/**
 * Secondary entry point `caelum/button` (issue #28, Book 19 §3.2) — importable and
 * tree-shakable on its own, mirroring Angular Material's per-component entry points
 * ("pay only for what you import", Book 18 §3.3). Everything here is also re-exported
 * from the primary `caelum` barrel, which stays intact (this split is additive).
 */
// Named exports (not `export *`) so the internal `CaeButtonMenuTrigger` composer — which must be
// `export`ed from button.ts for Angular to accept it in the component's `imports` — stays OUT of the
// public API surface. Its input takes a Material `MatMenuPanel`; consumers bind `cae-button`'s own
// `menuTriggerFor` and never name a Material type (D-01/D-02, #992).
export { CaeButton, type CaeButtonVariant } from './button';
