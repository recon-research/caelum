# M0-2 Transitive Provenance Scan (D-05 / D-10)

**Milestone:** M0 — Foundation · **Issue:** #2 (M0-2) · **Scan date:** 2026-07-01
**Scope:** the full transitive **runtime** dependency closure of the Caelum workspace (library `caelum` + Forge app), beyond the local `caelum` library itself — **15 runtime packages**.
**Gate under test:** the two non-negotiable supply-chain rules — **(1) no paid license** (every runtime dep permissive + free) and **(2) US-origin only** across the full transitive runtime tree (D-05 / D-10).
**Verdict:** **AMBER** — the **license axis is fully green**; the **origin axis is green for the shipped browser-client runtime but requires a D-10 scoping interpretation** to be declared clean, because Angular's own mandated closure pulls two UK-maintained packages (`parse5`, `entities`) and one non-US-working-group types package (`@standard-schema/spec`). None of the three ships bytes into a default browser production bundle.
**Decision:** the D-10 scoping fork this scan surfaced is filed as [#21](https://github.com/recon-research/caelum/issues/21) (recommended default = Reading (B), shipped-runtime scope; §5). This scan and its downstream slices proceed **provisionally on Reading (B)** until #21 is ratified (silence past the 48h objection window ratifies).

---

## 1. Method

- **Enumeration:** installed `node_modules` runtime tree, cross-checked with `npm ls --omit=dev --all`.
- **License:** read directly from each installed `node_modules/<pkg>/package.json` `license` field and, for the non-MIT cases (`entities`, `rxjs`, `tslib`), the actual `LICENSE` text.
- **Origin:** maintainer / maintaining-entity residence researched from live sources (GitHub profiles, corporate/org pages, personal sites) — every claim carries a fetched URL + accessed date; see §7.
- **Shipped-vs-dev-path:** `grep` of the shipped `fesm2022/` bundles to determine whether a declared dependency actually reaches a consumer production bundle or tree-shakes / dead-code-eliminates out. This distinction is load-bearing for the origin verdict.
- **Adversarial verification:** three independent red-team lenses (runtime-completeness, US-origin/maintainer-residence, license) re-enumerated the tree and attempted to falsify a "green" call. Their corrections are folded in below (§4, §6).

**Locally re-verified for this report:**
`grep -rl parse5 node_modules/@angular/cdk/fesm2022/` → *no match* · `grep -rl zod node_modules/@angular/forms/fesm2022/` → *no match* · `wc -c node_modules/@standard-schema/spec/dist/index.js` → **0** · `@angular/animations` and `zone.js` → *unmet optional / not installed*.

---

## 2. Runtime package table (15 packages)

| Package | Ver | License | Permissive+Free | Maintainer / Entity | HQ Country | US-origin | Shipped-runtime | Pulled by |
|---|---|---|---|---|---|---|---|---|
| @angular/core | 22.0.4 | MIT | Yes | Angular team / Google LLC | US | **Yes** | yes | root dep; peer of all @angular/* |
| @angular/common | 22.0.4 | MIT | Yes | Angular team / Google LLC | US | **Yes** | yes | root dep; peer of forms/router/cdk/material |
| @angular/compiler | 22.0.4 | MIT | Yes | Angular team / Google LLC | US | **Yes** | conditional (JIT only; AOT tree-shakes it out) | root dep; peer of core |
| @angular/forms | 22.0.4 | MIT | Yes | Angular team / Google LLC | US | **Yes** | yes (when form features imported) | root dep; peer of material |
| @angular/router | 22.0.4 | MIT | Yes | Angular team / Google LLC | US | **Yes** | yes (when routing used) | root dep; Forge app |
| @angular/platform-browser | 22.0.4 | MIT | Yes | Angular team / Google LLC | US | **Yes** | yes | root dep; peer of router/forms/cdk/material |
| @angular/cdk | 22.0.3 | MIT | Yes | Angular Components / Google LLC | US | **Yes** | yes (per-entry-point) | root dep; peer of material/aria |
| @angular/material | 22.0.3 | MIT | Yes | Angular Components / Google LLC | US | **Yes** | yes (per-component) | root dep |
| @angular/aria | 22.0.3 | MIT | Yes | Angular Components / Google LLC | US | **Yes** | yes (per-primitive) | root dep |
| rxjs | 7.8.2 | Apache-2.0 | Yes | Ben Lesh / ReactiveX (individual) | US (Austin, TX) | **Yes** *(indiv. maintainer — see §5)* | **yes (every Angular bundle)** | peer of @angular/core |
| tslib | 2.8.1 | 0BSD | Yes | Microsoft Corp. | US (Redmond, WA) | **Yes** | yes (emit helpers inlined) | all @angular/*, rxjs, injection-js |
| zod | 4.4.2 | MIT | Yes | Colin McDonnell (individual) | US (Seattle, WA) | **Yes** *(indiv. maintainer — see §5)* | **no (phantom dep; absent from forms/fesm2022)** | dep of @angular/forms (^4.0.10) |
| **parse5** | 8.0.1 | MIT | Yes | Ivan Nikulin + EU co-maintainers | **United Kingdom** | **No** | **no (schematics/dev-tooling only)** | dep of @angular/cdk (^8.0.0) |
| **entities** | 8.0.0 | BSD-2-Clause | Yes | Felix Boehm (individual) | **United Kingdom** | **No** | **conditional (SSR/server only; not browser)** | dep of parse5 (^8.0.0) |
| **@standard-schema/spec** | 1.1.0 | MIT | Yes | Informal intl. working group | **Non-US** (mixed; DE co-creator) | **No** | **no (types-only; 0-byte runtime)** | dep of @angular/forms (^1.0.0) |

Bold rows are the three origin flags. All three are permissive+free; none contributes bytes to a default browser production bundle.

---

## 3. License axis — GREEN (no interpretation required)

All 15 runtime packages are **OSI-approved, permissive, and royalty-free**, across four license families:

- **MIT (12):** all nine `@angular/*`, `parse5`, `zod`, `@standard-schema/spec`.
- **BSD-2-Clause (1):** `entities` — verified as the 2-clause "Simplified" variant (no advertising clause, no copyleft).
- **Apache-2.0 (1):** `rxjs` — full unmodified license text with an express patent grant; **no `NOTICE` file is present in the package**, so the §4(d) NOTICE-propagation obligation never triggers.
- **0BSD (1):** `tslib` — public-domain-equivalent, "with or without fee," imposes no attribution retention at all.

No copyleft (GPL/LGPL/MPL), no source-available-only, no dual/commercial tier, no CC-BY-SA. The SPDX expressions were grepped for `SEE`/`commercial`/`proprietary`/dual-license operators — none found. **Rule (1) "no paid license" holds unconditionally.** The only outstanding item is ordinary attribution compliance (see §8).

---

## 4. Origin axis — GREEN for the shipped browser client, pending the D-10 scoping decision (§5)

**US-origin, high confidence (12 of 15):** all nine `@angular/*` (Google LLC, Mountain View, CA), `tslib` (Microsoft, Redmond, WA), `rxjs` (Ben Lesh, Austin, TX), `zod` (Colin McDonnell, Seattle, WA). See §7 for per-package sourcing.

**Flagged non-US (3 of 15)** — each pulled by a first-party Angular package Caelum depends on directly, and each verified to **not reach a default browser production bundle**:

- **`parse5` 8.0.1 — United Kingdom.** Lead maintainer Ivan Nikulin (Principal Engineer, Cloudflare, London); active co-maintainers are European (Felix Boehm — UK, Titus Wormer — NL, James Garbutt — UK). Declared as a regular `dependencies` entry of `@angular/cdk` (`parse5: ^8.0.0`) and therefore installed on every `npm install`, but referenced **only** under `@angular/cdk`'s `schematics/` subtree (`ng-update` / HTML manipulation). `grep -rl parse5 node_modules/@angular/cdk/fesm2022/` returns **nothing** — it is absent from the browser runtime bundle. Angular schematics run at build/migration time via the CLI dev tooling and are never bundled into the shipped application. **shipped-runtime = no.**

- **`entities` 8.0.0 — United Kingdom.** Solo maintainer Felix Boehm (fb55), who publicly relocated from Silicon Valley to London in 2021. BSD-2-Clause, zero runtime deps (leaf). Pulled only by `parse5` (`entities: ^8.0.0`), so it rides the same schematics chain for the browser target. **This is the one genuine shipped-runtime origin exposure:** the `parse5`+`entities` HTML-parsing chain **is reachable on Angular SSR / server-side-rendering runtime paths**, so in an *SSR/server* bundle a non-US package **can** be present. It is **absent from the browser client bundle.** **shipped-runtime = conditional (SSR only).**

- **`@standard-schema/spec` 1.1.0 — non-US working group.** A types-only spec co-authored by Colin McDonnell (US), Fabian Hiller (Germany-origin — built Valibot as a Stuttgart Media University bachelor thesis), and David Blass; no single US-HQ'd entity. Declared as a direct `dependencies` entry of `@angular/forms` (`^1.0.0`). Verified **types-only**: `dist/index.js` is **0 bytes**, `dist/index.d.ts` is pure erasable TS interfaces, `sideEffects:false`. `@angular/forms` references it only in `signals.mjs` via the duck-typed `schema['~standard'].validate(...)` contract, which erases at compile (the only fesm hit is `signals.mjs.map`). **Contributes zero runtime bytes. shipped-runtime = no.**

**Net:** for the pinned target (default **zoneless Angular browser client, AOT**), the set of packages whose code actually reaches a consumer production bundle is **100% US-origin**. The three non-US flags are a build-tooling parser (`parse5`), its leaf (`entities`, browser-inert / SSR-conditional), and a 0-byte types spec (`@standard-schema/spec`). Rule (2) is satisfied **on the shipped-runtime reading**; it is *not* satisfiable on a strict full-installed-tree reading while D-01/D-02 mandate the Angular foundation (see §5).

---

## 5. D-10 interpretation decision (the fork this report must resolve)

The tension is real and structural: **D-01/D-02 mandate** building on Angular Material + CDK + Aria (Google, US), but **Angular's own transitive closure** pulls `parse5` (UK) and `entities` (UK) as regular `dependencies`. A strict *per-package, full-installed-tree* origin reading therefore conflicts with the mandated foundation. D-10 must be scoped to be both honest and satisfiable.

**Fork.** Does "US-origin only across the full transitive runtime tree" bind:

- **(A) the full installed tree** — every node in `node_modules` pulled by the runtime tree, per-package, regardless of shipped reachability; or
- **(B) shipped-runtime reachability** — only packages whose bytes actually reach a consumer's production bundle.

**Recommendation — adopt (B), recorded as a D-10 refinement (reversible; provisional-by-default, ratified by silence past the objection window).**

Rationale, grounded in the evidence above:

1. **(A) is mechanically unsatisfiable under the mandate.** `parse5`→`entities` are regular deps of Google's own `@angular/cdk`. Reading (A) would force abandoning the D-01/D-02 foundation over a build-time HTML parser that never ships. A rule that contradicts a standing architectural mandate is a defect in the rule, not the tree.
2. **(B) is clean and evidence-backed.** Two independent adversarial lenses re-enumerated the tree and confirmed every relevant tree-shake: `parse5` absent from `cdk/fesm2022`, `zod` absent from `forms/fesm2022`, `@standard-schema/spec` 0-byte/erased. The shipped browser bundle is 100% US-origin.
3. **Two guardrails keep (B) honest (not a loophole):**
   - **Pin the shipping posture to the browser client for M0; treat SSR as out-of-scope.** `entities` is the *only* non-US package that can reach a shipped bundle, and only via SSR. Any future SSR adoption **must re-run this gate** and either explicitly carve out `entities` (UK, BSD-2-Clause, transitive via Google's own CDK) or eliminate the `parse5` SSR path. This is filed as a standing condition on the origin gate.
   - **Clarify the "entity" wording:** an **individual maintainer who is a US resident, shipping under a permissive license, satisfies D-10.** Otherwise `rxjs` — Ben Lesh, an individual with no US legal-entity steward — fails the literal "entity HQ'd in the US" phrasing, even though it ships into **every** Angular bundle. The same clarification covers `zod` and `@standard-schema/spec`. Reading D-10 to require a US *legal entity* would fail the reactive core of Angular itself, which is absurd; the honest fix is to define origin by maintainer residence for individually-maintained permissive packages.

**Alternative readings considered:** (A) strict full-tree — rejected as self-contradictory with D-01/D-02; (B-strict) shipped-runtime *including SSR* — the correct reading to switch to the moment SSR is committed, flags `entities` as a conditional exposure needing a carve-out; (C) legal-entity-strict origin — rejected, fails `rxjs`/`zod`/`@standard-schema` and is unsatisfiable for the JS ecosystem; (D) license-only, drop origin — rejected, discards a stated non-negotiable.

> **Filing:** record the above as a refinement of **D-10** in `docs/ARCHITECTURE.md` Appendix A (shipped-runtime scope + browser-client posture + individual-US-resident-satisfies-origin), and note the SSR re-scan condition. This resolves the standing tension explicitly rather than letting it drift.

---

## 6. Completeness verification (adversarial correction folded in)

The runtime-completeness lens **refuted the "complete" claim** of the raw enumeration. Two **optional** dependencies were omitted; both are currently **unmet/uninstalled** (which is why they were skipped), and both are **MIT / Google / US-origin**, so their omission is a **rigor defect, not a compliance failure**:

- **`@angular/animations` (+ `@angular/animations/browser`)** — optional peer of `@angular/platform-browser`; **enters the shipped browser bundle** the moment a consumer enables animations (`provideAnimations()` / `BrowserAnimationsModule`) — near-certain for a Material-based library. `platform-browser/fesm2022/animations.mjs` statically imports `@angular/animations/browser`. Its subtree is US-origin but currently unaudited because uninstalled.
- **`zone.js`** — optional dep of `@angular/core`; enters the shipped bundle if a consumer opts into zone-based change detection. Caelum is **zoneless-by-default**, so it is uninstalled — but it is a reachable shipped path.

**Action:** add both (and `@angular/animations/browser`) to the provenance ledger as **optional / conditional-shipped US-origin** nodes, and have the issue-#4 scanner **model optional peers**, so a future *non-US* optional dep cannot slip through the same blind spot. No `bundledDependencies` and **no install/postinstall scripts** exist in any of the 15 runtime packages (scanned) — no hidden supply-chain expansion.

---

## 7. Origin sourcing (per package, live sources)

- **@angular/\* (all 9):** Google LLC, Mountain View, CA. Sources: `en.wikipedia.org/wiki/Angular_(web_framework)` (Google-developed, MIT), `opensource.google/projects/angular`, `en.wikipedia.org/wiki/Google` (Googleplex HQ). Accessed 2026-07-01.
- **rxjs:** Ben Lesh, Austin TX — `github.com/benlesh`, `linkedin.com/in/blesh/`, `rxjs.dev`. Individual maintainer / informal ReactiveX org (see §5 wording caveat). Accessed 2026-07-01.
- **tslib:** Microsoft Corp., Redmond WA — installed `package.json` (`author: Microsoft Corp.`), `en.wikipedia.org/wiki/Microsoft_campus`, `opensource.org/license/0bsd`. Accessed 2026-07-01.
- **zod:** Colin McDonnell, Seattle WA — installed `package.json`, `linkedin.com/in/colinmcd/`, `colinhacks.com/about`, `clerk.com/blog/zod-fellowship`. US individual; phantom dep. Accessed 2026-07-01.
- **parse5:** Ivan Nikulin, London UK — `github.com/inikulin`, `research.cloudflare.com/people/ivan-nikulin/`, `theorg.com/org/cloudflare/org-chart/ivan-nikulin`; LICENSE `github.com/inikulin/parse5/blob/master/LICENSE`. **Non-US.** Accessed 2026-07-01.
- **entities:** Felix Boehm, London UK — `github.com/fb55`, `x.com/fb55/status/1461417143229112326` (Silicon Valley→London relocation), `feedic.com/`. **Non-US.** Accessed 2026-07-01.
- **@standard-schema/spec:** informal working group — `standardschema.dev/`, `github.com/fabian-hiller/valibot` (Fabian Hiller, Stuttgart Media University, Germany), `colinhacks.com/about`. **Non-US / mixed.** Accessed 2026-07-01.

License text independently read for `entities` (`node_modules/entities/LICENSE`, 2-clause BSD), `rxjs` (`node_modules/rxjs/LICENSE.txt`, Apache-2.0, no NOTICE file), `tslib` (`node_modules/tslib/LICENSE.txt`, 0BSD).

---

## 8. Attribution / NOTICE compliance to-dos (when Caelum ships)

- **MIT (12 pkgs) + BSD-2-Clause (`entities`) + Apache-2.0 (`rxjs`):** must retain copyright + permission/license notices in the published distribution. `tslib` (0BSD) requires **nothing**.
- **Apache-2.0 (`rxjs`):** no `NOTICE` file exists in the package, so §4(d) NOTICE-propagation does **not** apply — only the standard license-text retention.
- **Action:** Caelum's published package should bundle a third-party-license file (`3rdpartylicenses.txt`-equivalent) covering all runtime-reaching deps (`@angular/*` + `rxjs` at minimum; `tslib` optional). LICENSE files are confirmed present in `@angular/{core,cdk,material,aria}`, `parse5`, `zod`, `@standard-schema/spec`, `rxjs`, `tslib`, `entities`, so the attribution source material is available. The Angular CLI already auto-emits `3rdpartylicenses.txt` for consumer apps; Caelum's own package must carry its equivalent.
- **Provenance note:** this is the *shipped US-origin attestation* provenance (Book 03 §2.3 / Book 19), orthogonal to npm/SLSA *build* provenance — the two are tracked separately.

---

## 9. Automation — issue #4 (CI gate + attestation emitter)

This report is the manual M0 baseline; **issue #4** makes it a standing, mechanical gate so the tree cannot silently drift:

1. **License gate:** walk the production dependency tree (`npm ls --omit=dev --all`), read each `license` SPDX field, and fail CI on anything outside an allowlist of OSI-approved permissive licenses (MIT, BSD-2/3-Clause, Apache-2.0, 0BSD, ISC). Blocks any paid/copyleft/source-available/dual-commercial license.
2. **Origin gate (shipped-runtime scope, per the §5 (B) decision):** classify each package **shipped vs dev/schematics-only** via the `fesm2022` reachability check demonstrated here (grep-based, plus optional-peer modeling per §6), and evaluate US-origin **only** on shipped-runtime nodes. Maintain a reviewed origin ledger (package → HQ country → shipped? → evidence link) as data, with an explicit **allowlist carve-out** for `parse5`/`entities` on the *dev/schematics path* and a **hard flag** if either ever appears in a shipped `fesm`/browser bundle. Fail on any new **non-US shipped** node.
3. **SSR guard:** the origin gate carries the §5 condition — if the build target includes SSR, `entities` moves into scope and must be explicitly carved out or eliminated; the gate refuses to auto-pass an SSR build without that decision.
4. **Optional-peer modeling:** enumerate optional peers (`@angular/animations`, `zone.js`, …) and audit them as conditional-shipped nodes so a future non-US optional dep is caught (closes the §6 blind spot).
5. **Attestation emitter:** on release, emit the **shipped US-origin attestation** (the Book 03 §2.3 provenance, distinct from npm/SLSA build provenance) — a signed manifest listing every shipped runtime package with license, maintaining entity, HQ country, and evidence link — plus the bundled third-party-license file (§8).
6. **Two size gates** (Book 18) run alongside but are a separate concern (issue #4 design task, not a D-NN).

---

## 10. Bottom line

- **License (rule 1): GREEN, unconditional.** All 15 runtime packages permissive + free.
- **Origin (rule 2): GREEN for the shipped zoneless browser client, pending the D-10 scoping refinement in §5.** The three non-US flags (`parse5`, `entities`, `@standard-schema/spec`) contribute **zero shipped bytes** to a default browser production bundle; `entities` is the sole SSR-conditional exposure and is gated accordingly.
- **Overall: AMBER** — not a blocker; it becomes GREEN the moment D-10 is refined to (B) shipped-runtime scope with the browser-client posture and individual-US-resident-origin clarifications, which is the recommended default. Final transitive sign-off for grid/charts/editor is revisited at M2.
