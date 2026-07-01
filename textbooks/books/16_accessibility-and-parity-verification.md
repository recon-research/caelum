# Book 16 — Accessibility & Parity Verification

> Volume IV, Book 1 — **opens the Quality volume.** Volumes I–III built the library: the platform (I), the component families on primitives (II), and the adapter layer for the three gaps (III). Every one of those books ended with a *parity leg* — a per-component checklist (Book 09 §3.6, Book 10 §3.6, Book 11 §3.5/§3.6) or an adapter a11y section (Book 13 §3.6, Book 14 §3.4, Book 15 §3.5). **This book is the engine that verifies all of them.** It turns the project's standing promise — "looks done" is not "is done" — into a repeatable procedure: a **capability ledger**, **pre-committed parity scenarios**, the **implementer-vs-adversarial split**, and the three verification layers (**axe + keyboard + screen reader**). Methodology is grounded in the intake brief (`brief §6`, `brief §7`); the tool specifics (axe-core's version/license, the CDK harness) are grounded in [`research/notes/a11y-testing-tooling.md`](../../research/notes/a11y-testing-tooling.md) — cited as a research note, never as a `Book §`. It is the backing book for the `verify_parity` skill and the a11y/parity gates of `definition_of_done`.

## 1. TL;DR

The whole library exists to let a team leave PrimeNG **without losing parity** — so the library is only as good as its *proof* of parity, and proof is this book's subject. The spine is four ideas. (1) **"Looks the same" is not "is the same"** (`brief §6`): a Material component can render pixel-close to its PrimeNG counterpart and still fail a keyboard user, a screen reader, or an edge-case interaction — the gap "looks done" hides. (2) The **capability ledger** tracks every component through earned states (`untouched → scaffolded → implementer-passed → adversarial-passed`); nothing ships below `adversarial-passed` (ROADMAP M4). (3) **Pre-committed parity scenarios** — the functional/a11y/visual checks are written *before* "done" can be claimed, derived from what the PrimeNG component actually does, so the bar can't move to meet the implementation. (4) The **implementer-vs-adversarial split** (`brief §7`): the party who built it does the implementer pass; a *separate* adversary, mandated to falsify, does the adversarial pass — the same two-party discipline as `adversarial_review`. Verification runs in three layers of decreasing automation and increasing value: **axe-core** (broad, shallow, necessary-not-sufficient — and a useful provenance lesson: it is **MPL-2.0**, admissible only because it is a dev/test tool, Book 03 §3.3); **keyboard** operability through the CDK `ComponentHarness` (every interaction, focus order, no unintended traps); and **screen-reader semantics** + the human adversarial pass (what no engine catches). This book is the backing for `verify_parity` and the a11y gate of `definition_of_done`.

## 2. Conceptual Foundations

### 2.1 "Looks the same" is not "is the same" — the parity trap

PrimeNG parity is a *behavioral* contract, not a visual one. A `cae-*` component reaches visual parity the moment it renders like its `p-*` predecessor — and that is the most dangerous moment, because the eye now says "done" while three things remain unverified: whether every interaction is operable **without a mouse**, whether a **screen reader** announces the right role/name/state, and whether the **edge cases** the PrimeNG component handled (empty/error/loading, RTL, dense layouts, long content) still hold (`brief §6`). The cost of the trap is asymmetric: a missed pixel is noticed and filed; a missed keyboard path or a silent control ships, fails a real user, and surfaces as a parity regression long after adoption. So the book's foundational stance is *adversarial toward the rendering*: a component is presumed **not** at parity until a procedure proves it, and "it looks right" is treated as evidence of nothing.

### 2.2 The capability ledger — the states a component earns

Parity is not binary, so it is tracked as a **ledger**: a living table with one row per component and a **state** it has *earned* (the project's M4 vocabulary, `brief §6`):

- **`untouched`** — not yet built.
- **`scaffolded`** — the component exists and renders, but nothing is verified (the visual-parity-only state §2.1 warns about).
- **`implementer-passed`** — the builder ran the pre-committed scenarios (§3.1) across all three layers and they pass.
- **`adversarial-passed`** — a *separate* party (§2.3) re-ran and tried to *break* the scenarios, found nothing disqualifying, and signed off.

The states are **monotonic per verification but reset on change**: a code change to a component at `adversarial-passed` drops it back to `implementer-passed` (re-verify) — exactly the dev-dependency re-vet discipline of Book 03 §3.4, applied to a11y. The ledger is the single home for "where is each component, really" (the `MANIFEST`-style honesty rule); a component is shippable only at `adversarial-passed`, and the milestone exit (ROADMAP M4) is "the ledger shows every shipped component at `adversarial-passed`."

### 2.3 The implementer and the adversary — two passes, two parties

The reason a single pass is insufficient is the same reason `adversarial_review` exists: the party that built a thing is the worst-placed to find its flaws, because they verify *what they intended*, not *what they wrote* (`brief §7`). So verification is split. The **implementer pass** confirms the component meets its pre-committed scenarios — an honest "I did the thing." The **adversarial pass** is run by a different party (a different agent, or a human) whose mandate is to **falsify**: tab through in an unexpected order, paste pathological content, shrink the viewport, switch to RTL and dark and maximum density, run the screen reader and listen for silence. The split is structural, not a matter of effort: the same agent doing both passes collapses into the implementer's blind spot (§7). This is the a11y-specific instance of the project's standing review discipline, and `definition_of_done`'s a11y gate requires the adversarial pass for anything risky or at a milestone exit.

## 3. Architecture & Design

§3.1 writes the bar before "done" can move it; §3.2–§3.4 are the three verification layers (axe → keyboard → screen reader); §3.5 names the three parity *dimensions* those layers serve; §3.6 is the checklist and the ledger gate that wire into `definition_of_done`.

### 3.1 Pre-committed parity scenarios — write the bar before "done" can move it

For each component, the parity scenarios are authored **before** it is declared done and, ideally, derived from the PrimeNG component's documented behavior — so the target is fixed independently of how Caelum implemented it (`brief §6`; the COMPARISON migration map of `LIBRARY_OUTLINE` reference docs is the source of "what the `p-*` component does"). A scenario set has three faces (§3.5): **functional** (the interactions and states — select, dismiss, sort, the empty/error/loading cases), **a11y** (role/name/state, keyboard path, focus management, announcements), and **visual** (light/dark, density, RTL, long-content). Pre-commitment is what defeats the §2.1 trap: if the scenarios are written after the implementation, they unconsciously describe what was built rather than what parity requires, and the bar silently lowers to meet the code. The scenarios live with the component and are the literal content the two passes (§2.3) execute.

### 3.2 Layer 1 — automated: axe-core, broad and shallow (and the MPL dev-tier lesson)

The first layer is **axe-core** (the Deque accessibility engine), run both in component tests and against rendered pages via `@axe-core/playwright` (research note). It is **broad and shallow**: it reliably catches color-contrast failures, missing accessible names, invalid ARIA, and duplicate ids across the whole tree in milliseconds — the mechanical violations no one should be finding by hand. It is also, by nature, **necessary but not sufficient**: an automated engine catches only a minority of real WCAG issues (research note — the exact proportion is deliberately not asserted), so a green axe run is the *floor*, never the proof. Two disciplines make it count: run it in **both themes and at parity density** (a contrast failure often appears only in dark or dense, Book 04 §3.4/§3.6), and treat **zero violations as a merge gate**, not a dashboard. A provenance lesson rides along, and the book makes it explicit: **axe-core is MPL-2.0** — a weak/file-level *copyleft* license that Book 03 §2.2 would flag for a *runtime* dependency — yet it is admitted here because it is a **dev/test tool, never shipped** in Caelum's published package, so the copyleft never reaches Caelum's source (Book 03 §3.3, the runtime-vs-dev distinction made concrete). It is the canonical example of a license that is rejected for a runtime dep and fine for a CI tool.

### 3.3 Layer 2 — keyboard operability through the CDK harness

The second layer is **keyboard operability**, and it is where parity most often breaks (every component book's parity leg names it — Book 10 §3.6, Book 11 §3.5, Book 13 §3.6). The mechanism is the Angular CDK **component test harness**: `TestbedHarnessEnvironment` for unit/component tests, with a `documentRootLoader` to reach overlay content rendered outside the fixture (dialogs, menus, the picker overlays of Book 09) (research note). A harness drives the component the way a keyboard user would — Tab/Shift-Tab to walk focus order, arrow keys for roving-tabindex widgets (Book 06 §2.2 patterns, Book 05 §3.2 key managers), Enter/Space/Escape for activation and dismissal — and asserts what *happened*: focus landed where expected, the overlay dismissed on Escape and **restored focus to the trigger** (Book 09 §3.6), no focus trap exists except the intended modal one. The harness is the right tool because it tests *semantic interaction* rather than DOM coordinates, so it survives refactors and reads as the parity scenario it encodes. (The harness is runner-agnostic; the test-runner choice and the harness's async/`whenStable` settling under a zoneless host (Book 01 §3.2) are Book 17's subject, not this book's.)

### 3.4 Layer 3 — semantics & the screen reader (the manual floor)

The third layer is what neither axe nor the harness fully covers: **does it make sense to a screen reader, in use?** Axe checks that a name/role/state *exists*; it cannot check that the name is *meaningful*, that a sort change is *announced* (the `LiveAnnouncer` path of Book 05 §3.2, threaded through Book 10 §3.6's `aria-sort` and Book 13 §3.6), that a chart conveys its *data* and not just `role="img"` silence (Book 14 §3.4), or that an editor's toolbar reflects active marks audibly (Book 15 §3.5). This layer is **partly manual** — a human (or an SR-automation harness where one exists, §5) drives an actual screen reader through the pre-committed scenarios and listens. It is the most expensive layer and the one most often skipped, so the book makes it a *named, ledgered* step rather than an aspiration: a component cannot reach `adversarial-passed` (§2.2) without the semantics layer exercised, because "every element has a role" routinely coexists with "the component is incomprehensible by ear."

### 3.5 The three parity dimensions — functional, accessible, visual

The three layers (§3.2–§3.4) serve three **dimensions** of parity, and naming them keeps a verification honest about what it has and hasn't shown:

- **Functional parity** — the component does what the `p-*` one did: every interaction, and every state (empty/loading/error, validation, the value-fidelity cases of Book 07 §2.2). Verified mostly by the harness (§3.3).
- **Accessible parity** — operable by keyboard, comprehensible by screen reader, conformant to ARIA. Verified across all three layers, with §3.4 as the floor no automation reaches.
- **Visual parity** — matches PrimeNG's look *and density* across light/dark/RTL, with **every value from a token** (Book 04 §3.6, the no-literal invariant) and **density as the explicit parity lever** (Book 04 §3.4, R4). Verified by rendered-page checks (the visual-regression suite is Book 17's build; here it is a dimension, not a tool).

A component at parity is green on **all three**; the ledger state (§2.2) is earned only when the pre-committed scenarios for all three dimensions pass under both the implementer and the adversary.

### 3.6 The verification checklist + the ledger gate

The leg this book contributes to the four-legged stool (the a11y/parity analogue of every component book's checklist):

1. **Scenarios pre-committed** — functional/a11y/visual scenarios authored before "done," derived from the `p-*` behavior (§3.1).
2. **Layer 1 green** — axe-core 0 violations in **both themes** and at parity density, as a merge gate (§3.2; Book 04 §3.4/§3.6).
3. **Layer 2 green** — keyboard operability proven via the CDK harness: focus order, roving keys, dismissal + focus restoration, no unintended trap (§3.3; Book 05 §3.2; Book 09 §3.6).
4. **Layer 3 exercised** — screen-reader semantics + announcements verified (manually or via an SR harness); names are meaningful, state changes are announced (§3.4).
5. **All three dimensions** — functional **and** accessible **and** visual parity each shown, not just the visible one (§3.5).
6. **Two parties** — implementer pass *and* a separate adversarial pass; the adversary tried to break it (§2.3; `adversarial_review`).
7. **Ledger updated** — the component's row moved to its earned state; nothing ships below `adversarial-passed`, and a later change resets it (§2.2).

`definition_of_done` enforces legs 2–4 and 6 as its a11y-parity gate (axe + keyboard, with the adversarial pass for risky/milestone work); the ledger (leg 7) is the milestone-level exit (ROADMAP M4).

## 4. Implementation

Illustrative shapes (Angular 22, signal-first, `OnPush`) — not a compileable repo. Tool specifics are kept to what the research note verified.

**(a) The capability ledger as a real artifact (§2.2).** A committed table (or a small JSON the milestone audit reads), one row per component:

```md
| component   | functional | accessible | visual | state               | last-verified |
|-------------|-----------|------------|--------|---------------------|---------------|
| cae-select  | ✓         | ✓          | ✓      | adversarial-passed  | 2026-07-02    |
| cae-data-grid | ✓       | ◐ (SR todo)| ✓      | implementer-passed  | 2026-07-02    |
| cae-editor  | ✓         | ✓          | ◐ dark | implementer-passed  | 2026-07-03    |
```

**(b) A pre-committed parity scenario set (§3.1) — authored from the `p-*` behavior, before "done."**

```ts
// cae-select.parity.ts — the bar, fixed independently of the implementation
export const caeSelectParity = {
  functional: ['opens on click and on Enter/Space', 'selects with Enter', 'emits the model value not the label', 'shows empty/loading/error states'],
  a11y:       ['role=combobox + aria-expanded', 'arrow keys move active option (roving)', 'Escape closes and restores focus to trigger', 'screen reader announces the selected option'],
  visual:     ['light + dark', 'parity density (R4)', 'RTL', 'long option text truncates like p-dropdown'],
};
```

**(c) Layer 1 + Layer 2 — axe + the CDK harness (§3.2, §3.3).**

```ts
it('cae-select: axe clean in both themes', async () => {
  for (const theme of ['light', 'dark']) {
    setTheme(theme);
    const results = await axe.run(fixture.nativeElement);   // axe-core (MPL, dev-only — §3.2)
    expect(results.violations).toEqual([]);                 // 0 = the merge-gate floor, not the proof
  }
});
it('cae-select: keyboard-operable via the harness', async () => {
  const loader = TestbedHarnessEnvironment.loader(fixture);            // unit-test harness env (research note)
  const select = await loader.getHarness(CaeSelectHarness);
  await select.open();                                                // drives it as a keyboard user would
  await select.sendKeys('ArrowDown', 'Enter');
  expect(await select.value()).toBe('expected-model-value');          // assert what HAPPENED, not coordinates
  await select.sendKeys('Escape');
  expect(await isFocused(triggerEl)).toBe(true);                      // dismissal restores focus (Book 09 §3.6)
});
```

**(d) The adversarial pass (§2.3) — a separate party mandated to falsify.** Not new code but a different *runner*: a second agent or human re-executes the scenarios trying to break them (unexpected focus order, pathological paste, RTL+dark+max-density, the screen reader on Layer 3), and only then is the ledger row moved to `adversarial-passed`. The two-party rule is the point — the implementer cannot self-certify this state.

The `verify_parity` skill packages (a)–(c) per component; `definition_of_done` calls the a11y gate; `adversarial_review` is the (d) lens for risky components.

## 5. Bleeding Edge

- **Automation has a hard ceiling, and the book is honest about it.** axe catches the mechanical minority (§3.2); the majority — meaningful names, logical focus order, comprehensible announcements — needs Layers 2–3. The frontier worth watching is **screen-reader automation** (driving NVDA/VoiceOver assertions in CI), which is maturing but not yet a dependable gate; until it is, Layer 3 stays partly manual and *ledgered* (§3.4) rather than pretended-automated. Don't let a green axe dashboard masquerade as accessibility.
- **WCAG 2.2 and the moving target.** The conformance target is WCAG 2.2 AA, and axe-core tags its rules by WCAG level — but the exact 2.x/AA tag coverage at the pinned axe version is a *verify-against-the-docs* fact (research note Caveats), not an assumption. Re-check the tag coverage when pinning axe, and re-baseline scenarios when the standard moves.
- **Visual-regression is a dimension here, a build in Book 17.** §3.5's visual parity is verified by rendered-page snapshots (light/dark/RTL/density); the *harness* for that (Playwright snapshots, the golden discipline, flake control) is Book 17's subject and the M4 visual-regression suite. This book commits the *requirement*; Book 17 builds the *tooling*. Keep the boundary clean so neither book re-homes the other's content.

## 6. Gaps & Opportunities

- **`verify_parity` is the skill this book backs.** The recurring op — run a component's pre-committed functional/a11y/visual scenarios across the three layers and update its ledger row — is exactly the kind of atomic operation the `LIBRARY_OUTLINE` earmarked as a domain skill (`verify_parity`, citing this book). Deriving it is the highest-leverage follow-up.
- **The ledger wants to be machine-read.** A JSON ledger the milestone audit can parse (state per component) turns "is M4 done?" into a script, not a meeting — the CMMI-L4 instinct of the project's metrics ledger applied to parity.
- **Screen-reader automation is the immature layer.** Until SR assertions are CI-dependable (§5), Layer 3 is the bottleneck; investment there has the highest marginal value, and the book flags it rather than papering over it.
- **Honest status:** no component is at `adversarial-passed` yet — there is no component *code* (M0 hasn't started); this book defines the verification the M0–M4 components will run. For the live state, the ledger (when it exists) and `MANIFEST.json` `coverage_gaps` are the single home.

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on verification:

- **Scaffolding scenarios + the implementer pass.** Given a `p-*` component's documented behavior (the COMPARISON map), an agent reliably drafts the pre-committed functional/a11y/visual scenarios (§3.1) and writes the axe + CDK-harness tests (§3.2–§3.3) — mechanical, high-value, and exactly the `verify_parity` skill's job.
- **Being the adversary — with the two-party rule enforced structurally.** An agent makes a strong falsifier (it will tab in orders a human wouldn't, paste pathological input, permute theme×density×direction) — but **the adversarial pass must be a *different* agent instance than the implementer** (§2.3), or it inherits the implementer's blind spot. The fan-out is `adversarial_review`'s shape: independent reviewers mandated to break the scenarios, not to confirm them.
- **Catching the "axe-green = accessible" fallacy.** The agent's standing reminder is that a clean axe run is the floor (§3.2); it should refuse to mark a component `adversarial-passed` on automation alone and insist the Layer-3 (screen-reader) step was exercised.

Where it is only ~1× and must defer to a human:

- **The screen-reader judgment (Layer 3).** Whether an announcement is *meaningful* and the experience is *comprehensible by ear* is a perception call automation can't yet make (§3.4, §5) — the human is the floor here.
- **"Is this real parity?"** The final sign-off that a component honestly replaces its `p-*` predecessor — across the edge cases a team actually depends on — is a product judgment (`brief §6`), not the agent's to close.
- **The dev-tier provenance carve-out.** That axe-core's MPL-2.0 is acceptable *because it's unshipped* is a compliance judgment (Book 03 §3.3) to confirm, not assume.

## 8. Exercises & Further Reading

**Exercises:**
1. Write the pre-committed parity scenario set for `cae-select` (functional/a11y/visual), derived from `p-dropdown`'s documented behavior — **before** looking at any implementation (§3.1; `brief §6`).
2. Wire axe-core into a component test and make it a gate that runs in **both light and dark and at parity density**; find a contrast failure that appears only in one combination (§3.2; Book 04 §3.4/§3.6).
3. **The MPL drill:** find axe-core's `MPL-2.0` license in its package metadata and write the one-paragraph justification for why it is admissible as a dev dependency but would be rejected as a runtime one (§3.2; Book 03 §2.2/§3.3; research note).
4. Use the CDK `ComponentHarness` to prove an overlay component dismisses on Escape **and restores focus to its trigger**, reaching the overlay via `documentRootLoader` (§3.3; Book 09 §3.6).
5. **Two-party drill:** have one agent implement-pass a component and a *separate* agent adversarial-pass it; record what the adversary found that the implementer missed, and move the ledger row only on the second pass (§2.3, §2.2; `adversarial_review`).

**Further reading:** the tooling/provenance grounding for this book is [`research/notes/a11y-testing-tooling.md`](../../research/notes/a11y-testing-tooling.md) (a research note — web-sourced and staling, **not** a `Book §`); axe-core at [`deque.com/axe`](https://www.deque.com/axe/) and the Angular CDK component harness guide at [`angular.dev`](https://angular.dev/guide/testing/using-component-harnesses); WCAG 2.2 at [`w3.org/TR/WCAG22`](https://www.w3.org/TR/WCAG22/) as the conformance target. In this library: every component book's parity leg this engine verifies — Book 09 §3.6 (overlay dismissal/focus), Book 10 §3.6 (table a11y/aria-sort/LiveAnnouncer), Book 11 §3.5 (drag-drop keyboard path), Book 13 §3.6 (grid a11y), Book 14 §3.4 (the chart a11y case), Book 15 §3.4/§3.5 (the editor as a form control + its a11y); the CDK a11y engine they all build on (Book 05 §3.2); the Aria patterns that supply ARIA/keyboard (Book 06 §2.2); the four control states verification confirms (Book 07 §2.2); the token/density dimensions of visual parity (Book 04 §3.4/§3.6); and the runtime-vs-dev provenance rule the axe lesson exercises (Book 03 §3.3). Forward to Book 17 (Testing Strategy & Tooling — the runner, the harness depth, and the visual-regression suite this book requires), Book 18 (Performance & Bundle Budgets — the other half of "is done"), and Book 20 (Migration & Adoption — where the parity scenarios become the adopter's confidence). **This book opens Volume IV — Quality.**
