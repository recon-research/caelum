---
name: catch_up
description: Give the owner a read-only big-picture briefing — project health, what just landed, what's in flight, what's next, decisions waiting — synthesized from the Status anchors and the tracker, with zero writes and no work started. Use when the user says "catch me up", "big picture", "status report", "how's it going", "where are we", "what's the state of things" — a check-in, not a session start. Resuming work is onboard's job; lead-dev-depth explanation (meeting prep, decision rationale, drill) is deep_brief's; this skill never claims, fixes, or resumes.
---

# Catch Up (read-only owner briefing)

The check-in complement to `onboard`: the owner wants to know where things stand, without a session spinning up work. Everything here is READ-ONLY — a reader needs no claim under the concurrent-writer protocol, which makes this safe to run from any machine while builder sessions are live. Repo, labels, and CI posture come from `PROJECT_CONVENTIONS.md`. The deep, human-audience briefing — explain/defend the project, meeting prep, drill — is [`deep_brief`](../deep_brief/SKILL.md)'s job; this one stays the cheap check-in.

## Procedure

1. **Gather — bounded reads only** (this is the whole token budget: two doc anchors plus a handful of one-liners; nothing else):
   - The `CLAUDE.md` `## Status` block (its As-of stamp anchors "recent") and the **current milestone section** of `docs/ROADMAP.md` — never the whole file.
   - Tracker + git one-liners: `gh issue list --state open` (numbers, titles, labels) · `gh issue list --label decision --state open` · `gh pr list` · merges since the As-of stamp (`git log --oneline` against `origin/main`; last ~10 if no stamp) · `gh run list --branch main -L 1` · `git status --short`.
   - Judge CI **per the posture** (conventions › Operating posture) — under `light`, a main-push run reporting `skipped` is green; don't call it red from the conclusion string.
   - **Pre-onboarding / self-hosted repos** (Status still `<placeholders>` but the tracker is live): the tracker + git *are* the plan — synthesize from them and say so in the Health line.
2. **Synthesize the digest** — fixed shape, one screen (~20 lines), owner-facing prose: plain sentences, issue numbers expanded into what they mean, no session shorthand.
   - **Health:** main CI · working tree · second-writer signals (foreign claims, `slice/*` heads, open PRs and whose identity they carry).
   - **Done recently:** the merges since the As-of stamp, in plain words, with dates.
   - **In flight:** open PRs and claimed slices, and which session holds them — or "nothing in flight".
   - **Next:** the next 1–3 slices per the tracker/ROADMAP.
   - **Decisions waiting on you:** each open `decision` issue with its recommended default and objection window — or "none".
   - **Watch out:** blockers, red CI, stale docs, unexplained working-tree dirt — reported, not touched.
3. **Report drift, don't repair it.** Status disagreeing with the tracker, a decision past its objection window, unexplained dirt — name it under Watch out and point at the owning skill (`onboard` reconciles, `prepare_compaction` checkpoints). The briefing itself changes nothing; if the owner then asks for the fix, that's the next task, not this one.

## Verification

- The digest answers done / in-flight / next / decisions in one screen, and every claim in it came from a command run **this invocation** — never from chat memory.
- Zero writes: no commits, branches, comments, tickets, or doc edits — `git status` reads as you found it.
- Reads stayed bounded: the two anchors plus the listed one-liners; ARCHITECTURE and the library were not opened.

## Don't

- Don't fix anything — no doc repairs, no ticket filing, no rescue branches; report and route to the owning skill.
- Don't start, resume, or claim work — a reader posts no claim comment (conventions › Concurrent writers).
- Don't read the whole ROADMAP / ARCHITECTURE / the library "for context" — the anchors are enough by design.
- Don't dress it up — a terminal digest, not an artifact or dashboard; the point is a cheap check-in.
- Don't run onboard's preflight side effects (rescue branches, Status fixes) just because you noticed the trigger conditions — observing them is this skill's job; acting on them is onboard's.
