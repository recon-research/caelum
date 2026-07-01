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
#     { "matcher": "startup|resume|clear", "hooks": [ { "type": "command", "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session_start_banner.py\"" } ] },
#     { "matcher": "compact",              "hooks": [ { "type": "command", "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session_start_banner.py\"" } ] } ] }
#
# Contract: exit 0 always; stdout = injected context; on any error print
# nothing (a banner must never wedge a session).
import os, re, subprocess, sys

def run(args, timeout=8):
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                             encoding="utf-8", errors="replace")
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""

def main():
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
    # `?  — tolerate a markdown-backtick-wrapped sha in the Status line.
    m = re.search(r"As of:\*\*\s*([^·\n]+)·\s*`?([0-9a-fA-F]{7,40})", text)
    if m:
        stamp_date, stamp_sha = m.group(1).strip(), m.group(2).strip()
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
    elif "<date" in text or "&lt;date" in text:
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
    sys.exit(main())
