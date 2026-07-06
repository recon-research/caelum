# M2 Grid Adapter — TanStack Transitive-Provenance Sign-off (D-07 / D-11)

**Date:** 2026-07-05 · **Slice:** #169 · **Decision ratified:** D-07 (grid library) · **Rule applied:** D-11 (US-preferred + allied fallback; permissive + free; shipped-runtime scope) · **Verdict: PASS (clean).**

This is the mandated *"final transitive-provenance sign-off before pinning"* for the advanced data-grid library (`docs/ROADMAP.md` M2; `docs/ARCHITECTURE.md` Appendix A D-07, previously provisional). It vets **TanStack Table** and ratifies D-07 so the grid adapter (#171) can build on it. It is the M2 grid analogue of the M0-2 scan; the editor (D-09 / Lexical) and charts (D-14 / D3-direct) get their own sign-offs when those slices start.

> **Allowlist timing.** The `allowlist.json` runtime row (§6) is admitted **atomically with the `npm i` in #171**, not here — `scripts/check_provenance.py` emits a *"no resolved package — prune the allowlist row"* note for a row whose package is not yet installed, so pre-staging it would merge a gate note. The vetting below is the sign-off; the mechanical admission rides with the install.

## 1. Scope

The grid is built on the **headless zero-dep core `@tanstack/table-core` only** (per decision #168's recommended default: the `cae-data-grid` component owns its own DOM/render path via `cdk-virtual-scroll`, so the framework binding `@tanstack/angular-table` and its `flexRender` render path are **not** shipped). `@tanstack/angular-table` was vetted for completeness (§4) but is **not admitted** to the allowlist — the allowlist tracks the shipped surface. Bringing it in later (if #168 is overruled toward the framework-adapter render path) requires re-adding its row (`tslib` + `table-core`, both already vetted; peer `@angular/core`, Angular closure).

## 2. Runtime package table (shipped surface = 1 new node)

| Package | Ver | License | Permissive+Free | Maintainer / Entity | HQ / residence | US/allied origin | Shipped-runtime | Runtime deps |
|---|---|---|---|---|---|---|---|---|
| **@tanstack/table-core** | 8.21.3 | MIT | Yes | Tanner Linsley / TanStack (individual/community org) | US (Syracuse, UT) | **Yes** *(indiv. maintainer — mirrors rxjs/zod, M0-2 §5)* | conditional (opt-in engine, behind `grid.adapter.ts`) | **none — dependency-free** |

**Full transitive runtime closure of the shipped grid stack:** `@tanstack/table-core` (MIT, US) → **leaf**. No copyleft, no paid, no non-allied node anywhere. `table-core@8.21.3` declares **no `dependencies` and no `peerDependencies`** (verified from the raw published package.json, 2026-07-05) — the "dependency-free" reputation holds.

## 3. License axis — GREEN (no interpretation required)

`@tanstack/table-core` is **MIT** — squarely in `runtimePermissive`. The gate's license-drift check (`scripts/check_provenance.py`) hard-fails if a resolved lockfile version ever reports a non-MIT license, so a future version bump cannot silently slip a license change past.

## 4. Origin axis — GREEN under D-11

TanStack is the individually-led open-source org of **Tanner Linsley, resident in Syracuse, Utah, USA** — a US-resident individual maintainer under a permissive license, which satisfies origin outright under D-11 (no US legal entity required; the `rxjs`/`zod` precedent). The `@tanstack/angular-table` co-maintainers, though that package is not shipped, are all US/allied (Kevin Van Cott US, Kyle Mathews US, Dominik Dorfmeister AT, Lachlan Collins AU, Manuel Schiller DE) — all in `alliedNations`.

## 5. Version pin & forward guard

- **Pin: v8 stable** — `@tanstack/table-core@8.21.3` (adopted with `@tanstack/angular-table@8.21.4`'s core pin; installed in #171).
- **v9 is beta** (`9.0.0-beta.*`, published 2026-07-05) and restructures features into tree-shakeable plugins (deps could differ) — **re-verify its transitive tree before any bump**. The gate's drift check backstops the license axis automatically; the origin axis is re-checked here by hand on a major bump.

## 6. Bottom line

- **License: GREEN, unconditional.** MIT, permissive + free.
- **Origin: GREEN under D-11.** US by maintainer residence; dependency-free tree = no transitive origin exposure.
- **Overall: GREEN — PASS.** D-07 is ratified from provisional to pinned. The allowlist row below is admitted to `provenance/allowlist.json` → `runtime` **in #171**, together with `npm i @tanstack/table-core@8.21.3` (see the Allowlist-timing note above).

**Ready-to-paste allowlist row (add under `"runtime"` in `provenance/allowlist.json` in #171):**

```json
"@tanstack/table-core": {
  "version": "8.21.3",
  "license": "MIT",
  "origin": "US",
  "maintainer": "Tanner Linsley / TanStack (Syracuse, UT — individual/community org)",
  "shipped": "conditional",
  "note": "framework-agnostic headless grid engine behind grid.adapter.ts (D-07, M2 grid adapter #171). CONDITIONAL ship: an OPTIONAL peerDependency, left EXTERNAL in the fesm — enters a consumer bundle ONLY on opt-in via provideTanStackGrid(); the client default ships zero engine bytes. Dependency-free — no runtime deps, no peers (verified raw package.json 8.21.3, 2026-07-05); US by maintainer residence, mirrors the rxjs/zod precedent. Sign-off: docs/provenance/M2-grid-tanstack-signoff.md"
}
```

> **Shipped classification refined in #171 (`yes` → `conditional`).** table-core is an *optional* peerDependency left external in the fesm: it reaches a consumer bundle only when they opt into `provideTanStackGrid()`, so it is `conditional` (the `@angular/compiler` JIT-only precedent), not unconditionally shipped. License + origin vetting is unchanged; the gate treats `conditional` and `yes` identically for the license/origin axes.

## 7. Sources (accessed 2026-07-05)

- `https://registry.npmjs.org/@tanstack/table-core/latest` · `https://unpkg.com/@tanstack/table-core@latest/package.json` (raw manifest — no `dependencies`/`peerDependencies`)
- `https://registry.npmjs.org/@tanstack/angular-table/latest` · `https://www.npmjs.com/package/@tanstack/angular-table`
- `https://github.com/TanStack/table` · `https://tannerlinsley.com/about` (Syracuse, Utah, US)
