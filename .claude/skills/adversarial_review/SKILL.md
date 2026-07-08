---
name: adversarial_review
description: Red-team a substantial change before merge with parallel READ-ONLY reviewer subagents — distinct lenses, an explicit mandate to FALSIFY the change's claims — then one coordinated fix pass and tickets for the rest. Use at end-of-feature / pre-merge / epic-close, and whenever definition_of_done's review-cadence gate requires it (milestone exits + risky slices by default). Say "adversarial review", "red-team this", "review before merge", "multi-lens review". Complements /code-review (generic bugs) and review_against_library (conformance).
---

# Adversarial Review (Parallel, Multi-Lens)

Run several **independent reviewers in parallel**, each with a different lens and a mandate to *break* the change, then reconcile and fix. A reviewer told to confirm tends to confirm; reviewers told to falsify, from distinct angles, surface the real defects a single pass misses. This is the gate before a feature merges. Read paths / commands / stack / invariants from `PROJECT_CONVENTIONS.md` and `docs/ARCHITECTURE.md`.

## The design: parallel review is read-only; fixing is coordinated

The one rule that makes the parallel fan-out safe — **so the reviewers never trample each other's work**:

- **Review phase = strictly read-only.** Every reviewer *analyzes* the diff and *returns findings*. **No reviewer edits the working tree.** That is precisely *why* they can run concurrently without trampling — there is nothing to trample, because nobody writes. A reviewer that wants to "just fix it inline" is a setup bug; stop it.
- **A reviewer that must *execute* anything gets its own worktree.** "Read-only" covers edits, not builds: parallel reviewers *running* builds/tests/repros on one shared checkout still collide — they contend on the build directory (lock waits, half-written artifacts) and one agent's compile races another's test run, **manufacturing phantom failures that look exactly like real flakiness** (this once produced a spurious Critical finding on a real project). So any reviewer that needs to compile, run tests, reproduce a finding, or mutation-test gets `isolation: "worktree"` (its own checkout + build dir); pure Grep/Read reviewers may share the tree.
- **Fix phase = a single coordinated writer.** Apply the must-fix set *after* the fan-out, from one place. By default **serially** in the working tree (one writer, no conflicts). Parallelize fixes only when they touch **disjoint files**, and then **isolate each in its own git worktree/branch** (e.g. the Workflow tool's `isolation: 'worktree'`, or a branch per fix) and merge back — never two fix agents writing the same tree at once.

Keep the two phases strictly separated: reviewers find; one coordinated pass fixes. (This shape is also the token-efficient one: each reviewer burns its own subagent context; the orchestrator holds only the findings tables.)

## When to run

A checkpoint gate for **high-stakes or novel** work at the **end of a feature, before merge** (or before closing a multi-PR epic) — not every change. Reach for it on: nontrivial logic or math, concurrency / shared state, security- or safety-sensitive code, a new subsystem, a spec↔impl or producer↔consumer mirror, or a large refactor. Skip trivial / mechanical changes (use `/code-review` or `definition_of_done`); over-use trains noise.

## Procedure

1. **Frame the target + the claims to falsify.** Pin down exactly what changed (the diff, the files) and the **load-bearing claims** a bug would violate: the correctness invariant, the test *oracle*, the project invariants (`docs/ARCHITECTURE.md` §2), determinism / safety, API / version compatibility. The reviewers' job is to break these.

2. **Pick the lenses** — distinct, non-overlapping, matched to the change's real failure axes (mine them from `textbooks/reference/ANTI_PATTERNS.md` and the project's invariants). Default 3; 1–2 for moderate risk, 3–5 for critical / security. Neutral defaults to adapt:
   - **Lens A — core correctness / logic / math:** hand-verify the central logic by worked example; check spec↔impl and producer↔consumer parity; enumerate edge cases (empty / degenerate input, boundaries, overflow, off-by-one).
   - **Lens B — language / framework / resource soundness:** the stack's footguns (memory / ownership, concurrency / races, resource lifecycles, error handling, API misuse) + **refactor regressions** (did an extraction change observable behavior?).
   - **Lens C — test / oracle integrity + invariants:** do the tests actually *prove* the claim (could a wrong impl still pass?); coverage gaps; conformance to the library (verify `Book NN §X` citations) and the project invariants; CI-vs-local reality.
   - *(add as needed)* **security / abuse**, **performance / resource**, **data / migration**.
   - *(add for feature-heavy or abstraction-heavy diffs)* **over-engineering / YAGNI:** falsify the claim *"this is the minimal sufficient implementation."* Flag, biggest cut first: **delete** (dead / unreachable / unused), **stdlib** or **native** (hand-rolled what the language or platform already ships), **yagni** (a single-implementation interface, a one-caller indirection layer, a speculative flag or config nobody sets), **shrink** (same behavior in materially fewer lines). The bar is *cut without loss* — never at the cost of the non-negotiables in `CLAUDE.md` › Working style (validation, error/data-loss handling, security, determinism, the explicit ask). Inert over-engineering is a Low/Med, not a Critical; rank by lines/deps removable. This lens is the **per-diff** half (cruft as it enters); for **accumulated** cruft a single diff can't show — a one-impl interface, a flag nobody sets — run [`audit_over_engineering`](../audit_over_engineering/SKILL.md) (whole-repo, on-demand).
   This composes `review_against_library` (the conformance lens) and `/code-review` (the generic-bug lens).

3. **Fan out the reviewers in parallel — read-only.** Delegate to `/code-review ultra` (cloud multi-agent), the **Workflow tool** (one read-only agent per lens in a Review phase), or parallel `Agent` subagents in a single message — **preferring the [`adversarial-reviewer`](../../agents/adversarial-reviewer.md) agent type**: its toolset is Read/Grep/Glob only, so "read-only" is enforced by the harness, not the prompt — and it carries no `model:` pin, so **every lens runs on the session model** (the #49 anti-goal: judgment never routes down). A reviewer that must *execute* uses a general agent + `isolation: "worktree"` instead. Give each reviewer: the repo path, the exact diff / files, the claims to falsify, its lens, and the **output contract** — every finding tagged **SEVERITY (Critical / High / Med / Low)** with `file:line`, a concrete repro or worked argument, and a suggested fix; *attempt to falsify before concluding*; and **state plainly what is solid** (don't invent issues to look productive). Reviewers **return findings; they do not modify files.**

4. **Reconcile + triage.** Dedupe across lenses; record an overall verdict (e.g. SOUND / SOLID-with-gaps) and *why* (what was hand-verified). Split into **FIX-NOW** (Critical / High / Med + cheap high-value Low) vs **DEFER** (genuinely non-blocking).

5. **Apply the must-fix set — coordinated, non-trampling.** Default: fix **serially** in the working tree. If you parallelize independent fixes, give each its **own worktree / branch** and merge back (disjoint files only); re-verify after the merge. Then re-run `definition_of_done` — the fixes must not regress the gates. Fold them into the same PR (pre-merge) or a clearly-labelled follow-up PR.

6. **Ticket every DEFER finding** — invoke `track_followups`. A finding left only in chat or a PR comment is lost next session; this is **not optional.**

## Output

- A findings table: severity · `file:line` · issue · verdict (fixed / ticketed-as #N / confirmed-solid).
- The synthesized verdict + what was hand-verified.
- The fix-now commit(s) + the ticket number(s) for deferred items.

## Verification

- Reviewers genuinely attempted to falsify — reports carry worked counter-arguments, not check-marks.
- **The review phase touched no files** — the diff after the fan-out equals the diff before it; every edit came from the coordinated fix pass.
- Any "flaky / nondeterministic" finding was reproduced with a **single clean run in an isolated tree** before being accepted — shared-checkout / shared-build-dir contention between parallel agents is a known false-positive factory.
- Every Critical / High / Med is fixed **or** explicitly accepted with a ticket; nothing merges / closes with an unaddressed one.
- Every deferred finding has a ticket (`track_followups` ran); none lives only in the conversation.

## Don't

- **Don't let reviewers edit the tree.** The parallel phase is read-only; a reviewer that writes can clobber another's context and corrupt the review. Findings only.
- **Don't apply parallel fixes to the same files.** Serialize, or isolate each fix in its own worktree / branch and merge back. Two writers on one tree is the trampling failure mode.
- Don't run reviewers that "confirm" — the mandate is to break the claims from distinct angles.
- Don't let the lenses overlap; diverse angles are the whole point.
- Don't merge / close with an unresolved Critical / High, or with findings parked only in chat.
- Don't reach for the fan-out on trivial changes — that's `/code-review`'s job.
- Don't let multiple reviewers build/test on one shared checkout — executing reviewers get `isolation: "worktree"`; and don't accept a flakiness finding without a clean isolated re-run.
- Don't trust a device / environment-specific finding as cleared by CI when CI can't exercise it; note what only ran on the dev machine.
