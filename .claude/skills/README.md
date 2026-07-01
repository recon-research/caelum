# Skills — &lt;PROJECT_NAME&gt;

Drop-in procedures Claude Code follows when invoked (or when a request matches a skill's `description`). These are **domain-agnostic**: they read project specifics (paths, build/test commands, stack) from [`PROJECT_CONVENTIONS.md`](../../PROJECT_CONVENTIONS.md), so the same skills work on any project. Domain-specific execution skills (the recurring "add a `<thing>`" ops) are **derived during onboarding** and added here.

> **Catalog of record:** `textbooks/MANIFEST.json` `skills[]` — audited against the skills on disk by `_audit_routing.py`, so a new skill that isn't registered fails CI. This README is the human view; when you add a skill, update the MANIFEST (the audit catches you if you don't) and this page (the audit can't).

## The session loop

| Skill | When |
|-------|------|
| [onboard](onboard/SKILL.md) | "welcome back" / "let's onboard and continue" — start or resume a session. |
| [ship_pr](ship_pr/SKILL.md) | "ship it" / "land this" — the PR-gated path to main: preflight → PR → merge gate (per CI posture) → merge → checkpoint. |
| [prepare_compaction](prepare_compaction/SKILL.md) | "let's prepare for compaction" — checkpoint to the docs + tracker before context is lost. |
| [build_library](build_library/SKILL.md) | "build the library" / "write the textbooks" — author/extend `textbooks/`. |

## Setup, planning & review

| Skill | When |
|-------|------|
| [configure_project](configure_project/SKILL.md) | Inspect the repo → fill `PROJECT_CONVENTIONS.md`. |
| [update_from_template](update_from_template/SKILL.md) | "update from the template" — pull upstream improvements: machinery wholesale, content by diff, re-stamp `TEMPLATE_VERSION`. |
| [plan_work](plan_work/SKILL.md) | "plan" / "design" / "what approach" — library-grounded plan; the planning front-end. |
| [plan_milestone_tickets](plan_milestone_tickets/SKILL.md) | Milestone start — refine the epic into grounded, dependency-ordered slice tickets (the horizon rule). |
| [review_against_library](review_against_library/SKILL.md) | "audit this design vs the library" — cited Must-fix/Consider; `--fix` applies mechanical fixes. |
| [adversarial_review](adversarial_review/SKILL.md) | Before merge on a substantial change — N independent reviewers prompted to falsify claims. |
| [audit_over_engineering](audit_over_engineering/SKILL.md) | "what can we delete" / "bloat audit" — whole-repo simplification sweep; files `debt` tickets, never deletes (the repo-wide complement to adversarial_review's per-diff lens). |

## Frontier research

| Skill | When |
|-------|------|
| [research_topic](research_topic/SKILL.md) | "research X" / "state of the art" — survey online into a sourced+tiered note in `research/notes/`. |
| [run_experiment](run_experiment/SKILL.md) | "test the theory" / "benchmark X vs Y" — pre-registered, reproducible experiment (`EXP-NN`). |
| [write_research_report](write_research_report/SKILL.md) | "write up the experiment" — paper artifact (`RR-NN`) with real-link references. |

## Verification

| Skill | When |
|-------|------|
| [definition_of_done](definition_of_done/SKILL.md) | "is this done" — orchestrates the full gate with evidence. |
| [build_and_test](build_and_test/SKILL.md) | "build" / "run tests" — full build + test cycle. |
| [add_test](add_test/SKILL.md) | "add a test" — unit / integration / property / golden. |
| [snapshot_restore_test](snapshot_restore_test/SKILL.md) | State round-trip for any subsystem that owns state. |
| [validate_headless_mode](validate_headless_mode/SKILL.md) | CI gate: runs with no window / device / human. |
| [profile_subsystem](profile_subsystem/SKILL.md) | "profile" / "find slow" — capture + analyze with the project's profiler. |
| [optimize_loop](optimize_loop/SKILL.md) | "optimize" — profile-driven optimization of a hot path. |

## Build & instrument

| Skill | When |
|-------|------|
| [generate_content](generate_content/SKILL.md) | "generate with an LLM" — agentic content-gen pipeline with validation. |
| [add_agent_tool](add_agent_tool/SKILL.md) | "add an MCP / agent tool" — typed, validated, permission-filtered. |
| [add_telemetry_event](add_telemetry_event/SKILL.md) | "add telemetry" — event with schema + sampling. |

## Discipline

| Skill | When |
|-------|------|
| [track_followups](track_followups/SKILL.md) | Sweep deferred work into the tracker (run inside `prepare_compaction`). |
| [retrospective](retrospective/SKILL.md) | Milestone exit / a metric trips its alarm — root-cause escaped defects and leave a guard (CMMI-L5; consumes `docs/METRICS.md`). |

---

## Config files (NOT skills — they live at the project root)

- [`PROJECT_CONVENTIONS.md`](../../PROJECT_CONVENTIONS.md) — paths / commands / stack. **Every skill reads it first.** Fill it via `configure_project`.
- [`PROJECT_BACKLOG.md`](../../PROJECT_BACKLOG.md) — lightweight Now/Next/Blocked/Done continuity. Defers to GitHub Issues at scale.

## Authoring conventions

- **Layout is required** — each skill is a **directory** containing `SKILL.md` (`.claude/skills/<name>/SKILL.md`); flat `.md` files in `skills/` do **not** load (CI checks this). Frontmatter: `name:` must equal the directory name; `description:` carries the explicit triggers Claude reads to decide when to invoke. A skill without valid frontmatter silently fails to load. Supporting files (scripts, templates) may live beside `SKILL.md`; keep `SKILL.md` itself well under 500 lines, the load-bearing procedure in its first half.
- **Shape:** `# Title` → `## Procedure` (numbered, actionable) → `## Verification` → `## Don't`.
- **Never hard-code** project paths/commands/the example-system name — read them from `PROJECT_CONVENTIONS.md`.
- If a skill misfires (fires when it shouldn't, or is skipped when it should), tighten its `description`.
- **Mind the always-resident listing.** Each skill's `name` + `description` stays in context permanently so Claude can auto-route to it (the `SKILL.md` body loads only when invoked). Claude Code budgets ~1% of the window for the whole listing and caps each entry at 1,536 chars ([skills docs](https://code.claude.com/docs/en/skills.md)) — keep descriptions tight and lead with the trigger phrase. This template's 26 skills total ~2.4k tokens (~1.2% of a 200k window): right at the default budget and fine for now. Measure yours with `/context`; if the listing crowds out, trim descriptions or raise `skillListingBudgetFraction` in settings.
- **`disable-model-invocation: true`** removes a skill's description from that always-resident listing — but it also turns off Claude's auto-routing to the skill (it then runs *only* via an explicit `/name`, or when another skill invokes it by name). **Set it only on a skill that should never auto-trigger from plain English** — a deliberate, you-always-type-it command like [`update_from_template`](update_from_template/SKILL.md) (flagged as the worked example). Footgun: set it on an auto-trigger skill and conversational activation ("let's onboard") silently stops. The token saving is tiny (~260 tok across this template's handful of explicit-only skills), so reach for the flag to express *intent* — "this is a command, not an auto-routed capability" — not to chase budget. *(Resolves #6: cost measured, lever + footgun documented; aggressive disabling is deferred to real-downstream `/context` data, which it needs to be done safely.)*
