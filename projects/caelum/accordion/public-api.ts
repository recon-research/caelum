/**
 * Secondary entry point `caelum/accordion` (issue #28, Book 19 §3.2) — importable and
 * tree-shakable on its own, mirroring Angular Material's per-component entry points
 * ("pay only for what you import", Book 18 §3.3). Exports the accordion container
 * (`CaeAccordion`) and its collapsible section (`CaeExpansionPanel`) as one family, the
 * way `caelum/tabs` ships `CaeTabs` + `CaeTab`. Everything here is also re-exported from
 * the primary `caelum` barrel, which stays intact (this split is additive).
 */
export * from './accordion';
