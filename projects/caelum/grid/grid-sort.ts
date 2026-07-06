/**
 * The **one** column comparator both grid engines sort by (issue #171). Extracted so the client default
 * and the `@tanstack/table-core` adapter share a single collation rule — otherwise table-core's default
 * `auto` sorting fn (raw code-point / natural-numeric) would diverge from this locale collation for
 * string columns, and the two engines would order `viewRows` (and the exported CSV bytes, which
 * serialize the sorted set) differently. Sharing it is what makes "swap the engine, observe nothing"
 * literally true, including byte-identical export — the M2 isolation contract (D-03).
 *
 * Numbers compare numerically; everything else compares as a locale string (case-insensitive at the
 * primary level; null/undefined sort low). It returns the **ascending** comparison — each engine applies
 * the descending inversion itself (the client multiplies by a direction factor; table-core negates).
 * Vendor-free, so it sits on the neutral side of the adapter fence and `grid.adapter.ts` may import it.
 */
export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}
