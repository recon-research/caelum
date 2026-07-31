#!/usr/bin/env python3
"""Regenerate comparison.md + metric2_wallclock.svg from the committed JSONs.

Research discipline #7: every figure regenerates from committed data. Stdlib
only (EXP-01 precedent), deterministic: output depends solely on the three
JSON files beside this script. Run from anywhere:
    python3 research/experiments/EXP-02_two-writer-protocol/results/generate_comparison.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


claims, timings, costs = load("claims.json"), load("timings.json"), load("costs.json")

# --- Metric summaries -------------------------------------------------------
m1_pass = claims["duplicated_claims"] == 0 and claims["duplicated_prs"] == 0
pair_s = timings["pair"]["wallclock_s"]
readings = timings["solo_baseline"]["readings"]
ratios = timings["metric2_ratios"]

b_total = costs["writer_B"]["session_total_usd"]
a_delta = costs["writer_A"]["run_delta_usd"]
solo_ppr = costs["solo_baseline"]["usd_per_merged_pr"]
if b_total is None:
    pair_ppr, m3_line = None, "PENDING writer B session total (owner hand-read of /cost)"
else:
    pair_ppr = round((a_delta + b_total) / 4, 2)
    if pair_ppr <= 1.25 * solo_ppr:
        m3_line = f"${pair_ppr}/PR <= 1.25x solo (${round(1.25 * solo_ppr, 2)}) -> SUPPORTED leg"
    elif pair_ppr > 1.5 * solo_ppr:
        m3_line = f"${pair_ppr}/PR > 1.5x solo (${round(1.5 * solo_ppr, 2)}) -> REFUTED leg"
    else:
        m3_line = f"${pair_ppr}/PR in the 1.25x-1.5x band -> INCONCLUSIVE leg"


def mins(s):
    return f"{s // 60}m{s % 60:02d}s"


# --- comparison.md ----------------------------------------------------------
rows = [
    ("Metric 1 -- duplicated effort (bar: zero)",
     f"{claims['duplicated_claims']} duplicated claims, {claims['duplicated_prs']} duplicated PRs "
     f"across 4 slices -> {'PASS' if m1_pass else 'FAIL'}"),
    ("Metric 2 -- wall-clock (bar: pair <= 0.7x solo)",
     f"pair {mins(pair_s)} vs solo readings naive {mins(readings['naive_span_s']['value'])} / "
     f"marginal {mins(readings['marginal_sum_s']['value'])} / active-floor {mins(readings['active_floor_s']['value'])} "
     f"-> ratios {ratios['pair_vs_naive']} / {ratios['pair_vs_marginal']} / {ratios['pair_vs_active_floor']} -> "
     "INDETERMINATE (spans supported..refuted across defensible readings; tie rule)"),
    ("Metric 3 -- $/merged-PR (bar: pair <= 1.25x solo)",
     f"solo ${solo_ppr}/PR; writer A delta ${a_delta}; writer B "
     f"{'$' + str(b_total) if b_total is not None else 'pending'} -> {m3_line}"),
]
md = ["# EXP-02 run 1 -- comparison (generated; do not hand-edit)", "",
      "Regenerate: `python3 generate_comparison.py` beside the JSONs.", "",
      "| Metric | Result |", "|---|---|"]
md += [f"| {k} | {v} |" for k, v in rows]
md += ["", f"Reviews present on all 4 PRs (writer != reviewer): "
       f"{len(claims['reviews'])}/4. Landing race: {claims['landing_race']['note']}", ""]
with open(os.path.join(HERE, "comparison.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(md))

# --- metric2_wallclock.svg --------------------------------------------------
bars = [("pair (4 slices, 2 writers)", pair_s, "#4a90d9"),
        ("solo naive span", readings["naive_span_s"]["value"], "#999999"),
        ("solo marginal sum", readings["marginal_sum_s"]["value"], "#777777"),
        ("solo active floor", readings["active_floor_s"]["value"], "#555555")]
W, BH, GAP, LX, MAXW = 640, 34, 14, 210, 380
peak = max(v for _, v, _ in bars)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{len(bars) * (BH + GAP) + 50}" '
       f'font-family="sans-serif" font-size="13">',
       '<text x="10" y="20" font-weight="bold">EXP-02 run 1 -- Metric 2 wall-clock (seconds, 4-slice batch)</text>']
for i, (label, v, color) in enumerate(bars):
    y = 36 + i * (BH + GAP)
    w = max(int(MAXW * v / peak), 2)
    svg.append(f'<text x="{LX - 8}" y="{y + BH - 12}" text-anchor="end">{label}</text>')
    svg.append(f'<rect x="{LX}" y="{y}" width="{w}" height="{BH}" fill="{color}"/>')
    svg.append(f'<text x="{LX + w + 6}" y="{y + BH - 12}">{v}s ({mins(v)})</text>')
svg.append("</svg>")
with open(os.path.join(HERE, "metric2_wallclock.svg"), "w", encoding="utf-8") as f:
    f.write("\n".join(svg) + "\n")

print("wrote comparison.md + metric2_wallclock.svg"
      + ("" if b_total is not None else "  [Metric 3 pending writer B total]"))
