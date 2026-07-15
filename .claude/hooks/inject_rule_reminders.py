# PreToolUse hook (matcher: Bash|PowerShell): injects a one-line rule reminder
# at the MOMENT of a high-stakes command -- git commit, gh pr merge, a push
# aimed at main. CLAUDE.md's authority decays as a session's context grows
# (top-of-context prose loses to recency), so this hook rides recency instead
# of fighting it: the matching rule lands fresh, right before the action it
# governs (#252 -- the SessionStart status-anchor pattern moved to the action
# layer). Reminders are POINTERS to each rule's durable home, never second
# copies (single-home); they fire only on these rare commands, a few tokens each.
#
# NON-BLOCKING BY DESIGN: emits hookSpecificOutput.additionalContext ONLY --
# deliberately NO permissionDecision field, so the normal permission flow is
# untouched. (An "allow" here would silently widen permissions via hook: the
# exact boundary hooks must never cross -- docs/AUTOMATION.md s2.) Blocking
# stays block_naked_todos' job; this hook cannot deny anything.
#
# Contract (https://code.claude.com/docs/en/hooks, accessed 2026-07-15):
# stdin = tool-call JSON; stdout JSON hookSpecificOutput.additionalContext =
# context Claude sees, non-blocking; plain stdout goes only to the debug log.
# Exit 0 always; any internal error -> silent allow (fail-open, like every
# hook here). Matcher covers BOTH shell tools (the #135 Windows lesson).
#
# Fires append (fail-open) to .claude/metrics/guard_hits.jsonl -- guard-
# lifecycle telemetry (#253): a guard that never fires is dead weight; one
# that fires constantly is misaimed noise. metrics.py can trend this ledger.
import json, os, re, subprocess, sys

# The separator class matches block_naked_todos: compound ("a && git commit")
# and multi-line commands are routine, so a start-anchored match would
# silently wave them through (kill-web#12 -> #207).
SEP = r"(?:^|[\n;&|])\s*"
RULES = [
    (re.compile(SEP + r"git\s+commit\b"), "commit",
     "Commit rules (conventions > PR / commit mechanics): stage explicitly and check "
     "`git status` for strays; multiline message via Bash here-doc; summary <=72 chars "
     "citing the ticket; NO AI-attribution trailers (no Co-Authored-By / Claude-Session)."),
    (re.compile(SEP + r"gh\s+pr\s+merge\b"), "merge",
     "Merge rules (ship_pr steps 5-6, #177): the checks must have been READ GREEN with "
     "your own eyes already, and this merge must be a SEPARATE command -- never chained "
     "onto a watch/poll; never --admin; a red or unreadable check routes back to "
     "preflight, never forward to merge."),
    (re.compile(SEP + r"git\s+push\b[^\n;&|]*[\s:]main\b"), "push-main",
     "Push rules (conventions > Merge policy): `main` is never pushed directly -- work "
     "rides a slice/checkpoint branch through a PR."),
]


def log_fires(names):
    # Same repo-root resolution as block_naked_todos; ledger is gitignored.
    try:
        root = os.environ.get("CLAUDE_PROJECT_DIR")
        if not (root and os.path.isdir(root)):
            root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                                  text=True, timeout=10).stdout.strip()
        if not (root and os.path.isdir(root)):
            return
        import datetime
        path = os.path.join(root, ".claude", "metrics", "guard_hits.jsonl")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        ts = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        with open(path, "a", encoding="utf-8") as f:
            for n in names:
                f.write(json.dumps({"ts": ts, "guard": "inject_rule_reminders", "rule": n}) + "\n")
    except Exception:
        pass


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") not in ("Bash", "PowerShell"):
        return 0
    command = str(payload.get("tool_input", {}).get("command", ""))
    # Don't scan heredoc bodies: a commit MESSAGE that mentions `gh pr merge`
    # is prose, not a command (false positive hit live on this hook's own
    # shipping commit, 2026-07-15). Truncating at the first heredoc marker
    # drops anything chained after it -- acceptable for a non-blocking
    # reminder; commands before the heredoc have already been scanned.
    command = command.split("<<", 1)[0]
    hits = [(name, text) for pattern, name, text in RULES if pattern.search(command)]
    if not hits:
        return 0
    log_fires([n for n, _ in hits])
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "additionalContext": "\n".join(text for _, text in hits),
    }}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
