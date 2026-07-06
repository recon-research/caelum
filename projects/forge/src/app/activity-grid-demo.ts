import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { CaeButton } from 'caelum/button';
import { CaeCard } from 'caelum/card';
// The neutral grid surface + the TanStack engine seam. `CaeDataGrid`/`CaeColumn` are the SAME neutral
// symbols the client-default demo used; `provideTanStackGrid`/`tanStackGridAdapterFactory`/`CAE_GRID`
// select the engine WITHOUT touching the component markup — that DI swap is the M2 isolation proof
// (#171). Because this whole component is @defer'd from App, importing the TanStack factory keeps
// `@tanstack/table-core` in this lazy chunk, off Forge's eager initial bundle.
import { CaeDataGrid, CAE_GRID, tanStackGridAdapterFactory, type CaeColumn } from 'caelum/grid';

/** A row of the "Activity log" data-grid demo — a plain typed model (the grid generic is unconstrained). */
interface ActivityEvent {
  seq: number;
  actor: string;
  action: string;
  status: string;
  when: string;
}

/** How many rows the at-scale demo drives through the TanStack engine (Book 13 §6 — profile at scale). */
const ACTIVITY_ROWS = 5000;

/**
 * Deterministically build N activity rows. No Math.random / Date.now (both would break the OnPush
 * determinism + the reproducible build); the fields cycle through fixed pools so the set is stable.
 */
function buildActivity(count: number): readonly ActivityEvent[] {
  const actors = [
    'ada@acme.dev',
    'grace@acme.dev',
    'alan@acme.dev',
    'kate@acme.dev',
    'edsger@acme.dev',
  ];
  const actions = [
    'Deployed service',
    'Rotated API key',
    'Invited member',
    'Archived project',
    'Updated billing',
    'Ran migration',
  ];
  const statuses = ['ok', 'ok', 'ok', 'warning', 'failed'];
  const rows: ActivityEvent[] = [];
  for (let i = 0; i < count; i++) {
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String((i % 28) + 1).padStart(2, '0');
    const hour = String(i % 24).padStart(2, '0');
    const minute = String((i * 7) % 60).padStart(2, '0');
    rows.push({
      seq: i + 1,
      actor: actors[i % actors.length],
      action: actions[i % actions.length],
      status: statuses[i % statuses.length],
      when: `2025-${month}-${day} ${hour}:${minute}`,
    });
  }
  return rows;
}

/**
 * The deferred "Activity log" `cae-data-grid` demo, running on the **TanStack** engine (#171, the M2
 * grid exit criterion). It is the same neutral component the client-default demo used (#170) — the only
 * difference is the element-injector provider below, which swaps `CAE_GRID` to the TanStack factory. The
 * grid markup, its inputs, and `cae-data-grid` itself are UNCHANGED; nothing here imports a `@tanstack`
 * type. That "swap the engine, change nothing observable" is exactly the isolation the adapter fence
 * enforces. It runs at realistic scale — {@link ACTIVITY_ROWS} rows behind cdk-virtual-scroll, sorted +
 * exported wholly client-side by table-core.
 *
 * Providing the engine HERE (a `@defer`'d component) rather than in the eager app config keeps
 * `@tanstack/table-core` in this component's lazy chunk — Forge's initial bundle ships zero engine bytes.
 */
@Component({
  selector: 'app-activity-grid-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeButton, CaeDataGrid],
  // The engine swap: one provider, no markup change. Element-injector scope so it also keeps the
  // engine deferred (see the class doc). Consumers who want it app-wide use provideTanStackGrid().
  providers: [{ provide: CAE_GRID, useValue: tanStackGridAdapterFactory }],
  templateUrl: './activity-grid-demo.html',
  styleUrl: './activity-grid-demo.scss',
})
export class ActivityGridDemo {
  private readonly document = inject(DOCUMENT);

  protected readonly activityColumns: readonly CaeColumn<ActivityEvent>[] = [
    { id: 'seq', header: '#', value: (e) => e.seq, sortable: true, align: 'end', width: '4.5rem' },
    { id: 'actor', header: 'Actor', value: (e) => e.actor, sortable: true },
    { id: 'action', header: 'Action', value: (e) => e.action, sortable: true },
    { id: 'status', header: 'Status', value: (e) => e.status, sortable: true, width: '7rem' },
    { id: 'when', header: 'When', value: (e) => e.when, sortable: true, width: '11rem' },
  ];
  /** Thousands of deterministic rows — well past what a plain table renders comfortably. */
  protected readonly activity = signal<readonly ActivityEvent[]>(buildActivity(ACTIVITY_ROWS));
  /** Persistent live-region text confirming an export (empty until the first one). */
  protected readonly exportNote = signal('');

  /**
   * Export the full activity set to a CSV download — the liveness proof for `cae-data-grid.exportRows()`
   * driven by the TanStack engine. The grid comes in as a TEMPLATE REF (not a viewChild), matching how a
   * real consumer reaches the public method; the consumer owns the download. `exportRows()` serializes
   * the whole sorted set (all {@link ACTIVITY_ROWS} rows), not just the virtualized window.
   */
  protected exportActivity(grid: { exportRows(format?: 'csv'): Blob }): void {
    const blob = grid.exportRows('csv');
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = 'activity-log.csv';
    anchor.click();
    URL.revokeObjectURL(url);
    this.exportNote.set(`Exported ${this.activity().length} rows to activity-log.csv.`);
  }
}
