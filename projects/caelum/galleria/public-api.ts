/**
 * Secondary entry point `caelum/galleria` (issue #274) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * The ★ media family's gallery (Book 11 §3.4): a thumbnail strip + a fullscreen lightbox opened through
 * `caelum/dialog` (D-15), building on cae-carousel's index model. Only `CaeGalleria` and its item model
 * are public — the internal `CaeGalleriaLightbox` is reached solely via `CaeGalleria.openFullscreen()`.
 * Everything here is also re-exported from the primary `caelum` barrel (the split is additive).
 */
export * from './galleria';
export * from './galleria-item';
