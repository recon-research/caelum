import type { CaeColumn, CaeRow } from './grid-types';

/**
 * Serialize a set of {@link CaeRow}s to an RFC-4180 CSV {@link Blob}, read through the column
 * {@link CaeColumn.value} accessors (issue #171). Extracted from {@link ClientGridAdapter} so **both**
 * grid engines — the dependency-free client default and the `@tanstack/table-core` adapter — export
 * through this **one** function: their output is byte-identical by construction, which is part of the
 * "swap the engine, change nothing observable" contract the M2 isolation proof rests on.
 *
 * It is deliberately vendor-free (only `Cae*` value types) so it lives on the neutral side of the
 * adapter fence — `grid.adapter.ts` may import it without importing an engine through it.
 *
 * @typeParam T - the row model.
 * @param columns - the column model; header cells + the per-cell value accessors, in render order.
 * @param rows - the rows to serialize, already in the desired order (sorted, all pages).
 */
export function toCsvBlob<T>(columns: readonly CaeColumn<T>[], rows: readonly CaeRow<T>[]): Blob {
  const header = columns.map((c) => csvCell(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvCell(c.value(row.data))).join(','));
  // RFC 4180 CRLF line breaks.
  const csv = [header, ...lines].join('\r\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

/** RFC 4180 field escaping: wrap in quotes and double any embedded quote when it contains "/,/newline. */
function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return /["\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
