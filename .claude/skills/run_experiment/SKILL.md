---
name: run_experiment
description: Turn a theory, paper, or research-note claim into a pre-registered, reproducible experiment with measurable, plottable, comparable results in research/experiments/EXP-NN. Use when the user says "test the theory", "run an experiment", "implement the paper", "benchmark X vs Y", or a survey note's candidate experiment gets picked up. Metrics and success criteria are written BEFORE running — no post-hoc goalposts.
---

# Run a Pre-Registered Experiment

Implement and measure honestly. The two failure modes this skill kills: **cherry-picking** (defining success after seeing results) and **unreproducible numbers** (plots nobody can regenerate). Read paths/commands from `PROJECT_CONVENTIONS.md`; experiments are normal slices (ticket → branch → PR → CI).

## Procedure

1. **Ticket + branch.** The experiment is a `slice` issue referencing its source: the `notes/<note>.md` claim, the paper (`source: <URL>`), or the `D-NN` it informs.
2. **Pre-register** — create `research/experiments/EXP-NN_<slug>/EXPERIMENT.md` from [the template](../../../research/experiments/00_TEMPLATE.md) and fill **Hypothesis, Metrics & success criteria, Method, Reproducibility BEFORE running**: the falsifiable claim; the exact metrics and the pre-committed success bar; N runs + seeds (variance plan — close margins are ties); the **named baseline** (fairly tuned — beating a strawman proves nothing); what's held fixed. Commit this before results exist; it's the receipt that the goalposts never moved.
3. **Implement minimally and faithfully.** Code goes in the repo's experiment-harness path (per `PROJECT_CONVENTIONS.md`), through normal CI. When implementing a paper: follow its method as written first; deliberate deviations are listed in Method, not silently improvised. Deterministic seeds throughout (the project's reproducibility invariant applies).
4. **Run scripted, not ad hoc.** The exact commands land in Reproducibility (with seeds, commit sha, environment). N repeats where variance matters; keep **every** run's data — discarding "bad runs" is cherry-picking with extra steps.
5. **Collect into `results/`:** raw data (CSV/JSON), figures (PNG/SVG), and the **plot script that regenerates every figure from the committed data** — no orphaned images. Build the comparison table: variant vs baseline, mean ± variance; vs the paper's reported numbers where applicable, with discrepancies stated plainly.
6. **Record the outcome** against the *pre-registered* bar: supported / refuted / inconclusive — plus Failure modes & limitations (where it breaks, what wasn't tested). **Negative results are recorded with the same care** — they prevent re-litigating the idea next quarter.
7. **Wire it in:** `experiments[]` entry in `research/MANIFEST.json` (status: `experimenting` → the note's status too); run `python3 tools/_audit_research.py`; file follow-up tickets; if the outcome grounds a decision, update/file the `decision` issue citing `EXP-NN`. Ship the PR.

## Verification

- `EXPERIMENT.md` has all required sections (the audit checks) and the pre-registration was committed **before** results.
- Every figure regenerates from committed data + the committed script; every number traces to a `results/` file.
- Reproducibility names commands, seeds, commit sha, environment — a cold checkout could rerun it.
- The comparison includes variance; any margin within noise is reported as a tie, not a win.
- The outcome verdict references the pre-registered bar, not a retrofitted one.

## Don't

- **Don't define success after seeing results** — that's the cardinal sin; deviations from the plan are recorded in Results, visibly.
- Don't compare against an unnamed, untuned, or broken baseline and claim a win.
- Don't claim improvements without N runs and variance when the margin is small.
- Don't hide failed runs, prune outliers silently, or leave figures that can't be regenerated from committed data.
- Don't let experiment code bypass CI or the determinism conventions — experiments are real code.
- Don't bury a refuted hypothesis — record it; a clean refutation is a result.
