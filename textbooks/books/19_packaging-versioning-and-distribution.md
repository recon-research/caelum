# Book 19 — Packaging, Versioning & Distribution

> Volume V, Book 1 — **opens the Distribution & Adoption volume.** Volume IV made "looks done" mean "is done" (a11y, tests, performance); Volume V makes a finished library *reach a consuming team*. This book is the **how-to-publish**; its immediate sibling, Book 18, was the **why-the-shape-matters**. Keep that boundary clean, the same way Book 16↔17 (a11y verification vs test tooling) and Book 17↔18 (test tooling vs perf budgets) are kept clean: Book 18 §3.3 owns *why* a tree-shakable secondary-entry-point package is worth shipping (bundle cost); this book owns *how* to build, version, and ship it. The one idea that reorganizes the subject — surfaced by the research — is that a published package carries **two orthogonal provenances**: npm/SLSA **build-origin** provenance (which repo, which commit, which CI job produced the tarball) and Caelum's **US-origin** attestation (who authored and owns the code and its transitive tree, D-05/D-10, Book 03 §2.3). They answer different questions, neither implies the other, and a complete release carries **both** — the build provenance recorded in the registry and public transparency log, the US-origin attestation shipped inside the tarball. Frontier v22 packaging facts are grounded in [`research/notes/angular-22-packaging.md`](../../research/notes/angular-22-packaging.md), cited as a research note (web-sourced, staling), never as a `Book §`. This book realizes **D-06** (Caelum is a downloadable library) and backs the **provenance gate** of `definition_of_done` (the US-origin scan of the *shipped* tree) plus the packaging/publish slices at M0-4 and M2. Book 20 (next) completes Volume V and the library: the PrimeNG→Caelum migration map and adoption.

## 1. TL;DR

Caelum is a **downloadable library** (D-06), so shipping it is a first-class engineering surface, not a `npm publish` afterthought — the `package.json` a consumer installs *is* the library's public contract. Five moves carry the book. **(1) Build.** A v22 library builds with the **`@angular/build:ng-packagr`** builder (always AOT, always **partial compilation**) into the **Angular Package Format** — FESM2022 + bundled `.d.ts` + a generated `package.json`; `ng build <lib> --configuration production` writes the publishable `dist/` directly (research note). **(2) The consumer contract.** APF's **`exports`** map keys each entry point by `types`/`default`, and **one secondary entry point per component** (Material's shape) is what makes "adopt Caelum component-by-component" real at the package level — Book 18 §3.3 owns *why* this tree-shakes; here is *how* it's authored. **(3) Dependencies.** Declare `@angular/*` as **peer dependencies** (never `dependencies`, which risks a duplicate Angular instance) with the observed **`^22.0.0 || ^23.0.0`** multi-major range, and ship an **`ng-update`** migration collection. **(4) Versioning.** Adopt Angular's **semver** (breaking changes only in a major, a ≥2-major deprecation window) and cut a **Caelum major per Angular major** — lockstep, the way Material/CDK track core. **(5) Distribution.** Publish from **GitHub Actions via Trusted Publishing** (OIDC, no long-lived token) so npm auto-generates **provenance** — **SLSA Build Level 2**, signed by Sigstore, a verifiable badge on npm. The keystone the book keeps returning to: that provenance proves *build* origin, **not** *US* origin, so Caelum ships a **separate** US-origin attestation (Book 03 §3.3) inside the same tarball. This book opens Volume V; Book 20 completes it.

## 2. Conceptual Foundations

### 2.1 The package is the public API

A component library's real interface is not its TypeScript — it is the set of promises encoded in the published package: which **entry points** exist (what a consumer can `import`), which **peer versions** it tolerates, what a **major version** bump is allowed to break, and what the tarball claims about **where it came from**. Everything a consumer relies on flows through those four surfaces, and each is a decision made at *publish* time, not at author time. This reframes packaging away from "run the publish command" toward "design the contract" — and it is why this is a whole book, not a paragraph in Book 01. The failure mode it guards against is treating distribution as mechanical: a library that renames an export in a minor, or pins Angular in `dependencies`, or ships without provenance, has broken its contract regardless of how good the component code is. The rest of Volume V is about making that contract deliberate — this book for the mechanics, Book 20 for how a team crosses over to it.

### 2.2 Two orthogonal provenances — build-origin vs US-origin

This is the conceptual keystone, and it is easy to get wrong. **npm provenance** (and the SLSA framework behind it) attests **build origin**: it cryptographically links the published tarball to the exact *source repository, commit SHA, build workflow, and CI job identity* that produced it, signed via the CI runner's OIDC token and logged in a public transparency ledger (research note). It answers *"was this artifact really built from this commit of this repo, by this pipeline — or was it tampered with or typo-squatted?"* That is a supply-chain-integrity question, and provenance answers it well.

It says **nothing** about who *owns or authored* the code, or the nationality or legal domicile of the maintaining entity, or the license/origin of the transitive dependency tree. Caelum's **"US-origin-clean"** requirement (D-05/D-10, Book 03 §2.1) is exactly that other axis: a claim about *the tree*, established by walking every runtime dependency's maintainer and license (Book 03 §2.3, "the tree is the unit"). The two are **orthogonal** — a package can have perfect build provenance and a non-US-origin dependency, or impeccable US-origin and no provenance at all. Neither implies the other, so a Caelum release carries **both** artifacts: the npm/SLSA build-provenance (generated by the CI publish) and a **shipped US-origin attestation** (the transitive-tree license/origin manifest from Book 03 §3.3/§3.4's runtime-tree scan, packaged into the tarball). Conflating them — "we have npm provenance, so we're US-origin-clean" — is the trap this book exists partly to prevent. Provenance is thus **neither necessary nor sufficient** for US-origin: it is a separate supply-chain axis a complete release ships *alongside*, never in place of, the US-origin attestation.

### 2.3 What Angular 22 gives you for free

As with performance (Book 18 §2.3), the platform already does the hard part, and most of Caelum's packaging job is **conformance plus two additions**. For free (research note): `ng build` on a library project runs **ng-packagr**, which "always builds with the AOT compiler," emits the **Angular Package Format** (FESM2022, bundled types, the `exports` map, `"sideEffects": false`), and produces a `dist/` that *is* the publishable package; secondary entry points are a first-class APF feature; and npm **Trusted Publishing** from a supported CI **auto-generates provenance** with no flag and no stored token. So the version-specific machinery — the builder string, the APF layout, the semver/deprecation policy, the OIDC publish — is all platform-provided and merely needs to be *used correctly and verified current* (the research note's job). Caelum adds exactly two things the platform does not: the **US-origin attestation** shipped in the package (§2.2), and the **shipped-library size gate** (Book 18 §3.2) that `angular.json` budgets don't cover because they measure the *application*, not the `ng-packagr` library. The discipline of this book is therefore mostly *don't fight the defaults*, plus *wire the two Caelum-specific gates*.

## 3. Architecture & Design

§3.1 is the library build (ng-packagr → APF, the publish flow); §3.2 is the consumer contract (the `exports` map + secondary entry points — the *how* to Book 18 §3.3's *why*); §3.3 is dependency declaration (peer deps + lockstep); §3.4 is versioning + `ng-update` migration; §3.5 is distribution with the two attestations; §3.6 is the release checklist that wires into `definition_of_done`.

### 3.1 The library build — ng-packagr and the Angular Package Format

In a v22 workspace, the library project's `angular.json` names the builder **`@angular/build:ng-packagr`** — distinct from the esbuild `application` builder that builds Forge (research note; the "library is not an application" split of Book 01 §2.2 is literally two builders). It "always builds with the AOT compiler," and it builds in **partial compilation** (`"compilationMode": "partial"`), which produces code "not tied to a specific Angular runtime version" so the *consuming* app fully compiles Caelum against its own Angular — the portability that lets a range of consumer apps adopt it (research note). The packaging config lives in **`ng-package.json`** (`$schema`, `dest`, and `lib.entryFile` pointing at the public-API barrel). The output is the **Angular Package Format**: a `fesm2022/` folder of flattened ES2022 modules, a `types/` folder of bundled `.d.ts`, and a generated `package.json`.

The publish flow is deliberately small: `ng build <lib> --configuration production` → `cd dist/<lib>` → `npm publish` — the `dist/` ng-packagr writes **is** the package, so there is no separate "assemble the tarball" step (research note). The library build tool itself (ng-packagr 22.0.0, MIT, released on Angular's GA day) runs at **build time only** — it is a **dev-tier** dependency (Book 03 §3.3), so its own provenance is judged by the relaxed dev-tier bar, not the runtime US-origin bar. Everything downstream in this chapter decorates that `dist/package.json`.

### 3.2 The consumer contract — the `exports` map and secondary entry points

This is the *how* for which Book 18 §3.3 gave the *why*. APF emits a `package.json` with **`"type": "module"`** and a conditional **`"exports"`** map. In current v22, each entry point is keyed by exactly two conditions — **`"types"`** (→ the bundled `.d.ts`) and **`"default"`** (→ the FESM2022 `.mjs`) — e.g. `".": { "types": "./types/core.d.ts", "default": "./fesm2022/core.mjs" }` (research note). A correction the research surfaced and the book must honor: **`esm2022` is not a v22 `exports` condition key** — it is a widely-blogged pre-consolidation artifact; do not author or expect it. The legacy `"module"`/`"typings"` fields are still emitted but are **deprecated fallbacks** for tooling that can't read `exports`.

**Secondary entry points** are the mechanism that packages "component-by-component." Each is a **separate top-level key** in `exports` (e.g. `"./select"`), independently importable and independently tree-shakable — the same shape `@angular/core` (`.`) vs `@angular/core/testing` (`./testing`) uses, and the shape Angular Material uses to publish each component as its own entry point (research note). ng-packagr **discovers** one by an **`ng-package.json` placed in a subdirectory** of the library — that file "can be as simple as `{}`," and ng-packagr derives the entry-point name from the folder. So Caelum's authoring rule is mechanical: **one subfolder with its own `ng-package.json` per component/adapter**, yielding `caelum/select`, `caelum/data-grid`, `caelum/editor`, each a separate import path (the bundle-cost *why* is Book 18 §3.3's). The same `exports` map can also expose theme assets via a **`"sass"`** condition (`"./theming": { "sass": "./_theming.scss" }`) — the single door for Book 04's token stylesheets alongside the component code. Whether Caelum ships as one package (`caelum`, Material's model) or a scope of many (`@caelum/*`) is an **M0 packaging decision**; the single-package-with-secondary-entry-points shape is the recommended default because it mirrors Material and keeps versioning lockstep-simple (§3.3–3.4).

### 3.3 Dependency declaration — peer dependencies and lockstep

A library must list `@angular/*` as **`peerDependencies`, not `dependencies`** — the docs are explicit about the failure mode: Angular in `dependencies` "might get a different Angular module instead, which would cause your application to break" (a duplicate-Angular-instance bug) (research note). angular.dev prescribes **no specific range syntax** in prose; the real convention comes from Angular's own shipped libraries — `@angular/cdk@22.0.2` declares `"@angular/core": "^22.0.0 || ^23.0.0"` (and the same for `common`/`platform-browser`), a **multi-major caret-OR range spanning the current and next major** (research note). Caelum follows that convention: `@angular/core|common|forms|platform-browser` (and `@angular/cdk`, plus `@angular/material` where the Direct layer wraps it) as peers at `^22.0.0 || ^23.0.0`.

The multi-major range is not cosmetic — it is what lets a consumer adopt Angular 23 the day it ships without waiting for a Caelum release, mirroring Angular's own peer-dependency carve-out (minors *widen* supported peer ranges; a bump is *required* only at the next major — §3.4). Material demonstrates the tightest form of lockstep: `@angular/material@22.0.2` pins `@angular/cdk` at **exactly `22.0.2`** — Material and CDK ship as one unit (research note). The three **adapter libraries** (grid/charts/editor, Books 13–15) are the deliberate exception: they stay behind their adapters and are **optional** peer dependencies or lazily loaded (Book 18 §3.4), never hard runtime deps of the core — so a consumer who never imports the grid never installs TanStack, and the core's US-origin tree (Book 03 §2.3) stays minimal.

### 3.4 Versioning & migration — semver, lockstep, and `ng-update`

Caelum inherits **Angular's semantic versioning** wholesale (research note): breaking public-API changes only in a **major**, backward-compatible features in a **minor**, fixes in a **patch**; a deprecated API survives **at least two more majors (≥12 months)** before it is a removal candidate. The strategic choice this implies is **lockstep**: cut a **Caelum major per Angular major** (Caelum 22 for Angular 22, 23 for 23), spend Caelum minors/patches on features and fixes between them, and inherit Angular's cadence (a major roughly every 6 months; 6 months Active + 12 months LTS support). This is the same discipline Material/CDK apply to themselves, and it gives a consuming team a versioning story they already understand from Angular.

The migration mechanism is the **`ng-update`** block in `package.json`, holding a **`migrations`** path to a Schematics collection (plus `packageGroup`/`requirements`); each migration entry carries a `version` and a `factory`, and `ng update caelum` runs every factory whose `version` falls inside the upgrade span (research note — sourced from the angular-cli spec, to verify against the installed CLI at M0). This is the tool that makes a breaking `cae-*` API change survivable: rename a selector or an input in Caelum 23, and ship a migration that rewrites consumer templates automatically on `ng update`. Note the boundary with Book 20: **`ng-update` migrations upgrade a consumer *already on Caelum* across Caelum majors**; the *`p-*`→`cae-*`* codemods that move a team *from PrimeNG* are a different collection and are Book 20's subject.

### 3.5 Distribution with two attestations

Caelum publishes from **GitHub Actions via npm Trusted Publishing**: the workflow authenticates with **OIDC** (`permissions: id-token: write`, a GitHub-hosted `ubuntu-latest` runner) and needs **no stored npm token** — short-lived signed credentials replace the long-lived secret (research note). Because the repo and package are public, npm **auto-generates provenance** (no `--provenance` flag needed): the tarball is linked to its source repo/commit/workflow, signed by **Sigstore** (a ~10-minute Fulcio certificate) and logged in the **Rekor** transparency ledger, achieving **SLSA Build Level 2** and a verifiable **provenance badge** on npm that consumers check with `npm audit signatures`. That is the build-origin attestation of §2.2, and it is almost entirely free once the publish runs in CI.

The **second** attestation is Caelum's own and has no platform equivalent: the **US-origin attestation** — the transitive-tree license/origin record from Book 03 §3.3/§3.4, emitted as a machine-readable manifest plus a human-readable statement and **included in the published tarball**. It records that every *runtime* dependency (the core stack + any provided adapter's tree) is permissive-licensed and US-origin per D-10, walked transitively (Book 03 §2.3). Shipping it *in* the package matters: a consumer bound by the same constraint can verify Caelum's claim from the artifact they installed, not a webpage that may drift. The release therefore produces two independent, verifiable claims — *how it was built* (npm/SLSA) and *what it is made of and who owns that* (Caelum's manifest) — and neither substitutes for the other.

### 3.6 The release checklist — what a Caelum release must include

Publishing is a gated act, and the gate composes the pieces above into `definition_of_done`'s provenance and packaging checks. A Caelum release is done only when:

- **Built correctly** — `@angular/build:ng-packagr`, production config, partial compilation; the emitted `dist/package.json` has per-entry-point `exports` (`types`/`default`), `"sideEffects": false`, one secondary entry point per component/adapter (§3.1–3.2).
- **Peer/version-correct** — `@angular/*` in `peerDependencies` at `^22.0.0 || ^23.0.0`, nothing Angular in `dependencies`, the Caelum version consistent with the lockstep major, an `ng-update` collection present for any breaking change (§3.3–3.4).
- **Size-gated** — the **shipped-library size gate** (Book 18 §3.2) passes: each secondary entry point is under its committed byte budget and no cross-import has leaked (e.g. `cae-select` must not drag in the grid engine). This is the bespoke CI step deferred to **M0-4** — `angular.json` budgets do not cover it.
- **Doubly attested** — the CI publish emits npm/SLSA build provenance, **and** the US-origin attestation is present in the tarball and green against the transitive runtime tree (Book 03 §3.4). Both, or the release is not done (§2.2).

The through-line mirrors Book 16 and Book 18: a claim is only real if a **mechanical gate** enforces it on every release. "We publish correctly" without the gate is a hope; the checklist above is the gate.

## 4. Implementation

The load-bearing config, sketched for a `caelum` library with a `select` secondary entry point. **Version-specific values are grounded in the research note; treat exact field sets as *verify at M0 against the live v22 workspace* — do not hand-copy as gospel.**

**(a) The library `ng-package.json`** (primary entry point):

```json
{
  "$schema": "../../node_modules/ng-packagr/ng-package.schema.json",
  "dest": "../../dist/caelum",
  "lib": { "entryFile": "src/public-api.ts" }
}
```

**(b) A secondary entry point** — `projects/caelum/select/ng-package.json`, per §3.2 "can be as simple as `{}`"; ng-packagr derives the name `caelum/select` from the folder:

```json
{ "lib": { "entryFile": "src/public-api.ts" } }
```

**(c) The emitted `dist/package.json`** (illustrative — ng-packagr generates the `exports` and copies `repository` from the source lib `package.json`; note `types`/`default` only, **no `esm2022`**, `sideEffects:false`, and a **`repository` field — npm provenance/trusted publishing hard-fails without one that matches the building repo**; the exact `.d.ts` sub-paths are ng-packagr's to emit — verify at M0):

```json
{
  "name": "caelum",
  "version": "22.0.0",
  "type": "module",
  "sideEffects": false,
  "repository": { "type": "git", "url": "https://github.com/<org>/caelum.git" },
  "peerDependencies": {
    "@angular/core": "^22.0.0 || ^23.0.0",
    "@angular/common": "^22.0.0 || ^23.0.0",
    "@angular/forms": "^22.0.0 || ^23.0.0",
    "@angular/platform-browser": "^22.0.0 || ^23.0.0",
    "@angular/cdk": "^22.0.0 || ^23.0.0"
  },
  "ng-update": { "migrations": "./migrations/migration-collection.json" },
  "exports": {
    "./package.json": "./package.json",
    ".":        { "types": "./types/caelum.d.ts",        "default": "./fesm2022/caelum.mjs" },
    "./select": { "types": "./types/select/caelum-select.d.ts", "default": "./fesm2022/caelum-select.mjs" }
  }
}
```

**(d) The GitHub Actions publish workflow** — Trusted Publishing, OIDC, no stored token; provenance is automatic for a public repo/package (research note):

```yaml
# .github/workflows/release.yml (sketch — verify action + npm versions at M0)
permissions:
  id-token: write          # required for OIDC trusted publishing + provenance
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest  # a GitHub-hosted runner is required
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, registry-url: 'https://registry.npmjs.org' }
      - run: npm install -g npm@latest   # OIDC trusted publishing needs a recent npm — verify the minimum at M0
      - run: npm ci
      - run: npx ng build caelum --configuration production
      - run: node tools/emit-us-origin-attestation.mjs dist/caelum   # Caelum's 2nd attestation (Book 03 §3.4)
      - run: npm publish            # provenance auto-generated (needs one-time trusted-publisher config on npmjs.com)
        working-directory: dist/caelum
```

**(e) The US-origin attestation** shipped in the tarball (Caelum-specific; Book 03 §3.3/§3.4) — a manifest asserting the walked runtime tree, e.g. `us-origin.attestation.json`:

```json
{
  "package": "caelum", "version": "22.0.0", "policy": "D-10",
  "runtimeTree": [
    { "name": "@angular/core", "license": "MIT", "origin": "US (Google)", "verified": "2026-06-30" }
  ],
  "note": "Build-origin provenance is separate (npm/SLSA via Sigstore). This attests the runtime dependency tree's license+origin only."
}
```

The `emit-us-origin-attestation` step is a Caelum tool (M0-4), not a platform feature — it encodes the §2.2 point that build provenance and US-origin are different claims.

## 5. Bleeding Edge

- **ng-packagr 22.1.x** (`main` is `22.1.0-next.2`) may add `exports` conditions or smoother secondary-entry-point ergonomics — track before pinning the packaging config (research note). Do not assume conditions beyond `types`/`default`/`sass` for v22.
- **npm Trusted Publishing scope** — currently GitHub Actions / GitLab CI / CircleCI, auto-provenance public-only, **self-hosted runners unsupported** (research note). Watch for expansion; a Caelum private-fork consumer can't rely on auto-provenance today.
- **SLSA level & predicate version** — npm provenance is Build **Level 2** now; which predicate version (v0.2 vs v1.0) the CLI emits by default is unconfirmed. If npm reaches Build L3, Caelum's supply-chain story strengthens for free.
- **First-class packaging scaffolding** — whether v22.1+ folds `ng-update`/`ng-add`/secondary-entry-point wiring into `ng generate library` (reducing the bespoke config in §4).
- **`module`/`typings` removal** — already-deprecated fallbacks; their eventual removal will make `exports` the sole resolution surface, which only helps a modern-bundler consumer.

## 6. Gaps & Opportunities

- **The US-origin attestation format is a Caelum invention.** There is no standard for "attest the transitive-tree origin" the way SLSA standardizes build provenance — designing the manifest schema (and a verifier a consumer can run) is genuine Caelum work at M0-4, and a candidate to open-source as a general tool.
- **Private-package provenance is unconfirmed** for the manual `--provenance` path (research note); moot while Caelum is public, but flagged for any private-fork story.
- **Monorepo / many-package publishing.** If Caelum ever splits into `@caelum/*` packages (vs one package with secondary entry points), version-lockstep across them and coordinated releases become a real problem (the exact-pin trick Material uses for CDK is the pattern to study).
- **Deprecation tooling.** Honoring the ≥2-major deprecation window mechanically (flag a deprecated `cae-*` API, warn at build, remove on schedule) is not automated by the platform — an opportunity for a Caelum lint/schematic.
- **`ng-update` field set** is grounded in the angular-cli spec repo (undated), not a v22-tagged page — verify at M0.

## 7. AI & Claude Code Integration

Packaging is where an agent's failure modes are expensive and quiet, so this book draws bright lines for Claude Code:

- **Never fabricate version-specific packaging config.** Builder strings, `exports` conditions, peer-range syntax, `ng-update` fields, provenance flags — all are version-specific and post-cutoff. Ground every such claim in `research/notes/angular-22-packaging.md` or **verify against the live v22 workspace**; the note already caught two traps an agent would otherwise repeat from memory (`esm2022` as an `exports` key; a doc-prescribed peer range). Mark unverified specifics as such rather than asserting them.
- **The two-provenance rule is a review invariant.** When the agent touches distribution, it must not let npm provenance stand in for the US-origin attestation (§2.2) — the `definition_of_done` provenance gate scans the *shipped runtime tree*, and an agent that reports "provenance ✔" without the US-origin manifest has passed the wrong check.
- **Author `ng-update` migrations, don't hand-wave them.** A breaking `cae-*` change the agent makes should come with the migration factory that rewrites consumers — the agent is well-suited to write both the change and its codemod in one slice (ticket-first, per CLAUDE.md).
- **Guard the size gate.** The agent should treat a cross-import that breaks per-entry-point tree-shaking (Book 18 §3.2) as a release-blocking regression, not a style nit — it silently erodes the "component-by-component" promise.
- **Packaging drift is adapter-erosion's cousin.** The same vigilance Book 12 asks for at the adapter boundary applies to the `exports` map and peer ranges: they degrade one careless edit at a time, and only a gate catches it.

## 8. Exercises & Further Reading

**Exercises.**
1. **Scaffold and inspect.** Generate a two-component `caelum` library with one secondary entry point each; build it and read the emitted `dist/package.json` — confirm per-entry `exports` (`types`/`default` only), `"sideEffects": false`, `fesm2022/*.mjs`, `types/*.d.ts`. Then import one component into a demo app and prove (Book 18 §3.2's gate) the unused one contributes **zero** bytes.
2. **Peer-range reasoning.** Explain why `"@angular/core": "^22.0.0 || ^23.0.0"` (not `^22.0.0`) is the right peer range, tying it to Angular's peer-dependency carve-out (§3.4). What breaks for a consumer if Caelum pins `@angular/core` in `dependencies` instead?
3. **The two attestations.** Wire a throwaway Trusted-Publishing workflow for a probe package; verify the npm provenance badge and `npm audit signatures`; then add a US-origin manifest to the tarball and articulate, in two sentences, what each attestation proves that the other does not (§2.2).
4. **A migration.** Author an `ng-update` migration collection with one factory that renames a `cae-*` input across a mock major bump; run `ng update` and confirm the consumer template is rewritten. Contrast it with the `p-*`→`cae-*` codemod Book 20 will build.

**Further Reading.** **Book 20 — Migration & Adoption** (next; completes Volume V) — the PrimeNG→Caelum component map, the `p-*`→`cae-*` codemods, incremental adoption, adapter-erosion prevention. **Book 18 §3.2–3.3** — *why* the tree-shakable secondary-entry-point shape this book publishes is worth shipping (the bundle-cost case, and the shipped-library size gate). **Book 03 §2.1–2.3, §3.3–3.4** — the two hard rules, the origin-is-the-tree principle, and the runtime-vs-dev provenance split the US-origin attestation implements. **Book 12 §3.4** — the `provide*()` + DI shape that keeps adapters tree-shakable and out of the core's peer tree. **Book 01 §2.2** — the library-is-not-an-application principle that is, at bottom, why there are two builders and this whole book. Frontier specifics: [`research/notes/angular-22-packaging.md`](../../research/notes/angular-22-packaging.md).
