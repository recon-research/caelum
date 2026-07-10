/**
 * Secondary entry point `caelum/image` (issue #275) — importable and tree-shakable on its own, mirroring
 * Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3). The ★ media
 * family's smallest member (Book 11 §3.4, `p-image` parity): a token-styled image with a fullscreen
 * zoom/rotate/pan preview opened through `caelum/dialog` (D-15) — the same centered-modal shell as the
 * galleria lightbox. Only `CaeImage` is public; the internal `CaeImagePreview` is reached solely via
 * `CaeImage.openPreview()`. Everything here is also re-exported from the primary `caelum` barrel (the
 * split is additive). The before/after `cae-image-compare` slider is its own slice (#293).
 */
export * from './image';
