import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  isDevMode,
  OnInit,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CAE_GRID, CaeGridAdapter } from './grid-adapter';
import { defaultGridAdapterFactory } from './client-grid-adapter';
import type {
  CaeColumn,
  CaeGridDataRequest,
  CaeGridExportFormat,
  CaeRow,
  CaeSort,
  CaeSortDir,
} from './grid-types';

/** Per-instance id source for wiring the visible caption as the table accessible name (aria-labelledby). */
let gridInstanceCounter = 0;

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
 * The public surface deliberately **mirrors `cae-table`** — `[columns]`, `[data]`, `caption`/
 * `ariaLabel`, `[paginated]`, `[pageSize]` (default 10, as `cae-table`), `sortActive`/`sortDirection`
 * — so a team outgrowing `cae-table` swaps the element name, not their bindings. Two deliberate
 * differences: columns use a `value(row)` accessor (a superset of `CaeTableColumn.key`) so
 * computed/nested fields work, and the pager is minimal (Prev/Next, plus an optional
 * {@link pageSizeOptions} rows-per-page menu — #177).
 *
 * ```html
 * <cae-data-grid caption="Events" [columns]="cols" [data]="rows" paginated [pageSize]="50" />
 * ```
 *
 * **a11y.** A `role="table"` with `aria-rowcount`/`aria-colcount` (the *full* counts, not the rendered
 * subset — the correct pattern for a virtualized table where most rows are not in the DOM), header
 * `role="columnheader"` cells carrying `aria-sort`, and each rendered `role="row"` / `role="cell"`
 * carrying `aria-rowindex`/`aria-colindex` so assistive tech conveys position even across the
 * virtual-scroll wrapper. `role="table"` (not `role="grid"`) is deliberate for v1: the cells are
 * read-only text with no cell-cursor, which is exactly the ARIA *table* pattern (and matches p-table,
 * a native `<table>`); it becomes `role="grid"` when arrow-key cell navigation lands (#175). The
 * accessible name comes from a visible `caption` (via `aria-labelledby`, preferred) **or** `ariaLabel`
 * — set one, not both. A sortable header is a real `<button>` (Enter/Space, three-state asc → desc →
 * unsorted). The empty state is a persistent `role="status"` live region (announced on a
 * data-becomes-empty transition); while {@link loading} it shows {@link loadingMessage} instead, and
 * `aria-busy="true"` on the row area holds the now-stale rows from announcement during a fetch (#188).
 * During a load the sort headers + pager go `aria-disabled` (focusable, so focus is retained) and their
 * handlers no-op, and an optional `[caeDataGridLoading]` slot renders a projected (decorative,
 * `aria-hidden`) spinner/skeleton over the grid (#192).
 * When a pager button self-disables *as a direct result of a Prev/Next activation* at the first/last page,
 * focus moves to the still-enabled sibling (only if the pressed button held focus) so a keyboard user is
 * not dropped to the document body (#189); a button disabling from a later async server result — a
 * total-shrink — is #190 seam-robustness territory. Real-browser verification of virtual-scroll row
 * rendering/recycling + header/body column alignment is deferred to the M4 verify family (#174).
 *
 * **Scope**: client-side sort + client pagination + CSV export ({@link exportRows}) in the default
 * engine (#170); **server-side/lazy data** (#176) via the {@link total} input + {@link dataRequest}
 * output + `provideServerGrid()` — bind `[data]` to the fetched page and `[total]` to the server
 * count and the grid renders that slice as-is, with a consumer-driven {@link loading} state for the
 * fetch (#188). Grouping/aggregation, column resize/reorder/pin, row selection, and cell templates are
 * followups (#177).
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
      role="table"
      [attr.aria-labelledby]="caption() ? captionId : null"
      [attr.aria-label]="caption() ? null : ariaLabel() || null"
      [attr.aria-rowcount]="adapter.total() + 1"
      [attr.aria-colcount]="columns().length"
    >
      @if (caption()) {
        <div class="cae-data-grid__caption" [id]="captionId">{{ caption() }}</div>
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
                <button
                  type="button"
                  class="cae-data-grid__sort"
                  [attr.aria-disabled]="loading() ? 'true' : null"
                  (click)="toggleSort(col)"
                >
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
        [attr.aria-busy]="loading() ? 'true' : null"
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
              role="cell"
              [attr.aria-colindex]="colIndex + 1"
              [style.text-align]="col.align === 'end' ? 'end' : 'start'"
              [style.flex]="col.width ? '0 0 ' + col.width : '1 1 0'"
            >
              {{ col.value(row.data) }}
            </div>
          }
        </div>
      </cdk-virtual-scroll-viewport>

      <div class="cae-data-grid__empty" role="status" aria-live="polite">{{ statusText() }}</div>

      @if (paginated()) {
        <div class="cae-data-grid__pager">
          <span class="cae-data-grid__range" aria-live="polite">{{ rangeLabel() }}</span>
          @if (pageSizeOptions().length) {
            <label class="cae-data-grid__page-size">
              <span>Rows per page</span>
              <!-- Native [disabled] (not aria-disabled) while loading: unlike the pager buttons — whose
                   no-op'd click makes them genuinely inert, so aria-disabled keeps them focusable (#192) —
                   a <select> completes its whole announced interaction before any handler runs, so
                   aria-disabled would be a false state to AT; native disabled makes it truly inert (no
                   racing dataRequest). The one-off focus consequence is acceptable here (the pager's
                   repeated keyboard nav is what drove #192's choice). -->
              <select
                class="cae-data-grid__page-size-select"
                [disabled]="loading()"
                (change)="onPageSizeChange($any($event.target))"
              >
                @for (opt of renderedPageSizes(); track opt) {
                  <option [value]="opt" [selected]="opt === effectivePageSize()">{{ opt }}</option>
                }
              </select>
            </label>
          }
          <button
            #prevBtn
            type="button"
            class="cae-data-grid__page-btn"
            [disabled]="!canPrev()"
            [attr.aria-disabled]="loading() ? 'true' : null"
            (click)="prevPage()"
            aria-label="Previous page"
          >
            Prev
          </button>
          <button
            #nextBtn
            type="button"
            class="cae-data-grid__page-btn"
            [disabled]="!canNext()"
            [attr.aria-disabled]="loading() ? 'true' : null"
            (click)="nextPage()"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      }

      @if (loading()) {
        <div class="cae-data-grid__busy" aria-hidden="true">
          <ng-content select="[caeDataGridLoading]"></ng-content>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .cae-data-grid {
      position: relative;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      overflow: hidden;
      color: var(--cae-color-on-surface, currentColor);
      background: var(--cae-surface-base, transparent);
      font: var(--cae-text-md);
    }
    .cae-data-grid__busy {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
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
    .cae-data-grid__sort[aria-disabled='true'] {
      opacity: 0.5;
      cursor: default;
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
    /* When empty, collapse VISUALLY but stay in the accessibility tree — a clip-based visually-hidden
       hide, NOT display:none (which prunes the node from the a11y tree and un-watches the live region).
       Keeping role=status registered while empty is what makes the first Loading…/No data. text an
       announced mutation of a *watched* region rather than the insertion of a region already holding
       text (which screen readers do not reliably announce). Pairs with the born-empty statusText (#194).
       Real-SR announcement is an M4 verify (#228); jsdom cannot observe the a11y tree. */
    .cae-data-grid__empty:empty {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
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
    .cae-data-grid__page-size {
      display: inline-flex;
      align-items: center;
      gap: var(--cae-space-2);
      color: var(--cae-color-on-surface-variant, currentColor);
    }
    .cae-data-grid__page-size-select {
      font: inherit;
      color: inherit;
      background: var(--cae-surface-base, transparent);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-sm);
      padding: var(--cae-space-1) var(--cae-space-2);
      cursor: pointer;
    }
    .cae-data-grid__page-size-select:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
    .cae-data-grid__page-size-select:disabled {
      opacity: 0.5;
      cursor: default;
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
    .cae-data-grid__page-btn:disabled,
    .cae-data-grid__page-btn[aria-disabled='true'] {
      opacity: 0.5;
      cursor: default;
    }
    .cae-data-grid__page-btn:focus-visible {
      outline: var(--cae-focus-ring);
      outline-offset: var(--cae-focus-ring-offset);
    }
  `,
})
export class CaeDataGrid<T = Record<string, unknown>> implements OnInit {
  /** Column definitions, in display order (a `value(row)` accessor per column). */
  readonly columns = input.required<readonly CaeColumn<T>[]>();
  /** Row data — fed to the adapter as the client dataset. */
  readonly data = input.required<readonly T[]>();

  /**
   * Visible caption + the table accessible name (wired as the name via `aria-labelledby`). Prefer
   * this over {@link ariaLabel}; set one, not both.
   */
  readonly caption = input('');
  /** Accessible name when there is no visible {@link caption}. Do not set both. */
  readonly ariaLabel = input('');
  /** Message shown in the persistent live region when there are no rows. */
  readonly emptyMessage = input('No data.');

  /**
   * Whether the grid is currently loading data — mirroring the `p-table` `[loading]` **input contract**
   * (issue #188). While true it (a) sets `aria-busy="true"` on the row area so assistive tech holds the
   * now-stale rows during a fetch instead of announcing an incoherent target-page/old-rows snapshot,
   * (b) shows {@link loadingMessage} in the status region **instead of** the empty state — so an in-flight
   * fetch reads as *loading*, not *empty* ("0 rows"), and (c) makes the grid's own sort headers + pager
   * **inert** (issue #192): they render `aria-disabled="true"` and their click handlers no-op, closing the
   * overlapping-`dataRequest` footgun at the source (a Prev/Next or sort *during* a fetch can no longer emit
   * a second, racing request). This deliberately uses `aria-disabled`, **not** the native `disabled`
   * attribute — the controls stay focusable, so a keyboard user's focus is never dropped when a fetch starts,
   * and returns to a live control when it settles (native `disabled` would strand focus at `<body>`, the very
   * problem #189 fixes for boundary self-disable). For a visual busy affordance, project a spinner/skeleton
   * into the `[caeDataGridLoading]` slot — rendered `aria-hidden` over the grid only while loading (the
   * status region owns the announcement; no default spinner ships, keeping the grid dep- and motion-free).
   * That slot is **decorative-only**: its overlay is `aria-hidden` and `pointer-events: none`, so project
   * only non-interactive content (a spinner/skeleton) — never a focusable control such as a Cancel button
   * (a focusable element inside an `aria-hidden` subtree is a WCAG 4.1.2 violation, and it would be
   * unclickable anyway). A cancel/retry affordance belongs *outside* the grid, as the Forge demo does with
   * its Retry button in the surrounding card. The
   * **consumer owns it**: only the consumer knows a request is in flight (it owns the async fetch behind the
   * server seam), so it sets this true when a {@link dataRequest} fetch starts and false when the result is
   * applied *or the fetch fails* (a `.finally` — so a failure never strands the grid loading). The client
   * default never needs it (it serves rows synchronously); a server grid (`provideServerGrid()`, #176) should
   * bind it — without it a server grid briefly shows the empty state on first load until the fetch settles.
   */
  readonly loading = input(false, { transform: booleanAttribute });
  /** Text shown in the status region while {@link loading} (issue #188). */
  readonly loadingMessage = input('Loading…');

  /** Opt into a client-side pager below the grid (unpaginated = virtual-scroll the whole sorted set). */
  readonly paginated = input(false, { transform: booleanAttribute });
  /** Rows per page when {@link paginated}. Defaults to 10, matching `cae-table`. */
  readonly pageSize = input(10);

  /**
   * Optional rows-per-page choices (the `p-table` `rowsPerPageOptions` analogue, #177). When set (and
   * {@link paginated}), a "Rows per page" `<select>` renders in the pager; choosing a value re-paginates
   * from **page 1** (the offset is meaningless at a new size, as with a sort change) and emits
   * {@link pageSizeChange}. **Until the user picks a size the menu follows {@link pageSize}** (a `[pageSize]`
   * change is honoured and resets to page 1); **after the first pick the menu owns the size** and later
   * `[pageSize]` changes are ignored. Include the initial {@link pageSize} among the options (else it is
   * still shown — the control always reflects the size in effect — but dev-warned). Empty ⇒ no menu (fixed
   * {@link pageSize}). Works across every engine via the one port ({@link CaeGridAdapter.setPage}): the
   * client re-slices, a server engine emits a fresh {@link dataRequest}.
   */
  readonly pageSizeOptions = input<readonly number[]>([]);

  /**
   * **Server-mode** total row count (issue #176). Bind it *with* a server engine
   * ({@link import('./server-grid-adapter').provideServerGrid}) + a {@link dataRequest} handler to drive
   * a lazy/remote grid: `[data]` is the **fetched page**, `[total]` the server's full count, and the grid
   * renders that slice as-is (the server did the sort/paginate). The `p-table` `[totalRecords]` analogue;
   * the seam is Book 13 §3.4. Mode is chosen by the **engine**, not this input: with the client engine
   * `[total]` is **ignored** (the client derives the total from `[data]`) and dev-mode warns; with a
   * server engine, leaving it unset falls back to the fetched page length and dev-mode warns.
   */
  readonly total = input<number | null>(null);

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
   * Fires with the new rows-per-page whenever the {@link pageSizeOptions} menu is used (#177) — the
   * counterpart to {@link sortChange}, so a **client-engine** consumer (which has no {@link dataRequest})
   * can still observe/persist the choice (e.g. to a URL param or `localStorage`); a server consumer also
   * sees it via `dataRequest.pageSize`.
   */
  readonly pageSizeChange = output<number>();
  /**
   * The server-side fetch seam — fires (with the sort/page to fetch) whenever a server engine needs a
   * remote slice. Inert with the client default (which serves rows itself); the {@link import('./server-grid-adapter').ServerGridAdapter}
   * (`provideServerGrid()`, #176) drives it. The consumer owns the fetch and, if requests can overlap,
   * is responsible for ignoring out-of-order responses (e.g. keying on the latest request).
   */
  readonly dataRequest = output<CaeGridDataRequest>();

  /** The per-grid engine — from the injected {@link CAE_GRID} factory, or the built-in client default. */
  private readonly makeAdapter = inject(CAE_GRID, { optional: true }) ?? defaultGridAdapterFactory;
  protected readonly adapter: CaeGridAdapter<T> = this.makeAdapter<T>();

  /**
   * Whether the injected engine is **server-backed** — single-sourced from the engine itself (only a
   * server adapter has a non-null {@link CaeGridAdapter.dataRequest}; the client + TanStack engines
   * are always `null`). Fixed per grid instance (the adapter is created once), so client-vs-server mode
   * follows the *provider*, never the consumer's {@link total} input — the two cannot silently disagree.
   */
  private readonly isServerEngine = this.adapter.dataRequest() !== null;

  /** Stable per-instance id linking the visible caption to the table as its accessible name. */
  protected readonly captionId = `cae-data-grid-caption-${++gridInstanceCounter}`;

  /** Offset of the current page in the full set — anchors `aria-rowindex` (0 when unpaginated). */
  protected readonly pageOffset = computed(() => {
    const size = this.adapter.pageSize();
    return size > 0 ? this.adapter.page() * size : 0;
  });

  /** User-selected rows-per-page (via the {@link pageSizeOptions} menu); null ⇒ follow the {@link pageSize} input. */
  private readonly userPageSize = signal<number | null>(null);
  /** The live rows-per-page: the menu selection once made, else the {@link pageSize} input (#177). */
  protected readonly effectivePageSize = computed(() => this.userPageSize() ?? this.pageSize());

  /**
   * The options actually rendered in the rows-per-page `<select>` (#177): {@link pageSizeOptions} with
   * non-positive and duplicate values dropped (a duplicate would crash the `@for track` with NG0955, and
   * a non-positive size is invalid), and the size **currently in effect always present** — so the control
   * can never display a size the grid is not using (a WCAG 4.1.2 value mismatch) even if the consumer
   * omitted the initial {@link pageSize} from the options. Misconfigurations are also dev-warned.
   */
  protected readonly renderedPageSizes = computed(() => {
    const eff = this.effectivePageSize();
    const seen = new Set<number>();
    const out: number[] = [];
    for (const o of this.pageSizeOptions()) {
      if (o > 0 && !seen.has(o)) {
        seen.add(o);
        out.push(o);
      }
    }
    if (eff > 0 && !seen.has(eff)) out.push(eff);
    return out;
  });

  /**
   * Flips true after the first render so {@link statusText} is born empty — see its note (#194).
   */
  private readonly rendered = signal(false);

  /**
   * Status-region text: {@link loadingMessage} while {@link loading} (an in-flight fetch), else the
   * {@link emptyMessage} when there are no rows, else '' (the live region collapses). Suppressing the
   * empty message during a fetch is what distinguishes *loading* from *empty* (#188).
   *
   * Returns '' until the first render ({@link rendered}): an `aria-live` region only announces *later*
   * mutations, not text present when the region is created, so a status region born already holding
   * "Loading…"/"No data." is silent to a screen reader. Rendering it empty first and the real message
   * on the next CD makes that first message an announced change — covering the server first-load
   * (`[loading]` true on mount) and initial-empty cases (#194).
   */
  protected readonly statusText = computed(() => {
    if (!this.rendered()) return '';
    if (this.loading()) return this.loadingMessage();
    return this.adapter.total() === 0 ? this.emptyMessage() : '';
  });

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
    // Feed the engine whenever data/columns/total change. Two paths, one seam, keyed on the ENGINE (not
    // the [total] input, so mode can never silently disagree with the provider): the client engine gets
    // the raw dataset (it sorts/paginates in-memory, [total] ignored); a server engine (#176) gets only
    // the columns via setData (for header/export) and the fetched page + count via applyServerResult —
    // the neutral half of the lazy-data contract (Book 13 §3.4). The consumer never touches the adapter;
    // binding [data]/[total] is how the fetched slice reaches the grid. A missing server [total] falls
    // back to the page length (dev-warned in validateConfig).
    effect(() => {
      const columns = this.columns();
      const data = this.data();
      const total = this.total();
      if (this.isServerEngine) {
        this.adapter.setData([], columns);
        this.adapter.applyServerResult(data, total ?? data.length);
      } else {
        this.adapter.setData(data, columns);
      }
    });

    // Sync pagination config; a config change (including a rows-per-page menu pick via effectivePageSize,
    // #177) returns to the first page. User Prev/Next call the adapter directly (below) and do not
    // re-trigger this effect (it depends only on the inputs + the menu signal).
    effect(() => {
      const size = this.paginated() ? this.effectivePageSize() : 0;
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

    // The status region must be BORN EMPTY to announce its first message (see statusText, #194); flip
    // the flag after the first render so the initial "Loading…"/"No data." arrives as an announced change.
    afterNextRender(() => this.rendered.set(true));
  }

  /**
   * Dev-only config validation, in `ngOnInit` (before the first render) so a clear cae-data-grid
   * message preempts the framework-internal NG0955 a duplicate column id would otherwise throw in
   * the `@for` track. Zero prod cost. Mirrors `cae-table` (#141).
   */
  ngOnInit(): void {
    if (isDevMode()) this.validateConfig();
  }

  /**
   * Export the engine's dataset as a downloadable {@link Blob} (CSV in v1) — the public passthrough to
   * {@link CaeGridAdapter.exportRows}. The consumer owns the download (e.g. an anchor with
   * `URL.createObjectURL`), so the grid needs no file-system access. **Scope depends on the engine:** a
   * client engine exports the full (all-pages, sorted) set; a **server engine exports only the currently
   * fetched page** (it has not loaded the other pages — a full-fetch server export is a followup, #177).
   */
  exportRows(format: CaeGridExportFormat = 'csv'): Blob {
    return this.adapter.exportRows(format);
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

  /**
   * Rows-per-page menu handler (#177). Sets the live page size (the pagination effect then re-paginates
   * from page 0) and emits {@link pageSizeChange}. No guard needed: the `<select>` is natively
   * `[disabled]` while {@link loading} (so no racing `dataRequest`), and {@link renderedPageSizes} only
   * ever emits positive options, so `el.value` is always a valid size.
   */
  protected onPageSizeChange(el: HTMLSelectElement): void {
    const size = Number(el.value);
    this.userPageSize.set(size);
    this.pageSizeChange.emit(size);
  }

  /** Cycle a column three-state: unsorted/other -> asc -> desc -> unsorted (mat-sort parity). */
  protected toggleSort(col: CaeColumn<T>): void {
    if (!col.sortable || this.loading()) return; // #192: inert while loading (the header is aria-disabled).
    const current = this.adapter.sort();
    let next: CaeSort | null;
    if (!current || current.columnId !== col.id) next = { columnId: col.id, dir: 'asc' };
    else if (current.dir === 'asc') next = { columnId: col.id, dir: 'desc' };
    else next = null;
    this.adapter.sortBy(next);
    this.sortChange.emit(next);
  }

  private readonly prevBtn = viewChild<ElementRef<HTMLButtonElement>>('prevBtn');
  private readonly nextBtn = viewChild<ElementRef<HTMLButtonElement>>('nextBtn');
  private readonly injector = inject(Injector);

  protected prevPage(): void {
    if (this.loading()) return; // #192: inert while loading (the pager is aria-disabled) — no overlapping fetch.
    const pressed = this.prevBtn()?.nativeElement;
    this.adapter.setPage(Math.max(0, this.adapter.page() - 1), this.adapter.pageSize());
    // #189: if this click (with Prev focused) landed on the first page, Prev is about to self-disable and
    // would drop focus to <body>. Hand focus to the still-enabled Next so the user keeps their place.
    if (!this.canPrev() && this.canNext()) this.rescuePagerFocus(pressed, this.nextBtn);
  }

  protected nextPage(): void {
    if (this.loading()) return; // #192: inert while loading (the pager is aria-disabled) — no overlapping fetch.
    const pressed = this.nextBtn()?.nativeElement;
    this.adapter.setPage(this.adapter.page() + 1, this.adapter.pageSize());
    // #189: symmetric — landing on the last page self-disables Next; hand focus to the enabled Prev.
    if (!this.canNext() && this.canPrev()) this.rescuePagerFocus(pressed, this.prevBtn);
  }

  /**
   * Move focus to the still-enabled sibling pager button after the pressed one self-disables at a page
   * boundary (#189) — but **only when the pressed button actually held focus** (a keyboard, or a Blink
   * mouse, activation). If focus was elsewhere — a mouse click in Safari/Firefox, which do **not** focus a
   * clicked `<button>`; a programmatic click; or the user has already Tabbed away — moving it would be an
   * unexpected focus change (WCAG 3.2.x), so we leave it. Deferred to `afterNextRender` because the sibling
   * may still carry the previous page's `disabled` attribute synchronously (the `[disabled]` binding
   * updates in the pending change detection; focusing a disabled element is a no-op) and re-checked there
   * in case focus moved meanwhile; `preventScroll` keeps an off-screen pager from scroll-jumping.
   */
  private rescuePagerFocus(
    pressed: HTMLButtonElement | undefined,
    sibling: () => ElementRef<HTMLButtonElement> | undefined,
  ): void {
    if (!pressed || document.activeElement !== pressed) return;
    afterNextRender(
      () => {
        if (document.activeElement === pressed || document.activeElement === document.body) {
          sibling()?.nativeElement.focus({ preventScroll: true });
        }
      },
      { injector: this.injector },
    );
  }

  /** Dev-only: fail fast on a duplicate column id; warn when the initial sort names an unsortable column. */
  private validateConfig(): void {
    const ids = this.columns().map((c) => c.id);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (dupes.length) {
      throw new Error(
        `cae-data-grid: duplicate column id(s) "${dupes.join('", "')}" — each CaeColumn.id must be unique (it is the @for track key and the sort id).`,
      );
    }
    const active = this.sortActive();
    if (active && !this.columns().some((c) => c.id === active && c.sortable)) {
      console.warn(
        `cae-data-grid: sortActive="${active}" is not a sortable column — the data sorts but no sort header (or aria-sort) renders for it.`,
      );
    }
    const options = this.pageSizeOptions();
    if (this.paginated() && options.length) {
      if (options.some((o) => o <= 0) || new Set(options).size !== options.length) {
        console.warn(
          `cae-data-grid: [pageSizeOptions]=[${options.join(', ')}] should be unique positive integers — duplicate and non-positive values are dropped from the rows-per-page menu.`,
        );
      }
      if (!options.includes(this.pageSize())) {
        console.warn(
          `cae-data-grid: [pageSize]=${this.pageSize()} is not among [pageSizeOptions]=[${options.join(', ')}] — it is added to the menu so the control always matches the grid, but include it (in your preferred order) to avoid the surprise.`,
        );
      }
    }
    // Guard the engine/[total] mismatch so a misconfig fails loudly instead of silently degrading.
    if (this.isServerEngine && this.total() === null) {
      console.warn(
        'cae-data-grid: a server grid engine (provideServerGrid) is active but [total] is unset — the pager and aria-rowcount will report only the fetched page size. Bind [total] to the server row count.',
      );
    } else if (!this.isServerEngine && this.total() !== null) {
      console.warn(
        'cae-data-grid: [total] is set but the client grid engine is active, so [total] is ignored (the client engine derives the total from [data]). Use provideServerGrid() for server-side/lazy data.',
      );
    }
  }
}
