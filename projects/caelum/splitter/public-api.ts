/**
 * Secondary entry point `caelum/splitter` (issue #323) — importable and tree-shakable on its own, mirroring
 * Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3). Opens the
 * Splitter family (`p-splitter` parity, Book 11 §3.2): a keyboard-resizable multi-panel splitter whose
 * dividers are the APG *window splitter* separator pattern — the same a11y substrate shipped in
 * `cae-image-compare` (#293), RTL-resolved through `Directionality` (Book 04 §3.5), now applied to flex
 * panels. Everything here is also re-exported from the primary `caelum` barrel (the split is additive).
 */
export * from './splitter';
