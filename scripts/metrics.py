#!/usr/bin/env python3
# metrics.py -- the quantitative process-metrics ledger (CMMI-L4).
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
# Plus "Local telemetry (this machine)" (#46/#47): skill usage, session
# cost/context, compactions -- read from gitignored side-channels written by
# .claude/statusline.py and the hooks (docs/AUTOMATION.md s1-s2). gh can never
# see those, so the section is separate and honest about being one machine's
# view; with no local files it degrades to a one-line pointer.
#
# Usage:
#   python3 scripts/metrics.py                 # write docs/METRICS.md (default 90-day window)
#   python3 scripts/metrics.py --window-days 30
#   python3 scripts/metrics.py --print         # print to stdout, do not write the file
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

if not (skill_rows or event_rows or sess_rows or denial_rows):
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
{local_md}"""

if PRINT_ONLY:
    sys.stdout.write(body)
else:
    with open("docs/METRICS.md", "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print(f"metrics: wrote docs/METRICS.md (window {WINDOW}d; "
          f"{n_merged} merged, {len(bugs)} bugs, {len(runs_w)} PR runs)"
          + ("" if gh_alive else " -- WARNING: gh unreachable, values may be n/a"))
