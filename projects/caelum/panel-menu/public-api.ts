/**
 * Secondary entry point `caelum/panel-menu` (issue #665, M3-exit set) — the accordion-composed,
 * data-driven nested navigation menu (`reference/COMPARISON.md`: `p-panelmenu` → `cae-panel-menu`;
 * Book 09 §3.4, the menus ladder — reach for the existing primitive first). It composes the shipped
 * `caelum/accordion` (`CaeAccordion` + `CaeExpansionPanel`) for the collapsible sections and the
 * shipped `CaeMenuItem` model from `caelum/menu` for its data — it re-implements neither expansion
 * nor a parallel item interface. Imports no optional peer, so it rides the primary `caelum` barrel
 * per D-652.
 */
export * from './panel-menu';
