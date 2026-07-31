---
name: understand_intent
description: "Ask-first, landscape-grounded intent elicitation for knowledge-gap asks — when the owner's request depends on domain knowledge they may not have (a new capability, a tooling/pipeline choice, buy-vs-build, anything where unstated constraints like licensing, hardware, ops burden, or recurring cost decide the outcome). Run BEFORE solutioning or filing the decision issue. Say 'help me figure out', 'I want a…', 'what are my options', or any ambitious/vague ask. Emits the intent brief: job restatement · dimensions map · criteria · consequence grid · what-matters-most · dissolve check."
---

# Understand Intent (ask what matters, then teach the landscape)

The owner's first message is *evidence about* their goal, not the spec — users with knowledge gaps ask for attempted solutions, omit constraints they don't know exist, and can't evaluate options framed as implementation attributes. This skill turns "answer the ask" into "equip an informed decision." Grounding for every move: `research/notes/intent-elicitation.md` (cite it, never a `Book §`; a *skill-grounding note* — it travels with this skill on template syncs, README › Machinery vs content). The output is the **intent brief** — six required artifacts (forced-artifact rule: prose guidance held 0/4 runs, required lines 4/4 — README › authoring); a skipped artifact must be *named* as gated off, never silently absent.

## Procedure

0. **Entropy gate + two-bucket triage** (the anti-lecturing guard). Enumerate the plausible interpretations of the ask. All of them lead to the same next action ⇒ **skip the ceremony**: state `intent brief: gated off — interpretations converge on <action>` and proceed. Otherwise sort every unknown into two buckets: *resolvable by research* (yours — investigate, never ask) vs *a preference only the owner holds* (collect for step 5; never drip them mid-work).
1. **Job restatement** *(artifact 1)*. Treat the ask as an attempted solution (XY). Establish: `When <circumstance>, you want <job>, so that <outcome> — today you do <current workaround / nothing>` — the owner is **you**: even when the job serves *their* users, state the owner's job ("you want to hand their data back to them"), never "they want". If unknown, ask "what does this get you?" / "walk me through the last time you needed this" — the last concrete instance and its cost, never "would you use X?" (hypothetical validation is banned).
2. **Dimensions map** *(artifact 2)*. Before any option: the dimensions the solution space varies along — **explicitly including the must-be baseline the owner will never state** (legality/licensing, works-on-their-hardware, data safety, recurring cost, support/ops burden, maintenance). Research the bucket-1 unknowns now. The owner's silence on a dimension means they don't know it exists, not that it doesn't matter.
3. **Criteria before options** *(artifact 3)*. One line naming the evaluation criteria (and weights, if any) — fixed *before* options appear; criteria set after seeing options get retrofitted to a favorite.
4. **Consequence grid** *(artifact 4)*. Options × **lived-consequence rows** — the questions the owner would ask about life after shipping ("who answers the support email?", "cost per month?", "what breaks when X?"), never implementation attributes. Options must be genuinely distinguishable (not three flavors of one plan); recommended default first; chain "and what does that lead to?" until each cell states real stakes.
5. **Ask, then teach.** Artifacts 1–4 to this point are **working notes** — the owner sees none of them (and no recommendation) until after the elicitation, in any medium: a rendered map or grid in visible output *is* delivery. Elicit first *(artifact 5)*: **"what matters most to you here?"** plus the batched bucket-2 preference questions — one structured question set (AskUserQuestion), never a drip. Then, once the owner has answered, deliver artifacts 1–4 as a brief the owner can actually evaluate — plain language, phone-readable, opened with the literal announce line `intent brief — <the real fork, in one clause>` (the announce-a-fork requirement in its forced-artifact form), each artifact keeping its step's mandated shape — and artifacts 2–4 each opening with their literal label at the start of a line: `dimensions:` (or `dimensions map:`), `criteria:`, `consequence grid:` (decoration like numbering/bold is fine; the label word itself leads). The labels are the delivery markers — one word each, still phone-readable — extending the same forced-artifact rule the announce and dissolve-check lines already follow (#481). The owner's stated priority, not your default weighting, breaks ties. (Ordering is EXP-06's leg-2 result: the pre-elicitation recommended default read to blind judges as anchoring, while asking first surfaced owner-held facts that fitted the brief — ask-first won 6/8. A refuted pre-registered claim, not a style choice.)
6. **Dissolve check** *(artifact 6)*. One line: `dissolve check: <a reframing that eliminates this fork: …> / <none found>`. Carry the *intent* (purpose · end state), not the plan — informed owners often pivot entirely; if a reframing serves the job better than anything on the grid, present it as an option (usually the recommended one).
7. **Route the outcome.** Real fork that is the owner's call ⇒ `decision` issue per CLAUDE.md §3 — the grid pastes into its Options section. Direction settled in-chat ⇒ slices via the normal loop, and note in the closing slice's verification to *revisit the choice after it ships* (did it do what the owner hoped?).

## Verification

- The intent brief carries all six artifacts — or the step-0 gate line naming why it was skipped.
- No question was asked that research could answer; no hypothetical-validation question; preference questions arrived batched, before the brief.
- Any resulting decision issue has consequence-framed, genuinely distinguishable options, recommended default first.
- Grounding cited as `research/notes/intent-elicitation.md` (staleness applies — re-verify past its review horizon).

## Don't

- Don't run the ceremony on a low-entropy ask — interpretations that converge on the same action mean *proceed*; lecturing is this skill's own failure mode.
- Don't deliver the brief before the owner has stated what matters — asking precedes the teaching, always.
- Don't silently fill an unstated parameter that materially affects the outcome — flag the assumption or ask (the documented default agent failure).
- Don't frame trade-offs as implementation attributes — every cell is a life-after-shipping consequence.
- Don't treat the stated ask as the spec, and don't cling to it — the dissolve check exists because the best outcome is often the pivot.
- Don't drip questions mid-execution — batch at the plan/brief level.
