/**
 * Secondary entry point `caelum/image-compare` (issue #293) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * The ★ media family's niche member (Book 11 §3.4, `p-imagecompare` parity): a before/after reveal slider
 * whose draggable, keyboard-resizable divider is the APG *window splitter* separator pattern (Book 11 §3.2),
 * RTL-resolved through `Directionality` (Book 04 §3.5). Split out of #275 (which shipped `cae-image`) as its
 * own slice because it sits on a distinct substrate — a reveal slider, not the dialog lightbox — so it gets
 * its own entry point rather than folding into `caelum/image`. Everything here is also re-exported from the
 * primary `caelum` barrel (the split is additive).
 */
export * from './image-compare';
