/**
 * Secondary entry point `caelum/panel` (issue #28, Book 19 §3.2) — importable and
 * tree-shakable on its own, mirroring Angular Material's per-component entry points
 * ("pay only for what you import", Book 18 §3.3). Everything here is also re-exported
 * from the primary `caelum` barrel, which stays intact (this split is additive).
 *
 * The entry point holds the **titled-container family** (`reference/COMPARISON.md`:
 * `p-panel`/`p-fieldset` → `cae-panel`/`cae-fieldset`, Book 11 §3.1 — the one *Compose*
 * row in an otherwise Direct table), the same way `caelum/accordion` holds the accordion
 * and its panel. They are two components rather than one flagged component because a
 * `<fieldset>` is not a `MatCard`: its `<legend>` is a **native accessible-name
 * mechanism** for the enclosed group, which is the entire reason `cae-fieldset` exists
 * (see its class doc).
 */
export * from './panel';
export * from './fieldset';
