---
name: prepare_compaction
description: Checkpoint the session before context is compacted or the session ends, so the next session resumes from the docs alone. Use when the user says "let's prepare for compaction", "prepare to compact", "checkpoint", or "wrap up the session" — and PROACTIVELY, without being asked, at a clean checkpoint (just merged, tree pushed, no slice in flight) once the session has grown heavy or context is running low — run the full procedure and end with the ready-to-paste /compact block; pasting it is the user's call, so never ask "want me to compact?" first. Rewrites and stamps the Status block, VERIFIES its claims against the tracker, updates roadmap/decision log, sweeps deferrals into tickets, promotes durable auto-memory entries to their versioned homes (evicting the buffer), and leaves the tree clean and pushed.
---

# Prepare For Compaction

The durable memory is the docs + the issue tracker, not the chat. This skill flushes everything in-flight to those — and **verifies** the result, because a stale checkpoint is worse than none. If you've checkpointed at every merge (the standing rule), this is mostly verification, not archaeology.

## When to run it unprompted (proactive — asking first is the failure mode)

Compaction quality is set by *when* you compact. The agent watches for the moment and **runs the procedure itself**, rather than letting the context window fill until the harness force-compacts (a forced auto-compaction keeps only a generic summary — it can't name a focus, so the Resume point is exactly what it tends to drop).

- **Best moment = a clean checkpoint:** just merged, tree pushed, **no in-flight slice**. Compacting here loses nothing; compacting mid-slice risks stranding uncheckpointed work. If you're mid-slice when the window gets tight, first reach a checkpoint — land the slice, or rescue-branch it (`onboard` Mode B's dirty-tree path) — *then* compact.
- **Signals it's time:** the session has run several slices / a long exploration / large file reads; you're about to start a big new slice that deserves a fresh window; or the human's context indicator is nearing the auto-compaction threshold. Beat the threshold — a chosen compaction with a named focus beats a forced one.
- **How to hand it over:** at the moment, say in one line why now (*"clean checkpoint + heavy session — preparing compaction"*), run the procedure, and end the message with the readiness-gate line and the fenced `/compact` block (step 8). The human pastes it when they choose — an unused block costs nothing; a missed checkpoint costs the Resume point. Don't nag: at most once per clean checkpoint when the session is genuinely heavy.
- **Tripwire — the suggestion IS the trigger.** Any sentence that proposes *or presumes* this window ending — **in any phrasing** — means the signals already fired and the procedure should have run **before** that sentence was written. Asking and waiting is the documented field failure (#45): the block arrives one message too late, or not at all. **The test is the proposition, not the words:** if the sentence would have the human start a new window, or takes for granted that they will, it is the cue. The explicit forms are easy (*"I'd suggest compacting"*, *"want me to prepare the handoff?"*). The ones that actually slip through are oblique: *"a natural place to start fresh"*, *"deserves a fresh window"*, *"this session has gotten long"*, *"a clean stopping point"*, *"I'll pick that up next session"*. That last one asks nothing and strands the Resume point in chat — **presuming is as much a miss as asking.** Note that *Signals it's time* above teaches "deserves a fresh window" as a thing to **notice**; noticing it is the cue to run the procedure, never to narrate it. Catch yourself drafting any of these ⇒ delete the sentence, run the procedure, hand over the block instead. Sighted through twice downstream — the second time with a vocabulary-matching version of this rule already in place, which is why it tests the proposition now (#750).

## Procedure

> **Self-hosted-template carve-out (#361).** On the template repo itself the Status block, [`docs/ROADMAP.md`](../../../docs/ROADMAP.md), ARCHITECTURE Appendix A, and `PROJECT_BACKLOG.md` ship as placeholder skeletons — they **are** the product — so steps 1–3 don't fill them and step 5 doesn't delete the backlog. There the tracker is the durable home for all of it (`PROJECT_CONVENTIONS.md` › Decision flow), step 2 cross-checks against the tracker directly rather than against Status, and the checkpoint *is* the metrics-ledger refresh plus a current tracker. Steps 4 and 6–8 run unchanged. `onboard` holds the reading half of this rule; this is the writing half — the skill that actually edits those files.

1. **Rewrite the Status block** in [`CLAUDE.md`](../../../CLAUDE.md) to reflect reality, and **stamp it**: `As of: <today> · <main short-sha>` — the sha of the commit the checkpoint **describes** (pre-checkpoint main), never post-commit HEAD, which writing the stamp advances past by construction (`.claude/hooks/session_start_banner.py` `CHECKPOINT_TRIO` is the authority on what counts as a checkpoint-only commit).
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
4. **Sweep deferrals — chat and auto-memory are both volatile stores.** Run [`track_followups`](../track_followups/SKILL.md): anything deferred, promised, or ideated that lives only in chat becomes an issue (labels: `followup` / `idea` / `debt`); drain any `## Unfiled` section in `PROJECT_BACKLOG.md` (the gh-outage parking lot) into real issues. This should find little if "defer = file now" was followed mid-session — treat every catch here as a near-miss.
   - **Flush the auto-memory buffer (#311).** Where the harness keeps per-project auto-memory (a machine-local memory directory + index), that store is a capture buffer, not a home: it doesn't ride the repo, so a project-durable fact living only there is silently absent on every other box — observed live on this project's 2026-07-18 machine swap, and the loss mode Windsurf's two-tier capture→promotion model exists to prevent (`research/notes/agent-project-systems.md`). Review every index entry and route it: **promote** project-durable facts to their versioned single home — a `CLAUDE.md` line, a conventions rule, a SKILL.md diff, a ticket — reconciling at write per the correction-capture rule (#305): update or supersede the overlapping text, never a near-duplicate append; **evict** what was just promoted or has gone stale (delete the entry and its index line); **keep** only the genuinely user-scoped or cross-project (who the owner is, how they like to work — what auto-memory is *for*), with one carve-out (#743 → #817): a standing **grant** that makes shipped machinery dispatchable reads as user-scoped but belongs in that machinery's own text — parked in the buffer it reaches one project on one box, which is how a fleet-wide grant went missing on seven of eight. State the rollup with the readiness gate: `memory: promoted N · evicted M · kept K` — or `memory: swept, nothing to move`, or `memory: none on this harness`. No auto-memory? The rollup says so and the sweep is done — never invent a buffer to sweep.
5. **Retire the scratch backlog.** If `origin` exists and `PROJECT_BACKLOG.md` is still present, migrate its items to issues and delete the file (it's pre-repo continuity only).
6. **Leave the tree clean and pushed.** Commit merged work; land the doc-only checkpoint commit via the **checkpoint path** in `PROJECT_CONVENTIONS.md` › Right-sized slices (protected main rejects direct pushes — don't discover that at session end); note CI state in Status (a red CI is noted, never hidden). If `textbooks/` was touched, regenerate `SECTIONS.json` and run the audits (they exit non-zero — fix before declaring the checkpoint done).
7. **Readiness gate — confirm before emitting the command.** All of these must hold; if any fails, fix it *now* rather than compacting over an unprepared tree: ☑ `git status` clean and pushed; ☑ Status verified against the tracker (step 2 passed); ☑ every deferral filed as an issue; ☑ the auto-memory buffer swept — its `memory:` rollup stated (step 4); ☑ any decision recorded as `D-NN`; ☑ CI state noted honestly in Status; ☑ the Resume line is specific (branch · issue · action · verify-command). State the gate's result in one line — *"compaction-ready: tree clean+pushed, Status verified, N deferrals filed, CI green"* — or name what you fixed to get there.
8. **Emit the ready-to-paste compaction command.** End by printing the `/compact` command **inside a fenced code block** (so the human gets a one-click copy button — paste it to compact when they choose). The argument is a focused handoff that tells the summary what to keep verbatim — the Resume point above all. Don't run `/compact` yourself; hand the human the button. Format:

   ````text
   ```text
   /compact Keep verbatim — Resume: <branch> · #<issue> · <next imperative action> · verify: <command>. In progress: <slice + PR#>. Next: <1-3 by #>. Open decisions: <D-NN / #s / none>. Provisional: <#NN / none>. Docs current as of <main short-sha>; truth = tracker.
   ```
   ````

   **Handoff budget — hard cap, anti-ratchet (#67):** the argument stays **under ~100 words, one paragraph, exactly this format** — pointers, never content. No session narrative, no accomplishment lists, no restated policy: standing constraints live in durable homes (`CLAUDE.md`, the settings `$comment`, conventions) and are *referenced*, not inlined. Write it fresh from the format every time, **never by extending the previous session's handoff** — that ratchet is the documented field failure: a sibling project's handoff grew at every compaction until it crowded out the summary it was steering. If the block wants more words, the overflow is **un-checkpointed state**: put it in Status / ROADMAP / a ticket (steps 1–5), then the pointer suffices.

   **The `next session:` opener line (#487) — printed right after the fenced block, outside the argument.** The owner shouldn't have to diff the tracker to learn whether the grind waits on them. Derive it mechanically — `python3 scripts/ready_work.py` for the agent-workable count, `gh issue list --label decision` plus any `needs-human`, plus anything this session parked pending owner input (a manual demo to run, a survey answer, a data drop) — and print exactly one line:
   - Nothing waits on the owner ⇒ `next session: say "onboard and continue" — <N> ready tickets, nothing waits on you.`
   - Owner input pending but independent work remains ⇒ `next session: say "onboard and continue" — grind proceeds on <N> tickets; when you have a minute: <concrete ask · #NN> (unblocks <what>).`
   - Ready set empty, or the milestone-critical path waits on the owner ⇒ `next session: say "onboard", then <concrete ask — answer #NN / run the demo / provide X> — the grind is stalled on you until then.`
   Always the concrete ask and its ticket, never a bare "decisions pending". The line stays **outside** the `/compact` argument — the #67 cap buys pointers only, and this line is for the owner's eyes at compact time, not for the summary.

## Output

- The one-line readiness-gate result (or what was fixed to pass it), with step 4's `memory:` rollup alongside it — never inside the `/compact` argument.
- The rewritten Status block (already committed via the checkpoint path).
- **The fenced `/compact …` command block** — the copy-paste handoff, last, so it's easy to grab.
- **The `next session:` opener line** right after the block — *onboard and continue* vs *stalled on you: \<concrete ask · #NN\>* (#487).

## Verification

- A cold reader could resume from the Status block alone — branch, issue, action, verify-command.
- Step 2's cross-checks all pass: Status ↔ tracker ↔ ROADMAP agree; the As-of stamp carries today's date and step 1's **pre-checkpoint** sha — never post-commit HEAD, which a correctly-executed checkpoint always sits one commit past.
- **Self-hosted template:** the Status / ROADMAP / Appendix-A / stamp checks above don't apply (carve-out) — there is deliberately nothing filled to verify. What must hold instead: the tracker is current, the metrics ledger refreshed, and the skeletons untouched.
- `gh issue list` shows every deferred item; nothing actionable lives only in this conversation.
- `git status` clean; pushed; CI state recorded honestly.
- The auto-memory sweep ran to its rollup: promoted facts landed in their versioned homes (riding the checkpoint commit), evicted entries are gone from the index, and nothing project-durable remains machine-local only.
- The readiness gate passed and the `/compact` block was emitted in a fenced code block (copyable), with a Resume point specific enough to need nothing else.
- The `/compact` argument is under ~100 words, matches the step-8 format, and repeats nothing that now lives in Status / the tracker.
- The `next session:` line was derived from `ready_work` + the decision queue (not guessed), names the concrete owner ask when one exists, and sits outside the `/compact` argument.

## Don't

- Don't write the Status block from memory of the session — derive it from `git log` + `gh issue list`/`gh pr list`, then verify (step 2 is not optional).
- Don't leave a vague Resume point ("continue M3") — name the branch, issue, action, and verify command.
- Don't let actionable follow-ups evaporate into chat; and don't keep `PROJECT_BACKLOG.md` alive once the tracker exists.
- Don't push failing work silently — note it, or don't push it.
- Don't leave a project-durable fact stranded in machine-local auto-memory — a box swap silently loses it: promote it or ticket it (#311). Don't promote by appending a near-duplicate (update-over-supersede at the destination, #305). And don't spend the `memory:` rollup inside the `/compact` argument — the #67 cap buys pointers only.
- Don't emit the `/compact` block before the readiness gate passes — a copy-paste handoff over an unprepared tree just compacts the mess.
- Don't run `/compact` yourself — print the command for the human and let them choose when to paste it; they may want to keep working in this window.
- Don't write a novel — the Status block is ~10 lines (≤ 15 non-blank is CI-gated by `scripts/audit_docs.py`); detail belongs in the ROADMAP and the tracker.
- Don't grow the handoff — the ~100-word cap is hard: regenerate from the format each time; never carry the prior session's block forward.
- Don't say "stalled on you" without naming the concrete ask + ticket, and don't say "onboard and continue" without checking the decision queue and the ready set — the opener line is derived, never vibes (#487).
