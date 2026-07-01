# Book 01 — Angular 22 Architecture for a Component Library

> Volume I, Book 1. The platform foundations every later book builds on. Version-specific claims about Angular 22 (stable 2026-06-03, *after* the model's training cutoff) are grounded in the frontier note [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md) — cited inline as *(platform note)*. That note carries the real fetched sources; this book teaches the architecture they imply. Stable patterns (standalone components, DI, change-detection theory) are taught from settled knowledge.

## 1. TL;DR

A component library is not an application: it is consumed by apps it does not control, so it must be **maximally compatible with whatever context the consumer runs in** and impose the smallest possible footprint. This book lands on one opinionated default for Caelum: **author every component as a standalone, `OnPush`, signal-driven unit that never depends on `zone.js` to detect its own changes, published from an `ng-packagr` library project that tracks Angular's major version in lockstep with `@angular/material`, `@angular/cdk`, and `@angular/aria`.** Angular 22 makes this the path of least resistance — it ships zoneless and `OnPush` as the defaults for new code (platform note) — but for a *library* these are not stylistic preferences, they are correctness requirements: a component that needs zones to update is broken inside the growing population of zoneless host apps. The rest of Volume I builds reactivity and forms (Book 02), provenance discipline (Book 03), and the theming token bridge (Book 04) on top of the workspace and change-detection decisions made here.

## 2. Conceptual Foundations

### 2.1 The platform in one paragraph (the frontier facts)

Angular 22 is the "signal-first, zoneless" release. The load-bearing facts for an architect, each sourced in the platform note: zoneless change detection has been the default since v21 and needs no opt-in; the stable provider, if you must configure it, is `provideZonelessChangeDetection()`; `OnPush` is now the default change-detection strategy for new components (and the old `Default` strategy is renamed `Eager`); the signal APIs (`signal`/`computed`/`effect`/`linkedSignal`/`input`/`output`/`model`/`viewChild`…) are stable, and the async Resource APIs (`resource`/`httpResource`/`rxResource`) plus **Signal Forms** newly stabilized in v22; `ControlValueAccessor` is *not* deprecated and remains the bridge for custom controls; and the toolchain floor rose to Node 22/24/26 and **TypeScript 6.0.x**, with the esbuild/Vite `application` builder as the default and the legacy webpack builders deprecated. Treat every one of those as "verify against the platform note (and re-verify after ~2026-12-26)," not as eternal truth — that is the whole reason the frontier layer exists.

### 2.2 A library is not an application (the consumer-owns-the-context principle)

The single most important mental shift in this book: **the consuming application owns the runtime context; the library must adapt to it, not the reverse.** An app author chooses zoneless-or-zoneful, a change-detection strategy, a bundler, a theme, a locale. A library author chooses *none of those* — Caelum will be dropped into apps that are zoneless and apps that still run `zone.js`, apps on `OnPush` and apps on `Eager`, apps that server-render and apps that don't. Every architectural decision below flows from this: pick the option that is correct across the **widest** set of consumer contexts, even when it costs the library author more discipline. "It works in our demo app (Forge)" is necessary but never sufficient; "it works in a consumer we will never see" is the bar (`brief §0`, R7).

### 2.3 Why staying inside `@angular/*` is also a provenance decision

Caelum's two hard rules — no paid license, US-origin only including the transitive tree (`brief §0`; `docs/ARCHITECTURE.md` D-05/D-10) — make the platform choice partly a *compliance* choice. `@angular/core`, `@angular/material`, `@angular/cdk`, and `@angular/aria` are all MIT-licensed and maintained by the Angular team at Google (US) (platform note), so the foundation clears the bar at the top level without an adapter. That is the structural reason Caelum builds on the Angular org's own stack and isolates the few genuine third-party needs (grid/charts/editor) behind adapters (`docs/ARCHITECTURE.md` D-01/D-02/D-03). **Caveat the rest of Volume I will hammer:** a clean top-level license is *not* a clean transitive tree — that is Book 03's job and the M0 provenance-scan slice's job, not something this chapter settles.

## 3. Architecture & Design

### 3.1 Standalone components as the unit of distribution

A library ships *units of import*. In modern Angular the unit is the **standalone** component/directive/pipe: it declares its own `imports`, needs no `NgModule`, and is tree-shakable on its own. For a library this is decisive:

- **Tree-shaking is per-symbol.** A consumer who imports `CaeButton` should pull in `CaeButton` and its real dependencies — not a barrel `NgModule` that drags in every component. Standalone components plus a careful `public-api.ts` keep the consumer's bundle proportional to what they use.
- **No module ceremony at the call site.** The PrimeNG-parity ergonomics goal (`brief §3`) is "swap `p-*` for `cae-*` with minimal churn"; a consumer adds a single `imports: [CaeButton]` to a standalone component, not a module wiring step.
- **Secondary entry points** (`@caelum/forms`, `@caelum/overlay`, …) let a consumer import a slice of the library without the whole; `ng-packagr` builds these from nested `ng-package.json` files (see §4 and Book 19 — Packaging, Versioning & Distribution).

The alternative — exporting `NgModule`s — is legacy; it exists only for consumers still on module-based apps, and even they can consume standalone components. Caelum's default is **standalone-only public API**, NgModule compatibility considered a migration affordance, not a design center.

### 3.2 Zoneless + OnPush: change detection a library can rely on

This is the chapter's spine. Three options exist for how a component learns it must re-render; only one is safe for a library:

| Approach | What triggers CD | Safe in a zoneless consumer? |
|---|---|---|
| Zone-driven (`Eager` + `zone.js`) | `zone.js` monkey-patches async; any timer/promise/event re-checks | **No** — a zoneless app has no zone to fire |
| `OnPush` + manual `markForCheck` | inputs changing, events, explicit `markForCheck`, `AsyncPipe` | Yes |
| `OnPush` + **signals** | a signal read in the template changes | Yes — the modern default |

Because a consumer may be zoneless (the v22 default — platform note), **a Caelum component must never depend on `zone.js` to schedule its own change detection.** Concretely:

- Set `changeDetection: OnPush` on every component (the v22 default, but state it explicitly so the library is correct even if generated under older tooling).
- Drive view updates through **signals** read in the template, or `AsyncPipe`, or an explicit `markForCheck()` — the things the zoneless guide names as valid triggers (platform note).
- **Never** reach for zone-coupled `NgZone` APIs (`onStable`/`onUnstable`/`onMicrotaskEmpty`/`isStable`) — they are inert under zoneless and make the component silently wrong (platform note). `NgZone.runOutsideAngular` remains legitimate for perf (e.g. high-frequency DOM listeners) and is safe.

This is strong enough to be an **architecture invariant** for Caelum — "zoneless-compatible: `OnPush` + signal-driven CD, no zone-coupled APIs" — sibling to the existing *Angular lockstep* invariant (`docs/ARCHITECTURE.md` §2). It is a near-free invariant to adopt now and ruinously expensive to retrofit, because violations are *silent* (the demo app, if zoneful, hides them). The matching test discipline lives in Book 17 (Testing Strategy) — a zoneless test harness is how you keep this honest; the smoke experiment is pre-registered in the platform note.

### 3.3 Signals and dependency injection — the reactive and wiring spine

**Signals** are the library's reactive substrate. For component *inputs*, prefer signal inputs (`input()`, `input.required()`) over the `@Input` decorator: they are stable in v22 (platform note), they read as signals inside the component (so they compose with `computed`/`effect`), and they make `OnPush` correctness automatic. `@Input` is not deprecated and coexists (platform note), so consumers and migrations are unaffected — but new Caelum components are authored signal-first. Two-way binding uses `model()`; content/view relationships use the signal queries (`viewChild`/`contentChildren`/…). Reserve `effect()` for genuine side-effects (imperative DOM, focus, third-party sync) — *not* for deriving state, which is `computed()`'s job; an `effect` that writes signals is the classic foot-gun (catalogued in `reference/ANTI_PATTERNS.md`).

**Dependency injection** is how a library exposes seams without coupling. The patterns that recur across Caelum:

- **Configuration via injection tokens** with a `provideCaelum…()` function (the modern `provide*` convention), so an app configures defaults once at bootstrap rather than per-component.
- **The theming token bridge is consumed, not injected** — it is CSS custom properties (Book 04), not a DI service; DI carries *behavioral* config (e.g. default overlay scroll strategy, a date adapter), CSS variables carry *design* values. Keeping that split clean is what stops the two systems from leaking into each other.
- **Hierarchical DI for overlay/portal context** — CDK Overlay creates detached views; pass context through injectors deliberately (Book 05 — CDK Primitives covers the overlay injector plumbing).

### 3.4 Material + CDK + Angular Aria: the three-layer first-party stack

Angular ships three complementary layers, all MIT/Google and versioned in lockstep with core (platform note). Knowing which to reach for is a per-component decision Caelum makes constantly:

- **Angular Material** — fully-styled, complete components. Use when a Material component already matches the PrimeNG capability (Book 05+ map these). The "Direct" ports in the migration map are mostly this (`brief §3`).
- **Angular Aria** — *headless* accessible directives implementing WAI-ARIA patterns (keyboard, ARIA attributes, focus, SR), where **you** supply DOM + CSS + logic (platform note). v22 ships **12 patterns**: Autocomplete, Listbox, Select, Multiselect, Combobox, Menu, Menubar, Toolbar, Accordion, Tabs, Tree, Grid. This is newer and broader than the brief assumed (`brief §1`), and it changes the build calculus below.
- **Angular CDK** — lower-level primitives: Overlay, Portal, A11y (FocusTrap/LiveAnnouncer/FocusMonitor/InteractivityChecker), DragDrop, Scrolling/VirtualScroll, Menu, Listbox, Stepper, Table, and more (platform note). Use when neither a styled Material component nor an Aria pattern fits, and you are assembling behavior from parts.

**Caelum's reach-for ladder (a refinement of `docs/ARCHITECTURE.md` D-02):**

```
1. Is there a Material component that matches?      → use it (+ token-bridge theming)
2. Is there an Angular Aria headless pattern?       → use it, style via the token bridge
3. Is there a CDK primitive to assemble from?       → build on it
4. None of the above?                               → bespoke on platform features, last resort
```

Stop at the first rung that holds — the "laziest sufficient code" rule (`CLAUDE.md` › Working style). Aria sitting at rung 2 means several components scoped to hand-build on raw CDK (tree, tabs, menu, multiselect) now have a first-party behavior layer; that is a real, *reversible* architecture refinement worth recording as a `D-NN` once component code starts (flagged in the platform note's feasibility path), not a contradiction of D-02.

### 3.5 Workspace shape: the library and its demo console

Caelum is **one Angular CLI workspace, two projects** (`PROJECT_CONVENTIONS.md` › Source Layout):

- `projects/caelum/` — the publishable library (`ng-packagr`), built with the `library` builder, shipping standalone components + the token bridge + the adapter *interfaces* (not the adapter implementations' third-party deps — those stay optional/peer). This is the deliverable a consuming team installs.
- `projects/forge/` — the demo admin console, an ordinary application built with the `application` (esbuild/Vite) builder (platform note). Forge is the canonical example throughout the books and the place parity is demonstrated end-to-end — but it is a *consumer*, never a backdoor into the library's internals.

Why one workspace rather than two repos: the demo must build against the library's *source*, so a breaking change to a `cae-*` API fails Forge's build in the same PR — the cheapest possible early-warning that the public API moved. Why the library stays a distinct project rather than "just a folder Forge imports": packaging discipline (peer deps, secondary entry points, the public-API surface) only stays honest if the library is built and consumed *as a package*, which Book 19 covers.

## 4. Implementation

Illustrative, not necessarily compileable — the shapes, not a working repo.

**A canonical Caelum component skeleton** (standalone, OnPush, signal-first):

```ts
// projects/caelum/src/lib/button/button.ts  (selector cae-button, class CaeButton)
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'cae-button',
  standalone: true,            // explicit, even though it is the default
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button [class]="classes()" [disabled]="disabled()">
      <ng-content />
    </button>`,
  // styles read ONLY token-bridge CSS custom properties — never hardcoded values (Book 04, D-04)
  styleUrl: './button.scss',
})
export class CaeButton {
  readonly variant  = input<'filled' | 'outlined' | 'text'>('filled');
  readonly disabled = input(false);
  // derived state is computed(), never an effect that writes a signal
  protected readonly classes = computed(() => `cae-button cae-button--${this.variant()}`);
}
```

**The public-API surface and secondary entry points** (consumer imports stay tree-shakable):

```
projects/caelum/
  ng-package.json                 # primary entry: @caelum
  src/public-api.ts               # re-exports the public symbols ONLY
  src/lib/button/...              # CaeButton
  forms/ng-package.json           # secondary entry: @caelum/forms  (own public-api.ts)
  overlay/ng-package.json         # secondary entry: @caelum/overlay
```

**App-level configuration via a provider function** (DI for behavior, not design):

```ts
// consumer's app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideCaelum({ overlayScrollStrategy: 'reposition' }),  // behavioral defaults
    // zoneless is already the app default in v22 — Caelum requires NOTHING here
  ],
};
```

**`package.json` lockstep** — the library peers on the Angular major it tracks, so a consumer's Angular and Caelum's expectations cannot silently diverge:

```jsonc
// projects/caelum/package.json (illustrative versions — verify against the platform note)
{
  "peerDependencies": {
    "@angular/core":     "^22.0.0",
    "@angular/common":   "^22.0.0",
    "@angular/material": "^22.0.0",
    "@angular/cdk":      "^22.0.0",
    "@angular/aria":     "^22.0.0"
  }
}
```

Material mechanically pins CDK to an exact patch (platform note), so the trio moves together; Caelum's peer ranges should track the same major and bump in lockstep — the *Angular lockstep* invariant made concrete.

## 5. Bleeding Edge

What is newly stable in v22 and therefore still settling (treat as frontier; the live tracking lives in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not here):

- **Angular Aria's 12 headless patterns** — first-party headless behavior is new ground; the Aria-vs-CDK parity question (which gives better a11y for less code, per component) is a pre-registered experiment, not a settled answer.
- **Signal Forms** (`@angular/forms/signals`) — stable as of v22 but young; Caelum's *form controls* still build on `ControlValueAccessor` for maximum compatibility (Books 02 and 07), treating first-class Signal-Forms ergonomics as upside, not a dependency.
- **The Resource APIs** (`resource`/`httpResource`/`rxResource`) — relevant where Caelum components fetch (e.g. a server-side data source for the grid adapter, Book 13), but a library should expose data *seams*, not opinionated fetching, so use them sparingly at the edges.

When any of these stabilizes into settled practice, it graduates from the `research/` layer into a deep-dive section here or in the relevant book (`research/README.md` lifecycle).

## 6. Gaps & Opportunities

- **Zoneless violations are silent.** Nothing in the type system stops a component from depending on a zone; only a zoneless test harness catches it (Book 17). This is the highest-value gap to automate early. Tracked as a `coverage_gap` until the harness exists.
- **The transitive provenance tree is unproven here.** This book establishes top-level cleanliness only; the `npm ls` + license scan over the whole tree (Book 03, M0 slice) is where the real guarantee is earned — and where a US-top-level package pulling a non-US dependency (R5) would be caught.
- **Aria pattern coverage is finite (13 today).** Components with no matching Material component *and* no Aria pattern (e.g. specialized inputs, R3; the time-of-day picker, R2) still fall to rung 3–4 of the ladder; that long tail is Volume II–III's work.
- **Material ≠ PrimeNG out of the box.** Theming/density parity is explicit work, not a default (R4) — Book 04's burden, surfaced here so the workspace decisions don't pretend it is free.

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on *this* topic:

- **High:** scaffolding standalone `OnPush` signal-first components from a template; wiring `public-api.ts` and secondary entry points; generating `peerDependencies` and lockstep version bumps; mechanical conversion of `@Input` to `input()` across many components; running the zoneless smoke + provenance scans and reporting results. These are exactly the "laziest sufficient code" mechanical wins.
- **~1× (stop and bring judgment / ask):** deciding the reach-for ladder *per component* (Material vs Aria vs CDK is a parity-and-aesthetics judgment, not a lookup); diagnosing a *silent* zoneless change-detection miss (the symptom is "nothing updates," which has many causes); theming-parity calls against PrimeNG (Book 04); and any decision that hardens into a `D-NN` (public-API shape, the Aria-first refinement) — those route through `CLAUDE.md` §3, not autopilot.

The honest summary: an agent can build *correct* Caelum components fast once the per-component architecture is decided, but the *deciding* — which layer, what the public API looks like, when parity is "done" — is where the human's leverage stays ~1×.

## 8. Exercises & Further Reading

**Exercises:**

1. Scaffold the two-project workspace (`caelum` library + `forge` app); make Forge import a trivial `CaeButton` from the library *as a built package*, and confirm a breaking rename of the button's input fails Forge's build in the same run.
2. Author `CaeButton` as standalone + `OnPush` + signal inputs; then uninstall `zone.js` from Forge and verify the button still reflects a signal change (the zoneless smoke experiment — pre-registered in the platform note).
3. Add a `@caelum/forms` secondary entry point with its own `public-api.ts`; confirm a consumer importing only `@caelum/forms` does not pull in unrelated components (inspect the bundle).
4. Take one component you would *assume* needs raw CDK (e.g. a tree) and sketch whether the Angular Aria `Tree` pattern covers it — the first pass at the reach-for ladder.

**Further reading (external — verify currency against the platform note):**

- Angular zoneless guide — https://angular.dev/guide/zoneless
- Angular signals guide — https://angular.dev/guide/signals
- Angular Aria overview — https://angular.dev/guide/aria/overview
- Angular Material theming — https://github.com/angular/components/blob/main/guides/theming.md
- Angular version compatibility — https://angular.dev/reference/versions

**In-library:** the frontier note [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md) (sourced version specifics); the decision log in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) (D-01/D-02/D-03/D-05/D-10); Book 02 (Reactivity & Forms) and Book 04 (Theming Token Bridge) build directly on this chapter.

---

*Conventions: standalone + `OnPush` + signal-first is the Caelum default; the consumer owns the runtime context; design values come from the token bridge, behavioral config from DI; version-specific claims are grounded in the `research/` layer (sourced + dated), never asserted from memory.*
