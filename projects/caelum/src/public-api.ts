/*
 * Public API Surface of caelum
 *
 * Direct (1:1) components over Angular Material — each a thin, standalone `cae-*` wrapper
 * that gives migrating teams a stable Caelum API seam over Material (D-01/D-02; Book 20
 * §2.1), themed through the token bridge. All ship from this single primary entry point;
 * per-component secondary entry points (`caelum/button`, …; Book 19 §3.2, #28) are a
 * deliberate follow-up. Batch 1 = issue #5; batch 2 = issue #26; batch 3 = issue #27.
 */

// --- Shared types ---
export type { CaeFormFieldAppearance } from './lib/shared/appearance';

// --- Batch 1 (#5) ---
export { CaeButton } from './lib/button/button';
export type { CaeButtonVariant } from './lib/button/button';
export { CaeCard } from './lib/card/card';
export type { CaeCardAppearance } from './lib/card/card';
export { CaeCheckbox } from './lib/checkbox/checkbox';
export { CaeInput } from './lib/input/input';
export type { CaeInputType } from './lib/input/input';

// --- Batch 2 (#26) ---
export { CaeRadio } from './lib/radio/radio';
export type { CaeRadioOption } from './lib/radio/radio';
export { CaeSelect } from './lib/select/select';
export type { CaeSelectOption } from './lib/select/select';
export { CaeTextarea } from './lib/textarea/textarea';
export { CaeTabs, CaeTab } from './lib/tabs/tabs';
export { CaeTooltip } from './lib/tooltip/tooltip';

// --- Batch 3 (#27) ---
export { CaeMenu, CaeMenuTrigger } from './lib/menu/menu';
export type { CaeMenuItem } from './lib/menu/menu';
export { CaeStepper, CaeStep } from './lib/stepper/stepper';
export { CaeTree } from './lib/tree/tree';
export type { CaeTreeNode } from './lib/tree/tree';
