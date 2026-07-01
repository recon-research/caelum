# PROJECT_BACKLOG.md — Pre-Repo Continuity Only (delete once the tracker exists)

> This file carries work items across sessions **only during the window before the GitHub repo exists** (intake → library building). **The moment `origin` is live, migrate every item here to tracker issues and delete this file** — `onboard` (Mode A) and `prepare_compaction` both enforce that. Two backlogs is a staleness machine; the tracker is the only durable one (truth order: git/CI > tracker > docs > chat).

## How this file is used

- Items land under **Next** when planned (`plan_work`'s Backlog step routes here while no `origin` exists), move to **Now** when started, and to **Done** when the `definition_of_done` gates pass (its tracker gate routes here pre-repo).
- The agent reads **Now** first at the start of a session to resume context.
- **Post-repo exception — `## Unfiled`:** if `gh` is briefly unreachable, `track_followups` parks items under an `## Unfiled` heading here (recreating this file if it was retired); `onboard` / `prepare_compaction` drain that section into real issues at the next checkpoint.

Item format:

```
- [ ] <short-id> — <description> — milestone M<n> — plan: <note/link> — gate: <not-started | in-progress | blocked: why | done YYYY-MM-DD>
```

## Now / In progress
- **(nothing actively in flight.)** `build_library` is **DONE** — the 20-book Caelum library is COMPLETE (LIB-1, in Done). The next actionable slice is **REPO-1** (Next), **blocked on an attended `gh` session** (git/gh unavailable this session). Pre-repo, this file remains the tracker until `origin` exists.

## Next
<!-- queued, planned-but-not-started; ordered roughly by dependency -->
- [ ] REPO-1 — `git init` + go-live as a **public** GitHub repo; create labels, set CI_POSTURE=full, protect `main` (require static gates + build&test + format&lint, include administrators) — milestone M0 — plan: onboard SKILL step 7 (attended `gh` step — gh unavailable this session) — gate: blocked: needs gh auth + the human
- [ ] CONV-1 — Run `configure_project` to finalize build/test/lint/run commands once the Angular 22 workspace is scaffolded (commands in PROJECT_CONVENTIONS are provisional until then) — milestone M0 — plan: after workspace slice — gate: not-started
- [ ] ENV-1 — This machine has `python3` but no `python`; the `textbooks/tools/_*.py` audits + `scripts/preflight.sh` + `ci.yml` invoke `python`. Add a `python`→`python3` shim or switch the scripts to `python3` when wiring preflight/CI — milestone M0 — plan: fold into CONV-1 / preflight wiring — gate: not-started (audits confirmed green via `python3` 2026-06-29)
- [ ] M0-1 — Angular 22 workspace: library `caelum` + demo app `forge` — milestone M0 — plan: ROADMAP M0 — gate: not-started
- [ ] M0-2 — Install Material + CDK + Angular Aria; provenance/transitive-dep scan green — milestone M0 — plan: zoneless-smoke + transitive-provenance + Aria-vs-CDK EXP seeds live in `research/notes/angular-22-platform.md` › Candidate experiments — gate: not-started
- [ ] M0-3 — Theming token bridge (color/surface/spacing/radius/type/focus, light+dark) — milestone M0 — gate: not-started
- [ ] M0-4 — ESLint `no-restricted-imports` (adapter isolation) + dependency-provenance CI gate (the gate must implement the **runtime-vs-dev split** — Book 03 §3.3: runtime deps permissive-only/US-origin, dev/test deps may be copyleft if unshipped; the worked example is **axe-core = MPL-2.0**, admissible as a dev tool — Book 16 §3.2, `research/notes/a11y-testing-tooling.md`). **Plus the two bundle-size gates (Book 18 §3.1/§3.2):** (a) `angular.json` **budgets** on the **Forge app** (error-fails-build), and (b) a **separate shipped-library size gate** — a per-secondary-entry-point size check on the `cae-*` dist (`source-map-explorer`/`size-limit`), since `angular.json` budgets do NOT measure `ng-packagr` output (a library is not an application, Book 01 §2.2). Gate (b) is a **bespoke CI step to design**, not a config toggle; `research/notes/angular-22-performance.md`. **Plus the shipped US-origin attestation (Book 19 §3.5/§4e, `research/notes/angular-22-packaging.md`):** an `emit-us-origin-attestation` build step + a machine-readable manifest schema (the transitive runtime-tree license/origin record) packaged INTO the `cae-*` tarball — a **Caelum-invented** artifact (no standard: SLSA/npm provenance attest *build* origin, not *tree* origin), **orthogonal to and shipped alongside** npm/SLSA build provenance (which the release workflow emits via Trusted Publishing); realizes the D-06 "provenance shipped in the package" promise — milestone M0 — gate: not-started
- [ ] M0-5 — Direct components batch 1 on one Forge screen — milestone M0 — gate: not-started
- [ ] LIB-DOCS — Fill the library's consult docs + reference set: `textbooks/CLAUDE.md` routing table, `AGENT_GUIDE.md` build loop + worked example, and the remaining `reference/` (domain TOOLING/PROVENANCE + the universal INDEX/GLOSSARY/ANTI_PATTERNS/DECISION_TREES/SYMPTOMS/PATTERNS/WORKFLOWS/STARTER_KIT) + `vision/` docs — still template placeholders (`build_library` steps 4–5, 7). **`reference/COMPARISON.md` is DONE** (the living PrimeNG→Caelum map, filled with Book 20, 2026-07-01). — milestone M0 — plan: now the 20 books exist, fill these before/with the M0 code scaffold — gate: in-progress (COMPARISON done; rest not-started)
- [ ] DEC-ZONELESS-INV — Formalize "zoneless-compatible: OnPush + signal-driven CD, no zone-coupled NgZone APIs" as an ARCHITECTURE invariant / `D-NN` when M0 component code starts (reversible, platform-forced; low risk) — milestone M0 — plan: Book 01 §3.2 + `research/notes/angular-22-platform.md` — gate: not-started
- [ ] DEC-ARIA-LADDER — Formalize the Material→Aria→CDK→bespoke reach-for ladder as a refinement of D-02 (Angular Aria ships 12 headless patterns in v22) — milestone M0/M1 — plan: Book 01 §3.4 + `research/notes/angular-22-platform.md` — gate: not-started
- [ ] DEC-CHARTS-LIB — Refine **D-08**: research (Book 14 grounding) found **visx is React-bound** (hard `react ^18||^19` peer on `@visx/shape`) — structurally unusable in an Angular library. The visx *approach* (render-it-yourself viz primitives over D3) is right, but the Angular instantiation must build on **D3's framework-agnostic modules directly** (`d3-scale`/`d3-shape`, ISC, Mike Bostock/US — visx's own D3 substrate). Confirm the library choice + walk the d3 transitive tree at the **M2** charts sign-off (reversible, low risk; charts deferred until the team's chart need lands). Grounded in `research/notes/visx-charts.md` — milestone M2 — plan: Book 14 + the note — gate: not-started

## Blocked
- (none) — both former blockers resolved 2026-06-29 (see Done: DEC-USORIGIN → D-10, DEC-CHARTS → D-08 deferred)

## Done
- [x] LIB-1 — `build_library`: the **20-book Caelum library is COMPLETE** (Books 01–20, all five volumes; + `reference/COMPARISON.md` the living PrimeNG→Caelum map). Vol V closed by **Book 20 — Migration & Adoption** (strangler-fig incremental adoption; the standalone `ng generate caelum:migrate-from-primeng` codemods, distinct from Book 19 §3.4's `ng-update`; the forward-only lint-ratchet fitness function generalizing Book 12 §3.3 against adapter erosion; R7 = the ROADMAP scope note, not a brief label — Caelum ships the usage-mapping guide). Built via multi-agent workflows (ultracode): 5-facet research fan-out → write → 4-lens adversarial review (2 MUST-FIX applied: the strangler-fig facade mis-mapping; the missing editor Adapter row in COMPARISON). **Five audits green 2026-07-01 — 21 books/348 sections, refs 660/0, routing 82/82, links 144/0, research 0/0.** — milestone M0 (prerequisite) — done 2026-07-01
- [x] DEC-USORIGIN — "US-origin" definition adopted as **D-10** (US-HQ entity + permissive license + no non-US runtime transitive dep) — done 2026-06-29
- [x] DEC-CHARTS — Chart heaviness resolved: not used now / future → **D-08 visx, deferred**; team usage priority captured in ROADMAP (tables/forms/dialog/stepper/tree/carousel up) — done 2026-06-29
- [x] ONB-1 — Approved the library outline + names: library **Caelum** / demo **Forge** (constellation theme); expanded **20-book / 5-volume** outline approved ("build all"); locked in `textbooks/LIBRARY_OUTLINE.md` — milestone M0 — done 2026-06-29
- [x] ONB-0 — Onboarding Mode A: read intake brief; set operating posture (public · full-blocking · review milestone+risky · 48h); drafted CLAUDE.md Status, ARCHITECTURE (D-01..D-09), ROADMAP (M0–M4); stamped TEMPLATE_VERSION; scripted Anvil→Caelum rename — milestone M0 — done 2026-06-29

---
*Keep this short. If it grows past roughly a screen, that's the signal to move to a real tracker. This is continuity, not project management.*
