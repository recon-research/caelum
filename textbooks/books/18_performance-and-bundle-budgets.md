# Book 18 — Performance & Bundle Budgets

> Volume IV, Book 3 — **completes the Quality volume.** Book 16 built a11y/parity verification; Book 17 built the test tooling; this book builds the **performance** dimension of "is done" — and the project's standing rule governs it: *performance is profiled, not guessed*. Keep the boundaries clean. Book 17 owns the test *tooling* (the visual-regression build, the harness); Book 18 owns the perf *budgets* — where the grid-at-scale tests Book 17 §8 forward-referenced to this book get their numbers. Book 10 §3.6 already forward-referenced this book for "profile at realistic scale." And Book 19 (next) owns *how to publish* the package; this book owns *why* the packaging shape matters (bundle cost). The distinctive Caelum point, and the one the research surfaced: **there are two size gates, not one** — the Forge *application* build is gated by `angular.json` budgets, but the shipped `cae-*` *library* is a different artifact that needs its own gate. Frontier v22 facts are grounded in [`research/notes/angular-22-performance.md`](../../research/notes/angular-22-performance.md), cited as a research note (web-sourced, staling), never as a `Book §`. This book backs the perf gate of `definition_of_done` and the `profile_subsystem` / `optimize_loop` skills.

## 1. TL;DR

Performance is the last leg of "is done," and Caelum treats it the way Book 16 treats accessibility: as a **budgeted, gated dimension**, measured against a pre-set bar, not a feeling. Four levers carry it. **(1) Bundle-size gates.** Angular 22's `angular.json` **budgets** (types `initial`/`anyComponentStyle`/`bundle`/…, `warning` proceeds but `error` **fails the build**) gate the Forge *application* — but budgets are an *application-build* feature, so the shipped `cae-*` *library* needs its **own** size gate (per-secondary-entry-point bytes via `source-map-explorer`/`size-limit`), because a library is not an application (Book 01 §2.2). **(2) Tree-shaking is a packaging discipline.** Ship the Angular Package Format (FESM2022) with **`"sideEffects": false`** and **one secondary entry point per component/adapter**, so a consumer importing `cae-select` never pays for `cae-data-grid` — the concrete meaning of "adopt Caelum component-by-component." **(3) Lazy loading.** `@defer` deferrable views split heavy standalone dependencies — the D3 chart adapter, the Lexical editor (Books 13–15) — out of the initial chunk, and standalone lazy routes split Forge screens. **(4) Change-detection cost.** Zoneless + `OnPush` + signals (the v22 default, Book 01 §3.2) means a `cae-*` component only re-checks when its own signals change; the Angular DevTools profiler's "Change detection" view *demonstrates* it (skipped `OnPush` subtrees grey out), and virtual scroll (Book 10 §3.3) bounds the DOM at scale. The through-line is the anti-pattern this book most guards against: **premature optimization** — every perf change is profiled first, against a budget, or it doesn't happen. This book completes Volume IV.

## 2. Conceptual Foundations

### 2.1 "Fast enough" is a budget, not a feeling

Performance regressions are silent the way accessibility regressions are (Book 16 §2.1): nobody files "the bundle grew 40kb this sprint" until it is a page-load problem in production. So Caelum makes performance a **budgeted** dimension — you write the number down, the tooling measures against it on every build, and crossing it **fails CI**, exactly as an axe violation does. This reframes the whole subject away from "make it fast" (unbounded, subjective) toward "keep it under budget" (bounded, mechanical). Two consequences follow and structure the rest of the book. First, a budget is only meaningful if it is **measured, not estimated** — which is why the project's standing rule is *profiled, not guessed*, and why every quantitative claim in this book is a candidate *experiment* (research note) rather than a memorized figure. Second, "fast enough" is **per-artifact**: the initial bundle a user downloads, the size a single imported component costs a consumer, the change-detection time for a 10k-row grid — each is a different budget with a different instrument. The book's spine is naming those artifacts and their gates.

### 2.2 The two size gates — a library is not an application

The most important structural fact for *Caelum's* performance, and the one a generic Angular perf guide misses: **Caelum ships a library, and a library is not an application** (Book 01 §2.2). The two are built and measured differently:

- **The application gate** — the **Forge** demo app is built by the `application` (esbuild) builder and gated by **`angular.json` budgets** on its *bootstrapped* bundles (initial JS/CSS, per-component styles). This is the standard Angular gate and it protects the demo.
- **The library gate** — the published `cae-*` package is built by **`ng-packagr`**, whose output `angular.json` budgets do **not** measure (an *inference* from the docs' framing — budgets are documented only on the application-build target — to confirm when the library build is wired at M0-4, per the research note; not a fetched doc statement). The thing that matters for the library is a *different* budget: **"importing `cae-select` must not pull in `cae-data-grid`"** — a per-entry-point size contract on the shipped dist, enforced by a separate CI instrument (`source-map-explorer`/`size-limit`), not by app budgets.

Conflating the two — assuming `angular.json` budgets protect the shipped package — is the trap. The library's performance is a *packaging* property (§3.3), and its gate is the shipped-size-per-entry-point check (§3.2). Naming both gates keeps a Caelum perf review honest about which artifact it is protecting.

### 2.3 What Angular 22 gives you for free (the frontier facts)

The platform already defaults to the right choices, so much of Caelum's job is to *not break them* and to add the library-specific gate. The v22 facts (research note): **zoneless change detection and `OnPush` are the defaults for new components** (Book 01 §3.2) — so a correctly-authored `cae-*` component already does the minimum change-detection work; the **esbuild `application` builder** is the default and ships the **budgets** gate; the **Angular Package Format** with `"sideEffects": false` and **secondary entry points** is the tree-shaking substrate a library publishes on; and **`@defer` deferrable views** split standalone dependencies out of the initial bundle. None of these are Caelum inventions — they are v22 platform features. The library's performance discipline is therefore mostly **conformance**: author zoneless-compatible + `OnPush` + signal-driven (so CD stays minimal), package as tree-shakable APF (so consumers pull only what they use), defer the heavy adapters, and gate both artifacts. The frontier work is verifying these version-specific mechanisms are current — done in the research note — not inventing new ones.

## 3. Architecture & Design

§3.1 is the application gate; §3.2 is the *library* gate (the distinctive one); §3.3 is tree-shaking as the packaging discipline that gate protects; §3.4 is lazy loading; §3.5 is change-detection cost and how virtual scroll bounds it at scale; §3.6 is profiling + the perf checklist that wires into `definition_of_done`.

### 3.1 Bundle-size budgets — the application gate

Angular 22 configures size budgets as a **`budgets` array on the application build target** in `angular.json`; the builder "warns or reports an error when a given part of the application reaches or exceeds a boundary size that you set" (research note). The mechanics Forge relies on: budget **`type`** values (`initial` = the bootstrap JS+CSS; `anyComponentStyle` = any one component stylesheet; `bundle` = a specific named bundle incl. lazy; plus `allScript`/`all`/`anyScript`), **thresholds** (`maximumWarning`/`maximumError`, and a `baseline` + `%` form for pinning allowed growth), and the crucial **gate semantics**: a `warning` threshold logs but the build **succeeds**; an `error` threshold makes `ng build` **fail** (non-zero exit). That failure-on-error is what turns a budget into a real CI gate rather than a dashboard (the same "0 violations is a merge gate, not a report" stance as Book 16 §3.2). The v22 builder **type-level defaults** — `initial` warns at 500kb / errors at 1mb, `anyComponentStyle` warns at 2kb / errors at 4kb — are the starting bar; Forge tightens them per screen. This gate protects the *demo*; it says nothing about the shipped library (§2.2).

### 3.2 The shipped-library size gate — the other gate

The published `cae-*` package is the artifact a consuming team actually installs, and its performance contract is **"you pay only for what you import."** `angular.json` budgets don't measure `ng-packagr` output, so Caelum needs a **separate, library-specific gate** in CI: a **per-secondary-entry-point size check** on the built dist (via `source-map-explorer` — Apache-2.0, dev-tier, builder-agnostic because it needs only source maps — or a `size-limit`-style threshold config; research note). The check answers the question that matters for adopt-component-by-component: does importing `cae-select` pull in only `cae-select`'s code, or has an accidental cross-import (a shared barrel file, a leaked adapter dependency) dragged the grid engine along? This gate is the performance analogue of Book 12's adapter-isolation ESLint rule — both mechanically defend a boundary that erodes silently. It is a genuine **design decision to wire at M0-4** (the CI slice): budgets are a config change, but the library size gate is a bespoke CI step (build the lib, measure each entry point, fail on regression past a committed baseline). Naming it here is the point; the *how-to-publish* mechanics are Book 19's.

### 3.3 Tree-shaking as a packaging discipline

Whether the §3.2 gate passes is decided at **package build time**, by how Caelum is shipped — tree-shaking is a *packaging* property, not something a consumer can retrofit. The disciplines (research note; Angular Package Format):

- **Ship APF / FESM2022 with `"sideEffects": false`.** The side-effect-free declaration is what lets a consumer's bundler drop unused Caelum code; without it, importing one symbol can retain a whole module. This is the single highest-leverage line in the library's `package.json`.
- **One secondary entry point per component/adapter.** APF secondary entry points (resolved via the `exports` map — the same shape Angular Material uses to publish each component separately) give **fine-grained code splitting**: `cae-select` and `cae-data-grid` are separate import paths, so a consumer's bundler never sees the grid engine unless the app imports it. This is the literal mechanism behind "adopt Caelum component-by-component," and it is what §3.2's gate verifies.
- **Partial compilation.** Libraries publish in `compilationMode: "partial"` so the consuming app compiles them against its own Angular version — the portability that lets a range of consumer apps adopt Caelum.
- **Tree-shakable providers.** Services declare their own providers (`providedIn` / a `provide*()` function), never an eager NgModule — so an unused service is shaken out. This is exactly the DI shape Book 12 §3.4 already uses for adapter injection (`provideCaelumGrid()` et al.), which means the adapter pattern is *already* tree-shaking-friendly: an app that never provides the grid adapter never bundles it.

Standalone components (Book 01) are the unit of distribution that makes all of this work — there is no NgModule dragging in siblings. Tree-shaking is where a component library quietly wins or loses on bundle cost, and it is decided before a consumer ever installs.

### 3.4 Lazy loading — `@defer` and standalone routes

Tree-shaking removes *unused* code; **lazy loading** defers *used-but-not-yet* code out of the initial download. Two mechanisms (research note):

- **`@defer` deferrable views** split a block's **standalone** components/directives/pipes into a separate JavaScript chunk loaded on a trigger — `on viewport` / `on interaction` / `on idle` / `on hover` / `on timer` / `when`, each with a `prefetch` variant and `@placeholder`/`@loading`/`@error` sub-blocks. This is the right tool for Caelum's **heaviest artifacts**: the D3 chart adapter, the Lexical editor, the TanStack grid (Books 13–15) are exactly the "not strictly necessary for initial render" dependencies `@defer` is designed to move off the critical path — `@defer (on viewport)` a chart, `@defer (on interaction)` an editor, and the engine's chunk never loads until it's needed. (Only *standalone* deps defer, which Caelum's are.)
- **Standalone lazy routes** (`loadComponent`) split Forge screens at the route boundary, so the admin console loads one screen's components at a time.

The adapter layer and lazy loading compose especially well: an adapter is already a swap-behind-DI boundary (Book 12 §3.4), so deferring the heavy implementation while keeping the neutral interface eager is natural. Lazy loading is a *screen/feature* decision (which is why Forge, not the library, drives it), but the library enables it by being standalone + tree-shakable.

### 3.5 Change-detection cost — zoneless, OnPush, and bounding it at scale

Bundle size is download cost; **change detection** is runtime cost, and for a component library the pathological case is the data table (Book 10). Two levers bound it, and both are *measured*, not assumed:

- **Zoneless + `OnPush` + signals** (the v22 default, Book 01 §3.2) mean a `cae-*` component re-checks only when its own signals change or it is explicitly marked — so editing one cell of a grid does not re-run change detection over every sibling row. The proof is the **Angular DevTools profiler's flame graph** with the **"Change detection" checkbox**: it greys out components that did *not* re-render (the `OnPush` subtrees that stayed clean), turning "is my CD actually bounded?" into something you *see* rather than hope (research note).
- **Virtual scroll** (Book 10 §3.3, the R1 lever) bounds the *DOM* independently of dataset size: `CdkVirtualScrollViewport` renders only the on-screen rows, so a 50k-row grid has a bounded node count and therefore bounded CD and layout work. Fixed-size (`itemSize`) is the shippable path; variable-height autosize is still experimental (research note), so a Caelum grid designs for uniform row height.

Together these make grid-at-scale tractable: virtual scroll bounds the DOM, `OnPush`+signals bounds the CD over that bounded DOM, and the profiler confirms both. This is where Book 10's R1 decision ("grid-vs-table by row count") gets its *evidence* — you don't decide the threshold by feel, you profile the render at realistic scale (§3.6).

### 3.6 Profiling & the performance checklist

Nothing in §3.1–§3.5 is trusted without measurement — the project's *profiled, not guessed* rule. The instruments (research note, all dev-tier): the **Angular DevTools Profiler** (bar chart of CD cycles, flame graph, the "Change detection" checkbox, JSON export for before/after comparison) for change-detection cost, and the **Chrome DevTools Performance** panel via `ng.enableProfiling()` (dev-mode) for frame-granularity render/scripting time. The rule that makes profiling honest: **profile first, optimize the measured hotspot, re-profile** — never optimize an unprofiled hunch (the over-engineering guard, and the reason `optimize_loop` demands a profile before it touches a hot path).

**The performance checklist (this book's leg of the four-legged stool):**

1. **App budget set** — `angular.json` budgets on the Forge build, `error` thresholds tuned per screen, wired to fail CI (§3.1).
2. **Library size gate set** — a per-secondary-entry-point size check on the shipped `cae-*` dist, failing on regression past a committed baseline (§3.2; the artifact `angular.json` budgets don't cover).
3. **Tree-shakable packaging** — APF, `"sideEffects": false`, one entry point per component/adapter, `provide*()` services (§3.3; verified by leg 2).
4. **Heavy dependencies deferred** — the chart/editor/grid adapters behind `@defer` / lazy routes, not in the initial chunk (§3.4; Books 13–15).
5. **CD bounded and proven** — `OnPush` + signals (no zone-coupled CD), confirmed via the profiler's "Change detection" view; virtual scroll for tables at scale (§3.5; Book 01 §3.2, Book 10 §3.3).
6. **Profiled, not guessed** — every perf claim/change backed by a captured profile or a measured budget delta, never an estimate (§3.6).

`definition_of_done`'s performance gate enforces legs 1–2 + 5–6 (a budget exists and is green; CD is bounded; the change was profiled); legs 3–4 are packaging/feature properties verified as the library and Forge screens are built. The a11y gate is Book 16's, the test tooling is Book 17's — this checklist is the *performance* leg they sit beside.

## 4. Implementation

Illustrative shapes (Angular 22) — not a compileable repo. Version-specific specifics are kept to what the research note verified.

**(a) The application gate (§3.1) — `angular.json` budgets, tightened for Forge.**

```jsonc
"budgets": [
  { "type": "initial",           "maximumWarning": "400kb", "maximumError": "600kb" },
  { "type": "anyComponentStyle",  "maximumWarning": "2kb",   "maximumError": "4kb"  },
  // pin a lazy chunk's allowed growth against a known-good baseline:
  { "type": "bundle", "name": "forge-reports", "baseline": "180kb", "maximumError": "20%" }
]
// warning => build proceeds; error => `ng build` fails (the CI gate).
```

**(b) The library gate (§3.2) — a per-entry-point size check on the shipped dist (CI step, illustrative).**

```jsonc
// package.json "size-limit" (dev-tier tool) — one entry per secondary entry point:
"size-limit": [
  { "path": "dist/caelum/fesm2022/caelum-select.mjs",    "limit": "12 kb" },
  { "path": "dist/caelum/fesm2022/caelum-data-grid.mjs", "limit": "40 kb" }
]
// Fails CI if importing cae-select regresses past 12kb — the "pay only for what you import" contract.
// Alternatively: source-map-explorer on the dist to attribute bytes per module.
```

**(c) Tree-shakable packaging (§3.3) — the library `package.json`.**

```jsonc
{
  "sideEffects": false,                      // THE line that lets consumers tree-shake Caelum
  "exports": {                               // one secondary entry point per component/adapter
    "./select":    { "default": "./fesm2022/caelum-select.mjs" },
    "./data-grid": { "default": "./fesm2022/caelum-data-grid.mjs" }
  }
}
// A consumer importing @caelum/select never sees @caelum/data-grid's engine (Book 12 adapter stays out).
```

**(d) Deferring a heavy adapter (§3.4).**

```html
@defer (on viewport; prefetch on idle) {
  <cae-chart [series]="revenue()" />   <!-- the D3 adapter's chunk loads only when scrolled into view -->
} @placeholder {
  <div class="cae-chart__skeleton"></div>
} @loading {
  <cae-spinner />
}
```

**(e) Proving CD is bounded (§3.5–§3.6).** Not code but a *procedure*: open Angular DevTools → Profiler → record → edit one grid cell → stop → open the flame graph, enable the **"Change detection" checkbox**, and confirm the sibling rows are **greyed** (skipped `OnPush` subtrees). If they are *not* grey, a signal is over-broad or a component isn't `OnPush` — a measured defect, not a guess. Export the profile JSON to compare before/after an optimization.

## 5. Bleeding Edge

- **Incremental hydration is the SSR dimension this book under-covers.** `@defer` also supports **`hydrate` triggers** for incremental hydration of server-rendered apps — deferring *hydration* (not just download) of below-the-fold content. Caelum is a client-side component library, so this is a *consumer app* concern, but a `cae-*` component must be **hydration-safe** (no layout-shifting on hydrate) to be used in an SSR Forge. Flagged as a watch item, **honestly not deeply researched** — the research note lists the specific `hydrate` triggers as an under-covered gap, so they are named, not enumerated as fact here.
- **Runtime budgets are the complement to bundle budgets.** Bundle-size gates catch *download* cost; they say nothing about *runtime* Web Vitals (LCP/INP/CLS). A mature Caelum would add a **Lighthouse-CI / Web-Vitals** budget gate on representative Forge screens (INP is the interaction-latency metric a component library most affects). This is the runtime analogue of §3.1 and a genuine M4 opportunity, not built here.
- **The esbuild/Vite pipeline keeps moving.** `@angular/build` pins esbuild/Vite/Rollup at specific versions (research note); the build system is younger than the webpack one it replaced, so chunk-naming, hashing for long-term caching, and stats-format details can shift — re-verify the `--stats-json` → esbuild-analyzer path when pinning CI tooling.
- **Router preloading is the lazy-vs-warm trade.** Standalone lazy routes (§3.4) cut the initial bundle but cost a navigation-time fetch; `PreloadAllModules` / a custom `PreloadingStrategy` / quicklink-style preloading warm the chunks ahead of navigation. Which Forge screens preload is a per-app tuning decision, noted not prescribed.
- **Autosize virtual scroll is still experimental.** Variable-height rows remain a capability gap (`cdk-experimental`); a Caelum grid designs for fixed row height until autosize graduates (research note).

## 6. Gaps & Opportunities

- **`profile_subsystem` and `optimize_loop` are the skills this book backs.** The recurring op — capture a profile, find the measured hotspot, optimize it, re-profile — is exactly those skills; this book supplies the Angular-specific instruments (the DevTools profiler, budgets, virtual scroll) they operate with.
- **The library size gate is a real design decision, not a config toggle.** Unlike `angular.json` budgets (a config change), the per-entry-point shipped-size gate (§3.2) is a bespoke CI step to design at M0-4 — how to build the lib, attribute bytes per entry point, and baseline them. It is the highest-leverage new mechanism this book calls for.
- **Every number here is an experiment, not a citation.** Consistent with *profiled, not guessed*, the research note ships **candidate experiments** (zoneless bundle delta, virtual-scroll-vs-full-render at 1k/10k/50k rows, per-component tree-shaking delta, `@defer` chunk counts) rather than memorized figures — the M4 perf work runs these as `EXP-NN` and records real numbers.
- **Under-covered on purpose:** `NgOptimizedImage` / font / critical-CSS strategy, incremental hydration (§5), and runtime Web-Vitals gates are named but not built — the research note flags them so a future pass doesn't mistake silence for coverage.
- **Honest status:** there is **no performance infrastructure yet** — no component code, no Forge app, no CI (M0 hasn't started). This book defines the budgets and gates the M0–M4 work will wire; the live numbers live in the `EXP-NN` results and `MANIFEST.json` `coverage_gaps` when they exist.

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on performance:

- **Wiring the gates.** Setting `angular.json` budgets, authoring the per-entry-point library size gate (§3.2), and scaffolding the `package.json` `exports` + `sideEffects` (§3.3) are mechanical, high-value, and exactly the kind of config an agent gets right from the spec.
- **Deferring the heavy dependencies.** Identifying the chart/editor/grid adapters as the `@defer` candidates and wiring the blocks (§3.4) is a pattern-match an agent does reliably.
- **Running the profiling experiments.** Executing the research note's candidate experiments (build with/without the zone.js polyfill, virtual-scroll-vs-full-render at scale) and recording the measured deltas is the *profiled-not-guessed* loop an agent can drive end-to-end.

Where it is only ~1× and must defer to a human:

- **"Is this regression acceptable?"** Whether a 20kb growth for a real feature is worth it, or a budget should be raised vs the code refactored, is a product trade-off (§2.1) — the agent surfaces the delta; the human sets the bar.
- **Reading a flame graph for the *real* bottleneck.** The profiler shows where time went; deciding which hotspot is worth optimizing (and which is noise) is a judgment that needs the measurement in front of it, not a guess about it (§3.6).
- **Refusing to optimize unprofiled.** The agent's standing discipline here is to **not** "speed things up" without a captured profile — premature optimization is the anti-pattern this book most guards, and an agent proposing a perf change should be asked "what did you profile?" first.

## 8. Exercises & Further Reading

**Exercises:**
1. Add `angular.json` budgets to a scratch v22 app, set `anyComponentStyle` `maximumError` to `4kb`, and write a component stylesheet that trips it — confirm `ng build` **fails** (not just warns) (§3.1; research note).
2. Ship a two-component scratch library with `"sideEffects": false` and one secondary entry point per component; in a consumer app, import one component and use `source-map-explorer` to prove the other's code is **absent** from the bundle (§3.2/§3.3; research note).
3. Deliberately break tree-shaking: add a shared barrel file that re-exports both components, re-measure, and watch the unused component reappear — then fix it and re-gate (§3.2).
4. `@defer (on viewport)` a heavy standalone component and, via the network panel, confirm its chunk loads only on scroll; then `viewChild`-query it and confirm it re-enters the **initial** chunk (the standalone-and-not-referenced-outside constraint) (§3.4; research note).
5. **The profiler drill:** record an Angular DevTools profile while editing one cell of a table, enable the "Change detection" checkbox, and verify sibling rows are **greyed** (skipped `OnPush`); make one component non-`OnPush` and watch the grey disappear (§3.5–§3.6).
6. Profile a full-render vs `cdk-virtual-scroll` table at 10k rows and record the DOM-node-count and frame-time delta as an `EXP-NN` — numbers, not adjectives (§3.5; Book 10 §3.3; `profiled, not guessed`).

**Further reading:** the performance/bundle grounding for this book is [`research/notes/angular-22-performance.md`](../../research/notes/angular-22-performance.md) (a research note — web-sourced and staling, **not** a `Book §`), which cross-references [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md) for the zoneless/OnPush facts; the Angular build/budgets docs at [`angular.dev/tools/cli/build`](https://angular.dev/tools/cli/build), the Angular Package Format at [`angular.dev`](https://angular.dev/tools/libraries/angular-package-format), deferrable views at [`angular.dev/guide/templates/defer`](https://angular.dev/guide/templates/defer), and the DevTools profiler at [`angular.dev/tools/devtools/profiler`](https://angular.dev/tools/devtools/profiler). In this library: the library-is-not-an-application principle behind the two gates (Book 01 §2.2) and zoneless/OnPush CD (Book 01 §3.2); the runtime-vs-dev provenance rule the dev-tier analysis tooling rides on (Book 03 §3.3); the token-only render the component styles are budgeted against (Book 04 §3.6); the virtual-scroll R1 lever this book profiles (Book 05 §3.3, Book 10 §3.3/§3.6); the adapter DI that is already tree-shakable and `@defer`-friendly (Book 12 §3.4); the heavy adapters this book defers (Books 13–15); the "is done" siblings this leg sits beside — a11y/parity (Book 16, incl. its capability-ledger §2.2 and visual dimension §3.5) and testing (Book 17 §3.5 for the visual-regression build, and §8 which forward-referenced grid-at-scale *budgets* to this book). Forward to Book 19 (Packaging, Versioning & Distribution — *how* to publish the tree-shakable APF this book relies on; the Book 18↔19 boundary is why-vs-how) and Book 20 (Migration & Adoption — where a consuming team inherits Caelum's bundle discipline). **This book completes Volume IV — Quality.**
