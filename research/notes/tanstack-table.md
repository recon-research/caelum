# TanStack Table for the Caelum data-grid adapter — version & provenance specifics

> reviewed: 2026-06-30 · tier legend: production-proven | published | experimental

TanStack Table is the endorsed candidate behind Caelum's data-grid adapter (`docs/ARCHITECTURE.md` **D-07**). This note grounds the version-specific, frontier claims in **Book 13** (Data Grid Adapter) — what the library actually *is* (a headless, render-nothing engine), its concrete API surface, and its license + transitive-dependency + origin profile against **D-10** (US-origin, full transitive tree). The adapter *pattern* is settled architecture (Book 12, written from stable knowledge); only the TanStack-specific lines below are web-sourced. Per D-07, the **final transitive-provenance and origin sign-off defers to M2** — this note supplies the evidence the M2 sign-off will weigh, it does not discharge it.

## State of the art

### Package, version & license

- `@tanstack/table-core` is at **8.21.3**, **MIT**-licensed, with **zero runtime dependencies** (the registry `latest` record lists no `dependencies` field) [published] (source: https://registry.npmjs.org/@tanstack/table-core/latest, accessed 2026-06-30)
- `@tanstack/angular-table` is at **8.21.4**, **MIT**-licensed; its runtime dependencies are exactly `tslib ^2.6.2` and `@tanstack/table-core` pinned to the **exact** version `8.21.3`; it peers on `@angular/core: ">=17"` [published] (source: https://registry.npmjs.org/@tanstack/angular-table/latest, accessed 2026-06-30)
- The project is maintained by **TanStack** (Tanner Linsley); the repository ships official adapters for **React, Vue, Solid, Svelte, Angular, and Lit** and is MIT-licensed [published] (source: https://github.com/TanStack/table, accessed 2026-06-30)

### Headless architecture — renders nothing, you own the markup

- "Headless UI" is defined as delivering "the logic, state, processing and API for UI elements" while explicitly **not** providing "markup, styles, or pre-built implementations" [published] (source: https://raw.githubusercontent.com/TanStack/table/main/docs/introduction.md, accessed 2026-06-30)
- "TanStack Table is headless. This means that it doesn't render any DOM elements" — the developer supplies the markup and styles [published] (source: https://raw.githubusercontent.com/TanStack/table/main/docs/overview.md, accessed 2026-06-30)
- The documented headless trade-offs: pros — "Full control over markup and styles", "Supports all styling patterns (CSS, CSS-in-JS, UI libraries, etc)", "Smaller bundle-sizes", "Portable. Run anywhere JS runs!"; cons — "More setup required" and "No markup, styles or themes provided" [published] (source: https://raw.githubusercontent.com/TanStack/table/main/docs/introduction.md, accessed 2026-06-30)

### Core API surface

- The building blocks are: **Column Definitions** (objects configuring columns, their data accessors and display templates), the **Table Instance** ("The core table object containing both state and API"), **Row Models**, **Table State**, and the core structures **Rows, Columns, Header Groups, Headers, and Cells**, each exposing its own API [published] (source: https://raw.githubusercontent.com/TanStack/table/main/docs/overview.md, accessed 2026-06-30)
- Behaviour is composed from **row-model functions** — `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getPaginationRowModel`, `getGroupedRowModel`, `getExpandedRowModel` — wired into the table instance per feature used [published] (source: https://raw.githubusercontent.com/TanStack/table/main/docs/overview.md, accessed 2026-06-30)
- The library is **framework-agnostic at the core**: `table-core` holds the state/logic and the API "remains consistent across frameworks", while thin per-framework adapters provide the integration [published] (source: https://raw.githubusercontent.com/TanStack/table/main/docs/overview.md, accessed 2026-06-30)
- The feature surface advertised by the docs includes sorting, filtering, faceting, grouping, aggregation, expansion, row selection, column sizing, pinning, visibility, ordering, and pagination as opt-in row models [published] (source: https://tanstack.com/table/latest/docs/introduction, accessed 2026-06-30 — *via search summary; the page 403'd to direct fetch, see Caveats*)

### The Angular adapter (`@tanstack/angular-table`)

- The Angular adapter "manages state the **Angular signals way**", **re-exports** all of `@tanstack/table-core`'s APIs, and accepts an options function (or a computed returning options) and returns a table instance [published] (source: https://tanstack.com/table/v8/docs/framework/angular/angular-table, accessed 2026-06-30 — *via search summary; see Caveats*)
- For cell/header/footer rendering it provides a **`FlexRenderDirective`** that "is reactive and runs into an injection context, allowing you to inject services or make use of signals", plus an **`injectFlexRenderContext`** function to read the cell context [published] (source: https://tanstack.com/table/v8/docs/framework/angular/angular-table, accessed 2026-06-30 — *via search summary; see Caveats*)
- The package's `>=17` `@angular/core` peer means Caelum's **Angular 22** stack satisfies it without a version conflict [published] (source: https://registry.npmjs.org/@tanstack/angular-table/latest, accessed 2026-06-30)

### Provenance & transitive-dep profile (D-10)

- The **entire runtime transitive tree** of `@tanstack/angular-table` is: `@tanstack/table-core` (MIT, zero deps) + `tslib` + the already-in-stack `@angular/core` peer — an exceptionally small surface for the D-10 transitive-tree obligation [published] (source: https://registry.npmjs.org/@tanstack/angular-table/latest, accessed 2026-06-30)
- `tslib` is at **2.8.1**, **0BSD**-licensed (a permissive license), has **zero dependencies**, and lists **"Microsoft Corp."** as author — i.e. US-origin [published] (source: https://registry.npmjs.org/tslib/latest, accessed 2026-06-30)
- Net: two non-`@angular` runtime packages, both permissive (MIT, 0BSD), both zero-dependency, both US-maintained (TanStack / Microsoft) — clean against D-10 on the evidence here, **pending the M2 sign-off** (origin-of-entity and acquisition-risk are compliance judgments, not registry lookups; D-07/D-10).

## Caveats & confidence (read before citing the lines above)

These are honest gaps this pass flagged — do **not** harden them into Book 13 as settled:

- **`tanstack.com` docs SPA blocks direct fetch (HTTP 403).** The headless definition and the core-concepts list were taken from the **repository's raw markdown** (`docs/introduction.md`, `docs/overview.md`) — solid, primary, and quoted. But the **Angular-adapter specifics** (`FlexRenderDirective`, `injectFlexRenderContext`, "signals way", re-export) and the **full opt-in feature list** came from a **search summary** of the rendered doc pages, not a direct fetch. Treat the exact Angular entry-point function name (the rendered docs use a `create…`/`inject…`-style factory whose exact spelling this pass did not confirm) and the precise per-feature opt-in toggles as **needing a rendered re-read of the v8 Angular docs** before they go into code.
- **Version is the v8 line** (`table-core` 8.21.3 / `angular-table` 8.21.4) as of this fetch. Re-check the **major** before pinning at M2 — a headless library's adapter surface is exactly the kind of thing that shifts across a major.
- **"Zero dependencies" is by absence-of-`dependencies`-field** on the registry `latest` record, corroborated by the headless/portable design claim — not by a walked `npm ls`. Confirm with an actual `npm ls` + license scan at install (the M2 / M0-2-style provenance slice).
- **"US-origin" is a maintaining-entity judgment, not a lookup.** The registry confirms the *license*; GitHub confirms the *org/maintainer* (TanStack / Tanner Linsley). Neither is a corporate-HQ filing or an acquisition-risk assessment — D-10's origin test is signed off by a human at **M2** (Book 03 §3.1), this note only assembles the evidence.

## Caelum feasibility path

Against Caelum's stack and the ARCHITECTURE invariants:

- **D-07 holds on the evidence.** TanStack is headless (renders no DOM), MIT, and presents a two-package, two-permissive-license, zero-dep, US-maintained runtime tree — the cleanest adapter candidate against D-10 the project could ask for, pending the M2 origin sign-off. This is the evidence behind keeping D-07's TanStack direction.
- **Headless is exactly what the adapter pattern wants.** Book 12 §3.5 requires the foreign render path to stay inside the `--cae-*` token bridge; because TanStack renders nothing, `grid.adapter.ts` drives the engine and *Caelum* renders the cells with Material-styled, token-reading markup — there is no vendor stylesheet to override (Book 04 §3.6). A library that shipped its own opinionated CSS would be a worse candidate; this one is ideal by construction.
- **Signal-first aligns with the zoneless invariant.** The Angular adapter is signal-based and injection-context-aware, consistent with Caelum's OnPush + signal-driven-CD direction (the platform note's invariant candidate; `notes/angular-22-platform.md`). **Open design question for Book 13 / M2:** depend on `@tanstack/table-core` *directly* inside `grid.adapter.ts` (framework-agnostic, zero-dep, drive it with Caelum's own signals) versus take the `@tanstack/angular-table` wrapper and its `FlexRender` render layer. The former is a *thinner* tree and keeps rendering wholly in Caelum's hands; the latter is less code but couples the render path to a vendor directive — a thin-vs-thick adapter call (Book 12 §5). Surface it, don't pre-decide it.
- **The neutral interface + fallback are already designed.** `CaeGridAdapter` / `CAE_GRID` / `provideCaelumGrid()` (Book 12 §4) map `CaeColumn<T>` → the vendor `ColumnDef` and read the row models back into a `viewRows` signal; the `MatTable` + `cdk-virtual-scroll` fallback (brief §4) satisfies the same token behind the same provider, and the `MatTable`→grid line is drawn at Book 10 §3.5.

## Candidate experiments

Each a one-line pre-registration seed (hypothesis · metric · baseline); file as `EXP-NN` via `run_experiment` when M2 reaches them:

- **EXP — headless render through the token bridge.** Hypothesis: a `cae-data-grid` backed by TanStack renders sort/filter/paginate with cells styled *only* by `--cae-*`. Metric: 0 hardcoded color/space literals + axe 0 violations + the rendered DOM is Caelum's markup, not a vendor stylesheet. Baseline: the `MatTable` fallback adapter.
- **EXP — core-only vs the angular-table wrapper.** Hypothesis: building `grid.adapter.ts` on `@tanstack/table-core` directly is competitive with using `@tanstack/angular-table` + `FlexRender`. Metric: adapter LOC + added bundle size + signal-CD correctness under zoneless. Baseline: the `angular-table`/`FlexRender` path.
- **EXP — transitive provenance scan.** Hypothesis: the installed grid tree is fully permissive + US-origin. Metric: count of non-permissive licenses and flagged-origin packages from `npm ls @tanstack/angular-table` + a license scan (target 0/0; expect `{MIT table-core, 0BSD tslib}`). Baseline: the bare `@angular/*` install (the platform note's EXP — transitive provenance scan).

## Watch

- `https://registry.npmjs.org/@tanstack/angular-table` and `https://registry.npmjs.org/@tanstack/table-core` — version bumps, the exact `table-core` pin moving, and the `@angular/core` peer floor.
- `https://github.com/TanStack/table/releases` — a new major / breaking adapter change before Caelum pins at M2.
- The **rendered** `https://tanstack.com/table/v8/docs/framework/angular/angular-table` — confirm the Angular entry-point factory name and the `FlexRenderDirective` / `injectFlexRenderContext` surface directly (this pass got them via search summary; the SPA 403'd to fetch).
- ~180-day re-verify due by **~2026-12-27**; re-verify the headless, transitive-tree, and license lines first — they are what ground D-07.
