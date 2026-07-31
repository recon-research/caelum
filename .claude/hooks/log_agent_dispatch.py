# PostToolUse hook (matcher: Agent|Task): appends one JSONL row per subagent
# dispatch to .claude/metrics/agent_dispatches.jsonl (gitignored) — the fan-out
# half of the cost ledger (#392). scripts/slice_telemetry.py counts the rows
# between a slice's claim snapshot and its merge to emit `agents=N` in the
# receipt, and scripts/metrics.py reads that field so the cost-drift tripwire
# can tell delegation apart from bloat.
#
# WHY THIS EXISTS: `usd` is a session-cost delta and therefore includes every
# subagent dispatch, while `Δlines` sees only the diff. Under the skill-eval
# admission gate (#302) a 19-line slice can cost $15.67 (PR #386), so the
# "cost drift without churn" alarm fired permanently and correctly-but-uselessly
# — a tripwire that always fires has stopped working. The fix is a fan-out
# signal the heuristic can subtract, and it must come from the ledger, not from
# a self-estimate the session reports about itself (slice_telemetry.py header;
# ANTI_PATTERNS: self-reported metrics).
#
# Hook input arrives as JSON on stdin (https://code.claude.com/docs/en/hooks.md,
# accessed 2026-07-02): tool_name, tool_input (the Agent tool's {subagent_type,
# prompt, description}), session_id, plus agent_type when fired inside a
# subagent — so a subagent's own dispatches count as fan-out too, which is what
# the cost delta already reflects. PostToolUse cannot block (the tool already
# ran) and stdout goes only to the debug log.
#
# Wiring (see docs/AUTOMATION.md §1, or your project's automation-policy home —
# settings.json changes are owner-applied;
# this is the mechanical class, not a grant edit, #242):
#   "PostToolUse": [ { "matcher": "Agent|Task", "hooks": [ { "type": "command",
#     "command": "python3 \"${CLAUDE_PROJECT_DIR}/.claude/hooks/log_agent_dispatch.py\"" } ] } ]
#
# Contract, like every hook here: FAIL OPEN — exit 0 always, print nothing;
# telemetry must never wedge the loop.
import json
import os
import sys
from datetime import datetime, timezone


def build_row(data, ts):
    """Pure core (#480): the ledger row for one hook payload, or None to skip."""
    tool = data.get("tool_name") or ""
    if tool not in ("Agent", "Task"):
        return None  # defensive: the matcher should already have narrowed this
    tin = data.get("tool_input") or {}
    row = {
        "ts": ts,
        "tool": tool,
        # Absent for a plain general-purpose dispatch; recorded when named so
        # a retrospective can see WHICH lens the fan-out went to.
        "subagent_type": tin.get("subagent_type") or None,
        "session_id": data.get("session_id"),
    }
    if data.get("agent_type"):
        row["agent_type"] = data.get("agent_type")  # dispatched from inside a subagent
    return row


def main():
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace"))
        row = build_row(data, datetime.now(timezone.utc).isoformat(timespec="seconds"))
        if row is None:
            return 0
        root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
        mdir = os.path.join(root, ".claude", "metrics")
        os.makedirs(mdir, exist_ok=True)
        with open(os.path.join(mdir, "agent_dispatches.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
    except Exception:
        pass
    return 0


def selftest():
    # #480 (intake #475): shipped by #460 without the #356 selftest contract.
    # Pure build_row cases only -- no stdin, no filesystem (#319). The
    # --selftest dispatch below runs BEFORE main()'s stdin read on purpose:
    # audit_ops_config invokes hooks with inherited stdin, and a read there
    # can hang the runner into its timeout.
    failed = 0
    cases = [
        ("Agent dispatch -> row",
         {"tool_name": "Agent", "tool_input": {"subagent_type": "mech-sweeper"},
          "session_id": "s1"},
         {"ts": "T", "tool": "Agent", "subagent_type": "mech-sweeper",
          "session_id": "s1"}),
        ("Task spelling counts, typeless dispatch -> None type",
         {"tool_name": "Task", "tool_input": {}, "session_id": "s2"},
         {"ts": "T", "tool": "Task", "subagent_type": None, "session_id": "s2"}),
        ("non-Agent tool -> no row", {"tool_name": "Bash"}, None),
        ("empty payload -> no row", {}, None),
        ("subagent-origin dispatch keeps agent_type",
         {"tool_name": "Agent", "agent_type": "code-reviewer", "session_id": "s3"},
         {"ts": "T", "tool": "Agent", "subagent_type": None, "session_id": "s3",
          "agent_type": "code-reviewer"}),
    ]
    for name, payload, want in cases:
        got = build_row(payload, "T")
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} dispatch-row: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))
    print(f"log_agent_dispatch selftest: {len(cases) - failed}/{len(cases)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
