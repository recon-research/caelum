# Book 03 — Provenance & Licensing Discipline

> Volume I, Book 3. This is the book behind Caelum's two canonical hard rules — **no paid license** and **US-origin only, transitive tree included** (`brief §0`; `docs/ARCHITECTURE.md` D-05/D-10). Book 01 established *why* staying inside `@angular/*` sidesteps most of the problem (`Book 01 §2.3`); this book is the discipline for the cases it does not sidestep: every dependency you are tempted to add. The license taxonomy and the `npm ls`/lockfile mechanics are stable knowledge taught from settled fact; the one frontier input — that the core `@angular/*` stack is MIT + Google at the top level — is sourced in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md) and cited inline as *(platform note)*.

## 1. TL;DR

Caelum admits a dependency only if it clears **all** of a fixed gate: **(1)** its license is on a small **permissive allowlist** (MIT/BSD/Apache-2.0/ISC and close kin) — not merely "free," because copyleft contaminates the proprietary apps that embed Caelum; **(2)** its maintaining entity is **US-HQ'd** (D-10); **(3)** *every package in its runtime transitive tree* also clears (1) and (2) — the rule is on the **tree, not the package** (R5); **(4)** it is actually needed (you climbed the laziness ladder and Material/Aria/CDK/native couldn't do it); and **(5)** it enters only **behind a single adapter** (D-03). License is machine-checkable and belongs in CI; **origin is not fully automatable** and needs a human vetting pass recorded in an **admit/reject ledger** (`reference/PROVENANCE.md`). The trap this book exists to defeat is the *source-available* license — BSL, SSPL, Elastic, and PrimeTek's own **PrimeUI** license — which looks open, isn't, and is exactly what drove the team off PrimeNG in the first place (`brief §0`).

## 2. Conceptual Foundations

### 2.1 The two hard rules, and the third that's hiding inside them

The brief states two non-negotiable customer rules (`brief §0`):

1. **No paid license.** Rules out PrimeNG 22 Commercial ($599/dev perpetual + $399/dev/yr), Kendo UI, Syncfusion's paid tier, AG Grid Enterprise, Ignite UI, DevExtreme.
2. **US-origin only** — *extending to transitive dependencies, not just the top-level package.*

A third rule hides inside the first. "No paid" is necessary but not sufficient, because a library can be free-of-charge yet still impose obligations Caelum's consumers cannot accept. Caelum is **embedded into other teams' proprietary applications**; a copyleft dependency (GPL/AGPL) would reach through Caelum and impose its copyleft on the consuming app. So the operative admission rule is stricter than "free": **permissive-licensed only** (D-10 codifies this as *MIT/BSD/Apache-2.0*). The distinction "free vs permissive" is the single most important idea in this book — most license mistakes are made by people who checked "is it free?" and stopped.

### 2.2 The license taxonomy — admit, flag, reject

Every dependency's license falls into one of these buckets (identifiers are **SPDX** strings — the standard machine-readable license IDs that appear in `package.json`'s `license` field):

- **Permissive — ADMIT.** `MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `0BSD`, `Unlicense`, `BlueOak-1.0.0`, `CC0-1.0` (for data/assets). These permit use, modification, and redistribution inside a closed-source product with only attribution (and, for Apache-2.0, an explicit patent grant — a *plus*). This is the allowlist.
- **Weak copyleft — FLAG (default reject for a bundled frontend lib).** `MPL-2.0` (file-level copyleft), `LGPL-*` (the "linking exception" is murky once a JS bundler inlines the code — dynamic-vs-static linking doesn't map cleanly onto tree-shaken bundles). For a library that ships *into someone else's bundle*, treat these as reject-by-default; admit only with explicit compliance sign-off recorded in the ledger.
- **Strong copyleft — REJECT.** `GPL-2.0`, `GPL-3.0`, and especially `AGPL-3.0` (network copyleft — triggers even for SaaS that never "distributes"). These force the consuming proprietary app open. Hard block.
- **Source-available / non-OSI — REJECT (the trap).** `BUSL-1.1` (Business Source License), `SSPL-1.0`, `Elastic-2.0`, PolyForm, Confluent Community, and **PrimeTek's PrimeUI license** (compiled-package, license-key-verified; the free *Community* tier requires <$1M revenue **and** <5 devs **and** <10 employees **and** <$3M VC — a normal employer fails it). These read as "open source" in marketing and are not. **This bucket is why Caelum exists** (`brief §0`).
- **Proprietary / none — REJECT.** `UNLICENSED`, a missing `license` field, or "all rights reserved." No license means no grant — the default is *you may not use it*. A package with no resolvable license is a reject pending manual proof, never an "assume MIT."
- **Custom / dual / unknown — RESOLVE then decide.** A dual license like `(MIT OR Apache-2.0)` is admit (you may pick the MIT arm). `(MIT AND CC-BY-4.0)` means *both* apply — evaluate each. A bespoke license text is reject until a human reads it.

### 2.3 "Origin," and why the tree is the unit (R5)

D-10's working definition of **US-origin**: the *maintaining entity is HQ'd in the US* + permissive license + *no non-US dependency in the runtime transitive tree*. Two subtleties make this harder than the license check:

- **Origin is not in the metadata.** `package.json` has no machine field for "what country is the maintainer in." You infer it from the maintaining organization (the GitHub org, the sponsoring company, the funding). The brief's own reject list is a worked example — and a caution that each origin is a *hypothesis to confirm at vet time*, not a settled fact: PrimeNG (PrimeTek, Türkiye), NG-ZORRO (Alibaba, China), Taiga UI (Russia), AG Grid (UK), CKEditor (Poland), TipTap (Germany), TinyMCE (Australia), ProseMirror (NL), Plotly (Canada), Apache ECharts (Baidu/China). Versus the admit candidates: TanStack (US), visx (US/Airbnb), Lexical (US/Meta) — *also* to confirm (`brief §4`, D-07/08/09).
- **A US top-level package can pull a foreign transitive dependency** (R5). `your-grid@1.0.0` may be US and MIT and depend on `some-util@2` maintained in a sanctioned jurisdiction. The whole point of "transitive tree included" is that the package you `npm install` is the tip of an iceberg; the provenance obligation is on the iceberg. This is why §3.2's scan walks the *resolved tree*, not the `dependencies` block of one `package.json`.

A consequence worth stating plainly: **the cheapest way to pass this gate is to not add the dependency.** Book 01's reach-for ladder (`Book 01 §3.4`) and the project's "laziest sufficient code" rule are provenance tools — every gap solved with Material, an Angular Aria headless pattern, the CDK, or native HTML is a gap with *zero* new provenance surface.

## 3. Architecture & Design

### 3.1 The admit/reject gate (the decision procedure)

A candidate dependency runs this gate in order; **any** failure is a reject (or a park-pending-signoff):

1. **Necessity.** Climb the ladder (`Book 01 §3.4`): does the need already resolve to Material → Angular Aria headless → CDK → native HTML → a one-liner you write? Only a genuine gap (the three of `brief §4`: advanced data grid, charts, rich-text editor) proceeds.
2. **License.** SPDX identifier ∈ the §2.2 permissive allowlist. Copyleft / source-available / none → reject. *(Machine-checkable; §3.2.)*
3. **Origin.** Maintaining entity US-HQ'd (D-10). *(Human-verified; recorded in the ledger.)*
4. **Transitive.** Recurse (2) and (3) over the **entire runtime tree** (R5). One foreign or non-permissive node fails the candidate.
5. **Isolation.** Admitted only behind a single app-owned adapter (D-03), never imported by component or app code directly — so the provenance surface stays one file and the lib stays swappable if it fails a *future* re-vet (§3.4).

Outcomes: **admit** (record in the ledger with evidence) · **reject** (record *why* — a rejected lib re-proposed next quarter shouldn't be re-litigated from scratch) · **conditional** (e.g. admit as a **dev-only** dependency, or admit pending compliance's written origin sign-off). The decision and its evidence live in `reference/PROVENANCE.md`, not in someone's memory.

### 3.2 Auditing the transitive tree — `npm ls` + a license scan

The license half of the gate is mechanical. The toolchain:

- **Resolve the tree without executing it.** `npm install --package-lock-only` writes/updates `package-lock.json` from `package.json` *without* running install scripts — so you can inspect a candidate's full resolved tree before any `postinstall` code runs on your machine. (Vet first, install second — `brief §4`.)
- **Print the production tree.** `npm ls --all --omit=dev` shows the runtime dependency graph (the tree the origin rule governs); add `--json` for machine parsing. `--omit=dev` matters: the *runtime* tree is what ships into the consumer's bundle; dev-only tooling is a separate, lighter-touch surface (§3.3).
- **Scan licenses over that tree.** A license scanner (e.g. the `license-checker` family) reads each resolved package's `license` field and reports the distribution. The gate is: **every production package's license ∈ the allowlist; zero `UNKNOWN`/`UNLICENSED`.** An `UNKNOWN` is not a pass — it's an unread license, i.e. a reject until read.

The honest limit: **this automates license, not origin.** No scanner reliably reports maintainer country. Automation *narrows* the field (it rejects the easy failures and produces the exact package list); a human then confirms origin for each admitted top-level lib and spot-checks notable transitive nodes. Pretending origin is automatable is how a foreign transitive dep slips through (R5).

### 3.3 Runtime vs dev dependencies — two surfaces, two strictnesses

Not every dependency carries equal risk, and conflating them either over-blocks (rejecting a useful build tool) or under-blocks (waving through a runtime dep because "it's just a helper").

- **Runtime (`dependencies` / `peerDependencies`) — full gate.** These resolve into the consumer's shipped bundle and *run in their users' browsers*. License **and** origin apply, transitively. This is the surface D-10 governs.
- **Dev (`devDependencies`) — license gate, lighter origin touch.** Build/test tooling (the bundler, the test runner, linters) is not distributed to end users. License still matters (you redistribute nothing, but a copyleft *build tool* can still impose obligations on a derived work in edge cases, and the conservative default is simpler than reasoning about each) — so keep dev tooling permissive too. Origin is lower-stakes for non-distributed tooling, but record any notable foreign dev tool in the ledger rather than silently exempting it; "dev-only" is a *recorded* decision, not a blind spot.

The practical rule: **default to permissive everywhere; relax the origin strictness only for non-distributed dev tooling, and only on the record.**

### 3.4 Continuous enforcement — the gate is a CI check, not a one-time blessing

Provenance is not vetted once; it rots. A patch bump can introduce a new transitive dependency; a maintainer can relicense (the PrimeNG story is precisely a relicense). So the gate runs **continuously**:

- **Lockfile discipline.** Commit `package-lock.json`; vet the *resolved* tree, not the version *ranges*. A `^1.2.0` range can silently resolve to a newly-foreign sub-dependency on the next CI machine — the lockfile pins what was actually vetted.
- **CI gate.** The license scan runs in CI and **fails the build** on any non-allowlisted or unknown license in the production tree. This is the mechanical backstop behind the "Provenance purity" invariant (`docs/ARCHITECTURE.md` §2): a violation is a hard-block, not a soft-flag.
- **Re-vet on upgrade.** Any change to `package-lock.json` re-runs the scan; a human re-confirms origin when a *new top-level* lib or a *major* bump lands. Renovate/Dependabot PRs are gated by the same check.
- **Adapter isolation is the safety valve.** Because every third-party lib lives behind one adapter (D-03, enforced by ESLint `no-restricted-imports`), a lib that fails a *future* re-vet can be swapped at one seam instead of excised from a hundred call-sites (R6 — adapter erosion is the failure mode that destroys this property).

### 3.5 The admit/reject ledger (`reference/PROVENANCE.md`)

The durable output of all this is a **ledger**: one row per third-party library ever evaluated, recording the decision and the evidence behind it. It lives at `reference/PROVENANCE.md` and is the canonical "business/ops realities" doc (per LIBRARY_OUTLINE). A row carries: library · version evaluated · SPDX license · maintaining entity + country + the evidence link · transitive-scan result (date + clean/flagged) · decision (admit/reject/conditional) · the adapter it lives behind (if admitted) · re-vet due date. The ledger turns "we think this is fine" into "here is who checked, when, and against what" — which is exactly what a compliance reviewer (or a future you) needs, and what makes a *rejection* reusable instead of re-argued.

## 4. Implementation

Illustrative, not necessarily copy-paste; commands assume the `caelum` workspace root (`Book 01 §3.5`) and Node 22/24/26 (platform note).

**Vet a candidate's tree before installing it for real:**

```bash
# resolve the FULL tree into the lockfile WITHOUT running install scripts
npm install <candidate> --package-lock-only --save-exact

# inspect the runtime graph the origin rule governs
npm ls --all --omit=dev
npm ls --all --omit=dev --json > /tmp/prod-tree.json

# license distribution over the production tree (zero UNKNOWN/UNLICENSED is the gate)
npx license-checker-rseidelsohn --production --summary
```

**A minimal provenance scan (the CI gate's core), reading the committed lockfile:**

```python
# tools/provenance_scan.py — fail the build on any non-allowlisted production license.
# License is automatable; origin is NOT — this gate covers the mechanical half only.
import json, sys

ALLOW = {
    "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
    "0BSD", "Unlicense", "BlueOak-1.0.0", "CC0-1.0",
}

lock = json.load(open("package-lock.json"))
violations = []
for path, meta in lock.get("packages", {}).items():
    if not path or meta.get("dev"):          # root ("") and dev-only deps: out of the runtime gate
        continue
    lic = meta.get("license")                # may be a string, a dict, or absent
    if isinstance(lic, dict):
        lic = lic.get("type")
    name = path.split("node_modules/")[-1]
    if not lic:
        violations.append((name, "NO-LICENSE-FIELD (=all rights reserved)"))
    elif not _spdx_ok(lic, ALLOW):           # handle "(MIT OR Apache-2.0)" expressions
        violations.append((name, lic))

for name, lic in violations:
    print(f"REJECT  {name}  →  {lic}")
sys.exit(1 if violations else 0)             # non-zero fails CI, like the textbook audits
```

`_spdx_ok` accepts a bare allowlisted id, and an `OR` expression where *any* arm is allowlisted (you may choose that arm); an `AND` expression must have *every* arm allowlisted. A real implementation reuses an SPDX-expression parser rather than splitting strings by hand.

**Wire it into CI** as a required check alongside the textbook audits, so a relicensed or newly-foreign-licensed transitive dep turns the build red on the PR that introduces it:

```bash
python3 tools/provenance_scan.py        # exits non-zero on any non-allowlisted production license
```

Origin stays a human step: for every **admit**, record the maintaining entity + country + evidence in the ledger (§3.5); CI cannot prove "US-HQ'd," only "permissive."

## 5. Bleeding Edge

The mechanics above are stable; the *ecosystem tooling* around supply-chain provenance moves fast and its specifics must be verified before adoption (cite the `research/` layer, not this section):

- **SBOMs (`CycloneDX` / `SPDX` documents).** A machine-readable bill of materials for the whole tree; emerging as a compliance deliverable and a natural artifact to ship *with* the Caelum package (provenance attestation, D-06 / Book 19). Tooling and format versions evolve — survey via `research_topic` before pinning one.
- **npm build provenance / SLSA attestation** (`npm publish --provenance`) — cryptographic proof that a published package was built from a specific source commit in CI. This is about *publishing Caelum itself* honestly (Volume V) more than vetting inputs; confirm the current flag/behavior against npm docs before relying on it.
- **Supply-chain scanners** (Socket, Snyk, OpenSSF Scorecard) add behavioral signals (install scripts, network access, maintainer health) beyond license/origin. Useful as a *second* lens; none replaces the origin judgment, and each is a third-party tool whose own provenance and trust model you'd evaluate.

These are opportunities, not commitments — the load-bearing gate is §3.1, which needs none of them.

## 6. Gaps & Opportunities

- **Origin automation is genuinely unsolved.** There is no authoritative "maintainer country" feed; the human vetting step in §3.2 is irreducible today. A heuristic helper (org → country guesses from GitHub/funding metadata, flagged for confirmation) is a candidate tool, not a source of truth — treat its output as a worklist, never a verdict.
- **`peerDependencies` provenance is the consumer's tree, not ours.** Caelum peers on `@angular/*` (platform note) rather than bundling it; the consuming app resolves those. The ledger should be explicit about what Caelum *ships* vs what it *expects the host to provide* — the origin obligation on a peer dep is really discharged in the consumer's own audit.
- **The transitive scan is only as good as the lockfile's `license` fields.** Some packages misdeclare or omit the field even when the actual `LICENSE` file is permissive; an `UNKNOWN` may be a metadata bug, not a real reject — but it must be *manually resolved to a real license*, never assumed. This is tedious and real.
- **Re-vet cadence isn't yet a number.** §3.4 says "re-vet on upgrade"; a calendar cadence for libraries that *don't* change (a dormant dep can still have its maintainer relicense) is an open policy question to settle when the adapter libs land (M2).

## 7. AI & Claude Code Integration

- **High leverage:** writing and maintaining the provenance-scan script and its CI wiring; parsing `npm ls --json` / the lockfile and producing the violation report; drafting ledger rows from a candidate's metadata (license, repo org, funding) as a *worklist for human confirmation*; explaining a given SPDX expression's obligations.
- **~1× (bring judgment — stop and confirm):** the **origin verdict** is not the agent's to assert from training data — maintainer/company country is exactly the kind of fact that drifts and that the model will confidently guess wrong (the brief's reject list is *hypotheses to confirm*, not facts to recite). Surface the evidence and the recommendation; let the human (compliance) make the call and own the ledger sign-off. Likewise, never "assume MIT" for a missing license field, and never launder a source-available license as open because its README says "open source."

## 8. Exercises & Further Reading

**Exercises:**

1. Run `npm ls --all --omit=dev` on the bare `@angular/material` + `@angular/cdk` + `@angular/aria` install (platform note: all 22.0.2, MIT, Google). Confirm the production tree and scan its licenses — this is the EXP-transitive-provenance baseline seeded in the platform note.
2. Implement `provenance_scan.py` from §4; feed it a lockfile containing a deliberately-planted `GPL-3.0` and a missing-license package; confirm it exits non-zero and names both.
3. Classify each into admit/flag/reject with the §2.2 taxonomy: `MIT`, `(MIT OR Apache-2.0)`, `LGPL-3.0`, `BUSL-1.1`, `UNLICENSED`, a package with no `license` field, `(MIT AND CC-BY-4.0)`.
4. Draft the `reference/PROVENANCE.md` ledger row for TanStack Table as a *candidate* (D-07): license, maintaining entity + country (mark *unconfirmed*), the transitive-scan you'd run, and what evidence would flip it from candidate to admit.

**Further reading (external — verify currency before relying on specifics):**

- SPDX license list — https://spdx.org/licenses/
- `npm ls` — https://docs.npmjs.com/cli/commands/npm-ls
- npm package-lock — https://docs.npmjs.com/cli/configuring-npm/package-lock-json
- OSI-approved licenses (the line between open-source and source-available) — https://opensource.org/licenses
- npm provenance/attestation — https://docs.npmjs.com/generating-provenance-statements

**In-library:** `Book 01 §2.3` (staying inside `@angular/*` *is* the primary provenance decision) and `Book 01 §3.4` (the reach-for ladder as a provenance tool); `docs/ARCHITECTURE.md` D-05/D-10 and the Provenance-purity invariant (§2); the adapter discipline this gate feeds is Book 12 (The Adapter Pattern), and the three vetted-candidate libs are Books 13–15; shipping Caelum's *own* provenance attestation is Book 19 (Packaging & Distribution); the top-level stack provenance is sourced in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md).

---

*Conventions: admit only on the full gate (permissive license · US origin · clean transitive tree · genuine need · behind an adapter); free ≠ permissive, and source-available ≠ open; license is CI-mechanical, origin is human-and-on-the-record; the cheapest dependency is the one you don't add; version-specific stack claims are grounded in the `research/` layer.*
