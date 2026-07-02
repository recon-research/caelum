import type { TooltipPosition } from '@angular/material/tooltip';

/**
 * Placement of a Caelum tooltip relative to its anchor. A Caelum-owned alias of Material's
 * `TooltipPosition` (a peer-dep type) so consumers type against a `Cae*` name that can't
 * drift from Material's set. Lives in `caelum/shared` (not a component entry point) so every
 * tooltip consumer — `cae-button`'s `tooltip` seam today, `caeTooltip` / the wrapper-forwarding
 * work (#57) next — names it without importing another component's module, and so the primary
 * barrel never re-exports it from two places (a duplicate `export *` name is silently dropped).
 * Type-only: `import type` keeps `caelum/shared` free of runtime code.
 */
export type CaeTooltipPosition = TooltipPosition;
