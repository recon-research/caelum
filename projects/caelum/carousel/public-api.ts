/**
 * Secondary entry point `caelum/carousel` (issue #273) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * The first member of the ★ media family (Book 11 §3.4); Galleria (#274) and Image-preview (#275) are
 * separate entry points that build on the same overlay/index primitives. Everything here is also
 * re-exported from the primary `caelum` barrel, which stays intact (this split is additive).
 */
export * from './carousel';
export * from './carousel-item';
