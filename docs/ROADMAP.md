# ROADMAP — Caelum

The live plan. Milestone order follows the brief's phased build order (the gitignored `_intake/` migration brief §5; see [`_intake/README.md`](../_intake/README.md)), adapted to Caelum's scope: an **app-agnostic, public** component library (not an in-place app migration — `D-06`). Onboarding drafted it; every session updates the status of the slice it touched. The `CLAUDE.md` Status block is the 10-line summary of this file.

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
  - **Direct components:** ☑ batch 1 button/card/checkbox/input #5 (PR #30) · ☑ batch 2 radio/select/textarea/tabs/tooltip #26 · ☑ batch 3 menu/stepper/tree #27 (PR #42) · ☑ cae-switch #68 · ☑ cae-toggle-button + cae-select-button #73 · ☑ cae-accordion + cae-expansion-panel #77 · ☑ cae-chip #83 · ☑ cae-chip-set #84 (PR #203) · ☑ display primitives (progress-bar/spinner/divider) #88 · ☑ cae-slider #109 · ☑ cae-listbox #114 · ☑ cae-autocomplete #119 · ☑ cae-toolbar + cae-badge #126
  - **Form-control depth:** ☑ per-component secondary entry points #28 (PR #44) · ☑ validation-error forwarding (input/textarea) #29 (PR #49) · ☑ cae-select forwarding + radio/checkbox a11y hook #47 (PR #52) · ☑ shared `CaeFormFieldControlBase` #46 (PR #55) · ☑ non-form-field ariaLabel/ariaLabelledby naming seam (checkbox/switch) #70 (PR #132)
  - **cae-button a11y forwarding + stepper:** ☑ tooltip #36 (PR #59) · ☑ menu-trigger #57 (PR #64) · ☑ disabledInteractive #58 (PR #66) · ☑ cae-stepper linear stepping #40 (PR #62)
  - **Service passthrough (D-15):** ☑ cae-toast #96 (PR #98) · ☑ cae-dialog #100 (PR #103) · ☑ cae-confirm #101 (PR #106)
  - **Infra / hygiene:** ☑ Forge @defer bundle budget #85 (PR #94) · ☑ python→python3 #7 (PR #124) · ☑ doc compaction #123 (this PR)
  - *Next slice candidates + the live resume point: the `CLAUDE.md` Status block.*
- **Exit criterion:** a representative Forge screen renders on Material with theme parity; the provenance scan is green in CI; every rendered color/space comes from a token variable (no hardcoded values); preflight green.
- **Leverage:** high — scaffolding, install wiring, Direct 1:1 ports, lint rules.
- **Status:** ☑ **done** (2026-07-04) — exit criterion met (a Forge screen on Material with theme parity; provenance GREEN in CI; token-only styling; preflight green). The Direct-component parity family (~31 slices, indexed above) + the D-15 dialog/toast slice + the a11y seams #47/#70 are complete. At close: **310 tests** (272 lib + 38 forge). Foundation decisions D-01..D-15 (ARCHITECTURE Appendix A). Direct-component parity *extras* are `idea`-labelled follow-ups. Per-slice detail → the linked PRs + tracker.

### M1 — Composed components
- **Goal:** The common-case widgets that aren't drop-in but assemble from Material/CDK pieces.
- **Slices:** ☑ ConfirmDialog → delivered early as `cae-confirm` #101 (D-15) · ☑ Menubar `cae-menubar` #153 · ☑ MultiSelect `cae-multi-select` #135 (PR #136) · ☑ basic MatTable screen `cae-table` #141 (team's #1 dependence) · ☑ TabMenu `cae-tab-menu` #164 (PR #166) · ☑ ContextMenu `cae-context-menu` #157 · ☑ SplitButton `cae-split-button` #148. Per-component parity extras → follow-ups #137/#138/#139/#143/#144/#145/#149/#150/#155/#158/#165.
- **Exit criterion:** the common-case component set is implemented **and parity-verified** (functional + a11y + visual scenarios green per component).
- **Leverage:** high — composition over documented Material/CDK primitives.
- **Status:** ☑ **done** (2026-07-05) — exit criterion met: the common-case composed set is implemented + parity-verified (functional + a11y specs + a 4-lens adversarial review + a live Forge demo per component). At close: **375 tests** (332 lib + 43 forge). Deep real-browser / visual-regression hardening is scoped to M4. A Forge initial-bundle warn-budget raise (850→875 kB) rode in with #141 (`decision` #142, reversible, ratified). Per-slice detail → the linked PRs + tracker.

### M2 — Adapters for the three gaps
- **Goal:** Neutral interfaces + adapters for the three genuine gaps; each vetted candidate prototyped **in isolation** behind its adapter; provenance signed off (`D-07`/`D-08`/`D-09`).
- **Slices** — scoped to the **grid gap** by D-18 (#185; editor → #232, charts → #233): ☑ provenance sign-off + ratify D-07 #169 · ☑ neutral grid interface + `cae-data-grid` + vendor-free client default #170 (PR #180) · ☑ TanStack adapter behind the *identical* port + 5000-row Forge screen = exit criterion #171 (PR #183) · ☑ server/lazy engine (3rd engine, same port) #176 (PR #187) · ☑ consumer-owned loading/busy state #188 (PR #195) · ☑ pager focus-on-disable #189 (PR #197) · ☑ pager/sort disable-while-loading + busy slot #192 (PR #199). Grid public-API shape = D-17 (#168, ratified). Grid follow-ups #174/#175/#177/#178/#179/#190/#193/#194/#216/#228.
- **Exit criterion:** one real Forge screen per gap running on the chosen library, **behind the adapter only**, with provenance signed off and the ESLint isolation rule proving no leakage.
- **Leverage:** mixed — interface design + isolation is high; the provenance/legal sign-off is ~1× (the human + compliance).
- **Status:** ☑ **COMPLETE** — grid track complete (exit criterion met 2026-07-06); M2 scoped to the grid gap by **D-18** (#185, human-decided 2026-07-07) and the milestone advanced to M3. Editor (D-09 Lexical) → on-demand #232 (Cut #1); charts (D-14 D3-direct) → on-demand #233 (Cut #2). The isolation proof: the engine swaps by DI with `cae-data-grid` + specs unchanged, `@tanstack/table-core` fenced to the barrel-exempt `caelum/grid-tanstack` entry point (D-652, #652) and off the eager bundle. Per-slice detail → the linked PRs + tracker.

### M3 — Build-S/M long tail
- **Goal:** The individually-cheap custom widgets, ranked by general PrimeNG frequency (R7).
- **Slices** (★ = team-priority): ☑ ★ **media cluster** — carousel #273 · galleria #274 · image #275 · image-compare #293 (COMPLETE) · ☑ ★ **tree** — tree-select #279 · tree-table #262 · ☑ **input family** — input-number #301 · input-otp #303 · password #304 · input-mask #302 (COMPLETE) · ☑ **Splitter family** — splitter #323 · scroll-panel #328 (COMPLETE) · ☑ **drag-drop cluster** — order-list #336 · pick-list #337 · file-upload #338 (COMPLETE) · ☑ **breadcrumb** #332 · **M3-exit set** (ticketed 07-23, build order): ☑ display #662 (skeleton·avatar·timeline·tag) · ☑ rating #663 · ☑ popover+confirm-popup #664 · ☑ panel-menu #665 · ☑ datepicker #666 (full parity, #684+#687) · niche #667.
- **Exit criterion:** the long-tail parity surface is complete to the documented frequency cutoff; niche widgets (Knob, OrgChart, MegaMenu, Dock) built only on demand and explicitly listed if deferred.
- **Leverage:** high — small, well-scoped custom components on CDK.
- **Status:** ☑ **done** (2026-07-24) — exit criterion met: the long-tail parity surface is complete to the frequency cutoff — all ★ families (media, tree, input, Splitter, drag-drop) + breadcrumb + the M3-exit set #662–#666 shipped; the four niche widgets (Knob/OrgChart/MegaMenu/Dock) are explicitly deferred on-demand per **D-18**, all four mapped in `COMPARISON.md` as *Conditional Build* (#667 = the standing list). At close: **1671 tests**. Open parity-extras (#669/#675/#677/#680/#683/#686) + **D-595 routerLink** #333 ride into M4 / on-demand. Per-slice detail → the tracker.

### M4 — Parity hardening & adoption
- **Goal:** Make "looks done" = "is done", and make the library adoptable.
- **Slices:** ☑ **density parity (R4)** — *pulled forward*, shipped #411 (PR #415; runtime `[data-density]` compact arm, Material `density:-2` + `--cae-space-*` re-scale under one selector, target-size floor held; API shape = D-19, ratified #412) · ☐ theming polish (visual polish across density × scheme) · ◐ full a11y audit — **Layer 1 axe ☑** (#690 harness + #691 sweep, PR #695: 60 components axe-clean, 0 real violations); keyboard/SR + real-browser (grid virtual rows, tooltip panel, contrast) → #240 · ☐ visual-regression suite (light+dark, incl. density arms — #240) · ☐ capability ledger green · ☐ adoption / `p-*`→`cae-*` migration guide + usage-mapping doc
- **Exit criterion:** the parity checklist is green; the capability ledger shows every shipped component at `adversarial-passed`; the adoption guide is published.
- **Leverage:** mixed — automation/audit high; final parity judgment ~1×.
- **Status:** ◐ **active** (M3 exited 2026-07-24) — density parity (R4) shipped (#411); **a11y Layer 1 axe complete** (#690 + #691, PR #695: 60 components axe-clean, 0 real violations). **Hardening batch 07-24** (PRs #697–#701): #563/#419 splitter focus-ring tokens + stale jsdom comments · #642 receipt-alarm denominator (17/40→17/17) · #532 breadcrumb 2.4.8 nameless-current dev-warn · #669 tag colour-only dev-warn · #571 carousel focus re-sync. Remaining: theming polish · keyboard/SR + real-browser audit (#240) · visual-regression suite (#240) · capability ledger green · `p-*`→`cae-*` adoption/migration guide.

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
