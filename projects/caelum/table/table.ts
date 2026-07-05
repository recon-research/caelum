import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule, SortDirection } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';

/**
 * A column in a {@link CaeTable}. `key` indexes the row object for the displayed value and
 * doubles as the `mat-sort-header` id; `header` is the visible column label; `sortable` opts
 * the column into click/keyboard sorting.
 */
export interface CaeTableColumn {
  /** Property read off each row for this column's cell text, and the column's sort id. */
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
 * are wired into the data source through `effect`s, so the table re-renders when any signal
 * changes. Initial sort is optional (`sortActive`/`sortDirection`).
 *
 * **a11y.** Renders a native `<table>` with Material's row/cell roles; a `sortable` column's
 * header is a `mat-sort-header` (Enter/Space to sort, reflects `aria-sort`). Give the table an
 * accessible name with a visible `caption` (preferred) **or** `ariaLabel` — **not both** (an
 * `aria-label` overrides the `<caption>` as the accessible name, the "label in name" mismatch of
 * the #70 naming seam); prefer the visible caption.
 *
 * **v1 scope** (#141): text columns, sort, client-side pagination. Custom cell templates
 * (p-table `pTemplate` parity), sticky header/columns, expandable rows, row selection, and
 * server-side data are filed follow-ups.
 *
 * Zoneless-compatible: `OnPush` + signal inputs (D-12). No `color` input — theming is free via
 * the token bridge (D-04).
 *
 * @typeParam T - the row shape; defaults to an open record so `key` indexing type-checks.
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
      [attr.aria-label]="ariaLabel() || null"
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

    @if (!data().length) {
      <div class="cae-table__empty">{{ emptyMessage() }}</div>
    }

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
    /* Neutral empty-state hint (token-only): muted text, comfortable padding. */
    .cae-table__empty {
      padding: var(--cae-space-4);
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      text-align: center;
    }
  `,
})
export class CaeTable<T extends Record<string, unknown> = Record<string, unknown>> {
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
  /** Rows per page when {@link paginated}. */
  readonly pageSize = input(10);
  /** Page-size choices offered by the paginator. */
  readonly pageSizeOptions = input<readonly number[]>([5, 10, 25, 50]);

  /** Initial sort column (a column `key`); empty for no initial sort. */
  readonly sortActive = input('');
  /** Initial sort direction for {@link sortActive}. */
  readonly sortDirection = input<SortDirection>('');

  /** The `mat-table` `displayedColumns` — derived from the column config order. */
  protected readonly columnKeys = computed(() => this.columns().map((c) => c.key));

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

  /** Nullish-safe cell text: renders '' (an empty cell) rather than the string "null"/"undefined". */
  protected cellText(row: T, key: string): string {
    const value = row[key];
    return value == null ? '' : String(value);
  }
}
