# Book 13 — Data Grid Adapter

> Volume III, Book 2 — the first *concrete* adapter. Book 12 set the pattern in the abstract: a neutral, app-owned interface; the single adapter file that is the only code permitted to import the foreign package; the ESLint rule that defends that membrane; DI swappability; and the token-themed render path. This book applies that pattern, unchanged, to the first of the three genuine gaps — the **advanced data grid**, the gap Book 10 §3.5 drew the line at. The engine is **TanStack Table** (headless, MIT); its concrete version, API surface, and transitive-dependency/origin profile are frontier and are grounded in [`research/notes/tanstack-table.md`](../../research/notes/tanstack-table.md) — cited as a research note, never as a `Book §`, because that layer is web-sourced and stales. It implements `docs/ARCHITECTURE.md` **D-07**; the final transitive-provenance and origin sign-off defers to **M2**.

## 1. TL;DR

The advanced data grid is the gap `MatTable` cannot fill (Book 10 §3.5): **server-side everything, grouping/aggregation, column resize/reorder, virtual rows at scale, and export** — the features past the row-count line the R1 scar draws (Book 10 §2.2). The gap is an *engine*, not a widget, so it sits on the bottom rung of the ladder (Book 12 §2.1) and gets the adapter treatment exactly as written: a **neutral `CaeGridAdapter` interface** in Caelum's vocabulary (`cae-data-grid`, signal IO, `CaeColumn<T>` — no vendor type leaks, Book 12 §3.1); a **single `grid.adapter.ts`** that is the only file in the library importing `@tanstack/*`, fenced by the ESLint `no-restricted-imports` rule (Book 12 §3.2–§3.3, R6); **DI swap** via `CAE_GRID` + `provideCaelumGrid()` (Book 12 §3.4); and a `MatTable` + `cdk-virtual-scroll` **fallback** satisfying the same token (brief §4; Book 10 §3.1/§3.3). The choice of TanStack is what makes the render path clean: it is **headless — it renders no DOM** (research note), so Caelum draws every cell itself with `--cae-*` Material markup (Book 04 §3.6) and the foreign engine never imposes a stylesheet. Provenance is unusually clean — a two-package, two-permissive-license, zero-dependency, US-maintained runtime tree (research note) — but the sign-off is a human compliance call at **M2** (Book 03 §3.1), not settled here.

## 2. Conceptual Foundations

### 2.1 The shape of the gap — what `MatTable` can't do

Book 10 §3.5 named the line and §2.2 gave its axis: a screen leaves `MatTable`'s lane when it crosses the R1 row-count threshold *or* needs a feature `MatTable` doesn't have. The grid gap is the union of five such features (`brief §4`): **server-side data** (sort/page/group/filter computed remotely, the full set never in the client), **grouping and aggregation**, **column resize / reorder / pin**, **virtual rows at scale** (tens of thousands), and **export**. Each one alone might be coaxed onto `MatTable`; together they are a *subsystem*. Re-implementing that subsystem on raw CDK — a column-virtualization engine, a grouping/aggregation state machine, a server-side request lifecycle — is a project in itself and would still be worse than an existing, battle-tested library (Book 12 §2.1). This is precisely the "missing *engine*, not missing *widget*" case the bottom rung exists for. The discipline of Book 12 §2.1 applies: take the dependency only because the ladder is genuinely exhausted here, not because a grid library is convenient.

### 2.2 Why a *headless* engine is the right shape

The adapter pattern wants the foreign render path to stay inside the token bridge (Book 12 §3.5), and the cleanest way to guarantee that is to choose an engine that renders nothing. TanStack Table is **headless** — per its own docs it "doesn't render any DOM elements" and provides only "the logic, state, processing and API," leaving "full control over markup and styles" to the developer (research note). That is the ideal adapter shape: behavior comes *in* (row models, sort/filter/group/page state, the column model), markup stays *ours*. A "batteries-included" grid that ships its own opinionated stylesheet would be a strictly worse candidate — every visual would be a fight against vendor CSS, and the token-only invariant (D-04) would be violated visually even with no literal hardcoded in Caelum's files (Book 12 §3.5). Headless inverts that: there is no vendor stylesheet to override because there is no vendor render at all.

### 2.3 The neutral interface is the contract — and the swap insurance

The interface is written in Caelum's vocabulary (`CaeColumn<T>`, `CaeSort`, `CaeRowGroup`) and must pass Book 12 §3.1's neutrality test: **satisfiable two ways** — by TanStack *and* by the documented `MatTable` fallback — without changing a signature. That two-way test is not academic here. The grid is the **highest provenance-risk dependency of the three** (the largest surface, the most attractive acquisition target), so the swap-is-one-file payoff (Book 12 §2.3) is most valuable exactly at this gap: if TanStack ever fails re-vetting or is acquired by a non-US entity (D-10), Caelum rewrites one adapter against the same `CaeGridAdapter` interface and no `cae-data-grid` call site moves. Designing the interface vendor-free *first* is what buys that insurance; a `ColumnDef` leaked across the boundary would forfeit it.

## 3. Architecture & Design

The method is Book 12's, instantiated. §3.1 designs the vendor-free interface; §3.2 is the single membrane; §3.3 renders the cells through the token bridge; §3.4 handles server-side data; §3.5 the hierarchy modes; §3.6 wires DI + the fallback + export and gives the checklist.

### 3.1 The neutral grid interface — designed vendor-free

Before any `npm install`, write the interface as if TanStack did not exist (Book 12 §3.1). The column is a Caelum type — an `id`, a `header`, a `value` accessor `(row: T) => …`, and optional `sortable` / `group` / `align` / `width` — never a vendor `ColumnDef`. Sort, grouping, paging, and expansion are Caelum-typed state (`CaeSort`, `CaeRowGroup`, `CaeGridState`). The adapter port is an abstract class used as a DI token, exposing `setData`, a signal-valued `viewRows` (the rendered slice), and the operations `sortBy` / `groupBy` / `setPage`, plus a server-side data hook (§3.4) and `exportRows` (§3.6). The rule that keeps it real: **no method accepts or returns a vendor object.** Apply the two-way test to each member — if you cannot imagine implementing `groupBy` on `MatTable` with the same signature, a TanStack concept has leaked and must be re-expressed as a Caelum type the adapter maps.

### 3.2 The single adapter file — `grid.adapter.ts` as the only membrane

Exactly one file imports `@tanstack/*` (Book 12 §3.2). `grid.adapter.ts` maps `CaeColumn<T>[]` to the vendor's column definitions, composes the vendor's **opt-in row-model functions** — `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getPaginationRowModel`, `getGroupedRowModel`, `getExpandedRowModel` (research note) — drives the engine, and reads the resulting rows back into the `viewRows` signal. Vendor types live *only* inside this file; everything above it (the `cae-data-grid` component, the Forge screen, the consuming app) sees only `CaeGridAdapter` and could not name TanStack if it tried. The membrane is held mechanically by the ESLint `no-restricted-imports` rule scoping `@tanstack/*` to this one path (Book 12 §3.3) — the defense against adapter erosion (R6), the failure mode where the first "just this once" direct import dissolves the guarantee.

### 3.3 Rendering the cells — Caelum owns the markup, tokens own the look

Because the engine is headless (§2.2), the `cae-data-grid` template renders the table DOM itself, styled by `--cae-*` Material tokens only (Book 04 §3.6) — the adapter supplies *data*, the component supplies *markup*. Virtual rows at scale use `cdk-virtual-scroll` (Book 05 §3.3) exactly as Book 10 §3.3 applies it: the adapter feeds a windowed slice into `viewRows`, the component renders the visible rows, and the sticky header lives outside the virtualized viewport (Book 10 §3.3's seam). One design fork lives here — the **thin-vs-thick** choice (Book 12 §5): render the cells with Caelum's own template, or adopt TanStack's framework adapter and its render directive (research note). Caelum's default is to **own the render** — it keeps the swap honest (the fallback renders the same way) and keeps the visible DOM inside the token bridge by construction; the wrapper's render layer is adopted only if its signal integration proves load-bearing (§5).

### 3.4 Server-side everything — the `DataSource` seam meets the adapter

The grid's server-side mode reuses Book 10 §3.1's seam: the adapter does **not** hold the full set. A sort, page, group, or filter change becomes a *request*, and the results stream back into `viewRows`. The engine's "manual" mode hands those state changes out rather than computing them client-side (the manual sorting/pagination flags — *exact spelling to verify against the v8 docs, per the research note's caveat*), so Caelum issues the fetch. The neutral interface keeps this vendor-free: a `CaeGridDataRequest` output (the sort/page/group/filter the server must honour) and an `applyServerResult` input, so the consuming app's data layer never imports TanStack and the same server-side contract is satisfiable by the `MatTable` fallback. This is the seam that keeps a hundred-thousand-row grid from ever loading a hundred thousand rows into the browser (Book 10 §3.3's warning).

### 3.5 Grouping, expansion & TreeTable — one engine, the hierarchy modes

Grouping/aggregation and row expansion ride the vendor's grouped/expanded row models (§3.2) behind neutral `CaeRowGroup` / expansion state — the app sees groups and expanded rows, never the vendor's grouping internals. The **TreeTable** (Book 10 §3.4) generalizes into a grid-adapter mode for large hierarchies: the same flattened-visible-rows idea (a derived row list that still virtualizes) now driven by the grid engine instead of hand-rolled `MatTable` + `CdkTree`, with `role="treegrid"`, `aria-level`, and `aria-expanded` exposed through the neutral surface. One engine covers flat grids, grouped grids, and tree grids; the consuming app picks the mode through Caelum-typed state, not a vendor flag.

### 3.6 DI wiring, the fallback, export — and the checklist

The interface crosses into components by DI (Book 12 §3.4): `CAE_GRID` is an `InjectionToken`, `provideCaelumGrid()` provides the concrete adapter (the `provide*()` shape Caelum already uses for overlay defaults, Book 09 §3.1), and `cae-data-grid` injects the **abstraction**. The **fallback** — a `MatGridAdapter` on `MatTable` + `cdk-virtual-scroll` (brief §4) — satisfies the same token, so tests bind the light adapter, the demo can run the fallback while production runs TanStack, and a library that fails M2 sign-off has a working escape hatch already wired. **Export** (CSV is cheap; styled Excel/PDF is heavier — §6) is defined *on `CaeGridAdapter`* over the neutral row model, so the fallback can export too and export is never a second vendor lock-in (Book 03's "don't add the dependency" still governs any export library).

The grid-adapter checklist — Book 12 §3.6's six legs, made concrete (and mirroring Book 10 §3.6's table checklist):

1. **Neutral interface, vendor-free** — no `ColumnDef`/table instance crosses the surface; every member passes the two-way test (§3.1).
2. **Single membrane + ESLint** — only `grid.adapter.ts` imports `@tanstack/*`, and the `no-restricted-imports` rule is present and CI-enforced (§3.2; R6).
3. **DI-swappable, fallback exists** — `CAE_GRID` token, `provideCaelumGrid()`, and a working `MatGridAdapter` against the same signature (§3.6; Book 12 §3.4).
4. **Token-themed render** — cells read `--cae-*` only; no vendor stylesheet (headless makes this free, §3.3; Book 04 §3.6).
5. **Server-side seam honoured** — large/remote data goes through the request/result contract, never a full client load (§3.4; Book 10 §3.1).
6. **A11y through the neutral surface** — `role="grid"`/`treegrid`, `aria-sort`, keyboard navigation, `LiveAnnouncer` for sort/page changes (Book 05 §3.2; Book 06 §2.2 supplies the keyboard *model*, not the data engine — Book 10 §3.5's boundary); the adapter fills any gap the engine leaves (Book 16).
7. **Provenance signed at M2** — the library *and its transitive tree* clear Book 03's gate (research note assembles the evidence; Book 03 §3.2/§3.4; D-10).

## 4. Implementation

Illustrative pseudo-code (Angular 22, signal-first, `OnPush`) — shapes, not a compileable repo. TanStack specifics are kept to the surface the research note verified; the exact framework-adapter entry point is marked there as needing a rendered-docs re-read.

**(a) The neutral, app-owned interface — no vendor types (§3.1).**

```ts
// cae-grid.types.ts
export interface CaeColumn<T> {
  readonly id: string;
  readonly header: string;
  readonly value: (row: T) => string | number;
  readonly sortable?: boolean;
  readonly group?: boolean;
  readonly align?: 'start' | 'end';
}
export interface CaeSort { readonly columnId: string; readonly dir: 'asc' | 'desc'; }
export interface CaeRow<T> { readonly id: string; readonly data: T; readonly level?: number; }
export interface CaeGridDataRequest {        // what the server must honour (server-side mode, §3.4)
  readonly sort?: CaeSort; readonly page: number; readonly pageSize: number;
  readonly groupBy?: readonly string[];
}

export abstract class CaeGridAdapter<T = unknown> {           // the port (used as a DI token)
  abstract setData(rows: readonly T[], columns: CaeColumn<T>[]): void;
  abstract readonly viewRows: Signal<readonly CaeRow<T>[]>;   // the windowed slice, signal-driven
  abstract sortBy(sort: CaeSort): void;
  abstract groupBy(columnIds: readonly string[]): void;
  abstract setPage(page: number, size: number): void;
  abstract readonly dataRequest: Signal<CaeGridDataRequest | null>;  // server-side seam
  abstract applyServerResult(rows: readonly T[], total: number): void;
  abstract exportRows(format: 'csv'): Blob;
}
```

**(b) DI wiring — provide the concrete adapter behind the token (§3.6).**

```ts
// cae-grid.providers.ts
export const CAE_GRID = new InjectionToken<CaeGridAdapter>('CaeGridAdapter');
export function provideCaelumGrid(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CAE_GRID, useClass: TanStackGridAdapter }]);
}
// swap to the fallback by changing one line: useClass: MatGridAdapter
```

**(c) The neutral component — injects the ABSTRACTION, renders token-styled cells (§3.2, §3.3).**

```ts
@Component({
  selector: 'cae-data-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cdk-virtual-scroll-viewport class="cae-grid" itemSize="48">   <!-- virtual rows, Book 05 §3.3 -->
      <table>
        <tr *cdkVirtualFor="let r of adapter.viewRows()" [attr.data-row-id]="r.id"
            [attr.aria-level]="r.level">
          @for (c of columns(); track c.id) {
            <td class="cae-grid__cell" [class.cae-grid__cell--end]="c.align === 'end'">
              {{ c.value(r.data) }}                              <!-- design = tokens only, Book 04 §3.6 -->
            </td>
          }
        </tr>
      </table>
    </cdk-virtual-scroll-viewport>`,
})
export class CaeDataGrid<T> {
  protected adapter = inject(CAE_GRID);                // depends on the interface, not TanStack
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<CaeColumn<T>[]>();
  readonly sortChange = output<CaeSort>();
  readonly dataRequest = output<CaeGridDataRequest>();
  constructor() {
    effect(() => this.adapter.setData(this.rows(), this.columns()));
    effect(() => { const req = this.adapter.dataRequest(); if (req) this.dataRequest.emit(req); });
  }
}
```

**(d) The single adapter file — the ONLY place the library is imported (§3.2, §3.3).**

```ts
// grid.adapter.ts
import { /* createTable, getCoreRowModel, getSortedRowModel, getGroupedRowModel, … */ }
  from '@tanstack/table-core';                          // ← the one sanctioned import (zero-dep core, research note)
export class TanStackGridAdapter<T> implements CaeGridAdapter<T> {
  readonly viewRows = signal<readonly CaeRow<T>[]>([]);  // template reads back via a signal (zoneless-safe, Book 01 §3.2)
  readonly dataRequest = signal<CaeGridDataRequest | null>(null);
  setData(rows: readonly T[], columns: CaeColumn<T>[]) { /* map CaeColumn<T> → vendor ColumnDef; build the table */ }
  sortBy(sort: CaeSort) { /* set the vendor sort state, recompute the sorted row model, push into viewRows */ }
  groupBy(ids: readonly string[]) { /* drive the grouped/expanded row models */ }
  setPage(page: number, size: number) { /* manual pagination → emit a CaeGridDataRequest for server-side */ }
  applyServerResult(rows: readonly T[], total: number) { /* feed a server page back into viewRows */ }
  exportRows(_f: 'csv') { return new Blob(); /* serialize the neutral row model, no vendor export lock-in */ }
  // vendor types live ONLY in this file; nothing above the membrane can name them.
}
```

**(e) The fallback sketch — same interface, no TanStack (§3.6).**

```ts
// mat-grid.adapter.ts — satisfies CaeGridAdapter on MatTable + cdk-virtual-scroll (brief §4); imports NO @tanstack/*.
export class MatGridAdapter<T> implements CaeGridAdapter<T> { /* the documented two-way proof of neutrality (§2.3) */ }
```

The ESLint rule from Book 12 §3.3 closes the loop: any file *other* than `grid.adapter.ts` that writes `import … from '@tanstack/…'` fails the build with the rule's message. Above the membrane, nothing in Caelum knows TanStack exists — which is what makes the provenance audit one file (Book 12 §2.3) and the swap to `MatGridAdapter` a one-line provider change (§3.6).

## 5. Bleeding Edge

The settled-enough-to-teach frontier for the grid adapter is three tensions — and all version-specific TanStack facts here are grounded in `research/notes/tanstack-table.md`, not asserted from memory:

- **`table-core` directly vs the `angular-table` wrapper.** The thin-vs-thick fork (Book 12 §5) has a concrete first instance here. `@tanstack/table-core` is framework-agnostic and zero-dependency (research note); depending on it directly inside `grid.adapter.ts` and driving it with Caelum's own signals keeps the runtime tree minimal and the render wholly in Caelum's hands. The `@tanstack/angular-table` wrapper adds `tslib` + a signal-integrated render directive (research note) — less code, but it couples the render path to a vendor directive and widens the tree. **Caelum's default is core-direct**; the wrapper is adopted only if its signal integration proves load-bearing. The exact Angular entry-point factory name is flagged in the research note as needing a rendered-docs confirmation before it goes into code.
- **Zoneless and the headless engine.** A headless engine computes synchronously in JS — no DOM mutation, no zone coupling — so it is friendly to a zoneless host by construction (Book 01 §3.2). The adapter's only obligation is to land every state change the template reads into **signals** (the `viewRows` / `dataRequest` signals in §4) so change detection fires; high-frequency scroll/resize callbacks may run via `NgZone.runOutsideAngular` — the one safe `NgZone` use (Book 01 §3.2) — with results marshaled back into signals. SSR/hydration of a grid is the live edge: render client-only behind a server placeholder until the data and viewport exist (Book 12 §5).
- **Grid-at-scale performance is the real frontier.** Virtual *rows* (`cdk-virtual-scroll`), column virtualization, and server-side windowing operating together is where the grid earns its complexity — and where it must be **profiled at realistic scale, not eyeballed at demo size** (Book 18; Book 10 §3.6's gate 6). Column virtualization in particular is the piece the `MatTable` fallback may not match (§6) — an honest parity gap to record, not paper over.

## 6. Gaps & Opportunities

- **Export fidelity.** CSV is a serialization of the neutral row model (cheap, fallback-capable). Styled **Excel/PDF** export is heavier and tempts a second dependency — which must clear Book 03's admit/reject gate and D-10 like any other (Book 12 §6's "don't add the dependency for a small need"). Keep export a neutral `CaeGridAdapter` capability; add a vendor only if the styled-export need is real and vetted.
- **Fallback parity is a floor, not a match.** The `MatGridAdapter` proves the interface is neutral (§2.3) and gives a provenance escape hatch, but it will not match TanStack on column virtualization or large-scale grouping. That is an honest capability-ledger entry (Book 16), not a defect to hide: the fallback is the floor that keeps the app working, not feature parity.
- **`add_adapter`, instantiated.** This book is the template the derived `add_adapter` skill (Book 12 §6) scaffolds — neutral interface + `grid.adapter.ts` + the ESLint override + `provideCaelumGrid()` + the `MatGridAdapter` stub, all in one PR (R6: the isolation rule ships *with* the adapter, never "later"). Books 14 (charts) and 15 (editor) follow this same shape.
- The grid adapter is authored here; its M2 prototype-in-isolation and provenance sign-off, and the adoption-time guidance, land later (ROADMAP M2; Book 20). For the live status of what's covered vs open, read `MANIFEST.json` `coverage_gaps` (single-homed there).

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on grid-adapter work:

- **Scaffolding the whole adapter from the gap spec.** Given "Book 13 = data grid on TanStack behind a neutral interface," an agent reliably emits the §3.6 skeleton — neutral interface, `grid.adapter.ts`, the ESLint override, the provider, and the `MatGridAdapter` fallback stub — because the pattern is mechanical and Books 12–13 encode it. Mapping `CaeColumn<T>` → the vendor `ColumnDef` is likewise mechanical.
- **Catching erosion in review.** Grepping a diff for any new `import … from '@tanstack/…'` outside `grid.adapter.ts` is a reliable adapter-erosion lens (R6); the agent also confirms the ESLint rule is present and still names exactly one file.
- **Grounding every version claim in the research note.** The agent must route TanStack API/version/provenance questions through `research/notes/tanstack-table.md` — never assert the TanStack surface from training memory (it is frontier; the note flags what is verified vs search-summary, and stales ~180 days).

Where it is only ~1× and must defer to a human:

- **Whether *this screen* has crossed the line.** The `MatTable`→grid decision is the per-screen R1 judgment (Book 10 §2.2) — an architecture call the human keeps; reaching for the grid by default is the over-engineering failure the adapter's restraint guards against (Book 12 §2.1).
- **The final provenance sign-off.** TanStack's origin and acquisition risk are a compliance judgment, not a registry lookup (Book 03 §3.1; D-10); the agent assembles the evidence (the research note), the human signs at **M2**.
- **The thin-vs-thick depth call** for a fast-moving vendor — a risk judgment about future churn (§5) the agent shouldn't fake.

## 8. Exercises & Further Reading

**Exercises:**
1. Write the `CaeGridAdapter` interface and prove it neutral by sketching **both** a `TanStackGridAdapter` and a `MatGridAdapter` against the same signature — without naming a vendor type in the interface (§2.3, §3.1; Book 12 §3.1).
2. Add the ESLint `no-restricted-imports` rule for `@tanstack/*` scoped to `grid.adapter.ts`; add a second import elsewhere and confirm the build fails with the rule's message (§3.2; Book 12 §3.3; R6).
3. Run a **server-side drill**: drive sort + page as `CaeGridDataRequest` emissions and feed pages back via `applyServerResult`, holding zero full sets in memory (§3.4; Book 10 §3.1).
4. Run `npm ls @tanstack/angular-table` + a license scan and write the one-paragraph D-10 verdict — name every runtime package and its license (expect `{MIT table-core, 0BSD tslib}`), citing the research note's profile and flagging what defers to M2 (Book 03 §3.2; research note).
5. Run a **swap drill**: replace `MatGridAdapter` with `TanStackGridAdapter` behind the same `CAE_GRID` token; confirm not one `cae-data-grid` call site changes (§3.6; Book 12 §3.4).

**Further reading:** the version/provenance grounding for everything TanStack in this book is [`research/notes/tanstack-table.md`](../../research/notes/tanstack-table.md) (a research note — web-sourced and staling, **not** a `Book §`); TanStack Table's headless documentation at [`tanstack.com/table`](https://tanstack.com/table/latest) as the canonical render-it-yourself grid. In this library: Book 12 (the adapter pattern this book instantiates — the membrane §3.2, the ESLint rule §3.3, the DI swap §3.4, the token-themed render §3.5, the checklist §3.6), Book 10 §3.5 (the grid-vs-table line that creates this gap) and §2.2/§3.1/§3.3/§3.4 (the R1 axis, the server-side `DataSource` seam, virtual scroll, TreeTable), Book 03 §3.2/§3.4 (the transitive-tree provenance gate the M2 sign-off runs), Book 04 §3.6 (theming the render path), Book 05 §3.2/§3.3 (`LiveAnnouncer`, virtual scroll), Book 06 §2.2 (the Aria Grid keyboard model, distinct from the data engine), Book 09 §3.1 (the `provide*()` precedent), Book 01 §3.2 (zoneless + signal CD); and forward to Book 14 (Charts Adapter), Book 15 (Rich-Text Editor Adapter), Book 16 (Accessibility & Parity Verification — the capability ledger this adapter's parity gap is recorded in), Book 18 (Performance & Bundle Budgets — grid-at-scale profiling), and Book 20 (Migration & Adoption).
