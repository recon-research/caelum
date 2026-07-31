---
name: fleet_size
description: Answer "how many concurrent builder sessions can we run right now?" — compute the supportable fleet width from the ready ticket set via certify-safe Surfaces disjointness, and present N with its lane partition and limiting factor. Use when the owner asks "how many sessions", "can we parallelize", "should I open more sessions", or before starting fleet mode (conventions › Concurrent writers, D-330).
---

# Fleet Size (the sizing query)

The owner's scaling question answered mechanically, from the evidence-backed formula (D-330; `research/notes/parallel-builder-fleet.md`): **N = min(disjoint lanes, queue depth, attention ceiling)**, never a guess. The number is a **ceiling from evidence, not a target** — running fewer sessions than N is always fine; running more than N is how fleets eat themselves (conflict storms, review erosion).

## Procedure

1. **Run the query:** `python3 scripts/fleet_size.py` (add `--ceiling <n>` if the owner has stated a different attention band; field consensus is 3–5, default 4). It reads the ready set (`ready_work`, #308) and each ticket's `Surfaces:` line (#304), certifies pairwise disjointness (missing/doubtful ⇒ serialize — certify-safe), and prints N, the bounds, the lane seeds, the hot-file list, and the unscoped list. A ticket whose Surfaces overlap a **merge-owned hot file** (Status/ROADMAP/`SECTIONS.json` — conventions › Concurrent writers) never seeds a lane: it's annotated `hot:` and serialized, since a hot file on a feature branch makes every in-flight pair conflict by construction (#349; the `HOT_FILES` constant in the script is the conventions mirror).
2. **Present the answer, not just the number:** N · **what limits it** (disjointness vs queue depth vs ceiling) · the lane partition (which ticket seeds each lane) · what would widen it (usually: add honest `Surfaces:` lines to unscoped ready tickets, or file more independent slices — the replenishment heuristic is 5–6 ready tickets per builder).
3. **Name the prerequisites** if the owner is about to scale: each session in its own `git worktree` (never two writers on one checkout), the fleet protocol live (scoped claims + WIP cap + strict landing rule + writer≠reviewer — conventions › Concurrent writers), and EXP-02's worktree-pair run as the first rung before going 4-wide (`research/experiments/EXP-02_two-writer-protocol/EXPERIMENT.md`).

## Verification

- The reported N came from the script's live output (bounds shown), not from intuition.
- The limiting factor was stated, with the concrete widening action.
- If fleet mode is imminent: prerequisites named, EXP-02 rung mentioned.

## Don't

- Don't treat N as a target — it's a ceiling; the tripwires (#333) exist because exceeding review capacity fails silently.
- Don't pad or invent `Surfaces:` lines to inflate N — a false-disjoint pair is exactly the collision the gate exists to prevent; predict honestly or serialize.
- Don't start sessions yourself — the owner spawns sessions; this skill sizes and partitions.
- Don't run the fleet without the protocol — N worktrees without scoped claims is N races, not N lanes.
