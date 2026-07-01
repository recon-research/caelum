---
name: write_research_report
description: Synthesize completed experiments into a paper-style report artifact (research/reports/RR-NN) with real-link references, regenerable figures, and honest limitations. Use when the user says "write the research report", "write up the experiment", "paper artifact", "make the whitepaper", or when an experiment cluster reaches a publishable conclusion. Markdown is the source of truth; docx/pdf export is a rendering step.
---

# Write a Research Report (RR-NN)

The publishable artifact: readable by a human cold, auditable by an agent, and reproducible from the repo. Every claim maps to a figure/table/number; every frontier source is a **real fetched link**; limitations are stated plainly. Built from [the template](../../../research/reports/00_TEMPLATE.md).

## Procedure

1. **Gather the inputs:** the survey note(s), the `EXP-NN` dirs (pre-registrations, results, figures), and the tickets/decisions this report will ground. A report without a completed experiment is a survey note, not a report.
2. **Draft from the template** — `research/reports/RR-NN_<slug>.md`, with the provenance header (date · commit sha · the EXP-NN list):
   - **Abstract** — the headline numbers and their comparison, ~150 words.
   - **Background & related work** — where this sits vs prior art: frontier sources as numbered references (each fetched, each with a URL), settled context as verified `Book NN §X`. Name the closest existing work and state the difference plainly — "novel" without a comparison is marketing.
   - **Method** — reproduction-grade; reference the EXP dirs rather than duplicating them.
   - **Results** — the comparison tables (with variance; within-noise margins reported as ties) and figures referenced by relative path into `../experiments/EXP-NN_<slug>/results/` (they must exist and regenerate from committed data).
   - **Discussion & limitations** — failure modes, external validity, the lab-to-prod / sim-to-real gap; SPECULATIVE labeled.
   - **Future work** — every item carries a ticket # (file them now via `track_followups`).
   - **Reproducibility** — the cold-checkout path: commands, seeds, commit, environment, the one command that rebuilds the figures.
   - **References** — every cited source with author/title/venue/year + the real URL + accessed date. **Verify each URL was fetched** (during the survey or now); optionally run `python tools/_audit_research.py --live` from `research/` to catch dead links before shipping.
3. **Wire + validate:** `reports[]` entry in `research/MANIFEST.json` (statuses → `reported`); run the research audit (it enforces the required sections, URL-bearing references, and resolving figure paths); ship via the normal PR flow.
4. **Connect the consequences:** decisions this grounds get updated/filed (`decision` issues citing `RR-NN`); if the finding is settled enough to teach, file the graduation ticket — `build_library` folds it into the textbook (Bleeding Edge → curriculum) and the note shrinks to a delta.
5. **Optional rendering:** export to docx/pdf via the harness's document skill if a stakeholder needs one — generated FROM the markdown, clearly marked as a rendering, never edited directly.

## Verification

- The research audit passes: required sections present, every reference entry has a URL, every figure path resolves.
- Every quantitative claim in Abstract/Results traces to a table row, figure, or `results/` number.
- References were actually fetched — no memory-recalled citations; tiers/venues are accurate.
- Future-work items each have a ticket; the MANIFEST statuses are updated.
- The provenance header (commit, date, experiments) is filled — the report is pinned to the code that produced it.

## Don't

- Don't write a report without a bibliography, or a bibliography without URLs — that was the original method's #1 weakness.
- Don't overclaim: no "novel"/"state of the art" without the named comparison; no headline from a within-noise margin.
- Don't include a figure that doesn't regenerate from committed data, or numbers with no `results/` trace.
- Don't bury negative results or limitations — they're the most reusable part of the artifact.
- Don't make the docx/pdf the master — markdown in the repo is the source of truth.
- Don't leave future work unticketed (defer = file now).
