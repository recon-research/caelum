# Book 10 — Data Tables & Virtualization

> Volume II — Building on Primitives. The single highest-leverage component family for a team leaving PrimeNG (tables rank top of the usage signal, ROADMAP). `MatTable` — a styled skin over the headless `CdkTable` (Book 05 §3.5) — covers the large majority of real tables by composition with `MatSort`, `MatPaginator`, sticky rows/columns, and expandable rows. The defining trap is the **R1 scar**: a table that demos beautifully at fifty rows and falls over at fifty thousand. The cure is a per-screen decision — `MatTable`, `MatTable` + virtual scroll, or the grid adapter — made **by row count and where the data lives**, never by a blanket default.

## 1. TL;DR

A Caelum table is a **`DataSource<T>` plus column definitions**, not a monolithic widget — the `CdkTable` engine (Book 05 §3.5) projects rows from a data source, and `MatTable` adds Material's styling and the `MatSort`/`MatPaginator`/sticky/expandable conveniences on top. Most real tables are a **Compose** of those pieces (brief §3 data rows) and need nothing exotic. The one judgment that must be made consciously per screen is the **R1 scar**: `MatTable` and plain `*ngFor` are fine for *hundreds* of rows and collapse at *tens of thousands*; the fix is `cdk-virtual-scroll` (Book 05 §3.3) when you're rendering a large client-side set, or the **grid adapter** (Book 13's TanStack-behind-an-interface) when you need server-side sort/paginate/filter, grouping, column resize/reorder, virtual rows at scale, or export. The `DataSource` seam is where client-side-vs-server-side is decided — get that right and a table scales; get it wrong and no amount of virtualization saves a query that ships ten thousand rows to the browser. **TreeTable** is `MatTable` over a tree data source — the *data* cousin of Book 09's TreeSelect (same hierarchy, different job: TreeTable displays it, TreeSelect resolves a value from it). And do not confuse the Angular Aria **Grid pattern** (Book 06 §2.2 — a keyboard-interaction model) with a virtualized **data grid** (a rendering/scale problem); they solve different things.

## 2. Conceptual Foundations

### 2.1 A table is a data source + column definitions, not a widget

The mental model that keeps tables sane: the component **projects**, the data source **owns the data**. `CdkTable` (Book 05 §3.5) takes a `DataSource<T>` and a set of column definitions (`matColumnDef` per column: a header cell template + a data cell template) and renders rows by composing those templates. `MatTable` is the same engine with Material's cell styling, sort headers, and sticky support layered on. Three consequences:

- **The column set is data, not markup destiny.** Columns are declared once and the displayed set is a signal/array — show/hide/reorder is a state change, not a template rewrite.
- **The `DataSource<T>` is the real abstraction.** It exposes `connect(): Observable<T[]>` (the rows to render) and `disconnect()` (cleanup). *Where* sorting/paging/filtering happens lives entirely behind this seam (§3.1) — the table doesn't care.
- **Rows are cheap to template, expensive to render in bulk.** The engine will happily render every row you give it; bulk is the R1 problem (§2.2), and it's a *data-source* decision, not a table-config toggle.

### 2.2 The R1 scar — grid-vs-table by row count, per screen

The most important sentence in this book: **decide grid-vs-table by row count, per screen, not as a blanket default** (brief §8). The decision has two axes — *how many rows render* and *where the data lives* — and they pick the tool:

| Scale & ops | Reach for | Why |
|---|---|---|
| Hundreds of rows, client-side sort/page/filter | **`MatTable` + `MatTableDataSource`** | In-memory ops are instant; Material gives sort/paginate/sticky/expandable for free. |
| Thousands rendered at once, client-side | **`MatTable` + `cdk-virtual-scroll`** (Book 05 §3.3) | Render only visible rows; the R1 lever. |
| Tens of thousands, or server-owned data, grouping, col resize/reorder, virtual rows, export | **The grid adapter** (Book 13 — TanStack behind a neutral interface) | `MatTable` isn't built for this; the adapter is the genuine gap (`brief §4`). |

The failure mode this prevents is monoculture in both directions: forcing a 50-row settings table through a heavyweight grid (needless complexity), *or* pointing `MatTable` at a 50,000-row export and watching the tab freeze (the R1 scar). **Where the data lives** is the silent half — virtualizing the render does nothing if the backend already shipped 50k rows over the wire; that case needs a *server-side* data source (§3.1), not just `cdk-virtual-scroll`.

### 2.3 What v22 changed for tables (and what didn't)

`CdkTable`/`MatTable`/`MatSort`/`MatPaginator` and `cdk-virtual-scroll` are **stable, pre-cutoff** APIs — this book asserts their shape directly (the primitives are Book 05's ground). What v22 sharpens is the *reactive* and *performance* envelope, not the table API:

- **Signal-first data sources.** A `DataSource` can expose its stream as a signal (`toSignal`, Book 02 §2.1) so the table participates in OnPush + signal-driven change detection cleanly.
- **Zoneless performance.** Under a zoneless host (Book 01 §3.2), a table's change detection is signal-driven; large tables benefit because CD runs on signal change, not on every async tick — but it also means a data source that mutates outside a signal won't repaint. Wrap rendered state in signals.
- **`track` on row rendering.** Stable identity (`trackBy`/`@for track`) is what makes re-sorting/paging a DOM diff rather than a teardown — non-negotiable for large or frequently-updated tables.

Any concrete version-specific behavior is grounded in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted from memory.

## 3. Architecture & Design

### 3.1 The `DataSource` seam — client-side vs server-side

This is where a table's scalability is won or lost. Two implementations behind the same `connect()`/`disconnect()` contract:

- **Client-side (`MatTableDataSource<T>`).** Holds the full array in memory and sorts/paginates/filters it locally when wired to a `MatSort` and `MatPaginator`. Correct and effortless for *hundreds* of rows; wrong the moment the full set is too big to ship or hold.
- **Server-side (a custom `DataSource`).** `connect()` returns a stream that, on every sort/page/filter change, issues a request for *just that page* and emits the returned rows plus the total count (the paginator's `length`). The component never holds the full dataset. This is the scalable path and the one the R1 decision (§2.2) routes large/server-owned data to.

The discipline: choose the data source from the *data reality*, not the visual. A table that looks identical can be backed by either; picking client-side for server-scale data is the R1 scar wearing a `MatTable` costume. Debounce filter/sort requests, handle the in-flight/error/empty states explicitly (a spinner row, an error row, an empty-state row), and key rendered rows by stable id.

### 3.2 `MatTable` composition — sort, paginate, sticky, expandable

The common-case table is **Compose** (brief §3): `MatTable` plus the conveniences, each a small, documented addition.

- **`MatSort`** — `matSort` on the table + `mat-sort-header` on a column header makes it sortable; pair it with the CDK **`LiveAnnouncer`** (Book 05 §3.2) so a screen reader hears "sorted by name ascending," and set `aria-sort` on the active header. Sorting is a data-source operation (client- or server-side per §3.1), the header is just the trigger.
- **`MatPaginator`** — page size, page index, and total `length`; client-side it slices the in-memory array, server-side it parameterizes the request. **Virtualize *or* paginate the same data, not both** (§3.3).
- **Sticky rows & columns** — `sticky` on header/footer rows and `stickyEnd`/`sticky` on column defs keep headers and key columns visible during scroll; styled through `--cae-*` surface tokens (Book 04 §3.6) so the sticky layer matches the table.
- **Expandable rows** — the detail-row pattern: a second row definition shown when a row is expanded, with `aria-expanded` on the trigger row and the detail row in the accessibility tree. Expansion is view state — keep it in a signal, never in the row's data.

### 3.3 Virtual scroll + tables — the R1 lever, applied

For a large *client-side* set that must render as one continuous scroll (no paginator), wrap the rows in `cdk-virtual-scroll-viewport` (Book 05 §3.3) so only visible rows mount. The realities:

- **Fixed row height is the simple, fast default;** variable/autosize strategies exist but cost more care (Book 05 §3.3's caveat) — a table of uniform rows is the happy path, a table of wildly variable-height rows is where virtualization gets fiddly.
- **Sticky header + virtual scroll** needs the header outside the virtualized viewport (or a sticky strategy that survives recycling) — a classic seam where the header detaches if wired naively.
- **Virtual scroll vs paginator are alternatives, not partners** for the same data: virtual scroll is "render a long list efficiently," paginator is "fetch/show one page." Pick per screen by the R1 axes (§2.2). For *tens of thousands server-side*, virtual scroll over a server-side data source (windowed fetch) or the grid adapter (§3.5) is the path — not `cdk-virtual-scroll` over an array you never should have loaded.

### 3.4 TreeTable — `MatTable` over a tree data source

TreeTable (Build-M, brief §3) is a table whose rows form a hierarchy that expands and collapses: `MatTable` driven by a **tree data source** built on `@angular/cdk/tree` (Book 05 §3.5) for the expansion/level state, with `aria-level`/`aria-expanded`/`role="treegrid"` semantics. It is the **data cousin of Book 09's TreeSelect** (§3.5 there): same hierarchical data and the same `CdkTree` expansion engine, different jobs — **TreeTable displays and navigates the hierarchy in a grid; TreeSelect resolves a value from it into a form**. Build it as a flattened tree (visible nodes as a derived row list) so it still virtualizes (§3.3) when large; the R1 decision applies to a TreeTable exactly as to a flat one. Or, when the advanced grid features are needed, a tree-table mode of the grid adapter (§3.5).

### 3.5 When to reach for the grid adapter — the honest gap

The advanced DataTable is the genuine gap Material doesn't fill (brief §4): **server-side everything, grouping, column resize/reorder, virtual rows at scale, export**. Caelum's answer is a **neutral grid interface with a headless TanStack adapter behind it** — the subject of Book 13 and one of the three Volume III adapters. Named here so the reach is *principled*, not improvised:

- **The line `MatTable` → grid adapter** is drawn by the R1 axes (§2.2) plus feature set: cross the row-count threshold for that screen, or need grouping/resize/reorder/export, and you've left `MatTable`'s lane.
- **The adapter is isolated** — only the adapter file imports the third-party grid (the `no-restricted-imports` rule, brief §8's adapter-erosion scar), and its provenance is vetted on the transitive tree (Book 03). A built table reads `--cae-*` tokens regardless of which engine renders it, so a grid-adapter table and a `MatTable` look like one library (Book 04 §3.6).
- **Not the Aria Grid pattern.** Angular Aria ships a **Grid** *interaction* pattern (Book 06 §2.2) — keyboard navigation and ARIA roles for a grid widget — which is **not** a virtualized data grid and not a substitute for the adapter (Book 06's own honest boundary: "Aria is not a data-grid"). Use Aria Grid for the *keyboard model* of an interactive grid; use the adapter for *scale and features*.

### 3.6 The table-authoring checklist — this book's parity leg

Every Caelum table passes the same gates before it's "done" — the data-table analogue of the control checklist (Book 07 §3.6) and the overlay checklist (Book 09 §3.6):

1. **R1 decision recorded.** The grid-vs-table choice (§2.2) is made and noted *for this screen* by row count + data location — not defaulted.
2. **Data source matches the data reality.** Client-side for small/owned data, server-side for large/remote (§3.1); in-flight/empty/error states rendered.
3. **Stable row identity.** `track`/`trackBy` on rows so sort/page/update is a diff, not a teardown.
4. **A11y.** `role="table"` vs `role="grid"`/`treegrid` by interactivity; `columnheader` + `aria-sort`; `LiveAnnouncer` for sort/page changes (Book 05 §3.2); keyboard navigation for interactive grids; expandable/tree rows expose `aria-expanded`/`aria-level`.
5. **Token-only styling.** Every surface/border/sticky-layer color from `--cae-*` (Book 04 §3.6); density a token operation (Book 04).
6. **Performance profiled, not guessed.** OnPush + signal CD (Book 01 §3.2); large tables profiled at realistic scale (Book 18), not eyeballed at demo size.

Pass these and a table is parity-done at scale; skip gate 1 or 2 and it's the table that ships green and freezes on the first power user's data.

## 4. Implementation

Illustrative, not necessarily compileable.

**A server-side `DataSource`** (fetches one page per sort/page/filter change; the component never holds the full set):

```ts
// projects/forge/src/app/users/users.datasource.ts
import { DataSource } from '@angular/cdk/collections';
import { signal } from '@angular/core';

export class UsersDataSource extends DataSource<User> {
  private readonly rows = signal<User[]>([]);
  readonly total = signal(0);                 // -> MatPaginator.length
  readonly loading = signal(false);

  connect() { return toObservable(this.rows); }   // table renders this stream
  disconnect() {}

  async load(q: { sort: Sort; page: PageEvent; filter: string }) {
    this.loading.set(true);                        // render a spinner row
    const res = await this.api.users(q);           // server does sort/page/filter
    this.rows.set(res.items);                       // signal -> OnPush repaint (Book 01 §3.2)
    this.total.set(res.total);
    this.loading.set(false);
  }
}
// The R1 call (§2.2): this screen is server-owned + large -> server-side source, NOT MatTableDataSource.
```

**A `MatTable` with sort + paginate + sticky + expandable** (the common Compose case):

```html
<table mat-table [dataSource]="ds" matSort (matSortChange)="reload()" trackBy="trackById">
  <ng-container matColumnDef="name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>   <!-- LiveAnnouncer + aria-sort -->
    <td mat-cell *matCellDef="let u">{{ u.name }}</td>
  </ng-container>
  <!-- sticky header row; a detail row toggled by expanded() signal, exposing aria-expanded -->
  <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
  <tr mat-row *matRowDef="let u; columns: cols" (click)="toggle(u)" [attr.aria-expanded]="isOpen(u)"></tr>
</table>
<mat-paginator [length]="ds.total()" [pageSize]="25" (page)="reload()" />
<!-- surfaces/sticky layer read --cae-* tokens (Book 04 §3.6); rows tracked by id (gate 3) -->
```

**Virtual scroll for a large client-side set** (render only visible rows; no paginator — the R1 lever):

```html
<!-- choose virtual scroll OR paginator, never both for the same data (§3.3) -->
<cdk-virtual-scroll-viewport itemSize="48" class="users-viewport">
  <table mat-table [dataSource]="visibleRows()">… fixed 48px rows (§3.3 fixed-height happy path) …</table>
</cdk-virtual-scroll-viewport>
```

**A TreeTable data source** (flattened tree so it still virtualizes; the data cousin of Book 09's TreeSelect):

```ts
// MatTable over @angular/cdk/tree expansion (Book 05 §3.5); role="treegrid", aria-level per row.
private readonly visible = computed(() =>
  flatten(this.roots(), this.expanded()));    // expansion is VIEW state (a signal), never row data
// TreeTable DISPLAYS the hierarchy; TreeSelect (Book 09 §3.5) RESOLVES a value from the same shape.
```

## 5. Bleeding Edge

Version-specific points live in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted from memory:

- **Signal-based data sources.** Expressing `DataSource` streams as signals (`toSignal`, Book 02 §2.1) aligns tables with zoneless OnPush CD and is the forward-looking shape for new tables; watch for first-party signal-native table ergonomics.
- **Virtual-scroll autosize maturity.** Variable-height virtual scrolling remains the rough edge (Book 05 §3.3); for now, fixed-row-height is the reliable default and variable height earns a dedicated test fixture.
- **The grid adapter is a Volume III commitment.** The advanced-grid gap is real and deferred to Book 13 (TanStack behind a neutral interface) with provenance sign-off at M2 — don't pre-adopt a grid library here; reach for it through the adapter when the R1 line is crossed.

## 6. Gaps & Opportunities

- **No first-party advanced data grid.** `MatTable` deliberately stops at the common case; server-side grouping/resize/reorder/virtual-rows/export is the adapter's job (Book 13), not something to bolt onto `MatTable`.
- **Virtual scroll + sticky header + variable row height** is the historically under-tested seam — a shared virtualized-table fixture (header survival, recycle correctness, scroll-restore) beats per-screen reinvention.
- **TreeTable is Build-M and owns its tests** — the flatten/expand/virtualize interaction (and `treegrid` a11y) is where it's easy to look right and announce wrong; verify with axe + keyboard + SR (Book 16).
- **The R1 decision has no automatic enforcer** — it's a per-screen judgment; a lightweight "rows expected at p95?" note in the component's ticket is the cheapest guard against the demo-size trap.

## 7. AI & Claude Code Integration

High-multiplier on the scaffolding: column definitions, the `DataSource` boilerplate (client and server variants), the `MatSort`/`MatPaginator` wiring, the expandable-row and TreeTable flatten logic are pattern-stable and fast to generate consistently. The ~1× judgment that must stay human-verified is exactly the R1 surface — **the grid-vs-table decision (row count *and* where the data lives), server-side data-source correctness (debounce, total count, in-flight/error/empty states), the virtual-scroll edge cases (sticky header survival, variable height), and the sort/page screen-reader announcements**. These are silent at demo scale: an agent will cheerfully back a 50,000-row screen with `MatTableDataSource` and it will pass every test on the 20-row fixture, then freeze in production. The correct division: let the agent build the table and the *realistic-scale* performance fixture (Book 18) and the a11y fixture (Book 16), then verify the R1 decision and run the table at p95 row count yourself. "Renders the sample data" is the trap that looks done.

## 8. Exercises & Further Reading

**Exercises**

1. Build a `MatTable` of ~200 client-side rows with `MatSort`, `MatPaginator`, a sticky header, and expandable detail rows; confirm sorting announces via `LiveAnnouncer` and sets `aria-sort`, and that expansion state lives in a signal, not the row data.
2. Replace the client-side source with a **server-side `DataSource`** that fetches one page per sort/page/filter change, emits the total count to the paginator, debounces the filter, and renders explicit loading/empty/error rows — and show the component never holds the full dataset.
3. Take a 30,000-row client-side list and make it scroll smoothly with `cdk-virtual-scroll` at a fixed row height; then argue in two sentences why this screen should *or should not* instead be server-side (the R1 decision).
4. Build a TreeTable on `@angular/cdk/tree` with `role="treegrid"` and `aria-level`/`aria-expanded` per row, flattened so it virtualizes; contrast in writing how it differs in job from Book 09's TreeSelect over the same data.
5. Write the R1 decision for three real screens (a settings table, an audit-log viewer, a 100k-row export grid) — name the tool (`MatTable` / `MatTable`+virtual / grid adapter) and the reason (row count + data location) for each.

**Further reading**

- Angular Material — [Table (`MatTable`)](https://material.angular.io/components/table/overview) · [Sort](https://material.angular.io/components/sort/overview) · [Paginator](https://material.angular.io/components/paginator/overview)
- Angular CDK — [Table (`CdkTable`)](https://material.angular.io/cdk/table/overview) · [Scrolling / virtual scroll](https://material.angular.io/cdk/scrolling/overview) · [Tree (`CdkTree`)](https://material.angular.io/cdk/tree/overview)
- TanStack — [Table (headless)](https://tanstack.com/table/latest) — the advanced-grid candidate (vetted at M2; behind the adapter, Book 13)
- In-library: Book 05 §3.5 (the `CdkTable`/`CdkTree` engines `MatTable`/TreeTable skin), §3.3 (`cdk-virtual-scroll` — the R1 lever), §3.2 (`LiveAnnouncer` for sort/page announcements); Book 04 §3.6 (token-only table surfaces + density); Book 01 §3.2 (OnPush + signal CD for tables at scale); Book 02 §2.1 (`toSignal` for signal data sources); Book 06 §2.2 (the Aria Grid *pattern* is not a data grid) & §3.1 (the reach-for ladder); Book 09 §3.5 (TreeSelect, the form-control cousin of TreeTable); Book 03 (provenance for any grid library); Book 13 (the data-grid adapter — the advanced-grid gap); Book 16 (a11y/parity verification); Book 18 (performance & grid-at-scale profiling).
