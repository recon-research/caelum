#!/usr/bin/env python3
# slice_telemetry.py -- per-slice cost telemetry: the collection half of #255.
#
# Three subcommands, wired into the loop at their decision points:
#   claim <issue>                 ship_pr step 0 -- snapshot this session's cost
#                                 (statusline ledger) so the receipt can report a delta.
#   receipt <pr> <issue> [--dry-run]
#                                 ship_pr step 7 -- compute + post the one-line
#                                 `cost:` comment on the merged PR, and print it
#                                 (the merge summary echoes it to the owner).
#   preflight <seconds> <failed> <skipped>
#                                 preflight.{sh,ps1} tail -- append total duration
#                                 to the local ledger (the test-suite-growth lens).
#   status                        the landing block's **Cost** field (#749) -- this
#                                 session's spend + context %, read from the same
#                                 statusline ledger. The owner works from a phone,
#                                 where the statusline that already computes this
#                                 number is not visible; without it he has to type
#                                 /usage to judge whether to compact.
#
# THE RECEIPT FORMAT IS SINGLE-HOMED HERE (scripts/metrics.py parses it; the
# conventions file cross-links here). One line, space-separated key=value:
#
#   cost: wall-h=25.9 commits=3 files=12 diff=+540/-80 ci-runs=2 usd=4.21 tok-out=1.2M tok-in=5.6M tok-cache=171.2M agents=4 by=<machine>/<session8>
#
#   wall-h   claim comment's SERVER-SIDE createdAt -> mergedAt, hours, 1 decimal.
#            Not the stamp inside the comment body: that one is typed by the
#            session being measured, and a mistyped body stamp landing after the
#            merge posted wall-h=0.00 on a ~40-minute slice downstream (#683,
#            intake #680). Claims created after mergedAt are rejected (they
#            belong to a later slice on the same ticket); last qualifying claim
#            wins, so re-claims still supersede. When no claim qualifies the
#            fallback is PR-open -> merge and the line gains `wall-src=pr-open`
#            (an approximation marker, never silently mixed).
#   usd      this box's session-cost delta claim -> receipt (statusline ledger,
#            same session id only). `n/a` when the snapshot is missing, the
#            session changed (/clear), or another machine merged -- never guessed:
#            receipts come from the ledger, not self-estimates (ANTI_PATTERNS:
#            The Self-Reporting Oracle).
#   tok-*    session token delta claim -> receipt, from the HARNESS TRANSCRIPT
#            (~/.claude/projects/*/<sid>.jsonl + its <sid>/subagents/agent-*.jsonl
#            sidecars, so fan-out is counted -- the #392 hole stays closed).
#            Workflow-tool workers are folded in too (#549): their sidecars nest
#            one level down (subagents/workflows/wf_*/agent-*.jsonl, zero ID
#            overlap with the flat sidecars -- verified in #547), so pre-fold a
#            workflow slice's tok-* was orchestration-only (EXP-12's fleet spent
#            1.79M tokens, invisible). Receipts posted before the fold carry
#            that under-count -- a comparability boundary, same class as #478.
#            The statusline never fires on some harnesses (#366: the desktop app
#            on LAPTOP-0TDQ755V never invokes a project statusLine), so `usd` is
#            structurally n/a there; the transcript is harness-written -- the
#            same not-a-self-estimate trust that admits the `agents=` fallback.
#            Tokens are NOT converted to dollars: that needs a hand-maintained
#            pricing table (the CHECKPOINT_PREFIXES drift class -- and one session
#            can span models). Three classes, kept separate because cache reads
#            dominate raw sums (96% observed in #366's probe) and would drown
#            the signal: tok-out = output (generation, priciest); tok-in =
#            input + cache_creation (fresh prompt ingestion -- spikes on
#            fan-out); tok-cache = cache_read (context pressure / session
#            length). Same n/a rules as usd; monotone per class or n/a, never
#            clamped. If #312's OTel spike lands real per-session dollars,
#            `usd` upgrades and tok-* stays as the unit-honest floor.
#   ci-runs  workflow runs recorded for the head branch (retries = failure loops).
#   agents   subagent dispatches inside the claim -> receipt window, same session
#            (#392). `usd` is a SESSION-cost delta, so it includes every dispatch,
#            while diff size sees none of them -- under the skill-eval admission
#            gate (#302) a 19-line slice cost $15.67 (PR #386, 10 dispatches) and
#            the "cost drift without churn" alarm fired permanently, which is how
#            a tripwire stops working. This field is what lets metrics.py tell
#            delegation apart from bloat. Ledger-sourced like `usd`, never
#            self-counted: the hook writes it, or it reads the harness transcript.
#            Workflow-tool fan-out is folded in too (#547): the Workflow tool
#            spawns its own subagents, which never surface as Agent/Task blocks
#            in the transcript nor fire the PostToolUse hook, so a workflow-heavy
#            slice read `agents=0` (EXP-12 dispatched 48, EXP-11 32) and tripped
#            the cost-drift alarm by construction -- the #392 hole one layer
#            down. Each run's <sid>/workflows/wf_*.json carries an authoritative
#            agentCount; the windowed sum joins the Agent-tool count here.
#   cost-src Emitted ONLY as `cost-src=late-claim` (#617, widened #769): the
#            claim snapshot postdates the first EVIDENCE OF WORK -- the earlier
#            of the PR's first commit and the first subagent dispatch -- so the
#            usd/tok-* window opened after work had begun and those values are a
#            floor, not a measurement. Same
#            fail-open shape as #593/#588/#603 -- a broken
#            measurement reading as authoritative success: #603 reported
#            tok-out=834 where a comparable slice read 21.2k (~4%) and entered
#            the series as a cheap row. metrics.py drops marked rows from the
#            cost medians (the fleet-row rule, #549) instead of averaging them
#            in. Absent = the window bounded the work AS FAR AS THESE ORACLES
#            SEE. #665 found the commit-only comparison misses work done before
#            any commit exists -- structurally, since you cannot name a branch
#            slug until you have read the ticket, and on a bundled or
#            archaeology-heavy slice that reading is most of the work. Live: PR
#            #614's snapshot preceded its first commit (marker correctly silent
#            by its own rule) and still posted tok-out=834 for a +140/-12 diff,
#            because the authoring happened before the snapshot. #665 documented
#            rather than fixed it, holding that every oracle for "work began" is
#            confounded by a session spanning several slices. #769 SUPERSEDES
#            that holding PARTLY: see claim_is_late's block comment. Dispatch is
#            admitted as a second oracle because it is rare and bursty, so a
#            bounded lookback attributes it correctly. The file-EDIT oracle took
#            two more slices to earn its place: #777 gave the ledger a slice-END
#            boundary (receipt writes a row), which took it from 1/4 to 4/4, and
#            #783 closed the between-slice confound that remained -- see
#            claim_is_late's block comment for the two halves and the numbers.
#            Three oracles now, at 5/5 over every slice with settled ground
#            truth. Residual, unchanged: cost is still a FLOOR on
#            judgment-heavy slices, because thinking leaves no artifact for any
#            oracle to timestamp, and #783 deliberately widened that floor by
#            ignoring work outside the tree. A wrong accusation is still worse
#            than a known floor -- that principle is what gated the edit oracle
#            for two slices, and what shapes it now that it ships.
#   UN-BACKFILLABLE BY REPLAY (#621), for two independent reasons, either
#            sufficient: slice_costs.jsonl is machine-local and gitignored (a
#            slice merged from another box leaves nothing here), and the delta
#            is same-sid pinned (#357), so `snaps` is empty in any later session
#            even on the original box. An empty `snaps` makes claim_is_late's
#            first argument None -> False, so a replay re-posts n/a across every
#            cost field AND still no marker: it would overwrite a real (if
#            mis-windowed) measurement with silence, and mint no correction.
#            Hence pre-marker rows stay as posted and metrics.py's series note
#            carries the caveat -- the comparability-boundary precedent (#478,
#            #549) applied to a boundary that cannot be crossed backwards.
#

# Receipts are TRIPWIRES, NEVER TARGETS (metrics.py carries the same framing):
# they exist so cost drift becomes visible, not so sessions optimize a number.
#
# Fail-soft by contract: telemetry must never block the loop -- every path exits 0,
# printing what it could and couldn't record. Local sidecars live in
# .claude/metrics/ (gitignored, one machine's view):
#   slice_costs.jsonl     slice boundaries            {issue, sid, event, ts, ...}
#                         event=claim carries the cost snapshot (usd, tok, ident);
#                         event=receipt carries only the stamp -- it marks the END
#                         (#777). Rows written before #777 have no `event` and are
#                         all claims; row_event reads absent as "claim" for them.
#   preflight_times.jsonl preflight durations         {ts, seconds, result, skipped}
#   agent_dispatches.jsonl subagent dispatches        {ts, tool, subagent_type, session_id}
#
# Single-implementation Python (D-210: `python3` spelling), stdlib only,
# cwd-independent -- same conventions as metrics.py.
import json
import subprocess
import sys
import os
import datetime
import re
import socket
# Windows cp1252 stdout guard (#296): gate output carries non-ASCII
# (em-dashes, section signs, file text); a cp1252-strict console mojibakes
# or crashes an otherwise-green run. Uniform across every gate script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root
LOCAL = os.path.join(".claude", "metrics")

# IDENTIFIES a claim comment; it no longer MEASURES one. The captured stamp is
# hand-typed by the very session the receipt is scoring -- ANTI_PATTERNS "The
# Self-Reporting Oracle", sitting in the one artifact whose whole job is to not
# be one. It bit a downstream live: a mistyped body stamp landed after the merge
# and the receipt posted wall-h=0.00 on a ~40-minute slice (#683, intake #680).
# The group stays because a well-formed claim carries a stamp -- that is a
# structural check on the comment's shape -- but claim_start() reads the
# server's createdAt, which no session can typo.
CLAIM_RE = re.compile(r"^claim:\s*\S+\s*(?:·|\|)\s*([0-9T:.+\-]+Z?)\s*(?:·|\|)", re.M)


def out(msg):
    print(f"slice_telemetry: {msg}")


def gh_json(args):
    """Run a gh command; parsed JSON or None on ANY failure (fail-soft)."""
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


def parse_ts(iso):
    if not iso:
        return None
    try:
        return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def session_identity():
    """(session_id, '<machine>/<session8>') from the SessionStart hook's snapshot; (None, None) fail-soft."""
    try:
        with open(os.path.join(LOCAL, "session.json"), encoding="utf-8") as f:
            sid = json.load(f).get("session_id") or ""
    except Exception:
        return None, None
    if not sid:
        return None, None
    return sid, f"{socket.gethostname()}/{sid[:8]}"


def session_snapshot(sid, root="."):
    """The statusline's snapshot dict for this session; {} if absent (fail-soft).

    The ONE reader of `.claude/metrics/sessions/<sid>.json` in this file -- the path
    is spelled here and nowhere else, so `session_cost` and the `status` subcommand
    cannot drift apart. `root` exists for out-of-tree callers (the Stop hook lives in
    .claude/hooks/ and cannot rely on cwd); LOCAL stays repo-relative for everyone else.
    """
    try:
        with open(os.path.join(root, LOCAL, "sessions", f"{sid}.json"),
                  encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def session_cost(sid):
    """Cumulative cost_usd from the statusline snapshot for this session; None if absent."""
    v = session_snapshot(sid).get("cost_usd")
    return float(v) if isinstance(v, (int, float)) else None


def format_status(snap):
    """The hand-back meters line -- SINGLE HOME of this format (#749).

    Read by the owner in the landing block's **Cost** field, and by
    `.claude/hooks/session_close_contract.py`, which imports this rather than
    re-deriving it so the nudge and the agent's own reading can never disagree.

    ASCII only: it reaches Windows consoles through both callers. Missing values
    say `n/a` and never guess -- a fabricated context number would be worse than
    none, since the owner uses it to decide whether to compact.
    """
    usd = snap.get("cost_usd")
    pct = snap.get("context_used_pct")
    peak = snap.get("peak_context_pct")
    cost = f"${usd:.2f} this session" if isinstance(usd, (int, float)) else "cost n/a"
    if not isinstance(pct, (int, float)):
        return f"{cost}, ctx n/a"
    ctx = f"ctx {int(pct)}% used"
    # Peak only earns a mention when it exceeds current -- after a compaction the
    # two diverge sharply (7% now, 28% peak), and that gap is exactly the signal
    # that a compaction already happened in this window.
    if isinstance(peak, (int, float)) and int(peak) > int(pct):
        ctx += f" (peak {int(peak)}%)"
    return f"{cost}, {ctx}"


def cmd_status():
    """Print the meters line for the current session (landing block's **Cost** field)."""
    sid, _ = session_identity()
    out(format_status(session_snapshot(sid)) if sid else "cost n/a, ctx n/a")


# The four usage classes the harness records per assistant message. Summed
# cumulatively (claim -> receipt delta), never converted to dollars (header).
TOK_KEYS = ("input_tokens", "output_tokens",
            "cache_creation_input_tokens", "cache_read_input_tokens")


def _dedupe_usage(lines):
    """Pure core (#478, intake #475): usage dict per (requestId, message.id),
    keep-LAST. The harness writes one transcript row per content block of the
    same assistant message, each repeating that message's usage -- summing rows
    naively inflates every class 2-4x (confirmed 3.77x output / 2.33x cache on
    a live transcript here). Keep-last: a streamed message's final row carries
    the settled numbers. A row with no identity at all cannot be deduped --
    it counts once, erring on inclusion."""
    seen, anon = {}, 0
    for line in lines:
        if '"usage"' not in line:
            continue  # cheap prefilter: transcripts run to tens of MB
        try:
            d = json.loads(line)
        except Exception:
            continue
        m = d.get("message") or {}
        u = m.get("usage")
        if not isinstance(u, dict):
            continue
        key = (d.get("requestId"), m.get("id"))
        if key == (None, None):
            anon += 1
            key = ("__anon__", anon)
        seen[key] = u
    return seen


def _sum_usage(path, tot):
    """Accumulate deduped usage classes from one transcript file into `tot`."""
    with open(path, encoding="utf-8", errors="replace") as f:
        for u in _dedupe_usage(f).values():
            for k in TOK_KEYS:
                v = u.get(k)
                if isinstance(v, (int, float)):
                    tot[k] += v


def session_tokens(sid):
    """Cumulative token usage for session `sid` from the harness transcript,
    subagent sidecars included; None when no transcript is found (tok-*=n/a).
    Globbed like dispatch_count's fallback: the projects/<slug>/ naming is a
    harness internal, the <sid>.jsonl leaf is stable -- and the <sid>/subagents/
    directory sits beside it, which is what makes fan-out attributable (#366).
    """
    if not sid:
        return None
    try:
        import glob
        hits = glob.glob(os.path.join(os.path.expanduser("~"), ".claude", "projects",
                                      "*", f"{sid}.jsonl"))
        if not hits:
            return None
        tot = dict.fromkeys(TOK_KEYS, 0)
        _sum_usage(hits[0], tot)
        for sub in glob.glob(os.path.join(os.path.dirname(hits[0]), sid,
                                          "subagents", "agent-*.jsonl")):
            _sum_usage(sub, tot)
        # #549: Workflow-tool workers nest one level down and share no IDs with
        # the flat sidecars (verified in #547) -- without this fold a workflow
        # slice's tok-* reports orchestration only and the fleet's millions of
        # tokens vanish from the receipt.
        for sub in glob.glob(os.path.join(os.path.dirname(hits[0]), sid,
                                          "subagents", "workflows", "wf_*",
                                          "agent-*.jsonl")):
            _sum_usage(sub, tot)
        return tot
    except Exception:
        return None


def tok_delta(claim_tok, cur_tok):
    """Per-class claim -> receipt delta; None unless both readings exist and
    every class is monotone. A shrunk count means the readings don't describe
    one growing stream (session changed, transcript rotated) -- that renders
    n/a, never a clamped or partial number (same honesty rule as usd)."""
    if not isinstance(claim_tok, dict) or not isinstance(cur_tok, dict):
        return None
    d = {}
    for k in TOK_KEYS:
        a, b = claim_tok.get(k), cur_tok.get(k)
        if not isinstance(a, (int, float)) or not isinstance(b, (int, float)) or b < a:
            return None
        d[k] = b - a
    return d


def fmt_tok(n):
    """Compact token count: 171178929 -> '171.2M', 55673 -> '55.7k', 421 -> '421'."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}k"
    return str(int(n))


def dispatch_count(sid, since, until):
    """Subagent dispatches for session `sid` in [since, until] -- the fan-out
    signal behind `agents=` (#392, #547). None only when NO source can answer,
    which the receipt renders as `agents=n/a`: unknown, never guessed as zero.

    The sum of two independent fan-out channels, each None when its own source
    is silent:
      - Agent-tool dispatches (Agent/Task), from the PostToolUse hook ledger or,
        retroactively, the session transcript (_agent_tool_dispatches).
      - Workflow-tool fan-out, from the per-run wf_*.json manifests
        (_workflow_dispatches, #547) -- invisible to both sources above.
    Both silent -> None (n/a); either present -> their sum, the other as 0.
    """
    if not sid:
        return None
    agent_tool = _agent_tool_dispatches(sid, since, until)
    workflow = _workflow_dispatches(sid, since, until)
    if agent_tool is None and workflow is None:
        return None
    return (agent_tool or 0) + (workflow or 0)


def _agent_tool_dispatches(sid, since, until):
    """Agent/Task tool dispatches for `sid` in [since, until] -- the original
    `agents=` channel (#392). None when no source can answer.

    Two sources, in preference order. The hook ledger is the stable contract
    (.claude/hooks/log_agent_dispatch.py, PostToolUse on Agent); the harness
    transcript is the fallback that also answers RETROACTIVELY, for slices that
    merged before the hook was wired. Both are written by the harness, so
    neither is a self-estimate -- the property that makes `usd` trustworthy.
    """
    rows = [r for r in read_jsonl("agent_dispatches.jsonl") if r.get("session_id") == sid]
    if rows:
        return sum(1 for r in rows
                   if (parse_ts(r.get("ts")) or since) >= since
                   and (parse_ts(r.get("ts")) or until) <= until)
    # Fallback: count Agent/Task tool_use blocks in the session transcript.
    # Globbed, not path-built: the projects/<slug>/ naming is a harness internal
    # (and differs by platform), while the <sid>.jsonl leaf is stable.
    try:
        import glob
        hits = glob.glob(os.path.join(os.path.expanduser("~"), ".claude", "projects",
                                      "*", f"{sid}.jsonl"))
        if not hits:
            return None
        with open(hits[0], encoding="utf-8", errors="replace") as f:
            return _dispatch_blocks(f, since, until)
    except Exception:
        return None


def _dispatch_blocks(lines, since, until):
    """Pure core (#478, intake #475): Agent/Task tool_use blocks in
    [since, until], counted max-per-(requestId, message.id) -- correct for
    both full-replication and cumulative-prefix row shapes of one message
    (naive row-summing counted the same dispatch ~3x). Same anon rule as
    _dedupe_usage: an identity-less row counts alone."""
    best, anon = {}, 0
    for line in lines:
        if '"Agent"' not in line and '"Task"' not in line:
            continue  # cheap prefilter: these transcripts run to tens of MB
        try:
            d = json.loads(line)
        except Exception:
            continue
        ts = parse_ts(d.get("timestamp"))
        if not ts or not (since <= ts <= until):
            continue
        m = d.get("message") or {}
        content = m.get("content")
        if not isinstance(content, list):
            continue
        n = sum(1 for b in content
                if isinstance(b, dict) and b.get("type") == "tool_use"
                and b.get("name") in ("Agent", "Task"))
        key = (d.get("requestId"), m.get("id"))
        if key == (None, None):
            anon += 1
            key = ("__anon__", anon)
        best[key] = max(best.get(key, 0), n)
    return sum(best.values())


# The two tool sets are constants, not inline tuples, so the corpus drives the
# SHIPPED choice rather than a hand-copied echo of it (#769). The line that
# matters is the one that is absent: no Read/Grep/Glob, because investigation
# precedes the claim by construction (#665) and flagging it would accuse every
# honest slice.
DISPATCH_TOOLS = ("Agent", "Task")


def first_dispatch_ts(sid, since, until):
    """Earliest subagent dispatch for `sid` in [since, until] (#769); None when
    both sources are silent. Ledger first, transcript as the fallback -- the
    same preference order as dispatch_count, and the same property that makes
    `usd` trustworthy: the harness writes both, neither is a self-estimate."""
    if not sid or since is None or until is None:
        return None
    stamps = [parse_ts(r.get("ts")) for r in read_jsonl("agent_dispatches.jsonl")
              if r.get("session_id") == sid]
    stamps = [t for t in stamps if t is not None and since <= t <= until]
    if stamps:
        return min(stamps)
    return _first_tool_use_ts(sid, DISPATCH_TOOLS, since, until)


def _first_tool_use_ts(sid, names, since, until, path_ok=None):
    """Glob the session transcript and run the pure core over it. Globbed, not
    path-built, for the reason _agent_tool_dispatches gives."""
    if not sid or since is None or until is None:
        return None
    try:
        import glob
        hits = glob.glob(os.path.join(os.path.expanduser("~"), ".claude", "projects",
                                      "*", f"{sid}.jsonl"))
        if not hits:
            return None
        with open(hits[0], encoding="utf-8", errors="replace") as f:
            return _first_tool_use(f, names, since, until, path_ok)
    except Exception:
        return None


def _first_tool_use(lines, names, since, until, path_ok=None):
    """Pure core (#478, mirrors _dispatch_blocks): earliest timestamp of a
    tool_use block whose name is in `names`, within [since, until]; None when
    there is none. Unlike _dispatch_blocks this needs no per-message dedupe --
    a min over timestamps is idempotent under replayed rows, which is exactly
    the row shape that made naive counting triple-count.

    `path_ok`, when given, must also accept the block's `input.file_path`; a
    block carrying no path is rejected (#783 -- the safe direction is a missed
    flag, never an invented one). Default None keeps every existing caller's
    behaviour, which is what the dispatch oracle wants: an Agent dispatch has
    no file to judge."""
    marks = tuple(f'"{n}"' for n in names)
    best = None
    for line in lines:
        if not any(m in line for m in marks):
            continue  # cheap prefilter: these transcripts run to tens of MB
        try:
            d = json.loads(line)
        except Exception:
            continue
        ts = parse_ts(d.get("timestamp"))
        if not ts or not (since <= ts <= until):
            continue
        content = (d.get("message") or {}).get("content")
        if not isinstance(content, list):
            continue
        if path_ok is not None:
            if any(isinstance(b, dict) and b.get("type") == "tool_use"
                   and b.get("name") in names
                   and path_ok((b.get("input") or {}).get("file_path"))
                   for b in content):
                if best is None or ts < best:
                    best = ts
            continue
        if any(isinstance(b, dict) and b.get("type") == "tool_use"
               and b.get("name") in names for b in content):
            if best is None or ts < best:
                best = ts
    return best


def _epoch_ms(v):
    """Epoch-milliseconds (the wf manifest's `startTime`) -> aware UTC datetime;
    None if not a plain number. The fallback for a manifest that lacks its ISO
    `timestamp`. bool is not a number here (isinstance(True, int) is True)."""
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return None
    try:
        return datetime.datetime.fromtimestamp(v / 1000, datetime.timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None


def _sum_wf_agents(manifests, since, until):
    """Pure core (#547, mirrors _dispatch_blocks): sum `agentCount` over the
    workflow-run manifests whose run time falls in [since, until]. A manifest
    with no int agentCount adds 0; one with no parseable time is counted (err on
    inclusion -- same bias as _dedupe_usage's anon rows -- since it lives in this
    session's own workflows dir). `manifests` is an iterable of loaded wf_*.json
    dicts. Windowing is load-bearing: one session can run several slices' worth
    of workflows, and a receipt must credit only the runs inside its window."""
    total = 0
    for d in manifests:
        if not isinstance(d, dict):
            continue
        n = d.get("agentCount")
        if not isinstance(n, int) or isinstance(n, bool):
            continue
        ts = parse_ts(d.get("timestamp")) or _epoch_ms(d.get("startTime"))
        if ts is not None and not (since <= ts <= until):
            continue
        total += n
    return total


def _workflow_dispatches(sid, since, until):
    """Workflow-tool subagent fan-out for `sid` in [since, until] (#547). The
    Workflow tool spawns its agents itself -- they never appear as Agent/Task
    tool_use blocks in the transcript nor fire the PostToolUse hook, so
    _agent_tool_dispatches is blind to them and a workflow-heavy slice read
    agents=0 (EXP-12 dispatched 48, EXP-11 32; the #392 hole one layer down).
    Each run drops <sid>/workflows/wf_*.json with an authoritative agentCount;
    the windowed sum joins the Agent-tool channel. None only when the session
    has no wf_*.json manifests at all -- unknown, folded as 0 beside a known
    count. Session-scoped by path (sid is a UUID), so the `*` over project slugs
    is safe -- same globbing trust as _agent_tool_dispatches' transcript leaf."""
    try:
        import glob
        hits = glob.glob(os.path.join(os.path.expanduser("~"), ".claude", "projects",
                                      "*", sid, "workflows", "wf_*.json"))
        if not hits:
            return None
        manifests = []
        for p in hits:
            try:
                with open(p, encoding="utf-8", errors="replace") as f:
                    manifests.append(json.load(f))
            except Exception:
                continue
        return _sum_wf_agents(manifests, since, until)
    except Exception:
        return None


def append_jsonl(name, row):
    try:
        os.makedirs(LOCAL, exist_ok=True)
        with open(os.path.join(LOCAL, name), "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
        return True
    except Exception:
        return False


def read_jsonl(name):
    rows = []
    try:
        with open(os.path.join(LOCAL, name), encoding="utf-8") as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    except Exception:
        pass
    return rows


CLAIM_EVENT = "claim"
RECEIPT_EVENT = "receipt"


def row_event(row):
    """The ledger's row kind, with the #777 compatibility rule: every row written
    before receipt rows existed carries NO `event`, and every one of them is a
    claim. Reading absent as "claim" is what keeps the historical series alive --
    a blanket `== "claim"` filter would empty `snaps` on every pre-#777 slice and
    render its usd/tok deltas n/a, silently, across the whole ledger."""
    return row.get("event") or CLAIM_EVENT


def claim_rows(rows):
    """The claim-time snapshots only -- what every cost/identity reader means by
    "the ledger". Receipt rows are boundary stamps and answer none of those
    questions (#777)."""
    return [r for r in rows if row_event(r) == CLAIM_EVENT]


def slice_snaps(rows, issue):
    """This issue's claim snapshots -- the ledger view every cost and identity
    reader wants. Pure over the ledger rows so --selftest can drive it (#319),
    which is the point: as an inline filter at the gh-dependent call site the
    receipt-row exclusion had no corpus that could reach it, and dropping it
    survived the #777 mutation battery."""
    return claim_rows(r for r in rows if r.get("issue") == issue)


def receipt_row(issue, sid, ts):
    """The slice-END boundary row (#777). A constructor so the shape is testable
    without a live gh: its no-`ident` property is the structural half of the
    #357 pin's defence, and a claim stated only in a comment is a prose
    invariant."""
    return {"issue": issue, "sid": sid, "event": RECEIPT_EVENT, "ts": ts}


def cmd_claim(issue):
    sid, ident = session_identity()
    usd = session_cost(sid) if sid else None
    tok = session_tokens(sid) if sid else None
    # #357: pin the identity at claim time -- session.json is rewritten by every
    # relaunch, and the receipt's `by=` must match the claim comment, not the
    # file's state at merge time.
    # `event` is written explicitly so new rows are self-describing, but it is
    # deliberately NOT load-bearing: row_event reads absent as "claim", so
    # dropping it here changes no behaviour and survives the #777 mutation
    # battery by design. That survivor is the compatibility guarantee holding,
    # not a gap to close -- the tag is for whoever reads the file by eye.
    ok = append_jsonl("slice_costs.jsonl",
                      {"issue": issue, "sid": sid, "event": CLAIM_EVENT,
                       "ident": ident, "usd": usd,
                       "tok": tok, "ts": now_iso()})
    shown = f"${usd:.2f}" if usd is not None else "n/a (no statusline snapshot yet)"
    shown_tok = ("transcript tokens captured" if tok is not None
                 else "no transcript (tok-* will read n/a)")
    out(f"claim snapshot #{issue} -> session cost {shown} · {shown_tok}"
        + ("" if ok else " -- WARNING: ledger write failed (telemetry lost, loop unaffected)"))


def receipt_identity(snaps, live_ident):
    """#357: the claim-time identity is authoritative for `by=`. session.json is
    rewritten by every relaunch (EXP-02 observed four session_start rows in four
    minutes; the #354 receipt carried a different id than its claim comment), so
    the live file loses to the pin. Newest snapshot with an identity wins --
    re-claims supersede, the same rule the wall-h claim-comment parse uses; rows
    predating #357 lack 'ident' and fall back to the live reading."""
    for r in reversed(snaps):
        if r.get("ident"):
            return r["ident"]
    return live_ident


def first_commit_ts(prj):
    """Earliest `committedDate` on the PR -> aware dt; None when unreadable.
    Pure over the gh JSON so --selftest can drive it (#319)."""
    seen = [parse_ts((c or {}).get("committedDate")) for c in (prj.get("commits") or [])]
    seen = [t for t in seen if t is not None]
    return min(seen) if seen else None


def claim_is_late(claim_ts, first_ts):
    """Did the cost window open after the work had already begun? (#617, #769)

    `claim` snapshots the counters `receipt` later diffs against, so a claim
    taken after the work reports a near-zero cost with nothing on the line to
    say so. Strict comparison, no slack: this is an ORDERING question -- did
    work already exist when the window opened? -- not a clock-granularity one,
    and ship_pr step 0 puts the claim minutes-to-hours ahead of it.
    Unknown on either side -> False: an accusation is never guessed, the same
    rule that renders usd/tok n/a rather than plausible.

    The test is unchanged since #617; what widened is what the caller passes as
    `first_ts` (see first_work_ts). The docstring used to say "committed" while
    the call-site comment asked whether the snapshot "bounds the work" -- the
    gap between those two sentences WAS the defect (#769), so they now say the
    same thing.
    """
    if claim_ts is None or first_ts is None:
        return False
    return claim_ts > first_ts


# #769: the ordering test's right-hand side is "first evidence of work", not
# "first commit". #617 closed the axis it was handed -- claim after first
# commit -- and the plainer sibling walked straight through: on a gated-skill
# slice the expensive work is subagent DISPATCH, and #730's two dispatches sat
# 56s outside the window while its first commit was still 8 minutes away, so
# the receipt read `agents=0` with no marker (ANTI_PATTERNS "The Half-Closed
# Class"). #634's ~142k under-reported subagent tokens are the same shape.
#
# This supersedes #665's note PARTLY -- #665 rejected widening because every
# candidate oracle for "work began" is confounded by a session that legitimately
# spans several slices. That objection is real, and it decided the scope here:
#   - DISPATCH is admitted. It is DELEGATED work, never mere activity (reading
#     the ticket -- #665's structural point, that investigation is unclaimable --
#     fires nothing), and it is rare and bursty, so a bounded lookback attributes
#     it to the right slice.
#   - The lookback is BOUNDED: back to the previous slice's boundary on this sid
#     -- its receipt where there is one, else its claim (#777) -- and never
#     further than PRE_CLAIM_LOOKBACK, so a session's first claim cannot reach
#     over hours of unrelated exploration.
#   - The file-EDIT oracle was HELD BACK TWICE before shipping, and the two
#     refusals bought the two halves of the fix. #769: the only boundary in the
#     ledger was the previous slice's CLAIM, so that slice's editing landed in
#     this one's window (1/4 -- #730 right, #737 and #769 falsely accused).
#     #777 added the slice-END boundary and took it to 4/4. #783 then found the
#     ticket's own premise incomplete: the confound is not "checkpoint edits",
#     it is BETWEEN-SLICE HOUSEKEEPING, and it has two halves that need
#     different fixes.
#       (a) The merge-time checkpoint edits CLAUDE.md/ROADMAP/METRICS. Those
#           land BEFORE the checkpoint's own merge, so a floor at the last
#           landing on the integration branch excludes them (last_main_landing_ts).
#       (b) The session-close auto-memory sweep writes AFTER that last merge, so
#           NO temporal floor can reach it -- measured on #777, whose window
#           held nothing but two memory-file writes and a scratchpad script. It
#           writes outside the working tree, though, so the tree boundary
#           separates it from slice work (in_repo).
#     Both together: 5/5 over every slice with settled ground truth, and #777 is
#     the case that discriminates them -- it flags under (a) alone and goes
#     silent only with (b).
#     The cost of (b) is a knowing FALSE NEGATIVE: #777's own pre-claim
#     investigation was a scratchpad measurement script, and the oracle cannot
#     see it. That is the accepted direction -- a known floor over a wrong
#     accusation -- and it is the same trade the whole module is built on.
# The tightening is not free for the oracle that shipped first: a dispatch in the
# previous slice's tail no longer counts against this slice either, so both
# boundaries sharpen the dispatch oracle in the same motion (re-measured: verdicts
# unchanged, windows strictly smaller).
# A wrong accusation is worse than a known floor -- that principle admitted the
# dispatch oracle and rejected the edit one, on measurement rather than taste.
PRE_CLAIM_LOOKBACK = datetime.timedelta(hours=2)


def prior_snapshot_ts(rows, sid, claim_ts):
    """Newest boundary of ANY kind on `sid` strictly before `claim_ts` -- how far
    back pre-claim work may be attributed to THIS slice (#769, #777). Pure over
    the ledger rows so --selftest can drive it (#319).

    This is the ONE reader that wants receipt rows, and the reason they exist:
    where a claim row says "the previous slice began", a receipt row says it
    ENDED, which is the bound the question actually needs. Un-filtered by
    design, then -- `max` picks the receipt when there is one and degrades to
    the previous claim when that slice was parked without a receipt. Every OTHER
    reader goes through claim_rows(); this one must not."""
    if claim_ts is None:
        return None
    seen = [parse_ts(r.get("ts")) for r in rows if r.get("sid") == sid]
    seen = [t for t in seen if t is not None and t < claim_ts]
    return max(seen) if seen else None


def pre_claim_window(claim_ts, prior_snap_ts):
    """(since, until) over which pre-claim work counts as THIS slice's (#769).
    `prior_snap_ts` is the newest claim snapshot on this sid before `claim_ts`.
    (None, None) when there is no claim to anchor -- nothing to bound."""
    if claim_ts is None:
        return None, None
    since = claim_ts - PRE_CLAIM_LOOKBACK
    if prior_snap_ts is not None and prior_snap_ts > since:
        since = prior_snap_ts
    return since, claim_ts


def first_work_ts(*stamps):
    """Earliest non-None stamp -- the widened right-hand side (#769). None when
    every source is silent, which claim_is_late renders as no accusation."""
    seen = [t for t in stamps if t is not None]
    return min(seen) if seen else None


def latest_boundary(*stamps):
    """Newest non-None stamp -- the TIGHTEST valid floor (#783), mirroring
    first_work_ts at the other end of the window. Every argument is a lower
    bound on "work before this cannot be ours", so the newest of them is still
    a valid bound and the narrowest available."""
    seen = [t for t in stamps if t is not None]
    return max(seen) if seen else None


# The integration branch, best-effort: the shared ref first, then the local one,
# then the older spelling. Unresolvable -> None, and the floor degrades to the
# receipt row alone, which already measured 5/5 (#783). A project whose default
# branch is named something else loses the tightening, never correctness.
MAIN_REFS = ("origin/main", "main", "origin/master", "master")


def last_main_landing_ts(before_ts, refs=MAIN_REFS, run=None):
    """Newest commit on the integration branch strictly before `before_ts`.

    Why this is a floor at all (#783): whatever predates the last landing was
    already merged, so it belongs to what landed -- not to a slice claimed
    afterwards. That is what excludes the merge-time CHECKPOINT's edits from the
    next slice's pre-claim window, since the checkpoint's own merge lands after
    them. `run` is injectable so --selftest drives this without a git call.
    """
    if before_ts is None:
        return None
    runner = run or (lambda args: subprocess.run(
        args, capture_output=True, text=True, timeout=30,
        encoding="utf-8", errors="replace"))
    for ref in refs:
        try:
            # --before filters on commit date, which for a squash merge IS the
            # landing time -- the thing we want, not the authoring time.
            r = runner(["git", "log", ref, "--format=%cI", "-1",
                        "--before=" + before_ts.isoformat()])
            if r.returncode == 0 and (r.stdout or "").strip():
                ts = parse_ts(r.stdout.strip())
                if ts is not None:
                    return ts
        except Exception:
            continue
    return None


def in_repo(path, root):
    """Is `path` inside the repo working tree? (#783)

    The other half of the between-slice confound, and the half no temporal floor
    can reach: the session-close auto-memory sweep writes AFTER the last merge
    and before the next claim, so it lands in the window however tight the floor
    is. It writes outside the tree, though -- as does every scratchpad file -- so
    the tree boundary separates "changed the project" from housekeeping.

    normcase because Windows paths differ in case and separator; a falsy or
    unresolvable path is NOT in the repo, so an unreadable input costs a missed
    flag rather than an invented one."""
    if not path or not root:
        return False
    try:
        p = os.path.normcase(os.path.abspath(path))
        r = os.path.normcase(os.path.abspath(root))
        return p == r or p.startswith(r + os.sep)
    except Exception:
        return False


EDIT_TOOLS = ("Edit", "Write", "MultiEdit", "NotebookEdit")


def first_edit_ts(sid, since, until, root=None):
    """Earliest edit to a file INSIDE the repo for `sid` in [since, until]
    (#783); None when there is none. Transcript-only -- unlike dispatches the
    harness keeps no edit ledger, so there is no preferred source to fall back
    from."""
    root = root if root is not None else os.getcwd()
    return _first_tool_use_ts(sid, EDIT_TOOLS, since, until,
                              path_ok=lambda p: in_repo(p, root))


def claim_start(comments, merged):
    """Slice-start stamp := the server-side createdAt of the last QUALIFYING
    claim comment. Pure over the gh JSON so --selftest can drive it (#319).

    Three rules, each earned (#683, intake #680):

    - **createdAt, not the body stamp.** The body is written by the session
      being measured; createdAt is written by GitHub. Same comment, one
      trustworthy clock.
    - **A claim created after mergedAt cannot have started this slice** -- on a
      multi-PR ticket it belongs to a later one, and admitting it drives wall_h
      to 0 via the max(..., 0) floor. That floor turns a wrong start into a
      *plausible* number, which is the dangerous kind.
    - **Last qualifying claim wins**, so a re-claim still supersedes -- the
      behaviour the body-stamp version had, preserved deliberately.

    None -> the caller falls back to wall-src=pr-open, exactly as before: an
    approximation is marked, never silently mixed with a measurement.
    """
    best = None
    for c in comments or []:
        if not CLAIM_RE.search(c.get("body") or ""):
            continue
        ts = parse_ts(c.get("createdAt"))
        if ts is None or (merged is not None and ts > merged):
            continue
        if best is None or ts > best:
            best = ts
    return best


def cmd_receipt(pr, issue, dry_run):
    prj = gh_json(["pr", "view", str(pr),
                   "--json", "mergedAt,createdAt,additions,deletions,changedFiles,commits,headRefName"])
    if prj is None:
        out(f"receipt: gh unreachable or PR {pr} unreadable -- no receipt posted (fail-soft)")
        return

    merged = parse_ts(prj.get("mergedAt")) or datetime.datetime.now(datetime.timezone.utc)

    # Wall clock: the claim comment is the canonical slice-start stamp.
    wall_src = "claim"
    ij = gh_json(["issue", "view", str(issue), "--json", "comments"]) or {}
    start = claim_start(ij.get("comments"), merged)
    if start is None:
        start = parse_ts(prj.get("createdAt"))
        wall_src = "pr-open"
    wall_h = max((merged - start).total_seconds(), 0) / 3600 if start else None

    # -L 100: gh's default 20-row page silently truncates busy branches (#559).
    # Known residual: a re-used branch name counts prior runs too -- slice
    # branches carry the issue number, so collisions are rare by construction.
    ci = gh_json(["run", "list", "--branch", prj.get("headRefName") or "",
                  "-L", "100", "--json", "databaseId"])
    ci_runs = len(ci) if isinstance(ci, list) else None

    # Session-cost delta: honest only within one session on one box; else n/a.
    sid, live_ident = session_identity()
    # Claims only, never every row: `usd`/`tok`/`ident`/`win_start` all mean "as
    # of the claim", and a receipt row answers none of them (#777). Without that
    # filter a re-run of `receipt` would read its own previous boundary row as
    # the snapshot -- zeroed deltas and an identity that outranks the #357 pin.
    issue_snaps = slice_snaps(read_jsonl("slice_costs.jsonl"), issue)
    ident = receipt_identity(issue_snaps, live_ident)
    usd = None
    tok = None
    agents = None
    late_claim = False
    if sid:
        # Deltas keep the same-sid filter: a delta across a session rewrite
        # would mix two streams -- identity pins (#357), honesty rules don't.
        snaps = [r for r in issue_snaps if r.get("sid") == sid]
        # #617/#769: does the snapshot that anchors usd/tok actually bound the
        # work? Three oracles now, not one -- commits are the slice's own, while
        # dispatches and edits are read over the bounded pre-claim window so an
        # earlier slice's fan-out in the same session cannot be blamed on this
        # one (the confound #665 named, and the reason for the bound).
        claim_ts = parse_ts(snaps[-1].get("ts")) if snaps else None
        # Deleting the landing-floor argument below is the one #783 mutation NO
        # gate here can catch -- not the corpus (it is wiring) and not the live
        # replay either, because the only thing the landing floor excludes that
        # the receipt row does not is a checkpoint that HAND-EDITS the trio, and
        # under #361 this repo's checkpoint is a metrics.py run. It is held by
        # the `checkpoint-window` fixture pair in selftest(), which composes the
        # same boundary/window/core path over a synthetic downstream timeline and
        # asserts that the receipt floor alone falsely accuses. Named here so the
        # gap reads as known rather than as coverage.
        pre_since, pre_until = pre_claim_window(claim_ts, latest_boundary(
            prior_snapshot_ts(read_jsonl("slice_costs.jsonl"), sid, claim_ts),
            last_main_landing_ts(claim_ts),
        ))
        late_claim = claim_is_late(claim_ts, first_work_ts(
            first_commit_ts(prj),
            first_dispatch_ts(sid, pre_since, pre_until),
            first_edit_ts(sid, pre_since, pre_until),
        ))
        cur = session_cost(sid)
        if snaps and cur is not None and isinstance(snaps[-1].get("usd"), (int, float)):
            delta = cur - snaps[-1]["usd"]
            if delta >= 0:
                usd = delta
        # Token delta from the harness transcript (#366) -- the fallback cost
        # signal where the statusline never fires; same claim -> receipt shape.
        if snaps:
            tok = tok_delta(snaps[-1].get("tok"), session_tokens(sid))
        # Fan-out over the same window the cost delta covers (#392): the claim
        # snapshot if there is one, else the claim comment that anchors wall-h.
        # Same-sid honesty extends to agents (#559): when the claim was
        # snapshotted under a DIFFERENT session id (mid-slice relaunch, #357),
        # the live sid's ledger covers only the slice's tail -- a count would
        # be a confident undercount (agents=0 on a slice that dispatched 10
        # pre-relaunch), while usd/tok honestly read n/a on the same line.
        # n/a beats a plausible wrong value.
        if snaps:
            win_start = parse_ts(snaps[-1].get("ts"))
            agents = dispatch_count(sid, win_start or start, merged) if (win_start or start) else None
        elif issue_snaps:
            agents = None
        else:
            agents = dispatch_count(sid, start, merged) if start else None

    parts = [
        "cost:",
        f"wall-h={wall_h:.2f}" if wall_h is not None else "wall-h=n/a",
        f"commits={len(prj.get('commits') or [])}",
        f"files={prj.get('changedFiles', 0)}",
        f"diff=+{prj.get('additions', 0)}/-{prj.get('deletions', 0)}",
        f"ci-runs={ci_runs}" if ci_runs is not None else "ci-runs=n/a",
        f"usd={usd:.2f}" if usd is not None else "usd=n/a",
        f"tok-out={fmt_tok(tok['output_tokens'])}" if tok else "tok-out=n/a",
        (f"tok-in={fmt_tok(tok['input_tokens'] + tok['cache_creation_input_tokens'])}"
         if tok else "tok-in=n/a"),
        f"tok-cache={fmt_tok(tok['cache_read_input_tokens'])}" if tok else "tok-cache=n/a",
        f"agents={agents}" if agents is not None else "agents=n/a",
        f"by={ident or 'unknown'}",
    ]
    if wall_src == "pr-open":
        parts.append("wall-src=pr-open")
    if late_claim:
        parts.append("cost-src=late-claim")
    line = " ".join(parts)

    if dry_run:
        out(f"dry-run (not posted): {line}")
        return

    # The slice-END boundary (#777) -- the whole point of the row. Written before
    # the comment goes out, because the slice ended either way: a gh hiccup must
    # not cost the NEXT slice its floor. Deliberately minimal, and deliberately
    # WITHOUT `ident`: receipt rows can then never satisfy receipt_identity's
    # scan even if a future reader forgets claim_rows(), which is the #759 lesson
    # -- prefer making the hazard structurally absent to remembering the rule.
    append_jsonl("slice_costs.jsonl", receipt_row(issue, sid, now_iso()))

    try:
        r = subprocess.run(["gh", "pr", "comment", str(pr), "--body", line],
                           capture_output=True, text=True, timeout=90,
                           encoding="utf-8", errors="replace")
        posted = r.returncode == 0
    except Exception:
        posted = False
    print(line)
    if not posted:
        out(f"WARNING: could not post the receipt comment on PR {pr} -- "
            "line printed above; post it manually or let the next receipt carry on")


def cmd_preflight(seconds, failed, skipped):
    append_jsonl("preflight_times.jsonl",
                 {"ts": now_iso(), "seconds": seconds,
                  "result": "FAIL" if failed else "PASS", "skipped": skipped})


def selftest():
    # Pure-function corpus (offline, side-effect-free per #319; registered in
    # audit_ops_config's SELFTEST_SCRIPTS). Proven to bite at authoring time by
    # mutating fmt_tok's M-threshold, tok_delta's monotone guard (#424), and
    # receipt_identity's pin-vs-live preference (#357).
    failed = 0
    fmt_cases = [
        ("raw small", 421, "421"),
        ("k boundary", 1_000, "1.0k"),
        ("sub-k stays raw", 999, "999"),
        ("k rounding", 55_673, "55.7k"),
        ("M boundary", 1_000_000, "1.0M"),
        ("#366 probe magnitude", 171_178_929, "171.2M"),
        ("zero", 0, "0"),
    ]
    for name, n, want in fmt_cases:
        got = fmt_tok(n)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} fmt-tok: {name} -> {got}" + ("" if ok else f" (want {want})"))
    # #749: the owner reads this line to decide continue-vs-compact, so every
    # absent value must degrade to `n/a` rather than to a plausible number.
    status_cases = [
        ("both present", {"cost_usd": 163.68, "context_used_pct": 7},
         "$163.68 this session, ctx 7% used"),
        ("peak above current is shown (a compaction happened)",
         {"cost_usd": 163.68, "context_used_pct": 7, "peak_context_pct": 28},
         "$163.68 this session, ctx 7% used (peak 28%)"),
        ("peak equal to current is noise, not shown",
         {"cost_usd": 1.0, "context_used_pct": 40, "peak_context_pct": 40},
         "$1.00 this session, ctx 40% used"),
        ("empty snapshot -> n/a both", {}, "cost n/a, ctx n/a"),
        ("cost missing, ctx present", {"context_used_pct": 12},
         "cost n/a, ctx 12% used"),
        ("ctx missing -> n/a, never 0%", {"cost_usd": 2.5}, "$2.50 this session, ctx n/a"),
        ("non-numeric ctx is absent, not coerced",
         {"cost_usd": 2.5, "context_used_pct": "7"}, "$2.50 this session, ctx n/a"),
    ]
    for name, snap, want in status_cases:
        got = format_status(snap)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} status-line: {name} -> {got!r}"
              + ("" if ok else f" (want {want!r})"))

    base = dict.fromkeys(TOK_KEYS, 100)
    grown = {k: 150 for k in TOK_KEYS}
    shrunk = dict(grown, output_tokens=50)
    delta_cases = [
        ("monotone growth", base, grown, {k: 50 for k in TOK_KEYS}),
        ("equal readings (zero delta ok)", base, dict(base), {k: 0 for k in TOK_KEYS}),
        ("one class shrunk -> n/a, never clamped", base, shrunk, None),
        ("claim side missing -> n/a", None, grown, None),
        ("receipt side missing -> n/a", base, None, None),
        ("claim missing a class -> n/a", {"output_tokens": 1}, grown, None),
        ("non-numeric class -> n/a", dict(base, output_tokens="x"), grown, None),
    ]
    for name, a, b, want in delta_cases:
        got = tok_delta(a, b)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} tok-delta: {name}" + ("" if ok else f" -> {got!r} (want {want!r})"))
    # #478 fixture: the duplicated-row corpus whose absence let the 2-4x
    # over-count ship. One assistant message = one row per content block,
    # usage repeated; a streamed final row may differ (keep-LAST wins).
    def _row(rid, mid, out, blocks=0, ts="2026-07-20T12:00:00Z"):
        return json.dumps({"requestId": rid, "timestamp": ts, "message": {
            "id": mid,
            "usage": {"input_tokens": 1, "output_tokens": out,
                      "cache_creation_input_tokens": 0, "cache_read_input_tokens": 10},
            "content": [{"type": "tool_use", "name": "Agent"}] * blocks}})
    usage_lines = [
        _row("r1", "m1", 100), _row("r1", "m1", 100), _row("r1", "m1", 120),
        _row("r2", "m2", 50),
        json.dumps({"message": {"usage": {"output_tokens": 7}}}),  # identity-less
    ]
    dd = _dedupe_usage(usage_lines)
    out_sum = sum(u.get("output_tokens", 0) for u in dd.values())
    for name, got, want in [
            ("keep-last per message (naive would sum 377)", out_sum, 177),
            ("unique messages", len(dd), 3)]:
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} usage-dedupe: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))
    disp_lines = [
        _row("r3", "m3", 1, blocks=1), _row("r3", "m3", 1, blocks=2),  # cumulative prefix
        _row("r4", "m4", 1, blocks=2), _row("r4", "m4", 1, blocks=2),  # full replication
        _row("r5", "m5", 1, blocks=1, ts="2026-07-20T14:00:00Z"),      # outside window
    ]
    got = _dispatch_blocks(disp_lines, parse_ts("2026-07-20T11:00:00Z"),
                           parse_ts("2026-07-20T13:00:00Z"))
    ok = got == 4
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'} dispatch-dedupe: max-per-message in window "
          f"(naive would count 7)" + ("" if ok else f" -> {got!r} (want 4)"))
    # #547 fixture: workflow fan-out summed from wf_*.json manifests, windowed.
    # A session can run several slices' workflows (this one ran three: 48, 32,
    # 56); a slice receipt must credit only the run(s) inside its window -- naive
    # (sum every agentCount) would report 143, the exact over-count the windowing
    # exists to prevent. Real values: EXP-12's 48-agent run at 00:44 lands, the
    # 32/56 runs from earlier slices in the same session do not.
    w_since = parse_ts("2026-07-24T00:00:00Z")
    w_until = parse_ts("2026-07-24T01:00:00Z")
    wf_manifests = [
        {"agentCount": 48, "timestamp": "2026-07-24T00:44:17.683Z"},  # in window (EXP-12)
        {"agentCount": 32, "timestamp": "2026-07-23T23:01:43.284Z"},  # earlier slice -> excluded
        {"agentCount": 56, "startTime": 1784845531845},               # epoch-ms fallback, 22:27 -> excluded
        {"agentCount": 7},                                            # no time -> included (err on inclusion)
        {"timestamp": "2026-07-24T00:30:00Z"},                       # no agentCount -> 0
        {"agentCount": "x", "timestamp": "2026-07-24T00:30:00Z"},    # non-int -> 0
        {"agentCount": True, "timestamp": "2026-07-24T00:30:00Z"},   # bool guarded -> 0
    ]
    wf_cases = [
        ("windowed sum: in-window + untimed only (naive sums 143)",
         _sum_wf_agents(wf_manifests, w_since, w_until), 55),
        ("empty -> 0", _sum_wf_agents([], w_since, w_until), 0),
        ("both runs inside a window sum fully",
         _sum_wf_agents([{"agentCount": 48, "timestamp": "2026-07-24T00:44:17.683Z"},
                         {"agentCount": 32, "timestamp": "2026-07-24T00:45:00Z"}],
                        w_since, w_until), 80),
    ]
    for name, got, want in wf_cases:
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} wf-agents: {name}" + ("" if ok else f" -> {got!r} (want {want!r})"))
    epoch_cases = [
        ("epoch-ms -> aware dt", _epoch_ms(1784845531845) is not None, True),
        ("non-numeric -> None", _epoch_ms("x"), None),
        ("bool -> None (not a real epoch)", _epoch_ms(True), None),
        ("None -> None", _epoch_ms(None), None),
    ]
    for name, got, want in epoch_cases:
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} epoch-ms: {name}" + ("" if ok else f" -> {got!r} (want {want!r})"))
    live = "box/live1234"
    ident_cases = [
        ("divergence: claim-time pin beats live (#357 AC1)",
         [{"ident": "box/aaaa1111"}], live, "box/aaaa1111"),
        ("agreement: unchanged (#357 AC2)", [{"ident": live}], live, live),
        ("re-claim supersedes: newest pin wins",
         [{"ident": "box/old00001"}, {"ident": "box/new00002"}], live, "box/new00002"),
        ("pre-#357 rows lack ident -> live fallback", [{"sid": "x"}], live, live),
        ("no snapshots -> live", [], live, live),
        ("newest row unpinned, older pinned -> older pin",
         [{"ident": "box/old00001"}, {"sid": "y"}], live, "box/old00001"),
        ("nothing anywhere -> None (renders by=unknown)", [{}], None, None),
    ]
    for name, snaps, live_i, want in ident_cases:
        got = receipt_identity(snaps, live_i)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} receipt-ident: {name}" + ("" if ok else f" -> {got!r} (want {want!r})"))
    # #617 fixture: the input that caused the defect. ship_pr step 0 was skipped
    # on #603, so the snapshot was taken AFTER the work and the receipt read
    # tok-out=834 against a comparable slice's 21.2k -- authoritative-looking,
    # ~4% of the truth, and already in the series. The detector is an ordering
    # question, so the corpus is three timestamps.
    t_early, t_commit, t_late = (parse_ts("2026-07-25T01:00:00Z"),
                                 parse_ts("2026-07-25T02:00:00Z"),
                                 parse_ts("2026-07-25T03:00:00Z"))
    late_cases = [
        ("claim precedes the first commit -> sound window", t_early, t_commit, False),
        ("claim postdates it -> late (#603's shape)", t_late, t_commit, True),
        ("claim exactly at the first commit -> sound (strictly after, no slack)",
         t_commit, t_commit, False),
        ("no claim snapshot -> no accusation", None, t_commit, False),
        ("no commit dates -> no accusation", t_late, None, False),
    ]
    for name, a, b, want in late_cases:
        got = claim_is_late(a, b)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} late-claim: {name}" + ("" if ok else f" -> {got!r} (want {want!r})"))
    fc_cases = [
        ("earliest of several commits anchors the window",
         {"commits": [{"committedDate": "2026-07-25T04:00:00Z"},
                      {"committedDate": "2026-07-25T02:00:00Z"}]}, t_commit),
        ("a dateless commit doesn't mask a dated one",
         {"commits": [{}, {"committedDate": "2026-07-25T02:00:00Z"}]}, t_commit),
        ("no commits -> None (renders no marker)", {}, None),
        ("unparseable dates -> None", {"commits": [{"committedDate": "nope"}]}, None),
    ]
    for name, prj, want in fc_cases:
        got = first_commit_ts(prj)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} first-commit: {name}" + ("" if ok else f" -> {got!r} (want {want!r})"))

    # #769: the widened right-hand side. The axis is WHICH ARTIFACT proves work
    # began -- commit, dispatch, edit -- and #617's corpus pinned exactly one
    # point on it, which is how #730's two pre-claim dispatches walked through.
    # A case per point, each paired with the must-NOT-flag neighbour that keeps
    # the repair from going over-broad (the bar #766 set).
    t_dispatch, t_edit = parse_ts("2026-07-25T01:30:00Z"), parse_ts("2026-07-25T01:45:00Z")
    fw_cases = [
        ("commit alone (the #617 axis point)", (t_commit, None, None), t_commit),
        ("dispatch alone (#730's shape -- no commit existed yet)",
         (None, t_dispatch, None), t_dispatch),
        ("dispatch precedes the commit -> dispatch wins",
         (t_commit, t_dispatch), t_dispatch),
        ("every oracle silent -> None, and no accusation downstream",
         (None, None), None),
        # Variadic on purpose: the edit oracle is a third argument away when
        # #777 supplies a slice boundary it can be trusted against.
        ("a third oracle would just be another argument",
         (t_commit, t_dispatch, t_edit), t_dispatch),
    ]
    for name, stamps, want in fw_cases:
        got = first_work_ts(*stamps)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} first-work: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # The must-not-flag neighbours, stated as the end-to-end verdict: an honest
    # claim whose work all sits INSIDE the window must stay silent, or the
    # widening has bought a false accusation -- worse than the floor it fixes.
    honest_cases = [
        ("honest claim, dispatch strictly inside the window -> silent",
         t_early, first_work_ts(t_commit, None, None), False),
        ("honest claim, nothing anywhere -> silent", t_early, first_work_ts(None, None, None),
         False),
        ("pre-claim dispatch -> flagged (#730's receipt, corrected)",
         t_late, first_work_ts(None, t_dispatch, None), True),
        ("pre-claim commit -> flagged (#617's original axis point)",
         t_late, first_work_ts(t_commit, None), True),
    ]
    for name, a, b, want in honest_cases:
        got = claim_is_late(a, b)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} late-claim-widened: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # #777's axis is the `event` field, so the corpus visits every point on it --
    # absent (every row written before #777), "claim", "receipt", and a value
    # from the future -- because the migration path is the whole risk here (#766).
    legacy = {"ts": "2026-07-25T01:00:00Z", "usd": 1.0, "ident": "box/legacy01"}
    claimed = {"event": "claim", "ts": "2026-07-25T02:00:00Z", "usd": 2.0,
               "ident": "box/claim001"}
    receipted = {"event": "receipt", "ts": "2026-07-25T02:30:00Z"}
    event_cases = [
        ("an absent event reads as claim -- the pre-#777 compatibility rule",
         row_event(legacy), CLAIM_EVENT),
        ("an explicit claim reads as claim", row_event(claimed), CLAIM_EVENT),
        ("a receipt reads as receipt", row_event(receipted), RECEIPT_EVENT),
        # The must-not-drop neighbour: a legacy-only ledger is EVERY slice before
        # #777. If the filter dropped these, snaps[-1] would go empty and every
        # historical usd/tok delta would render n/a -- silently, which is why this
        # is asserted on the list and not only on row_event.
        ("a legacy-only ledger survives the filter intact",
         claim_rows([legacy]), [legacy]),
        ("claims are kept, receipts dropped, order preserved",
         claim_rows([legacy, claimed, receipted]), [legacy, claimed]),
        ("an unknown future event is not a claim",
         claim_rows([{"event": "unclaim", "ts": "2026-07-25T03:00:00Z"}]), []),
        ("a receipt-only ledger yields no snapshot (deltas read n/a, not zero)",
         claim_rows([receipted]), []),
        # Structural, not remembered (#759): receipt rows carry no `ident`, so the
        # #357 pin holds even against a reader that forgot claim_rows().
        ("a receipt row cannot supply an identity even unfiltered",
         receipt_identity([claimed, receipted], live), "box/claim001"),
        # ...and with the filter, a receipt row that somehow GAINED one still loses.
        ("a filtered receipt row loses to the claim pin even carrying an ident",
         receipt_identity(claim_rows([claimed, dict(receipted, ident="box/rcpt0001")]),
                          live), "box/claim001"),
        # The WRITER's half of that guarantee -- the fixtures above prove the
        # readers survive an identity-bearing receipt row, this proves we never
        # write one.
        ("the row we actually write carries no identity to be found",
         "ident" in receipt_row(7, "S", "2026-07-25T02:30:00Z"), False),
        ("the row we actually write is tagged, so it is never read as a claim",
         row_event(receipt_row(7, "S", "2026-07-25T02:30:00Z")), RECEIPT_EVENT),
        # The reader the receipt path actually calls. Kept pure for exactly this
        # reason: the inline version of this filter survived the battery.
        ("the receipt reader takes this issue's claims and no receipt row",
         slice_snaps([dict(legacy, issue=7), dict(claimed, issue=7),
                      dict(receipted, issue=7), dict(claimed, issue=8)], 7),
         [dict(legacy, issue=7), dict(claimed, issue=7)]),
        ("the receipt reader still sees a pre-#777 slice's only row",
         slice_snaps([dict(legacy, issue=7)], 7), [dict(legacy, issue=7)]),
        ("a slice whose every row is a receipt reads as unsnapshotted",
         slice_snaps([dict(receipted, issue=7)], 7), []),
    ]
    for name, got, want in event_cases:
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} ledger-event: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # The bound that answers #665's confound: pre-claim work is attributed to
    # this slice only back to the previous slice's BOUNDARY on the same session
    # -- its receipt where there is one (#777), else its claim -- and never
    # further than PRE_CLAIM_LOOKBACK.
    t_prev = parse_ts("2026-07-25T02:30:00Z")
    rows = [{"sid": "S", "ts": "2026-07-25T02:30:00Z"},
            {"sid": "S", "ts": "2026-07-25T00:10:00Z"},
            {"sid": "OTHER", "ts": "2026-07-25T02:55:00Z"}]
    bound_cases = [
        ("newest prior snapshot on this sid bounds the lookback",
         (rows, "S", t_late), t_prev),
        ("another session's snapshot never bounds ours",
         (rows, "OTHER", t_late), parse_ts("2026-07-25T02:55:00Z")),
        ("a snapshot at or after the claim is not prior",
         (rows, "S", parse_ts("2026-07-25T00:05:00Z")), None),
        ("a snapshot EXACTLY at the claim is not prior (strictly before, no slack)",
         (rows, "S", t_prev), parse_ts("2026-07-25T00:10:00Z")),
        ("no claim -> nothing to bound", (rows, "S", None), None),
        # #777, and the reason receipt rows exist: the previous slice's END is a
        # tighter floor than its start, so its own editing stops landing in this
        # slice's window. This reader is the one that must NOT filter to claims.
        ("the previous slice's receipt outranks its claim as the floor",
         ([{"sid": "S", "event": "claim", "ts": "2026-07-25T02:00:00Z"},
           {"sid": "S", "event": "receipt", "ts": "2026-07-25T02:40:00Z"}],
          "S", t_late), parse_ts("2026-07-25T02:40:00Z")),
        # Degradation, asserted rather than assumed: a parked slice posts no
        # receipt, and the floor falls back to the old claim bound.
        ("a prior slice parked without a receipt still bounds at its claim",
         ([{"sid": "S", "event": "claim", "ts": "2026-07-25T02:00:00Z"}],
          "S", t_late), parse_ts("2026-07-25T02:00:00Z")),
        ("another session's receipt never bounds ours",
         ([{"sid": "S", "event": "claim", "ts": "2026-07-25T02:00:00Z"},
           {"sid": "OTHER", "event": "receipt", "ts": "2026-07-25T02:50:00Z"}],
          "S", t_late), parse_ts("2026-07-25T02:00:00Z")),
    ]
    for name, (rws, s, cts), want in bound_cases:
        got = prior_snapshot_ts(rws, s, cts)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} prior-snapshot: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # #783: the floor is the NEWEST of its sources, mirroring first_work_ts at
    # the other end. Every source is a valid lower bound, so the newest is still
    # valid and is the narrowest window available.
    t_land = parse_ts("2026-07-25T02:45:00Z")
    boundary_cases = [
        ("the landing outranks an older receipt row", (t_prev, t_land), t_land),
        ("the receipt row outranks an older landing", (t_land, t_prev), t_land),
        ("an unreadable landing leaves the receipt row as the floor",
         (t_prev, None), t_prev),
        # The degradation that keeps this safe to add: git silent on both refs
        # and no prior row -> no floor, and pre_claim_window falls back to the cap.
        ("both silent -> no floor, never a zero", (None, None), None),
    ]
    for name, args, want in boundary_cases:
        got = latest_boundary(*args)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} latest-boundary: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # last_main_landing_ts with git injected, so the corpus never shells out.
    def fake_git(out="2026-07-25T02:45:00+00:00\n", rc=0, seen=None):
        def run(args):
            if seen is not None:
                seen.append(args)
            class R:
                returncode = rc
                stdout = out
            return R()
        return run

    seen = []
    got = last_main_landing_ts(t_late, run=fake_git(seen=seen))
    ok = got == t_land and seen and "origin/main" in seen[0]
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'} landing: the shared ref is asked first"
          + ("" if ok else f" -> {got!r} via {seen[:1]!r}"))
    # The bound has to be passed to git, or the newest commit overall comes back
    # and the floor lands in the FUTURE of the claim -- an empty window.
    ok = any(a.startswith("--before=") and t_late.isoformat() in a for a in seen[0])
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'} landing: the claim bounds the git query"
          + ("" if ok else f" -> {seen[0]!r}"))
    landing_cases = [
        ("a git failure is not a floor", last_main_landing_ts(t_late, run=fake_git(rc=1)), None),
        ("an empty history is not a floor",
         last_main_landing_ts(t_late, run=fake_git(out="\n")), None),
        ("an unparseable stamp is not a floor",
         last_main_landing_ts(t_late, run=fake_git(out="not-a-date\n")), None),
        ("no claim to bound -> nothing asked",
         last_main_landing_ts(None, run=fake_git()), None),
        # Local-offset stamps are what `git log --format=%cI` actually emits;
        # comparing them as if UTC would move the floor by the offset. (Reading
        # exactly this wrong cost a confused measurement pass on this slice.)
        ("a local-offset stamp is normalized, not read as UTC",
         last_main_landing_ts(t_late, run=fake_git(out="2026-07-24T21:45:00-05:00\n")),
         t_land),
    ]
    for name, got, want in landing_cases:
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} landing: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # in_repo: the half of the confound no floor can reach. Axis = where the file
    # lives, so the corpus visits inside / outside / adjacent / unreadable.
    root = os.path.normcase(os.path.abspath(os.sep + os.path.join("w", "proj")))
    repo_cases = [
        ("a tracked file is in the tree",
         in_repo(os.path.join(root, "scripts", "x.py"), root), True),
        ("the session-close memory sweep is not (the #777 case)",
         in_repo(os.path.join(os.sep, "home", "u", ".claude", "memory", "m.md"), root),
         False),
        ("a scratchpad script is not -- a knowing false negative, accepted",
         in_repo(os.path.join(os.sep, "tmp", "scratch", "measure.py"), root), False),
        # The prefix trap: a SIBLING directory sharing the repo's name prefix
        # must not read as inside it. `startswith(root)` alone says it does.
        ("a sibling sharing the name prefix is outside", in_repo(root + "-old", root), False),
        ("the root itself counts as inside", in_repo(root, root), True),
        ("no path is not a flag", in_repo(None, root), False),
        ("no root is not a flag", in_repo(os.path.join(root, "a.py"), ""), False),
    ]
    for name, got, want in repo_cases:
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} in-repo: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    win_cases = [
        ("prior claim inside the cap -> it is the floor", (t_late, t_prev), t_prev),
        ("prior claim older than the cap -> the cap is the floor",
         (t_late, parse_ts("2026-07-24T00:00:00Z")), t_late - PRE_CLAIM_LOOKBACK),
        ("no prior claim -> the cap alone bounds it", (t_late, None),
         t_late - PRE_CLAIM_LOOKBACK),
        ("no claim -> no window at all", (None, t_prev), None),
    ]
    for name, (cts, pts), want in win_cases:
        since, until = pre_claim_window(cts, pts)
        ok = since == want and until == cts
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} pre-claim-window: {name}"
              + ("" if ok else f" -> since={since!r} (want {want!r})"))

    # The transcript scan's pure core. Fixtures are the harness row shape; the
    # replayed-row case is the one _dispatch_blocks needed a dedupe for and a
    # min does not -- asserted rather than assumed.
    tu_rows = [
        json.dumps({"timestamp": "2026-07-25T01:45:00Z",
                    "message": {"content": [{"type": "tool_use", "name": "Edit"}]}}),
        json.dumps({"timestamp": "2026-07-25T01:50:00Z",
                    "message": {"content": [{"type": "tool_use", "name": "Write"}]}}),
        json.dumps({"timestamp": "2026-07-25T01:45:00Z",
                    "message": {"content": [{"type": "tool_use", "name": "Edit"}]}}),
    ]
    read_only = [json.dumps({"timestamp": "2026-07-25T01:20:00Z",
                             "message": {"content": [{"type": "tool_use", "name": "Read"}]}})]
    # An edit BEFORE the lookback floor: the previous slice's work, which the
    # bound exists to keep off this slice's receipt (#665's confound).
    out_of_window = [json.dumps({"timestamp": "2026-07-25T00:30:00Z",
                                 "message": {"content": [{"type": "tool_use",
                                                          "name": "Edit"}]}})]
    decoy = [json.dumps({"timestamp": "2026-07-25T01:10:00Z",
                         "message": {"content": [{"type": "tool_use", "name": "Grep",
                                                  "input": {"pattern": "Agent"}}]}})]
    tu_cases = [
        ("earliest matching tool use wins", tu_rows, ("Edit", "Write"), t_edit),
        ("a replayed row cannot move a min", tu_rows, ("Edit", "Write"), t_edit),
        ("an edit before the lookback floor is the PREVIOUS slice's, not ours",
         out_of_window, ("Edit", "Write"), None),
        ("a Read sweep is not a dispatch -- #665's structural point holds",
         read_only, DISPATCH_TOOLS, None),
        ("an edit is not a dispatch", tu_rows, DISPATCH_TOOLS, None),
        # The cheap prefilter admits this row -- grepping FOR the word "Agent"
        # spells it exactly as a tool name does -- so only the name check can
        # reject it. Without this case the name check is dead weight the corpus
        # never notices losing, and investigation reads as authoring.
        ("searching for the word 'Agent' is not dispatching one",
         decoy, DISPATCH_TOOLS, None),
        ("unparseable lines are skipped, not fatal", ["{not json"], ("Edit",), None),
    ]
    for name, rws, nms, want in tu_cases:
        got = _first_tool_use(rws, nms, t_early, t_commit)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} first-tool-use: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # #783: the same core, now filtering on WHERE the file lives. The axis is the
    # path, so the corpus pairs each point with a must-still-flag neighbour --
    # a filter that rejected everything would pass a corpus of rejections alone.
    def _edit(ts, path=None):
        blk = {"type": "tool_use", "name": "Edit"}
        if path is not None:
            blk["input"] = {"file_path": path}
        return json.dumps({"timestamp": ts, "message": {"content": [blk]}})

    proj = os.path.abspath(os.sep + os.path.join("w", "proj"))
    inside = _edit("2026-07-25T01:50:00Z", os.path.join(proj, "scripts", "a.py"))
    outside = _edit("2026-07-25T01:45:00Z",
                    os.path.join(os.sep, "home", "u", ".claude", "memory", "m.md"))
    pathless = _edit("2026-07-25T01:40:00Z")
    t_inside = parse_ts("2026-07-25T01:50:00Z")
    path_ok = (lambda p: in_repo(p, proj))
    path_cases = [
        ("an edit inside the tree is found", [inside], t_inside),
        ("an edit outside it is not -- and it is EARLIER, so a min would have "
         "preferred it", [outside, inside], t_inside),
        ("an outside-only window is silent (the #777 shape)", [outside], None),
        ("a tool_use carrying no path is rejected, not assumed inside",
         [pathless], None),
        # Must-still-flag: the pathless/outside rows above prove rejection, this
        # proves the filter is not simply rejecting everything it sees.
        ("a pathless row does not suppress a real edit beside it",
         [pathless, inside], t_inside),
        # Every EDIT_TOOLS member has to be reachable, or dropping one from the
        # tuple is a silent hole: a Write is how new files (and most scratchpad
        # work) arrive, and it was the tool in #777's own pre-claim window.
        ("a Write counts as an edit, not only an Edit",
         [json.dumps({"timestamp": "2026-07-25T01:50:00Z", "message": {"content": [
             {"type": "tool_use", "name": "Write",
              "input": {"file_path": os.path.join(proj, "new.py")}}]}})], t_inside),
    ]
    for name, rws, want in path_cases:
        got = _first_tool_use(rws, EDIT_TOOLS, t_early, t_commit, path_ok=path_ok)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} edit-path: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))
    # The default stays pathless: a dispatch has no file to judge, so wiring the
    # predicate in by default would silence the oracle that already shipped.
    got = _first_tool_use([outside], EDIT_TOOLS, t_early, t_commit)
    ok = got == parse_ts("2026-07-25T01:45:00Z")
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'} edit-path: no predicate means no path "
          "filtering, so the dispatch oracle is untouched"
          + ("" if ok else f" -> {got!r}"))

    # The DOWNSTREAM checkpoint scenario, which this repo cannot produce and so
    # cannot measure (#361: its checkpoint is a metrics.py run, not a hand-edit;
    # stating a number measured here as universal is the #703 trap). Composed
    # from the real pieces -- boundary, window, core -- so it exercises the same
    # path cmd_receipt takes, minus the gh calls.
    #   17:00 previous slice's receipt   17:05 checkpoint edits CLAUDE.md
    #   17:10 checkpoint PR merges       17:20 this slice is claimed
    ck_receipt = parse_ts("2026-07-25T17:00:00Z")
    ck_landing = parse_ts("2026-07-25T17:10:00Z")
    ck_claim = parse_ts("2026-07-25T17:20:00Z")
    ck_edit = [json.dumps({"timestamp": "2026-07-25T17:05:00Z", "message": {"content": [
        {"type": "tool_use", "name": "Edit",
         "input": {"file_path": os.path.join(proj, "CLAUDE.md")}}]}})]
    for name, floor, want in (
            ("the landing floor excludes the checkpoint's own CLAUDE.md edit",
             latest_boundary(ck_receipt, ck_landing), None),
            # Discriminating half: with the receipt alone -- what #777 shipped --
            # the very same edit lands inside the window and falsely accuses.
            ("...and the receipt floor alone does NOT, which is why it was added",
             ck_receipt, parse_ts("2026-07-25T17:05:00Z"))):
        since, until = pre_claim_window(ck_claim, floor)
        got = _first_tool_use(ck_edit, EDIT_TOOLS, since, until, path_ok=path_ok)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} checkpoint-window: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # claim_start (#683, intake #680). The body stamps below are deliberately
    # WRONG wherever they differ from createdAt -- that divergence is the whole
    # defect, so every case that would pass by reading the body is a case this
    # corpus must fail. `_cl` writes the two independently on purpose.
    t_merge = parse_ts("2026-07-25T12:00:00Z")

    def _cl(created, body_ts="2026-01-01T00:00:00Z"):
        return {"createdAt": created,
                "body": f"claim: box/abc12345 · {body_ts} · slice/1-x"}

    cs_cases = [
        ("createdAt is the measurement, not the body stamp",
         [_cl("2026-07-25T09:00:00Z")], parse_ts("2026-07-25T09:00:00Z")),
        ("the downstream's live bug: body stamp AFTER the merge is ignored",
         [_cl("2026-07-25T11:20:00Z", "2026-07-25T23:59:00Z")],
         parse_ts("2026-07-25T11:20:00Z")),
        ("a claim created after mergedAt belongs to a later slice",
         [_cl("2026-07-26T09:00:00Z")], None),
        ("last QUALIFYING claim wins (re-claims supersede)",
         [_cl("2026-07-25T08:00:00Z"), _cl("2026-07-25T10:00:00Z")],
         parse_ts("2026-07-25T10:00:00Z")),
        ("a late re-claim doesn't beat the valid earlier one",
         [_cl("2026-07-25T08:00:00Z"), _cl("2026-07-26T09:00:00Z")],
         parse_ts("2026-07-25T08:00:00Z")),
        ("out-of-order comments still pick the latest qualifying",
         [_cl("2026-07-25T10:00:00Z"), _cl("2026-07-25T08:00:00Z")],
         parse_ts("2026-07-25T10:00:00Z")),
        ("a non-claim comment is not a claim",
         [{"createdAt": "2026-07-25T09:00:00Z", "body": "looks good to me"}], None),
        ("a claim with an unparseable createdAt is skipped, not guessed",
         [_cl("nope")], None),
        ("no comments -> None (caller falls back to pr-open)", [], None),
    ]
    for name, comments, want in cs_cases:
        got = claim_start(comments, t_merge)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} claim-start: {name}" + ("" if ok else f" -> {got!r} (want {want!r})"))
    return 1 if failed else 0


def main():
    argv = [a for a in sys.argv[1:]]
    try:
        if len(argv) >= 2 and argv[0] == "claim":
            cmd_claim(int(argv[1]))
        elif len(argv) >= 3 and argv[0] == "receipt":
            cmd_receipt(int(argv[1]), int(argv[2]), "--dry-run" in argv)
        elif len(argv) >= 4 and argv[0] == "preflight":
            cmd_preflight(int(argv[1]), argv[2] not in ("0", "PASS"), int(argv[3]))
        elif argv and argv[0] == "status":
            cmd_status()
        else:
            out("usage: claim <issue> | receipt <pr> <issue> [--dry-run] | "
                "preflight <seconds> <failed> <skipped> | status")
    except Exception as e:  # telemetry never blocks the loop
        out(f"WARNING: {type(e).__name__}: {e} (fail-soft, exiting 0)")


if __name__ == "__main__":
    # --selftest is a gate (exit nonzero on mismatch), everything else is
    # fail-soft telemetry (exit 0 always) -- don't let one posture leak into
    # the other (scripts-conventions: gates exit non-zero, telemetry never).
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    main()
    sys.exit(0)
