---
name: review_against_library
description: Audit an existing design, subsystem, or diff for conformance to the project's reference library — recommended approaches, cataloged anti-patterns, and project conventions — citing the Book NN §X that grounds each finding. Use when the user says "review this against the library/books", "does this follow the library", "audit this design/subsystem", "check this for anti-patterns", or "is this the right approach" for existing code. Supports a `--fix` mode that applies the Must-fix findings. For generic bug-hunting use /code-review instead.
---

# Review Against The Library (Conformance Audit)

The backward-looking counterpart to `plan_work`: that skill grounds *new* work in the library; this one audits *existing* work against it. The output is **findings** (issue + the Book §X that grounds it + the fix), not a plan and not a generic bug list.

This is a *conformance* review, not a bug hunt — it checks whether the work follows the library's recommended approaches, avoids its cataloged failure modes, and respects the project's conventions. For correctness bugs and cleanups unrelated to the library, use `/code-review`.

Assumes the library is reachable (the project's `CLAUDE.md` points at it). If you can't find `MANIFEST.json`, ask the user for the library path. Read paths, commands, and conventions from `PROJECT_CONVENTIONS.md`.

## Procedure

1. **Scope the review.** What is under review — a design doc, a subsystem, a diff / PR, or an architectural decision? Identify the subsystem(s) involved and the project's actual stack (from `PROJECT_CONVENTIONS.md`; the library's patterns transfer, its specific APIs may not apply).

2. **Route to the library.**
   - `MANIFEST.json` `topic_to_books` + `rag_hints` → the relevant book(s); `SECTIONS.json` → the architecture / implementation sections.
   - Open the matching `ANTI_PATTERNS.md` and `SYMPTOMS.md` entries for the subsystem — these are the highest-value part of the review.
   - If the work embodies an architectural choice, open the matching `DECISION_TREES.md` node.

3. **Audit on three axes.**
   - **Recommended approach** — does it match, or *defensibly diverge from*, the book's recommended architecture? Divergence is legitimate when justified by the project's context; flag only **undocumented or unjustified** divergence.
   - **Anti-patterns** — does it commit any cataloged failure mode (`ANTI_PATTERNS.md` / `SYMPTOMS.md`)? These are the strongest findings.
   - **Conventions & settled decisions** — the project's conventions (from `PROJECT_CONVENTIONS.md`: coordinate system / units, naming, determinism boundary, memory/allocator discipline, reflection mechanism — whichever apply) and any `DECISION_TREES` choice contradicted without a stated reason.

4. **Check coverage honesty.** If the topic sits in `MANIFEST.json` `coverage_gaps` (status `missing` / `partial`), say the library can't fully adjudicate it — don't invent a standard.

5. **Emit findings.** Group as **Must-fix** (a cataloged anti-pattern, a correctness/determinism violation, or a contradicted convention) vs **Consider** (a defensible-but-riskier divergence, or a "the book suggests cleaner X"). For each finding:
   - **What & where** — the specific code/design point.
   - **Why** — the `Book NN §X` or `ANTI_PATTERNS.md "Name"` that grounds it (verify the citation against `SECTIONS.json`).
   - **Fix** — the concrete change, mapped to an execution skill where one applies (the project's `add_*` / `optimize_loop` / domain skills), or to `plan_work` if it needs redesign.
   - **Confidence** — real conformance issue vs. defensible divergence you're merely noting.

6. **Adapt to the project's stack.** Do not flag "you're not using <the library's example API>" if the project is on a different stack — review the *transferable* patterns, not the API choice.

## Fix Mode (`--fix`)

By default this skill is **read-only** — it reports findings and stops. Invoked with `--fix`, it then applies the **Must-fix** findings that have a mechanical, unambiguous fix, and stops short of anything needing judgment:

1. **Apply only Must-fix items with a clear mechanical fix** — a cataloged anti-pattern with a known correction, a convention violation (units, handedness, determinism, naming), a missing guard the book mandates. Skip anything whose fix is a redesign or a trade-off call.
2. **Defer the rest.** "Consider" items, defensible divergences, and any finding needing architectural change are *reported, not applied* — hand redesign items to `plan_work`.
3. **Make changes safely.** Work on a branch (never the default branch); keep each fix a focused, separately-described change tied to its finding + citation.
4. **Re-verify after fixing.** Run the definition-of-done gates that apply (`build_and_test`; `add_test` if behavior changed; `validate_headless_mode` / `snapshot_restore_test` for stateful systems; `profile_subsystem` for a perf finding). A fix that breaks a gate is reverted, not shipped.
5. **Report what changed and what was deferred** — map each applied fix to its finding + citation, and each deferred item to why (judgment / redesign / defensible).

Fix mode never silently rewrites: every applied change is grounded in a cited Must-fix finding and survives re-verification, or it is rolled back.

## Verification

- Every citation resolves against `SECTIONS.json` — no invented sections or fabricated "the book says…".
- Findings are grounded in actual ANTI_PATTERNS / book sections, not general opinion.
- Defensible divergences are listed as "Consider / noted," **not** as errors — the library is opinionated, not mandatory.
- Coverage gaps are surfaced honestly.
- Must-fix vs Consider is separated; each fix routes to a skill or to `plan_work`.

## Don't

- **Don't dogmatically flag every divergence from the library.** It is opinionated, not a law; flag genuine anti-patterns and *unjustified* divergence, not stylistic preference. (Over-applying patterns is itself an anti-pattern.)
- **Don't hunt generic bugs here** — that's `/code-review`. This skill is conformance-to-the-library.
- **Don't invent a citation** — if you can't point to a real `Book NN §X` or ANTI_PATTERNS entry, it isn't a library finding.
- **Don't apply changes unless invoked with `--fix`** — default is review-only. Even in fix mode, apply only mechanical Must-fix items; redesigns and judgment calls go to `plan_work`, never silent rewrites.
- **Don't assume the project's stack matches the library's example** — adapt to `PROJECT_CONVENTIONS.md`.
