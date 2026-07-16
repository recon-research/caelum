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
# Plus "Local telemetry (this machine)" (#46/#47): skill usage, session
# cost/context, compactions, preflight durations -- read from gitignored
# side-channels written by .claude/statusline.py and the hooks
# (docs/AUTOMATION.md s1-s2). gh can never see those, so the section is
# separate and honest about being one machine's view; with no local files it
# degrades to a one-line pointer.
#
# Usage:
#   python3 scripts/metrics.py                 # write docs/METRICS.md (default 90-day window)
#   python3 scripts/metrics.py --window-days 30
#   python3 scripts/metrics.py --print         # print to stdout, do not write the file
#   python3 scripts/metrics.py --plot <dir>    # also write per-slice trend SVGs to <dir>
#                                             # (on-demand, never committed -- metrics_report sends them)
#
# Single-implementation Python (like the audits/hooks) -- runs on both shells;
# no .ps1 twin. Stdlib only. cwd-independent.
import json, subprocess, sys, os, datetime, statistics, glob

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root

WINDOW = 90
if "--window-days" in sys.argv:
    try:
        WINDOW = int(sys.argv[sys.argv.index("--window-days") + 1])
    except (ValueError, IndexError):
        print("metrics: --window-days needs an integer", file=sys.stderr)
        raise SystemExit(2)
PRINT_ONLY = "--print" in sys.argv
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
        r = subprocess.run(["gh"] + args, capture_output=True, text=True, timeout=90)
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
    return {l.get("name", "") for l in item.get("labels", [])}


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
                   "dlines": (p.get("additions") or 0) + (p.get("deletions") or 0),
                   "receipt": bool(rec),
                   # Checkpoint-path merges (conventions > Right-sized slices:
                   # doc-only checkpoint/<date> branch + PR) never carry a receipt
                   # by design -- classify by BRANCH, not title prefix: titles are
                   # free-form per repo, and real docs:/ops: slices do receipt
                   # (#269, intake #268 -- 5 of Caelum's 6 tripwire flags were
                   # checkpoint PRs drowning the one genuine miss).
                   "expects_receipt": not (p.get("headRefName") or "").startswith("checkpoint/")})


def med(vals, nd=1):
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    m = statistics.median(vals)
    return round(m, nd) if nd else int(round(m))


def fmt_val(v, prefix=""):
    return f"{prefix}{v}" if v is not None else "n/a"


def fmt_wall(v):
    """Adaptive: fast loops live in minutes, long slices in hours."""
    if v is None:
        return "n/a"
    return f"{v * 60:.0f}m" if v < 1 else f"{v:.1f}h"


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
slice_rows = ["| %s | %d | %s | %s | %s | %s |" % (
                  typ, len(rows_t),
                  fmt_wall(med([r["wall"] for r in rows_t], 2)),
                  fmt_val(med([r["usd"] for r in rows_t], 2), "$"),
                  fmt_val(med([r["dlines"] for r in rows_t], 0)),
                  fmt_val(med([r["ci"] for r in rows_t], 0)))
              for typ, rows_t in sorted(lumped.items(), key=lambda kv: -len(kv[1]))]

# Drift tripwire: newer-half medians vs older-half (merge order). Cost or wall
# doubling while churn doesn't is the investigate signal -- the "hour-long slice
# that used to take ten minutes" made visible without watching every session.
if len(slices) >= 8:
    half = len(slices) // 2
    older, newer = slices[:half], slices[half:]

    def _ratio(key):
        a, b = med([r[key] for r in older], 3), med([r[key] for r in newer], 3)
        return (b / a) if a and b else None

    r_usd, r_wall, r_churn = _ratio("usd"), _ratio("wall"), _ratio("dlines")
    drifting = [name for name, r in (("usd", r_usd), ("wall-h", r_wall))
                if r is not None and r >= 2.0 and (r_churn is None or r_churn < 1.5)]
    if drifting:
        drift_note = (":warning: **Cost drift without churn** -- newer-half median "
                      + "/".join(drifting) + " is >=2x the older half while diff size isn't. "
                      "Hidden-bloat candidate (journaling doc? swelling gate? context hygiene?) -- "
                      "route to a retrospective; never fix by splitting slices to beat the number.")
    else:
        drift_note = ("Drift check (newer-half / older-half medians): usd %s · wall %s · churn %s "
                      "-- alarm at >=2.0 on cost/wall while churn stays <1.5."
                      % tuple(("%.2f" % r) if r else "n/a" for r in (r_usd, r_wall, r_churn)))
else:
    drift_note = "Drift check arms at 8+ merges in scope (%d now)." % len(slices)

n_receipts = sum(1 for s in slices if s["receipt"])

# guard: #263 -- receipts-coverage tripwire. A `cost:` receipt is ship_pr's
# skill-step-backed artifact: hooks and scripts fire on their own, but a skill
# step fires only if the skill was invoked -- a session hand-driving gh skips it
# silently (field failure: Caelum 2026-07-15, two receipt-less merges post-sync).
# Once receipts exist in scope, every later receipt-expected merge without one
# is that signal (checkpoint-path merges are exempt -- see expects_receipt
# above; refined by #269 after the tripwire's first field run flagged 5
# checkpoint PRs against 1 true positive). Tripwire, never a target: the fix
# is a retrospective (usually a SKILL.md / routing diff), never retroactive
# receipts posted to quiet the number.
# Retire-when: same condition as the #263 routing reminders.
first_r = next((i for i, s in enumerate(slices) if s["receipt"]), None)
missing = ([s["n"] for s in slices[first_r:] if s["expects_receipt"] and not s["receipt"]]
           if first_r is not None else [])
if missing:
    coverage_note = (":warning: **Receipt-less merges since receipts began** -- "
                     + ", ".join(f"#{n}" for n in missing[:8])
                     + (f" (+{len(missing) - 8} more)" if len(missing) > 8 else "")
                     + " carry no `cost:` comment: a session likely drove gh below "
                       "`ship_pr` (steps 0/7 skipped, checkpoint at risk too). Route to "
                       "a retrospective -- the guard is skill-layer, not a backfilled receipt.")
elif first_r is not None:
    coverage_note = ("Receipts coverage: every receipt-expected merge since receipts began "
                     "carries one (checkpoint-path merges exempt -- receipt-less by design).")
else:
    coverage_note = "Receipts coverage: no receipts in scope yet (adoption pending)."


def doc_growth():
    """Net .md line growth per file this window, from git alone (no network).
    textbooks/ (vendored library) and the generated METRICS.md are excluded."""
    try:
        r = subprocess.run(["git", "log", "--since", cutoff.isoformat(),
                            "--numstat", "--format=", "--", "*.md",
                            ":!textbooks", ":!docs/METRICS.md"],
                           capture_output=True, text=True, timeout=60)
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

Receipts (`cost:` PR comments, posted at merge by `ship_pr` via `scripts/slice_telemetry.py`) aggregated by slice type (the PR-title prefix). **Tripwires, never targets:** a :warning: here routes to a [`retrospective`](../.claude/skills/retrospective/SKILL.md), never gates a merge, and cost rising *with* matching churn/quality is not a finding. {n_receipts}/{len(slices)} merged PRs in scope carry receipts (last 40 merges, windowed; receipt-less rows fall back to pr-open->merge wall, no usd).

| Type | n | med wall | med usd | med Δlines | med CI runs |
|---|---|---|---|---|---|
{chr(10).join(slice_rows) if slice_rows else "| *(no merged PRs in scope)* | 0 | n/a | n/a | n/a | n/a |"}

Merge-order trend (oldest→newest): usd `{spark([s["usd"] for s in slices])}` · wall-h `{spark([s["wall"] for s in slices])}` · Δlines `{spark([s["dlines"] for s in slices])}`

{drift_note}

{coverage_note}

{growth_line} *(a process doc growing with no matching slices is the journaling smell -- eyeball it)*
"""

# --- Local telemetry (this machine) -- the skill-layer half of CMMI-L4 (#46/#47).
LOCAL = os.path.join(".claude", "metrics")


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
    local_md = ("\n## Local telemetry (this machine)\n\n"
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
        "| Sessions recorded | %d -- median cost %s | trend | Per-session cost distribution; a sharp climb means context hygiene is regressing. |"
        % (len(sess_w), med_cost),
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
    local_md = ("\n## Local telemetry (this machine)\n\n"
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
{slice_md}{local_md}"""

if PRINT_ONLY:
    sys.stdout.write(body)
else:
    with open("docs/METRICS.md", "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print(f"metrics: wrote docs/METRICS.md (window {WINDOW}d; "
          f"{n_merged} merged, {len(bugs)} bugs, {len(runs_w)} PR runs, "
          f"{n_receipts}/{len(slices)} receipts)"
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
