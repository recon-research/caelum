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
- **Status:** ☑ **COMPLETE** — grid track complete (exit criterion met 2026-07-06); M2 scoped to the grid gap by **D-18** (#185, human-decided 2026-07-07) and the milestone advanced to M3. Editor (D-09 Lexical) → on-demand #232 (Cut #1); charts (D-14 D3-direct) → on-demand #233 (Cut #2). The isolation proof: the engine swaps by DI with `cae-data-grid` + specs unchanged, `@tanstack/table-core` fenced to the barrel-exempt `@recon-research/caelum/grid-tanstack` entry point (D-652, #652) and off the eager bundle. Per-slice detail → the linked PRs + tracker.

### M3 — Build-S/M long tail
- **Goal:** The individually-cheap custom widgets, ranked by general PrimeNG frequency (R7).
- **Slices** (★ = team-priority): ☑ ★ **media cluster** — carousel #273 · galleria #274 · image #275 · image-compare #293 (COMPLETE) · ☑ ★ **tree** — tree-select #279 · tree-table #262 · ☑ **input family** — input-number #301 · input-otp #303 · password #304 · input-mask #302 (COMPLETE) · ☑ **Splitter family** — splitter #323 · scroll-panel #328 (COMPLETE) · ☑ **drag-drop cluster** — order-list #336 · pick-list #337 · file-upload #338 (COMPLETE) · ☑ **breadcrumb** #332 · **M3-exit set** (ticketed 07-23, build order): ☑ display #662 (skeleton·avatar·timeline·tag) · ☑ rating #663 · ☑ popover+confirm-popup #664 · ☑ panel-menu #665 · ☑ datepicker #666 (full parity, #684+#687) · niche #667.
- **Exit criterion:** the long-tail parity surface is complete to the documented frequency cutoff; niche widgets (Knob, OrgChart, MegaMenu, Dock) built only on demand and explicitly listed if deferred.
- **Leverage:** high — small, well-scoped custom components on CDK.
- **Status:** ☑ **done** (2026-07-24) — exit met **as scoped**: all ★ families (media, tree, input, Splitter, drag-drop) + breadcrumb + the M3-exit set #662–#666 shipped. **Cutoff claim corrected 07-24 (#706):** exit was measured against that slice list, not the full `COMPARISON.md` row set, hiding 13 mapped-but-unbuilt `p-*` — now 3 ticketed gaps (#709 drawer · #710 alert · #711 panel/fieldset), 8 on-demand (#712, beside #667's D-18 four), 2 met by existing CDK / `mat-form-field` paths. COMPARISON now carries a **Status** column. At close: **1671 tests**. Parity-extras + **D-595 routerLink** #333 ride into M4.

### M4 — Parity hardening & adoption
- **Goal:** Make "looks done" = "is done", and make the library adoptable.
- **Slices:** ☑ **density parity (R4)** #411 (PR #415; D-19 ratified #412) · ☑ theming polish #734 (#425 contrast per D-744; #510 bridge; ☑ #413 = the density mixin, mixin-only (D-757)) · ◐ full a11y audit (Layer 1 scans the light+comfortable arm only — #811) — **Layer 1 axe ☑** #690+#691 (PR #695) + ☑ #785 (error state); keyboard/SR + real-browser → ☑ **harness** #240 (PR #719), ☑ **#405** retired 11/12 (D-771; #718, #724; #228 = standing manual pass), ☑ #759 accordion roving · ☑ **visual-regression** #732 (PRs #737/#742; 6 components x 4 arms, render pinned per #735) · ☑ capability ledger #733 + #773 + #809 · ☑ **`p-*`→`cae-*` migration guide** `docs/MIGRATION.md` #715
- **Exit criterion:** **(1)** the parity map is green — every `textbooks/reference/COMPARISON.md` row is ☑, ◐, or a ☐ naming its tracking issue, gated by `scripts/audit_comparison.py`; **(2)** the capability ledger shows every shipped component at `adversarial-passed` (bar a proven exemption); **(3)** the adoption guide is published. *(Clause 1 was reworded from an unfalsifiable "parity checklist" and mechanized in #808/#810 — it now grades the artifact #706 said to grade, so the milestone is measured, not re-litigated.)*
- **Leverage:** mixed — automation/audit high; final parity judgment ~1×.
- **Status:** ☑ **done** (2026-07-28) — exit met per clause: **1 ☑** (#808/#810 mechanized: 88 rows, 19 ☐ each ticketed, 0 untracked) · **2 ☑** ([ledger](CAPABILITY_LEDGER.md) **64/64** + 1 exempt, every quote verified against its commit) · **3 ☑** (#715). Clause 2 was the hard one: #809 made the ledger prove a review *happened*, revoking 3 self-signed rows; #825/#823/#824 each earned its sign-off back through an independent multi-lens review that found HIGHs in the *fixes* too. At close: **2021 tests**. Gaps carried forward, none gating: #811/#812/#813/#832/#836/#840/#841.
- **Retro (2026-07-28, milestone exit):** one systemic cause, two faces — **self-generated evidence is bounded by its author's hypothesis space** and looks green from inside. Three sign-offs were inline *self*-reviews (#809 proved a review happened, not that it was independent) → guard **#844**. Every author-written mutation table still let independent lenses find 13 HIGH, mostly in the *fixes* → guard **#845**, shipped into `adversarial_review`. Friction: backtick-in-`styles:` → **#846**. No metric alarm; 0 red main runs.

### M5 — Parity close & first release
- **Goal:** Close the parity gaps that were never a decision to defer, then make the library **installable** — the first thing in this project that a team outside the repo can actually use.
- **Slices** — two ordered tracks (**D-849**):
  - **Parity (5 slices):** ☑ `cae-drawer` #709 (PR #859, **D-826**; carry-overs #855–#858 closed, PR #939) · ☑ `cae-alert` #710 (PR #867 — owns its live region; #863–#865 closed, PR #946, **D-853**; #866 → #228) · ☑ `cae-panel`/`cae-fieldset` #711 (PR #872 — a `<legend>` names its group; #870/#871 closed, PR #953, **D-855**) · ☑ `cae-menu` submenus **#150** (PR #876; carry-overs #877/#878/#880/#881 closed, PR #964 — a dead-end row is a *disabled leaf*, cycles broken per node; #875/#880 open as `decision`) · ☑ `cae-autocomplete` **#120** (PR #889 — `[multiple]` + `[freeText]`, **D-549**). #150/#120 stay OPEN for their non-parity bullets.
  - **Release (3 slices, ordered):** ☑ #514 rename → `@recon-research/caelum` (PR #892 — **D-501**; ng-packagr keys FESM names off the package, so 69 size-budget keys moved with it and two gates that hardcoded the name now derive it) · ☑ #851 release engineering (PR #894 — `CHANGELOG.md` at `0.1.0`, the 0.x contract in the *packaged* readme + MIGRATION §2, `release.yml` tag-triggered `npm publish --provenance`, and `check-package-surface.mjs` for the installability class the path map hides; dry run green on main, 20/20 preflight stages real) · ☐ #852 publish `0.1.0` (**D-850**).
- **Exit criterion:** **(1)** `scripts/audit_comparison.py` shows the five rows above at ☑, leaving **14** `☐` rows, every one of them policy rather than debt — the two standing on-demand lists (#712 ×8, #667 ×3) and the two D-18 adapter cuts (#232 editor, #233 charts); **(2)** a clean Angular 22 app that has never seen this workspace runs `npm i @recon-research/caelum` and renders a **themed** component with **no `tsconfig` path mapping**.
- **Note — clause 2 splits across the trust boundary.** The agent verifies it against an `npm pack` tarball, which is the whole check *except* the registry round-trip; **`npm publish` itself is owner-run** (irreversible, outward-facing, and needs a token the agent must not hold). #852 carries both halves. Clause 2 is the one thing the workspace cannot check for itself: every in-repo consumer — Forge *and* caelum's own cross-entry-point specs — resolves through the path map, so a broken `exports` map or a mis-declared peer is invisible until someone installs the package.
- **Leverage:** mixed — the five components are high (well-scoped builds on documented Material/CDK primitives, and #709 is close to a Direct wrap); release engineering is high; the publish decision and the token are ~1× (the owner).
- **Status:** ◐ **in progress** (opened 2026-07-28, at `0454a3d`). **Parity CLOSED 5/5** at `ec6654d`; **clause (1) met** — `audit_comparison.py`: 88 mapped / **14** planned / 0 untracked. **#514** `72a348f` + **#851** `345a120` (`0.1.0`, gated). **#852 HELD by owner 2026-07-30**. Ledger **68/68**. #889 batch DONE. **#919** `0b59b3e` (deviation, **D-851**) · **#879** `2cf17b9` · **drawer #855–#858** `6227811` (PR #939 — modal label vs Material's container-wide focus machinery; RTL pinned; **`strictTemplates` ON**; #854 → **#938**). Order = **D-849**; `0.1.0` = **D-850**. Carried from M4: #811/#812/#813/#832/#836/#840/#841 + guards #844/#846.

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
