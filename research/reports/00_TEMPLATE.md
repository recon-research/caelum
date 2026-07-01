# RR-NN — <report title: the claim, not the topic>

> status: draft | final · date: YYYY-MM-DD · commit: <sha> · experiments: EXP-NN<, EXP-MM> · ticket: #NN

> **This file is the template** — copy to `reports/RR-NN_<slug>.md`, add a `reports[]` entry to [`../MANIFEST.json`](../MANIFEST.json), delete this blockquote. Markdown is the **source of truth**; a docx/pdf export is a rendering step, never the master. The audit enforces: `## References` and `## Reproducibility` sections exist, every reference entry carries a URL, every figure path resolves. Style: **numbers over adjectives; every claim maps to a figure, table, or number; speculation is labeled SPECULATIVE.**

## Abstract

<~150 words: the question, the method in one sentence, the headline numbers with their comparison ("X improves metric M from A to B vs baseline C"), the caveat that matters most.>

## Background & related work

<What exists and where this sits relative to it — the section Warlock-style first drafts skip. Frontier sources cited as numbered references ([1], [2] — every one resolvable in `## References` with a real URL). Settled context cited as `Book NN §X` (verified against `SECTIONS.json`). Prior-art honesty: name the closest existing work and say plainly what's different — "novel" without a comparison is marketing.>

## Method

<Reproduction-grade: the pipeline, the representations/variants, the baseline, hyperparameters that matter (the reader should not need the code to know what was run). Reference the experiment dirs (EXP-NN) rather than duplicating their detail.>

## Results

<Tables and figures, not prose claims:>
- Comparison table(s) with variance — margins within noise are reported as ties.
- Figures referenced by relative path into `../experiments/EXP-NN_<slug>/results/` (the audit checks they exist; each regenerates from committed data + script).
- Per-claim traceability: every sentence here points at a table row, figure, or number.

## Discussion & limitations

<What the results do and do not establish; failure modes observed; external validity (synthetic vs real, scale, hardware); the sim-to-real or lab-to-prod gap stated plainly. Label speculation SPECULATIVE.>

## Future work

<Each item carries a ticket number (#NN) — future work without a ticket is a wish, not a plan (defer = file now).>

## Reproducibility

<The cold-checkout path to every number and figure: exact commands in order, seeds, commit sha, environment (hardware + key versions), where the data lives, and the one command that rebuilds the figures from data.>

## References

<Every frontier source cited above, with a REAL fetched link — no memory-recalled citations. Format:>

```
- [1] Author(s), "Title", Venue Year. https://arxiv.org/abs/XXXX.XXXXX (accessed YYYY-MM-DD)
- [2] <Org>, "Doc/Release title". https://example.com/official-doc (accessed YYYY-MM-DD)
```
