# SessionStart hook (matchers: startup|resume|clear, and compact): prints a
# tiny staleness banner — stdout is injected into the session as context, so
# the agent starts every session (and every post-compaction / post-/clear
# window) knowing whether the CLAUDE.md Status anchor is stale and what
# decisions are open, for ~100 tokens and zero conversation round-trips.
#
# Wiring (see docs/AUTOMATION.md — settings.json changes are owner-applied;
# ${CLAUDE_PROJECT_DIR} is the braced placeholder Claude Code substitutes
# itself, so it works regardless of which shell runs the hook):
#   "hooks": { "SessionStart": [
#     { "matcher": "startup|resume|clear", "hooks": [ { "type": "command", "command": "python3 \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session_start_banner.py\"" } ] },
#     { "matcher": "compact",              "hooks": [ { "type": "command", "command": "python3 \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session_start_banner.py\"" } ] } ] }
#
# Contract: exit 0 always; stdout = injected context; on any error print
# nothing (a banner must never wedge a session).
#
# Side effect (fail-open, #47): appends {ts, event, source, session_id} to
# .claude/metrics/events.jsonl (gitignored). source=="compact" rows are how
# scripts/metrics.py counts compactions in its Local-telemetry section — the
# hook input JSON on stdin carries source: startup|resume|clear|compact
# (https://code.claude.com/docs/en/hooks.md, accessed 2026-07-02).
# Also rewrites .claude/metrics/session.json with the same row (#95): the
# CURRENT session's identity. Claim comments read session_id from it —
# <hostname>/<session_id[:8]>, conventions › Concurrent writers. Per-worktree
# like all of .claude/metrics/, so one writer per checkout ⇒ unambiguous.
#
# guard: #297 (intake #288, both defects hit live downstream) — Status
# detection lives in classify() and is corpus-tested via --selftest (run by
# audit_ops_config): (a) the As-of regex tolerates prose between the separator
# and an optionally-backticked sha (Caelum's "main @ `sha`" form made the
# staleness check silently inert — the hook's whole point, with no signal);
# (b) the placeholder test anchors to the As-of line itself — the old
# `"<date" in text` matched the literal `checkpoint/<date>` that our own
# branch-naming convention plants in downstream Status prose, instructing a
# re-onboard of an onboarded project. Silent no-banner is invisible without
# the corpus; --selftest is not a hook invocation, so it may exit nonzero.
import json, os, re, subprocess, sys
from datetime import datetime, timezone

def log_event():
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace"))
        root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
        mdir = os.path.join(root, ".claude", "metrics")
        os.makedirs(mdir, exist_ok=True)
        row = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "event": "session_start",
               "source": data.get("source"),
               "session_id": data.get("session_id")}
        with open(os.path.join(mdir, "events.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
        with open(os.path.join(mdir, "session.json"), "w", encoding="utf-8") as f:
            json.dump(row, f)
    except Exception:
        pass

def run(args, timeout=8):
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                             encoding="utf-8", errors="replace")
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""

def classify(text):
    # The corpus-tested core (#297): ("anchored", date, sha) | ("placeholder",)
    # | ("none",). [^`\n]*? tolerates prose between the separator and the
    # (optionally backticked) sha; the placeholder test is anchored to the
    # As-of line so `checkpoint/<date>` elsewhere in prose can't match.
    m = re.search(r"As of:\*\*\s*([^·\n]+)·[^`\n]*?`?([0-9a-fA-F]{7,40})", text)
    if m:
        return ("anchored", m.group(1).strip(), m.group(2).strip())
    if re.search(r"As of:\*\*\s*(?:<|&lt;)", text):
        return ("placeholder",)
    return ("none",)


def selftest():
    # Real downstream Status shapes — each asserts which banner branch fires.
    cases = [
        ("template placeholder", "**As of:** <date · main short-sha> · **Phase:**", ("placeholder",)),
        ("escaped placeholder", "**As of:** &lt;date · main short-sha&gt;", ("placeholder",)),
        ("plain filled", "**As of:** 2026-07-16 · d04440a · **Phase:** 1", ("anchored", "2026-07-16", "d04440a")),
        ("backticked sha", "**As of:** 2026-07-16 · `d04440a`", ("anchored", "2026-07-16", "d04440a")),
        ("caelum prose+backtick", "**As of:** 2026-07-16 · main @ `a7823dd`", ("anchored", "2026-07-16", "a7823dd")),
        ("caelum prose bare sha", "**As of:** 2026-07-16 · main @ a7823dd", ("anchored", "2026-07-16", "a7823dd")),
        ("filled + checkpoint prose", "**As of:** 2026-07-16 · d04440a\ncheckpoint/<date> branch rule",
         ("anchored", "2026-07-16", "d04440a")),
        ("checkpoint prose only, no As-of", "use a checkpoint/<date> branch", ("none",)),
        ("no status at all", "hello world", ("none",)),
    ]
    failed = 0
    for name, text, want in cases:
        got = classify(text)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} banner-classify: {name} -> {got!r}" + ("" if ok else f" (want {want!r})"))
    return 1 if failed else 0


def main():
    # cp1252 stdout guard (#296 rider from intake #288): gh-sourced decision
    # titles can carry chars outside cp1252 -- an unguarded write would break
    # the exit-0-always contract on Windows. Fail-open like everything here.
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    log_event()  # telemetry first: must run even if the banner below bails early
    # Hook cwd is wherever Claude Code was launched; CLAUDE.md lives at repo root.
    root = os.environ.get("CLAUDE_PROJECT_DIR")
    if not (root and os.path.isdir(root)):
        root = run(["git", "rev-parse", "--show-toplevel"])
    if root and os.path.isdir(root):
        os.chdir(root)
    lines = []
    try:
        text = open("CLAUDE.md", encoding="utf-8", errors="replace").read()
    except Exception:
        return 0
    kind = classify(text)
    if kind[0] == "anchored":
        stamp_date, stamp_sha = kind[1], kind[2]
        head = run(["git", "rev-parse", "--short", "HEAD"])
        if head:
            # Exclude commits that touch only CLAUDE.md: the post-merge Status-stamp
            # checkpoint is by construction one commit past the sha it stamps and must
            # not read as staleness forever. A commit touching CLAUDE.md plus anything
            # else still counts (it modifies other paths).
            behind = run(["git", "rev-list", "--count", f"{stamp_sha}..HEAD", "--", ".", ":!CLAUDE.md"])
            if behind and behind != "0":
                lines.append(f"[status-anchor] STALE: CLAUDE.md Status stamped {stamp_date} @ {stamp_sha}, "
                             f"but HEAD is {head} ({behind} non-checkpoint commit(s) later) -- reconcile Status first (onboard step 3).")
            else:
                lines.append(f"[status-anchor] fresh: stamped {stamp_date} @ {stamp_sha} (no non-checkpoint commits since).")
    elif kind[0] == "placeholder":
        lines.append("[status-anchor] Status block is still template placeholders -- run onboard Mode A.")
    decisions = run(["gh", "issue", "list", "--label", "decision", "--state", "open",
                     "--limit", "10", "--json", "number,title",
                     "--template", "{{range .}}#{{.number}} {{.title}}\n{{end}}"])
    if decisions:
        lines.append("[decisions open] " + " | ".join(decisions.splitlines()[:10]))
    if lines:
        sys.stdout.write("\n".join(lines) + "\n")
    return 0

if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
