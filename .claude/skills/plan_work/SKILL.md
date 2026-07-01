---
name: plan_work
description: Produce a library-grounded implementation plan for a feature, subsystem, or refactor — routing through the project's reference library (MANIFEST, SECTIONS, DECISION_TREES, ANTI_PATTERNS) before any code is written. Use when the user says "plan", "design", "architect", "what's the approach for X", "how should I build X", "scope this feature", or asks which option to pick.
---

# Plan Work (Library-Grounded)

Use this when the task is to **decide and plan**, not yet to implement. The reference library is most valuable *here* — it carries the opinionated trade-offs, decision trees, and known failure modes that turn a vague idea into a grounded plan. Architectural design is ~1× leverage (the human makes the calls), so your job is to **surface options and evidence**, not to dictate.

This skill assumes the library is reachable (the project's `CLAUDE.md` points at it). If you can't find `MANIFEST.json`, ask the user for the library path before proceeding. Read paths, commands, and stack from `PROJECT_CONVENTIONS.md`.

## Procedure

1. **Classify the task.** Feature / subsystem / refactor / optimization / integration? State the goal and constraints in one or two lines — target platform, perf budget, and the project's *actual* stack from `PROJECT_CONVENTIONS.md` if it differs from the library's example system (the patterns transfer; the APIs don't).

2. **Route to the library.**
   - Query `MANIFEST.json` `topic_to_books` + `rag_hints` for the topic → candidate books.
   - Resolve the exact sections with `SECTIONS.json` (`id` / `title` / `line`) — do **not** read whole books.
   - If the task involves an architectural fork, open the matching `DECISION_TREES.md` node first — many choices are already settled there with trade-offs.
   - **Frontier topic?** (a state-of-the-art question, a post-textbook technique, or the routed book's Bleeding Edge section doesn't settle it) — route via `research/MANIFEST.json`; if unsurveyed or stale, run `research_topic` first. Frontier claims cite `research/notes/<file>.md` / `RR-NN` (sourced + tiered), **never** a `Book §`.

3. **Read narrowly.** Read only the routed sections (architecture + implementation). Capture the library's recommended option **and** the documented alternatives it compares. If exploration must be broad, delegate it to read-only subagents and keep only their conclusions in context.

4. **Pre-mortem.** Pull the relevant `ANTI_PATTERNS.md` and `SYMPTOMS.md` entries for this area *before* planning. List the known failure modes the plan must design around.

5. **Check coverage honesty.** If the topic is listed in `MANIFEST.json` `coverage_gaps` (status `missing` / `partial`), say so and cite the external source — do not fabricate library coverage.

6. **Write the plan.** Structure it:
   - **Goal & constraints** — 1–2 lines.
   - **Recommended approach** — the option you'd take and *why*, grounded in specific `Book NN §X` citations (verify each against `SECTIONS.json`).
   - **Alternatives considered** — the other options the library compares, each with the trade-off that decides between them.
   - **Failure modes to avoid** — from ANTI_PATTERNS / SYMPTOMS, with the guard for each.
   - **Implementation steps** — ordered; map each step to the execution skill that performs it (the project's `add_*` / domain skills) and the book section it follows.
   - **Staged route** — structure the steps as small, *independently verifiable* slices, each testable on its own and load-bearing toward the full solution (no throwaway scaffolding without an explicit decision). When an easier-to-test intermediate exists, schedule it as a **stepping stone to the ambitious end-state — never as a scope cut**; name what each slice proves.
   - **Verification plan** — the definition-of-done gates: `build_and_test`, `add_test`; `validate_headless_mode` / `snapshot_restore_test` for systems that own state or have a run loop; `profile_subsystem` before any performance claim.
   - **Honest leverage** — flag which steps are high-multiplier vs ~1× per `textbooks/AGENT_GUIDE.md` §5 (the canonical leverage list — don't restate it) so the human knows where to engage.
   - **Open decisions for the human** — the calls that are genuinely theirs, each classified **blocking** (hard to reverse — park the slice if unanswered) or **provisional-able** (reversible — name the default you'll proceed with, per the `CLAUDE.md` §3 protocol).
   - **Backlog** — file each planned slice as a `slice` issue (template, acceptance criteria included) linked to the ROADMAP milestone it advances, so the plan survives compaction and parked slices stay pickable. No `origin` yet? Append each slice to `PROJECT_BACKLOG.md` › Next instead — the pre-repo parking lot.

7. **Cite, don't assert.** Every recommendation carries a `Book NN §X` (or DOC) citation, verifiable via `SECTIONS.json`. Where the project is on a different stack than the library's example, port the idea, not the function signature.

## Verification

- Every citation resolves against `SECTIONS.json` — no invented sections (this is the #1 failure mode; the section index exists precisely to prevent it).
- The plan names the alternatives, not just one option.
- Failure modes are drawn from ANTI_PATTERNS / SYMPTOMS, not invented.
- Coverage gaps are surfaced honestly when the topic is thin.
- Each implementation step maps to an execution skill and a book section.

## Don't

- **Don't jump to code** — this skill ends at an approved plan; implementation is a separate step (the execution skills).
- **Don't read whole books** — route via MANIFEST / SECTIONS and read only the relevant sections.
- **Don't present one option as the only option** when the library compares several.
- **Don't claim coverage the library doesn't have** — check `coverage_gaps` first.
- **Don't dictate architecture** — surface options + evidence and let the human decide (~1× leverage).
- **Don't assume the library's example stack / conventions** if the project differs (per `PROJECT_CONVENTIONS.md`) — adapt explicitly.
