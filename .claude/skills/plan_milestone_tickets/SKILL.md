---
name: plan_milestone_tickets
description: Refine a roadmap milestone (or its epic issue) into well-formed slice tickets at milestone start — library-grounded, dependency-ordered, sized, labeled, and filed on the tracker. Use when starting a new milestone, when an epic's checklist needs to become real tickets, or when the user says "plan the milestone", "break this down into tickets", "refine the epic".
---

# Plan Milestone Tickets (epic → slices, just-in-time)

Implements the **horizon rule** (`PROJECT_CONVENTIONS.md` › Tracker & Hygiene): the near milestone gets fine slice tickets; far milestones live as **one `epic` issue** holding a slice checklist, refined into real tickets only when the milestone starts — fine-grained tickets written months early are churn, not planning. Slicing is an architectural act — run it **in plan mode, with the human**, like any other plan.

## Procedure

1. **Gather the inputs** — the milestone's `docs/ROADMAP.md` section (goal / exit criterion), its `epic` issue checklist, the relevant library sections (route via `MANIFEST.json`, verify via `SECTIONS.json`), the matching `research/` notes for frontier topics, and any open `followup` issues that could fold into this milestone.
2. **Slice CI-verifiable-core-first** — order slices so the part CI can fully gate lands first and the environment-dependent integration (GPU, devices, external services, UI) lands last; every slice independently shippable with the project's operability gate green on its own.
3. **Surface the forks** — scope/depth choices, adopt-vs-build, sequencing alternatives go to the human as questions with a recommended default + citation (`plan_work` style). Do not silently decide them inside ticket text; real forks follow the decision flow (`CLAUDE.md` §3).
4. **Write each ticket** to the slice template's shape (`.github/ISSUE_TEMPLATE/slice.md`): Goal (one sentence — what exists after the merge) · Context (milestone, plan/`D-NN`, **verified** library grounding) · Acceptance criteria (verifiable; gates/oracles named) · Out of scope (deferred items filed as `followup` now). Label `slice` (+ any area labels the project uses), assign the milestone.
5. **File + cross-link** — `gh issue create` per slice; annotate the epic's checklist with the new issue numbers. If the epic is now fully refined, say so on the epic rather than closing it (it closes with the milestone).

## Output

The created issue numbers in dependency order, the updated epic, and any forks the human decided (or that went to the decision queue) along the way.

## Verification

- Every citation in every ticket resolves (`SECTIONS.json` for books; an existing file for research notes).
- Each ticket is actionable cold — a future session could start from the ticket alone.
- The epic checklist references the new ticket numbers; no slice exists only in the epic text.

## Don't

- Don't file fine-grained tickets for a far-future milestone — that's the churn the horizon rule exists to prevent.
- Don't invent `Book NN §X` citations or cite a research note as if it were a textbook section.
- Don't duplicate an open issue — check `gh issue list` first.
- Don't make the architectural slicing calls unilaterally — forks go to the human with a recommendation (or the decision queue when unattended).
