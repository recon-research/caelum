---
name: retrospective
description: Run a process retrospective + defect-prevention pass (CMMI-L5) — mine the period's escaped defects from the tracker and the metrics ledger (incl. Local telemetry and `skill-defect:` tickets), root-cause the recurring ones, and make sure every escape leaves behind a GUARD (a mechanical gate / anti-pattern / review lens / a SKILL.md diff for skill-layer defects), not just a fix. Use at a milestone exit, when a metric trips its alarm threshold — including the Local-telemetry alarms (never-invoked skill, median peak context) — or when the user says "retrospective", "retro", "root-cause analysis", "why do bugs keep escaping", "a skill keeps misfiring", "post-mortem". Closes the optimizing loop that `scripts/metrics.py` (docs/METRICS.md) opens.
---

# Retrospective (Defect-Prevention Loop)

The optimizing layer: a process that **learns from its own escapes**. The one rule — **every recurring defect leaves a guard behind it, not just a fix.** A bug that was fixed but could recur unchanged is an L5 miss; the guard is what makes the *class* of defect impossible (or loud) next time. This is how the template already grew (the flat-skill defect → the `skills-structure` CI job; TODO leaks → the commit hook). This skill makes that reflex **systematic and periodic** instead of lucky.

Read paths / conventions from `PROJECT_CONVENTIONS.md`; the metric thresholds from [`docs/METRICS.md`](../../../docs/METRICS.md).

## When to run

- **At a milestone exit** — the natural retro cadence (`definition_of_done` gate 10 calls it). Not every compaction; that's too frequent to surface patterns.
- **When a metric trips its ⚠ alarm** in `docs/METRICS.md` (escape rate, rework, decision latency, preflight↔CI divergence — and the Local-telemetry alarms: a never-invoked skill once the ledger matures, median peak context ≥85%) — a crossed threshold is a *mandatory* causal look, not a note.
- **On request** / after a notable escape (a red main, a costly post-merge bug, a reversed decision).

## Procedure

1. **Gather the period's signals** (since the last retro — use the milestone boundary or the metrics window). Mechanical first:
   - `docs/METRICS.md` — which metrics are at/over threshold? Those are the headline agenda items.
   - **Escaped defects:** `bug` issues filed *after* the merge that introduced them (`gh issue list --label bug --state all`); main-branch CI failures (`gh run list --branch main`); **decision reversals** (a `decision` answer that overruled a provisional default); review findings that *recurred* across PRs.
   - **Skill-layer signals (#48):** the **Local telemetry** section of `docs/METRICS.md` (per-skill invocation counts, the never-invoked ⚠, median peak context, compactions/wk) + open skill-defect tickets — `gh issue list --state open --search "skill-defect in:title"`. A skill nobody invokes and a skill that misfires are both process defects: the listing is paid context every session.
   - Keep it to what actually escaped a gate — green-on-first-try work is not retro material.

2. **Triage: systemic vs one-off.** Cluster the escapes by **common cause**, not by symptom. A cause that produced **one** defect and is unlikely to recur is a one-off — record it as such (step 5) and move on; don't over-process. A cause that produced **two or more**, or that *could* easily recur, is **systemic** — it gets steps 3–4.

3. **Root-cause each systemic cluster** (5-whys-lite — stop when you hit something a guard can catch). Push past the proximate bug to the process gap: *why did every gate let this through?* "The test didn't cover the empty-input case" → "nothing requires that case class" → the guard is a property test / a checklist item, not just this one test.

4. **Leave a guard — climb to the most mechanical rung that holds** (the prevention ladder; cheapest durable guard wins):
   1. **A mechanical gate** — a CI step / `scripts/preflight.*` stage / a hook / an audit assertion that fails on the defect class. Strongest: it can't be forgotten. (This is how `skills-structure` and the TODO hook were born.)
   2. **A library entry** — add the failure mode to `textbooks/reference/ANTI_PATTERNS.md` + a detectable signature to `SYMPTOMS.md`, so `plan_work`/`adversarial_review` pre-mortem against it.
   3. **A review lens** — a standing lens in `adversarial_review` (e.g. the over-engineering lens) when the defect needs judgment, not a regex.
   4. **A policy / settings tweak** — a `PROJECT_CONVENTIONS.md` rule or a `settings.json` deny (owner-authorized) when nothing else fits.
   File the guard as a ticket (`debt`/`followup`) or implement it now if cheap. **"Fixed, no guard" is the failure mode this skill exists to prevent** — a systemic escape that leaves no guard is not done.
   **Skill-layer defects get a skill-layer guard:** for a `skill-defect:` cluster, a routing miss, or a never-invoked ⚠, the guard is a SKILL.md `description`/procedure diff (or pruning the skill), shipped as a normal PR that states its before/after per the authoring rule (`.claude/skills/README.md`) — worked example: the #45 prepare_compaction flip, exactly this class of guard. When the diff adds a *rule*, write it as a forced artifact at its decision point, not mid-list prose (`README.md` › Authoring conventions).

5. **Record one-offs** — a terse "saw X once, cause Y, no guard warranted" so the next retro can spot if a "one-off" is actually recurring. One line; don't ceremony it.

6. **Feed back — here and upstream.** Apply the guard to this repo. If the lesson is **generic** (not domain-specific), it belongs in the template too: file it for `update_from_template` back-port (the template improves from every project's escapes — that's the optimizing loop closing across projects).

## Output

- A short retro record — **kept in the tracker + the milestone's ROADMAP entry, not a new doc** (the doc surface stays lean): the systemic clusters, their root cause, and the **guard now in place or ticketed (#NN)** for each. One terse paragraph per cluster.
- Updated `docs/METRICS.md` if you re-ran `scripts/metrics.py` (a guard often resets the metric it was triggered by — note the before).
- Any generic guard filed for template back-port.

## Verification

- Every **systemic** escape has a guard — implemented or ticketed — at the most mechanical rung that holds; none is "fixed, no guard."
- Every metric over its ⚠ threshold was root-caused (not just observed), and the retro names what will move it back.
- The record lives in the tracker / ROADMAP, not only in chat; generic lessons are queued for back-port.

## Don't

- **Don't stop at the fix.** A patched symptom with no guard means the class recurs — that's the one thing this skill forbids.
- Don't over-process one-offs — a single non-recurring escape gets a one-line note, not a gate. Guard the *classes*, not every incident (a noise of guards is its own anti-pattern — the over-engineering lens applies to process too).
- Don't root-cause by symptom — cluster by cause, or you'll write five guards for one gap.
- Don't invent a new doc to hold retro output — tickets + the ROADMAP milestone note already carry it (keep the doc surface lean).
- Don't run it every compaction — milestone exits + threshold trips are the cadence; more often just manufactures ceremony.
