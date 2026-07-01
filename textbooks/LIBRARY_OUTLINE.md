# Caelum Knowledge Library — Approved Build Spec

> **Status: approved 2026-06-29.** This is the human-approved outline that [`build_library`](../.claude/skills/build_library/SKILL.md) executes across multiple sessions (per [`LIBRARY_SEED.md`](LIBRARY_SEED.md) §3 build order). It is the durable record of *what to write*; it survives compaction. Update the **Progress** table as books land. The gate for every pass: all four `tools/` audits green (refs · routing · links · sections regenerated).

## Identity (feeds MANIFEST scaffolding)

- **series_title:** `Caelum — Building a US-Origin-Clean Angular Material Component Library`
- **system_name (canonical example):** `Forge` — a demo admin console the books build throughout.
- **Library name / selectors:** library **Caelum**; component selector `cae-*`; class prefix `Cae<Name>`; design tokens `--cae-<group>-<role>`.
- **primary_assumptions:** language = TypeScript (Angular 22) + SCSS; key_tools = Angular Material 22, Angular CDK 22, Angular Aria, ESLint/Prettier, axe-core, Playwright; platforms = evergreen browsers, Node LTS build.
- **The two canonical constraints** (every book respects them): **no paid license**; **US-origin only, transitive tree included** (intake brief §0; `docs/ARCHITECTURE.md` D-05). The operative "US-origin" rule is **D-10**: maintaining entity HQ'd in US + permissive license + no non-US runtime transitive dep.
- **Team usage priority (2026-06-29):** tables, forms, buttons, dynamic dialog, steppers, tree view, image carousel rank highest; **charts/editor are deprioritized** (Books 14–15 lower urgency; charts not in current use). Book-*writing* still proceeds in volume order, but when component **code** starts, build to this ranking (see `docs/ROADMAP.md`).

## Grounding discipline (read before writing any book)

- Cite the intake brief as `brief §N` until books exist; cross-reference other books as `Book NN §X` **only after** the target section is written (verify against `SECTIONS.json`).
- **Version-specific claims are frontier.** Angular 22 went stable 2026-06-03 — *after* the model's training cutoff. Any concrete Angular-22 / Material-22 / Aria API or feature claim must be grounded by a [`research_topic`](../.claude/skills/research_topic/SKILL.md) note (real fetched URL + date + tier) or marked explicitly as "verify against 22 docs." **Do not fabricate version specifics.** Architectural patterns (standalone components, signals, CVA, CDK overlay/a11y) are stable and transfer; specific 22-only APIs need a source.
- After each book: `python tools/_gen_sections.py` → run the four audits → fix to green → CHANGELOG entry → tick the Progress table.

## The curriculum — 5 volumes / 20 books

### Volume I — Foundations (stack, reactivity, rules)
1. **Angular 22 Architecture for a Component Library** — standalone components, zoneless change detection, signals & DI, the Material/CDK version-lockstep, library-vs-app workspace shape. *Grounding: brief §0; research-ground 22 specifics.*
2. **Reactivity & Forms in Angular 22** — signals, signal inputs/outputs/queries, reactive forms, `ControlValueAccessor` foundations (the basis for every form control). *Grounding: brief §3 form rows.*
3. **Provenance & Licensing Discipline** — the two hard rules, license taxonomy (MIT/BSD/Apache vs PrimeUI-style), transitive-dep auditing (`npm ls` + license scan), the admit/reject gate. *Grounding: brief §0, §4; D-05.*
4. **The Theming Token Bridge** — Material 22 design tokens, CSS custom properties, light/dark, density, RTL, achieving PrimeNG-parity density/aesthetics. *Grounding: brief §2.2; D-04.*

### Volume II — Building on Primitives
5. **CDK Primitives** — Overlay, Portal, A11y (FocusTrap/LiveAnnouncer/FocusMonitor/InteractivityChecker), DragDrop, Scrolling/Virtual, Menu, Listbox, Stepper, Table. *Grounding: brief §1, §3.*
6. **Angular Aria Headless Primitives** — the first-party ARIA building blocks (stable in 22); when to reach for Aria vs CDK vs Material. *Grounding: brief §0; research-ground.*
7. **Form Control Fundamentals** — CVA deep dive, validation, error states, `mat-form-field` integration, FloatLabel/IconField/InputGroup. *Grounding: brief §3 form rows.*
8. **Numeric, Mask & Specialized Inputs** — InputNumber/InputMask/InputOtp/Password-meter/KeyFilter directives; locale/currency/paste/negative parity (R3 scar). *Grounding: brief §3, §8.*
9. **Overlay & Menu Components** — OverlayPanel, ConfirmPopup/ConfirmDialog, CascadeSelect, TreeSelect, Mention, context/tiered/panel menus, breadcrumb. *Grounding: brief §3 overlay/menu rows.*
10. **Data Tables & Virtualization** — MatTable patterns, sort/paginate/sticky/expandable, **grid-vs-table by row count** (R1 scar), `cdk-virtual-scroll`, TreeTable. *Grounding: brief §3 data rows, §8.*
11. **Layout, Panels, Media & Drag-Drop** — accordion/card/tabs/stepper/toolbar/splitter, OrderList/PickList, ScrollPanel, **image Carousel/Galleria/Image-preview (media — a team priority)**, CDK drag-drop patterns. *Grounding: brief §3 panel/data/media rows.*

### Volume III — The Adapter Layer (the three gaps)
12. **The Adapter Pattern** — the neutral, app-owned interface; the "only the adapter touches it" rule; swappability; ESLint `no-restricted-imports` enforcement. *Grounding: brief §2.1, §8; D-03.*
13. **Data Grid Adapter** — headless grids (TanStack), the neutral grid interface, server-side/grouping/virtual rows/export, Material-styled cell rendering. *Grounding: brief §4; D-07.*
14. **Charts Adapter** — render-it-yourself (visx/D3), the neutral chart interface, theming via tokens, sizing the chart need. *Grounding: brief §4, §9.3; D-08.*
15. **Rich-Text Editor Adapter** — Lexical behind a neutral editor interface, CDK toolbar, the `contenteditable` fallback. *Grounding: brief §4; D-09.*

### Volume IV — Quality: A11y, Testing & Performance
16. **Accessibility & Parity Verification** — the capability ledger (`untouched→…→adversarial-passed`), pre-committed scenarios, axe + keyboard + SR testing, separating implementer vs adversarial passes. *Grounding: brief §6, §7.*
17. **Testing Strategy & Tooling** — unit/component/integration, Angular `ComponentHarness`, Playwright visual/interaction, golden discipline, CI wiring. *Grounding: brief §6; PROJECT_CONVENTIONS.*
18. **Performance & Bundle Budgets** — tree-shaking, lazy/standalone, change detection/zoneless, grid-at-scale profiling, bundle-size gates. *Grounding: brief §8 (MatTable at scale); research-ground 22 zoneless.*

### Volume V — Distribution & Adoption
19. **Packaging, Versioning & Distribution** — ng-packagr, peer deps, semver, secondary entry points, publishing, provenance attestation shipped in the package. *Grounding: D-06 (downloadable library).*
20. **Migration & Adoption** — the PrimeNG→Caelum component map (the living migration map), schematics/codemods for `p-*`→`cae-*`, incremental adoption by a consuming team, adapter-erosion prevention. *Grounding: brief §3, §5, §8; R7.*

## Reference docs (`reference/`)

Universal (templates already present, fill for the domain): GLOSSARY · INDEX · ANTI_PATTERNS · DECISION_TREES · SYMPTOMS · PATTERNS · WORKFLOWS · STARTER_KIT.
**Domain-specific (add):**
- **COMPARISON.md** — PrimeNG vs Material+CDK vs Caelum, component-by-component (the brief §3 migration map lives here as the canonical living table).
- **TOOLING.md** — Angular/Material/CDK/testing stack choices with honest trade-offs.
- **PROVENANCE.md** — the US-origin/licensing realities, the vetting procedure, and the admit/reject ledger per third-party lib (the "business/ops realities" doc).

## Vision (`vision/`)
PROLOGUE (why provenance-clean UI matters) · FUTURES · MOONSHOTS — light.

## Domain execution skills to derive (after the backing books exist)
- **add_component** — scaffold a parity-mapped `cae-*` component + spec + capability-ledger row (Books 5–11).
- **add_adapter** — neutral interface + isolated adapter + the ESLint isolation rule (Book 12).
- **add_design_token** — add/override a token in the bridge, light+dark (Book 4).
- **verify_parity** — run a component's pre-committed parity scenarios (functional/a11y/visual) (Book 16).
- **audit_provenance** — transitive US-origin + license scan over the dependency tree (Book 3).
These gradually replace the template's domain-irrelevant skills (`add_telemetry_event`, `generate_content`).

## Build order (per LIBRARY_SEED §3)
Scaffold MANIFEST per book as written → write books in volume order (research-ground Vol I version claims first) → fill reference docs → derive domain skills → regenerate SECTIONS + write ROUTING_EVAL cases → four audits green → **adversarial errata pass** (`adversarial_review` over the books as content) → CHANGELOG.

## Progress
_**20 of 20 books written — THE 20-BOOK CAELUM LIBRARY IS COMPLETE (all five volumes, Books 01–20, 2026-06-29 → 2026-07-01).** Volume I (Foundations): Angular 22 Architecture, Reactivity & Forms, Provenance & Licensing, the Theming Token Bridge. Volume II (Building on Primitives): CDK Primitives, Angular Aria Headless Primitives, Form Control Fundamentals, Numeric/Mask/Specialized Inputs, Overlay & Menu Components, Data Tables & Virtualization, Layout/Panels/Media & Drag-Drop. Volume III (The Adapter Layer): **Book 12, The Adapter Pattern** + **Book 13, Data Grid Adapter** (headless TanStack/D-07, grounded in `research/notes/tanstack-table.md`) + **Book 14, Charts Adapter** (render-it-yourself D3/D-08 — visx is React-bound, refining D-08 to D3-direct; grounded in `research/notes/visx-charts.md`) + **Book 15, Rich-Text Editor Adapter** (Lexical/D-09 — the favorable mirror of visx: Lexical's core is framework-agnostic, so D-09 stands as-is; the editor is also a form control via CVA; grounded in `research/notes/lexical-editor.md`). Volume IV (Quality): **Book 16, Accessibility & Parity Verification** (opens the volume — the capability ledger, pre-committed parity scenarios, the implementer-vs-adversarial split, axe + keyboard + screen reader; grounded in `research/notes/a11y-testing-tooling.md`, with the lesson that axe-core is MPL-2.0, admissible only as a dev/test tool) + **Book 17, Testing Strategy & Tooling** (the test pyramid bent for a component library, the frontier fact that Angular 22's default unit-test runner is now **Vitest** with Karma legacy, the CDK `ComponentHarness` depth, the unit/component/integration/visual layers, Playwright + the golden discipline, and the whole toolchain as dev-tier provenance; grounded in `research/notes/angular-22-testing.md`) + **Book 18, Performance & Bundle Budgets** (completes the volume — performance as a budgeted/gated dimension *profiled, not guessed*; the **two** size gates, the Forge-app `angular.json` budgets vs the shipped-library per-secondary-entry-point gate; tree-shaking via APF/`sideEffects`/secondary entry points; `@defer` lazy loading; zoneless/OnPush change-detection cost proven with the DevTools profiler; grounded in `research/notes/angular-22-performance.md`). Volume V (Distribution & Adoption) is now COMPLETE (2/2): **Book 19, Packaging, Versioning & Distribution** (ng-packagr + the Angular Package Format, the `exports` map + secondary entry points, peer deps + lockstep semver, `ng-update` migrations, and npm/SLSA build provenance vs the separately-shipped US-origin attestation — the two orthogonal provenances; grounded in `research/notes/angular-22-packaging.md`) and **Book 20, Migration & Adoption** (the living PrimeNG→Caelum `p-*`→`cae-*` component map in `reference/COMPARISON.md`; the strangler-fig incremental adoption; the standalone `ng generate caelum:migrate-from-primeng` codemods, distinct from Book 19's `ng-update`; and the forward-only lint-ratchet fitness function that converges the migration and prevents adapter erosion — Book 12 §3.3 generalized). **The 20-book library is complete — next is `git init` + public go-live (REPO-1), then the M0 code scaffold.**_

| Vol | Books | Status |
|---|---|---|
| I | 1–4 | ☑ 4/4 — ☑ Book 01, ☑ Book 02, ☑ Book 03, ☑ Book 04 |
| II | 5–11 | ☑ 7/7 — ☑ Book 05, ☑ Book 06, ☑ Book 07, ☑ Book 08, ☑ Book 09, ☑ Book 10, ☑ Book 11 |
| III | 12–15 | ☑ 4/4 — ☑ Book 12 (The Adapter Pattern), ☑ Book 13 (Data Grid Adapter), ☑ Book 14 (Charts Adapter), ☑ Book 15 (Rich-Text Editor Adapter) — VOLUME COMPLETE |
| IV | 16–18 | ☑ 3/3 — ☑ Book 16 (Accessibility & Parity Verification), ☑ Book 17 (Testing Strategy & Tooling), ☑ Book 18 (Performance & Bundle Budgets) — VOLUME COMPLETE |
| V | 19–20 | ☑ 2/2 — ☑ Book 19 (Packaging, Versioning & Distribution), ☑ Book 20 (Migration & Adoption) — VOLUME COMPLETE · **LIBRARY COMPLETE (20/20)** |
