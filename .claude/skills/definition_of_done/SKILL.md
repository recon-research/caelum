---
name: definition_of_done
description: Run the full definition-of-done verification gate for a subsystem or change — build, tests, domain checks, liveness, anti-patterns, determinism, profile, milestone exit, review cadence (adversarial_review ran when the cadence requires), merge-time checkpoint — and report pass/fail per gate with evidence before declaring work complete. Use when the user says "is this done", "verify the subsystem", "run the gates", "definition of done", or before claiming a feature is finished. Broader than build_and_test (which is only build + test).
---

# Definition Of Done (Verification Gate)

Runs the full verification gate from AGENT_GUIDE §2 against a subsystem or change, so "is this done?" is answered with evidence, not vibes. Read paths and commands from `PROJECT_CONVENTIONS.md`.

## Procedure

**Mechanical first:** `scripts/preflight.sh` (or `scripts\preflight.ps1`) runs the CI-mirrored gate set — format, lint, build, test, run-loop smoke, library audits + SECTIONS freshness, research audit, todo hygiene — locally in CI order. Run it, attach its PASS line as the evidence for gates 1–2 (and 5 and 11's mechanical half where they apply), then assess the judgment gates. CI re-verifies per the **CI posture + gating** (conventions › Operating posture): whenever the heavy matrix doesn't run on the PR — `light`, `manual`, or `full`+`advisory` (advisory runs it post-merge) — the preflight PASS line *is* the PR-time evidence for those gates; paste it in the PR and don't claim "CI green" for a job that was posture-/gating-skipped.

Run each gate that applies; record **PASS / FAIL / N/A** with evidence:

1. **Builds clean** — `build_and_test` passes; no new warnings the project treats as errors.
2. **Tests** — has tests appropriate to its kind (`add_test`: unit / integration / property / golden) and they pass.
3. **Domain checks** — the verification specific to this kind of change passes (whatever the library / `PROJECT_CONVENTIONS.md` mandates for this area — e.g. schema / data-contract validation, security or safety checks, accessibility, migration round-trips). The next two gates are the common domain checks for stateful, run-loop systems; apply them only when they fit.
4. **State round-trip** *(if the system owns state)* — `snapshot_restore_test` round-trips (mandatory where state must reset, replay, or roll back; otherwise N/A).
5. **Headless / CI-operability** *(if the system has a run loop)* — `validate_headless_mode` still passes: it initializes, runs, and shuts down with no hard dependency on a window, audio/input device, or human (otherwise N/A).
6. **Liveness** *(if the change ships a user/agent-facing feature)* — the feature demonstrably **does something** when driven through the system's real entry point (run loop, CLI, API, UI — not only its own unit tests): invoke it end-to-end and attach the observable effect. Code that builds, passes its tests, and is wired to nothing is the canonical agent-built failure mode. Tiered: **clearly inert hard-blocks** (nothing reaches it / no observable behavior change); ambiguous engagement **soft-flags** — file a `followup`, don't block. Pure refactors / internal plumbing: N/A with a one-liner.
7. **Anti-patterns & review cadence** — the cataloged failure modes for this subsystem (ANTI_PATTERNS / SYMPTOMS) are explicitly avoided or guarded. Check the **review cadence** (conventions › Operating posture): if it required `adversarial_review` for this slice (risky slice, or every-slice cadence), the review must have run with its Must-fix findings resolved — run it now if it wasn't; don't re-run a fan-out that already happened.
8. **Determinism** *(if the system requires reproducibility)* — preserved where the library requires it (fixed-step simulation, seeded generation + recorded inputs, replay); otherwise N/A.
9. **Performance** — any performance claim is backed by a profile (`profile_subsystem`), not a guess.
10. **Milestone** — if this work closes a milestone, the ROADMAP / STARTER_KIT milestone exit criterion is met; the cadence-required `adversarial_review` for the milestone exit has run with findings linked (**a milestone exit without it is a FAIL**, unless the cadence is explicitly "on request"); whenever the matrix doesn't run on PRs (`light`, `manual`, or `full`+`advisory`), run the full matrix once against the closing state (`full-ci` label or `gh workflow run ci.yml` — or push the `M<n>` tag, which triggers it anyway) and confirm it green before declaring the milestone met. A milestone exit is also the **retrospective** cadence: run [`retrospective`](../retrospective/SKILL.md) — root-cause the period's escaped defects (and any ⚠ metric in `docs/METRICS.md`) and leave a **guard** for each systemic one, not just a fix (CMMI-L5). And the **next milestone is immediately planned**: run `plan_milestone_tickets` (or `plan_work` for a one-off) and file its slice issues before picking up new work (Status `Next` must never point at issue-less placeholders).
11. **Backlog & deferrals** — completion is reflected in the tracker (the PR closes its slice issue; pre-`origin`, tick it off in `PROJECT_BACKLOG.md` instead); every deferred finding has a ticket (`track_followups`); and the diff introduces **no naked TODO/FIXME** — only `TODO(#NN)` with a filed issue. Mechanical check: the `todo hygiene` stage of `scripts/preflight.{sh,ps1}` (it mirrors the CI hygiene step exactly — same pathspecs, same regex; don't restate the pipeline here, run the stage).
12. **Merge-time checkpoint** — the `CLAUDE.md` Status line and the ROADMAP slice state reflect this merge (the standing checkpoint-at-every-merge rule).

## Output

A checklist with each gate marked PASS / FAIL / N/A and the **evidence** attached (command output, profile capture, test name). **Do not declare the work done unless every applicable gate is PASS.** A FAIL routes back to fix-then-re-run (hand redesign to `plan_work`).

## Verification

- Every applicable gate was actually executed (not assumed).
- Each result carries evidence.
- N/A gates have a one-line reason (e.g. "stateless — no run loop").

## Don't

- Don't declare "done" with an unrun or failing gate.
- Don't skip the state round-trip / headless gates when they *do* apply (stateful or run-loop systems) — those are the ones that ship broken.
- Don't pass liveness from unit tests alone — "tested" and "reachable by a real caller with an observable effect" are different claims; the gate wants the second.
- Don't accept a performance claim without a profile.
- Don't re-implement what `build_and_test`, `validate_headless_mode`, `snapshot_restore_test`, and `profile_subsystem` already do — this skill *orchestrates* them.
