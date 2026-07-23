/**
 * Secondary entry point `caelum/tag` (issue #662, M3 display cluster) — the static status label
 * (`reference/COMPARISON.md`: `p-tag` → `cae-tag`, "`MatChip` (static)", tier Compose; Book 11 §3.1).
 * A non-interactive severity label that COMPOSES Material's `mat-chip` in its presentational
 * configuration — deliberately not a second `cae-chip` (that one is interactive/removable) and not a
 * new severity palette (severity colours read from the existing `--cae-color-*` tokens). Supports the
 * D-596 per-item icon convention (`icon` glyph + `iconTemplate`) via `caelum/icon`. Re-exported by the
 * primary `caelum` barrel (imports no optional peer — D-652).
 */
export * from './tag';
