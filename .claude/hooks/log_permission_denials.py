# PermissionDenied hook (no matcher: all tools): appends one JSONL row per
# denied tool call to .claude/metrics/permission_denials.jsonl (gitignored) —
# the interruption half of the local telemetry ledger (#58). scripts/metrics.py
# surfaces the count as the "Permission denials" row in docs/METRICS.md ›
# Local telemetry: every denial is an autopilot stall the retrospective loop
# should see as data, not chat folklore. The matching behavior rule (denial =
# decision point, survey the owner) lives in CLAUDE.md › Working style.
#
# Hook input arrives as JSON on stdin; tool_name / tool_input / session_id are
# present as on other tool events, but the deny-reason field's name is not
# documented for this event, so likely spellings are probed defensively and an
# absent reason is stored as "". PermissionDenied DOES fire for auto-mode
# CLASSIFIER denials, not just rule-based and interactive denies — verified
# live 2026-07-08 by a downstream copy's ledger (classifier-denied cross-repo
# `gh issue create`, reason logged as "No reason provided"; intake #118 →
# #125). A local first-party datum would be stronger; classifier reasons may
# arrive unnamed like that, so the defensive probing stays.
#
# Wiring (docs/AUTOMATION.md §1 — settings.json changes are owner-applied):
#   "PermissionDenied": [ { "hooks": [ { "type": "command",
#     "command": "python3 \"${CLAUDE_PROJECT_DIR}/.claude/hooks/log_permission_denials.py\"" } ] } ]
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
        detail = tin.get("command") or tin.get("file_path") or tin.get("skill") or ""
        reason = (data.get("reason") or data.get("denial_reason")
                  or data.get("permission_decision_reason") or data.get("message") or "")
        root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
        mdir = os.path.join(root, ".claude", "metrics")
        os.makedirs(mdir, exist_ok=True)
        row = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "tool": str(data.get("tool_name") or "?"),
            "detail": str(detail)[:120],
            "reason": str(reason)[:200],
            "session_id": data.get("session_id"),
        }
        with open(os.path.join(mdir, "permission_denials.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
