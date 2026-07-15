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
#
# THE RECEIPT FORMAT IS SINGLE-HOMED HERE (scripts/metrics.py parses it; the
# conventions file cross-links here). One line, space-separated key=value:
#
#   cost: wall-h=25.9 commits=3 files=12 diff=+540/-80 ci-runs=2 usd=4.21 by=<machine>/<session8>
#
#   wall-h   claim-comment timestamp -> mergedAt, hours, 1 decimal. When no claim
#            comment is found the fallback is PR-open -> merge and the line gains
#            `wall-src=pr-open` (an approximation marker, never silently mixed).
#   usd      this box's session-cost delta claim -> receipt (statusline ledger,
#            same session id only). `n/a` when the snapshot is missing, the
#            session changed (/clear), or another machine merged -- never guessed:
#            receipts come from the ledger, not self-estimates (ANTI_PATTERNS:
#            The Self-Reporting Oracle).
#   ci-runs  workflow runs recorded for the head branch (retries = failure loops).
#
# Receipts are TRIPWIRES, NEVER TARGETS (metrics.py carries the same framing):
# they exist so cost drift becomes visible, not so sessions optimize a number.
#
# Fail-soft by contract: telemetry must never block the loop -- every path exits 0,
# printing what it could and couldn't record. Local sidecars live in
# .claude/metrics/ (gitignored, one machine's view):
#   slice_costs.jsonl     claim-time cost snapshots   {issue, sid, usd, ts}
#   preflight_times.jsonl preflight durations         {ts, seconds, result, skipped}
#
# Single-implementation Python (D-210: `python3` spelling), stdlib only,
# cwd-independent -- same conventions as metrics.py.
import json, subprocess, sys, os, datetime, re, socket

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root
LOCAL = os.path.join(".claude", "metrics")

CLAIM_RE = re.compile(r"^claim:\s*\S+\s*(?:·|\|)\s*([0-9T:.+\-]+Z?)\s*(?:·|\|)", re.M)


def out(msg):
    print(f"slice_telemetry: {msg}")


def gh_json(args):
    """Run a gh command; parsed JSON or None on ANY failure (fail-soft)."""
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


def session_cost(sid):
    """Cumulative cost_usd from the statusline snapshot for this session; None if absent."""
    try:
        with open(os.path.join(LOCAL, "sessions", f"{sid}.json"), encoding="utf-8") as f:
            v = json.load(f).get("cost_usd")
        return float(v) if isinstance(v, (int, float)) else None
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


def cmd_claim(issue):
    sid, ident = session_identity()
    usd = session_cost(sid) if sid else None
    ok = append_jsonl("slice_costs.jsonl",
                      {"issue": issue, "sid": sid, "usd": usd, "ts": now_iso()})
    shown = f"${usd:.2f}" if usd is not None else "n/a (no statusline snapshot yet)"
    out(f"claim snapshot #{issue} -> session cost {shown}"
        + ("" if ok else " -- WARNING: ledger write failed (telemetry lost, loop unaffected)"))


def cmd_receipt(pr, issue, dry_run):
    prj = gh_json(["pr", "view", str(pr),
                   "--json", "mergedAt,createdAt,additions,deletions,changedFiles,commits,headRefName"])
    if prj is None:
        out(f"receipt: gh unreachable or PR {pr} unreadable -- no receipt posted (fail-soft)")
        return

    merged = parse_ts(prj.get("mergedAt")) or datetime.datetime.now(datetime.timezone.utc)

    # Wall clock: the claim comment is the canonical slice-start stamp.
    wall_src = "claim"
    start = None
    ij = gh_json(["issue", "view", str(issue), "--json", "comments"]) or {}
    for c in (ij.get("comments") or []):
        m = CLAIM_RE.search(c.get("body", ""))
        if m:
            start = parse_ts(m.group(1)) or start  # last claim wins (re-claims supersede)
    if start is None:
        start = parse_ts(prj.get("createdAt"))
        wall_src = "pr-open"
    wall_h = max((merged - start).total_seconds(), 0) / 3600 if start else None

    ci = gh_json(["run", "list", "--branch", prj.get("headRefName") or "",
                  "--json", "databaseId"])
    ci_runs = len(ci) if isinstance(ci, list) else None

    # Session-cost delta: honest only within one session on one box; else n/a.
    sid, ident = session_identity()
    usd = None
    if sid:
        snaps = [r for r in read_jsonl("slice_costs.jsonl")
                 if r.get("issue") == issue and r.get("sid") == sid]
        cur = session_cost(sid)
        if snaps and cur is not None and isinstance(snaps[-1].get("usd"), (int, float)):
            delta = cur - snaps[-1]["usd"]
            if delta >= 0:
                usd = delta

    parts = [
        "cost:",
        f"wall-h={wall_h:.2f}" if wall_h is not None else "wall-h=n/a",
        f"commits={len(prj.get('commits') or [])}",
        f"files={prj.get('changedFiles', 0)}",
        f"diff=+{prj.get('additions', 0)}/-{prj.get('deletions', 0)}",
        f"ci-runs={ci_runs}" if ci_runs is not None else "ci-runs=n/a",
        f"usd={usd:.2f}" if usd is not None else "usd=n/a",
        f"by={ident or 'unknown'}",
    ]
    if wall_src == "pr-open":
        parts.append("wall-src=pr-open")
    line = " ".join(parts)

    if dry_run:
        out(f"dry-run (not posted): {line}")
        return
    try:
        r = subprocess.run(["gh", "pr", "comment", str(pr), "--body", line],
                           capture_output=True, text=True, timeout=90)
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


def main():
    argv = [a for a in sys.argv[1:]]
    try:
        if len(argv) >= 2 and argv[0] == "claim":
            cmd_claim(int(argv[1]))
        elif len(argv) >= 3 and argv[0] == "receipt":
            cmd_receipt(int(argv[1]), int(argv[2]), "--dry-run" in argv)
        elif len(argv) >= 4 and argv[0] == "preflight":
            cmd_preflight(int(argv[1]), argv[2] not in ("0", "PASS"), int(argv[3]))
        else:
            out("usage: claim <issue> | receipt <pr> <issue> [--dry-run] | "
                "preflight <seconds> <failed> <skipped>")
    except Exception as e:  # telemetry never blocks the loop
        out(f"WARNING: {type(e).__name__}: {e} (fail-soft, exiting 0)")


if __name__ == "__main__":
    main()
    sys.exit(0)
