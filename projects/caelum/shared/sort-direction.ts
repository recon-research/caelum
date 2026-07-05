import type { SortDirection } from '@angular/material/sort';

/**
 * Sort direction of a Caelum sortable column: `'asc'`, `'desc'`, or `''` (unsorted). A
 * Caelum-owned alias of Material's `SortDirection` (a peer-dep type) so `cae-table` consumers
 * type their `sortDirection` input against a `Cae*` name that can't drift from Material's set —
 * mirroring `CaeTooltipPosition`. Lives in `caelum/shared` (type-only, `import type`), so it adds
 * no runtime code and no component entry point owns Material's type on its public surface (#141).
 */
export type CaeSortDirection = SortDirection;
