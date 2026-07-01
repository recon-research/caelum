# A11y & Parity Verification Tooling — axe-core, the CDK harness, and the MPL dev-tier nuance

> reviewed: 2026-06-30 · tier legend: production-proven | published | experimental

This note grounds **Book 16** (Accessibility & Parity Verification) — the first book of Volume IV (Quality). Unlike the adapter books (which each introduced a *runtime* third-party library), Book 16's tools are **dev/test-only**, so the provenance bar is Book 03 §3.3's *dev-tier* strictness, not the runtime bar that forced grid/charts/editor to be permissive. The one finding worth flagging up front: **axe-core is MPL-2.0** (a weak/file-level copyleft license, *not* permissive like MIT), and it is admissible **precisely because it is never shipped** in Caelum's distributed package — a clean, real instance of the runtime-vs-dev distinction. The capability-ledger methodology itself (`untouched → … → adversarial-passed`, pre-committed parity scenarios, the implementer-vs-adversarial split) comes from the intake brief (`brief §6`, `brief §7`), not the web — only the tool specifics below are web-sourced.

## State of the art

### axe-core — the automated a11y engine (and the MPL nuance)

- `axe-core` is at **4.12.1**, license **MPL-2.0**, repository `github.com/dequelabs/axe-core`, described as "Accessibility engine for automated Web UI testing"; it declares **no runtime dependencies and no peer dependencies** [published] (source: https://registry.npmjs.org/axe-core/latest, accessed 2026-06-30)
- axe-core is maintained by **Deque Systems** (US — Herndon, Virginia; the homepage is `deque.com/axe/`) [published] (source: https://registry.npmjs.org/axe-core/latest, accessed 2026-06-30)
- **MPL-2.0 is file-level (weak) copyleft, not a permissive license** — its share-alike obligation attaches to the MPL-licensed *files* and their modifications, and it is OSI-approved and free (not a paid license). For a tool that runs only in CI/tests and is **not redistributed inside the published library**, the copyleft does not reach Caelum's own source (Book 03 §3.3 — dev dependencies are a different, lower-strictness surface than runtime) [published] (source: https://registry.npmjs.org/axe-core/latest, accessed 2026-06-30; license interpretation per Book 03 §2.2/§3.3, not a web claim)

### @axe-core/playwright — driving axe in a real browser

- `@axe-core/playwright` is at **4.12.1**, license **MPL-2.0**, depends on `axe-core` (`~4.12.1`), and declares `playwright-core` (`>= 1.0.0`) as a **peer dependency** (Playwright itself is brought by the consumer) [published] (source: https://registry.npmjs.org/@axe-core/playwright/latest, accessed 2026-06-30)
- This is the standard way to run the axe engine against a live rendered page (light/dark, real layout) rather than only in jsdom — the same MPL dev-tier reasoning applies (it is a test dependency) [published] (source: https://registry.npmjs.org/@axe-core/playwright/latest, accessed 2026-06-30)

### The Angular CDK component test harness — the parity-scenario mechanism

- Angular's CDK **component test harnesses** are current in the v22 docs: a `HarnessEnvironment` abstraction with built-in implementations — **`TestbedHarnessEnvironment`** for `TestBed`-based unit tests and a **`SeleniumWebDriverHarnessEnvironment`** for WebDriver e2e — so the same harness API drives a component in either environment [published] (source: https://angular.dev/guide/testing/using-component-harnesses, via WebSearch, accessed 2026-06-30; API page https://angular.dev/api/cdk/testing/testbed/TestbedHarnessEnvironment)
- A harness loader can be rooted at a fixture's element or at the document root (`documentRootLoader`) to reach overlay content like dialogs outside the fixture DOM — relevant to verifying overlay components (Book 09) [published] (source: https://angular.dev/guide/testing/using-component-harnesses, via WebSearch, accessed 2026-06-30)

## Caveats & confidence (read before citing the lines above)

- **The axe-core MPL-2.0 license is the load-bearing fact and it is firmly sourced** (the npm `latest` record). The *interpretation* — that MPL is acceptable here because axe-core is dev-only and unshipped — is a Book 03 §3.3 judgment, not a web claim; the final dev-dependency provenance sign-off is still the M2/CI gate (Book 03 §3.4), and a compliance owner should confirm the dev-tier carve-out.
- **WCAG version coverage was not fetched.** axe-core groups its rules by WCAG-level tags (it is the engine behind most automated WCAG checks), but the exact 2.0/2.1/**2.2** A/AA tag coverage at 4.12.1 was **not** verified against axe-core's docs this session — treat any specific "tests WCAG 2.2 AA" claim as *verify against axe-core's rule-descriptions doc* before asserting it.
- **Automated coverage is partial by nature.** axe-core (and every automated engine) catches only a *minority* of WCAG issues — automated tooling is widely understood to find well under half, with the rest requiring manual keyboard + screen-reader testing. The exact proportion is **not** re-sourced here and is flagged, not asserted; the book's thesis (axe is necessary but not sufficient; keyboard + screen-reader + the adversarial pass do the rest) does not depend on it.
- **The test-runner choice is Book 17's, not this note's.** The CDK harness is runner-agnostic via `TestbedHarnessEnvironment`; whether Angular 22's default unit runner is Karma (deprecated upstream), Web Test Runner, Vitest, or Jest is a separate frontier question owned by Book 17 (Testing Strategy & Tooling) and should be grounded there, not assumed here.
- **Versions are a snapshot** (`axe-core` / `@axe-core/playwright` 4.12.1) as of this fetch; re-check before pinning.

## Caelum feasibility path

- **axe-core is admitted at the dev tier.** It is free (MPL, not paid), US-origin (Deque), zero-dependency, and never shipped in the published package — so it clears the two hard rules for a *test* tool and its file-level copyleft is irrelevant to Caelum's distributed source (Book 03 §3.3). This is the canonical example the book uses to make the runtime-vs-dev distinction concrete: a license that would be *rejected for a runtime dependency* is *fine for a CI tool*.
- **The capability ledger is a Caelum artifact, not a tool feature.** axe + the CDK harness + Playwright *produce evidence*; the ledger (`untouched → implementer-passed → adversarial-passed`) and the pre-committed parity scenarios are Caelum's own discipline (`brief §6/§7`), the thing that turns "looks done" into "is done" (ROADMAP M4). No tool owns it.
- **Verification spans three layers the tools cover unevenly.** Automated axe (broad, shallow — catches contrast, names, roles), keyboard operation (the CDK harness + explicit key sequences), and screen-reader/SR-semantics + the adversarial human pass (what no engine catches). The book's structure follows that the-tools-are-necessary-not-sufficient spine.
- **Zoneless/signal fit is irrelevant here** (test-time tools), but the harness's `whenStable`/async-settling matters under zoneless components — a Book 17 detail to verify when the test toolchain is built.

## Candidate experiments

Each a one-line pre-registration seed (hypothesis · metric · baseline); file as `EXP-NN` via `run_experiment` if/when M4 verification work starts:

- **EXP — axe in CI over a Forge screen.** Hypothesis: `@axe-core/playwright` run against a rendered Forge screen (light + dark) yields 0 violations after the token bridge + a11y passes. Metric: axe violation count (target 0) in both themes. Baseline: the pre-token-bridge render.
- **EXP — dev-tier provenance scan.** Hypothesis: the test toolchain (axe-core, @axe-core/playwright, playwright-core) is all free + US-origin and contains no *runtime* (shipped) copyleft. Metric: count of copyleft licenses in the **runtime** tree (target 0) vs the **dev** tree (axe's MPL allowed). Baseline: the bare `@angular/*` install.
- **EXP — automated-vs-manual catch rate.** Hypothesis: axe alone misses a meaningful share of seeded a11y defects that keyboard + SR testing catch. Metric: seeded-defect catch rate, axe-only vs axe+keyboard+SR. Baseline: axe-only.

## Watch

- `https://registry.npmjs.org/axe-core` — version bumps and (unlikely but watch) any license change from MPL-2.0; the WCAG-tag coverage per release.
- `https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md` — the authoritative WCAG-tag → rule mapping to ground the exact 2.x/AA coverage claim before asserting it.
- `https://angular.dev/guide/testing/using-component-harnesses` — the CDK harness API and any v22 changes to the environments.
- ~180-day re-verify due by **~2026-12-27**; re-verify the axe-core MPL-2.0 line and the dev-tier carve-out first — they are what ground Book 16's tooling/provenance section.
