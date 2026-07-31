#!/usr/bin/env python3
# metrics.py -- the quantitative process-metrics ledger (CMMI-L4).
#
# Module shape is FLAT (no main() nesting) by design: downstreams take
# machinery wholesale, and a downstream that restructured this file found the
# upstream diffs stop applying mechanically (~150-line hand-rewire, #276).
# Keep it flat; a restructure here breaks every downstream's next sync.
#
# Writes docs/METRICS.md from the tracker + CI, queried mechanically via `gh`
# (never hand-typed). Run at each compaction checkpoint (prepare_compaction
# refreshes it). This is NOT a CI gate -- it needs gh auth + network, and a
# metric is a thermometer, not a merge condition. It FAILS SOFT: if gh is
# unreachable or a query returns nothing, the affected metric reads `n/a`
# rather than crashing the checkpoint.
#
# Five metrics, each chosen because crossing its threshold changes a decision
# (not vanity counters). The thresholds are STARTING baselines -- a process
# can't be statistically controlled until it has data (~20+ points), so treat
# them as provisional until the window fills, then calibrate per project.
#
# Plus "Per-slice cost & pace" (#255): `cost:` receipt comments on merged PRs
# (posted by ship_pr step 7 via scripts/slice_telemetry.py -- the receipt
# format's single home) aggregated into medians by slice type, with a
# drift tripwire and a doc-growth lens. TRIPWIRES, NEVER TARGETS: an alarm
# routes to a retrospective, never gates a merge -- the moment cost/slice
# becomes a score, sessions learn to split slices to game it.
#
# Plus "Local telemetry" (#46/#47): skill usage, session cost/context,
# compactions, preflight durations -- read from gitignored side-channels written
# by .claude/statusline.py and the hooks (docs/AUTOMATION.md s1-s2). gh can never
# see those, so this half is one machine's view and lands in its OWN gitignored
# file (#589 -- rationale at the write site); with no local files it degrades to
# a one-line pointer. Two artifacts, one run:
#   docs/METRICS.md          committed, gh-derived, identical from any machine
#   .claude/metrics/LOCAL.md gitignored, this box only, never shared
#
# Usage:
#   python3 scripts/metrics.py                 # write both (default 90-day window)
#   python3 scripts/metrics.py --window-days 30
#   python3 scripts/metrics.py --print         # print both to stdout, write neither
#   python3 scripts/metrics.py --plot <dir>    # also write per-slice trend SVGs to <dir>
#                                             # (on-demand, never committed -- metrics_report sends them)
#
# Single-implementation Python (like the audits/hooks) -- runs on both shells;
# no .ps1 twin. Stdlib only. cwd-independent.
import json
import subprocess
import sys
import os
import datetime
import statistics
import glob
import socket
# Windows cp1252 stdout guard (#296): gate output carries non-ASCII
# (em-dashes, section signs, file text); a cp1252-strict console mojibakes
# or crashes an otherwise-green run. Uniform across every gate script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root

# PROJECT-MIRRORED CONSTANT (#295, intake #286 -- same class as the hook EXEMPT
# list / PREFLIGHT_SHELLS / REF_EXEMPT; the update_from_template roster in
# .claude/skills/update_from_template/SYNC_REFERENCE.md names it):
# the branch prefixes whose merges are receipt-less BY DESIGN (#269's tripwire
# exemption). This must match *your* checkpoint-branch convention -- one downstream's
# had drifted to docs/checkpoint-* and the exemption its own field data
# motivated matched zero PRs, silently. A files-based (doc-only) classifier was
# rejected: genuine docs: slices DO receipt (#264), so it would silently exempt
# real slices -- the same false-negative trade #269 rejected for title prefixes.
#
# WIDENED IN #642. The single "checkpoint/" entry matched only the CURRENT
# convention, so the alarm fired on 7 merges (#634..#647) that were every one a
# doc-only checkpoint or decision-record -- 7/7 false positives, the exact
# fires-on-the-good-path failure that trains a reader to skim it (#525). The
# entries below are the branch shapes this repo has actually used for
# receipt-less merges; each is narrow enough that a genuine slice can't match:
#   checkpoint/    -- the current convention (conventions > Merge policy)
#   docs/checkpoint, docs/compaction -- the pre-#579 drift, still in-window
#   slice/decisions- -- D-NN decision-record PRs; unclaimed by design, and a
#                       real slice branch is slice/<issue#>-*, i.e. a DIGIT
#                       follows the slash, so it can never collide.
# Deliberately NOT a bare "docs/": a real docs: slice (e.g. the p-*->cae-*
# migration guide) rides docs/<slug> and MUST still owe its receipt (#264).
CHECKPOINT_PREFIXES = (
    "checkpoint/",
    "docs/checkpoint",
    "docs/compaction",
    "slice/decisions-",
)


def merged_branch_names(subjects):
    # #473: head-branch names, where local history still carries them --
    # merge-commit subjects only ("Merge pull request #N from owner/branch",
    # "Merge branch 'x'"). A squash history yields none, and the --selftest
    # zero-match reality check skips rather than guesses ("where derivable").
    names = []
    for s in subjects:
        if s.startswith("Merge pull request #") and " from " in s:
            ref = s.split(" from ", 1)[1].strip()
            if "/" in ref:
                names.append(ref.split("/", 1)[1])
        elif s.startswith("Merge branch '"):
            rest = s[len("Merge branch '"):]
            if "'" in rest:
                names.append(rest.split("'", 1)[0])
    return names

WINDOW = 90
if "--window-days" in sys.argv:
    try:
        WINDOW = int(sys.argv[sys.argv.index("--window-days") + 1])
    except (ValueError, IndexError):
        print("metrics: --window-days needs an integer", file=sys.stderr)
        raise SystemExit(2)
PRINT_ONLY = "--print" in sys.argv


def med(vals, nd=1):
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    m = statistics.median(vals)
    return round(m, nd) if nd else int(round(m))


def with_n(text, vals, n_row):
    """Annotate a per-type median that rests on fewer rows than the type's n (#621).

    `med` drops Nones, so a column's median counts only the rows that CARRIED
    that field while the row's `n` counts slices -- and the gap is structural,
    not rare: on a box whose statusline never fires every `usd` reads n/a
    (#366), and a receipt-less merge contributes nothing but its row. Live case:
    all three `evals` rows carried tok-out=n/a except PR #614's 834, so the
    table printed `| evals | 3 | ... | 834 |` -- one unrepresentative
    observation wearing a three-slice heading, which is what made #614's row
    read as a type-wide "implausibly cheap" signal.

    Silent when the counts agree (the common case) and when the cell is already
    `n/a` -- `n/a (n=0)` is noise. The wall column passes its post-#403 filtered
    list, so a parked row surfaces here too: the annotation says "this median
    saw k rows", whatever dropped the rest.
    """
    k = sum(1 for v in vals if v is not None)
    return text if k == n_row or k == 0 else f"{text} (n={k})"


# WALL MEASURES ELAPSED, NOT WORKED (#403). `wall-h` is claim->merge (receipt)
# or open->merge (fallback), so a crashed terminal, an overnight park, or a
# decision-window wait inflates it by hours against minute-scale medians -- PR
# #402 posted wall-h=7.72 for a one-line doc fix because the terminal died
# mid-commit and the session resumed 12h later. One such row a median absorbs;
# a BATCH of them (every slice merged the morning after an asleep-owner fleet
# run -- the standard operating pattern here) shifts a whole half's median and
# manufactures the wall alarm with churn flat. Rows above this threshold are
# treated as parked and excluded from PACE stats only (wall medians, the drift
# wall ratio) -- their usd/churn/fan still count: money and diff are real
# regardless of parking. 2h is ~10x the slowest real slice type's median
# (research: 10m) and well under any park (overnight >=8h); a genuine 3h
# working slice loses its pace row -- accepted: better to drop one honest
# long row than admit every parked one.
PARK_WALL_H = 2.0


def _parked(row):
    w = row.get("wall")
    return w is not None and w > PARK_WALL_H


# FLEET SLICES ARE A DIFFERENT COST REGIME (#549, D-552). A research/experiment
# slice that dispatches a subagent fleet spends an order of magnitude more than
# an ordinary engineering slice BY DESIGN -- its budget discipline lives in
# run_experiment's wave planning, not in this tripwire. Left in the cost
# medians, a burst of such slices shifts the median INDEX into the expensive
# rows even when they're a minority (the 2026-07-24 window: 4 fleet rows among
# 12 tok-measured newer rows pushed med tok-out to 2.79x while the agents
# median -- diluted by every zero-fan row -- stayed 0.0, so r_fan could never
# explain it: asymmetric density between the cost and explanation axes).
# Rows at or above this dispatch count are excluded from the COST medians
# (usd, tok-out) on both halves, the #403 shape one axis over: the alarm then
# compares ordinary slices with ordinary slices, so genuine ordinary-slice
# bloat during a burst still fires -- narrowed, never muted (the share-gate
# alternative rejected in D-552 would have muted every cost alarm whenever a
# burst carried the cost). Churn/fan/wall medians keep all rows on the
# PRINTED axes; the explained-gate's fan ratio is computed over the same
# non-fleet population as the cost medians (#558 -- otherwise a majority
# burst lifts the all-rows agents median and self-explains, muting genuine
# ordinary-slice bloat). Sub-threshold errand delegation still explains a
# rise; exclusion handles concentration. 8 sits in
# the observed gap -- errand-delegation rows measure 2-3 agents, fleet rows
# 12-48 (real receipts, PRs #488/#538 vs #505/#535/#540/#543/#546).
FAN_ROW_AGENTS = 8


def _fan_row(row):
    a = row.get("agents")
    return a is not None and a >= FAN_ROW_AGENTS


# LATE-CLAIM ROWS ARE NOT MEASUREMENTS (#617). `cost-src=late-claim` on a receipt
# means the claim snapshot postdated the PR's first commit, so usd/tok-out bound
# only the slice's tail -- #603 posted tok-out=834 where a comparable slice read
# 21.2k (~4%). Averaged in, such a row does not merely add noise: it drags the
# cost median DOWN, biasing the trend toward "we're getting cheaper" in exactly
# the window where the process was skipped, and can MUTE a real alarm (the
# selftest's #617 corpus: three late rows pull a genuine 2.19x tok-out rise to
# 1.06x). Out of the cost medians for the same reason fleet rows are (#549) --
# the value isn't comparable to the population -- while churn/wall/fan-out,
# which a late claim does not distort, still count everywhere.
def _late_claim(row):
    return bool(row.get("late_claim"))


# CHECKPOINT ROWS ARE A DIFFERENT REGIME ON PACE AND CHURN (#624, intake #622,
# reported by a downstream). Checkpoint-path merges are receipt-less BY DESIGN
# (#269), so neither of the two axes they still land on measures what the axis
# is named after: `wall` falls back to pr-open->merge (how fast a doc-only PR
# merged, not how long a slice took) and `dlines` is a ~30-line doc touch. Under
# our own merge-time-checkpoint rule they are the MAJORITY of merges, so the
# median INDEX lands inside their cluster and both axes stop describing slices.
# Two failures compound, both toward firing (a downstream's 2026-07-24 window: 40
# merges, 24 checkpoint, 60% of BOTH halves -- so not a composition-shift
# artifact): the checkpoint wall median moved 0.01h -> 0.02h, one tick of a
# 2-decimal hours field on a population carrying no signal, and printed ratio
# 2.00 -- a quantization-noise ALARM; while the genuine slice-level rise (wall
# 2.50) HAD a matching churn explanation (1.66, over the 1.5 bar) that 24
# doc-touch rows dragged to 1.05 and destroyed. Alarm manufactured and its
# refutation deleted, in one window. Out of BOTH `r_wall` and `r_churn` for the
# #403/#549/#617 reason -- the value isn't comparable to the population --
# leaving one alone re-creates #558's asymmetric-density defect one axis over
# (tried first downstream; it produces a DIFFERENTLY wrong answer, not a right
# one). Cost/fan medians need no change: receipt-less rows carry usd/tok_out/
# agents of None and med() already drops them. `is False` (not a falsy test) so
# a corpus that doesn't classify -- the selftest's constructed rows -- is
# unaffected.
def _ckpt_row(row):
    return row.get("expects_receipt") is False


# A CLAIM POSTED AT FIRST PUSH MEASURES CI, NOT THE SLICE (#657, cause #634).
# `wall-h` is claim->merge, so it only describes a slice when the claim came
# FIRST. ship_pr's nudge fires on the branch's first push, so a slice claimed
# from that prompt has a claim timestamp ~= the PR's own creation, and `wall`
# collapses onto the PR's open->merge lifetime -- it then measures CI queue +
# run + merge latency, a constant of the runner, with no slice content at all.
# Such rows cluster near the 2-decimal field's floor (0.01h = 36s).
#
# They are not noise: they pull a half's median DOWN, and their density is a
# function of PROCESS, not pace. The 2026-07-27 window (this ticket's): 8 of 17
# older wall rows were claim-at-push against 4 of 12 newer, purely because the
# claim discipline was correcting -- which printed `wall 2.50` with usd 0.49,
# tok-out 0.78 and churn 0.38 all FALLING. An alarm whose direction is set by
# how honestly the previous half was measured is measuring the ruler.
#
# `cost-src=late-claim` (#617) cannot cover this: it shipped mid-window in PR
# #619, so no earlier receipt can carry it however late its claim was (#621),
# and it gates the cost medians only -- `r_wall` never consulted it. This test
# needs no marker: it reads two timestamps every row already carries, so it
# applies RETROACTIVELY to the whole back-window and expires by itself as the
# discipline holds.
#
# Excluded from the wall RATIO only, the #624 scope (the printed per-type wall
# median is descriptive, and re-cutting it is a separate judgment). Residual,
# accepted: a genuine slice implemented in under 36s is dropped too -- a slice
# that finishes faster than its own CI run is not a data point about pace.
CLAIM_IMPL_FLOOR_H = 0.01


def _claim_at_push(row):
    # `wall - lifetime` is the implementation window: how long the slice ran
    # before its PR existed. At or below the floor, the claim rode the push.
    # Receipted rows only -- a receipt-less row's wall IS the open->merge
    # fallback by construction (it would flag every time, and #624 already
    # owns that population). Missing timestamps -> no accusation, which also
    # keeps every constructed selftest row that omits them unaffected.
    if not row.get("receipt"):
        return False
    w, c0, m0 = row.get("wall"), row.get("c_dt"), row.get("m_dt")
    if w is None or c0 is None or m0 is None:
        return False
    return w - (m0 - c0).total_seconds() / 3600 <= CLAIM_IMPL_FLOOR_H


# Drift tripwire: newer-half medians vs older-half (merge order). Cost or wall
# doubling while churn doesn't is the investigate signal -- the "hour-long slice
# that used to take ten minutes" made visible without watching every session.
#
# WORK IS NOT ONLY CHURN (#392). `usd` is a session-cost delta, so it counts
# every subagent dispatch, while Δlines counts none of them. Under the skill-eval
# admission gate (#302) that split the two apart hard: PR #386 changed 19 lines,
# dispatched 10 subagents, and cost $15.67 -- the smallest diff and the largest
# bill in its session. So the alarm fired on every fan-out-heavy slice BY
# CONSTRUCTION, and an alarm that always fires has stopped being one. Fan-out is
# read as a second churn axis: a cost rise matched by a delegation rise is
# explained, exactly as a cost rise matched by a diff rise already was.
#
# TOKENS JOIN THE COST SIDE -- tok-out ONLY (#426). On boxes where the
# statusline never fires, usd reads n/a forever (#366), so the cost-drift
# lens was simply blind there. tok-out (generation) is the unit-honest cost
# twin and alarms under the same churn/fan-explained rule. tok-in and
# tok-cache deliberately do NOT alarm: tok-in spikes with fan-out (an
# explanation-side signal, like agents), tok-cache tracks session length --
# alarming on either would rebuild #392's always-fires defect. Token counts
# are per-box units, never cross-comparable with usd; the halves comparison
# is within the same pool, same as usd's. Adoption transition is safe by
# construction: a half with no tok receipts yields a None ratio, so the
# axis arms itself only once both halves carry tok data.
#
# FLEET ROWS ARE OUT OF THE COST MEDIANS (#549, D-552) -- rationale and
# threshold at FAN_ROW_AGENTS above.
def compute_drift(slices):
    """-> (note, alarming). Pure over its inputs so --selftest can drive it."""
    if len(slices) < 8:
        return "Drift check arms at 8+ merges in scope (%d now)." % len(slices), False
    half = len(slices) // 2
    older, newer = slices[:half], slices[half:]

    def _ratio(key, rows_a=older, rows_b=newer):
        a, b = med([r.get(key) for r in rows_a], 3), med([r.get(key) for r in rows_b], 3)
        if a is None or b is None:
            return None
        if a == 0:
            # 0 -> something is real growth (the usual shape when a gate lands
            # mid-window); 0 -> 0 is flat, not undefined.
            return float("inf") if b > 0 else 1.0
        return b / a

    # Cost only: fleet rows (#549, constant above) are out of the usd/tok-out
    # medians on both halves -- their churn/fan/wall still count everywhere.
    n_fan_rows = sum(1 for r in slices if _fan_row(r))
    n_late = sum(1 for r in slices if _late_claim(r))
    o_cost = [r for r in older if not _fan_row(r) and not _late_claim(r)]
    n_cost = [r for r in newer if not _fan_row(r) and not _late_claim(r)]
    # Pace AND churn: checkpoint rows (#624) leave both axes together -- see
    # _ckpt_row for why splitting them re-creates #558.
    n_ckpt = sum(1 for r in slices if _ckpt_row(r))
    o_slice = [r for r in older if not _ckpt_row(r)]
    n_slice = [r for r in newer if not _ckpt_row(r)]
    r_usd, r_churn = _ratio("usd", o_cost, n_cost), _ratio("dlines", o_slice, n_slice)
    r_tok = _ratio("tok_out", o_cost, n_cost)
    # Pace only: parked rows (#403, constant above) are out of the wall ratio
    # but stay in every other axis of the same slice.
    n_parked = sum(1 for r in slices if _parked(r))
    # Pace only, second exclusion: claim-at-push rows (#657) measured CI
    # latency, not the slice -- see _claim_at_push for why their DENSITY, not
    # their value, is what manufactures the alarm.
    n_claimpush = sum(1 for r in slices if _claim_at_push(r))
    r_wall = _ratio("wall", [r for r in o_slice if not _parked(r) and not _claim_at_push(r)],
                    [r for r in n_slice if not _parked(r) and not _claim_at_push(r)])
    r_fan = _ratio("agents")
    # The explained-gate's fan ratio mirrors the cost population (#558): fleet
    # rows are already out of the cost medians, so their dispatches must not
    # explain an ordinary-slice cost rise -- in a majority burst the all-rows
    # agents median jumps (0 -> 16+) and would mute genuine ordinary bloat,
    # violating D-552's "narrowed, never muted". The printed fan-out axis
    # keeps all rows: it still names broad delegation shifts.
    r_fan_gate = _ratio("agents", o_cost, n_cost)
    fan_known = any(r.get("agents") is not None for r in newer)

    def _f(r):
        return "n/a" if r is None else ("inf" if r == float("inf") else "%.2f" % r)

    # Either churn axis rising with the cost explains it (fan via the
    # cost-population ratio -- #558).
    explained = (r_churn is not None and r_churn >= 1.5) or (r_fan_gate is not None and r_fan_gate >= 1.5)
    drifting = [name for name, r in (("usd", r_usd), ("tok-out", r_tok), ("wall-h", r_wall))
                if r is not None and r >= 2.0 and not explained]
    # The printed fan axis is the ALL-ROWS ratio while the gate reads the
    # ordinary-slice one (#558) -- so when they disagree, printing a bare
    # "fan-out" flatly contradicts the headline's "dispatches did not rise"
    # (observed live: `fan-out inf` beside that sentence, #570). Name the
    # population whenever the two differ; a single number when they agree.
    fan_axis = _f(r_fan_gate) if r_fan_gate is not None else _f(r_fan)
    if _f(r_fan) != _f(r_fan_gate):
        fan_axis = "%s (ordinary slices -- the gate's population; all rows %s)" % (
            _f(r_fan_gate), _f(r_fan))
    axes = "usd %s · tok-out %s · wall %s · churn %s · fan-out %s" % (
        _f(r_usd), _f(r_tok), _f(r_wall), _f(r_churn), fan_axis)
    if n_parked:
        axes += " · %d parked row(s) (wall >%gh: crash/overnight/decision-wait) excluded from wall" % (
            n_parked, PARK_WALL_H)
    if n_claimpush:
        axes += (" · %d claim-at-push row(s) (wall - pr-open->merge <=%gh: the claim rode "
                 "the first push, so wall measured CI latency not the slice, #657) excluded "
                 "from wall" % (n_claimpush, CLAIM_IMPL_FLOOR_H))
    if n_fan_rows:
        axes += " · %d fleet row(s) (agents >=%d: fleet-scale dispatch, #549) excluded from cost medians" % (
            n_fan_rows, FAN_ROW_AGENTS)
    if n_late:
        axes += (" · %d late-claim row(s) (cost-src=late-claim: the cost window opened "
                 "after the first commit, so usd/tok-out are a floor, #617) excluded "
                 "from cost medians" % n_late)
    if n_ckpt:
        axes += (" · %d checkpoint row(s) (receipt-less by design, #269: wall is the "
                 "pr-open->merge fallback and churn a doc touch, #624) excluded from "
                 "wall+churn" % n_ckpt)
    if drifting:
        caveat = ("" if fan_known else
                  " Fan-out is unmeasured for these merges (no `agents=` in their receipts), "
                  "so delegation cannot yet be ruled out as the cause -- weigh that before "
                  "reading this as bloat.")
        return (":warning: **Cost drift without churn or fan-out** -- newer-half median "
                + "/".join(drifting) + " is >=2x the older half while neither diff size nor "
                "ordinary-slice subagent dispatches rose to match (" + axes + "). Hidden-bloat "
                "candidate (journaling doc? swelling gate? context hygiene? a verification "
                "burst -- review lenses / eval re-earns cost tokens without churn, #570?) -- "
                "route to a retrospective; never fix by splitting slices to beat the "
                "number." + caveat), True
    lead = ""
    if r_fan_gate is not None and r_fan_gate >= 1.5 and r_usd is not None and r_usd >= 2.0:
        lead = ("Cost rose with delegation, not bloat -- fan-out tracked it, so no alarm (#392). ")
    return (lead + "Drift check (newer-half / older-half medians): " + axes
            + " -- alarm at >=2.0 on cost/wall while BOTH churn and fan-out stay <1.5."), False


def fnum_tok(v):
    """Suffix-aware twin of fnum for tok-* receipt values (#426). The format
    is slice_telemetry.fmt_tok's -- '171.2M', '55.7k', '421' -- plus 'n/a'
    (no transcript on the producing box) -> None. Keep in step with the
    producer; the selftest pins both directions."""
    if v is None:
        return None
    s = str(v).strip()
    mult = 1.0
    if s.endswith("k"):
        mult, s = 1_000.0, s[:-1]
    elif s.endswith("M"):
        mult, s = 1_000_000.0, s[:-1]
    try:
        return float(s) * mult
    except ValueError:
        return None


def sessions_cell(n_ledger, n_window, med_cost):
    """The Sessions-recorded table cell. An empty ledger names its cause --
    a host that never drives statusLine (the desktop app doesn't) leaves the
    column blind forever, and a bare 0 reads as "quiet week" (#508; one
    downstream ran a full milestone blind -- evidence on the ticket). Self-
    heals the moment
    snapshots appear. A ledger with rows but none in-window stays a plain 0 --
    that host works, the window was just quiet."""
    if n_ledger == 0:
        return "0 *(statusline not driven by this host -- #508)*"
    return "%d -- median cost %s" % (n_window, med_cost)


if "--selftest" in sys.argv:
    # Corpus for the fan-out-aware drift tripwire (#392). Runs offline (no gh,
    # no network) so the ops-config audit can re-prove the heuristic every
    # preflight -- the tripwire is the only part of this file with logic worth
    # regressing, and it silently mis-fired for a full session before #392.
    #
    # PROVENANCE, stated because a fixture that looks measured is a lie: the
    # `newer` rows of case 1 are the REAL receipts of the 2026-07-18 session
    # (PRs #380/#386/#389/#391 -- usd and Δlines from the posted `cost:` lines,
    # `agents` counted from the session transcript and confirmed against
    # slice_telemetry's own dry-run output). The `older` baseline is
    # CONSTRUCTED, anchored on the one measured zero-fan-out slice of that
    # session (#387: 0 dispatches, $2.91, 16 lines) -- i.e. what a pre-gate
    # slice cost before the eval admission gate (#302) started dispatching.
    def _row(usd, dlines, agents, wall=0.15, tok=None, late=False):
        return {"usd": usd, "dlines": dlines, "agents": agents, "wall": wall,
                "tok_out": tok, "late_claim": late}

    def _ckpt(dlines, wall):
        """A receipt-less checkpoint merge (#624): no usd/tok/agents by design,
        and `expects_receipt` False is what _ckpt_row keys on. Every other row
        in this corpus omits the key entirely -- which is the point of the
        `is False` test."""
        return {"usd": None, "dlines": dlines, "agents": None, "wall": wall,
                "tok_out": None, "late_claim": False, "expects_receipt": False}

    _baseline = [_row(2.91, 16, 0), _row(3.10, 22, 0), _row(2.80, 18, 0),
                 _row(3.00, 25, 0), _row(2.95, 19, 0), _row(3.05, 21, 0)]
    # All six receipts of that session, in merge order: #380 #385 #386 #387 #389 #391.
    # Median churn barely moves (20 -> 24.5, ratio 1.22) while median cost more
    # than doubles (2.98 -> 7.06) -- which is exactly why the old rule alarmed.
    _gate_era = [_row(3.00, 30, 2), _row(2.97, 14, 2), _row(15.67, 19, 10),
                 _row(2.91, 16, 0), _row(11.12, 133, 10), _row(11.88, 102, 10)]
    _bloat = [_row(9.00, 20, 0), _row(11.00, 18, 0), _row(10.00, 24, 0),
              _row(12.00, 21, 0), _row(9.50, 19, 0), _row(10.50, 23, 0)]
    _unmeasured = [dict(r, agents=None) for r in _bloat]
    # #403 corpora. wall=7.72 is PR #402's REAL receipt row -- a one-line doc
    # fix whose terminal died mid-commit, resumed 12h later. The batch walls
    # are constructed but shaped on the standard asleep-owner pattern: slices
    # claimed at night, merged next morning, every wall spanning the sleep gap.
    # usd/churn/fan sit at baseline so ONLY wall could alarm -- isolating the
    # axis under test the same way the #392 corpus isolated fan-out.
    _overnight = [_row(3.00, 20, 0, wall=9.5), _row(2.90, 18, 0, wall=11.0),
                  _row(3.10, 22, 0, wall=8.2), _row(2.95, 17, 0, wall=10.4),
                  _row(3.05, 24, 0, wall=12.1), _row(3.00, 19, 0, wall=7.72)]
    _one_crash = [_row(3.00, 20, 0, wall=0.2), _row(2.90, 18, 0, wall=0.2),
                  _row(3.10, 22, 0, wall=0.2), _row(2.95, 17, 0, wall=0.2),
                  _row(3.05, 24, 0, wall=0.2), _row(3.00, 19, 0, wall=7.72)]
    # #426 corpora: tok-out as the statusline-less cost axis. Anchors are REAL
    # receipts from this repo: PR #433 (tok-out=126.9k, agents=0, usd=n/a --
    # a mechanical guard slice) and PR #431 (tok-out=1.1M, agents=53, usd=n/a
    # -- the EXP-07 fan-out slice). usd=None on every row: these boxes never
    # price a session, which is exactly the blindness the axis closes.
    _tok_base = [_row(None, 20, 0, tok=120_000), _row(None, 18, 0, tok=130_000),
                 _row(None, 22, 0, tok=125_000), _row(None, 17, 0, tok=118_000),
                 _row(None, 24, 0, tok=127_000), _row(None, 19, 0, tok=122_000)]
    _tok_bloat = [_row(None, 20, 0, tok=260_000), _row(None, 18, 0, tok=280_000),
                  _row(None, 22, 0, tok=250_000), _row(None, 21, 0, tok=270_000),
                  _row(None, 19, 0, tok=265_000), _row(None, 23, 0, tok=255_000)]
    _tok_fanout = [_row(None, 25, 10, tok=1_100_000), _row(None, 30, 8, tok=900_000),
                   _row(None, 19, 10, tok=1_050_000), _row(None, 22, 12, tok=1_200_000),
                   _row(None, 28, 9, tok=980_000), _row(None, 24, 11, tok=1_150_000)]
    _tok_unadopted = [dict(r, tok_out=None) for r in _tok_base]
    # #549 corpus: the REAL 2026-07-24 40-merge window, verbatim in merge order
    # (usd/Δlines/agents/wall/tok-out from the posted `cost:` receipts;
    # checkpoint rows receipt-less by design, #269). Two corrections, from the
    # session's workflow manifests (`wf_*.json` agentCount -- the #547 source):
    # #543 agents 0->32 and #546 0->48, the two receipts posted before #547
    # taught the counter about Workflow-tool fan-out. The shape under test:
    # fleet rows are 5 of 26 receipt rows, the agents median stays 0.0, yet
    # med tok-out reads 2.79x -- the false alarm this exclusion retires, on
    # the exact window that fired it live.
    _w549_old = [
        _row(None, 45, None, wall=0.01), _row(17.91, 41, 3, wall=1.79, tok=62_100),
        _row(1.51, 83, 0, wall=0.01, tok=3_000), _row(8.75, 107, 0, wall=1.56, tok=18_100),
        _row(6.47, 6, 0, wall=0.35, tok=5_500), _row(None, 35, None, wall=0.01),
        _row(41.10, 162, 14, wall=1.81, tok=277_000), _row(None, 18, None, wall=0.01),
        _row(3.21, 154, 0, wall=0.06, tok=15_600), _row(3.20, 34, 0, wall=0.05, tok=9_600),
        _row(2.87, 62, 0, wall=0.04, tok=10_300), _row(None, 35, None, wall=0.01),
        _row(1.98, 14, 0, wall=0.03, tok=7_100), _row(None, 22, None, wall=0.01),
        _row(2.28, 21, 0, wall=0.06, tok=12_500), _row(5.14, 120, 0, wall=0.09, tok=23_300),
        _row(2.72, 30, 0, wall=0.04, tok=9_200), _row(None, 32, None, wall=0.01),
        _row(3.55, 18, 0, wall=0.09, tok=22_300), _row(8.10, 262, 0, wall=0.17, tok=39_100)]
    _w549_new = [
        _row(2.97, 68, 0, wall=0.04, tok=8_100), _row(None, 30, None, wall=0.01),
        _row(3.98, 182, 0, wall=0.09, tok=23_400), _row(4.64, 117, 0, wall=0.07, tok=22_100),
        _row(2.06, 4, 0, wall=0.02, tok=5_000), _row(None, 34, None, wall=0.01),
        _row(8.93, 7830, 0, wall=0.18, tok=41_200), _row(5.11, 1, 0, wall=0.03, tok=5_600),
        _row(None, 24, None, wall=0.01), _row(40.89, 1844, 36, wall=0.56, tok=310_500),
        _row(None, 23, None, wall=0.01), _row(3.78, 11, 2, wall=0.10, tok=37_300),
        _row(22.72, 1300, 12, wall=0.52, tok=159_200), _row(None, 24, None, wall=0.01),
        _row(17.20, 1463, 32, wall=0.34, tok=71_200), _row(None, 20, None, wall=0.01),
        _row(19.01, 1750, 48, wall=0.33, tok=64_900), _row(None, 28, None, wall=0.01),
        _row(3.24, 137, 0, wall=0.20, tok=46_800), _row(None, 27, None, wall=0.01)]
    # CONSTRUCTED: ordinary rows genuinely bloated (the _tok_bloat shape)
    # alongside two fleet rows -- exclusion must narrow the lens, never mute it.
    _w549_mixed_bloat = _tok_bloat[:4] + [_row(None, 25, 32, tok=1_100_000),
                                          _row(None, 30, 48, tok=1_800_000)]
    # CONSTRUCTED (#558): fleet rows concentrated in the OLDER half -- pins
    # both-halves symmetry. A newer-only-exclusion mutant reads the older cost
    # median off the fleet rows (~561k) and sees ~0.47x, silence; the correct
    # symmetric exclusion compares ordinary-vs-ordinary (~2.19x) and alarms.
    _w558_old_burst = [_row(None, 30, 0, tok=120_000), _row(None, 25, 0, tok=118_000),
                       _row(None, 28, 0, tok=122_000), _row(None, 26, 32, tok=1_000_000),
                       _row(None, 31, 40, tok=1_400_000), _row(None, 27, 48, tok=1_800_000)]
    _w558_new_bloat = [_row(None, 29, 0, tok=250_000), _row(None, 30, 0, tok=255_000),
                       _row(None, 27, 0, tok=260_000), _row(None, 28, 0, tok=265_000),
                       _row(None, 31, 0, tok=270_000), _row(None, 26, 0, tok=280_000)]
    # CONSTRUCTED (#558): a MAJORITY burst (3 fleet of 6 newer rows) alongside
    # genuinely bloated ordinary rows. The all-rows agents median jumps 0 -> 16,
    # so a gate fed the all-rows r_fan reads inf and self-explains (silence);
    # the cost-population gate sees ordinary fan flat (0 -> 0) and alarms.
    _w558_maj_burst = [_row(None, 29, 0, tok=250_000), _row(None, 30, 0, tok=260_000),
                       _row(None, 27, 0, tok=280_000), _row(None, 28, 32, tok=1_100_000),
                       _row(None, 31, 36, tok=1_500_000), _row(None, 26, 48, tok=1_800_000)]

    # #549 follow-through: the #392 explained-gate still owns SUB-threshold
    # delegation (errand scale, agents < FAN_ROW_AGENTS). Constructed: cost
    # doubles while dispatches rise 0 -> 5-7 per slice, all below the fleet
    # cutoff, so nothing is excluded and r_fan explains the rise.
    _errand_del = [_row(6.10, 30, 5), _row(6.30, 14, 6), _row(7.10, 19, 7),
                   _row(5.90, 16, 5), _row(6.80, 33, 6), _row(6.50, 22, 7)]

    # #617 corpus: three late-claim rows beside three genuinely bloated ones.
    # 834 is #603's REAL posted tok-out -- the receipt this ticket came from.
    # Averaged in, the near-zero rows pull the newer median from 270k to 130.6k
    # and a 2.19x rise reads as 1.06x: the alarm is MUTED, not merely noisy.
    # That suppression is the reason for the exclusion, so it is what the case
    # asserts (drop the _late_claim filter in compute_drift and this goes green
    # -- i.e. silent -- which is how the corpus bites).
    _tok_late_masked = [_row(None, 20, 0, tok=260_000), _row(None, 18, 0, tok=270_000),
                        _row(None, 22, 0, tok=280_000),
                        _row(None, 21, 0, tok=834, late=True),
                        _row(None, 19, 0, tok=1_100, late=True),
                        _row(None, 23, 0, tok=950, late=True)]

    # #624 corpora (intake #622). Shape of a downstream's real 2026-07-24 window:
    # checkpoint rows are the MAJORITY and sit in both halves (60/60), so this
    # is not a composition shift. Their wall moves one quantization tick
    # (0.01 -> 0.02h = 36s -> 72s) and their churn is a doc touch.
    _w624_ckpt_old = [_ckpt(28, 0.01), _ckpt(29, 0.01), _ckpt(30, 0.01),
                      _ckpt(31, 0.01), _ckpt(32, 0.01), _ckpt(33, 0.01)]
    _w624_ckpt_new = [_ckpt(24, 0.02), _ckpt(25, 0.02), _ckpt(26, 0.02),
                      _ckpt(27, 0.02), _ckpt(27, 0.02), _ckpt(28, 0.02)]
    # Slice rows: a REAL pace rise (wall 0.20 -> 0.50 = 2.50x) that churn
    # genuinely explains (18.5 -> 30.5 = 1.65x, over the 1.5 bar). All-rows
    # medians destroy both facts at once: wall reads 0.01 -> 0.02 (ratio 2.00,
    # the quantization alarm) and churn reads 28.5 -> 27.5 (0.96 -- the
    # explanation deleted). Drop the _ckpt_row filter and this case goes RED.
    _w624_slice_old = [_row(3.00, 16, 0, wall=0.18), _row(2.95, 18, 0, wall=0.19),
                       _row(3.05, 19, 0, wall=0.21), _row(2.90, 20, 0, wall=0.22)]
    _w624_slice_new = [_row(3.02, 28, 0, wall=0.45), _row(2.98, 30, 0, wall=0.48),
                       _row(3.06, 31, 0, wall=0.52), _row(2.94, 33, 0, wall=0.55)]
    # Same checkpoint mass, same pace rise -- but churn FLAT (18.5 -> 18.5), so
    # nothing explains it. Without this case the fix would be indistinguishable
    # from a mute: it is the D-552 "narrowed, never muted" bar, one axis over.
    _w624_bloat_new = [_row(3.02, 17, 0, wall=0.45), _row(2.98, 18, 0, wall=0.48),
                       _row(3.06, 19, 0, wall=0.52), _row(2.94, 21, 0, wall=0.55)]
    # The WALL half of the both-axes claim. Slices flat on every axis while the
    # checkpoint tick still reads 2.00: the only honest verdict is silence.
    # Needed because the two cases above do not discriminate a CHURN-ONLY
    # exclusion -- under that mutation the bloat case still alarms, but off the
    # doc-touch quantization tick rather than the slice rows, i.e. green for the
    # wrong reason. Mutation-checked: churn-only and no-exclusion both go red
    # here, which is what makes "#558 one axis over" a tested claim.
    _w624_flat_new = [_row(3.02, 16, 0, wall=0.18), _row(2.98, 18, 0, wall=0.19),
                      _row(3.06, 19, 0, wall=0.21), _row(2.94, 20, 0, wall=0.22)]

    # #657 corpus. `_cp` builds a RECEIPTED row with real open/merge stamps --
    # the two fields _claim_at_push reads. life=0.01h (36s) is the observed CI
    # latency here, so wall=0.01 is a claim that rode the first push and
    # wall=0.10 is a slice with a real implementation window in front of it.
    _T0 = datetime.datetime(2026, 7, 27, tzinfo=datetime.timezone.utc)

    def _cp(wall, life=0.01, dlines=20):
        return {"usd": None, "dlines": dlines, "agents": 0, "wall": wall,
                "tok_out": None, "late_claim": False, "receipt": True,
                "c_dt": _T0, "m_dt": _T0 + datetime.timedelta(hours=life)}

    # The live 2026-07-27 shape: claim-at-push rows are DENSE in the older half
    # (6 of 8) and sparse in the newer (1 of 8) because the claim discipline was
    # correcting, while slice pace is genuinely FLAT (0.10 both halves). All-rows
    # medians read 0.01 -> 0.10 = 10x and alarm off the process change alone.
    # Drop the _claim_at_push filter and this case goes RED.
    _w657_old = [_cp(0.01)] * 6 + [_cp(0.10), _cp(0.10)]
    _w657_new = [_cp(0.01)] + [_cp(0.10)] * 7
    # Same densities, but the real slices genuinely 2.5x (0.10 -> 0.25) with
    # churn flat. The D-552 "narrowed, never muted" bar: an over-greedy filter
    # (or one that drops the axis entirely) reads None and goes silent -- red.
    _w657_bloat_new = [_cp(0.01)] + [_cp(0.25)] * 7

    _cases = [
        # (name, slices, must_alarm, must_contain)
        # Since #549 this corpus resolves one step earlier: its 10-dispatch rows
        # are fleet-scale (>= FAN_ROW_AGENTS), so exclusion retires the cost
        # rise before the explained-gate is consulted. Same verdict, new
        # mechanism -- the gate itself is covered by the errand-scale case below.
        ("fan-out explains the cost rise -- no alarm (the #392 regression: #386 "
         "was 19 lines, 10 dispatches, $15.67)", _baseline + _gate_era, False, "3 fleet row(s)"),
        ("errand-scale delegation (below the fleet cutoff) still explains a "
         "cost rise via the #392 gate -- no alarm (#549)",
         _baseline + _errand_del, False, "delegation"),
        ("cost rose with neither churn nor fan-out -- genuine bloat still alarms",
         _baseline + _bloat, True, "Hidden-bloat candidate"),
        ("fan-out unmeasured (receipts predating `agents=`) -- still alarms, "
         "but says the cause cannot be ruled out", _baseline + _unmeasured, True,
         "Fan-out is unmeasured"),
        ("late-claim rows cannot mute a genuine tok-out rise -- they leave the "
         "cost medians like fleet rows (#617)", _tok_base + _tok_late_masked, True,
         "late-claim row(s)"),
        ("a checkpoint-MAJORITY window cannot manufacture the wall alarm: the "
         "receipt-less rows' quantization tick (0.01->0.02h) is not a pace "
         "signal, and their doc-touch churn must not delete the real rise's "
         "explanation (#624)",
         _w624_ckpt_old + _w624_slice_old + _w624_ckpt_new + _w624_slice_new,
         False, "checkpoint row(s)"),
        ("identical checkpoint mass with the slice rows genuinely bloated and "
         "churn flat -- still alarms, so #624 is a narrowing and not a mute "
         "(the D-552 bar, one axis over)",
         _w624_ckpt_old + _w624_slice_old + _w624_ckpt_new + _w624_bloat_new,
         True, "Hidden-bloat candidate"),
        ("slice rows flat on every axis while the checkpoint tick alone reads "
         "2.00x: the wall axis must not be measuring the doc-touch cluster "
         "(#624 -- the case a churn-only exclusion fails)",
         _w624_ckpt_old + _w624_slice_old + _w624_ckpt_new + _w624_flat_new,
         False, "checkpoint row(s)"),
        ("under 8 merges the check stays disarmed", _baseline, False, "arms at 8+"),
        ("a parked batch (overnight walls, flat cost/churn/fan) cannot "
         "manufacture the wall alarm (#403)", _baseline + _overnight, False,
         "parked row(s)"),
        ("one crashed row among normal ones: median absorbs it, note names "
         "the exclusion (#402's wall-h=7.72)", _baseline + _one_crash, False,
         "1 parked row(s)"),
        ("tok-out doubled with churn+fan flat on a statusline-less box -- "
         "the usd-blind bloat now alarms (#426)", _tok_base + _tok_bloat, True,
         "tok-out"),
        ("tok-out rose with fan-out (the #431 shape: 1.1M tok-out, double-digit "
         "dispatches) -- explained, no alarm (#426)", _tok_base + _tok_fanout,
         False, "Drift check"),
        ("adoption transition: older half carries no tok receipts -- the axis "
         "stays dark (None ratio), never a false alarm (#426)",
         _tok_unadopted + _tok_bloat, False, "tok-out n/a"),
        ("a research burst (fleet rows a minority, agents median 0, med tok-out "
         "2.79x) no longer trips the cost alarm -- the REAL 2026-07-24 window "
         "(#549)", _w549_old + _w549_new, False, "5 fleet row(s)"),
        ("ordinary-slice bloat DURING a burst still alarms -- exclusion narrows "
         "the lens, never mutes it (#549)", _tok_base + _w549_mixed_bloat, True,
         "Hidden-bloat candidate"),
        ("fleet rows concentrated in the OLDER half: symmetric exclusion still "
         "alarms on newer ordinary bloat -- a newer-only exclusion goes silent "
         "(#558)", _w558_old_burst + _w558_new_bloat, True, "Hidden-bloat candidate"),
        ("MAJORITY burst with ordinary bloat riding along: the explained-gate "
         "reads fan over the cost population, so the burst cannot self-explain "
         "the ordinary rows' rise (#558, D-552 'narrowed, never muted')",
         _tok_base + _w558_maj_burst, True, "Hidden-bloat candidate"),
        # #570: same fixture, different claim. When the two fan populations
        # disagree, the note must SAY which one its headline is about -- a bare
        # `fan-out inf` printed beside "dispatches did not rise" reads as the
        # note contradicting itself (observed live on the 2026-07-24 window).
        ("a majority burst makes the two fan populations disagree: the note "
         "labels the gate's population instead of printing a bare contradicting "
         "ratio (#570)", _tok_base + _w558_maj_burst, True,
         "(ordinary slices -- the gate's population; all rows "),
        # #657: the alarm must not be driven by how honestly the older half
        # was measured. Claim-at-push density falling 6/8 -> 1/8 over flat pace.
        ("claim-at-push rows thin out while pace is flat: no alarm, and the "
         "note names the exclusion (#657)", _w657_old + _w657_new, False,
         "claim-at-push row(s)"),
        ("a genuine 2.5x pace rise still fires with the same claim-at-push "
         "density (#657 narrowed, never muted)", _w657_old + _w657_bloat_new,
         True, "wall-h"),
    ]
    _fails = []
    for _name, _sl, _want, _needle in _cases:
        _note, _alarm = compute_drift(_sl)
        if _alarm != _want:
            _fails.append(f"FAIL [{_name}]: alarm={_alarm}, expected {_want}")
        elif _needle not in _note:
            _fails.append(f"FAIL [{_name}]: note missing {_needle!r} -> {_note[:120]}")
        else:
            print(f"ok   {_name}")
    # #426: pin fnum_tok to the producer's formats (slice_telemetry.fmt_tok:
    # M / k / plain; 'n/a' when the box had no transcript). A drifted parser
    # silently zeroes the tok axis, so both directions are corpus-pinned.
    _tok_parse = (("171.2M", 171_200_000.0), ("55.7k", 55_700.0),
                  ("421", 421.0), ("n/a", None), (None, None))
    for _s, _want_v in _tok_parse:
        _got = fnum_tok(_s)
        if _got != _want_v:
            _fails.append(f"FAIL fnum-tok {_s!r}: got {_got!r}, want {_want_v!r}")
        else:
            print(f"ok   fnum-tok {_s!r} -> {_got!r}")
    # #508: an empty sessions ledger names its cause instead of a bare 0.
    _sess_cases = ((0, 0, "n/a", "0 *(statusline not driven by this host -- #508)*"),
                   (3, 0, "n/a", "0 -- median cost n/a"),
                   (5, 2, "$1.00", "2 -- median cost $1.00"))
    for _nl, _nw, _mc, _want_s in _sess_cases:
        _got_s = sessions_cell(_nl, _nw, _mc)
        if _got_s != _want_s:
            _fails.append(f"FAIL sessions-cell ({_nl},{_nw}): got {_got_s!r}, "
                          f"want {_want_s!r}")
        else:
            print(f"ok   sessions-cell ({_nl},{_nw}) -> {_got_s!r}")
    # #473: pin the branch-name extractor (the zero-match reality check's
    # input side; the reality check itself is warn-not-fail below).
    _mb_cases = ((["Merge pull request #5 from owner/checkpoint/2026-07-01"],
                  ["checkpoint/2026-07-01"]),
                 (["Merge branch 'checkpoint/2026-07-02'"], ["checkpoint/2026-07-02"]),
                 (["checkpoint: squash subject (#12)"], []),
                 ([], []))
    for _i, (_subj, _want_n) in enumerate(_mb_cases):
        _got_n = merged_branch_names(_subj)
        if _got_n != _want_n:
            _fails.append(f"FAIL merged-branch-names case {_i}: got {_got_n!r}, "
                          f"want {_want_n!r}")
        else:
            print(f"ok   merged-branch-names case {_i} -> {_got_n!r}")
    # #621: a median must not wear a bigger n than the rows that backed it.
    # Case 2 is the live shape -- PR #614's tok-out=834 was the only one of
    # three `evals` rows carrying the field. Both suppression branches are
    # pinned: drop the `k == n_row` arm and case 0 goes RED (every cell would
    # grow a redundant tag), drop the `k == 0` arm and case 3 goes RED
    # (`n/a (n=0)`).
    _wn_cases = (("$1.00", [1.0, 2.0, 3.0], 3, "$1.00"),
                 ("834", [None, None, 834.0], 3, "834 (n=1)"),
                 ("1m", [0.02, 0.01], 3, "1m (n=2)"),
                 ("n/a", [None, None, None], 3, "n/a"))
    for _i, (_txt, _vals, _nr, _want_w) in enumerate(_wn_cases):
        _got_w = with_n(_txt, _vals, _nr)
        if _got_w != _want_w:
            _fails.append(f"FAIL with-n case {_i}: got {_got_w!r}, want {_want_w!r}")
        else:
            print(f"ok   with-n case {_i} -> {_got_w!r}")
    # #473 reality check, warn-not-fail: CHECKPOINT_PREFIXES vs the merged
    # branch names this repo's history still carries. Local git only -- the
    # offline (no-network) contract above holds; a drifted mirror means the
    # receipt exemption matches zero PRs, silently (#295/#345 -- 3rd
    # recurrence). Fail-open: a warn layer never wedges the audit.
    try:
        _r = subprocess.run(["git", "log", "--format=%s", "-n", "300", "--merges"],
                            capture_output=True, text=True, timeout=15,
                            encoding="utf-8", errors="replace")
        _names = merged_branch_names(_r.stdout.splitlines()) if _r.returncode == 0 else []
    except Exception:
        _names = []
    if not _names:
        print("ok   zero-match check (#473): no merged branch names derivable "
              "(squash history) -- skipped")
    elif any(n.startswith(CHECKPOINT_PREFIXES) for n in _names):
        print("ok   zero-match check (#473): CHECKPOINT_PREFIXES matches live "
              "merged branch names")
    else:
        print(f"WARN zero-match (#473): CHECKPOINT_PREFIXES {CHECKPOINT_PREFIXES!r} "
              f"matched none of {len(_names)} derivable merged branch names -- if "
              "this project merges checkpoint PRs, the mirror has drifted and the "
              "receipt exemption is inert.")
    for _f in _fails:
        print(_f)
    _total = (len(_cases) + len(_tok_parse) + len(_sess_cases) + len(_mb_cases)
              + len(_wn_cases))
    print(f"metrics --selftest: {_total - len(_fails)}/{_total} cases pass "
          "(drift + fnum-tok + sessions-cell + merged-branch-names + with-n)")
    raise SystemExit(1 if _fails else 0)

PLOT_DIR = None
if "--plot" in sys.argv:
    try:
        PLOT_DIR = sys.argv[sys.argv.index("--plot") + 1]
    except IndexError:
        print("metrics: --plot needs a directory", file=sys.stderr)
        raise SystemExit(2)

today = datetime.date.today()
cutoff = today - datetime.timedelta(days=WINDOW)


def gh_json(args):
    """Run a gh command; return parsed JSON, or None on ANY failure (fail-soft)."""
    try:
        r = subprocess.run(["gh"] + args, capture_output=True, text=True, timeout=90,
                           encoding="utf-8", errors="replace")
    except Exception:
        return None
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout) if r.stdout.strip() else []
    except json.JSONDecodeError:
        return None


def in_window(iso):
    """True if an ISO-8601 timestamp falls within [cutoff, today]."""
    d = parse_date(iso)
    return d is not None and d >= cutoff


def parse_date(iso):
    if not iso:
        return None
    try:
        return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).date()
    except (ValueError, AttributeError):
        return None


def parse_dt(iso):
    """Full-resolution twin of parse_date (wall-clock math needs hours, not days)."""
    if not iso:
        return None
    try:
        return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def labelset(item):
    return {lb.get("name", "") for lb in item.get("labels", [])}


def pct(numer, denom):
    """A rate as a string, or n/a when there's no denominator (fresh project)."""
    if not denom:
        return None
    return numer / denom


# --- Pull the raw data (each independently fail-soft) ---
prs = gh_json(["pr", "list", "--state", "merged", "--limit", "300",
               "--json", "number,title,mergedAt,labels"])
issues = gh_json(["issue", "list", "--state", "all", "--limit", "500",
                  "--json", "number,title,labels,createdAt,closedAt"])
runs = gh_json(["run", "list", "--event", "pull_request", "--limit", "400",
                "--json", "conclusion,createdAt"])

gh_alive = not (prs is None and issues is None and runs is None)
prs = prs or []
issues = issues or []
runs = runs or []

# --- Compute the five metrics ---
merged = [p for p in prs if in_window(p.get("mergedAt"))]
n_merged = len(merged)

# 1. Throughput -- merged PRs per week (trend, no threshold).
throughput = round(n_merged / (WINDOW / 7), 1) if n_merged else 0.0

# 2. Defect escape rate -- bugs filed in-window / slices merged in-window.
bugs = [i for i in issues if "bug" in labelset(i) and in_window(i.get("createdAt"))]
escape = pct(len(bugs), n_merged)

# 3. Rework rate -- merged PRs that are themselves fixes / total merged.
#    Proxy: title starts with fix:/bug:/hotfix:, or carries a bug/debt label.
def is_rework(p):
    t = p.get("title", "").lower()
    return (t.startswith(("fix:", "bug:", "hotfix:"))
            or bool(labelset(p) & {"bug", "debt"}))
rework = pct(sum(1 for p in merged if is_rework(p)), n_merged)

# 4. Decision latency -- median days a `decision` issue stays open (closed in-window).
dlat = []
for i in issues:
    if "decision" in labelset(i) and i.get("closedAt") and in_window(i.get("closedAt")):
        o, c = parse_date(i.get("createdAt")), parse_date(i.get("closedAt"))
        if o and c:
            dlat.append((c - o).days)
decision_latency = round(statistics.median(dlat), 1) if dlat else None

# 5. Preflight<->CI divergence (proxy) -- fraction of PR CI runs that went red.
#    A faithful preflight (run before every push) keeps this ~0; a climb means
#    preflight was skipped OR it isn't mirroring CI (an environment gap).
#    Caveat: it conflates those two causes -- read it as a fidelity smoke alarm.
runs_w = [r for r in runs if in_window(r.get("createdAt")) and r.get("conclusion")]
red = [r for r in runs_w if r.get("conclusion") == "failure"]
divergence = pct(len(red), len(runs_w))

# --- Per-slice cost & pace (#255) -- receipts + tracker; cross-machine truth.
# Receipts are `cost:` comments on merged PRs (format single-homed in
# scripts/slice_telemetry.py). PRs without one (pre-receipt history, or a
# receipt that failed to post) fall back to pr-open->merge wall and no usd.
recent = gh_json(["pr", "list", "--state", "merged", "--limit", "40",
                  "--json", "number,title,mergedAt,createdAt,additions,deletions,changedFiles,comments,headRefName"]) or []


def parse_receipt(comments):
    rec = None
    for c in comments or []:
        b = (c.get("body") or "").strip()
        if b.startswith("cost: "):
            rec = dict(t.split("=", 1) for t in b[6:].split() if "=" in t)
    return rec  # the last receipt wins (a re-post supersedes)


def fnum(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


slices = []
for p in sorted(recent, key=lambda p: p.get("mergedAt") or ""):
    if not in_window(p.get("mergedAt")):
        continue
    rec = parse_receipt(p.get("comments")) or {}
    title = p.get("title", "")
    typ = title.split(":", 1)[0].strip().lower() if ":" in title else "?"
    wall = fnum(rec.get("wall-h"))
    if wall is None:
        c0, m0 = parse_dt(p.get("createdAt")), parse_dt(p.get("mergedAt"))
        wall = round((m0 - c0).total_seconds() / 3600, 2) if c0 and m0 else None
    slices.append({"n": p.get("number"), "type": typ, "wall": wall,
                   "usd": fnum(rec.get("usd")), "ci": fnum(rec.get("ci-runs")),
                   # #426: tok-out is the unit-honest cost twin on boxes whose
                   # statusline never fires (usd=n/a; producer side: #366).
                   # tok-in / tok-cache stay receipt-only by judgment -- see
                   # compute_drift's header.
                   "tok_out": fnum_tok(rec.get("tok-out")),
                   # #392: subagent dispatches. `usd` is a session delta and so
                   # includes every dispatch; Δlines sees none of them. Without
                   # this the drift tripwire reads all delegation as bloat.
                   "agents": fnum(rec.get("agents")),
                   "dlines": (p.get("additions") or 0) + (p.get("deletions") or 0),
                   "receipt": bool(rec),
                   # #333 review-tripwire inputs: session identity from the
                   # receipt's by=, the PR's open..merge interval, and whether
                   # any comment is a fleet `review:` marker (conventions >
                   # Concurrent writers > Fleet protocol).
                   "by": rec.get("by"),
                   "c_dt": parse_dt(p.get("createdAt")), "m_dt": parse_dt(p.get("mergedAt")),
                   "reviewed": any((c.get("body") or "").lstrip().startswith("review:")
                                   for c in (p.get("comments") or [])),
                   # Checkpoint-path merges (conventions > Right-sized slices:
                   # doc-only checkpoint/<date> branch + PR) never carry a receipt
                   # by design -- classify by BRANCH, not title prefix: titles are
                   # free-form per repo, and real docs:/ops: slices do receipt
                   # (#269, intake #268 -- 5 of a downstream's 6 tripwire flags were
                   # checkpoint PRs drowning the one genuine miss). Prefix set is
                   # the project-mirrored CHECKPOINT_PREFIXES constant (#295).
                   # #425: keep the branch itself -- the receipt-less alarm prints
                   # it per flagged PR so a reader can tell a skill-skip from a
                   # checkpoint branch outside CHECKPOINT_PREFIXES without a hunt.
                   "branch": p.get("headRefName") or "?",
                   "expects_receipt": not (p.get("headRefName") or "").startswith(CHECKPOINT_PREFIXES)})


def fmt_val(v, prefix=""):
    return f"{prefix}{v}" if v is not None else "n/a"


def fmt_wall(v):
    """Adaptive: fast loops live in minutes, long slices in hours."""
    if v is None:
        return "n/a"
    return f"{v * 60:.0f}m" if v < 1 else f"{v:.1f}h"


def fmt_tok(v):
    """Render a token count back into the producer's compact form (#426)."""
    if v is None:
        return "n/a"
    if v >= 1_000_000:
        return f"{v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"{v / 1_000:.1f}k"
    return str(int(v))


def spark(vals):
    """Unicode sparkline; None renders as a middle dot (no data, not zero)."""
    marks = "▁▂▃▄▅▆▇█"
    nums = [v for v in vals if v is not None]
    if not nums:
        return "n/a"
    lo, hi = min(nums), max(nums)
    return "".join("·" if v is None else
                   (marks[0] if hi == lo else marks[round((v - lo) / (hi - lo) * 7)])
                   for v in vals)


by_type = {}
for s in slices:
    by_type.setdefault(s["type"], []).append(s)
# Lump rare prefixes into "(other)": a median over n<3 is noise, and the
# prefix vocabulary is free-form per repo -- the big types are the signal.
lumped = {}
for typ, rows_t in by_type.items():
    lumped.setdefault(typ if len(rows_t) >= 3 else "(other)", []).extend(rows_t)
slice_rows = []
for typ, rows_t in sorted(lumped.items(), key=lambda kv: -len(kv[1])):
    n_row = len(rows_t)
    # Each column's backing list is kept so with_n can report how many rows
    # actually carried the field (#621) -- `n` alone overstates every column
    # that n/a's out for a whole box class.
    c_wall = [r["wall"] for r in rows_t if not _parked(r)]
    c_usd = [r["usd"] for r in rows_t]
    c_tok = [r["tok_out"] for r in rows_t]
    c_dl = [r["dlines"] for r in rows_t]
    c_ag = [r["agents"] for r in rows_t]
    c_ci = [r["ci"] for r in rows_t]
    slice_rows.append("| %s | %d | %s | %s | %s | %s | %s | %s |" % (
        typ, n_row,
        with_n(fmt_wall(med(c_wall, 2)), c_wall, n_row),
        with_n(fmt_val(med(c_usd, 2), "$"), c_usd, n_row),
        with_n(fmt_tok(med(c_tok, 0)), c_tok, n_row),
        with_n(fmt_val(med(c_dl, 0)), c_dl, n_row),
        with_n(fmt_val(med(c_ag, 0)), c_ag, n_row),
        with_n(fmt_val(med(c_ci, 0)), c_ci, n_row)))

drift_note, _drift_alarming = compute_drift(slices)

n_receipts = sum(1 for s in slices if s["receipt"])
# Coverage is over receipt-EXPECTED merges only (#642): counting checkpoint-path
# merges in the denominator depressed the figure (17/40) against a target only
# the exempt-excluded set can ever reach, making a healthy session read as ~40%.
n_expected = sum(1 for s in slices if s["expects_receipt"])

# guard: #263 -- receipts-coverage tripwire. A `cost:` receipt is ship_pr's
# skill-step-backed artifact: hooks and scripts fire on their own, but a skill
# step fires only if the skill was invoked -- a session hand-driving gh skips it
# silently (field failure: a downstream, 2026-07-15, two receipt-less merges post-sync).
# Once receipts exist in scope, every later receipt-expected merge without one
# is that signal (checkpoint-path merges are exempt -- see expects_receipt
# above; refined by #269 after the tripwire's first field run flagged 5
# checkpoint PRs against 1 true positive). Tripwire, never a target: the fix
# is a retrospective (usually a SKILL.md / routing diff), never retroactive
# receipts posted to quiet the number.
# Retire-when: same condition as the #263 routing reminders.
first_r = next((i for i, s in enumerate(slices) if s["receipt"]), None)
missing = ([s for s in slices[first_r:] if s["expects_receipt"] and not s["receipt"]]
           if first_r is not None else [])
if missing:
    # #425: name the branch per flagged PR and keep the cause sentence neutral --
    # the bare-number form sent a downstream (their tracker's #566) hunting the wrong layer
    # and nearly writing off a working guard. The branch distinguishes the two
    # causes this alarm can't tell apart: a session below `ship_pr` (steps 0/7
    # skipped) vs a checkpoint merged outside CHECKPOINT_PREFIXES (#295 drift).
    coverage_note = (":warning: **Receipt-less merges since receipts began** -- "
                     + ", ".join(f"#{s['n']} (branch `{s['branch']}`)" for s in missing[:8])
                     + (f" (+{len(missing) - 8} more)" if len(missing) > 8 else "")
                     + " carry no `cost:` comment. Either a session drove gh below "
                       "`ship_pr` (steps 0/7 skipped, checkpoint at risk too), or a "
                       "checkpoint merged from a branch outside `CHECKPOINT_PREFIXES` "
                       "(convention drift) -- the printed branch says which. Route to "
                       "a retrospective -- the guard is skill-layer, not a backfilled receipt.")
elif first_r is not None:
    coverage_note = ("Receipts coverage: every receipt-expected merge since receipts began "
                     "carries one (checkpoint-path merges exempt -- receipt-less by design).")
else:
    coverage_note = "Receipts coverage: no receipts in scope yet (adoption pending)."


# guard: #333 -- review tripwires (D-330). When authoring parallelizes, review
# erodes SILENTLY -- field data: PRs merged +98% while review time later hit
# +441% with 31% merging unreviewed (research/notes/parallel-builder-fleet.md).
# Two tripwires, never targets: (1) pickup latency -- PR open->merge medians,
# halves-trended like preflight duration; (2) fleet-mode unreviewed merges --
# a merged PR whose open..merge interval overlapped a DIFFERENT session
# identity's (identities from receipt by=; overlap = actual concurrency, so
# sequential solo sessions never false-positive) must carry a `review:` marker
# comment from the fleet protocol. Solo windows report n/a -- solo review is
# governed by the adversarial_review cadence, not this counter.
# Retire-when: fleet mode is abandoned as a topology (supersede of D-330).
open_h = [round((s["m_dt"] - s["c_dt"]).total_seconds() / 3600, 2)
          for s in slices if s["c_dt"] and s["m_dt"]]
if open_h:
    ph = len(open_h) // 2
    p_old = statistics.median(open_h[:ph]) if ph else None
    p_new = statistics.median(open_h[ph:]) if open_h[ph:] else None
    if p_old is not None and p_new is not None and p_new >= 2 * p_old and p_new >= 1.0:
        pickup_note = (":warning: **Review pickup latency climbing** -- newer-half median "
                       "%s vs older %s (>=2x and >=1h): review capacity is saturating before "
                       "any queue visibly grows. Route to a retrospective -- add a reviewer "
                       "session or tighten the WIP cap (#333), never merge past it."
                       % (fmt_wall(p_new), fmt_wall(p_old)))
    else:
        halves = (" · halves %s → %s" % (fmt_wall(p_old), fmt_wall(p_new))
                  if p_old is not None and p_new is not None else "")
        pickup_note = ("Review pickup (PR open→merge): median %s over %d merge(s)%s "
                       "-- alarm: newer half ≥2× older and ≥1h (saturation shows here first)."
                       % (fmt_wall(med(open_h, 2)), len(open_h), halves))
else:
    pickup_note = "Review pickup: n/a (no merge intervals in scope)."


def _concurrent(a, b):
    return (a["c_dt"] and a["m_dt"] and b["c_dt"] and b["m_dt"]
            and a["c_dt"] < b["m_dt"] and b["c_dt"] < a["m_dt"])


with_id = [s for s in slices if s["by"] and s["expects_receipt"]]
fleet_prs = [s for s in with_id
             if any(o["by"] != s["by"] and _concurrent(s, o) for o in with_id)]
unrev = [s["n"] for s in fleet_prs if not s["reviewed"]]
if unrev:
    fleet_note = (":warning: **Fleet-mode merges without a `review:` marker** -- "
                  + ", ".join(f"#{n}" for n in unrev[:8])
                  + (f" (+{len(unrev) - 8} more)" if len(unrev) > 8 else "")
                  + " overlapped another identity's in-flight PR yet carry no review "
                    "comment from a second session (writer ≠ reviewer, conventions › "
                    "Concurrent writers). Target 0 -- gate erosion is silent; route to "
                    "a retrospective, never quiet it with backfilled markers.")
elif fleet_prs:
    fleet_note = ("Fleet-mode review: %d overlapping-identity merge(s) in scope, "
                  "every one carries its `review:` marker (target: 0 unreviewed)."
                  % len(fleet_prs))
else:
    fleet_note = ("Fleet-mode review: n/a -- no overlapping writer identities in scope "
                  "(solo mode; the adversarial_review cadence governs review here).")


def doc_growth():
    """Net .md line growth per file this window, from git alone (no network).
    textbooks/ (vendored library) and the generated METRICS.md are excluded."""
    try:
        r = subprocess.run(["git", "log", "--since", cutoff.isoformat(),
                            "--numstat", "--format=", "--", "*.md",
                            ":!textbooks", ":!docs/METRICS.md"],
                           capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            return []
    except Exception:
        return []
    net = {}
    for line in r.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
            net[parts[2]] = net.get(parts[2], 0) + int(parts[0]) - int(parts[1])
    return [(p, n) for p, n in sorted(net.items(), key=lambda kv: -kv[1])[:5] if n > 0]


growth = doc_growth()
growth_line = (("Fastest-growing docs (net lines this window): "
                + " · ".join(f"`{path}` +{n}" for path, n in growth))
               if growth else "Fastest-growing docs: none grew this window.")

slice_md = f"""
## Per-slice cost & pace (#255)

Receipts (`cost:` PR comments, posted at merge by `ship_pr` via `scripts/slice_telemetry.py`) aggregated by slice type (the PR-title prefix). **Tripwires, never targets:** a :warning: here routes to a [`retrospective`](../.claude/skills/retrospective/SKILL.md), never gates a merge, and cost rising *with* matching churn/quality is not a finding. {n_receipts}/{n_expected} receipt-expected merges in scope carry receipts ({len(slices)} merged total; checkpoint-path merges are receipt-less by design and excluded from both this figure and the alarm below — #642). Last 40 merges, windowed; receipt-less rows fall back to pr-open->merge wall, no usd. Wall measures elapsed, not worked: rows with wall >{PARK_WALL_H:g}h are counted as parked/interrupted (crash, overnight, decision-window wait) and excluded from wall medians and the drift wall ratio -- their usd/churn still count (#403). Where a box's statusline never fires, `usd` reads n/a and the receipt carries `tok-*` instead (#366): `med tok-out` is that box class's cost axis (#426) -- token counts are per-box units, comparable across slices but never with usd; tok-in/tok-cache stay receipt-only (explanation-side / session-length signals, not cost). :warning: **tok-*/agents comparability boundary (#478, fixed 2026-07-20):** receipts posted before the #478 merge over-count `tok-*` ~2-4x and the `agents=` transcript fallback ~3x (transcript rows duplicated per content block, summed naively; 3.77x output confirmed live) -- never trend those fields across the boundary; `usd` and `wall` are unaffected. :warning: **Workflow-token fold boundary (#549):** receipts posted before the #549 fold omit Workflow-tool worker tokens from `tok-*` (orchestration side only -- EXP-12's fleet spent 1.79M tokens invisibly); never trend a workflow slice's `tok-*` across that boundary either. Drift cost medians exclude fleet rows (`agents=`>={FAN_ROW_AGENTS}, #549/D-552) so the bloat lens compares ordinary slices with ordinary slices -- their churn/fan/wall still count everywhere. A cell tagged **`(n=k)`** means that median rests on k rows, not the type's n: `med` skips rows missing the field, and whole box classes n/a out a column at a time (#366) -- read a low-k cell as one observation, not a type. :warning: **The receipt measures the IMPLEMENTATION window, not the slice (#665, #621).** `usd`/`tok-*` are deltas from the claim snapshot, and the claim cannot precede reading the ticket -- you need the ticket to name the branch. On archaeology-heavy or bundled slices that reading *is* most of the work, so those rows under-report, systematically, in the direction that makes judgment-heavy slices look cheap. `cost-src=late-claim` catches only the sub-case where the claim postdates a **commit**; pre-commit work is invisible to it (PR #614: snapshot before the first commit, marker silent, `tok-out=834` for a +140/-12 diff). Treat cost as a floor and compare like with like -- and note the marker is un-backfillable by replay, so old rows stay as posted (`slice_telemetry.py` header has the why).

| Type | n | med wall | med usd | med tok-out | med Δlines | med agents | med CI runs |
|---|---|---|---|---|---|---|---|
{chr(10).join(slice_rows) if slice_rows else "| *(no merged PRs in scope)* | 0 | n/a | n/a | n/a | n/a | n/a | n/a |"}

Merge-order trend (oldest→newest): usd `{spark([s["usd"] for s in slices])}` · tok-out `{spark([s["tok_out"] for s in slices])}` · wall-h `{spark([s["wall"] for s in slices])}` · Δlines `{spark([s["dlines"] for s in slices])}`

{drift_note}

{coverage_note}

{pickup_note}

{fleet_note}

{growth_line} *(a process doc growing with no matching slices is the journaling smell -- eyeball it)*
"""

# --- Local telemetry (this machine) -- the skill-layer half of CMMI-L4 (#46/#47).
LOCAL = os.path.join(".claude", "metrics")
# The local half's own file, inside the gitignored dir it derives from, so it
# cannot be committed by accident (#589 -- rationale at the write site below).
LOCAL_DOC = os.path.join(LOCAL, "LOCAL.md")
# The committed doc points at the local one, so that pointer must NOT be the
# os.sep spelling: a backslash on Windows and a slash elsewhere is a
# machine-dependent byte in the shared file -- this ticket's own defect in
# miniature. Derived, not a second literal, so the two can't drift.
LOCAL_DOC_DISPLAY = LOCAL_DOC.replace(os.sep, "/")


def read_jsonl(path):
    """Parse a JSONL file; skip unparseable lines; [] on any failure (fail-soft)."""
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    except Exception:
        pass
    return rows


skill_rows = read_jsonl(os.path.join(LOCAL, "skill_usage.jsonl"))
event_rows = read_jsonl(os.path.join(LOCAL, "events.jsonl"))
denial_rows = read_jsonl(os.path.join(LOCAL, "permission_denials.jsonl"))
pf_rows = sorted([r for r in read_jsonl(os.path.join(LOCAL, "preflight_times.jsonl"))
                  if in_window(r.get("ts"))], key=lambda r: r.get("ts") or "")
guard_rows = [r for r in read_jsonl(os.path.join(LOCAL, "guard_hits.jsonl"))
              if in_window(r.get("ts"))]
sess_rows = []
for p in glob.glob(os.path.join(LOCAL, "sessions", "*.json")):
    try:
        with open(p, encoding="utf-8") as f:
            sess_rows.append(json.load(f))
    except Exception:
        pass

ledger_dates = [d for d in (parse_date(r.get("ts")) for r in skill_rows) if d]
ledger_age = (today - min(ledger_dates)).days if ledger_dates else 0
skill_w = [r for r in skill_rows if in_window(r.get("ts"))]
counts = {}
for r in skill_w:
    k = str(r.get("skill") or "?")
    counts[k] = counts.get(k, 0) + 1
catalog = sorted(os.path.basename(os.path.dirname(p))
                 for p in glob.glob(os.path.join(".claude", "skills", "*", "SKILL.md")))
# The "never invoked" alarm reads the ledger's FULL lifetime, not the rolling
# window: episodic-by-design skills (build_library, configure_project, ...) run
# once and rarely again, so window-based counting would re-flag them forever
# once their rows age out (#60). The windowed `counts` above stays the trend.
ever = {str(r.get("skill") or "?") for r in skill_rows}
unused = [s for s in catalog if s not in ever]
sess_w = [s for s in sess_rows if in_window(s.get("updated"))]
costs = [s["cost_usd"] for s in sess_w if isinstance(s.get("cost_usd"), (int, float))]
peaks = [s["peak_context_pct"] for s in sess_w if isinstance(s.get("peak_context_pct"), (int, float))]
compacts = [e for e in event_rows if e.get("source") == "compact" and in_window(e.get("ts"))]
denials_w = [r for r in denial_rows if in_window(r.get("ts"))]

if not (skill_rows or event_rows or sess_rows or denial_rows or pf_rows or guard_rows):
    local_md = ("\n"  # the heading is the local doc's own title now (#589)
                "> No local telemetry here yet -- this section fills in once the statusline "
                "and the skill/session hooks have run on this machine (docs/AUTOMATION.md s1-s2). "
                "Sources are gitignored; each machine sees only its own.\n")
else:
    top_list = ", ".join("%s x%d" % (k, v) for k, v in
                         sorted(counts.items(), key=lambda kv: -kv[1])[:5]) or "none"
    ledger_mature = ledger_age >= WINDOW
    unused_names = ", ".join(unused[:8]) + ("..." if len(unused) > 8 else "")
    if unused and ledger_mature:
        unused_shown = "%d: %s :warning:" % (len(unused), unused_names)
    elif unused:
        unused_shown = "%d *(ledger only %dd old -- alarm arms at %dd)*" % (len(unused), ledger_age, WINDOW)
    else:
        unused_shown = "0"
    med_cost = ("$%.2f" % statistics.median(costs)) if costs else "n/a"
    cpp = ("$%.2f" % (sum(costs) / n_merged)) if costs and n_merged else "n/a"
    if len(peaks) >= 5:
        mp = statistics.median(peaks)
        med_peak = "%.0f%%" % mp + (" :warning:" if mp >= 85 else "")
    elif peaks:
        med_peak = "%.0f%% *(&lt;5 sessions -- directional)*" % statistics.median(peaks)
    else:
        med_peak = "n/a"
    lrows = [
        "| Skill invocations | %d across %d skill(s) -- top: %s | trend | Which skills earn their always-resident listing cost (#6 measure-first). |"
        % (len(skill_w), len(counts), top_list),
        "| Skills never invoked | %s | 0 once the ledger is %dd old | Zero invocations in this machine's ledger lifetime -- dead weight or broken routing: prune the skill or fix its `description`. Ledger is machine-local: a skill exercised only on another box shows here. |"
        % (unused_shown, WINDOW),
        "| Sessions recorded | %s | trend | Per-session cost distribution; a sharp climb means context hygiene is regressing. |"
        % sessions_cell(len(sess_rows), len(sess_w), med_cost),
        "| Median peak context | %s | &lt; 85%% -- alarm &ge; 85%% | Peak context%% reached per session. High = compacting too late; a forced summary is what drops the Resume point. |"
        % med_peak,
        "| Compactions | %d (%.1f/wk) | trend | source=='compact' session starts. Read with the row above: many compactions at low peaks is healthy; few at 90%%+ is not. |"
        % (len(compacts), len(compacts) / (WINDOW / 7)),
        "| Permission denials | %d (%.1f/wk) | trend | Denied tool calls (rules or the auto-mode classifier) -- each one stalled autopilot. A climb means the allowlist or the denial protocol (CLAUDE.md > Working style) needs work. |"
        % (len(denials_w), len(denials_w) / (WINDOW / 7)),
        "| Session cost / merged PR | %s | trend | This machine's windowed session spend over repo-wide merges -- the per-slice price of autopilot. A climb flags context hygiene or slice sizing before the dedicated metrics trip. Directional on multi-machine setups (each box sees only its own spend). |"
        % cpp,
    ]
    if guard_rows:
        gcounts = {}
        for r in guard_rows:
            k = "%s/%s" % (r.get("guard", "?"), r.get("rule", "?"))
            gcounts[k] = gcounts.get(k, 0) + 1
        gtop = ", ".join("%s x%d" % (k, v) for k, v in
                         sorted(gcounts.items(), key=lambda kv: -kv[1])[:5])
        lrows.append(
            "| Guard hits | %d across %d guard/rule pair(s) -- top: %s | trend | Fires/catches of the mechanical guards (guard-lifecycle ledger, #253). Zero hits over ~2 retro periods = retirement candidate; constant hits = misaimed noise -- retrospective step 6 judges both. Machine-local. |"
            % (len(guard_rows), len(gcounts), gtop))
    pf_secs = [r.get("seconds") for r in pf_rows if isinstance(r.get("seconds"), (int, float))]
    if pf_secs:
        pf_h = len(pf_secs) // 2
        pf_old = statistics.median(pf_secs[:pf_h]) if pf_h else None
        pf_new = statistics.median(pf_secs[pf_h:]) if pf_secs[pf_h:] else None
        pf_trend = ((" · halves %.0fs → %.0fs" % (pf_old, pf_new))
                    if pf_old is not None and pf_new is not None else "")
        pf_warn = " :warning:" if (pf_old and pf_new and pf_new >= 2 * pf_old and pf_new >= 60) else ""
        lrows.append(
            "| Preflight duration | median %.0fs over %d run(s)%s%s | trend -- alarm: newer half &ge;2&times; older and &ge;60s | Wall time of the full local gate (#255). A climb is the test/audit suite outgrowing the loop -- make the gate selective (targeted tests inner-loop, full suite at the merge gate) before it taxes every push. |"
            % (statistics.median(pf_secs), len(pf_secs), pf_trend, pf_warn))
    local_md = ("\n"  # the heading is the local doc's own title now (#589)
                "| Metric | Value | Target | What it means |\n|---|---|---|---|\n"
                + "\n".join(lrows)
                + "\n\n*Sources: `.claude/metrics/` -- statusline session snapshots, the skill ledger "
                  "(age %dd), session-start and permission-denial events. Gitignored: ONE machine's view, not project truth; "
                  "other machines and CI each see their own or nothing. Skill catalog: %d on disk.*\n"
                % (ledger_age, len(catalog)))

short_sha = (gh_json(["api", "repos/{owner}/{repo}/commits/HEAD", "--jq", ".sha"]) or "")
# gh api --jq returns a bare string already parsed by json.loads -> str; trim.
short_sha = (short_sha[:7] if isinstance(short_sha, str) else "")


def row(name, value, fmt, target, threshold, meaning):
    if value is None:
        shown, flag = "n/a *(no data in window)*", ""
    else:
        shown = fmt(value)
        flag = " :warning:" if threshold(value) else ""
    return f"| {name} | {shown}{flag} | {target} | {meaning} |"


rows = [
    row("Throughput", throughput, lambda v: f"{v}/wk",
        "trend only", lambda v: False,
        "Merged PRs per week. A trend line, not a target -- a sudden drop flags a blocker."),
    row("Defect escape rate", escape, lambda v: f"{v*100:.0f}%",
        "&lt; 15% · alarm &gt; 25%", lambda v: v > 0.25,
        "`bug`s filed / slices merged. Measures gate + review effectiveness; each escape should leave a guard (retrospective, #31)."),
    row("Rework rate", rework, lambda v: f"{v*100:.0f}%",
        "&lt; 20% · alarm &gt; 30%", lambda v: v > 0.30,
        "Merged PRs that are themselves fixes. High = slices too big or review too shallow."),
    row("Decision latency", decision_latency, lambda v: f"{v} d",
        "&le; objection window · alarm &gt; 5 d", lambda v: v > 5,
        "Median days a `decision` issue stays open. Measures the human-in-loop bottleneck."),
    row("Preflight&harr;CI divergence", divergence, lambda v: f"{v*100:.0f}%",
        "~0% · alarm &gt; 15%", lambda v: v > 0.15,
        "Fraction of PR CI runs that went red. A faithful preflight keeps this ~0; a climb means preflight was skipped or isn't mirroring CI."),
]

body = f"""<!-- GENERATED by scripts/metrics.py -- do not hand-edit. Regenerate at each
     checkpoint (prepare_compaction runs it). Downstream projects regenerate
     their own; this file is project data, not ported by update_from_template. -->

# METRICS.md -- quantitative process ledger (CMMI-L4)

**Window:** last {WINDOW} days (since {cutoff.isoformat()}) · **Generated:** {today.isoformat()}{(' · ' + short_sha) if short_sha else ''} · **Source:** `gh` (tracker + CI), via `scripts/metrics.py`
{"" if gh_alive else chr(10) + "> :warning: `gh` was unreachable when this ran -- metrics below may be `n/a`. Re-run with a working `gh auth status`." + chr(10)}
The few metrics that each change a decision when they cross a threshold -- not a dashboard. Thresholds are **starting baselines**; a process isn't statistically controllable until the window holds ~20+ data points, so calibrate them per project once there's signal. A :warning: marks a metric past its alarm threshold -- route it to a [`retrospective`](../.claude/skills/retrospective/SKILL.md) (root-cause + leave a guard), don't just note it.

| Metric | Value | Target | What it means |
|---|---|---|---|
{chr(10).join(rows)}

*Sample this window: {n_merged} PR(s) merged, {len(bugs)} `bug`(s) filed, {len(runs_w)} PR CI run(s), {len(dlat)} decision(s) closed. Small samples are noisy -- treat single-digit windows as directional, not controlled.*
{slice_md}
*Local telemetry (skill usage, session cost, compactions, guard hits, preflight duration) is machine-local and deliberately NOT committed -- it lives in `{LOCAL_DOC_DISPLAY}` on the machine that produced it (#589). Everything above is `gh`-derived, so every machine regenerates it identically.*
"""

# LOCAL TELEMETRY IS NOT COMMITTED (#589). It derives from .claude/metrics/,
# which is gitignored and per-machine, so a shared file holding it is stable
# only while exactly ONE machine ever runs this script -- the second silently
# overwrites the first's view. That mattered beyond cosmetics: the committed
# guard-hit series read as a clean project-wide trend (406 -> ... -> 487) purely
# because one box produced every revision, and `retrospective` step 6 consumes
# exactly that series to judge guard lifecycle. A second box committing its own
# view injects a false discontinuity -- a guard at 146 hits reads as 52, which
# is the "retirement candidate" signal. Splitting the artifact makes the
# committed trend true rather than true-by-accident; the local half keeps its
# full detail beside the ledgers it came from.
LOCAL_DOC_BODY = f"""<!-- GENERATED by scripts/metrics.py -- do not hand-edit, and do not
     commit: this is ONE machine's view (#589). Regenerate with
     `python3 scripts/metrics.py`. The committed, machine-independent half of the
     ledger is docs/METRICS.md. -->

# Local telemetry -- {socket.gethostname()}

**Generated:** {today.isoformat()} · **Window:** last {WINDOW} days · **Source:** `.claude/metrics/` (gitignored)
{local_md}"""

if PRINT_ONLY:
    sys.stdout.write(body)
    sys.stdout.write("\n" + LOCAL_DOC_BODY)
else:
    with open("docs/METRICS.md", "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    local_written = LOCAL_DOC
    try:
        os.makedirs(os.path.dirname(LOCAL_DOC), exist_ok=True)
        with open(LOCAL_DOC, "w", encoding="utf-8", newline="\n") as f:
            f.write(LOCAL_DOC_BODY)
    except OSError as e:  # local telemetry never blocks the committed ledger
        local_written = f"NOT written ({type(e).__name__})"
    print(f"metrics: wrote docs/METRICS.md (window {WINDOW}d; "
          f"{n_merged} merged, {len(bugs)} bugs, {len(runs_w)} PR runs, "
          f"{n_receipts}/{n_expected} receipts) · local telemetry -> {local_written}"
          + ("" if gh_alive else " -- WARNING: gh unreachable, values may be n/a"))

if PLOT_DIR:
    # On-demand stdlib SVG (the EXP-01 no-matplotlib pattern) -- never committed;
    # metrics_report sends it to the owner phone-readable.
    def bar_panel(vals, title, y0, color):
        x0, w, h = 60, 620, 90
        parts = ['<text x="%d" y="%d" font-size="12" fill="#667">%s</text>' % (x0, y0 - 8, title)]
        nums = [v for v in vals if v is not None]
        if not nums:
            parts.append('<text x="%d" y="%d" font-size="11" fill="#99a">n/a</text>' % (x0, y0 + h // 2))
            return "".join(parts)
        hi = max(nums) or 1
        bw = w / max(len(vals), 1)
        for i, v in enumerate(vals):
            if v is None:
                continue
            bh = max((v / hi) * (h - 4), 1)
            parts.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
                         % (x0 + i * bw, y0 + h - bh, max(bw - 2, 1), bh, color))
        parts.append('<text x="%d" y="%d" font-size="10" fill="#99a" text-anchor="end">max %g</text>'
                     % (x0 + w, y0 + 4, hi))
        return "".join(parts)

    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="400" '
           'font-family="system-ui, sans-serif">'
           '<rect width="720" height="400" fill="#fdfdfd"/>'
           '<text x="60" y="24" font-size="14" fill="#334">Per-slice trend -- merges oldest to newest '
           '(window %dd, %d merges, %d receipts)</text>' % (WINDOW, len(slices), n_receipts)
           + bar_panel([s["usd"] for s in slices], "session usd per slice (receipts only)", 70, "#4a7dbd")
           + bar_panel([s["wall"] for s in slices], "wall hours per slice", 185, "#c98a3d")
           + bar_panel([s["dlines"] for s in slices], "diff lines per slice (churn)", 300, "#5a9a6e")
           + '</svg>')
    os.makedirs(PLOT_DIR, exist_ok=True)
    plot_path = os.path.join(PLOT_DIR, "per_slice_trend.svg")
    with open(plot_path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"metrics: wrote {plot_path}")
