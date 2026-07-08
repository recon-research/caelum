---
name: prepare_compaction
description: Checkpoint the session before context is compacted or the session ends, so the next session resumes from the docs alone. Use when the user says "let's prepare for compaction", "prepare to compact", "checkpoint", or "wrap up the session" — and PROACTIVELY, without being asked, at a clean checkpoint (just merged, tree pushed, no slice in flight) once the session has grown heavy or context is running low — run the full procedure and end with the ready-to-paste /compact block; pasting it is the user's call, so never ask "want me to compact?" first. Rewrites and stamps the Status block, VERIFIES its claims against the tracker, updates roadmap/decision log, sweeps deferrals into tickets, and leaves the tree clean and pushed.
---

# Prepare For Compaction

The durable memory is the docs + the issue tracker, not the chat. This skill flushes everything in-flight to those — and **verifies** the result, because a stale checkpoint is worse than none. If you've checkpointed at every merge (the standing rule), this is mostly verification, not archaeology.

## When to run it unprompted (proactive — asking first is the failure mode)

Compaction quality is set by *when* you compact. The agent watches for the moment and **runs the procedure itself**, rather than letting the context window fill until the harness force-compacts (a forced auto-compaction keeps only a generic summary — it can't name a focus, so the Resume point is exactly what it tends to drop).

- **Best moment = a clean checkpoint:** just merged, tree pushed, **no in-flight slice**. Compacting here loses nothing; compacting mid-slice risks stranding uncheckpointed work. If you're mid-slice when the window gets tight, first reach a checkpoint — land the slice, or rescue-branch it (`onboard` Mode B's dirty-tree path) — *then* compact.
- **Signals it's time:** the session has run several slices / a long exploration / large file reads; you're about to start a big new slice that deserves a fresh window; or the human's context indicator is nearing the auto-compaction threshold. Beat the threshold — a chosen compaction with a named focus beats a forced one.
- **How to hand it over:** don't ask *"want me to compact?"* and wait — that round-trip is the documented field failure (#45): the block arrives one message too late or not at all. At the moment, say in one line why now (*"clean checkpoint + heavy session — preparing compaction"*), run the procedure, and end the message with the readiness-gate line and the fenced `/compact` block (step 8). The human pastes it when they choose — an unused block costs nothing; a missed checkpoint costs the Resume point. Don't nag: at most once per clean checkpoint when the session is genuinely heavy.

## Procedure

1. **Rewrite the Status block** in [`CLAUDE.md`](../../../CLAUDE.md) to reflect reality, and **stamp it**: `As of: <today> · <main short-sha>`.
   - Phase · milestone · CI state of main.
   - **Done** (closed this session, by PR #), **In progress** (+ issue/PR #), **Next** (1–3 slices by issue #).
   - **Decisions awaiting the human** — must exactly mirror `gh issue list --label decision`; mark any proceeding provisionally.
   - **Resume** in the strict format: `<branch> · <issue #> · <one imperative next action> · verify with: <command>` — specific enough that a cold session needs nothing else.
   - **Keep it lean — the ~10-line contract** (the blockquote under `## Status` says so). Completed slices are **one-liners** — `☑ name #NN (PR #MM): one line` pointing at the issue — **never** the full write-up; that lives in the closed issue/PR and the [`docs/ROADMAP.md`](../../../docs/ROADMAP.md) M0 slice index. Reusable patterns + gotchas go in [`docs/PATTERNS.md`](../../../docs/PATTERNS.md), not here. If the block has regrown into per-slice narratives (each merge appending its adversarial-review essay), **recompact it** — a bloated anchor is exactly the drift #123 fixed, and it re-drifts if a checkpoint pastes the full slice write-up instead of a one-liner.
2. **Verify the claims (anti-staleness gate).** Cross-check mechanically before moving on:
   - every **Done** item ↔ a merged PR exists (`gh pr list --state merged -L 10`);
   - every **In progress / Next** item ↔ an open issue;
   - the decision list ↔ `gh issue list --label decision`, exactly;
   - ROADMAP slice/milestone states match the above. Fix every mismatch **now** — docs are caches of the tracker.
3. **Update the durable docs.** Reflect milestone progress in [`docs/ROADMAP.md`](../../../docs/ROADMAP.md); record any decision made this session as `D-NN` in [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) Appendix A. If a milestone closed, sanity-check the next milestone's slices against what was learned — re-plan via `plan_work` if stale; **plans are caches too**.
   - **Refresh the metrics ledger** (CMMI-L4): `python3 scripts/metrics.py` (fail-soft; commit the updated [`docs/METRICS.md`](../../../docs/METRICS.md) with the checkpoint). If a metric shows a ⚠ alarm — or a milestone just closed — run [`retrospective`](../retrospective/SKILL.md): root-cause it and **leave a guard**, don't just note the number.
4. **Sweep deferrals.** Run [`track_followups`](../track_followups/SKILL.md): anything deferred, promised, or ideated that lives only in chat becomes an issue (labels: `followup` / `idea` / `debt`); drain any `## Unfiled` section in `PROJECT_BACKLOG.md` (the gh-outage parking lot) into real issues. This should find little if "defer = file now" was followed mid-session — treat every catch here as a near-miss.
5. **Retire the scratch backlog.** If `origin` exists and `PROJECT_BACKLOG.md` is still present, migrate its items to issues and delete the file (it's pre-repo continuity only).
6. **Leave the tree clean and pushed.** Commit merged work; land the doc-only checkpoint commit via the **checkpoint path** in `PROJECT_CONVENTIONS.md` › Merge policy (protected main rejects direct pushes — don't discover that at session end); note CI state in Status (a red CI is noted, never hidden). If `textbooks/` was touched, regenerate `SECTIONS.json` and run the audits (they exit non-zero — fix before declaring the checkpoint done).
7. **Readiness gate — confirm before emitting the command.** All of these must hold; if any fails, fix it *now* rather than compacting over an unprepared tree: ☑ `git status` clean and pushed; ☑ Status verified against the tracker (step 2 passed); ☑ every deferral filed as an issue; ☑ any decision recorded as `D-NN`; ☑ CI state noted honestly in Status; ☑ the Resume line is specific (branch · issue · action · verify-command). State the gate's result in one line — *"compaction-ready: tree clean+pushed, Status verified, N deferrals filed, CI green"* — or name what you fixed to get there.
8. **Emit the ready-to-paste compaction command.** End by printing the `/compact` command **inside a fenced code block** (so the human gets a one-click copy button — paste it to compact when they choose). The argument is a focused handoff that tells the summary what to keep verbatim — the Resume point above all. Don't run `/compact` yourself; hand the human the button. Format:

   ````text
   ```text
   /compact Keep verbatim — Resume: <branch> · #<issue> · <next imperative action> · verify: <command>. In progress: <slice + PR#>. Next: <1-3 by #>. Open decisions: <D-NN / #s / none>. Provisional: <#NN / none>. Docs current as of <main short-sha>; truth = tracker.
   ```
   ````

   **Handoff budget — hard cap, anti-ratchet (#67):** the argument stays **under ~100 words, one paragraph, exactly this format** — pointers, never content. No session narrative, no accomplishment lists, no restated policy: standing constraints live in durable homes (`CLAUDE.md`, the settings `$comment`, conventions) and are *referenced*, not inlined. Write it fresh from the format every time, **never by extending the previous session's handoff** — that ratchet is the documented field failure: a sibling project's handoff grew at every compaction until it crowded out the summary it was steering. If the block wants more words, the overflow is **un-checkpointed state**: put it in Status / ROADMAP / a ticket (steps 1–5), then the pointer suffices.

## Output

- The one-line readiness-gate result (or what was fixed to pass it).
- The rewritten Status block (already committed via the checkpoint path).
- **The fenced `/compact …` command block** — the copy-paste handoff, last, so it's easy to grab.

## Verification

- A cold reader could resume from the Status block alone — branch, issue, action, verify-command.
- Step 2's cross-checks all pass: Status ↔ tracker ↔ ROADMAP agree; the As-of stamp matches today + HEAD.
- `gh issue list` shows every deferred item; nothing actionable lives only in this conversation.
- `git status` clean; pushed; CI state recorded honestly.
- The readiness gate passed and the `/compact` block was emitted in a fenced code block (copyable), with a Resume point specific enough to need nothing else.
- The `/compact` argument is under ~100 words, matches the step-8 format, and repeats nothing that now lives in Status / the tracker.

## Don't

- Don't write the Status block from memory of the session — derive it from `git log` + `gh issue list`/`gh pr list`, then verify (step 2 is not optional).
- Don't leave a vague Resume point ("continue M3") — name the branch, issue, action, and verify command.
- Don't let actionable follow-ups evaporate into chat; and don't keep `PROJECT_BACKLOG.md` alive once the tracker exists.
- Don't push failing work silently — note it, or don't push it.
- Don't emit the `/compact` block before the readiness gate passes — a copy-paste handoff over an unprepared tree just compacts the mess.
- Don't run `/compact` yourself — print the command for the human and let them choose when to paste it; they may want to keep working in this window.
- Don't write a novel — the Status block is ~10 lines (≤ 15 non-blank is CI-gated by `scripts/audit_docs.py`); detail belongs in the ROADMAP and the tracker.
- Don't grow the handoff — the ~100-word cap is hard: regenerate from the format each time; never carry the prior session's block forward.
