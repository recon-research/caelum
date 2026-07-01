# ROADMAP — Caelum

The live plan. Milestone order follows the brief's phased build order ([`_intake/` §5](../_intake/primeng-to-material-migration-brief.md)), adapted to Caelum's scope: an **app-agnostic, public** component library (not an in-place app migration — `D-06`). Onboarding drafted it; every session updates the status of the slice it touched. The `CLAUDE.md` Status block is the 10-line summary of this file.

**Status legend:** ☐ todo · ◐ in progress · ☑ done · ⊘ blocked · ✂ cut

> **Scope note (R7).** With no access to the consuming app we can't grep real `p-*` usage (brief §9.1) — but the team gave a usage signal directly (below). We build the full parity surface, ranked by that signal then by general PrimeNG frequency, and ship an adoption/usage-mapping guide so the team maps their own usage on adoption.
>
> **Team usage priority (2026-06-29, from the team via Connor):** highest dependence — **tables, forms, buttons, dynamic dialog, steppers, tree view, image carousel**. **Charts are not used now** (likely future). Build order is ranked by this; the **charts adapter (D-08) and editor adapter (D-09) are deprioritized** (see Cut order + D-08).

## Milestones

Each milestone has a **goal**, **slices**, a verifiable **exit criterion**, a **leverage** note, and **status**. Slices are tracked as [GitHub Issues](https://github.com/recon-research/caelum/issues) (the repo went live 2026-07-01; the M0 slices are issues #1–#8).

### M0 — Foundation & theming token bridge
- **Goal:** An Angular 22 workspace with the Caelum library + the **Forge** demo console, Material + CDK wired, the theming token bridge established, provenance/adapter ESLint guards in place, and the *Direct* form/button/panel/overlay/menu components ported.
- **Slices:** ☑ Angular 22 workspace (lib `caelum` + app `forge`) — #1, PR #16 (zoneless, ng-packagr lib + `@angular/build:application` app, Vitest, `cae` prefix) · ☑ Material + CDK + Angular Aria install + provenance scan — #2 (Material/CDK/Aria @ **22.0.3** lockstep; Forge `matButton` build smoke green; **license axis GREEN**, **origin GREEN for the browser client, provisional on #21** — D-10 shipped-runtime scope; full report `docs/provenance/M0-2-transitive-provenance-scan.md`) · ☐ theming token bridge (color/surface/spacing/radius/type/focus, light+dark) (#3) · ☐ ESLint `no-restricted-imports` + dependency-provenance CI gate + two size gates + US-origin attestation (#4) · ☐ Direct components batch 1, usage-ranked (#5) (Input/Select/Checkbox/Radio/Button/Card/Tabs/**Dialog**/**Stepper**/**Tree**/Tooltip/Menu/Snackbar)
- **Exit criterion:** a representative Forge screen renders on Material with theme parity; the provenance scan is green in CI; every rendered color/space comes from a token variable (no hardcoded values); preflight green.
- **Leverage:** high — scaffolding, install wiring, Direct 1:1 ports, lint rules.
- **Status:** ◐ in progress — the **library prerequisite is DONE.** The Caelum knowledge library (`build_library`, **20/20 books — COMPLETE, all five volumes** (Vol I Foundations Books 01–04; Vol II Building on Primitives Books 05–11; Vol III The Adapter Layer — COMPLETE — Book 12 *The Adapter Pattern* — D-03 — + Book 13 *Data Grid Adapter* — headless TanStack, D-07 — + Book 14 *Charts Adapter* — render-it-yourself D3 SVG, D-08; **visx is React-bound** → D3-direct refinement, filed `DEC-CHARTS-LIB` for M2 — + Book 15 *Rich-Text Editor Adapter* — Lexical behind `CaeEditorAdapter`, the editor as a form control, D-09; Lexical's core framework-agnostic — favorable mirror of visx — so **D-09 stands as-is**; Vol III grounded in `research/notes/{tanstack-table,visx-charts,lexical-editor}.md`); Vol IV The Quality Volume — COMPLETE — Book 16 *Accessibility & Parity Verification* (the capability ledger, the implementer-vs-adversarial split, axe + keyboard + screen reader; backs **M4**'s parity gate; grounded in `research/notes/a11y-testing-tooling.md` — axe-core is MPL-2.0, a dev/test tool only) + Book 17 *Testing Strategy & Tooling* (the test pyramid, **Vitest is the v22 default runner** with Karma legacy, the CDK `ComponentHarness` depth, Playwright + the golden discipline; backs `add_test` + M4's visual-regression suite; grounded in `research/notes/angular-22-testing.md`) + Book 18 *Performance & Bundle Budgets* (performance as a budgeted/gated dimension *profiled-not-guessed*; the **two size gates** — Forge-app `angular.json` budgets vs the shipped-library per-secondary-entry-point gate, the latter a **design task for M0-4**; tree-shaking via APF/`sideEffects`/secondary entry points; `@defer`; zoneless/OnPush CD proven with the profiler; backs **M4**'s bundle-size gate + `profile_subsystem`/`optimize_loop`; grounded in `research/notes/angular-22-performance.md`); Volume V (Distribution & Adoption) COMPLETE — Book 19 (*Packaging, Versioning & Distribution* — the **two orthogonal provenances** [npm/SLSA *build* provenance via Trusted Publishing vs the separately-shipped *US-origin* attestation], `@angular/build:ng-packagr` + the Angular Package Format + the `exports` map + secondary entry points, `@angular/*` peer deps + lockstep semver + `ng-update`; realizes D-06; the shipped-library size gate + the US-origin-attestation emitter are M0-4 tasks; grounded in `research/notes/angular-22-packaging.md`) + Book 20 (*Migration & Adoption* — the living PrimeNG→Caelum `p-*`→`cae-*` map in `reference/COMPARISON.md`, strangler-fig incremental adoption, the standalone `ng generate` codemods distinct from Book 19's `ng-update`, and the forward-only lint-ratchet fitness function generalizing Book 12 §3.3 against adapter erosion); see [`textbooks/LIBRARY_OUTLINE.md`](../textbooks/LIBRARY_OUTLINE.md). **The 20-book library is COMPLETE (five audits green — 21 books/348 sections, refs 660/0, routing 82/82, links 144/0, research 0/0). REPO-1 (public go-live) DONE 2026-07-01 — repo live at [github.com/recon-research/caelum](https://github.com/recon-research/caelum), 12 tracker issues filed (#1–#12), `CI_POSTURE=full`, `main` **protected** (require PR + `static gates`, include-admins, no force-push). **M0-1 workspace DONE** (#1 → PR #16): a zoneless Angular 22 workspace — library `caelum` (ng-packagr) + Forge app (`@angular/build:application`), Vitest, `cae` prefix; `ng build`/`ng test` green. **M0-2 DONE (#2):** Material + CDK + Angular Aria installed at **22.0.3** lockstep (plain `npm install`, no `ng add`); Forge `matButton` build smoke green; the first **transitive provenance scan** ran (D-05/D-10, 15 runtime packages, adversarially verified) — **license axis GREEN** (all permissive+free), **origin GREEN for the shipped browser client** (parse5/entities/@standard-schema flagged non-US but contribute zero shipped browser bytes), **provisional on #21** (D-10 shipped-runtime scoping refinement; report `docs/provenance/M0-2-transitive-provenance-scan.md`). Next: **#3** theming token bridge (or **#4** provenance CI gate + attestation, which will automate this scan).**

### M1 — Composed components
- **Goal:** The common-case widgets that aren't drop-in but assemble from Material/CDK pieces.
- **Slices:** ☐ ConfirmDialog wrapper · ☐ Menubar (`MatToolbar`+`MatMenu`) · ☐ MultiSelect w/ filter + chip summary · ☐ basic `MatTable` screens (sort/paginate/sticky/expandable) · ☐ TabMenu · ☐ ContextMenu (CDK Menu) · ☐ SplitButton
- **Exit criterion:** the common-case component set is implemented **and parity-verified** (functional + a11y + visual scenarios green per component).
- **Leverage:** high — composition over documented Material/CDK primitives.
- **Status:** ☐ not started.

### M2 — Adapters for the three gaps
- **Goal:** Neutral interfaces + adapters for the three genuine gaps; each vetted candidate prototyped **in isolation** behind its adapter; provenance signed off (`D-07`/`D-08`/`D-09`).
- **Slices:** ☐ neutral grid interface + grid adapter (TanStack candidate) · ☐ neutral chart interface + chart adapter (visx/D3 candidate) · ☐ neutral editor interface + editor adapter (Lexical candidate) · ☐ provenance sign-off record per lib (transitive tree + license)
- **Exit criterion:** one real Forge screen per gap running on the chosen library, **behind the adapter only**, with provenance signed off and the ESLint isolation rule proving no leakage.
- **Leverage:** mixed — interface design + isolation is high; the provenance/legal sign-off is ~1× (the human + compliance).
- **Status:** ☐ not started. Directions endorsed (D-07 TanStack grid, D-09 Lexical editor); final provenance sign-off lands here. **Charts adapter (D-08) deferred** — team not using charts yet (build when the need arrives).

### M3 — Build-S/M long tail
- **Goal:** The individually-cheap custom widgets, ranked by general PrimeNG frequency (R7).
- **Slices** (★ = team-priority, pulled forward): ☐ ★ **image Carousel / Galleria / Image-preview** (media — CDK drag/overlay) · ☐ ★ **TreeSelect / TreeTable** (tree view beyond Direct MatTree) · ☐ InputNumber + InputMask + Password-meter + InputOtp directives · ☐ Calendar time-of-day picker (R2) · ☐ Rating · ☐ Skeleton · ☐ FileUpload (CDK drag-drop + HttpClient) · ☐ Splitter · ☐ OverlayPanel/Popover + ConfirmPopup · ☐ Breadcrumb · ☐ PanelMenu · ☐ OrderList/PickList · ☐ Avatar/Timeline/Tag (+ niche on demand)
- **Exit criterion:** the long-tail parity surface is complete to the documented frequency cutoff; niche widgets (Knob, OrgChart, MegaMenu, Dock) built only on demand and explicitly listed if deferred.
- **Leverage:** high — small, well-scoped custom components on CDK.
- **Status:** ☐ not started.

### M4 — Parity hardening & adoption
- **Goal:** Make "looks done" = "is done", and make the library adoptable.
- **Slices:** ☐ theming polish + density parity · ☐ full a11y audit (axe + manual keyboard, every built component) · ☐ visual-regression suite (light+dark) · ☐ capability ledger green · ☐ adoption / `p-*`→`cae-*` migration guide + usage-mapping doc
- **Exit criterion:** the parity checklist is green; the capability ledger shows every shipped component at `adversarial-passed`; the adoption guide is published.
- **Leverage:** mixed — automation/audit high; final parity judgment ~1×.
- **Status:** ☐ not started.

## Open decisions

**Resolved this session (2026-06-29)** — recorded in [ARCHITECTURE.md](ARCHITECTURE.md) Appendix A:
- **Naming** — library **Caelum**, demo **Forge** (chosen).
- **D-10 — "US-origin" definition** — *maintaining entity HQ'd in the US + permissive license (MIT/BSD/Apache-2.0) + no non-US runtime transitive dep* (adopted; revisit if compliance tightens it).
- **D-07 / D-08 / D-09 — the three library directions** — **TanStack** (grid) / **visx** (charts) / **Lexical** (editor) endorsed.

Nothing currently blocks the build. Remaining (not blocking now):
- **Final transitive-provenance sign-off** for the endorsed grid/editor libs before pinning — at **M2** (D-07/D-09), per the D-10 rule.
- **Charts (D-08) deferred** — build when the team's chart need lands.

## Cut order

If time runs short, the order things get dropped (last-to-first) — decided in advance, not in a panic. **Never cut M0–M1** (foundation + common-case components — the bulk of any screen).

1. ✂ Rich-text editor adapter (M2) — heaviest gap, narrowest usage; defer to `contenteditable` stub or out-of-scope.
2. ✂ Charts adapter beyond a minimal set (M2) — ship a small visx chart set; defer exotic chart types.
3. ✂ Niche long-tail widgets (M3) — Knob, OrgChart, MegaMenu, Dock, Terminal — build only if a consumer needs them.
4. ✂ Visual-regression automation (M4) — fall back to manual snapshot review if the harness slips.
