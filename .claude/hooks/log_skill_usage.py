# PostToolUse hook (matcher: Skill): appends one JSONL row per skill invocation
# to .claude/metrics/skill_usage.jsonl (gitignored) — the usage half of the
# CMMI-L4 skill ledger (#47). scripts/metrics.py aggregates it into the
# "Local telemetry" section of docs/METRICS.md: per-skill counts answer "which
# skills earn their context budget" and a zero-invocation skill flags dead
# weight or broken routing (the #6 measure-first discipline).
#
# Hook input arrives as JSON on stdin (https://code.claude.com/docs/en/hooks.md,
# accessed 2026-07-02): tool_name, tool_input (the Skill tool's {skill, args}),
# session_id, plus agent_type when fired inside a subagent. PostToolUse cannot
# block (the tool already ran) and stdout goes only to the debug log.
#
# Wiring (see docs/AUTOMATION.md §1 — settings.json changes are owner-applied):
#   "PostToolUse": [ { "matcher": "Skill", "hooks": [ { "type": "command",
#     "command": "python3 \"${CLAUDE_PROJECT_DIR}/.claude/hooks/log_skill_usage.py\"" } ] } ]
#
# Contract, like every hook here: FAIL OPEN — exit 0 always, print nothing;
# telemetry must never wedge the loop.
import json
import os
import sys
from datetime import datetime, timezone


def main():
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace"))
        tin = data.get("tool_input") or {}
        skill = tin.get("skill") or tin.get("skill_name") or tin.get("name")
        if not skill:
            return 0
        root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
        mdir = os.path.join(root, ".claude", "metrics")
        os.makedirs(mdir, exist_ok=True)
        row = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "skill": str(skill),
            "session_id": data.get("session_id"),
        }
        if data.get("agent_type"):
            row["agent_type"] = data.get("agent_type")
        with open(os.path.join(mdir, "skill_usage.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
