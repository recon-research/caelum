#!/usr/bin/env python
"""Pyxis statusline: `<model> | ctx NN% used | $X.XX` (+ a compaction nudge at >=80%).

Claude Code pipes session JSON to this script on every status update (after each
assistant message, after /compact, on permission-mode changes; 300ms debounce) and
displays whatever it prints. Docs: https://code.claude.com/docs/en/statusline.md
(accessed 2026-07-02). Two jobs:

  1. DISPLAY - the context-window meter the owner otherwise lacks: green <60%,
     yellow 60-79%, red >=80% plus a "-> prepare compaction" nudge, so the human's
     indicator and prepare_compaction's proactive contract agree on when it's time.
  2. SNAPSHOT (fail-soft side effect) - upsert .claude/metrics/sessions/<session_id>.json
     with the session's running totals (cost, duration, lines, peak context%). The
     statusline fires all session long, so the last write is the session's final
     totals: a zero-infra per-session ledger for scripts/metrics.py's local section.

Contract, matching the hooks' design (docs/AUTOMATION.md s1):
  - NEVER raises: display errors print a plain fallback; ledger errors are swallowed
    (telemetry must never break the UI or the loop).
  - Ledger writes are atomic (tmp file + os.replace) because Claude Code cancels an
    in-flight statusline run when a fresh update arrives - a torn plain write would
    poison the ledger.
  - ASCII-only output: survives cp1252 consoles on Windows; ANSI color codes only.
"""
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

GREEN, YELLOW, RED, DIM, RESET = "\x1b[32m", "\x1b[33m", "\x1b[31m", "\x1b[2m", "\x1b[0m"
WARN_PCT = 80  # nudge threshold: past this, a chosen compaction beats the forced one


def context_segment(pct):
    if pct is None:  # documented: used_percentage may be null early in a session
        return DIM + "ctx --" + RESET
    p = int(pct)
    color = GREEN if p < 60 else (YELLOW if p < WARN_PCT else RED)
    nudge = " " + RED + "-> prepare compaction" + RESET if p >= WARN_PCT else ""
    return "%sctx %d%% used%s%s" % (color, p, RESET, nudge)


def snapshot(data, pct):
    sid = data.get("session_id")
    if not sid:
        return
    root = (data.get("workspace") or {}).get("project_dir") or os.getcwd()
    sess_dir = os.path.join(root, ".claude", "metrics", "sessions")
    os.makedirs(sess_dir, exist_ok=True)
    path = os.path.join(sess_dir, "%s.json" % sid)
    prior = {}
    try:
        with open(path, encoding="utf-8") as f:
            prior = json.load(f)
    except Exception:
        prior = {}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    cost = data.get("cost") or {}
    ctx = data.get("context_window") or {}
    peak = max(x for x in (prior.get("peak_context_pct"), pct, 0) if x is not None)
    rec = {
        "session_id": sid,
        "started": prior.get("started") or now,
        "updated": now,
        "model_id": (data.get("model") or {}).get("id"),
        "claude_version": data.get("version"),
        "cost_usd": cost.get("total_cost_usd"),
        "duration_ms": cost.get("total_duration_ms"),
        "api_duration_ms": cost.get("total_api_duration_ms"),
        "lines_added": cost.get("total_lines_added"),
        "lines_removed": cost.get("total_lines_removed"),
        "context_used_pct": pct,
        "peak_context_pct": peak,
        "context_tokens_in": ctx.get("total_input_tokens"),
        "context_tokens_out": ctx.get("total_output_tokens"),
    }
    fd, tmp = tempfile.mkstemp(dir=sess_dir, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(rec, f, indent=1)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main():
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace"))
    except Exception:
        print("Claude | ctx -- | $--")
        return
    model = (data.get("model") or {}).get("display_name") or "Claude"
    pct = (data.get("context_window") or {}).get("used_percentage")
    cost = (data.get("cost") or {}).get("total_cost_usd")
    cost_seg = "$%.2f" % cost if isinstance(cost, (int, float)) else "$--"
    print("%s | %s | %s" % (model, context_segment(pct), cost_seg))
    try:
        snapshot(data, pct)
    except Exception:
        pass  # the ledger is a bonus; the display is the job


if __name__ == "__main__":
    main()
