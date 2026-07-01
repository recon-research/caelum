# Charts for Caelum — visx, D3, and the render-it-yourself path

> reviewed: 2026-06-30 · tier legend: production-proven | published | experimental

Charts are the gap Angular Material fills **not at all** — there is no first-party charting, so the charts adapter (`docs/ARCHITECTURE.md` **D-08**) is a pure third-party case. This note grounds **Book 14** (Charts Adapter) and supplies the evidence for the **M2** charts sign-off. Its central, load-bearing finding: **D-08 endorsed _visx_, but visx is React-bound** (a hard `react` peer dependency), so it cannot be consumed by an Angular library — the render-it-yourself approach for Caelum runs on **D3's framework-agnostic modules directly**. Charts are **deferred for the build** (the team is not using charts yet; ROADMAP M3/cut order), so this is written to *inform* the eventual M2 decision, not to force it now. The adapter *pattern* is settled (Book 12); only the library-specific lines below are web-sourced.

## State of the art

### visx (Airbnb) — low-level viz primitives, but for React

- `@visx/shape` is at **4.0.0**, **MIT**-licensed, and declares a **hard React peer dependency**: `react: "^18.0.0 || ^19.0.0"` (and `@types/react`) [published] (source: https://registry.npmjs.org/@visx/shape/latest, accessed 2026-06-30)
- `@visx/scale` is at **4.0.0**, **MIT**, and depends on `@visx/vendor` (visx's bundling of the underlying d3 modules) [published] (source: https://registry.npmjs.org/@visx/scale/latest, accessed 2026-06-30)
- visx describes itself as "a collection of reusable low-level visualization components" and states it "combines the power of d3 to generate your visualization with the benefits of **react** for updating the DOM" — "Under the hood, visx is using d3 for the calculations and math" [published] (source: https://raw.githubusercontent.com/airbnb/visx/master/README.md, accessed 2026-06-30)
- visx is "largely unopinionated and is meant to be built upon" — pick the packages you need, bring your own styling/state [published] (source: https://raw.githubusercontent.com/airbnb/visx/master/README.md, accessed 2026-06-30)
- visx is maintained by **Airbnb** (US; author `@hshoff`), repository `github.com/airbnb/visx` [published] (source: https://registry.npmjs.org/@visx/shape/latest, accessed 2026-06-30)

### D3 — the framework-agnostic headless engine underneath

- `d3-scale` is at **4.0.2**, **ISC**-licensed (a permissive, OSI-approved license), authored by **Mike Bostock**, with **no React dependency and no peer dependencies**; it depends only on other d3 modules (`d3-array`, `d3-format`, `d3-interpolate`, `d3-time`, `d3-time-format`) [published] (source: https://registry.npmjs.org/d3-scale/latest, accessed 2026-06-30)
- `d3-shape` is at **3.2.0**, **ISC**, authored by Mike Bostock, depends only on `d3-path`, has **no React dependency**, and provides "Graphical primitives for visualization, such as lines and areas" — the arc/line/area/pie **generators** that turn data into SVG path strings [published] (source: https://registry.npmjs.org/d3-shape/latest, accessed 2026-06-30)
- D3 "works with any framework or vanilla JavaScript," whereas "Visx is specifically designed for React" — visx is "d3 without the learning curve" for React teams, but the math it wraps is D3's and is framework-neutral [published] (source: https://medium.com/react-courses/react-charts-built-on-d3-what-should-you-pick-rechart-visx-niv-react-vi-or-victory-adc64406caa1, accessed 2026-06-30; corroborated: https://github.com/airbnb/visx)

### The render-it-yourself pattern (D3 math + *your* DOM)

- The pattern both visx and a hand-rolled Angular chart use is the same: **D3 computes the geometry** (scales map data→pixels via `d3-scale`; generators produce path strings via `d3-shape`/`d3-arc`/`d3-line`) and **the framework renders the SVG** (React for visx; Angular's template for Caelum). D3's scale/shape modules emit numbers and path `d` strings — they touch no DOM and impose no styling [published] (source: https://registry.npmjs.org/d3-shape/latest, accessed 2026-06-30; corroborated: https://raw.githubusercontent.com/airbnb/visx/master/README.md)

## Caveats & confidence (read before citing the lines above)

- **The React peer dependency is the decisive fact for D-08 and it is firmly sourced** (the npm `latest` record for `@visx/shape`). visx packages that render (`@visx/shape`, `@visx/axis`, `@visx/group`, …) all carry the React peer; the *non-rendering* math packages (`@visx/scale`, `@visx/vendor`) are just re-exports/bundles of d3 and add nothing over depending on d3 directly. So "use visx in Angular" is not a smaller-print caveat — it is structurally not available.
- **The full d3 transitive tree was not walked.** `d3-scale` and `d3-shape` were fetched directly (both ISC/Bostock); their dependencies (`d3-array`/`d3-format`/`d3-interpolate`/`d3-time`/`d3-time-format`/`d3-path`) are part of the same d3 project and are ISC by convention, but each package's license was **not individually fetched** here — that is the M2 `npm ls` + license-scan job, not settled by this note.
- **Versions are a snapshot** (`@visx/*` 4.0.0; `d3-scale` 4.0.2; `d3-shape` 3.2.0) as of this fetch. D3 modules are mature and slow-moving, but re-check before pinning at M2.
- **"Airbnb / Mike Bostock = US-origin" is a maintaining-entity judgment, not a lookup.** The registry confirms licenses (MIT for visx, ISC for d3) and the repos; origin/acquisition-risk sign-off is a human compliance call at M2 (Book 03 §3.1; D-10).

## Caelum feasibility path

Against Caelum's stack and the invariants — and this is the note's main message for the M2 charts decision:

- **D-08 needs a refinement, not a reversal.** D-08 endorsed the *visx approach* — render-it-yourself, low-level viz primitives over D3 — and that approach is exactly right for the token-bridge constraint. But the *package* visx is React-only, so the **Angular instantiation of the D-08 approach is to depend on D3's framework-agnostic modules directly** (`d3-scale` for scales, `d3-shape`/`d3-arc`/`d3-line` for path generators, hand-rolled or `d3-axis`-informed axes) inside the chart adapter, and render the SVG in Caelum's own `cae-chart` template. The Caelum chart adapter is, in effect, "visx-for-Angular" built on the same D3 substrate visx itself uses. **Filed for the M2/D-08 sign-off** (`PROJECT_BACKLOG.md`); reversible and low-risk (charts are deferred), so no blocking decision now.
- **Render-it-yourself is the ideal token-bridge fit (Book 12 §3.5).** Because D3 emits only numbers and path strings (no DOM, no CSS), the `cae-chart` component draws every `<path>`/`<rect>`/`<text>` itself with `--cae-*`-token fills and strokes (Book 04 §3.6) — there is no vendor stylesheet, exactly the headless property that made TanStack a clean grid candidate (`research/notes/tanstack-table.md`). The neutral `CaeChartAdapter` interface (Caelum-typed series/scales/marks) is satisfiable two ways (Book 12 §3.1): on D3, and on hand-rolled SVG with no library at all (the `brief §4` fallback / `brief §9.3` "size the chart need").
- **Provenance is favorable but bushier than the grid.** D3 is ISC (permissive) and US-maintained, but `d3-scale` alone pulls five d3 sub-modules — a larger transitive surface than TanStack's two-package tree, all to be walked at M2. The lazier path Book 03 always offers applies hardest here: for a *small* chart need (a handful of sparklines), hand-rolled SVG + a couple of `Math` helpers may beat adding the d3 tree at all (`brief §9.3`; Book 12 §6's "don't add the dependency for a small need").
- **Zoneless fit is clean.** D3 scale/shape calls are synchronous pure functions (no DOM, no zones), so they are friendly to a zoneless host (Book 01 §3.2); the adapter lands computed geometry into signals the `cae-chart` template reads.

## Candidate experiments

Each a one-line pre-registration seed (hypothesis · metric · baseline); file as `EXP-NN` via `run_experiment` if/when M2 charts work starts:

- **EXP — D3-direct chart through the token bridge.** Hypothesis: a `cae-chart` line/bar built on `d3-scale` + `d3-shape` renders with every fill/stroke from `--cae-*` and zero hardcoded color. Metric: 0 color literals + axe 0 + the SVG DOM is Caelum's. Baseline: hand-rolled SVG with no d3.
- **EXP — d3-tree provenance scan.** Hypothesis: the `d3-scale` + `d3-shape` install is fully permissive + US-origin. Metric: count of non-permissive licenses / flagged-origin packages from `npm ls` + a license scan (target 0/0; expect all-ISC d3 modules). Baseline: the bare `@angular/*` install.
- **EXP — d3 vs no-dependency for a small need.** Hypothesis: for ≤3 simple chart types, hand-rolled SVG is competitive with the d3 tree on LOC + bundle. Metric: adapter LOC + added bundle KB. Baseline: the `d3-scale`/`d3-shape` build.

## Watch

- `https://registry.npmjs.org/@visx/shape` — whether visx ever drops/loosens the React peer (it won't structurally, but watch for a framework-neutral split).
- `https://registry.npmjs.org/d3-scale` and `https://registry.npmjs.org/d3-shape` — version bumps and any license change before pinning at M2.
- `https://github.com/d3/d3/releases` — the d3 module ecosystem's cadence; matters for the M2 transitive scan.
- ~180-day re-verify due by **~2026-12-27**; re-verify the visx-React-peer and the d3 ISC/Bostock lines first — they are what ground the D-08 refinement.
