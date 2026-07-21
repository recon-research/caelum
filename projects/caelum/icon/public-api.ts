/**
 * Secondary entry point `caelum/icon` (D-596, issue #644) — the library-owned glyph
 * registry + the `cae-icon` renderer behind the per-item icon convention on the data-driven
 * components (`cae-breadcrumb` / `cae-tab-menu` / `cae-menu` / `cae-split-button`). Runtime
 * code, which is why it is NOT in `caelum/shared` (type-only by its own contract). A
 * consumer using none of the icon-supplying components ships none of these bytes; the four
 * components carry it as a small external dependency (imported, never inlined into their
 * fesms), so it is paid once, not per component.
 */
export * from './icon';
