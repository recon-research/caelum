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
- **Slices** — *done ✓; this is the index, full write-up in each linked issue/PR. The reusable recipe + gotchas behind them: [`docs/PATTERNS.md`](PATTERNS.md).*
  - **Foundation:** ☑ Angular 22 workspace #1 (PR #16) · ☑ Material+CDK+Aria install + provenance scan #2 · ☑ theming token bridge #3 · ☑ provenance/adapter/size gates + US-origin attestation #4 · ☑ configure_project CI matrix + required checks #6
  - **Direct components:** ☑ batch 1 button/card/checkbox/input #5 (PR #30) · ☑ batch 2 radio/select/textarea/tabs/tooltip #26 · ☑ batch 3 menu/stepper/tree #27 (PR #42) · ☑ cae-switch #68 (PR #69) · ☑ cae-toggle-button + cae-select-button #73 (PR #74) · ☑ cae-accordion + cae-expansion-panel #77 (PR #81) · ☑ cae-chip #83 (PR #86) · ☑ display primitives (progress-bar/spinner/divider) #88 (PR #89) · ☑ cae-slider #109 (PR #112) · ☑ cae-listbox #114 (PR #115) · ☑ cae-autocomplete #119 (PR #121) · ☑ cae-toolbar + cae-badge #126 (PR #130)
  - **Form-control depth:** ☑ per-component secondary entry points #28 (PR #44) · ☑ validation-error forwarding (input/textarea) #29 (PR #49) · ☑ cae-select forwarding + radio/checkbox a11y hook #47 (PR #52) · ☑ shared `CaeFormFieldControlBase` #46 (PR #55) · ☑ non-form-field ariaLabel/ariaLabelledby naming seam (checkbox/switch) #70 (PR #132)
  - **cae-button a11y forwarding + stepper:** ☑ tooltip #36 (PR #59) · ☑ menu-trigger #57 (PR #64) · ☑ disabledInteractive #58 (PR #66) · ☑ cae-stepper linear stepping #40 (PR #62)
  - **Service passthrough (D-15):** ☑ cae-toast #96 (PR #98) · ☑ cae-dialog #100 (PR #103) · ☑ cae-confirm #101 (PR #106)
  - **Infra / hygiene:** ☑ Forge @defer bundle budget #85 (PR #94) · ☑ python→python3 #7 (PR #124) · ☑ doc compaction #123 (this PR)
  - *Next slice candidates + the live resume point: the `CLAUDE.md` Status block.*
- **Exit criterion:** a representative Forge screen renders on Material with theme parity; the provenance scan is green in CI; every rendered color/space comes from a token variable (no hardcoded values); preflight green.
- **Leverage:** high — scaffolding, install wiring, Direct 1:1 ports, lint rules.
- **Status:** ☑ **done** (2026-07-04) — exit criterion met: a representative Forge screen renders on Material with theme parity, the provenance scan is GREEN in CI, every rendered colour/space comes from a token, and preflight is green. The **Direct-component parity family** is complete (~31 slices, indexed above); the D-15 dialog/toast slice landed; the non-form-field a11y seams (describedby #47, naming #70) are done. Metrics at M0 close: **310 tests** (272 lib + 38 forge), lib+Forge builds green, provenance GREEN, preflight PASS 0-skipped. Remaining Direct-component *parity extras* are `idea`-labelled follow-ups (not M0-blocking — they trickle in opportunistically or fold into M3). Foundation decisions are `D-01..D-15` (ARCHITECTURE Appendix A).

### M1 — Composed components
- **Goal:** The common-case widgets that aren't drop-in but assemble from Material/CDK pieces.
- **Slices:** ☑ ConfirmDialog wrapper — delivered early as `cae-confirm` #101 (D-15) · ☑ **Menubar** — `cae-menubar` #153 (horizontal application menu bar over `MatToolbar` + `cae-menu`; one-level dropdowns, CDK `FocusKeyManager` roving + Down/Up-opens; submenus/rich items/responsive/RTL/disabled-interactive are follow-ups #155) · ☑ **MultiSelect** w/ filter + chip summary — `cae-multi-select` #135 (PR #136; in-panel filter opt-in/off in v1 pending accessible impl #138) · ☑ **basic `MatTable` screen** — `cae-table` #141 (declarative columns/data config over MatTable + MatSort + MatPaginator, client-side sort + pagination; custom cell templates / sticky / expandable / selection are follow-ups; team's #1 dependence) · ☐ TabMenu · ☐ ContextMenu (CDK Menu) · ☑ **SplitButton** — `cae-split-button` #148 (primary command + secondary-action dropdown, composed over `MatButton` + `cae-menu`; owns its `<button>`s so `type="button"` is explicit; icon/per-half-appearance/`(dropdownClick)` #149, rich dropdown items #150 are follow-ups)
- **Exit criterion:** the common-case component set is implemented **and parity-verified** (functional + a11y + visual scenarios green per component).
- **Leverage:** high — composition over documented Material/CDK primitives.
- **Status:** ◐ **in progress** — opened 2026-07-04 with `cae-multi-select` #135 (PR #136); `cae-table` #141 (the team's #1 dependence) landed next; ConfirmDialog wrapper already delivered as `cae-confirm` #101 (D-15). A provisional Forge initial-bundle warn-budget raise (850→875 kB) rode in with #141 — `decision` #142 (reversible; shipped-lib size discipline untouched). `cae-split-button` #148 (SplitButton) landed next — composed-over-composed (its "New member" demo drives the members `cae-table`), shipped as its own lazy chunk with no new eager weight, so #142's budget is untouched (Forge initial ~843 kB). `cae-menubar` #153 (Menubar) followed — the flagship composed widget (MatToolbar shell + one embedded `cae-menu` per group, bar roving via CDK `FocusKeyManager`); its deferred "command bar" demo drives a live log, own ~3 kB lazy chunk, Forge initial ~857 kB < 875 (#142 still untouched); 4-lens review fixed a Down/Up-opens a11y defect + a public-API leak (follow-ups #155). Remaining canonical M1: **TabMenu** (`mat-tab-nav-bar`), **ContextMenu** (CDK Menu). Next-slice candidates + the resume point live in the `CLAUDE.md` Status block.

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
- **D-10 — "US-origin" definition** — *maintaining entity HQ'd in the US + permissive license (MIT/BSD/Apache-2.0) + no non-US runtime transitive dep* (adopted; **refined by D-11**).
- **D-07 / D-08 / D-09 — the three library directions** — **TanStack** (grid) / **visx** (charts) / **Lexical** (editor) endorsed. *(D-08's visx choice later superseded by **D-14** → D3-direct; see below.)*

**Resolved 2026-07-01** (recorded in Appendix A):
- **D-11 — refinement of D-10** (from #21, the M0-2 provenance scan) — origin gate is scoped to **shipped-runtime reachability** (not the full installed tree), with a **US-preferred / allied-nation (UK, Germany, …) fallback** when a need can't be met US-origin or self-built; **Angular's own transitive closure is accepted wholesale**; the license rule (permissive + free) is unchanged. Sign-off for D-07/D-09 grid/editor libs at M2 now runs against D-11.

**Resolved 2026-07-02** (recorded in Appendix A — all four ratified by the human on the recommended default; #9/#10/#11/#39 closed):
- **D-12 — zoneless-compatible invariant** (#9) — `OnPush` + signal-driven CD, no zone-coupled `NgZone`/`zone.js`; now a §2 invariant (every `cae-*` already complied — this pins existing practice as a commitment).
- **D-13 — Material → Aria → CDK → bespoke reach-for ladder** (#10) — refines D-02 into an ordered per-component preference.
- **D-14 — charts → D3-direct** (#11) — supersedes D-08's visx choice (visx is React-bound); build on framework-agnostic `d3-scale`/`d3-shape`; confirm modules + walk the transitive tree at the M2 charts sign-off.
- **D-15 — cae-dialog / cae-toast = service passthrough** (#39) — injectable `CaeDialog` / `CaeToast` over `MatDialog` / `MatSnackBar` (named `cae-toast` per the COMPARISON map); **unblocks the dialog/toast slice** (the last blocked slice — now buildable when scheduled).

Nothing currently blocks the build. Remaining (not blocking now):
- **Final transitive-provenance sign-off** for the endorsed grid/editor libs before pinning — at **M2** (D-07/D-09), per the D-11 rule.
- **Charts deferred** — build when the team's chart need lands; foundation is now **D3-direct (D-14)**, not visx.

## Cut order

If time runs short, the order things get dropped (last-to-first) — decided in advance, not in a panic. **Never cut M0–M1** (foundation + common-case components — the bulk of any screen).

1. ✂ Rich-text editor adapter (M2) — heaviest gap, narrowest usage; defer to `contenteditable` stub or out-of-scope.
2. ✂ Charts adapter beyond a minimal set (M2) — ship a small D3-direct chart set (D-14); defer exotic chart types.
3. ✂ Niche long-tail widgets (M3) — Knob, OrgChart, MegaMenu, Dock, Terminal — build only if a consumer needs them.
4. ✂ Visual-regression automation (M4) — fall back to manual snapshot review if the harness slips.
