# Angular 22 Testing Toolchain — the runner (Vitest), the CDK harness, Playwright + axe

> reviewed: 2026-06-30 · tier legend: production-proven | published | experimental

This note grounds **Book 17** (Testing Strategy & Tooling), the second book of Volume IV (Quality). It settles the frontier question Book 16 deferred: **what is Angular 22's default unit-test runner now that Karma is legacy?** The answer, fetched from the v22 docs this session: **Vitest is the default for new projects.** As with Book 16's tools, the whole test toolchain is **dev/test-only** — it is never shipped in Caelum's published package — so its provenance is governed by Book 03 §3.3's *dev-tier* strictness (free + unshipped), not the runtime US-origin bar that forced grid/charts/editor to be permissive-and-US. The CDK component harness (the load-bearing test tool for a component library) was already confirmed current in [`a11y-testing-tooling.md`](a11y-testing-tooling.md); it is cross-referenced, not re-fetched, here.

## State of the art

### The unit-test runner — Vitest is the v22 default (Karma is legacy, not removed)

- Angular's testing guide states the default runner directly: *"This guide covers the default testing setup for new Angular CLI projects, which uses Vitest."* The page is served as **v22** (footer `v22.0.4+sha-0554bf5`) [published] (source: https://angular.dev/guide/testing, accessed 2026-06-30)
- **Karma is still supported as an alternative, not removed in v22**: the guide says *"If you are migrating an existing project from Karma, see the Migrating from Karma to Vitest guide. Karma is still supported; for more information, see the Karma testing guide."* — so treat Karma as *legacy-but-present*, not gone [published] (source: https://angular.dev/guide/testing, accessed 2026-06-30)
- The Vitest runner is wired through the **`@angular/build:unit-test`** builder in `angular.json`, which defaults `"tsConfig": "tsconfig.spec.json"` and `"buildTarget": "::development"`; test-specific build options (polyfills/assets/styles) that used to live on the Karma test target must move to a dedicated build target [published] (source: https://angular.dev/guide/testing/migrating-to-vitest, accessed 2026-06-30)

### Greenfield is the stable path; *migrating* an existing Karma project is the experimental one

- The new-project default (Vitest via `@angular/build:unit-test`) is the supported setup; **migrating an existing project is explicitly experimental**: *"Migrating an existing project to Vitest is considered experimental."* The helper schematic is also experimental — *"The `refactor-jasmine-vitest` schematic is experimental and may not cover all possible test patterns."* [published] (source: https://angular.dev/guide/testing/migrating-to-vitest, accessed 2026-06-30)
- The schematic's stated boundaries: it does **not** install `vitest` or related deps, does **not** change `angular.json` to the Vitest builder or migrate build options, does **not** remove `karma.conf.js`/`test.ts`, and does **not** handle complex/nested spy scenarios [published] (source: https://angular.dev/guide/testing/migrating-to-vitest, accessed 2026-06-30)
- **Consequence for Caelum:** Caelum is a greenfield Angular 22 workspace, so it is *born on Vitest* (the stable default) and never walks the experimental Karma-migration path — a clean story for Book 17.

### The test environment — jsdom by default, real-browser mode opt-in

- New projects run tests in **Node + jsdom** by default (jsdom simulates the DOM without launching a browser); **happy-dom** is a swappable alternative, and these two are the supported DOM-emulation libraries [published] (source: https://angular.dev/guide/testing, via WebSearch, accessed 2026-06-30)
- **Vitest Browser Mode** runs tests in a real browser instead of an emulated DOM, via a browser *provider* (Playwright or WebdriverIO), enabled through a `browsers` option in `angular.json` or a `--browsers` CLI flag; in browser mode the test and the code under test run in the same browser window/iframe, so real DOM APIs and layout apply [experimental] (source: https://angular.dev/guide/testing, via WebSearch, accessed 2026-06-30) — relevant to layout-dependent component tests and zoneless async settling (Book 01 §3.2)

### Provenance of the test toolchain (all dev-tier — never shipped)

- **Vitest** is at **4.1.9**, license **MIT**, repository `github.com/vitest-dev/vitest`, authored by Anthony Fu (`antfu`) et al.; it declares `vite` as a required peer dependency and `jsdom`/`happy-dom` as optional peers [published] (source: https://registry.npmjs.org/vitest/latest, accessed 2026-06-30)
- **@playwright/test** is at **1.61.1**, license **Apache-2.0**, author **Microsoft Corporation** (US), repository `github.com/microsoft/playwright`, with a single dependency (`playwright`) [published] (source: https://registry.npmjs.org/@playwright/test/latest, accessed 2026-06-30)
- The a11y engine that rides on Playwright — `@axe-core/playwright` and `axe-core` (both MPL-2.0, Deque/US) — is grounded in the sibling note [`a11y-testing-tooling.md`](a11y-testing-tooling.md) (sourced from npm 2026-06-30, not re-fetched here, so no tier tag); it is the visual/e2e-layer tie-in for Book 17's §3.5
- **The load-bearing interpretation:** the entire runner+harness+visual toolchain (Vitest, jsdom, Playwright, @axe-core/playwright) is a **dev/test dependency set, never in the shipped package**, so Book 03 §3.3's runtime-vs-dev split applies: the runtime US-origin/permissive bar relaxes to *free + unshipped*. Playwright is clean on both axes anyway (Apache-2.0/Microsoft/US); Vitest is MIT (its maintaining-entity HQ is not re-verified and is **moot** under the dev-tier rule); axe's MPL copyleft is admissible for the same dev-tier reason (Book 16 §3.2). This is a Book 03 §2.2/§3.3 judgment, not a web claim.

## Caveats & confidence (read before citing the lines above)

- **The load-bearing fact — Vitest is the v22 default runner — is firmly sourced** (a directly-fetched angular.dev page served as v22.0.4). The `@angular/build:unit-test` builder + `tsconfig.spec.json`/`::development` defaults are likewise directly fetched from the migration guide.
- **The jsdom-default / browser-mode specifics are WebSearch-derived**, not from a single directly-fetched page this session — the search summarized angular.dev + Vitest docs. Treat the exact browser-mode wiring (`browsers` option, provider setup) as *verify against angular.dev/guide/testing/components + Vitest's browser-mode docs* before relying on it; the jsdom-default claim is well-corroborated but confirm the flag names when wiring.
- **"Karma still supported in v22" corrects a common older framing.** The npm `karma` package was deprecated upstream years ago and "Karma is dead" is a widespread claim, but the authoritative v22 doc says Karma remains a supported *alternative* — so the honest statement is *Vitest is the default; Karma is legacy-but-present*, not *Karma is removed*. Don't over-assert its death.
- **Library (ng-packagr) vs application testing is an open wiring question.** The migration guide notes the Vitest builder "requires the use of the application build system, which is the default for all newly created projects." How a **publishable library** target (Caelum's `caelum` project) runs its unit/component tests — through its own spec target vs the demo app's build system — was **not** pinned this session. Flag it as *verify at M0* when the workspace is scaffolded (ties to CONV-1 / M0-1).
- **Versions are a snapshot** (Vitest 4.1.9, @playwright/test 1.61.1) as of this fetch; re-check before pinning. The runner default is new enough that it is still moving — don't hard-pin Book 17 to a minor.

## Caelum feasibility path

- **Caelum is born on Vitest.** A greenfield v22 workspace gets the stable default runner (`@angular/build:unit-test` → Vitest → jsdom) with no Karma migration — Book 17's §3.1 can present Vitest as the baseline, not a choice to litigate, while noting Karma remains the documented fallback.
- **The CDK ComponentHarness is the runner-agnostic spine.** Because the harness abstracts the environment (`TestbedHarnessEnvironment` for unit/component; a WebDriver env for e2e — `a11y-testing-tooling.md`), the runner choice and the harness investment are independent: a `CaeXHarness` written once drives the component under Vitest/jsdom *and* under a browser/e2e environment. This is the highest-leverage test artifact for a component library and the concrete build behind Book 16 §3.3.
- **Browser mode is the escape hatch for layout/zoneless.** Where jsdom's non-layout DOM is insufficient (real focus, real geometry, computed styles for visual parity), Vitest browser mode (Playwright provider) or a separate Playwright suite runs the same scenarios in a real browser — the same substrate the visual-regression + `@axe-core/playwright` layer uses (Book 16 §3.2/§3.5).
- **The toolchain is a dev-tier provenance set.** The M0-4 provenance CI gate must implement the runtime-vs-dev split (already annotated for axe): Vitest/Playwright/jsdom/@axe-core/* live in `devDependencies` and are excluded from the shipped-tree scan; only Caelum's *runtime* deps face the full US-origin bar (Book 03 §3.3/§3.4).

## Candidate experiments

Each a one-line pre-registration seed (hypothesis · metric · baseline); file as `EXP-NN` via `run_experiment` if/when the M0 test-tooling slice starts:

- **EXP — Vitest greenfield smoke.** Hypothesis: a fresh Angular 22 workspace with `@angular/build:unit-test` runs `ng test` green on a trivial `cae-*` component + one `TestbedHarnessEnvironment` harness test, under jsdom, with no Karma artifacts. Metric: green run + cold wall-clock. Baseline: the same suite under the legacy Karma builder (if it can be stood up).
- **EXP — harness portability across environments.** Hypothesis: one `CaeSelectHarness` drives the component identically under `TestbedHarnessEnvironment` (jsdom) and under Vitest browser mode / a Playwright env. Metric: assertion-parity (same passes) across the two environments. Baseline: jsdom-only.
- **EXP — dev-tier provenance scan of the test toolchain.** Hypothesis: `vitest` + `@playwright/test` + `@axe-core/playwright` introduce **0** copyleft/non-US licenses into the *runtime* (shipped) tree while (correctly) carrying MPL/MIT/Apache in the *dev* tree. Metric: copyleft count in the runtime tree (target 0) vs the dev tree (allowed). Baseline: the bare `@angular/*` install.

## Watch

- `https://angular.dev/guide/testing` and `https://angular.dev/guide/testing/migrating-to-vitest` — the default-runner status, and whether the Karma-migration path graduates out of *experimental*; re-confirm the builder/option names before wiring M0.
- `https://angular.dev/guide/testing/components` — the component-testing + harness page for the exact jsdom-vs-browser-mode wiring (the WebSearch-derived caveat above resolves here).
- `https://registry.npmjs.org/vitest` and `https://registry.npmjs.org/@playwright/test` — version bumps before pinning; watch Vitest browser-mode maturity for Angular component tests.
- The **library-vs-application test wiring** for a publishable `ng-packagr` project — resolve at M0/CONV-1 when the workspace exists (the open caveat above).
- ~180-day re-verify due by **~2026-12-27**; re-verify the *Vitest-is-the-default* line and the library-test-wiring question first — they are what ground Book 17 §2.3/§3.1.
