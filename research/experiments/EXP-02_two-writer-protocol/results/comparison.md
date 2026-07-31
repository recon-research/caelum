# EXP-02 run 1 -- comparison (generated; do not hand-edit)

Regenerate: `python3 generate_comparison.py` beside the JSONs.

| Metric | Result |
|---|---|
| Metric 1 -- duplicated effort (bar: zero) | 0 duplicated claims, 0 duplicated PRs across 4 slices -> PASS |
| Metric 2 -- wall-clock (bar: pair <= 0.7x solo) | pair 15m12s vs solo readings naive 83m19s / marginal 76m59s / active-floor 12m35s -> ratios 0.18 / 0.2 / 1.21 -> INDETERMINATE (spans supported..refuted across defensible readings; tie rule) |
| Metric 3 -- $/merged-PR (bar: pair <= 1.25x solo) | solo $8.39/PR; writer A delta $12.2; writer B $19.02 -> $7.8/PR <= 1.25x solo ($10.49) -> SUPPORTED leg |

Reviews present on all 4 PRs (writer != reviewer): 4/4. Landing race: 354 landed between writer A's main-position check and A's 355 merge -- 2s window, disjoint files, clean result; the bounded-race class D-330 accepted in rejecting a merge queue.
