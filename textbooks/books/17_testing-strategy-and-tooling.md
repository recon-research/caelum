# Book 17 — Testing Strategy & Tooling

> Volume IV, Book 2 — **the build behind the verification.** Book 16 committed the *requirement*: the capability ledger, pre-committed parity scenarios, the implementer-vs-adversarial split, and the three verification layers (axe + keyboard + screen reader). This book builds the *tooling* that executes those scenarios and the tests that reach past a11y — unit, component, and integration tests; the CDK `ComponentHarness` in depth; the Playwright visual-regression suite; golden discipline; and CI wiring. **Keep the boundary clean:** Book 16 owns *what must be verified and why*; Book 17 owns *the runner, the harness, the visual-regression build, and how CI runs them* (Book 16 §5 draws this line explicitly — visual-regression is a *dimension* there, a *build* here). The one genuinely frontier fact — **Angular 22's default unit-test runner is now Vitest** — is grounded in [`research/notes/angular-22-testing.md`](../../research/notes/angular-22-testing.md), cited as a research note (web-sourced, staling), never as a `Book §`. This book backs the `add_test` skill and the test legs of `definition_of_done`.

## 1. TL;DR

A component library is verified by a **test pyramid bent toward its middle**. The base is ordinary **unit tests** — pure logic with no DOM: signal/`computed` derivations (Book 02), the format/parse round-trips of the numeric/mask inputs (Book 08's R3 locale matrix), validators (Book 07 §3.2). The fat middle — the highest-value layer for a UI library — is **component tests driven through the CDK `ComponentHarness`**: a `CaeXHarness` per component that drives it the way a user would and asserts *what happened*, which is exactly the executable form of Book 16 §3.1's pre-committed scenarios and Book 16 §3.3's keyboard layer. Above that sit **integration tests** (a real Forge screen wiring several `cae-*` components + a form + DI providers, with the adapter's fallback provider swapped in for determinism, Book 12 §3.2) and **visual/e2e tests** in a real browser via **Playwright** — the visual-parity dimension (Book 16 §3.5) built for real, with `@axe-core/playwright` folding the automated-a11y layer into the same run. The frontier fact that dates this book: **Angular 22 ships Vitest as the default unit-test runner** (via the `@angular/build:unit-test` builder), with Karma demoted to a supported-but-legacy alternative (research note); Caelum, being greenfield, is *born on Vitest* and never walks the experimental Karma-migration path. Two disciplines run through everything: **golden/baseline discipline** (commit baselines, review diffs, kill flake at the source) and **determinism** (no wall-clock, no randomness, no live network in a test). And one provenance note ties back to Book 03 §3.3: the *entire* test toolchain — Vitest, jsdom, Playwright, axe — is a **dev/test dependency set that never ships**, so the runtime US-origin bar relaxes to *free + unshipped* (the M0-4 gate must exclude `devDependencies` from the shipped-tree scan).

## 2. Conceptual Foundations

### 2.1 The test pyramid, bent for a component library

The classic pyramid — many cheap unit tests, fewer integration tests, a handful of slow end-to-end tests — assumes the value lives in *business logic*. A component library inverts that assumption: Caelum's value is *behavior at the DOM* — focus order, keyboard operability, ARIA state, overlay dismissal, form-value fidelity — none of which a pure-logic unit test can see. So the pyramid bends into a **testing trophy**: a solid base of unit tests for the genuinely pure parts, a **fat middle of component tests** (the bulk of the suite, run through the CDK harness), a thinner band of integration tests over composed Forge screens, and a deliberately small cap of visual/e2e tests where a real browser is the only honest environment. The reason the middle is fattest is the same reason Book 16 exists: for this library, *most defects are interaction defects*, and interaction is only observable when the component is mounted and driven. A library that over-invests in unit tests and under-invests in component tests will have a green suite and a broken keyboard path — precisely the §2.1 "looks done" trap of Book 16, in test form.

### 2.2 A test is a parity scenario made executable

Book 16 §3.1 requires **pre-committed parity scenarios** — functional/a11y/visual checks authored *before* "done," derived from the `p-*` component's behavior, so the bar can't move to meet the implementation. This book supplies the *mechanism*: a test file is the executable, re-runnable form of that scenario. The scenario "opens on Enter, selects with Enter, emits the model value not the label, restores focus to the trigger on Escape" becomes a component-harness test that fails until each clause holds. This keeps the two books in their lanes: Book 16 decides **what the scenarios are and which of the three parity dimensions each covers**; Book 17 decides **which test layer expresses each clause** (a validator clause → a unit test; a keyboard clause → a harness test; a light/dark-density clause → a Playwright snapshot). The capability-ledger states of Book 16 §2.2 are *earned by these tests passing* — `implementer-passed` means the scenario suite is green under the builder; a code change resets the state and the suite must be re-run (the same re-vet discipline as Book 03 §3.4). The tests are where the ledger's claims are cashed.

### 2.3 What Angular 22 changed for testing — the runner (the frontier fact)

The version-specific change a component library must get right is the **default unit-test runner**. Angular 22 makes **Vitest the default runner for new projects**, wired through the `@angular/build:unit-test` builder in `angular.json` (which defaults `tsConfig` to `tsconfig.spec.json` and builds the `::development` target); **Karma remains supported as a legacy alternative but is no longer the default** (research note — the authoritative v22 docs say "Karma is still supported," correcting the common "Karma is dead" framing). Crucially for Caelum, the *stable* path is the greenfield one: creating a new v22 workspace yields Vitest out of the box, whereas **migrating an existing Karma project is explicitly experimental** (the `refactor-jasmine-vitest` schematic is experimental and partial). Caelum is greenfield, so it is *born on Vitest* and never touches the migration path — Book 17 presents Vitest as the baseline, not a decision to litigate. The default test environment is **Node + jsdom** (a fast, non-layout DOM emulation; happy-dom is swappable), with **Vitest Browser Mode** (real browser via a Playwright/WebdriverIO provider) available opt-in for the layout- and focus-dependent cases jsdom can't honestly serve (research note). Everything else in this book — the CDK harness, Playwright, the golden discipline — is stable across the Karma→Vitest shift, because the harness abstracts the runner (§3.3).

## 3. Architecture & Design

§3.1 pins the runner (the frontier layer); §3.2–§3.4 are the three test layers Caelum writes (unit → component-via-harness → integration); §3.5 is the visual-regression build + golden discipline; §3.6 is CI wiring + the test-authoring checklist that plugs into `definition_of_done`.

### 3.1 The runner — Vitest by default, the harness above it

Caelum's unit/component runner is **Vitest**, configured via the `@angular/build:unit-test` builder (research note); a fresh workspace needs no runner decision. Two design consequences follow. First, **tests run under jsdom by default** — fast, no browser, but *no real layout*: `getBoundingClientRect` is zero, `:focus-visible` and computed geometry are unreliable, so any assertion that depends on real rendering belongs in browser mode (§3.1's escape hatch) or in the Playwright suite (§3.5), not in a jsdom unit test. Second, and load-bearing: **the runner sits below the CDK harness, which is runner-agnostic** (§3.3), so the library's test *investment* (the per-component harnesses and the scenario suites) is insulated from the runner *choice* — if the toolchain shifts again, the harnesses survive. The **provenance note**: Vitest is MIT and a `devDependency` that never ships, so its origin is moot under Book 03 §3.3's dev-tier rule (research note); the runner is admitted the same way axe-core's MPL is (Book 16 §3.2). Watch, from the note: the runner default is new enough to still move — don't hard-pin Book 17's guidance to a Vitest minor, and resolve the open **library-vs-application test-wiring** question (how a publishable `ng-packagr` target runs its specs) at M0 when the workspace exists.

### 3.2 Layer 1 — unit tests for the genuinely pure parts

The base layer tests the logic that needs **no fixture and no DOM**, so it stays in fast jsdom (or even plain Node) and runs in milliseconds:

- **Signal derivations** (Book 02): a `computed` produces the right value as its inputs change; an `effect`'s scheduling is *not* unit-tested by wall-clock but by driving inputs and asserting the derived signal — the reactive-purity discipline of Book 02 keeps these deterministic.
- **Format/parse round-trips** (Book 08): the R3 **locale matrix** — `en-US`/`de-DE`/RTL × paste × negatives × `0`-vs-empty-vs-`null` — is a table-driven unit test over the `Intl.NumberFormat` format/parse pair, the single highest-value unit test in the library because value-fidelity bugs are silent and locale-specific.
- **Validators** (Book 07 §3.2): a `ValidatorFn` maps input → error key; pure input/output, no form needed.

The rule is **TestBed only when DI is genuinely required** — spinning up a `TestBed` for a pure function is wasted wall-clock. Unit tests are cheap, so they are plentiful; but they are also *blind to interaction*, which is why they are the base, not the bulk (§2.1).

### 3.3 Layer 2 — component tests through the CDK `ComponentHarness` (the depth)

This is the library's core test layer and the concrete build behind Book 16 §3.3. Book 16 established *that* keyboard operability is verified with the CDK harness; this section builds *how*. For each `cae-*` component Caelum ships a **custom `ComponentHarness` subclass** — e.g. `CaeSelectHarness` — that exposes semantic operations (`open()`, `selectOption(text)`, `value()`, `sendKeys(...)`) built on `locatorFor`/`HarnessPredicate`, so a test reads as the *parity scenario* it encodes rather than as DOM poking. The harness is loaded through **`TestbedHarnessEnvironment`** for component tests, and a **`documentRootLoader`** reaches overlay content rendered outside the fixture — dialogs, menus, the picker overlays of Book 09 §3.6 (research note). Four properties make this the highest-leverage artifact in the suite:

1. **It tests semantic interaction, not coordinates** — `await harness.open()` survives a refactor that a `querySelector('.mat-select-trigger')` would break, so the tests age well.
2. **It is the executable scenario** (§2.2) — the harness test *is* Book 16 §3.1's functional + keyboard clauses: Tab/Shift-Tab for focus order, arrow keys for the roving-tabindex widgets (Book 05 §3.2 key managers), Enter/Space/Escape for activation and dismissal, asserting focus *landed where expected* and Escape *restored focus to the trigger* (Book 09 §3.6), with no unintended trap.
3. **It is runner-agnostic and portable** — the same `CaeSelectHarness` drives the component under `TestbedHarnessEnvironment` (jsdom) *and* under a WebDriver/browser e2e environment, so one harness serves Layer 2 and the interaction half of Layer 4 (research note).
4. **Zoneless settling is explicit, not magical** — under Caelum's zoneless + `OnPush` components (Book 01 §3.2), the harness's `whenStable`/`forceStabilize` is what settles pending signal-driven change detection before an assertion; a test that reads state without awaiting stabilization is the classic zoneless flake, and the harness API is the seam that makes the settling deliberate.

Because Caelum's controls implement `ControlValueAccessor` (Book 07 §3.1), the harness also asserts the **four honest states** (Book 07 §2.2): a `writeValue` reflects into the view, a user edit emits the *model* value (not the label), `disabled` blocks interaction, and `touched`/`errorState` flips at the right moment. This layer is the bulk of the suite.

### 3.4 Layer 3 — integration tests over a composed Forge screen

Component tests verify a component in isolation; **integration tests** verify that several `cae-*` components, a real form, and the DI wiring behave when composed — a representative **Forge** screen (a form dialog, a data table with a toolbar, a stepper). Two design points are Caelum-specific:

- **The adapter boundary is tested with the fallback provider swapped in.** An integration test that exercises a `cae-data-grid` should, by default, provide the **fallback** implementation (the `MatTable`-based `MatGridAdapter`) via `provideCaelumGrid(...)` rather than the live TanStack engine — the DI swap of Book 12 §3.2/§3.4 makes the test deterministic and fast, and *also proves the neutrality contract* (the screen works against either implementation, the "satisfiable two ways" test). The heavy real-engine path is exercised in a smaller, targeted suite, not on every integration run.
- **Composition surfaces the seams unit tests miss** — a `mat-form-field` wrapping a `cae-*` control (Book 07 §3.4), an overlay opening over a table, focus moving between components — the interactions that only exist *between* components.

Integration tests are fewer than component tests (they are slower and broader), but they are where "the screen actually works" is demonstrated — the liveness the project's `definition_of_done` demands, at the screen level.

### 3.5 Layer 4 — visual regression & the golden discipline

The **visual parity** dimension (Book 16 §3.5) is *committed* there and *built* here: a **Playwright** suite renders each component and representative Forge screen in a real browser and compares against a committed **baseline screenshot** across the matrix that matters — **light/dark, RTL, and parity density** (Book 04 §3.3/§3.4/§3.6). The engineering is entirely in the **golden discipline**, because pixel comparison is flake-prone by default:

- **Baselines are committed and reviewed like code** — a diff is a *proposed* change to the visual contract; a human (or the adversarial pass of Book 16 §2.3) decides whether a diff is a regression or an intended change, and only an approved diff updates the golden. Never auto-accept new baselines in CI.
- **Flake is killed at the source, not with a loose threshold** — disable animations/transitions, pin the viewport and device-scale, freeze web fonts (or wait for `document.fonts.ready`), mask volatile regions (timestamps, random ids), and set a *small* per-pixel tolerance rather than a large one that hides real drift.
- **Prefer a harness assertion to a snapshot when the property is semantic** — "the checkbox is checked" is a harness assertion (§3.3), not a screenshot; reserve snapshots for genuinely *visual* properties (spacing, color, density, layout) that no semantic assertion captures. Over-snapshotting is how a visual suite becomes a flaky tax nobody trusts.
- **`@axe-core/playwright` rides the same run** — since the components are already rendered in a real browser for snapshots, the automated-a11y layer (Book 16 §3.2) runs against the *real* light/dark layout here, catching contrast failures that jsdom cannot see. One browser launch, two dimensions verified.

This layer is deliberately the smallest band (it is the slowest and the most maintenance-heavy), and per the ROADMAP cut order it is the first automation to fall back to manual snapshot review if the harness slips — but the *requirement* it serves (visual parity) does not fall back (Book 16 §3.5).

### 3.6 CI wiring & the test-authoring checklist

The layers map onto the project's CI posture (`PROJECT_CONVENTIONS.md` › Operating posture; `docs/AUTOMATION.md`): **unit + component tests are the fast gate** (they run on every PR — jsdom, seconds), while **integration and visual/e2e run in the heavier matrix** (on-label / milestone / post-merge under an advisory posture, since they need a browser). Three disciplines make the gate trustworthy:

- **Determinism is non-negotiable** (the project's determinism gate): no `Date.now()`/`Math.random()`/live network in a test — inject a clock, seed or stub randomness, and stub HTTP at the `HttpClient` seam. A flaky test is worse than no test; it trains the team to ignore red.
- **The whole test toolchain is dev-tier provenance** — Vitest, jsdom, Playwright, `@axe-core/playwright`, axe-core all live in `devDependencies` and are *excluded from the shipped-tree provenance scan* (Book 03 §3.3/§3.4); the M0-4 gate must implement that runtime-vs-dev split (the axe MPL case of Book 16 §3.2 is the worked example). Only Caelum's *runtime* deps face the full US-origin bar.
- **Golden updates are gated** — a baseline change requires review; CI never rewrites goldens on its own (§3.5).

**The test-authoring checklist (this book's leg of the four-legged stool):**

1. **Pure logic → unit** — signals/format-parse/validators tested without a fixture; the R3 locale matrix table-driven (§3.2; Book 08).
2. **Interaction → a component harness** — a `CaeXHarness` per component expressing the pre-committed functional + keyboard scenarios; focus order, roving keys, dismissal + focus restoration, no unintended trap; four control states honest (§3.3; Book 16 §3.1/§3.3; Book 07 §2.2).
3. **Zoneless settling awaited** — `whenStable`/`forceStabilize` before every post-interaction assertion (§3.3; Book 01 §3.2).
4. **Composition → an integration test** on a Forge screen, adapters provided via the deterministic fallback (§3.4; Book 12 §3.2).
5. **Visual dimension → a Playwright snapshot** across light/dark/RTL/density with the golden discipline, `@axe-core/playwright` on the same run (§3.5; Book 16 §3.2/§3.5; Book 04 §3.4).
6. **Deterministic** — no wall-clock/random/network; flake killed at the source (§3.6).
7. **Dev-tier provenance honored** — test deps in `devDependencies`, excluded from the shipped scan (§3.6; Book 03 §3.3).

`definition_of_done` runs legs 1–4 + 6 as its build/test gate; the visual leg (5) joins at milestone/e2e runs; leg 7 is enforced by the M0-4 provenance gate. The a11y-specific legs (axe + keyboard + the adversarial pass) are Book 16's gate — this checklist is the *tooling* that executes them.

## 4. Implementation

Illustrative shapes (Angular 22, signal-first, `OnPush`, Vitest) — not a compileable repo. Version-specific specifics are kept to what the research note verified.

**(a) The runner wiring (§3.1) — `angular.json`, greenfield default.**

```jsonc
// The @angular/build:unit-test builder — Vitest under the hood (research note).
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "tsConfig": "tsconfig.spec.json", "buildTarget": "::development" }
  // jsdom by default; add "browsers": ["chromium"] to opt into real-browser mode.
}
```

**(b) Layer 1 — a format/parse round-trip, table-driven (§3.2; Book 08's R3 matrix).**

```ts
// No TestBed, no DOM — pure Intl round-trip. The single highest-value unit test.
describe('cae-input-number format/parse fidelity (R3)', () => {
  const cases = [
    { locale: 'en-US', model: 1234.5, view: '1,234.5' },
    { locale: 'de-DE', model: 1234.5, view: '1.234,5' },
    { locale: 'en-US', model: 0,      view: '0' },       // 0 is NOT empty
    { locale: 'en-US', model: null,   view: '' },        // null IS empty — distinct from 0
  ];
  for (const c of cases) {
    it(`${c.locale}: ${c.model} <-> "${c.view}"`, () => {
      expect(format(c.model, c.locale)).toBe(c.view);
      expect(parse(c.view, c.locale)).toBe(c.model);     // round-trips both ways
    });
  }
});
```

**(c) Layer 2 — a custom component harness + a keyboard scenario (§3.3).**

```ts
// The harness: semantic operations, not DOM poking — reads as the parity scenario.
export class CaeSelectHarness extends ComponentHarness {
  static hostSelector = 'cae-select';
  private trigger = this.locatorFor('.cae-select__trigger');
  async open()             { await (await this.trigger()).click(); }
  async value()            { return (await this.trigger()).text(); }
  async sendKeys(...k: string[]) { await (await this.trigger()).sendKeys(...k); }
}

it('cae-select: keyboard-operable, emits the model, restores focus (Book 16 §3.1)', async () => {
  const loader = TestbedHarnessEnvironment.loader(fixture);  // runner-agnostic env
  const select = await loader.getHarness(CaeSelectHarness);
  await select.open();
  await select.sendKeys('ArrowDown', 'Enter');
  await fixture.whenStable();                                // zoneless settle (Book 01 §3.2)
  expect(component.value()).toBe('opt-2');                   // the MODEL, not the label
  await select.sendKeys('Escape');
  await fixture.whenStable();
  expect(document.activeElement).toBe(triggerEl);            // focus restored (Book 09 §3.6)
});
```

**(d) Layer 3 — an integration test with the deterministic fallback adapter (§3.4).**

```ts
TestBed.configureTestingModule({
  providers: [provideCaelumGrid(MatGridAdapter)],  // fallback, not live TanStack — deterministic + proves neutrality (Book 12 §3.2)
});
// ...mount a Forge screen (table + toolbar + a cae-* form) and drive it through harnesses.
```

**(e) Layer 4 — a Playwright visual + axe run, one browser launch (§3.5).**

```ts
test('cae-select — visual parity + axe, light & dark', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`/forge/select?theme=${theme}`);
    await page.evaluate(() => document.fonts.ready);                 // flake control
    await expect(page).toHaveScreenshot(`select-${theme}.png`, { animations: 'disabled', maxDiffPixelRatio: 0.001 });
    const axe = await new AxeBuilder({ page }).analyze();            // @axe-core/playwright — real layout (Book 16 §3.2)
    expect(axe.violations).toEqual([]);
  }
});
```

## 5. Bleeding Edge

- **The Vitest default is new and still moving.** Angular 22 made Vitest the default runner (research note), but it is recent enough that the builder options and the migration path are evolving — the note flags "don't hard-pin to a minor" and lists the open **library-vs-application test-wiring** question (how a publishable `ng-packagr` target runs specs) as a *verify-at-M0* item. Treat §3.1 as directionally firm, version-specifically provisional.
- **Browser mode vs jsdom is a real fork.** jsdom is fast but non-layout; Vitest **Browser Mode** (Playwright provider) runs component tests in a real browser — closer to truth for focus, geometry, and computed styles, at a wall-clock cost. The likely Caelum equilibrium: jsdom for the fat component-test middle (fast, most assertions are semantic via the harness), browser mode + Playwright reserved for the layout/visual cases (§3.5) — but the line will move as browser mode matures (research note, `experimental`).
- **The Karma→Vitest migration schematic is experimental — and moot for Caelum.** `refactor-jasmine-vitest` is experimental and partial (research note); it matters to teams *adopting* Caelum who still run Karma (a Book 20 migration concern), not to greenfield Caelum itself. Worth knowing so the adoption guide can speak to it.
- **Screen-reader automation is still not a dependable gate.** As Book 16 §5 notes, Layer 3 (screen-reader semantics) stays partly manual and *ledgered*; no tooling in this book automates it away. Don't let a green Vitest + Playwright suite masquerade as full a11y — the harness proves *keyboard*, axe proves *mechanical*, but the SR judgment is Book 16's manual floor.
- **Visual-regression flake is the perennial tax.** Even with the golden discipline, cross-platform rendering differences (font hinting, sub-pixel AA) make pixel comparison the highest-maintenance layer — the reason it is the ROADMAP cut-order fallback-to-manual. Component-level snapshots on a pinned CI browser image are more stable than full-page ones.

## 6. Gaps & Opportunities

- **`add_test` is the skill this book backs.** The recurring op — given a component's pre-committed scenarios (Book 16 §3.1), scaffold the unit tests + the `CaeXHarness` + the component tests + the Playwright snapshot — is exactly the atomic operation the `LIBRARY_OUTLINE` earmarked; deriving/filling `add_test` against this book is the highest-leverage follow-up.
- **The per-component harness is the generatable artifact.** A `CaeXHarness` is largely mechanical from the component's public API + its scenario set — an agent writes strong first drafts (§7). A small internal convention (harness file next to the component, one predicate per interactive part) would make them uniform and generatable.
- **Golden baselines need a home and a discipline doc.** Where baselines live, how they're reviewed, and how they're updated per platform is a workflow the `reference/` docs (TOOLING.md) should pin before the visual suite grows — otherwise the goldens rot into "always a little red, everyone ignores it."
- **Honest status:** there is **no test infrastructure yet** — no component code exists (M0 hasn't started); this book defines the tooling the M0–M4 components will be tested with. The runner choice (§3.1) is *provisional pending M0* — re-verify Vitest-as-default against the live v22 workspace when scaffolding starts (research note; ties to CONV-1/M0-1). For the live state, the ROADMAP and `MANIFEST.json` `coverage_gaps` are the single home.

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on testing:

- **Scaffolding the harness + the test layers from the scenarios.** Given a component's public API and its pre-committed parity scenarios (Book 16 §3.1), an agent reliably drafts the `CaeXHarness`, the unit tests (especially the table-driven R3 locale matrix, §3.2), the component-harness tests, and the Playwright snapshot spec — mechanical, high-value, and exactly `add_test`'s job.
- **Table-driven fidelity matrices.** The format/parse round-trip across locales × edge inputs (§3.2) is tedious and error-prone by hand and perfect for generation — the agent enumerates the matrix the human would under-sample.
- **Flake triage.** An agent is good at spotting the *cause class* of a flaky test (un-awaited `whenStable`, unmasked timestamp, animation not disabled) from the failure and the test source.

Where it is only ~1× and must defer to a human:

- **"Is this visual diff a regression or intended?"** Approving a new golden baseline is a product/visual judgment (§3.5) — the agent surfaces the diff; the human (or the Book 16 §2.3 adversary) decides, and CI never auto-accepts.
- **Deciding a test is honest, not just green.** Whether the suite actually covers the parity scenario — versus asserting a tautology that passes vacuously — is the review judgment Book 16's two-party split guards; a self-certified green suite from the implementer is the blind spot (Book 16 §2.3).
- **The library-vs-application wiring call at M0.** How the publishable target runs its specs (research note's open question) is a workspace-architecture decision to make with eyes on the real v22 tooling, not to assume from this book.

## 8. Exercises & Further Reading

**Exercises:**
1. Wire the `@angular/build:unit-test` builder in a scratch v22 workspace and run one component test under jsdom; then flip it to browser mode (`browsers: ['chromium']`) and observe which assertions change behavior (§3.1; research note).
2. Write the R3 **locale matrix** unit test (`en-US`/`de-DE`/RTL × paste × negatives × `0`/`null`) for a format/parse pair, table-driven, and make it fail on a `0`-vs-`null` confusion (§3.2; Book 08).
3. Author a `CaeSelectHarness` and use it to prove the full keyboard scenario — open on Enter, roving arrows, select emits the model, Escape restores focus to the trigger — awaiting `whenStable` at each step; reach an overlay via `documentRootLoader` (§3.3; Book 09 §3.6; Book 16 §3.3).
4. Write an integration test for a Forge form screen that provides the **fallback** grid adapter via `provideCaelumGrid`, and argue why the deterministic fallback both speeds the test and proves the neutrality contract (§3.4; Book 12 §3.2).
5. Stand up a Playwright snapshot for one component across light/dark/density with the golden discipline (animations off, fonts ready, small tolerance), add `@axe-core/playwright` to the same run, and deliberately introduce a dark-only contrast failure to watch axe catch what the snapshot's tolerance hides (§3.5; Book 16 §3.2/§3.5; Book 04 §3.4).
6. **The determinism drill:** take a flaky test that reads state before `whenStable` and one that snapshots an unmasked timestamp, and fix both at the source (§3.6).

**Further reading:** the runner/toolchain grounding for this book is [`research/notes/angular-22-testing.md`](../../research/notes/angular-22-testing.md) (a research note — web-sourced and staling, **not** a `Book §`), alongside its sibling [`research/notes/a11y-testing-tooling.md`](../../research/notes/a11y-testing-tooling.md) for the CDK harness + axe facts; the Angular testing guide at [`angular.dev/guide/testing`](https://angular.dev/guide/testing) and the CDK component-harness guide at [`angular.dev`](https://angular.dev/guide/testing/using-component-harnesses); Vitest at [`vitest.dev`](https://vitest.dev) and Playwright at [`playwright.dev`](https://playwright.dev). In this library: the verification this tooling *serves* — Book 16 (the capability ledger, pre-committed scenarios, the three layers this book builds; §3.1/§3.2/§3.3/§3.5/§2.2); the CDK a11y engine the harness drives (Book 05 §3.2); the zoneless change-detection the harness settles (Book 01 §3.2); the control contract tests assert (Book 07 §2.2/§3.1/§3.4); the overlay dismissal/focus-restoration the harness reaches via `documentRootLoader` (Book 09 §3.6); the R3 locale fidelity the unit matrix guards (Book 08); the adapter boundary integration tests swap at (Book 12 §3.2); the token/density dimensions the visual suite renders (Book 04 §3.4/§3.6); and the runtime-vs-dev provenance rule the whole dev-tier toolchain exercises (Book 03 §3.3). Forward to Book 18 (Performance & Bundle Budgets — profiling and bundle-size gates, the other half of "is done," where the grid-at-scale tests get their perf budgets) and Book 20 (Migration & Adoption — where an adopting team's own Karma→Vitest path and the parity scenarios become their confidence). **This is the second book of Volume IV — Quality.**
