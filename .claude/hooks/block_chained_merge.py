# guard: #253 -- PreToolUse hook (matcher: Bash|PowerShell): BLOCKS a single
# command that chains a checks-watch/poll into `gh pr merge`. The shape
# (`gh pr checks --watch && gh pr merge ...`, or any checks/watch command
# sequenced before a merge in one tool call) fires the merge the instant the
# watch exits, unconditionally, even over a red gate -- and where branch
# protection is unavailable the platform won't stop it. #176 merged a
# checkpoint PR over a red `static gates` exactly this way; #177 made the
# policy explicit (ship_pr steps 5-6: read the checks green with your own
# eyes, THEN merge as a SEPARATE command). This hook is that policy's
# mechanical rung: the shape has zero legitimate uses, so it blocks.
# `gh pr checks N && gh pr merge N` without --watch is the same defect
# ("merge if the poll exits 0" -- eyes never read anything), so it blocks too.
#
# Guard lifecycle (#253): the `guard: #NN` header line above is the
# provenance convention (conventions > Tracker & Hygiene); every deny appends
# to .claude/metrics/guard_hits.jsonl so retrospectives can see catches --
# a blocking guard with zero catches across periods is a retirement
# candidate, judged (not auto-pruned) at retro time. Retire when: the
# platform enforces required checks mechanically here (branch protection
# with include-administrators active) AND the harness gates compound
# commands itself.
#
# Contract: stdin = tool-call JSON; exit 0 = allow, exit 2 = block (stderr is
# the reason shown to the agent). Any internal error -> allow (fail-open).
# Matcher covers BOTH shell tools (#135); heredoc bodies are excluded from
# scanning (prose mentioning commands is not a command -- the #252 lesson).
import json, os, re, subprocess, sys

SEP = r"(?:^|[\n;&|])\s*"
WATCHISH = re.compile(SEP + r"gh\s+(pr\s+checks|run\s+watch)\b")
MERGE = re.compile(SEP + r"gh\s+pr\s+merge\b")


def log_hit():
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
            f.write(json.dumps({"ts": ts, "guard": "block_chained_merge",
                                "rule": "chained-merge", "action": "deny"}) + "\n")
    except Exception:
        pass


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") not in ("Bash", "PowerShell"):
        return 0
    command = str(payload.get("tool_input", {}).get("command", "")).split("<<", 1)[0]
    merge = MERGE.search(command)
    if not merge:
        return 0
    watch = WATCHISH.search(command)
    if not (watch and watch.start() < merge.start()):
        return 0
    log_hit()
    sys.stderr.write(
        "BLOCKED: checks-watch/poll chained into `gh pr merge` in one command -- the merge "
        "would fire the moment the watch exits, even over a red gate (#176 -> #177; guard: #253).\n"
        "Run the watch/poll alone, READ the checks green with your own eyes, then issue the "
        "merge as its own separate command (ship_pr steps 5-6).\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
