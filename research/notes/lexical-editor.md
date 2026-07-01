# Rich-Text Editor for Caelum — Lexical's framework-agnostic core

> reviewed: 2026-06-30 · tier legend: production-proven | published | experimental

A rich-text editor is the third genuine gap (Angular Material ships no editor at all), so the editor adapter (`docs/ARCHITECTURE.md` **D-09**) is a pure third-party case like the grid and charts. This note grounds **Book 15** (Rich-Text Editor Adapter) and supplies the evidence for the **M2** editor sign-off. Its central, load-bearing finding is the **favorable mirror image of the visx result**: where visx's rendering core (`@visx/shape`) carried a hard React peer and was therefore structurally unavailable to an Angular library (`research/notes/visx-charts.md`), **Lexical's core engine carries _no_ React dependency at all** — React lives only in the separately-published `@lexical/react` binding, which Angular simply never imports. So unlike charts (where D-08 needed a refinement to D3-direct), **D-09's endorsement of Lexical stands as-is**: Lexical is consumable in Angular through its framework-agnostic core, behind a neutral adapter. The editor is **deferred for the build** (heaviest gap, narrowest usage — ROADMAP cut order #1), so this informs the eventual M2 decision rather than forcing it now. The adapter *pattern* is settled (Book 12); only the library-specific lines below are web-sourced.

## State of the art

### Lexical core — a dependency-free, framework-agnostic editor engine

- The core `lexical` package is at **0.46.0**, **MIT**-licensed, repository `github.com/facebook/lexical`, and its **only** runtime dependency is `@lexical/internal@0.46.0`; it declares **no `react` or `react-dom`** as a dependency *or* peer dependency (the sole peer is optional `typescript >=5.2`) [published] (source: https://registry.npmjs.org/lexical/latest, accessed 2026-06-30)
- The core README states "The core of Lexical is a dependency-free text editor engine" intended "to be used in conjunction with packages that wire Lexical up to applications," and that the core APIs work "independently of any framework or library" [published] (source: https://raw.githubusercontent.com/facebook/lexical/main/packages/lexical/README.md, accessed 2026-06-30)
- `@lexical/internal` (the core's lone dependency) is at **0.46.0**, **MIT**, and has **zero dependencies** — a true leaf; the only peer is optional `typescript >=5.2` [published] (source: https://registry.npmjs.org/@lexical/internal/latest, accessed 2026-06-30)

### The headless behavior modules — also React-free

- `@lexical/rich-text` **0.46.0**, **MIT**: depends only on `lexical` + sibling `@lexical/*` packages (`@lexical/html`, `@lexical/utils`, `@lexical/dragon`, `@lexical/clipboard`, `@lexical/extension`, `@lexical/selection`) — **no react/react-dom** [published] (source: https://registry.npmjs.org/@lexical/rich-text/latest, accessed 2026-06-30)
- `@lexical/history` **0.46.0**, **MIT**: depends only on `lexical`, `@lexical/utils`, `@lexical/extension` — **no react** [published] (source: https://registry.npmjs.org/@lexical/history/latest, accessed 2026-06-30)
- `@lexical/utils` **0.46.0**, **MIT**: depends only on `lexical`, `@lexical/internal`, `@lexical/selection` — **no react** [published] (source: https://registry.npmjs.org/@lexical/utils/latest, accessed 2026-06-30)
- The vanilla-JS path registers behavior with framework-agnostic functions: `registerRichText(editor)` from `@lexical/rich-text`, and `registerHistory(editor, createEmptyHistoryState(), 300)` from `@lexical/history`, combined via `mergeRegister(...)` from `@lexical/utils`; "this approach works in vanilla JavaScript without requiring React or any framework dependencies" [published] (source: https://lexical.dev/docs/getting-started/quick-start, via WebSearch, accessed 2026-06-30)

### The React binding — where the React peer actually lives

- `@lexical/react` **0.46.0**, **MIT**, declares peer dependencies `react: ">=17.x"` and `react-dom: ">=17.x"` (plus optional `yjs`, `typescript`), and pulls a React-specific external dependency `@floating-ui/react` — this is the React UI layer (`LexicalComposer`, plugin components) that an Angular app does **not** import [published] (source: https://registry.npmjs.org/@lexical/react/latest, accessed 2026-06-30)

### The vanilla / framework-agnostic API surface (grounds Book 15 §4)

- An editor is created with `createEditor(config)` from `lexical`, where `config` carries `namespace`, `theme`, `nodes`, `onError`, and `editable`; it is mounted to a `contenteditable` DOM element with `editor.setRootElement(element)` [published] (source: https://raw.githubusercontent.com/facebook/lexical/main/packages/lexical/README.md, accessed 2026-06-30)
- All document mutation happens inside `editor.update(() => { ... })`, where `$`-prefixed helpers run (`$getRoot`, `$getSelection`, `$createParagraphNode`, `$createTextNode`); changes are observed with `editor.registerUpdateListener(({editorState}) => editorState.read(() => { ... }))` — the `$` functions are only valid inside an update or read closure [published] (source: https://raw.githubusercontent.com/facebook/lexical/main/packages/lexical/README.md, accessed 2026-06-30)
- Creating a `LexicalEditor` alone does not enable editing — a plain-text or rich-text package must be **registered** to activate editing capability [published] (source: https://lexical.dev/docs/getting-started/quick-start, via WebSearch, accessed 2026-06-30)
- A separate `@lexical/headless` package exists for running an editor with **no DOM at all** (server-side / tests) — distinct from the browser `setRootElement` path, but further evidence the engine is decoupled from any view layer [published] (source: https://lexical.dev/docs/packages/lexical-headless, via WebSearch, accessed 2026-06-30)

## Caveats & confidence (read before citing the lines above)

- **The "core has no React peer" fact is the decisive one for D-09 and it is firmly sourced** (the npm `latest` records for `lexical`, `@lexical/internal`, and the headless modules, plus the core README). This is the exact inverse of the visx finding: there the *rendering* package carried the React peer; here React is quarantined in `@lexical/react`, a package the Angular adapter never lists.
- **The full `@lexical/*` transitive tree was not exhaustively walked.** Core (`lexical` → `@lexical/internal`, leaf), `@lexical/rich-text`, `@lexical/history`, and `@lexical/utils` were fetched directly (all MIT, all React-free, all depending only on sibling `@lexical/*` packages). The remaining siblings they pull (`@lexical/html`, `@lexical/selection`, `@lexical/clipboard`, `@lexical/dragon`, `@lexical/extension`, `@lexical/list`, `@lexical/link`, `@lexical/markdown`, `@lexical/table`) are part of the same Meta monorepo and MIT by convention, but each was **not individually fetched** — that exhaustive `npm ls` + license scan is the M2 sign-off job, not settled here.
- **Versions are a snapshot** (`lexical` and the `@lexical/*` set at 0.46.0) as of this fetch. Lexical is pre-1.0 and moves faster than D3 or TanStack — re-verify the version and the React-free core before pinning at M2.
- **The vanilla-API specifics (`registerRichText`, `registerHistory`, `createEmptyHistoryState`, `mergeRegister`) came partly via WebSearch summaries of `lexical.dev`**, since the SPA's deep doc pages 404'd / didn't render to WebFetch (the same SPA limitation hit on `tanstack.com` last session). The `createEditor`/`setRootElement`/`editor.update`/`registerUpdateListener` core surface is directly quoted from the fetched core README; the per-package `register*` helpers are corroborated by multiple search results but should be confirmed against the live 0.46 docs when M2 editor work starts.
- **"Meta / Facebook = US-origin" is a maintaining-entity judgment, not a lookup.** The registry confirms the MIT license and the `github.com/facebook/lexical` repository; Meta Platforms is US-HQ'd (Menlo Park, CA). Origin/acquisition-risk sign-off remains a human compliance call at M2 (Book 03 §3.1; D-10).

## Caelum feasibility path

Against Caelum's stack and the invariants — the note's main message for the M2 editor decision:

- **D-09 stands; Lexical is consumable in Angular as a real adapter, not a fallback.** Because the core engine and the rich-text/history/utils behavior modules carry no React, the editor adapter can `createEditor()`, `setRootElement()` onto a `cae-editor`-owned `contenteditable`, and `registerRichText` + `registerHistory` — all in vanilla TypeScript inside a single `editor.adapter.ts` membrane (Book 12 §3.1). This is the favorable case: unlike charts, **no refinement of the decision is needed** — only the routine M2 transitive sign-off.
- **The single-file membrane is clean because React is opt-in by package, not by import.** The ESLint `no-restricted-imports` isolation rule (Book 12 §3.6) bans every `@lexical/*` specifier outside `editor.adapter.ts`; since `@lexical/react` is never added to `package.json` at all, the React surface can't leak even by accident. The neutral `CaeEditorAdapter` interface (Caelum-typed document model / selection / commands) is satisfiable two ways (Book 12 §3.1): on Lexical, and on the `contenteditable` + `document.execCommand`-free hand-rolled fallback (`brief §4`).
- **Theming is free for the same reason it was for the grid.** Lexical renders into a `contenteditable` element *you* own and style; it ships no editor stylesheet, so every surface, caret, selection, and toolbar control is themed through `--cae-*` tokens (Book 04 §3.6) — the headless property that made TanStack a clean grid candidate (`research/notes/tanstack-table.md`) holds here too.
- **Provenance is the cleanest of the three gaps.** The entire headless tree is Meta-authored `@lexical/*` (MIT) over a zero-dependency `@lexical/internal` leaf, with `typescript` the only (optional, build-time) peer and **no non-`@lexical` runtime package anywhere** in the parts fetched — a flatter, single-origin tree than D3's five-module scale dependency (`research/notes/visx-charts.md`) or even TanStack's two-package tree. The one external runtime dependency seen, `@floating-ui/react`, is isolated entirely within the unused `@lexical/react`.
- **The fallback is a genuine floor, not a stub.** For a *small* editor need (bold/italic/lists over a `contenteditable`), Book 12 §6's "don't add the dependency for a small need" applies hardest to the heaviest gap: a CDK-toolbar + `contenteditable` + a thin command layer may beat adding Lexical at all (`brief §4`; ROADMAP cut order #1 explicitly allows "defer to a `contenteditable` stub"). The neutral interface makes that a one-file swap, not a rewrite.
- **Zoneless fit needs care (unlike D3's pure functions).** Lexical is event-driven and mutates a `contenteditable` outside Angular's awareness, so the adapter must bridge `registerUpdateListener` callbacks into signals and run DOM-affecting `editor.update()` calls without assuming zone-based change detection (Book 01 §3.2) — closer to the grid's listener-to-signal bridge than to the chart's synchronous geometry. Flag for the M2 spike.

## Candidate experiments

Each a one-line pre-registration seed (hypothesis · metric · baseline); file as `EXP-NN` via `run_experiment` if/when M2 editor work starts:

- **EXP — Lexical core in Angular with no React.** Hypothesis: a `cae-editor` built on `lexical` + `@lexical/rich-text` + `@lexical/history` compiles and runs in an Angular 22 library with `@lexical/react` never installed and zero `react` in the lockfile. Metric: `npm ls react` returns empty + the editor edits. Baseline: the `contenteditable` fallback.
- **EXP — editor-tree provenance scan.** Hypothesis: the headless `@lexical/*` install is fully permissive + single-origin (Meta). Metric: count of non-MIT / non-`@lexical` runtime packages from `npm ls` + license scan (target 0 non-permissive; expect all-MIT Meta tree). Baseline: the bare `@angular/*` install.
- **EXP — token-only editor surface.** Hypothesis: the `cae-editor` content area, toolbar, caret, and selection render with every color from `--cae-*` and zero hardcoded values. Metric: 0 color literals + axe 0. Baseline: Lexical's example CSS (rejected — proves the token bridge replaces it).

## Watch

- `https://registry.npmjs.org/lexical` — version bumps before pinning at M2, and (the thing that would change everything) any move of a React peer into the core package; it won't structurally, but watch.
- `https://registry.npmjs.org/@lexical/react` — confirms the React peer stays quarantined in the binding layer, not the core.
- `https://github.com/facebook/lexical/releases` — the project's cadence (pre-1.0, faster than D3/TanStack); matters for the M2 re-verify.
- `https://lexical.dev/docs/getting-started/quick-start` and `.../packages/lexical-headless` — confirm the vanilla `register*` API surface against live 0.46 docs (search-sourced here; the SPA didn't render to WebFetch).
- ~180-day re-verify due by **~2026-12-27**; re-verify the React-free-core line and the headless-module dependency lists first — they are what ground D-09 staying as-is.
