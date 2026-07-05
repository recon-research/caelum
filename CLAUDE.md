# CLAUDE.md — Caelum

Caelum is an open-source, **US-origin-clean** Angular 22 component library — Angular Material + CDK with PrimeNG-level breadth, density, and parity — that teams leaving PrimeNG can adopt component-by-component the way they used PrimeNG. Built and tested almost entirely by Claude Code, on autopilot, with the human deferring on architecture and ambition calls. The library's canonical example throughout the docs is **Forge**, a demo admin console.

## Status — *the onboarding & compaction anchor; keep it current*

> The 10-line summary of "where are we" (ownership table below). Detail lives in [`docs/ROADMAP.md`](docs/ROADMAP.md) and the issue tracker — never here.

**As of:** 2026-07-04 · main @ `5dfd741` · **repo LIVE + protected** — [github.com/recon-research/caelum](https://github.com/recon-research/caelum) · **Phase:** 0 → 1 · **Milestone:** **M0 ☑** — Direct-component parity family complete (exit criterion met: a representative Forge screen renders on Material, provenance GREEN in CI, token-only theming, preflight green) → **M1 ◐ Composed components** (opened; first slice `cae-multi-select` #135 merged). **CI:** `full` + blocking, main green (required checks: `static gates` + `heavy matrix gate`). Full slice index → [`docs/ROADMAP.md`](docs/ROADMAP.md); the reusable Direct-component recipe + gotchas → [`docs/PATTERNS.md`](docs/PATTERNS.md).

**Done — M1 Composed** (latest first): **cae-multi-select #135** (PR #136 — `string[]` CVA over `MatSelect[multiple]` + chip-summary trigger + opt-in in-panel filter; **generalized `CaeFormFieldControlBase` to `<T = string>`** via an `emptyValue()` override, string controls source-unchanged; 4-lens review defaulted `filterable` off pending accessible filter #138).

**Done — M0 Direct-component family** (full write-up in each issue/PR): cae-checkbox/switch naming seam #70 · cae-toolbar/badge #126 · cae-autocomplete #119 · cae-listbox #114 · cae-slider #109 · **D-15 dialog/toast** (cae-confirm #101 · cae-dialog #100 · cae-toast #96) · Forge @defer budget #85 · display primitives #88 · cae-chip #83 · accordion #77 · toggle/select-button #73 · cae-switch #68 · cae-button a11y forwarding (#36/#57/#58) · stepper linear #40 · `CaeFormFieldControlBase` #46 · validation-error forwarding #29/#47 · secondary entry points #28 · Direct batches 1–3 #5/#26/#27 · foundation #1–#6. Housekeeping: #7, #123.

**Next:** continue **M1 Composed** — candidates: **#84** cae-chip-set (managed removable-chip list, roving keyboard), **basic MatTable screens** (sort/paginate/sticky/expandable — team's #1 dependence), **Menubar** (MatToolbar+MatMenu), **ContextMenu** (CDK Menu), **SplitButton**, **TabMenu**; plus cae-multi-select follow-ups (#137 removable trigger chips, **#138** make the filter keyboard/SR-accessible → flip `filterable` default on, #139 parity extras). **#97** (split Forge's monolithic app.scss) must land before the next EAGER styled Forge demo (recent demos are `@defer`'d with lean styles, so the 8 kB anyComponentStyle error hasn't tripped).

**Decisions:** all resolved → `D-01..D-15` (ARCHITECTURE Appendix A); **no open `decision` issues**. Open followups/debt/ideas: **33 open** — `gh issue list` (incl. #84/#97/#137/#138/#139 + the M4 real-browser verify family #41/#79/#91/#107/#110/#128 + #8/#12/#15/#33/#48/#51/#54/#61/#72/#75/#78/#80/#90/#102/#105/#111/#116/#117/#120/#127/#129/#133).

**Resume:** `main` @ `5dfd741` · next = pick the next **M1 Composed** slice (candidates in **Next**); docs current, truth = tracker. **Flow** (details: [`PROJECT_CONVENTIONS.md`](PROJECT_CONVENTIONS.md) › Merge policy / Tracker): ticket-first → `slice/<n>-<slug>` branch → PR → green CI → merge → merge-time checkpoint; every public-API/a11y slice gets a **4-lens ultracode adversarial review** before merge. **Verify:** `PATH="$HOME/nodejs/bin:$PATH" npm ci && npm run build:lib && npx ng build forge && CI=true npx ng test caelum && CI=true npx ng test` (**310 pass — 272 lib + 38 forge**; `ng test` alone runs Forge only → also run `ng test caelum`) · `python3 scripts/check_provenance.py` (GREEN) · `bash scripts/preflight.sh` (PASS 0-skipped).

## Read these first (in order)

1. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the shape, the invariants, and the decision log (`D-01..`, Appendix A).
2. [docs/ROADMAP.md](docs/ROADMAP.md) — milestones `M0..`, each with goal / exit-criterion / status; the live plan.
3. [PROJECT_CONVENTIONS.md](PROJECT_CONVENTIONS.md) — paths, commands, stack, tracker conventions. **Every skill reads this.**
4. [textbooks/AGENT_GUIDE.md](textbooks/AGENT_GUIDE.md) — the build loop for turning the library into shipped work.

## Source of truth — docs are caches

Truth order: **git/CI &gt; issue tracker &gt; docs &gt; chat memory.** On any mismatch, fix the doc to match reality *before* working — cheap now, poisonous later. **Single-home each fact** — policy here, project mechanics/config in `PROJECT_CONVENTIONS.md`, procedure in the owning skill, operating reference in `docs/`; every other mention is a one-line cross-link, never a second copy (a fact written twice drifts — `README.md` › the single-home rule). Carve-out: **ARCHITECTURE invariants / `D-NN` rows are commitments, not caches** — code contradicting one is a defect or a supersede-candidate (file `bug` or `decision`; never edit the log to match drift). *(The pre-repo carve-out — `PROJECT_BACKLOG.md` as the interim tracker — was retired at go-live 2026-07-01; the tracker is now GitHub Issues.)* Ownership (who updates what, when):

| Artifact | When it's written |
|---|---|
| **Status block** (above) | one line at **every merge** (the merge-time checkpoint); fully at `prepare_compaction`; verified by `onboard` |
| **docs/ROADMAP.md** | the moment a slice/milestone changes state |
| **docs/ARCHITECTURE.md** | only when a `D-NN` decision lands |
| **Issue tracker** | continuously — **defer = file now**, never "I'll note it later" |

## The reference library — use it

[`textbooks/`](textbooks/) is this project's RAG knowledge library (built per-domain; see [textbooks/LIBRARY_SEED.md](textbooks/LIBRARY_SEED.md)). When planning or implementing:

- Route topics via [`textbooks/MANIFEST.json`](textbooks/MANIFEST.json) (`topic_to_books`, `rag_hints`); follow the loop in [`textbooks/AGENT_GUIDE.md`](textbooks/AGENT_GUIDE.md).
- **Verify every `Book NN §X` citation against [`textbooks/SECTIONS.json`](textbooks/SECTIONS.json) before asserting it** — grep it, don't load it whole. The library is audited; don't invent sections.
- Pre-mortem with `textbooks/reference/ANTI_PATTERNS.md` + `SYMPTOMS.md`; resolve architectural forks with `DECISION_TREES.md`.
- **Frontier topics** live in [`research/`](research/) — survey notes (every claim a **real fetched URL + accessed date + tier**), pre-registered experiments (`EXP-NN`), and paper-style reports (`RR-NN`) that ground `D-NN` decisions like book sections do. **Cite as `research/notes/<file>.md` / `RR-NN`, never as a `Book §`** — different trust models; notes stale ~2 quarters. Discipline + audit: [research/README.md](research/README.md).

## How we work — the daily loop

This project runs on autopilot. Day-to-day, the human's input is mostly three moves:

### 1. "Welcome back, let's onboard and continue" → run [`onboard`](.claude/skills/onboard/SKILL.md)
Preflight → anchors → reconcile docs vs tracker → **read the decision answers** (issue comments) + digest → resume the [build loop](textbooks/AGENT_GUIDE.md). The skill owns the detail, including the edge cases (dirty tree, red main, dead `gh`).

### 2. "Let's prepare for compaction" → run [`prepare_compaction`](.claude/skills/prepare_compaction/SKILL.md)
Rewrite + stamp Status → **verify its claims against the tracker** → update ROADMAP/ARCHITECTURE → sweep deferrals into tickets → clean tree, pushed via the checkpoint path → emit a ready-to-paste `/compact` command. If merge-time checkpointing happened all along, this is verification, not archaeology. **The agent raises this proactively** — at a clean checkpoint (just merged, tree pushed, no in-flight slice) after a heavy session, it recommends compacting rather than letting the window force an unfocused auto-compaction, **and carries the ready-to-paste `/compact` command in that same recommendation** (not a bare "want me to prepare it?"); the skill owns the timing signals.

### 3. A decision is needed → surface a fork; don't guess, don't stall
Architecture and scope are ~1× leverage (the human's judgment). When a real fork appears:
- **File it as an issue labeled `decision`** (template provided): 2–4 options, each with its trade-off and the `Book NN §X` / `DECISION_TREES Dn` behind it, **recommended default first** (per the policy below).
- **Reversible fork?** Proceed **provisionally** on the recommended default and keep working — the issue states the objection window; every PR built on the default carries `Provisional on #NN`. The human overrules asynchronously by commenting; **silence past the window ratifies the default**.
- **Hard to reverse** (public API shape, data schema/migration, external commitments, money)? Don't guess: park the slice, pick the **next independent slice** from the tracker. **Nothing independent left?** Strengthen the blocked decision instead — `research_topic` the fork, spike on a throwaway branch (never merged) — then checkpoint and end the session cleanly. Don't invent roadmap scope to stay busy.
- Once the human decides (a comment on the issue *is* the decision): record it as `D-NN` in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) Appendix A, reflect it in the ROADMAP, close the issue.

Other messages happen, but these three are the spine. Default to continuing the roadmap autonomously between them.

## Definition of done

Nothing is "done" until [`definition_of_done`](.claude/skills/definition_of_done/SKILL.md) passes its gates **with evidence** (output, not assertion): **build · tests · a11y parity (axe + keyboard) · token-only theming (no hardcoded design values) · adapter isolation (no 3p import outside its adapter) · provenance scan (US-origin + free, transitive tree) · liveness (it demonstrably does something end-to-end — inert hard-blocks, ambiguous soft-flags) · anti-patterns avoided · determinism (where required) · performance (profiled, not guessed) · milestone exit-criterion · backlog updated · no unticketed deferrals.** Skills live in [`.claude/skills/`](.claude/skills/).

## Working style — the policy the executing agent runs on

- **Ambitious destination, staged route.** Default to the most complete end-state, delivered through small, independently verifiable slices that each build *into* it. Prefer an easier-to-test intermediate **when it's a stepping stone, never as a scope cut**: a cheaper *first step* toward the same end-state is the default; a cheaper *final scope* requires an explicit `D-NN` decision. A slice is **coherent, not fragmented** — bundle tightly-coupled edits and the doc/ROADMAP updates they imply into one PR rather than splitting a single change across trivial PRs (`PROJECT_CONVENTIONS.md` › Right-sized slices).
- **Laziest sufficient code.** Ambition is about the *outcome*, not the line count — within a slice, write the least code that fully does the job. Before adding, climb the ladder and stop at the first rung that holds: does it need to exist at all (YAGNI), is it already in the codebase, the standard library, a native platform feature, an existing dependency, or a one-liner — only then write a minimal implementation. The best code is the code you never wrote. **Never** simplify away the non-negotiables, though: validation at trust boundaries, error / data-loss handling, security, accessibility, determinism where required, or anything the human explicitly asked for. And laziness *without first understanding the code it touches* is the dangerous kind — it ships a confident wrong fix. (`adversarial_review` carries the matching over-engineering lens; inspiration: the ponytail project.)
- **Ticket-first.** No slice without an issue; the branch and PR reference it. A TODO entering code must carry a ticket — `TODO(#NN)` — a naked TODO is a defect (gated by CI and `definition_of_done`).
- **Defer = file now.** The moment work is deferred or an idea worth keeping appears, file the issue (`track_followups`) — then continue. Promises in chat don't survive compaction; tickets do.
- **Checkpoint at every merge.** Update the Status line + ROADMAP state in the same breath as the merge. Compaction can then strike at any time and lose at most the in-flight slice.
- **One writing session per repo.** Concurrent sessions race on the Status line, ROADMAP state, and D-NN numbering. A second simultaneous session works read-only or in its own `git worktree` + branch — never two writers on one checkout.
- **Token discipline.** Grep the big indexes (`SECTIONS.json`) — never load them whole; `MANIFEST.json` is small by design: load it once, keep it resident. Read narrowly; delegate broad reads to read-only subagents and keep conclusions, not file dumps (cheap/fast models for mechanical sweeps, the strongest for adversarial lenses). Detail lives in skills (lazy-loaded), not in this file.
- **Follow the written system.** These docs and skills encode the judgment; prefer them over improvisation, and verify with evidence — never claim green without output. Don't re-litigate settled `D-NN` decisions. Never force-push or admin-merge — the gates exist to gate (`PROJECT_CONVENTIONS.md` › Merge policy).
- **Keep the library honest.** If you extend `textbooks/`, regenerate `SECTIONS.json` and run the audits (they exit non-zero; CI enforces them).
