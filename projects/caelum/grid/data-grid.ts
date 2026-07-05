import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { CAE_GRID, CaeGridAdapter } from './grid-adapter';
import { defaultGridAdapterFactory } from './client-grid-adapter';
import type { CaeColumn, CaeGridDataRequest, CaeRow, CaeSort, CaeSortDir } from './grid-types';

/**
 * `cae-data-grid` — the **first component over a neutral, engine-swappable interface** (issue #170,
 * M2 — Adapters). Where `cae-table` (#141) is a thin declarative wrapper over Material `mat-table`
 * (great to a few hundred rows), the data grid **renders its own DOM** through `cdk-virtual-scroll`
 * so it stays smooth at thousands of rows, and it does all sort/paginate/export work behind the
 * {@link CaeGridAdapter} port — an in-memory client engine by default (#170), `@tanstack/table-core`
 * behind `grid.adapter.ts` in #171, **with no change to this component or its specs**. That swap is
 * the M2 isolation proof (Book 13 §3.1/§3.3, Book 12 §3.1). The grid-vs-table choice is by row count
 * per screen (Book 10 §2.2/§3.5); reach for `cae-table` first, this when the row count demands it.
 *
 * The public surface is deliberately **ergonomically identical to `cae-table`** — `[columns]`,
 * `[data]`, `caption`/`ariaLabel`, `[paginated]`, `[pageSize]`, `sortActive`/`sortDirection` — so a
 * team outgrowing `cae-table` swaps the element name and provider, not their bindings. Columns use a
 * `value(row)` accessor (a superset of `CaeTableColumn.key`) so computed/nested fields work.
 *
 * ```html
 * <cae-data-grid caption="Events" [columns]="cols" [data]="rows" paginated [pageSize]="50" />
 * ```
 *
 * **a11y.** An ARIA grid: `role="grid"` with `aria-rowcount`/`aria-colcount` (the *full* counts, not
 * the rendered subset — the correct pattern for a virtualized grid where most rows are not in the
 * DOM), header `role="columnheader"` cells carrying `aria-sort`, and each rendered `role="row"` /
 * `role="gridcell"` carrying `aria-rowindex`/`aria-colindex` so assistive tech conveys position even
 * across the virtual-scroll wrapper. A sortable header is a real `<button>` (Enter/Space, three-state
 * asc → desc → unsorted). The empty state is a persistent `role="status"` live region (announced on a
 * data-becomes-empty transition). Arrow-key cell navigation (roving tabindex) and real-browser
 * verification of virtual-scroll row rendering/recycling are deferred to the M4 verify family.
 *
 * **v1 scope** (#170): client-side sort + client pagination + CSV export, all in the default engine.
 * Server-side/lazy data is a typed **seam only** ({@link dataRequest} + `CaeGridAdapter.applyServerResult`)
 * — the emitting server adapter, grouping/aggregation, column resize/reorder/pin, row selection, and
 * cell templates are followups.
 *
 * Zoneless-compatible: `OnPush` + signal inputs (D-12); token-only theming (D-04).
 *
 * @typeParam T - the row shape. **Unconstrained** (as in `cae-table`) so a plain typed interface binds.
 */
@Component({
  selector: 'cae-data-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkVirtualScrollViewport, CdkFixedSizeVirtualScroll, CdkVirtualForOf],
  template: `
    <div
      class="cae-data-grid"
      role="grid"
      [attr.aria-label]="(caption() ? null : ariaLabel()) || null"
      [attr.aria-rowcount]="adapter.total() + 1"
      [attr.aria-colcount]="columns().length"
    >
      @if (caption()) {
        <div class="cae-data-grid__caption">{{ caption() }}</div>
      }

      <div class="cae-data-grid__head" role="rowgroup">
        <div class="cae-data-grid__row" role="row" aria-rowindex="1">
          @for (col of columns(); track col.id; let colIndex = $index) {
            <div
              class="cae-data-grid__cell cae-data-grid__cell--head"
              role="columnheader"
              [attr.aria-colindex]="colIndex + 1"
              [attr.aria-sort]="col.sortable ? ariaSort(col) : null"
              [style.text-align]="col.align === 'end' ? 'end' : 'start'"
              [style.flex]="col.width ? '0 0 ' + col.width : '1 1 0'"
            >
              @if (col.sortable) {
                <button type="button" class="cae-data-grid__sort" (click)="toggleSort(col)">
                  <span>{{ col.header }}</span>
                  <span class="cae-data-grid__sort-icon" aria-hidden="true">{{
                    sortGlyph(col)
                  }}</span>
                </button>
              } @else {
                <span>{{ col.header }}</span>
              }
            </div>
          }
        </div>
      </div>

      <cdk-virtual-scroll-viewport
        class="cae-data-grid__body"
        role="rowgroup"
        [itemSize]="rowHeight()"
        [style.height]="viewportHeight()"
      >
        <div
          *cdkVirtualFor="let row of adapter.viewRows(); let i = index; trackBy: trackRow"
          class="cae-data-grid__row"
          role="row"
          [attr.aria-rowindex]="pageOffset() + i + 2"
          [style.height.px]="rowHeight()"
        >
          @for (col of columns(); track col.id; let colIndex = $index) {
            <div
              class="cae-data-grid__cell"
              role="gridcell"
              [attr.aria-colindex]="colIndex + 1"
              [style.text-align]="col.align === 'end' ? 'end' : 'start'"
              [style.flex]="col.width ? '0 0 ' + col.width : '1 1 0'"
            >
              {{ col.value(row.data) }}
            </div>
          }
        </div>
      </cdk-virtual-scroll-viewport>

      <div class="cae-data-grid__empty" role="status" aria-live="polite">{{ emptyText() }}</div>

      @if (paginated()) {
        <div class="cae-data-grid__pager">
          <span class="cae-data-grid__range" aria-live="polite">{{ rangeLabel() }}</span>
          <button
            type="button"
            class="cae-data-grid__page-btn"
            [disabled]="!canPrev()"
            (click)="prevPage()"
            aria-label="Previous page"
          >
            Prev
          </button>
          <button
            type="button"
            class="cae-data-grid__page-btn"
            [disabled]="!canNext()"
            (click)="nextPage()"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-data-grid {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      overflow: hidden;
      color: var(--cae-color-on-surface, currentColor);
      background: var(--cae-surface-base, transparent);
      font: var(--cae-text-md);
    }
    .cae-data-grid__caption {
      padding: var(--cae-space-2) var(--cae-space-3);
      font-weight: var(--cae-weight-medium);
      border-bottom: 1px solid var(--cae-color-border);
    }
    .cae-data-grid__row {
      display: flex;
      align-items: center;
      box-sizing: border-box;
    }
    .cae-data-grid__head .cae-data-grid__row {
      background: var(--cae-surface-sunken, transparent);
      border-bottom: 1px solid var(--cae-color-border);
      font-weight: var(--cae-weight-medium);
    }
    .cae-data-grid__cell {
      padding: 0 var(--cae-space-3);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cae-data-grid__body .cae-data-grid__row {
      border-bottom: 1px solid var(--cae-color-border);
    }
    .cae-data-grid__sort {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-1);
      background: none;
      border: none;
      margin: 0;
      padding: var(--cae-space-2) 0;
      font: inherit;
      font-weight: var(--cae-weight-medium);
      color: inherit;
      cursor: pointer;
    }
    .cae-data-grid__sort:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-data-grid__sort-icon {
      opacity: 0.7;
      font-size: 0.85em;
    }
    .cae-data-grid__empty {
      padding: var(--cae-space-4);
      color: var(--cae-color-on-surface-variant, currentColor);
      text-align: center;
    }
    .cae-data-grid__empty:empty {
      display: none;
    }
    .cae-data-grid__pager {
      display: flex;
      align-items: center;
      gap: var(--cae-space-2);
      padding: var(--cae-space-2) var(--cae-space-3);
      border-top: 1px solid var(--cae-color-border);
    }
    .cae-data-grid__range {
      margin-right: auto;
      color: var(--cae-color-on-surface-variant, currentColor);
    }
    .cae-data-grid__page-btn {
      font: inherit;
      color: var(--cae-color-primary, currentColor);
      background: none;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-sm);
      padding: var(--cae-space-1) var(--cae-space-3);
      cursor: pointer;
    }
    .cae-data-grid__page-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .cae-data-grid__page-btn:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
  `,
})
export class CaeDataGrid<T = Record<string, unknown>> {
  /** Column definitions, in display order (a `value(row)` accessor per column). */
  readonly columns = input.required<readonly CaeColumn<T>[]>();
  /** Row data — fed to the adapter as the client dataset. */
  readonly data = input.required<readonly T[]>();

  /** Visible caption + the grid accessible name. Prefer this over {@link ariaLabel}. */
  readonly caption = input('');
  /** Accessible name when there is no visible {@link caption}. Do not set both. */
  readonly ariaLabel = input('');
  /** Message shown in the persistent live region when there are no rows. */
  readonly emptyMessage = input('No data.');

  /** Opt into a client-side pager below the grid (unpaginated = virtual-scroll the whole sorted set). */
  readonly paginated = input(false, { transform: booleanAttribute });
  /** Rows per page when {@link paginated}. */
  readonly pageSize = input(20);

  /** Fixed row height in px — cdk-virtual-scroll needs a uniform item size. */
  readonly rowHeight = input(48);
  /** Scroll viewport height (any CSS length) — the window the virtual scroller renders within. */
  readonly viewportHeight = input('24rem');

  /** Initial sort column (a column `id`); the header owns the live sort after mount. */
  readonly sortActive = input('');
  /** Initial sort direction for {@link sortActive}. */
  readonly sortDirection = input<CaeSortDir | ''>('');

  /** Fires with the new sort (or `null` for unsorted) whenever a header sort control is used. */
  readonly sortChange = output<CaeSort | null>();
  /**
   * The server-side fetch seam — fires when the engine needs a remote slice. Inert with the client
   * default (which serves rows itself); a server adapter (followup) drives it. Typed here so wiring
   * it needs no API change.
   */
  readonly dataRequest = output<CaeGridDataRequest>();

  /** The per-grid engine — from the injected {@link CAE_GRID} factory, or the built-in client default. */
  private readonly makeAdapter = inject(CAE_GRID, { optional: true }) ?? defaultGridAdapterFactory;
  protected readonly adapter: CaeGridAdapter<T> = this.makeAdapter<T>();

  /** Offset of the current page in the full set — anchors `aria-rowindex` (0 when unpaginated). */
  protected readonly pageOffset = computed(() => {
    const size = this.adapter.pageSize();
    return size > 0 ? this.adapter.page() * size : 0;
  });

  /** Empty-state text: '' while rows exist (so the live region collapses), else the message. */
  protected readonly emptyText = computed(() =>
    this.adapter.total() === 0 ? this.emptyMessage() : '',
  );

  /** Pager range label, e.g. "1-50 of 812". */
  protected readonly rangeLabel = computed(() => {
    const size = this.adapter.pageSize();
    const total = this.adapter.total();
    if (size <= 0 || total === 0) return `${total} rows`;
    const start = this.adapter.page() * size + 1;
    const end = Math.min(start + size - 1, total);
    return `${start}-${end} of ${total}`;
  });

  protected readonly canPrev = computed(() => this.adapter.page() > 0);
  protected readonly canNext = computed(() => {
    const size = this.adapter.pageSize();
    if (size <= 0) return false;
    return (this.adapter.page() + 1) * size < this.adapter.total();
  });

  private seeded = false;

  constructor() {
    // Feed the raw dataset + columns into the engine whenever either input changes (client mode).
    effect(() => this.adapter.setData(this.data(), this.columns()));

    // Sync pagination config; a config change returns to the first page. User Prev/Next call the
    // adapter directly (below) and do not re-trigger this effect (it depends only on the inputs).
    effect(() => {
      const size = this.paginated() ? this.pageSize() : 0;
      this.adapter.setPage(0, size);
    });

    // Seed the initial sort exactly once, after the bound inputs are available (they are not in the
    // constructor). Guarded so a later sortActive/sortDirection change does not re-seed over the
    // user's live sort — the header owns it after mount (mirrors cae-table).
    effect(() => {
      if (this.seeded) return;
      this.seeded = true;
      const col = this.sortActive();
      const dir = this.sortDirection();
      if (col && (dir === 'asc' || dir === 'desc')) {
        untracked(() => this.adapter.sortBy({ columnId: col, dir }));
      }
    });

    // Forward a non-null engine data request out to the consumer (inert with the client default).
    effect(() => {
      const request = this.adapter.dataRequest();
      if (request) this.dataRequest.emit(request);
    });
  }

  /** cdk-virtual-scroll trackBy — the adapter row id is stable across sort/paginate. */
  protected trackRow = (_: number, row: CaeRow<T>): string | number => row.id;

  /** `aria-sort` value for a sortable header. */
  protected ariaSort(col: CaeColumn<T>): 'ascending' | 'descending' | 'none' {
    const sort = this.adapter.sort();
    if (!sort || sort.columnId !== col.id) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  /** Decorative sort glyph (aria-hidden — `aria-sort` is the announced state). */
  protected sortGlyph(col: CaeColumn<T>): string {
    const sort = this.adapter.sort();
    if (!sort || sort.columnId !== col.id) return '↕'; // up-down
    return sort.dir === 'asc' ? '↑' : '↓'; // up / down
  }

  /** Cycle a column three-state: unsorted/other -> asc -> desc -> unsorted (mat-sort parity). */
  protected toggleSort(col: CaeColumn<T>): void {
    if (!col.sortable) return;
    const current = this.adapter.sort();
    let next: CaeSort | null;
    if (!current || current.columnId !== col.id) next = { columnId: col.id, dir: 'asc' };
    else if (current.dir === 'asc') next = { columnId: col.id, dir: 'desc' };
    else next = null;
    this.adapter.sortBy(next);
    this.sortChange.emit(next);
  }

  protected prevPage(): void {
    this.adapter.setPage(Math.max(0, this.adapter.page() - 1), this.adapter.pageSize());
  }

  protected nextPage(): void {
    this.adapter.setPage(this.adapter.page() + 1, this.adapter.pageSize());
  }
}
