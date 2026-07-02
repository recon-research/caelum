/*
 * Public API Surface of caelum — the convenience barrel.
 *
 * Direct (1:1) components over Angular Material — each a thin, standalone `cae-*` wrapper
 * that gives migrating teams a stable Caelum API seam over Material (D-01/D-02; Book 20
 * §2.1), themed through the token bridge.
 *
 * Since #28 (Book 19 §3.2) each component also ships as its own tree-shakable secondary
 * entry point (`caelum/button`, …, plus `caelum/shared` for cross-component types) so a
 * consumer can "pay only for what they import" (Book 18 §3.3). This barrel re-exports
 * every one of them by package name — importing `caelum` still works exactly as before
 * (the split is additive) — but a barrel import pulls the whole set, so prefer the
 * per-component path in app code. Re-exporting by name (not by re-declaring the source)
 * is also what keeps each source file owned by a single entry point, which ng-packagr
 * requires. Batch 1 = #5; batch 2 = #26; batch 3 = #27.
 */

// --- Shared types ---
export * from 'caelum/shared';

// --- Batch 1 (#5) ---
export * from 'caelum/button';
export * from 'caelum/card';
export * from 'caelum/checkbox';
export * from 'caelum/input';

// --- Batch 2 (#26) ---
export * from 'caelum/radio';
export * from 'caelum/select';
export * from 'caelum/textarea';
export * from 'caelum/tabs';
export * from 'caelum/tooltip';

// --- Batch 3 (#27) ---
export * from 'caelum/menu';
export * from 'caelum/stepper';
export * from 'caelum/tree';
