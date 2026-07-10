/**
 * Secondary entry point `caelum/scroll-panel` (issue #328) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * Sibling of the Splitter family (Book 11 §3.2 pairs Splitter & ScrollPanel): a token-styled, cross-browser
 * scroll container (`p-scrollpanel` parity, COMPARISON row 96) built on native `overflow` + `CdkScrollable`,
 * keyboard-focusable and screen-reader-discoverable when its content overflows. Everything here is also
 * re-exported from the primary `caelum` barrel (the split is additive).
 */
export * from './scroll-panel';
