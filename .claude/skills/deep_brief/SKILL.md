---
name: deep_brief
description: "Lead-dev-depth briefing so the owner can explain and defend the project to other humans — meeting prep, stakeholder questions, full catch-up after time away. Two modes: brief (a generated phone-readable document — elevator pitch, problem→solution map, decision rationale, current state, known gaps + pre-answered hard Q&A, every claim sourced) and drill (interactive rehearsal on the same deck). Say \"deep brief\", \"brief me on the project\", \"prep me for a meeting\", \"explain this like I'm the lead dev\", \"drill me\", \"quiz me on the project\". Read-only, regenerated fresh every run. The quick operational check-in (done / in-flight / next, one screen) is catch_up's job; resuming work is onboard's."
---

# Deep Brief (lead-dev-depth owner briefing)

The deep complement to [`catch_up`](../catch_up/SKILL.md): not "where is the project" but **"how do I explain and defend the project to another human."** The output is the knowledge a lead developer carries into a meeting — what it does and will do, why the decisions went the way they went, what's genuinely done, what's pending, and answers to the hard questions before they're asked. Repo, labels, CI posture, and any data-sensitivity constraint come from `PROJECT_CONVENTIONS.md`.

Two design commitments:

- **Generated fresh, never maintained.** There is no `BRIEFING.md` — a maintained briefing is one more doc-cache that drifts and needs budgets; generating from the truth sources (tracker › docs, per `CLAUDE.md` › Source of truth) is fresh by construction. The output is disposable: scratchpad, never the repo.
- **Read-only.** No claim needed under the concurrent-writer protocol — safe from any machine while builder sessions run, exactly like `catch_up`.

## Modes & depth (judge from the ask)

- **brief** (default) — the document. Depth **meeting-prep** (one-pager + Q&A, phone-first) when the ask names a meeting, an audience, or time pressure; depth **full** (the ~20–30-minute lead-dev catch-up) otherwise.
- **drill** — interactive rehearsal ("drill me", "quiz me"): the agent plays the tough-question colleague. Always regenerates its material first (steps 1–4) — rehearsing a previous session's deck trains stale answers.

## Procedure

1. **Anchor + freshness.** The `CLAUDE.md` Status block (As-of stamp) plus the same one-liners `catch_up` uses: `gh issue list --state open` · `gh pr list` · recent merges vs `origin/main` · `gh run list --branch main -L 1`, judged per the CI posture. Where a doc claim and the tracker disagree, **the brief follows the tracker** and the footer flags the drift (routed to `onboard` — never repaired from here). Pre-onboarding / self-hosted repos (Status still `<placeholders>`): the tracker + git *are* the plan; say so in the footer and synthesize from them.
2. **Gather deep — the reads `catch_up` is forbidden.** Full `docs/ROADMAP.md`; `docs/ARCHITECTURE.md` including Appendix A; `decision` issues **`--state all`** (the closed ones carry the why-X-not-Y and the objection trail); `research/` notes and RR reports via `research/MANIFEST.json`; open `bug`/`debt`/`idea`/`followup` items for the gaps section. Token discipline: fan breadth out to `mech-sweeper` (cheap tier) returning per-source conclusions **with citations**; synthesis stays on the session model — this is judgment work, and the anti-goal rule applies (`README.md` › Model & effort routing).
3. **Synthesize the six sections** — fixed shape, written for a human audience: plain sentences, domain terms explained on first use, zero session shorthand.
   1. **Elevator pitch** — 30 seconds: what, for whom, why it exists.
   2. **Problem → solution map** — the centerpiece: each problem the project exists to solve → what was built for it → status. Derived from ROADMAP goals, ARCHITECTURE invariants, and the D-NN rows.
   3. **Decision ammunition** — the D-NN log in plain language: "why X and not Y," one trade-off each, superseded decisions noted as such.
   4. **Current state, honestly** — shipped / in flight / next / not-yet, with milestone framing.
   5. **Known gaps + hard Q&A** — the ~10 toughest questions an outsider would ask, each answered and sourced; scope boundaries ("what it does *not* do"); every tracked-but-unsolved item phrased as the confident answer it is: "known, #NN, planned for `<milestone>`."
   6. **The footer block** (Output below) — the brief's receipts.
4. **Verify citations before delivering** (mechanical, this invocation — chat memory is not a source): every `D-NN` cited exists in Appendix A (grep it); every `#NN` exists in the tracker; `Book NN §X` / `research/` cites follow the normal library rule. **A claim that can't be sourced is cut, or moved to the gaps section as an open question — never asserted.** A confidently wrong capability claim in a meeting is strictly worse than "not yet."
5. **Deliver.**
   - **meeting-prep:** a self-contained, phone-first page (single column at 375w, no horizontal scroll) published as a **private artifact** via the harness's artifact facility — the owner reads it walking into the room and decides alone whether it's ever shared. If `PROJECT_CONVENTIONS.md` declares a sensitivity / no-external-hosting constraint — or the content is plainly sensitive — deliver the same content as a local markdown file instead and say why in the footer.
   - **full:** a markdown file sent to the owner (also phone-readable); artifact on request, same sensitivity rule.
   - Either way the file lives in the scratchpad — never committed, never linked from repo docs.
6. **Drill mode:** after steps 1–4, don't emit the document — run the deck. One question at a time (hardest first, or the owner picks the area); the owner answers in their own words; grade against the sourced answer — confirm what held, correct what didn't *with the source*, name what was missing. End with a gap summary (the questions to re-drill next time) plus the footer block, and offer the written brief for the sections that hurt.

## Output — required footer on every run (brief or drill)

```
deep_brief: <project> · generated <UTC date> · main @ <short-sha>
mode: meeting-prep | full | drill
sources: ROADMAP · ARCHITECTURE (<n> D-NN rows) · decisions read <n> (open/closed) · research notes <n> · tracker items <n>
citations verified: <n> checked · <n> cut or demoted to gaps as unsourceable
drift: none | <each doc-vs-tracker mismatch, one line, routed to onboard>
delivery: artifact (private) | local file — <reason if the sensitivity fallback fired>
```

## Verification

- All six sections present; every Q&A answer and every decision-ammunition line carries a source that was **checked this invocation** (the footer's `citations verified` line is the receipt, not a formality).
- Zero repo writes: no commits, branches, comments, tickets, or doc edits — `git status` reads as found.
- Meeting-prep output actually renders phone-first: single column at 375w, tables scroll in their own container.
- Drill mode regenerated its deck this run — the footer's `generated` stamp proves it.
- Drift was flagged in the footer, not repaired.

## Don't

- Don't create or maintain a briefing doc in the repo — regenerate every time; staleness is the failure mode this design kills.
- Don't assert an unsourced capability — cut it or move it to gaps (step 4 is a gate, not advice).
- Don't inherit `catch_up`'s bounded reads — this skill exists to open ARCHITECTURE, the decision log, and research; but keep the tier routing: sweepers for breadth, session model for synthesis.
- Don't use this as the session check-in or let it start work — one-screen operational state is `catch_up`; resuming is `onboard`.
- Don't publish an artifact when the conventions declare sensitivity — local file, reason stated.
- Don't drill from memory or a previous brief — stale rehearsal trains wrong answers.
- Don't fix drift, file tickets, or answer decisions from here — pure reader; flag and route.
