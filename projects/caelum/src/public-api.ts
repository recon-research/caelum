/*
 * Public API Surface of caelum
 *
 * Batch 1 — Direct (1:1) components over Angular Material (issue #5). Each is a thin,
 * standalone `cae-*` wrapper that gives migrating teams a stable Caelum API seam over
 * Material (D-01/D-02; Book 20 §2.1), themed through the token bridge. All batch-1
 * components ship from this single primary entry point; per-component secondary entry
 * points (`caelum/button`, …; Book 19 §3.2) are a deliberate follow-up.
 */
export { CaeButton } from './lib/button/button';
export type { CaeButtonVariant } from './lib/button/button';
export { CaeCard } from './lib/card/card';
export type { CaeCardAppearance } from './lib/card/card';
export { CaeCheckbox } from './lib/checkbox/checkbox';
export { CaeInput } from './lib/input/input';
export type { CaeInputType, CaeInputAppearance } from './lib/input/input';
