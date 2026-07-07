import { NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  effect,
  input,
  isDevMode,
  model,
  OnInit,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import type { CaeSortDirection } from 'caelum/shared';
import { CaeCellContext, CaeCellDef } from './cell-def';

/**
 * A column in a {@link CaeTable}. `key` indexes the row object for the displayed value and
 * doubles as the `mat-sort-header` id; `header` is the visible column label; `sortable` opts
 * the column into click/keyboard sorting.
 */
export interface CaeTableColumn {
  /**
   * A **flat** property name read off each row for this column's cell text, and the column's sort
   * id. Dot paths (p-table `field="user.name"`) are not resolved — a nested key renders a blank
   * default cell and sorts as a no-op. To *render* a nested value, project a `caeCellDef` template
   * (the row is in scope: `{{ row.user.name }}`); sorting on a nested field still needs a flattened
   * key (or a future value-accessor hook).
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
 * **Custom cell content** (#143): per-cell body-content parity with p-table `pTemplate="body"` —
 * project an `<ng-template caeCellDef="<column-key>">` per column to render a badge/button/formatted
 * value instead of text, with the {@link CaeCellContext} (`$implicit` = row, `value`, page-relative
 * `index`, absolute `absoluteIndex`) in scope. The library still owns the `<tr>`/`<td>` structure so
 * the table's a11y semantics are preserved — this customizes cell *content*, not the row/cell wrapper
 * (full-row templating is out of v1 scope). Columns without a template keep the zero-boilerplate text
 * default. See {@link CaeCellDef}.
 *
 * **Row selection** (#144): set `selectionMode="multiple"` to prepend a checkbox column with a
 * select-all header, and bind `[(selection)]` for the selected rows as a **vendor-neutral `T[]`**
 * (or `(selectionChange)` to observe) — no Material `SelectionModel` in the public API. Selection is
 * by **reference identity** (a `[data]` refresh with new object instances drops it; a stable-identity
 * `dataKey` is a follow-up). Give each row checkbox a semantic accessible name via
 * {@link rowSelectionLabel}. Single-select (radio) is a #144 follow-up.
 *
 * **v1 scope** (#141): text columns, sort, client-side pagination, custom body-cell templates (#143,
 * with a page-relative + absolute row index, #213), multi-select (#144). Follow-ups: sticky /
 * expandable-rows / single-select **#144**; server-side/lazy data, global filter, column
 * resize/reorder **#145**. Header/footer/full-row templating is a future enhancement (not yet requested).
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
  imports: [MatTableModule, MatSortModule, MatPaginatorModule, MatCheckboxModule, NgTemplateOutlet],
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

      @if (selectionMode() !== 'none') {
        <ng-container [matColumnDef]="selectColumnKey">
          <th mat-header-cell *matHeaderCellDef class="cae-table__select-cell">
            <!-- disabledInteractive: on empty data the select-all is aria-disabled (announced
                 unavailable) but stays focusable, so an external data-clear never strands keyboard
                 focus to <body> — the pager's #189/#192 focus-preservation convention. -->
            <mat-checkbox
              [checked]="allSelected()"
              [indeterminate]="someSelected()"
              [disabled]="!data().length"
              disabledInteractive
              (change)="toggleAll()"
              [aria-label]="selectAllLabel()"
            ></mat-checkbox>
          </th>
          <td mat-cell *matCellDef="let row; let i = index" class="cae-table__select-cell">
            <mat-checkbox
              [checked]="isSelected(row)"
              (change)="toggleRow(row)"
              [aria-label]="rowSelectionLabel()(row, i)"
            ></mat-checkbox>
          </td>
        </ng-container>
      }

      @for (col of columns(); track col.key) {
        <ng-container [matColumnDef]="col.key">
          @if (col.sortable) {
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ col.header }}</th>
          } @else {
            <th mat-header-cell *matHeaderCellDef>{{ col.header }}</th>
          }
          <td mat-cell *matCellDef="let row; let i = index">
            @if (cellTemplates().get(col.key); as tpl) {
              <ng-container
                [ngTemplateOutlet]="tpl"
                [ngTemplateOutletContext]="{
                  $implicit: row,
                  value: cellValue(row, col.key),
                  index: i,
                  absoluteIndex: pageOffset() + i,
                }"
              ></ng-container>
            } @else {
              {{ cellText(row, col.key) }}
            }
          </td>
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
    /* Selection column: shrink to the checkbox (the width:1% shrink trick, matching the table's
       own width:100% literal — no width token exists). */
    .cae-table__select-cell {
      width: 1%;
      padding-inline-end: var(--cae-space-2);
      white-space: nowrap;
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

  /**
   * Row-selection mode. `'multiple'` prepends a checkbox column with a select-all header checkbox;
   * `'none'` (default) renders no selection column. Single-select (radio) is a #144 follow-up.
   */
  readonly selectionMode = input<'none' | 'multiple'>('none');
  /**
   * Two-way selected rows, a **vendor-neutral `T[]`** (not a Material `SelectionModel`). Selection is
   * by **reference identity** — a row is selected iff the same object instance is in this array — so a
   * `[data]` refresh yielding new instances drops the visual selection (a stable-identity `dataKey` is
   * a #144 follow-up). Bind `[(selection)]` for two-way, or `(selectionChange)` to observe.
   *
   * **Select-all scope**: the header checkbox selects **all bound rows, across every page** (p-table's
   * default; a page-only option — cf. p-table `selectionPageOnly` — is a follow-up). A future
   * `selectionMode="single"` keeps this **same `readonly T[]` shape** (a 0- or 1-length array), not a
   * bare `T`, so the binding type stays stable across modes.
   */
  readonly selection = model<readonly T[]>([]);
  /**
   * Accessible name for a row's selection checkbox — supply a semantic label (e.g. the row's name).
   * The default is the **1-based position within the current page** (`index` is page-relative and
   * post-sort, exactly like {@link CaeCellContext.index} — this callback is not given an absolute
   * index), so with pagination the default names **repeat across pages** and shift under a sort — a
   * poor default. Prefer a semantic, row-derived name (as Forge does); note that a name built from a
   * row's position in your own `data()` is the *unsorted* index and will not match a `caeCellDef`
   * cell's live {@link CaeCellContext.absoluteIndex} once a sort or page change is in play.
   */
  readonly rowSelectionLabel = input<(row: T, index: number) => string>(
    (_row, i) => `Select row ${i + 1}`,
  );
  /** Accessible name for the select-all header checkbox (`'multiple'` mode). */
  readonly selectAllLabel = input('Select all rows');

  /** The reserved `matColumnDef` id for the selection column — kept out of the consumer's key space. */
  protected readonly selectColumnKey = '__caeSelect';

  /**
   * The `mat-table` `displayedColumns` — the column config order, with the selection column prepended
   * in a selectable mode.
   */
  protected readonly columnKeys = computed(() => {
    const keys = this.columns().map((c) => c.key);
    return this.selectionMode() === 'none' ? keys : [this.selectColumnKey, ...keys];
  });

  /** O(1) selection membership derived from the two-way {@link selection} model. */
  private readonly selectedSet = computed(() => new Set<T>(this.selection()));

  /** Whether a row is currently selected (by reference). Drives its checkbox `checked` state. */
  protected isSelected(row: T): boolean {
    return this.selectedSet().has(row);
  }
  /** True when every row in `data()` (across all pages, not just the visible page) is selected — the select-all `checked` state. */
  protected readonly allSelected = computed(() => {
    const data = this.data();
    const set = this.selectedSet();
    return data.length > 0 && data.every((r) => set.has(r));
  });
  /** True when some but not all rows in `data()` (across all pages) are selected — the select-all `indeterminate` state. */
  protected readonly someSelected = computed(() => {
    if (this.allSelected()) return false;
    const set = this.selectedSet();
    return this.data().some((r) => set.has(r));
  });

  /** Toggle one row in/out of the selection (updates the two-way {@link selection} model). */
  protected toggleRow(row: T): void {
    const cur = this.selection();
    this.selection.set(cur.includes(row) ? cur.filter((r) => r !== row) : [...cur, row]);
  }
  /** Select every row in `data()` (across all pages), or clear the selection if all are already selected. */
  protected toggleAll(): void {
    this.selection.set(this.allSelected() ? [] : [...this.data()]);
  }

  /**
   * Custom cell renderers projected as `<ng-template caeCellDef="<key>">` content (#143). Captured
   * as content children; {@link cellTemplates} indexes them by column key so a templated column
   * renders the template and the rest keep the text default.
   */
  private readonly cellDefs = contentChildren(CaeCellDef);

  /** Column key → its custom cell {@link CaeCellDef} template (empty when none are projected). */
  protected readonly cellTemplates = computed(() => {
    const map = new Map<string, TemplateRef<CaeCellContext<T>>>();
    for (const def of this.cellDefs()) map.set(def.caeCellDef(), def.template);
    return map;
  });

  /**
   * The client paginator's live page offset (`pageIndex * pageSize`), feeding
   * {@link CaeCellContext.absoluteIndex} (#213). Recomputed on every data-source render emission (see
   * the constructor effect), so it follows the user's real page, the page-size *menu*, and the data
   * source's internal page clamp — not the initial inputs. Like the rendered slice, it does NOT follow
   * a post-mount `[pageSize]` **input** change (that neither re-slices the rows nor re-emits, per the
   * initial-only page-size contract), so the offset and the rows stay consistent. Stays 0 when
   * unpaginated (a single page, where the absolute index equals the page-relative one).
   */
  protected readonly pageOffset = signal(0);

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

    // Track the paginator's live page offset (pageIndex * pageSize) so a caeCellDef template can
    // render an ABSOLUTE row index across pages (CaeCellContext.absoluteIndex, #213). Recomputed on
    // every render emission of the data source — which merges paginator.page AND the data source's
    // OWN _internalPageChanges. The latter is essential: when a [data] shrink strands a later page,
    // MatTableDataSource clamps pageIndex via _internalPageChanges WITHOUT emitting paginator.page, so
    // a page-only subscription would leave the offset stale on the re-rendered rows. Reading the render
    // stream (not the paginator.page event) catches the clamp too; the signal write then schedules CD
    // so the rendered absoluteIndex updates. No paginator (unpaginated) -> offset stays 0 ->
    // absoluteIndex === index. (A plain method/computed reading the paginator is NOT equivalent — a
    // computed would memoize on the paginator's signal identity and miss its mutable pageIndex, and a
    // plain read would lose this signal-write CD trigger on the clamp; the explicit signal is load-bearing.)
    effect((onCleanup) => {
      const paginator = this.paginator();
      const update = () =>
        this.pageOffset.set(paginator ? paginator.pageIndex * paginator.pageSize : 0);
      update();
      const sub = this.dataSource.connect().subscribe(update);
      onCleanup(() => sub.unsubscribe());
    });

    // Dev-only: warn on a caeCellDef that is a typo (matches no column → silently ignored) or a
    // duplicate (two templates for one column → the last silently wins). An effect (not
    // validateConfig/ngOnInit) because content children resolve only after ngAfterContentInit;
    // reactive so it catches a later columns/template change. Zero prod cost.
    if (isDevMode()) {
      effect(() => {
        const columns = this.columns();
        // Skip while columns is still empty — a common `[columns]="cols()"` async-load window where
        // every caeCellDef would transiently "match no column" though the config is correct and
        // resolves a tick later; warning then would only train consumers to ignore the warning.
        if (columns.length === 0) return;
        const keys = new Set(columns.map((c) => c.key));
        const seen = new Set<string>();
        for (const def of this.cellDefs()) {
          const key = def.caeCellDef();
          if (!keys.has(key)) {
            console.warn(
              `cae-table: <ng-template caeCellDef="${key}"> matches no column key — the template is ignored (check the key against your columns config).`,
            );
          } else if (seen.has(key)) {
            console.warn(
              `cae-table: duplicate <ng-template caeCellDef="${key}"> — the last one wins and the earlier template(s) are ignored (one caeCellDef per column key).`,
            );
          } else {
            seen.add(key);
          }
        }
      });
    }
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

  /**
   * The raw cell value (`row[key]`) for a column — passed to a {@link CaeCellDef} template as
   * `value` and used by {@link cellText}. Nullish-safe against a malformed row (a `null`/`undefined`
   * datum that violates the declared `T[]`), so this accessor never throws and the text default
   * renders `''`. NOTE: this guard covers only `value`/the text path — the template context also
   * hands over the **raw** row as `$implicit`, so a consumer template that dereferences a null datum
   * (`{{ row.x }}`) can still throw; guarding the row is the consumer's responsibility.
   */
  protected cellValue(row: T, key: string): unknown {
    return row == null ? undefined : (row as Record<string, unknown>)[key];
  }

  /** Nullish-safe cell text: renders '' (an empty cell) rather than the string "null"/"undefined". */
  protected cellText(row: T, key: string): string {
    const value = this.cellValue(row, key);
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
    if (this.selectionMode() !== 'none' && keys.includes(this.selectColumnKey)) {
      throw new Error(
        `cae-table: a column uses the reserved selection key "${this.selectColumnKey}" — rename it (this id is used internally for the selection checkbox column when selectionMode is set).`,
      );
    }
  }
}
