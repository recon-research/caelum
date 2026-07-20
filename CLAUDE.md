# CLAUDE.md — Caelum

Caelum is an open-source, **US-origin-clean** Angular 22 component library — Angular Material + CDK with PrimeNG-level breadth, density, and parity — that teams leaving PrimeNG can adopt component-by-component the way they used PrimeNG. Built and tested almost entirely by Claude Code, on autopilot, with the human deferring on architecture and ambition calls. The library's canonical example throughout the docs is **Forge**, a demo admin console.

## Status — *the onboarding & compaction anchor; keep it current*

> ~10 lines of "where are we". Per-slice detail lives in the merged PRs, [`docs/ROADMAP.md`](docs/ROADMAP.md), and the issue tracker — never here.

**As of:** 2026-07-19 · main @ `b67e027` · CI green · **repo LIVE + protected** ([github.com/recon-research/caelum](https://github.com/recon-research/caelum)) · **Phase 2** · **M0 ☑ · M1 ☑ · M2 ☑** (grid gap; editor #232 / charts #233 → on-demand per D-18) · **M3 ◐ Build-S/M long tail** (+ early-theme density pulled forward from M4) · template @ pyxis `79fdfbe`. Full slice index + per-slice detail → [`docs/ROADMAP.md`](docs/ROADMAP.md); recipe + gotchas → [`docs/PATTERNS.md`](docs/PATTERNS.md).

**Where we are:** M3 active — the ★ families are COMPLETE (media, tree, input, Splitter, drag-drop) and breadcrumb #332 shipped; **standing menu** (parity-extras/debt) is the lane, with **early-theme density pulled forward from M4**. Recently landed: **size gate now minifies before gzip #603** (PR #621 — prose cost more than code (+167 B vs +153 B); now +0 vs +129 B, 55 rows re-baselined, #586 part 1 absorbed); **chip-set sibling-grab focus steal #556** (PR #619 — filed #617/#618); **commit-msg semantics guard #591** (PR #615 — #583 length half → decision #614). **1440 tests** (1371 caelum + 69 forge); gates GREEN. Detail → the PRs + [`docs/ROADMAP.md`](docs/ROADMAP.md).

**Next:** continue the **standing menu** or start the next M3 component. Candidates: tree-select leaf-only #282 (checkbox×propagation pass) / scale #283, chip-set #201 text-entry+listbox / #448 concurrent-async (departure-diff), carousel #276 loop / #559 / #571 / #574, splitter px #418 (⚠ px-unit API decision — file when picked), image-compare #422, input-family #305/#312/#315, tree-table #264–#270, galleria lightbox zoom #289 (dep #275), splitter slop #544/#545, chip-set residuals #550 (browser half) / #552/#553, test-infra #240 (M4).

**Open decisions:** **#595** router peerDep (blocks breadcrumb #333 / tab-menu #165 `routerLink`) — recommended **A** optional peerDep + secondary entry point; **#596** per-item icon-supply convention (#333/#165/#150/#149) — recommended **A+B** built-in glyph then template. Both **hard-to-reverse ⇒ parked, not provisional**. **#549** chip-set text-entry (rec. **A**, PR #554 provisional); **#526** tree per-node state (rec. **on-node**, PR #528 provisional); **#614** commit-subject length — rec. **A retire the `≤72` fiction** (broken by 274/334; NOT provisional). All carry a **7-day window**. Prior: **D-428/D-501**. **~126 open issues** = deferral log, not a burndown.

**Resume:** `main` @ `b67e027`, tree clean, CI green · last shipped: size gate minify #603 (PR #621) · **no in-flight slice** · **next = standing menu, pick ONE:** chip-set #553, splitter slop #544/#545 (⚠ jsdom-invisible — weigh M4), stepper key-manager #611 (⚠ privates or upstream), order-list/pick-list shared core #586 part 2 · #559/#574 **M4-gated** (jsdom can't model `inert` blur or SR output) · ⚠ decision-blocked: breadcrumb #333 **fully parked** (#595/#596), tree-select #282/#283 (#526), chip-set listbox (#549), splitter px #418 · verify: `bash scripts/preflight.sh` **with node on PATH** (nvm bin; else format/build/test/lint silently skip & falsely PASS — #538).

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
| **README.md** (public front door) | at every **milestone exit** (status line, milestone glyphs, components table); its status prose is a scale-floor + ROADMAP pointer by design, so it can't rot between milestones (#492 — it fossilized at go-live once) |
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
- **Concurrent sessions run the protocol.** One writer per checkout, always. Multiple writers per *repo* are supported **iff** each claims before working and stays in its lane (builder + reviewer is the recommended pair) — an unprotocoled second writer races on the Status line, ROADMAP state, and D-NN numbering and duplicates whole slices of effort. Identity, claiming, detection, lanes: `PROJECT_CONVENTIONS.md` › Concurrent writers.
- **Token discipline.** Grep the big indexes (`SECTIONS.json`) — never load them whole; `MANIFEST.json` is small by design: load it once, keep it resident. Read narrowly; delegate broad reads to read-only subagents and keep conclusions, not file dumps (cheap/fast models for mechanical sweeps, the strongest for adversarial lenses — the three-tier model/effort table in `.claude/skills/README.md` › Model & effort routing). Same discipline when delegating *generation*: hand workers file **paths**, not pasted payloads, and have them write artifacts to disk and return a summary — every relay through the orchestrating session is paid at session-model prices in both directions (~2–4× the worker's own cost, per the template's delegation experiments), and neutral filenames keep blind protocols intact. Detail lives in skills (lazy-loaded), not in this file.
- **A permission denial is a decision point, not an obstacle.** When the harness or its auto-mode classifier denies a tool call mid-run: never retry verbatim, never work around it. **Diagnose the layer first**: if a settings rule already allows the exact call, the denial came from the classifier — another standing rule fixes nothing, so don't offer one. Then surface it as a **structured question** (AskUserQuestion) with the choices that fit the diagnosis — *approve and retry* · *unblock this session* (the exact `/permissions` rule or session-mode change, stated so the human applies it in seconds — agents can't widen permissions themselves, by design: `docs/AUTOMATION.md` §1) · *add this standing rule* (the exact settings snippet; only when no rule covers the call) · *here's the command to run yourself* — then continue on work that doesn't depend on it. Denials land in the local metrics ledger (`docs/AUTOMATION.md` §1) and feed the retrospective loop.
- **Follow the written system.** These docs and skills encode the judgment; prefer them over improvisation, and verify with evidence — never claim green without output. Don't re-litigate settled `D-NN` decisions. Never force-push or admin-merge — the gates exist to gate (`PROJECT_CONVENTIONS.md` › Merge policy).
- **Keep the library honest.** If you extend `textbooks/`, regenerate `SECTIONS.json` and run the audits (they exit non-zero; CI enforces them).
