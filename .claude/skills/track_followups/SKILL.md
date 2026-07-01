---
name: track_followups
description: File deferred work, review leftovers, and ideas as tracker issues THE MOMENT they appear — not at session end. Use mid-task whenever you catch "later / should / could / out of scope / follow-up", when a TODO is about to enter code, when review defers a finding, when the user drops an idea worth keeping, and as a sweep inside prepare_compaction or before closing an issue/epic. Say "track this", "file a follow-up", "are we tracking X", "don't lose this".
---

# Track Follow-ups (defer = file now)

The failure mode this kills: the agent says "we'll get to X later," doesn't write it down durably, and X evaporates at compaction. Chat scrolls off, memory notes drift, a comment on a *closed* issue never appears in `gh issue list`. **The tracker is the only durable parking lot — the moment something is deferred, it becomes an issue.** Read the repo + label set from `PROJECT_CONVENTIONS.md` › Tracker & Hygiene.

## When (in order of importance)

1. **Mid-task, at the moment of deferral** — the instant you think "later / out of scope": file it (≤2 minutes), then continue the task. Don't batch deferrals for session end; session end is exactly what compaction eats.
2. **A TODO is about to enter code** — file the ticket *first*, then write `TODO(#NN): …`. A naked TODO/FIXME fails `definition_of_done` and the CI hygiene gate (a `static gates` step).
3. **Review deferred a finding** (`adversarial_review`'s DEFER set, `/code-review` notes) — one issue per finding.
4. **An idea worth keeping** (yours or the human's) — label `idea`. Ideas are cheap to file and expensive to lose.
5. **Sweep** — inside `prepare_compaction`, and before closing any issue/epic with known leftovers. If the sweep finds anything, treat it as a near-miss: it should have been filed at moment-of-deferral.

## Procedure

1. **Search first** (`gh issue list --search "<keywords>"`). If an open issue already covers it, append a checklist item there instead of duplicating.
2. **File with the right shape**: the `followup` issue template; label per taxonomy — `followup` (deferred work) · `idea` · `debt` · `bug` · `blocked`. Real forks for the human are **not** follow-ups — use the `decision` template and the `CLAUDE.md` §3 protocol.
3. **Write it to be actioned cold.** A future session has none of this context: *what* + *where* (file paths), *why deferred*, the originating PR/issue #, any grounding (`Book NN §X`), and what "done" looks like.
4. **Cross-link both ways.** The origin (PR body, parent issue, code `TODO(#NN)`) names the ticket; the ticket names its origin.
5. If it changes near-term plans, point the ROADMAP's **Next** at the issue # — link, don't duplicate the body.
6. **If `gh` fails transiently** (rate limit, network): retry once. Still failing → append the item verbatim under a `## Unfiled` heading in `PROJECT_BACKLOG.md` (recreate the file if it was retired) and keep working — `onboard` step 3 and `prepare_compaction` step 4 drain Unfiled into real issues. The success signal for this skill is an **issue number**; no number = not filed.

## Output

- The ticket number(s) created or updated, and the cross-links made.

## Verification

- `gh issue list` shows the work; each ticket is self-contained enough to act on cold.
- The origin references the ticket number; any code TODO reads `TODO(#NN)`.
- Nothing actionable remains only in chat, a memory note, or a closed-issue comment.

## Don't

- **Don't say "I'll get to it later" without a ticket number in the same breath** — that sentence is the bug this skill exists to fix.
- Don't treat a failed `gh issue create` as filed — no issue number, no ticket; use the `## Unfiled` fallback (step 6) and drain it at the next checkpoint.
- Don't park work in `PROJECT_BACKLOG.md` once the repo exists (the `## Unfiled` outage fallback is the one exception, drained at the next onboard/compaction) — the tracker is authoritative.
- Don't file vague tickets ("improve X") — name the file, the symptom, and the finish line.
- Don't file noise: trivial items get done inline now or dropped, not ticketed. Don't duplicate — search first.
- Don't defer a Critical/High correctness finding to a ticket to dodge fixing it — tickets are for *non-blocking* work.
