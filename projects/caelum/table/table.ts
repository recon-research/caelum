import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  isDevMode,
  OnInit,
  viewChild,
} from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import type { CaeSortDirection } from 'caelum/shared';

/**
 * A column in a {@link CaeTable}. `key` indexes the row object for the displayed value and
 * doubles as the `mat-sort-header` id; `header` is the visible column label; `sortable` opts
 * the column into click/keyboard sorting.
 */
export interface CaeTableColumn {
  /**
   * A **flat** property name read off each row for this column's cell text, and the column's sort
   * id. Dot paths (p-table `field="user.name"`) are not resolved in v1 — a nested key renders a
   * blank cell and sorts as a no-op; flatten the row or use a future value-accessor hook (#143).
   */
  key: string;
  /** Visible header-cell label. */
  header: string;
  /** When `true`, the header becomes a `mat-sort-header` (keyboard-operable, `aria-sort`). */
  sortable?: boolean;
}

/**
 * `cae-table` — a **declarative, config-driven** data table composed over Material's
 * `mat-table` + `matSort` + `mat-paginator` (`reference/COMPARISON.md`: `p-table` → `cae-table`;
 * the team's #1 dependence — ROADMAP R7). The first M1 *composed* slice for tables (#141).
 *
 * Material's `mat-table` is powerful but **not** drop-in: it needs a `matColumnDef` +
 * `matHeaderCellDef` + `matCellDef` block per column plus manual `MatSort`/`MatPaginator`
 * wiring. `cae-table` collapses that into two inputs — a `columns` config array and a `data`
 * array — and renders the column defs with `@for`, so the common p-table case (text columns,
 * client-side sort + pagination) needs zero table boilerplate:
 *
 * ```html
 * <cae-table caption="Team roster" [columns]="cols" [data]="rows" paginated />
 * ```
 *
 * **Sort + pagination are client-side via `MatTableDataSource`** (reach-for ladder D-13 — use
 * Material's own facility rather than hand-rolling comparators/slicing). `data`/`sort`/`paginator`
 * are wired into the data source through `effect`s, so the rendered rows track `data()` and the
 * live sort. Sort and page size are **initial values**: after mount the header and the paginator's
 * page-size menu own the live sort/page state (a programmatic `sortDirection`/`pageSize` change
 * updates the control but is not re-applied, so it never overrides the user's own choice on a data
 * refresh — dynamic programmatic control is out of v1 scope).
 *
 * **a11y.** Renders a native `<table>` with Material's row/cell roles; a `sortable` column's
 * header is a `mat-sort-header` (Enter/Space to sort, reflects `aria-sort`). Give the table an
 * accessible name with a visible `caption` (preferred) **or** `ariaLabel` — **not both**: setting
 * both keeps the caption as the accessible name (the `aria-label` is suppressed when a caption is
 * present, avoiding the "label in name" mismatch of the #70 naming seam). The empty state is a
 * persistent `role="status"` live region so a filter-to-empty transition is announced. Known
 * limitation (M4 real-browser a11y, #41 family): MatPaginator does not announce the new range on a
 * page change, and its control cluster is not named to the table.
 *
 * **v1 scope** (#141): text columns, sort, client-side pagination. Follow-ups: custom cell
 * templates (p-table `pTemplate` parity) **#143**; sticky / expandable / row-selection **#144**;
 * server-side/lazy data, global filter, column resize/reorder **#145**.
 *
 * Zoneless-compatible: `OnPush` + signal inputs (D-12). No `color` input — theming is free via
 * the token bridge (D-04).
 *
 * @typeParam T - the row shape. **Unconstrained** so a plain typed interface works: a declared
 * `interface Member { name: string }` is NOT assignable to `Record<string, unknown>` (interfaces
 * lack an implicit index signature), so a `T extends Record<string, unknown>` constraint would
 * reject the common typed-row case at the template. Indexing is confined to `cellText`, which casts.
 */
@Component({
  selector: 'cae-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTableModule, MatSortModule, MatPaginatorModule],
  template: `
    <table
      mat-table
      matSort
      [dataSource]="dataSource"
      [matSortActive]="sortActive()"
      [matSortDirection]="sortDirection()"
      [attr.aria-label]="(caption() ? null : ariaLabel()) || null"
    >
      @if (caption()) {
        <caption>
          {{
            caption()
          }}
        </caption>
      }

      @for (col of columns(); track col.key) {
        <ng-container [matColumnDef]="col.key">
          @if (col.sortable) {
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ col.header }}</th>
          } @else {
            <th mat-header-cell *matHeaderCellDef>{{ col.header }}</th>
          }
          <td mat-cell *matCellDef="let row">{{ cellText(row, col.key) }}</td>
        </ng-container>
      }

      <tr mat-header-row *matHeaderRowDef="columnKeys()"></tr>
      <tr mat-row *matRowDef="let row; columns: columnKeys()"></tr>
    </table>

    <!-- Persistent live region (always mounted, text varies) so a data-becomes-empty transition is
         ANNOUNCED (WCAG 4.1.3). A region stamped together with its text via @if is commonly not
         announced (the Forge convention); here the text goes '' -> emptyMessage on the transition.
         :empty hides it (no padded strip) while rows are present. -->
    <div class="cae-table__empty" role="status" aria-live="polite">{{ emptyText() }}</div>

    @if (paginated()) {
      <mat-paginator [pageSize]="pageSize()" [pageSizeOptions]="pageSizeOptions()"></mat-paginator>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    table {
      width: 100%;
    }
    /* Neutral empty-state hint (token-only): muted text, comfortable padding. currentColor fallback
       inherits the themed on-surface text (legible in light + dark) when the token is unresolved. */
    .cae-table__empty {
      padding: var(--cae-space-4);
      color: var(--mat-sys-on-surface-variant, currentColor);
      text-align: center;
    }
    /* When rows are present emptyText() is '', so the region collapses (no padded strip). */
    .cae-table__empty:empty {
      display: none;
    }
  `,
})
export class CaeTable<T = Record<string, unknown>> implements OnInit {
  /** Column definitions, in display order. */
  readonly columns = input.required<readonly CaeTableColumn[]>();
  /** Row data. Copied into the internal `MatTableDataSource` whenever it changes. */
  readonly data = input.required<readonly T[]>();

  /** Visible `<caption>` and the table's accessible name. Prefer this over {@link ariaLabel}. */
  readonly caption = input('');
  /** Accessible name when there is no visible {@link caption}. Do not set both. */
  readonly ariaLabel = input('');
  /** Message shown when `data` is empty. */
  readonly emptyMessage = input('No data.');

  /** Opt into a client-side paginator below the table. */
  readonly paginated = input(false, { transform: booleanAttribute });
  /**
   * **Initial** rows per page. After mount the user owns the live page size via the paginator's
   * page-size menu; a later programmatic change is not re-applied (it would override that choice on
   * a data refresh). {@link pageSizeOptions} is genuinely reactive.
   */
  readonly pageSize = input(10);
  /** Page-size choices offered by the paginator (reactive). */
  readonly pageSizeOptions = input<readonly number[]>([5, 10, 25, 50]);

  /** Initial sort column (a column `key`); empty for no initial sort. */
  readonly sortActive = input('');
  /** Initial sort direction for {@link sortActive} (after mount the header owns the live sort). */
  readonly sortDirection = input<CaeSortDirection>('');

  /** The `mat-table` `displayedColumns` — derived from the column config order. */
  protected readonly columnKeys = computed(() => this.columns().map((c) => c.key));

  /** Empty-state text: '' when there are rows (so the live region collapses), else the message. */
  protected readonly emptyText = computed(() => (this.data().length ? '' : this.emptyMessage()));

  /** Client-side data source; sort + pagination are wired into it by the effects below. */
  protected readonly dataSource = new MatTableDataSource<T>([]);

  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  constructor() {
    // Keep the data source in sync with the signal inputs. MatTableDataSource re-renders on any
    // of data/sort/paginator changing, so ordering between these effects doesn't matter.
    effect(() => {
      this.dataSource.data = [...this.data()];
    });
    effect(() => {
      this.dataSource.sort = this.sort() ?? null;
    });
    effect(() => {
      this.dataSource.paginator = this.paginator() ?? null;
    });
  }

  /**
   * Dev-only config validation. In `ngOnInit` (not an effect) so it runs BEFORE the first template
   * render — a clear cae-table message then preempts the framework-internal crash a duplicate column
   * key would otherwise cause (Angular NG0955 in the `@for` track, or MatTable's duplicate-column
   * error). Zero prod cost. Required inputs are already set by `ngOnInit`.
   */
  ngOnInit(): void {
    if (isDevMode()) this.validateConfig();
  }

  /** Nullish-safe cell text: renders '' (an empty cell) rather than the string "null"/"undefined". */
  protected cellText(row: T, key: string): string {
    // Guard a null/undefined row (a malformed data source that violates the declared `T[]`) so one
    // bad row does not throw and take down the whole table.
    const value = row == null ? undefined : (row as Record<string, unknown>)[key];
    return value == null ? '' : String(value);
  }

  /** Dev-only: fail fast (clear message) on a duplicate column key; warn on a non-sortable sort. */
  private validateConfig(): void {
    const keys = this.columns().map((c) => c.key);
    const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    if (dupes.length) {
      throw new Error(
        `cae-table: duplicate column key(s) "${dupes.join('", "')}" — each CaeTableColumn.key must be unique (it is the matColumnDef id, the @for track key, and the sort id).`,
      );
    }
    const active = this.sortActive();
    if (active && !this.columns().some((c) => c.key === active && c.sortable)) {
      console.warn(
        `cae-table: sortActive="${active}" is not a sortable column — the data sorts but no sort header (or aria-sort) renders for it.`,
      );
    }
  }
}
