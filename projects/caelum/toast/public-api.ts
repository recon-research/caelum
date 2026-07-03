/**
 * Secondary entry point `caelum/toast` (issue #96, D-15, Book 19 §3.2) — the first SERVICE
 * passthrough in Caelum: an injectable `CaeToast` over Material's `MatSnackBar`
 * (`reference/COMPARISON.md`: `p-toast` → `cae-toast`). Tree-shakable on its own, mirroring
 * Angular Material's per-component entry points, and also re-exported from the primary `caelum`
 * barrel (the split is additive, #28 — a bare `import from 'caelum'` still resolves it).
 */
export * from './toast';
