# Book 12 — The Adapter Pattern

> Volume III, Book 1 — the first book of *The Adapter Layer*. Volumes I and II built everything Caelum *can* build on first-party primitives: the platform and rules (Books 01–04), then the component families on CDK + Angular Aria (Books 05–11). Volume III is about the three things that **can't** be built that way — an advanced data grid, charts, a rich-text editor — and the single discipline that makes depending on a foreign library *safe*. This book is that discipline; Books 13–15 are its three concrete instances. The adapter pattern itself is long-settled architecture (the Gang of Four *Adapter*; Alistair Cockburn's *Hexagonal / Ports-and-Adapters*) and is taught here from stable knowledge; the Angular-22 specifics it leans on — DI provider functions, signals, zoneless change detection — are grounded in Books 01–04 and, where version-specific, the frontier note [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md). It implements `docs/ARCHITECTURE.md` **D-03**.

## 1. TL;DR

The reach-for ladder — **Material → Angular Aria → CDK → bespoke** (Book 01 §3.4, Book 06 §3.1) — has a bottom rung this book names. When even bespoke-on-CDK can't fill a gap because the gap is not a missing *widget* but a missing *engine* that someone has already solved better (a headless data grid, a charting library, a rich-text editor), Caelum admits exactly **one** third-party library for it — and quarantines it. The quarantine is the **adapter**: a *neutral, app-owned interface* in Caelum's own vocabulary (`cae-*` components, signal IO, `--cae-*` tokens) that the consuming app depends on, plus a **single adapter file** that is the *only* code in the entire library permitted to import the foreign package. That one rule — **"only the adapter touches it"** — buys three things at once: the provenance/supply-chain audit surface shrinks to one file plus the library's transitive tree (Book 03); a library that fails re-vetting or is acquired by a non-US entity is swapped at one file instead of N call sites; and the foreign render path is forced through the token bridge so it looks like the rest of Caelum (Book 04 §3.6). The rule is fragile by nature — it dies the first time someone imports the library "just this once" (R6, *adapter erosion*) — so it is enforced **mechanically** with an ESLint `no-restricted-imports` rule scoping the package to its adapter file, backed by a review lens and the provenance CI gate, never by good intentions. This book is the pattern; Books 13–15 apply it to the three genuine gaps; **D-03** is the decision it implements.

## 2. Conceptual Foundations

### 2.1 The bottom rung — when the ladder runs out

Book 01 §3.4 established the reach-for ladder and Book 06 §3.1 made it precise: prefer a styled **Material** component; drop to an **Angular Aria** headless pattern when you need custom styling over a standard interaction; drop to **raw CDK** primitives when neither fits; and only then build **bespoke** on the CDK. Each rung is more work and more first-party than the one above it. The adapter is the rung *below bespoke* — the one you reach for only when the gap isn't a missing component but a missing **subsystem**: a problem deep enough that re-implementing it on the CDK would be a project in itself and would still be worse than an existing, battle-tested, MIT, US-origin library.

Caelum has exactly three such gaps (`brief §4`): the **advanced data grid** (server-side data, grouping, column virtualization/resize/reorder, export — past the line where `MatTable` + `cdk-virtual-scroll` stops, which Book 10 §3.5 draws), **charting** (Material ships none at all), and the **rich-text editor**. Everything else in the migration map climbed the ladder and stopped higher — Direct Material, a composed widget, an Aria pattern, or a bespoke CDK build. The discipline of the bottom rung is restraint: you do not take it because a library is *convenient*. You take it only when the ladder is genuinely exhausted **and** the dependency clears Book 03's admit/reject gate. The cheapest dependency is still the one you don't add (Book 03); the adapter is the sanctioned path for the rare case where you have honestly decided you must add one.

### 2.2 The neutral, app-owned interface (the inversion)

The naive way to use a third-party library is to import it wherever you need it, call its API, and shape your data to its types. That couples N call sites to one vendor's surface, and the vendor's surface becomes your public surface. The adapter **inverts** this. Caelum designs the interface *first*, in its own vocabulary — a `cae-*` component with signal inputs/outputs, values typed in Caelum/domain terms, styled through `--cae-*` tokens — and then makes the library satisfy *that*. The library serves the interface; the interface never mentions the library. Concretely: the public surface exposes `CaeColumn<T>`, `rows`, `(sortChange)` — never a vendor `ColumnDef` or a vendor table instance.

This is exactly the **ports-and-adapters / hexagonal** idea (and the GoF *Adapter*): the "port" is Caelum's neutral interface, and the "adapter" is the one file that translates between that port and the foreign, *driven* side. **App-owned** is the load-bearing adjective (Book 01 §2.2, the consumer-owns-the-context principle): the interface answers to Caelum's needs and the consuming app's call sites, not to the vendor's roadmap. A breaking change in the library is absorbed *inside* the adapter and is invisible above it — which is only possible because the interface was designed without reference to the library in the first place.

### 2.3 Why isolation pays off three ways

The single rule — *only the adapter imports the library* — is load-bearing for three independent reasons (`brief §2.1` a/b/c), each tied to a project invariant:

- **Provenance is one file (R5).** Caelum's hardest rule is US-origin across the *transitive tree* (Book 03 §2.3; D-10). Because exactly one file pulls the foreign package, the entire added supply-chain surface to audit is that file's single import plus the library's own dependency tree — one `npm ls` root, one license scan, one origin sign-off (Book 03 §3.2). Isolation is what makes the provenance gate *tractable* instead of a whole-codebase grep.
- **Swap is one file, not N call sites.** Libraries fail re-vetting, change their license, or get acquired — a US maintainer sold to a non-US entity flips D-10 overnight. With the rule held, the response is "rewrite one adapter against the same neutral interface." Without it, it's "find and rewrite every call site." This swappability is what justifies the indirection cost.
- **Honest dependency accounting.** The rule keeps the migration truthful about what actually depends on foreign code: the answer is always "these three files," visible at a glance, rather than diffused invisibly through the application.

These three are why D-03 makes adapter isolation a **hard invariant** (ARCHITECTURE §2), not a style preference — and why the project's pre-loaded scar list carries adapter erosion as **R6**.

## 3. Architecture & Design

The pattern is one method applied identically to each gap. §3.1–§3.2 build the structure (interface-first, the single membrane); §3.3 defends it mechanically; §3.4 wires it through DI for swappability; §3.5 keeps the foreign render inside the token bridge; §3.6 is the checklist that says when an adapter is done.

### 3.1 Design the neutral interface first

The method is **interface-first, library-second**. Before any `npm install`, write the neutral interface as if the library did not exist: name the `cae-*` component, its signal inputs (`rows = input<readonly T[]>()`, `columns = input<CaeColumn<T>[]>()`), its outputs (`sortChange = output<CaeSort>()`), and the value/domain types in Caelum terms. The discipline that makes the interface real is one rule: **never leak a vendor type across the interface.** No method returns a library object, no input accepts one, no generic is parameterized by one. If a vendor concept genuinely must cross the boundary (a cell-render context, an editor selection), re-express it as a Caelum-owned type the adapter maps to and from.

The payoff is a test you can apply mechanically: a neutral interface is one you could satisfy **two ways**. If you can imagine implementing it on the documented fallback — `MatTable` for the grid, hand-rolled SVG for charts, `contenteditable` + a CDK toolbar for the editor (`brief §4`) — *without changing the signature*, the interface is neutral. If you can't, a vendor concept has leaked and must be refactored out. Only after the interface is written do you prototype the library against it (`brief §4`: "write the neutral interface first, prototype the lib against it, then decide").

### 3.2 The single adapter file — "only the adapter touches it"

The topology (`brief §2.1`):

```
feature code  ─►  <cae-data-grid [columns] [rows] (sortChange)>   (neutral, app-owned)
                        │   depends only on the neutral interface
                        ▼
                 grid.adapter.ts   ◄── the ONLY file importing @tanstack/*
                        │
                        ▼
                  TanStack Table (or its replacement)
```

The adapter is a service (or a thin component-internal collaborator) that implements Caelum's interface by delegating to the library: it maps `CaeColumn<T>[]` to the vendor's column definitions, drives the vendor engine, and maps results back to Caelum signals and outputs. It is a **membrane**: vendor types live *inside* it, Caelum types live *outside* it, and the `import` of the foreign package appears on exactly one line of the entire library. Everything above the membrane — the `cae-data-grid` component, the Forge demo screen, the consuming application — sees only the neutral interface and could not name the library if it tried.

### 3.3 Enforcing isolation mechanically — the rule that defends itself (R6)

The isolation guarantee has a notorious failure mode: **adapter erosion (R6)** — "the first time someone imports a 3p lib directly 'just this once,' the isolation guarantee is gone" (`brief §8`). A guarantee enforced only by reviewer vigilance *will* eventually be eroded, because the eroding import always looks locally reasonable. So Caelum enforces it with code. The mechanism is ESLint `no-restricted-imports` (flat config): forbid the foreign package everywhere, then re-allow it for the one adapter file via a scoped override.

```js
// eslint.config.js (flat) — the isolation rule (D-03 made executable)
export default [
  { rules: { 'no-restricted-imports': ['error', { patterns: [
    { group: ['@tanstack/*'],
      message: 'Import the grid only via grid.adapter.ts (D-03 adapter isolation).' },
  ]}]}},
  { files: ['**/grid.adapter.ts'],          // the single sanctioned membrane
    rules: { 'no-restricted-imports': 'off' } },
];
```

Three properties make this trustworthy: it **fails the build** (a CI gate, not a warning); it **names the reason** in the error message, so a contributor learns the rule at the exact moment they hit it; and the allow-list is **one explicit file path**, so a second importer cannot be added by accident. Defense in depth pairs it with the review lens (`review_against_library` carries an adapter-erosion check) and the provenance CI gate (Book 03 §3.4). The ESLint rule is, quite literally, the text of the ARCHITECTURE §2 invariant made executable — the mechanical half of D-03.

### 3.4 Injecting and swapping the adapter via DI

The neutral interface crosses into components through Angular DI exactly as Book 01 §3.3 prescribes — *behavior crosses by injection, design crosses by tokens*. Express the interface as an `InjectionToken` (or an abstract class used as a token), provide the concrete adapter with a `provideCaelumGrid(...)` function — the same `provide*()` shape Caelum uses for overlay defaults (Book 09 §3.1) — and have `cae-data-grid` inject the **abstraction**, never the concrete class:

```ts
export const CAE_GRID = new InjectionToken<CaeGridAdapter>('CaeGridAdapter');
export function provideCaelumGrid(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CAE_GRID, useClass: TanStackGridAdapter }]);
}
```

Now "swap the library" (§2.3) reduces to "change one provider": a `MatGridAdapter` fallback, or a future replacement, satisfies the same `CAE_GRID` token, and the swap is a one-line provider change plus one new adapter file — no call site moves. DI also makes the documented fallback (`brief §4`) a first-class, *selectable* implementation: tests can bind the lightweight `MatGridAdapter`, the demo console can run the fallback while production runs the full library, and a library that fails M2 provenance sign-off has a working escape hatch already wired.

### 3.5 Theming the foreign render path through the token bridge

A third-party-rendered widget that doesn't match the rest of Caelum breaks the **token-only invariant** (D-04) *visually*, even if no literal is hardcoded in Caelum's own files. The adapter owns the fix, and the choice of candidate makes it tractable: Caelum's three endorsed libraries are all **render-it-yourself / headless** — TanStack Table gives behavior + state and *you* render the cells; visx/D3 give scales + geometry and you render the SVG; Lexical gives the editor model and you render the view (`brief §4`; D-07/D-08/D-09). So the adapter renders the visible DOM with Material-styled, `--cae-*`-reading markup (Book 04 §3.6) and the foreign library never imposes its own stylesheet.

This makes a selection criterion explicit: **a library that ships its own opinionated CSS is a worse adapter candidate than a headless one**, precisely because a headless library keeps the render path inside the token bridge by construction. Where a library *must* inject some structural CSS, the adapter is also the single place to map its theming hooks onto `--cae-*` variables — so even that surface stays token-driven rather than hardcoded.

### 3.6 The adapter-authoring checklist — this book's discipline leg

An adapter is "done" when all of these hold — the bottom-rung analogue of Book 05 §3.6's four-legged stool for built components:

1. **Neutral interface, vendor-free.** No library type crosses the public surface; the interface is satisfiable by the fallback (§3.1).
2. **Single membrane.** Exactly one file imports the package, and the ESLint `no-restricted-imports` rule is in place and CI-enforced (§3.3, R6).
3. **DI-injected, swappable.** The interface is a token, the concrete adapter is provided, and a fallback implementation exists or is sketched against the same signature (§3.4).
4. **Token-themed render.** The visible widget reads `--cae-*` only; no foreign stylesheet leaks (§3.5; Book 04 §3.6).
5. **Provenance signed off.** The library *and its full transitive tree* cleared Book 03's admit/reject gate (§3.1/§3.2), recorded in the PROVENANCE ledger, with re-vet scheduled on every upgrade (Book 03 §3.4; D-10). Final sign-off for the endorsed libraries lands at **M2**.
6. **A11y parity through the neutral surface.** The widget meets the a11y gate (axe + keyboard + screen reader) regardless of what the library does or doesn't provide — the adapter fills any gap (Book 16).

Miss one and the bottom rung leaks: a leaked type couples call sites, a missing ESLint rule invites erosion, a hardcoded style breaks parity, an un-vetted transitive tree breaks provenance, an untested widget fails the DoD a11y gate.

## 4. Implementation

Illustrative pseudo-code (Angular 22, signal-first, `OnPush`) — shapes, not a compileable repo, and using the **data grid** as the worked example because it is the most concrete gap and sets up Book 13. TanStack specifics are kept deliberately light; Book 13 owns them.

**(a) The neutral, app-owned interface — no vendor types (§3.1).**

```ts
// cae-grid.types.ts
export interface CaeColumn<T> {
  readonly id: string;
  readonly header: string;
  readonly value: (row: T) => string | number;
  readonly sortable?: boolean;
}
export interface CaeSort { readonly columnId: string; readonly dir: 'asc' | 'desc'; }
export interface CaeRow<T> { readonly id: string; readonly data: T; }

export abstract class CaeGridAdapter<T = unknown> {          // the port (used as a DI token)
  abstract setData(rows: readonly T[], columns: CaeColumn<T>[]): void;
  abstract readonly viewRows: Signal<readonly CaeRow<T>[]>;  // the rendered slice, signal-driven
  abstract sortBy(sort: CaeSort): void;
}
```

**(b) DI wiring — provide the concrete adapter behind the token (§3.4).**

```ts
// cae-grid.providers.ts
export const CAE_GRID = new InjectionToken<CaeGridAdapter>('CaeGridAdapter');
export function provideCaelumGrid(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CAE_GRID, useClass: TanStackGridAdapter }]);
}
```

**(c) The neutral component — injects the ABSTRACTION, renders token-styled cells (§3.2, §3.5).**

```ts
@Component({
  selector: 'cae-data-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="cae-grid">                          <!-- design = tokens only (Book 04 §3.6) -->
      <tr *cdkVirtualFor="let r of adapter.viewRows()" [attr.data-row-id]="r.id">
        @for (c of columns(); track c.id) { <td class="cae-grid__cell">{{ c.value(r.data) }}</td> }
      </tr>
    </table>`,
})
export class CaeDataGrid<T> {
  protected adapter = inject(CAE_GRID);               // depends on the interface, not TanStack
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<CaeColumn<T>[]>();
  constructor() { effect(() => this.adapter.setData(this.rows(), this.columns())); }
}
```

**(d) The single adapter file — the ONLY place the library is imported (§3.2, §3.3).**

```ts
// grid.adapter.ts
import { /* createTable, getSortedRowModel, … */ } from '@tanstack/table-core';  // ← the one sanctioned import
export class TanStackGridAdapter<T> implements CaeGridAdapter<T> {
  readonly viewRows = signal<readonly CaeRow<T>[]>([]);   // template reads back via a signal (zoneless-safe)
  setData(rows: readonly T[], columns: CaeColumn<T>[]) { /* map CaeColumn<T> → vendor defs; drive the engine */ }
  sortBy(sort: CaeSort) { /* translate to the vendor's sort state, then push results into viewRows */ }
  // vendor types live ONLY in this file; nothing above the membrane can name them.
}
```

The ESLint rule from §3.3 closes the loop: any *other* file that writes `import … from '@tanstack/…'` fails the build with the rule's message. Above `grid.adapter.ts`, nothing in Caelum knows TanStack exists — which is exactly what makes the provenance audit one file (§2.3) and the swap a one-line provider change (§3.4).

## 5. Bleeding Edge

The settled-enough-to-teach frontier for the adapter pattern is three tensions:

- **Zoneless and the foreign render path.** A third-party widget that mutates the DOM outside Angular's awareness is invisible to change detection under a zoneless host (Book 01 §3.2). The adapter's job is to land every piece of state the template reads back into **signals** (the `viewRows` signal in §4), so CD fires correctly; high-frequency vendor callbacks may run via `NgZone.runOutsideAngular` — the one safe `NgZone` use (Book 01 §3.2) — with their results marshaled back into signals. SSR/hydration of a 3p-rendered widget is the genuinely live edge: most of these libraries assume a browser, so the adapter typically renders client-only behind a server placeholder. Version-specific platform movement here is tracked in the platform note, not asserted from memory.
- **Thin vs thick adapters.** The open design tension is how much logic lives *in* the adapter versus *above* it. A **thin** adapter maps types and delegates everything — every line is a line you rewrite on a swap, which keeps the swap honest but exposes the neutral layer to vendor churn. A **thick** adapter re-implements some behavior to insulate the neutral layer from the vendor. Caelum's default is *as thin as isolation allows*; a fast-moving or acquisition-risky vendor justifies thickening the neutral layer so the swap surface shrinks.
- **The provisional dependency.** Every adapter is provisional *by design*. The moment a first-party primitive fills the gap — a future Angular/Material data grid, a stabilized platform rich-text or charting API — the adapter retires and the gap climbs back up the ladder. The pattern is built to be undone; an adapter is a placeholder for a first-party answer that doesn't exist *yet*.

## 6. Gaps & Opportunities

- **The three concrete gaps this volume fills.** Each is a single instance of this book's pattern: the **data grid** (Book 13 — TanStack/D-07, the fallback being `MatTable` + virtual scroll, the line drawn at Book 10 §3.5), **charts** (Book 14 — visx/D-08, *deferred* because the team is not using charts yet, built when the need lands), and the **rich-text editor** (Book 15 — Lexical/D-09, fallback `contenteditable` + CDK toolbar). Final transitive-provenance sign-off for the endorsed libraries lands at **M2**.
- **The indirection cost is real.** An adapter is not free: it is a layer of type-mapping, a second vocabulary, and a place for bugs to hide *between* two individually-correct sides. For a genuinely small need it can cost more than it saves — and then the right answer is Book 03's: don't add the dependency at all. The adapter is for **engine-sized** gaps, not for saving a few lines.
- **Tooling opportunity — `add_adapter`.** The pattern is mechanical enough to scaffold: the neutral interface skeleton + the single adapter file + the ESLint `no-restricted-imports` override + the `provide*()` function + a fallback stub. That is exactly the derived `add_adapter` execution skill named in the library outline. The standing risk it guards is R6 — every new adapter must ship its isolation rule *in the same PR*, never "later."
- The pattern is authored here; its three applications (Books 13–15) and the adoption-time adapter-erosion guidance (Book 20) are written as the volume progresses. For the live, authoritative status of what's covered vs still open, read `MANIFEST.json` `coverage_gaps` (single-homed there).

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on adapter work:

- **Scaffolding an adapter from a gap.** Given "Book 13 = data grid on TanStack behind a neutral interface," an agent reliably produces the §3.6 skeleton — neutral interface, the single adapter file, the ESLint override, the provider, a fallback stub — because the pattern is mechanical and this book encodes it. This is what the `add_adapter` skill automates.
- **Catching erosion in review.** Grepping a diff for any new `import … from '<vendor>'` outside the sanctioned adapter path is a reliable adapter-erosion lens (R6); the agent can also confirm the ESLint rule is present and that its allow-list still names exactly one file.
- **Grounding the admit decision.** Routing an "add library X" request through Book 03's admit/reject gate plus D-03/D-05/D-10, and reporting the transitive-tree result (`npm ls` + license scan from the candidate's root), is precisely the structured check an agent does well.

Where it is only ~1× and must defer to a human:

- **Whether the gap is engine-sized at all** — the judgment that the ladder is genuinely exhausted and a third-party dependency is warranted, versus a bespoke CDK build — is an architecture call. The human defers little to the agent here on purpose.
- **The final provenance sign-off.** Origin needs a human sign-off (Book 03 §3.1), and acquisition risk (a US maintainer sold abroad) is a compliance judgment, not a lookup. The agent flags and records; the human signs.
- **Thin-vs-thick adapter depth** for a volatile vendor — a risk judgment about future churn (§5) that depends on roadmap reading the agent shouldn't fake.

## 8. Exercises & Further Reading

**Exercises:**
1. Write a neutral `CaeEditorAdapter` interface for a rich-text editor *without naming Lexical anywhere*; prove it is neutral by sketching **both** a Lexical and a `contenteditable` implementation against the same signature (§3.1; `brief §4`).
2. Add the ESLint `no-restricted-imports` rule for `@tanstack/*` scoped to one adapter file; then add a second `import` of it elsewhere and confirm the build fails with the rule's message (§3.3; R6).
3. Run a **swap drill**: replace a `MatGridAdapter` fallback with a `TanStackGridAdapter` behind the same `CAE_GRID` token; confirm that not one `cae-data-grid` call site changed (§3.4).
4. Run `npm ls` + a license scan from a candidate library's root and write the one-paragraph provenance verdict against D-10 (Book 03 §3.2) — including at least one transitive dependency you had to check.
5. Find a place where a vendor type *would* leak across the interface (a render context, a sort token) and refactor it into a Caelum-owned type the adapter maps (§3.1).

**Further reading:** the Gang of Four *Adapter* pattern and Alistair Cockburn's *Hexagonal Architecture (Ports and Adapters)* as the conceptual ancestry; TanStack Table's headless documentation at [`tanstack.com/table`](https://tanstack.com/table/latest) as the canonical render-it-yourself example; the Angular DI / `InjectionToken` / `provide*()` guides at [`angular.dev`](https://angular.dev); and the ESLint [`no-restricted-imports`](https://eslint.org/docs/latest/rules/no-restricted-imports) rule. In this library: Book 03 (the provenance gate the adapter makes tractable — §2.3/§3.1/§3.2/§3.4), Book 01 §3.4 (the reach-for ladder whose bottom rung this is) and §3.3 (DI for behavior), Book 04 §3.6 (theming the foreign render path), Book 10 §3.5 (the grid-vs-table line that opens the first gap), Book 06 §3.1 (the ladder made precise), Book 05 §3.6 (the composition discipline this checklist mirrors), Book 09 §3.1 (the `provide*()` DI precedent); and forward to Book 13 (Data Grid Adapter), Book 14 (Charts Adapter), Book 15 (Rich-Text Editor Adapter), Book 16 (Accessibility & Parity Verification), and Book 20 (Migration & Adoption — adapter-erosion prevention at adoption time).
