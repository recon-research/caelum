# <Topic — the frontier question this note answers>

> reviewed: YYYY-MM-DD · tier legend: production-proven | published | experimental

<2–3 sentences of framing: what this is, and why **this project** cares — the decision (`D-NN`), slice, or experiment this survey informs. Research without a consumer is an `idea` ticket, not a note.>

> **This file is the template** — copy to `notes/<topic_slug>.md`, fill, add a `notes[]` entry + `topic_to_notes` route in [`../MANIFEST.json`](../MANIFEST.json), delete this blockquote. The audit enforces the format: tier tag + `(source: …)` + `accessed` **on the same line as the claim**.

## State of the art

<One bullet per load-bearing claim. Numbers over adjectives. Each line: the claim, the tier, the fetched source(s), the accessed date — like this (illustrative, in a code block so the audit ignores it):>

```
- <Technique X> ships in <product>, reporting <number> on <hardware/benchmark> [production-proven] (source: https://example.com/official-doc, accessed 2026-06-10)
- <Method Y> claims <number> vs <baseline> on <benchmark>; not yet replicated [published] (source: https://arxiv.org/abs/XXXX.XXXXX, accessed 2026-06-10; corroborated: https://example.com/talk)
- <Approach Z> is a community prototype; no benchmarks published [experimental] (source: https://github.com/example/repo, accessed 2026-06-10)
```

## <PROJECT_NAME> feasibility path

<What's implementable on this project's actual stack today; what's blocked and by exactly what; the incremental first slice; how it ties to existing project tech and the invariants. Cite textbook context as `Book NN §X` (verified) — but frontier claims above stay sourced, not §-cited.>

## Candidate experiments

<The testable hypotheses this survey surfaces — each a one-line pre-registration seed: hypothesis, metric, baseline. These become `EXP-NN` via `run_experiment`; file them as tickets.>

## Watch

<What to re-check, where, and roughly when (releases pages, conference cycles, a repo's issues). This is what the ~180-day re-verify looks at first.>
