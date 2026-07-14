# PreToolUse hook (matcher: Bash|PowerShell): blocks `git commit` while the
# STAGED diff adds a naked TODO/FIXME — the zero-token local twin of ci.yml's
# hygiene step (in `static gates`; same exemptions, same rule). Blocking-hook
# decisions take precedence over the allowlist, so the pre-approved
# `git commit:*` grant can't bypass this. The matcher (and the tool_name check
# below) must cover BOTH shell tools: on native Windows the agent issues git
# through the PowerShell tool, and a Bash-only hook silently never fires.
#
# Wiring (see docs/AUTOMATION.md — settings.json changes are owner-applied;
# ${CLAUDE_PROJECT_DIR} is the braced placeholder Claude Code substitutes
# itself, so it works regardless of which shell runs the hook):
#   "hooks": { "PreToolUse": [ { "matcher": "Bash|PowerShell",
#     "hooks": [ { "type": "command", "command": "python3 \"${CLAUDE_PROJECT_DIR}/.claude/hooks/block_naked_todos.py\"" } ] } ] }
#
# Contract: stdin = tool-call JSON; exit 0 = allow, exit 2 = block (stderr
# becomes the reason shown to the agent). Any internal error → allow (exit 0):
# a hygiene hook must never wedge the loop — CI still gates.
# Note: `git commit -a` stages at commit time, so this sees only what was
# staged beforehand — stage-then-commit is the convention anyway.
import json, os, re, subprocess, sys

def chdir_repo_root():
    # Hook cwd is wherever Claude Code was launched; pathspecs below assume repo root.
    root = os.environ.get("CLAUDE_PROJECT_DIR")
    if not (root and os.path.isdir(root)):
        try:
            root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                                  text=True, timeout=10).stdout.strip()
        except Exception:
            root = ""
    if root and os.path.isdir(root):
        os.chdir(root)

# Mirror of the ':!' pathspecs in preflight.sh / preflight.ps1 / ci.yml — the
# four-site identity is enforced by audit_ops_config.py check 4 (#104).
EXEMPT = [":!*.md", ":!.github", ":!textbooks", ":!scripts/preflight.sh", ":!scripts/preflight.ps1",
          ":!.claude", ":!scripts/audit_ops_config.py"]
TICKETED = re.compile(r"(?i)\b(todo|fixme)\(#\d+\)")
NAKED = re.compile(r"(?i)\b(todo|fixme)\b")

def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") not in ("Bash", "PowerShell"):
        return 0
    command = str(payload.get("tool_input", {}).get("command", ""))
    # search, not match-at-start: agent commits routinely arrive inside
    # compound commands ("cd repo && git add -A && git commit -F -"), which
    # a start-anchored match silently waves through. \n sits in the separator
    # class because multi-line Bash-tool commands are routine too — without it
    # "git add -A\ngit commit -m x" walks past the gate (kill-web#12 → #207).
    if not re.search(r"(?:^|[\n;&|])\s*git\s+commit\b", command):
        return 0
    chdir_repo_root()
    try:
        diff = subprocess.run(
            ["git", "diff", "--cached", "--"] + ["."] + EXEMPT,
            capture_output=True, text=True, timeout=15, encoding="utf-8", errors="replace",
        ).stdout
    except Exception:
        return 0
    naked = []
    for line in diff.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        if NAKED.search(TICKETED.sub("", line)):
            naked.append(line[:200])
    if not naked:
        return 0
    sys.stderr.write(
        "BLOCKED: staged diff adds naked TODO/FIXME (every occurrence needs a ticket: TODO(#NN)):\n"
        + "\n".join(naked[:10])
        + "\nFile the issue first (track_followups), annotate, restage, retry. CI enforces the same rule.\n"
    )
    return 2

if __name__ == "__main__":
    sys.exit(main())
