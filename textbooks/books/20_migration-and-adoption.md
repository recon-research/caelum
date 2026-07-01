# Book 20 — Migration & Adoption

> Volume V, Book 2 — **closes the Distribution & Adoption volume and completes the 20-book Caelum library.** Book 19 made a finished library *publishable* (ng-packagr, the `exports` map, peer deps, the two provenances). This book is about the last mile that publishing exists to serve: **how a team actually leaves PrimeNG for Caelum, component by component, without a rewrite.** It realizes **D-06** (Caelum is an app-agnostic library a team *adopts*, not an in-place migration of an app Caelum's authors never see) and it is where **D-03**'s adapter-isolation discipline (Book 12) is generalized from one foreign library to a whole one being removed. Keep one boundary sharp, because it is the seam between this book and its sibling: **Book 19 §3.4's `ng-update` migrations upgrade a team *already on* Caelum across Caelum majors; the `p-*`→`cae-*` codemods here move a team *from* PrimeNG onto Caelum.** They are different Schematics collections with different triggers — the research confirms the from-PrimeNG transform is a cross-package move and therefore a standalone `ng generate` schematic, never an `ng-update` migration (§3.3). The book's spine is a single reframing: a UI-library migration is a **strangler fig** (Fowler; Azure) — the new system germinates beside the old, behavior moves over one slice at a time, both coexist, and the old host is decommissioned once nothing depends on it — and the thing that makes it *converge* rather than stall as "two libraries forever" is a **forward-only fitness function** (§2.3). The migration map that drives it lives, canonically, in [`reference/COMPARISON.md`](../reference/COMPARISON.md); the brief's migration map (brief §3) is its seed and the methodology is grounded in canonical pattern sources cited in §8 (no frontier research note — the Schematics API is stable-since-Angular-6 architecture, the pattern is canonical). This is the final book.

## 1. TL;DR

A team does not migrate off PrimeNG in a weekend, and Caelum is not designed to make them try. The single opinionated default this book lands on: **adopt Caelum as a strangler fig — one `p-*` component at a time, both libraries coexisting behind a shared token bridge, driven by the consuming app's *real* selector usage — and make the migration converge with a forward-only lint ratchet.** Four moves carry it. **(1) The living map.** The `p-*`→`cae-*` component map is the backbone, and its canonical home is [`reference/COMPARISON.md`](../reference/COMPARISON.md) (seeded from brief §3): every PrimeNG component to its Caelum equivalent, the Material/CDK primitive under it, and an effort tier (Direct / Compose / Build-S·M·L / Adapter) — but a mapped row is a *promise to build and verify*, never a done deal (Book 16 §2.1's "looks the same is not the same"). **(2) Coexistence.** Two component libraries run in one app during the transition; the real hazards are theming collisions, the CDK overlay-container z-index conflict, and bundle bloat while both ship — all tamed by driving *both* Caelum and residual PrimeNG from the one token bridge (Book 04) so brand basics are decided once (§3.2). **(3) The codemods.** The mechanical renames — `<p-select>`→`<cae-select>`, `import … from 'primeng/…'`→`'caelum/…'` — ship as a **standalone `ng generate caelum:migrate-from-primeng` Schematic** (distinct from Book 19 §3.4's `ng-update`), authored on the stable `@angular-devkit/schematics` API, using the TypeScript compiler API for imports and template-AST/guarded-regex for selectors (§3.3). **(4) Convergence.** An architectural fitness function — ESLint `no-restricted-imports` forbidding *new* `primeng/*` imports, plus an `@angular-eslint` template rule for *new* `<p-*>` tags — turns backsliding into a build failure, and the monotonically-falling count of remaining forbidden imports is the **PrimeNG-removal** burndown, done at zero. That is *necessary* for a finished migration but not *sufficient*: removal is not parity, so the true parity burndown is the ledger's `adversarial-passed` count (Book 16), and the two gates are kept distinct (§2.3, §3.5, §3.6). This is Book 12's "the rule that defends itself" applied to a whole library instead of one adapter. Completes the library.

## 2. Conceptual Foundations

### 2.1 The migration is a strangler fig, not a big-bang

The controlling mental model is **Martin Fowler's Strangler Fig**: a new system germinates on top of, but separate from, the legacy one; behavior is moved across incrementally; the original is decommissioned only once nothing depends on it (Fowler, 2001 — §8). Microsoft's Azure Architecture Center formalizes the same shape in four phases: introduce a **facade** that routes work to old or new, shift work to the new system iteration by iteration, decommission the legacy once no dependencies remain, then remove the facade (Azure — §8). The reason this is the right frame for Caelum is **D-06**: Caelum is a *library a team adopts*, not a migration Caelum's authors perform — the team keeps a working app the whole way and swaps one component family at a time, exactly the way they adopted PrimeNG in the first place. Two of Azure's terms need translating for a UI library, because the fit is imperfect and this book is honest about where. There is **no single runtime routing facade**: `<cae-select>` does not transparently route to PrimeNG *or* Caelum — it simply *is* Caelum, so the `p-*`→`cae-*` rename is itself the per-component cutover (§3.3), not a facade insertion. What plays the facade's structural role — the thing introduced so both libraries can coexist and *removed* at phase 4 — is the **coexistence layer** of §3.2 (the shared token bridge and overlay coordination that keep a half-migrated app coherent); §3.6 relies on naming it distinctly when it schedules that layer for deletion. The `cae-*` surface is instead the *new system's* neutral abstraction — the same inversion Book 12 §2.2 uses for a single foreign library, now applied to the crossover itself.

The frontend specialization of the pattern (Steve Kinney's Enterprise UI treatment — §8) adds two rules Caelum adopts wholesale: **keep a stable front door and move one vertical slice at a time**, and — the pitfall that kills these migrations — **if new features keep landing on the legacy library, the migration never converges.** So the discipline is asymmetric: all *new* component work goes on Caelum, only *bug fixes* touch PrimeNG, and the compatibility/coexistence layer is scheduled for removal from the start, or the team ends up maintaining two libraries forever. Fowler's own caveat applies literally: replacing something this embedded is not merely a technical exercise — it needs the organizational will to hold the "no new PrimeNG" line, which is why §2.3 makes that line *mechanical* rather than cultural.

### 2.2 The living component map is the backbone — and parity is earned, not assumed

Everything concrete in a PrimeNG→Caelum move flows through one artifact: the **component map**, `p-*` → `cae-*` → the Material/CDK primitive under it → an effort tier. Its canonical home is [`reference/COMPARISON.md`](../reference/COMPARISON.md) — a *living* table, because the real inventory drifts (PrimeNG's current showcase lists ~95 components — up from the brief's ~90 estimate — and has renamed several across the very majors a migrating team is on — §3.1) and because effort ratings are predictions to be corrected against reality, not gospel (brief §3's own caveat). The map is seeded from brief §3 and is the single home for the mapping; Book 20's prose teaches how to *use* it, it does not duplicate it (the single-home rule).

The load-bearing warning the map must never let a reader forget is Book 16's: **a mapped row is not a migrated component.** "`p-select` → `cae-select`" says a target *exists*; it says nothing about whether `cae-select` matches the props, events, keyboard behavior, and screen-reader semantics the app actually used on `p-select`. That gap — "looks the same" is not "is the same" (Book 16 §2.1) — is the whole reason Caelum carries a capability ledger (Book 16 §2.2) and pre-committed parity scenarios (Book 16 §3.1). So a map row is a *promise to build and to verify across all three parity dimensions* (functional, accessible, visual — Book 16 §3.5), and a component is "migrated" only when it reaches `adversarial-passed` on the ledger (§3.6), never when it merely renders.

### 2.3 The migration only moves forward — erosion prevention as a fitness function

A component-by-component migration has one failure mode above all others: **backsliding**. A long migration means months of a mixed codebase, and the path of least resistance for a developer under deadline is to reach for the familiar `<p-table>` "just this once." This is the exact shape of **adapter erosion** (Book 12 §3.3, scar R6: the first direct import "just this once" and the guarantee is gone) — only now the eroding surface is not one adapter but the entire library being removed. A guarantee enforced by reviewer vigilance *will* eventually erode; Caelum's answer, here as in Book 12, is to defend it with code.

The named discipline is an **architectural fitness function** (Ford, Parsons & Kua, *Building Evolutionary Architectures* — "an objective integrity assessment of some architectural characteristic," the "unit test for architecture" — §8): a CI-run check that asserts a structural property holds as the system evolves. For a migration the property is *"no new dependency on the library we are removing,"* implemented as an ESLint `no-restricted-imports` rule that forbids *new* `primeng/*` imports (ESLint's docs position the rule for exactly this "two dependencies where one would suffice" case — §8). Wrapped in a **ratchet** — protect what is already clean, allow the existing violations, fail CI on any new one, and let the allowed count only ever *decrease* — it becomes a one-way valve: the migration can move forward or stand still, but it cannot regress. And the ratchet's remaining count is not just a guard, it is a **burndown metric** — with one honesty the book insists on: it measures **PrimeNG-*removal*** (the `renamed` leg of §3.6), not parity. A component whose `<p-*>` is gone but whose `cae-*` replacement is unverified is *removed*, not *migrated* — so ratchet-zero is necessary for "done" but not sufficient (the parity burndown is the ledger's `adversarial-passed` count, Book 16 §2.2; §3.6). With that qualifier, the falling number of forbidden `primeng` imports is a live progress signal that reaches removal-complete at zero (Azure frames the facade-model equivalent — the share on the new system — the same way; §8). One honest limit belongs up front: `no-restricted-imports` catches TypeScript imports but **not `<p-*>` selectors inside HTML templates**, so the fitness function needs a second leg — an `@angular-eslint` template rule (or a codemod-time scan) — to block new template usage too (§3.5). The through-line to Book 12 is exact: this is "the rule that defends itself" (Book 12 §3.3), generalized from one adapter to a whole library.

## 3. Architecture & Design

§3.1 is the living component map (COMPARISON.md, the effort tiers, the version-rename nuance); §3.2 is coexistence of two libraries during the overlap; §3.3 is the codemods — the standalone `ng generate` Schematic and the boundary with Book 19 §3.4; §3.4 is sequencing adoption by real usage (R7); §3.5 is the forward-only fitness function in detail; §3.6 is the adoption checklist that defines "migrated" and wires into `definition_of_done` and Book 16's ledger.

### 3.1 The PrimeNG→Caelum component map — the living table

The map's canonical home is [`reference/COMPARISON.md`](../reference/COMPARISON.md); this section describes its shape and the judgment encoded in it. Each row is `p-*` (the PrimeNG source) → `cae-*` (the Caelum target) → the Material/CDK primitive Caelum builds it on → an **effort tier**, using brief §3's legend so a reader crossing from the brief sees the same vocabulary:

- **Direct** — a ~1:1 drop-in on a Material component (`p-checkbox` → `cae-checkbox` over `MatCheckbox`). The bulk of the surface.
- **Compose** — assembled from Material/CDK pieces (`p-menubar` → `cae-menubar` from `MatToolbar` + `MatMenu`; Book 09).
- **Build-S / M / L** — a custom component on CDK/Aria, small to large (`p-inputnumber` → `cae-input-number`, a Build-S format/parse directive over `matInput`; Book 08).
- **Adapter** — the three genuine gaps that need a vetted, isolated third-party engine: the advanced data grid (Book 13), charts (Book 14), the rich-text editor (Book 15). The brief calls this tier **Vet-lib**; in Caelum it is the adapter layer of Volume III.

The rollup the map makes visible is the strategic case for the whole project (brief §3): the *great majority* of PrimeNG components are Direct or Compose — Material and CDK already handle them, accessibility included — the Build-S long tail is individually cheap, and the real concentration of effort is exactly three rows (grid, charts, editor) plus theming parity. That distribution is why a component-by-component migration is tractable at all.

Two honesties the living table must carry. First, **the source selector depends on the team's PrimeNG version.** PrimeNG renamed several components across the very 17→21 span a migrating team occupies (`Dropdown`→`Select`, `Calendar`→`DatePicker`, and more — the full rename set is COMPARISON.md's "Source-selector versioning" table, its single home), so the codemod's *input* side (§3.3) must be parameterized by, or detect, the source version, and the map lists current names with the historical alias (verify the exact rename set against the team's `primeng` version at adoption). Second, **the map is a starting allocation, not a contract**: effort tiers are predictions to log actuals against (brief §3), and the low-usage tail splits two ways (COMPARISON.md's "Niche" section) — some `p-*` have a mapped `cae-*` Build row but are built *only on demand* (Knob, OrgChart, MegaMenu, Dock — niche, the ROADMAP cut order), while a few (Terminal, PrimeNG utility directives) have **no Material/CDK path** and are an explicit build-or-drop decision (§6), not a silent map hole.

### 3.2 Coexistence — two libraries in one app during the transition

The strangler-fig overlap means Caelum and PrimeNG render in the same app for the duration, and three coexistence hazards are predictable enough to design against up front.

**Theming collisions.** Two libraries with two theming systems fight over global styles unless a single source of truth mediates. The mitigation is Caelum's existing spine used at migration scale: the **token bridge** (Book 04) defines one semantic `--cae-*` layer that drives Material's system tokens *and*, during the overlap, can drive residual PrimeNG (PrimeNG themes via CSS custom properties such as `--primary-color`/`--surface-ground`), so brand basics — color, surface, density, typography — are decided once and neither library re-litigates them (practitioner guidance, §8; verify the exact PrimeNG-v21 variable names at adoption). This is the "theme first, components second" order: get the two libraries visually coherent, *then* swap components underneath, so a half-migrated screen never looks broken.

**Overlay / z-index conflict.** This one is concrete and Angular-specific: Material/CDK render every overlay into a single shared `cdk-overlay-container` appended to the document body, and its stacking order is governed by SCSS variables (`$cdk-z-index-overlay*`); when a second library's dialogs/menus establish a competing stacking context, layering conflicts follow (angular/components#15467 — §8). Plan for a coordinated z-index scale across both libraries during the overlap, and **verify at M0** against the live v22 CDK, because overlay internals are version-sensitive (Angular's move toward the native Popover API may have shifted this — §5).

**Bundle bloat.** Both libraries ship until PrimeNG is fully removed, so the transition window pays for two component libraries at once — a real cost the sources describe only qualitatively (ESLint's "two dependencies bloat the project" framing is the closest sourced statement — §8). Caelum's answer is to *measure* it rather than estimate: the two size gates of Book 18 (the Forge-app `angular.json` budget, Book 18 §3.1, and the shipped-library per-entry-point gate, Book 18 §3.2) quantify the overlap, and secondary-entry-point tree-shaking (Book 18 §3.3) means the app only carries the `cae-*` components it has actually adopted — so the Caelum half of the bill grows exactly in step with migration progress, and shrinks to nothing on the PrimeNG side as the ratchet (§3.5) drives its imports to zero.

### 3.3 The codemods — Schematics for the mechanical `p-*`→`cae-*` renames

The mechanical part of the migration — renaming tags and import paths across a large codebase — should be automated, and Angular's Schematics are the tool. The **load-bearing architectural decision**, and the seam with Book 19: the from-PrimeNG transform is **a standalone `ng generate caelum:migrate-from-primeng` Schematic, not an `ng-update` migration.** The distinction is not stylistic. `ng-update` (Book 19 §3.4) is version-gated on *one package*: `ng update caelum` runs the migration factories whose `version` falls in the span the CLI is upgrading *Caelum itself* across — it is how a team *already on* Caelum survives a breaking `cae-*` change in a Caelum major. Moving a team *from PrimeNG onto Caelum* is a **cross-package** operation with no Caelum-version span to gate on, so it is authored as an on-demand generate Schematic the team runs once (optionally bundled into Caelum's `ng-add` so `ng add caelum` can offer it). This is exactly the boundary Book 19 §3.4 states in the other direction, and it holds up against how the Schematics surfaces are actually defined (the three surfaces — `ng-add`, `ng-generate`, `ng-update` — are declared separately; grounded in real sources, §8).

The authoring surface is **stable-since-Angular-6 architecture** (present it as durable, not frontier): a `collection.json` maps a schematic name to a factory `./dir/index#fn`; the factory is a rule factory `(options) => Rule`, where a `Rule` is `(tree: Tree, ctx: SchematicContext) => Tree`; the `Tree` is a virtual filesystem (a read-only base plus staged `Create`/`Rename`/`Overwrite`/`Delete` actions, never direct disk writes); options come from a `schema.json` with `x-prompt`; and a library advertises its collection to the CLI via the top-level `"schematics"` field in its `package.json`, so `ng generate caelum:migrate-from-primeng` resolves (§8; verify exact API surface at M0). The transform has **two dimensions**:

- **Import rewrites** (`import { … } from 'primeng/table'` → `'caelum/data-grid'`). Do these with the **TypeScript compiler API** — the same approach Angular Material/CDK use for their own migrations (their in-repo `update-tool` creates the `ts.Program` once and visits each file's AST). Two caveats the research pins down: that `update-tool` is **explicitly not public API**, so Caelum *imitates the pattern* rather than depending on it; and Caelum should reach for the raw compiler API, **not** `ts-morph` — Angular does not use it, and it is an added third-party dependency Book 03's gate would make you vet (the cheapest dependency is the one you don't add, Book 12 §6).
- **Template selector rewrites** (`<p-table>` → `<cae-data-grid>` and its attributes). Do these over the template — the pragmatic v1 is a targeted, idempotent rewrite of `.html` files inside a `Tree.visit`, escalating to the Angular template AST exactly where attribute/binding semantics differ.

First-party prior art to imitate exists in v22: `@schematics/angular` ships a **`refactor-jasmine-vitest`** code-transforming `ng generate` schematic (the Karma/Jasmine→Vitest move Book 17 §5 flagged) — a current, maintainer-authored example of precisely this shape (§8; v22-specific, verify at M0). The essential honesty (§6): a codemod automates the **mechanical** renames; it **cannot** decide the **semantic** remaps — which PrimeNG prop maps to which `cae-*` input, where an event signature differs, where behavior diverges — so a good `migrate-from-primeng` renames what it safely can and **leaves a typed marker/TODO** at every site needing a human judgment, feeding the parity work of §3.6.

### 3.4 Sequencing adoption — let the app's real usage drive priority

The order of migration is set by the *consuming app*, not by this book — and here the D-06 reframing of **R7** (the ROADMAP scope note) matters. The brief, written for a team migrating their own app, says plainly: inventory the app's real `p-*` selector usage first and let it drive priority (brief §5 Phase 3, the §5 sequencing rule, §9.1, Appendix A step 1). Caelum, being app-agnostic, has **no app to grep** — so R7 reframes that instruction as a deliverable: Caelum builds the full parity surface and **ships the usage-mapping guide** so the adopting team runs the inventory on *their* codebase and re-ranks. Same instruction, two vantage points; the guide is this book plus [`reference/COMPARISON.md`](../reference/COMPARISON.md).

Given the inventory, the first-slice criteria are well-sourced and mutually reinforcing: pick a **thin vertical slice** (a real capability, not a horizontal "all utilities" cut) with **visible business value, a clear owner, and low blast radius** (Kinney), balancing **heavily-used-yet-less-complex** urgency against manageability (Thoughtworks) — and establish a baseline of functional + a11y + perf tests *before* cutover so parity is measurable, which dovetails with `definition_of_done`'s gates (§8). The brief's phased order is the default template to re-rank against real usage: Phase 0 foundation + token bridge + the Direct components (the bulk of any screen, they unblock everything); Phase 1 the Composed common-case screens; Phase 2 the three adapters behind their neutral interfaces; Phase 3 the Build-S/M long tail *ranked by actual usage*; Phase 4 parity hardening (brief §5). Caelum's known team-usage signal (tables, forms, dynamic dialog, steppers, tree, image carousel — ROADMAP) pulls those families forward in the default ranking, but the adopting team's own inventory always wins.

### 3.5 Preventing migration erosion — the forward-only ratchet

The fitness function of §2.3, made concrete, has two legs because a component library is used in two places:

- **Imports (TypeScript).** An ESLint `no-restricted-imports` rule (flat config) with a `patterns` group matching `primeng` / `primeng/*`, carrying a custom `message` that names the reason and points at the map ("PrimeNG is being removed — see reference/COMPARISON.md for the cae-* equivalent"). This is the lightest-weight boundary enforcement available and needs no extra dependency (§8). It is the *same rule family* Book 12 §3.3 uses to fence a single adapter — one mechanism, two jobs: keep new PrimeNG out during migration, and keep the admitted adapters (TanStack/D3/Lexical) fenced forever after.
- **Selectors (templates).** `no-restricted-imports` does **not** see `<p-*>` tags in HTML, so a second leg — an `@angular-eslint` template rule (or a codemod-time template scan) — is required to block *new* `<p-*>` usage. Omitting this leg is the most common way a migration silently backslides in the template layer (§6).

Wrapped in a **ratchet**, the two legs become a one-way valve. The tooling options the research surfaces: **Betterer** (snapshot the current violation count, fail CI on any new violation while grandfathering existing ones), **imbue-ai/ratchets** (per-rule budgets that can only monotonically decrease), or a custom count — any of which makes the remaining number of forbidden `primeng` imports/selectors a **live removal-burndown to zero** (§8) — the *removal* count, necessary but not sufficient for "migrated" (§3.6): it proves PrimeNG is gone, not that each `cae-*` reached parity, which the capability ledger (Book 16 §2.2) tracks separately. Wiring this into CI is the concrete design task deferred to the adoption milestone (ROADMAP M4 / the M0-4 lint gate). The payoff is that "the migration is progressing" stops being a status-meeting claim and becomes a number CI reports on every PR.

### 3.6 The adoption checklist — what "migrated" means

"Migrated" is defined per-component and for the app as a whole, and both definitions are evidence-gated, not vibes — the same stance Book 16 and Book 18 take for their dimensions.

**A component is migrated when** it clears two Book-20 **migration pre-states** and then Book 16's verification ledger. The pre-states: it has a map row (`mapped`), and the codemod or a hand-edit has replaced its `p-*` sites with `cae-*` with every semantic-remap marker resolved (`renamed`, §3.3). Then it enters the capability ledger of Book 16 §2.2 — `scaffolded → implementer-passed → adversarial-passed` — earned by passing its pre-committed parity scenarios across all three dimensions (functional, accessible via axe + keyboard, visual light/dark/density; Book 16 §3.1/§3.5) under a *separate* party mandated to falsify (the same discipline as the brief §6 adversarial checklist), reaching **`adversarial-passed`**. (The evidence-gated ledger idea is brief §7's; the verification state names are Book 16 §2.2's — `mapped`/`renamed` are the migration pre-states this book layers before it.) Only at `adversarial-passed` is a component migrated; rendering, and even a clean `renamed`, are not on this list.

**The app is migrated when** all of the following hold, and they are *distinct* gates: the ratchet reaches zero (no `primeng/*` import, no `<p-*>` tag remains) **and** every component has reached `adversarial-passed` on the ledger — because ratchet-zero proves PrimeNG is *gone*, not that its replacements are at *parity* (§2.3); `primeng` is removed from `package.json` (so it leaves the provenance surface entirely — the whole point, Book 03 §2.3); and the coexistence layer (§3.2) is deleted on the schedule set at the start (Kinney's "remove the facade," Azure phase 4 — the coexistence layer *is* this migration's nearest analogue to the strangler facade, §2.1). Throughout, the admitted adapters stay fenced (Book 12 §3.3), so removing PrimeNG does not quietly re-open the door to unaudited foreign code. This checklist is Book 20's discipline leg, the migration-scale analogue of Book 12 §3.6 and Book 16 §3.6.

## 4. Implementation

The load-bearing artifacts, sketched. **These are illustrative, not compileable, and every Angular-22-specific surface — the exact `@angular-devkit/schematics` API, the CLI schematic invocation, the `@angular-eslint` template-rule name, and the CDK overlay/PrimeNG coexistence specifics — is *verify at M0 against the live v22 workspace*; the Schematics *architecture* is stable since Angular 6, the exact field sets are not gospel.**

**(a) A `reference/COMPARISON.md` row** — the living map's shape (the canonical table lives there, not here):

```
| PrimeNG (p-*)        | Caelum (cae-*)      | Material / CDK basis            | Tier      | Book |
|----------------------|---------------------|---------------------------------|-----------|------|
| p-select (was p-dropdown) | cae-select     | MatSelect                       | Direct    | 09   |
| p-table (basic→mid)  | cae-table           | MatTable + MatSort + MatPaginator | Compose | 10   |
| p-table (advanced)   | cae-data-grid       | TanStack behind CaeGridAdapter  | Adapter   | 13   |
| p-inputnumber        | cae-input-number    | matInput + format/parse dir.    | Build-S   | 08   |
```

**(b) The Caelum Schematics `collection.json`** — two of Caelum's three schematic surfaces (`ng-add` + the from-PrimeNG generate codemod); the third, `ng-update`, is **not** declared here — it lives in a *separate* migration collection referenced by `package.json`'s top-level `"ng-update"` field (Book 19 §3.4):

```json
{
  "$schema": "../node_modules/@angular-devkit/schematics/collection-schema.json",
  "schematics": {
    "ng-add":              { "factory": "./ng-add/index#ngAdd", "description": "Install Caelum; offer to migrate from PrimeNG." },
    "migrate-from-primeng":{ "factory": "./migrate/index#migrateFromPrimeng", "schema": "./migrate/schema.json",
                             "description": "Rename p-*→cae-* selectors and primeng/*→caelum/* imports across the workspace." }
  }
}
```

**(c) The `migrate-from-primeng` rule** — mechanical renames over the `Tree`, marking what needs a human (illustrative):

```ts
import { Rule, Tree, SchematicContext } from '@angular-devkit/schematics';

// 1:1 MECHANICAL renames ONLY — seeded from reference/COMPARISON.md.
// Ambiguous/semantic cases are DELIBERATELY EXCLUDED so the codemod leaves a marker, not a wrong rename:
// e.g. p-table is NOT here — basic→cae-table (Book 10) vs advanced→cae-data-grid (Book 13) is a human call (§3.3, §6).
const SELECTOR_MAP: Record<string, string> = { 'p-select': 'cae-select', 'p-checkbox': 'cae-checkbox', /* … */ };
const IMPORT_MAP: Record<string, string>   = { 'primeng/select': 'caelum/select', 'primeng/checkbox': 'caelum/checkbox', /* … */ };

export function migrateFromPrimeng(options: { fromVersion?: string }): Rule {
  // options.fromVersion selects the rename set — source p-* names are version-dependent (§3.1); unwired here for brevity (§6).
  return (tree: Tree, ctx: SchematicContext) => {
    tree.visit((path, entry) => {
      if (!entry) return;
      if (path.endsWith('.html')) {
        // Template selectors: idempotent, tag/word-boundary-anchored, LONGEST-selector-first —
        // p-select vs p-selectbutton, p-tree vs p-treetable nest as prefixes; an unguarded substring corrupts them.
        let html = entry.content.toString();
        for (const [p, c] of longestFirst(SELECTOR_MAP)) html = renameTag(html, p, c); // template AST or guarded regex
        tree.overwrite(path, html);
      }
      if (path.endsWith('.ts')) {
        // Imports via the TypeScript compiler API (NOT ts-morph — Book 03 / Book 12 §6).
        // NB: inline `template:`/`templateUrl` strings in .ts also need the selector pass — v1 handles external .html (§6).
        tree.overwrite(path, rewriteImports(entry.content.toString(), IMPORT_MAP, ctx));
      }
    });
    return tree;
  };
}
// renameTag()/rewriteImports() leave `/* TODO(caelum-migrate): verify props/events vs cae-* */` at every semantic remap.
```

**(d) The forward-only fitness function** — ESLint flat config forbidding *new* PrimeNG imports (the ratchet grandfathers existing ones):

```js
// eslint.config.js — the import leg (see §3.5); the template leg needs an @angular-eslint template rule.
export default [{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['primeng', 'primeng/*'],
        message: 'PrimeNG is being removed — import the cae-* equivalent (see reference/COMPARISON.md). D-06 migration.'
      }]
    }]
  }
}];
// Wrap with Betterer / imbue-ai ratchets so the remaining count only decreases — that count IS the burndown (M0-4/M4).
```

**(e) The template leg** (sketch) — an `@angular-eslint` template rule (or codemod-time scan) that fails on any *new* `<p-*>` element, because `no-restricted-imports` cannot see templates (§3.5, §6). Exact rule name is verify-at-M0.

## 5. Bleeding Edge

- **AST-based codemods over regex.** The durable direction is template/AST-aware transforms (the shape Material/CDK's internal `update-tool` uses over the TS compiler API) rather than string replacement — safer for attribute/binding remaps. The caveat stands: `update-tool` is not public API, so the pattern is imitated, not imported (§3.3).
- **Selectorless components (v22).** Angular 22 is advancing selectorless components (importable in a template without a selector string; developer-preview/emerging at time of writing, community-tier). If it lands, it may change how `cae-*` components are referenced post-migration and could simplify the template-rewrite leg — track it, but treat as v22-specific and **verify at M0**.
- **The template-lint gap.** Blocking *new* `<p-*>` usage depends on an `@angular-eslint` template rule; the maturity and exact configuration of the template-boundary story is the least-settled piece of the fitness function and the thing most worth pinning at M0.
- **Overlay coexistence may have shifted.** Angular's movement toward the native **Popover API** / CSS anchor positioning (watched in Book 09 §5) could change the `cdk-overlay-container` z-index mechanics that §3.2 relies on — re-verify the two-library overlay story against the live v22 CDK before asserting specifics.
- **AI-assisted migration.** The mechanical codemod plus an agent doing the *semantic* remaps the codemod deliberately leaves as markers (§3.3) is a genuinely new capability — the agent is well-suited to the repetitive per-site prop/event mapping a static transform can't decide (§7).

## 6. Gaps & Opportunities

- **The map is incomplete until the app is known.** By D-06 Caelum ships the parity surface and the usage-mapping guide, but the *ranked, real* map is completed by the adopting team's inventory (§3.4); until then the ledger rows are `untouched`. This is honest incompleteness, not a defect — the guide is the deliverable, the ranking is the team's.
- **The low-usage tail, split honestly (not a silent map hole).** Some `p-*` have a mapped `cae-*` Build row but are built *only on demand* (Knob, OrgChart, MegaMenu, Dock — a CDK/SVG path exists, but low priority; the ROADMAP cut order), so their `cae-*` name is *planned-if-used*, not committed. A few (Terminal, PrimeNG utility directives like `pStyleClass`/`p-fluid`) have **no Material/CDK path at all** and are an explicit build-or-drop decision. A migrating team hitting either kind gets a marked entry, never silence (COMPARISON.md's "Niche" section).
- **Semantic gaps codemods can't cross.** The codemod renames; it cannot map a PrimeNG prop whose `cae-*` equivalent has different semantics, or reconcile an event signature difference — those are the markers of §3.3 and require the parity work of §3.6. Quantifying "how much of a real migration is mechanical vs judgment" is an open, measurable question.
- **Source-version dependence.** Because PrimeNG renamed components across 17→21 (§3.1), the codemod's input side is version-dependent; a fully general `migrate-from-primeng` needs a version-detection or `--from-version` story that is only sketched here.
- **Progress measurement is unwired.** The ratchet-as-burndown (§3.5) is a design, not yet a CI mechanism — choosing Betterer vs a budget tool vs a custom count and wiring it to the project's gates is an M0-4/M4 task.

## 7. AI & Claude Code Integration

Migration is unusually well-matched to an agent, with a sharp line between where it is high-leverage and where it is ~1×:

- **High-leverage — the mechanical bulk.** Authoring the `migrate-from-primeng` Schematic, running the `p-*` usage inventory across a codebase, executing the repetitive per-component ports, and maintaining the fitness function are exactly the high-multiplier work an agent should own (ticket-first, per CLAUDE.md — a codemod is a slice with an issue).
- **~1× — the parity judgment.** Whether `cae-select` actually matches the behavior the app used on `p-select` is the adversarial parity call of Book 16 §3.6 and the brief §6 checklist ("did the implementer map the props the app *uses*, or the props that were *easy*?") — a judgment a *separate* party must make, so the same agent that ran the codemod should not also sign off its parity (the implementer/adversary split, Book 16 §2.3). First-slice choice and the semantic prop-remaps the codemod flags are likewise judgment, not automation.
- **The codemod is itself a guard.** The forward-only fitness function (§3.5) is a check the agent installs and keeps green — a mechanical guard against the agent's *own* future "just this once" slip, the same reflex Book 12 asks for at the adapter boundary. An agent must never mark a component "migrated" on render alone; the ledger gate (§3.6) exists precisely to stop that.

## 8. Exercises & Further Reading

**Exercises.**
1. **Author a codemod.** Write a `migrate-from-primeng` Schematic that renames one component end to end — `<p-select>`→`<cae-select>` in templates and `primeng/select`→`caelum/select` in imports — leaving a `TODO(caelum-migrate)` marker where a prop has no clean `cae-*` equivalent. Run it on a fixture and confirm idempotence. Contrast it, explicitly, with the `ng-update` migration Book 19 §3.4 builds — which package's version gates each, and why the from-PrimeNG move can't be an `ng-update`.
2. **Wire the ratchet.** Add the `no-restricted-imports` PrimeNG rule and prove CI fails on a *new* `primeng` import but tolerates an existing one; then show the remaining-count falls as you migrate a component. Add the template leg and demonstrate it catches a new `<p-table>` the import rule misses.
3. **Sequence a screen.** Take a screen using five `p-*` components, inventory the props each call site actually uses (grep the call sites, not the PrimeNG docs — brief §6), map them via [`reference/COMPARISON.md`](../reference/COMPARISON.md), and justify a migration order by blast radius and business value (§3.4).
4. **Coexist without collision.** Stand up a page rendering one `cae-*` and one `p-*` component under a shared token layer; make them visually coherent (§3.2) and reproduce, then resolve, an overlay z-index conflict.

**Further Reading.** **Book 19 §3.4** — the sibling boundary: `ng-update` migrations (upgrading a team *already on* Caelum) vs these `p-*`→`cae-*` codemods (moving a team *from* PrimeNG). **Book 12 §3.3** — "the rule that defends itself," the adapter-isolation fitness function this book generalizes to a whole library. **Book 16 §2.1/§3.1/§3.6** — why a mapped row is not a migrated component, and the capability ledger that gates "migrated." **Book 03 §2.3** — the origin-is-the-tree reason the team is leaving PrimeNG in the first place, and why removing it from `package.json` is the goal. **Book 18 §3.1–3.3** — the two size gates and tree-shaking that bound the coexistence bundle cost. **Book 04** — the token bridge that makes two libraries coexist visually. External canon: Fowler, [*StranglerFigApplication*](https://martinfowler.com/bliki/StranglerFigApplication.html); Microsoft, [*Strangler Fig pattern*](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig); Ford, Parsons & Kua, [*Building Evolutionary Architectures*](https://nealford.com/books/buildingevolutionaryarchitectures.html) (fitness functions); ESLint, [`no-restricted-imports`](https://eslint.org/docs/latest/rules/no-restricted-imports); Angular, [Schematics authoring](https://angular.dev/tools/cli/schematics-authoring) and [Schematics for libraries](https://angular.dev/tools/cli/schematics-for-libraries). Version-specific Angular/CDK/PrimeNG specifics in this book are **verify-at-M0** against the live v22 workspace.

*This is the twentieth and final book of the Caelum library — Volume V, and the curriculum, complete.*
