/**
 * Secondary entry point `caelum/button` (issue #28, Book 19 §3.2) — importable and
 * tree-shakable on its own, mirroring Angular Material's per-component entry points
 * ("pay only for what you import", Book 18 §3.3). Everything here is also re-exported
 * from the primary `caelum` barrel, which stays intact (this split is additive).
 */
// `export *` is safe here: `button.ts`'s internal `CaeButtonMenuTrigger` composer is NOT exported
// from its own module, so there is nothing for this line to leak (#992). A same-file reference
// satisfies the component's `imports` — verified with `ng build caelum`, because the neighbouring
// `menubar/public-api.ts` claims otherwise and works around a constraint that does not exist.
export * from './button';
