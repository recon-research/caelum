# PreToolUse hook (matcher: Bash|PowerShell): blocks `git commit` while the
# STAGED diff adds a naked TODO/FIXME — the zero-token local twin of ci.yml's
# hygiene step (in `static gates`; same exemptions, same rule). Blocking-hook
# decisions take precedence over the allowlist, so the pre-approved
# `git commit:*` grant can't bypass this. The matcher (and the tool_name check
# below) must cover BOTH shell tools: on native Windows the agent issues git
# through the PowerShell tool, and a Bash-only hook silently never fires.
#
# Wiring (see docs/AUTOMATION.md, or your project's automation-policy home —
# settings.json changes are owner-applied;
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
#
# guard: #492 (intake #490; a downstream proved it live and shipped the fix —
# named provenance on the ticket) — a single call chaining `git add <paths> && git commit`
# used to bypass the scan: the hook fires BEFORE the add executes, so the
# staged diff was still empty. Any `git add` segment's path tokens are
# therefore harvested from the command string (same separator class as the
# commit detection below; the inject_rule_reminders path-harvest technique)
# and the WORKING-TREE diff for those paths is scanned in union with the
# staged diff, same exemptions. An add with an empty harvest (`git add -A` /
# `-u` / `--all`) scans the whole tree. Residual, accepted: untracked files
# named in the add have no diff to scan — CI's hygiene gate still catches
# them. Retire-when: hooks can observe intra-call staging.
import json
import os
import re
import subprocess
import sys

def chdir_repo_root():
    # Hook cwd is wherever Claude Code was launched; pathspecs below assume repo root.
    root = os.environ.get("CLAUDE_PROJECT_DIR")
    if not (root and os.path.isdir(root)):
        try:
            root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                                  text=True, timeout=10, encoding="utf-8", errors="replace",
                                  ).stdout.strip()
        except Exception:
            root = ""
    if root and os.path.isdir(root):
        os.chdir(root)

# Mirror of the ':!' pathspecs in preflight.sh / preflight.ps1 / ci.yml — the
# four-site identity is enforced by audit_ops_config.py check 4 (#104).
EXEMPT = [":!*.md", ":!.github", ":!textbooks", ":!scripts/preflight.sh", ":!scripts/preflight.ps1",
          ":!.claude", ":!scripts/audit_ops_config.py", ":!research/experiments/*/prompts/*"]
TICKETED = re.compile(r"(?i)\b(todo|fixme)\(#\d+\)")
NAKED = re.compile(r"(?i)\b(todo|fixme)\b")

# Same separator class as the commit detection in main() — an add only counts
# at a segment start, so prose like `-m "git add foo"` never harvests (#492).
# The git-binary token mirrors block_commit_rules' GIT token (#342/#467 —
# quoted full path, bare git.exe, unquoted path; -C/-c/--no-pager interveners):
# `git.exe commit` and `& "C:\...\git.exe" commit` used to skip this scan
# entirely while the commit-message hook judged the same command (#559). Keep
# the family in step.
SEP = r"(?:^|[\n;&|])\s*"
GIT = (r"(?:&\s*)?"
       r"(?:\"(?:[^\"\n]*[\\/])?git(?:\.exe)?\""
       r"|'(?:[^'\n]*[\\/])?git(?:\.exe)?'"
       r"|[^\s;|&\"'\n]*[\\/]git(?:\.exe)?"
       r"|git(?:\.exe)?"
       r")")
INTERVENERS = r"(?:\s+-C\s+\S+|\s+-c\s+\S+|\s+--no-pager)*"
COMMIT_RE = re.compile(SEP + GIT + INTERVENERS + r"\s+commit\b")
ADD_RE = re.compile(SEP + GIT + INTERVENERS + r"\s+add(?:\s+([^\n;&|]*))?")

def command_add_paths(command):
    # guard: #492 — path tokens from every `git add` segment in the call
    # (flags stripped). Empty harvest (`git add -A` / `-u`) ⇒ scan whole tree.
    paths = []
    for seg in ADD_RE.findall(command):
        paths += [t for t in seg.split() if not t.startswith("-")]
    return paths

def naked_added_lines(diff):
    # Pure line scan over a unified diff: +lines whose TODO/FIXME lacks a
    # ticket. Extracted so --selftest drives it without git (#319).
    naked = []
    for line in diff.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        if NAKED.search(TICKETED.sub("", line)):
            naked.append(line[:200])
    return naked

def log_hit(rule):
    # Guard lifecycle (#253/#559): denies append to the machine-local ledger so
    # retrospectives see catches — a blocking guard with zero recorded catches
    # reads as a retirement candidate while actually firing. Same shape as the
    # sibling hooks'; fail-soft like everything here.
    try:
        root = os.environ.get("CLAUDE_PROJECT_DIR")
        if not (root and os.path.isdir(root)):
            root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                                  text=True, timeout=10, encoding="utf-8", errors="replace",
                                  ).stdout.strip()
        if not (root and os.path.isdir(root)):
            return
        import datetime
        path = os.path.join(root, ".claude", "metrics", "guard_hits.jsonl")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        ts = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": ts, "guard": "block_naked_todos",
                                "rule": rule, "action": "deny"}) + "\n")
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
    # search, not match-at-start: agent commits routinely arrive inside
    # compound commands ("cd repo && git add -A && git commit -F -"), which
    # a start-anchored match silently waves through. \n sits in the separator
    # class because multi-line Bash-tool commands are routine too — without it
    # "git add -A\ngit commit -m x" walks past the gate (a downstream proved it live → #207).
    if not COMMIT_RE.search(command):
        return 0
    chdir_repo_root()
    try:
        diff = subprocess.run(
            ["git", "diff", "--cached", "--"] + ["."] + EXEMPT,
            capture_output=True, text=True, timeout=15, encoding="utf-8", errors="replace",
        ).stdout
    except Exception:
        return 0
    if ADD_RE.search(command):
        # guard: #492 — the add hasn't run yet, so also scan the working-tree
        # diff for the about-to-be-staged paths (same exemptions; fail-soft).
        try:
            diff += subprocess.run(
                ["git", "diff", "--"] + (command_add_paths(command) or ["."]) + EXEMPT,
                capture_output=True, text=True, timeout=15, encoding="utf-8", errors="replace",
            ).stdout
        except Exception:
            pass
    naked = naked_added_lines(diff)
    if not naked:
        return 0
    log_hit("naked-todo")
    sys.stderr.write(
        "BLOCKED: the staged (or about-to-be-added) diff adds a naked TODO/FIXME "
        "(every occurrence needs a ticket: TODO(#NN)):\n"
        + "\n".join(naked[:10])
        + "\nFile the issue first (track_followups), annotate, restage, retry. CI enforces the same rule.\n"
    )
    return 2

# --selftest (#492; side-effect-free per #319: pure regex/harvest/scan checks —
# no git, no stdin). FAIL-line format matches check_hook_selftests' scrape.
SELFTEST_CASES = [
    # -- harvest: path tokens from `git add` segments (#492) --
    ("harvest", "git add foo.py bar/baz.py && git commit -m x", ["foo.py", "bar/baz.py"],
     "two explicit paths"),
    ("harvest", "git add -A && git commit -m x", [], "-A: empty harvest means whole tree"),
    ("harvest", "git add -u\ngit commit -F -", [], "-u across a newline separator"),
    ("harvest", "git add -- a.py && git commit", ["a.py"], "pathspec separator stripped"),
    ("harvest", "git add a.py; git add b.py && git commit", ["a.py", "b.py"],
     "two add segments, both harvested"),
    ("harvest", 'git commit -m "git add foo.py"', [], "prose add inside -m never harvests"),
    ("harvest", "git add a.py | tee log", ["a.py"], "segment ends at the pipe"),
    # -- gates: which command shapes trigger the commit / add paths --
    ("commit", "cd repo && git add -A && git commit -F -", True, "chained commit fires"),
    ("commit", "git add -A\ngit commit -m x", True, "newline-separated commit fires (#207)"),
    ("commit", "echo 'git commit'", False, "quoted prose commit does not fire"),
    ("commit", "git commit -m x", True, "bare commit fires"),
    # -- #559: git-binary spellings beyond bare `git` (the #342/#467 token) --
    ("commit", "git.exe commit -m x", True, "bare git.exe fires (#559)"),
    ("commit", '& "C:\\Program Files\\Git\\bin\\git.exe" commit -F -', True,
     "quoted full-path git.exe behind the call operator fires (#559)"),
    ("commit", "git -C . commit -m x", True, "-C intervener fires (#559)"),
    ("commit", "/usr/bin/git commit -m x", True, "unquoted full path fires (#559)"),
    ("commit", "& 'C:\\tools\\my git\\git.exe' commit", True,
     "single-quoted path with spaces fires (#559)"),
    ("commit", "foo-git.exe commit -m x", False,
     "foo-git.exe is not git -- a prefix must end in a path separator (#559)"),
    ("add", 'git.exe add a.py && git.exe commit -m x', True,
     "git.exe add segment detected (#559)"),
    ("harvest", '& "C:\\Program Files\\Git\\bin\\git.exe" add a.py b.py; git commit',
     ["a.py", "b.py"], "harvest works through the quoted-path spelling (#559)"),
    ("add", "git add foo.py && git commit -m x", True, "real add segment detected"),
    ("add", 'git commit -m "git add foo.py"', False, "quoted prose add not detected"),
    ("add", "git commit -m x", False, "no add segment"),
    # -- scan: naked vs ticketed added lines --
    ("scan", "+ # TODO: fix later", ["+ # TODO: fix later"], "naked TODO fires"),
    ("scan", "+ # TODO(#123): scheduled", [], "ticketed TODO is clean"),
    ("scan", "+++ b/notes.txt\n+ FIXME now", ["+ FIXME now"], "+++ header ignored, FIXME fires"),
    ("scan", "- TODO gone\n context TODO", [], "removed/context lines ignored"),
    ("scan", "+ TODO(#1) then TODO again", ["+ TODO(#1) then TODO again"],
     "ticketed and naked on one line still fires"),
]

def selftest():
    fns = {"harvest": command_add_paths,
           "commit": lambda c: bool(COMMIT_RE.search(c)),
           "add": lambda c: bool(ADD_RE.search(c)),
           "scan": naked_added_lines}
    fails = []
    for kind, arg, want, label in SELFTEST_CASES:
        got = fns[kind](arg)
        if got != want:
            fails.append(f"FAIL {label}: {kind}({arg!r}) -> {got!r}, want {want!r}")
    for f in fails:
        print(f)
    print(f"block_naked_todos selftest: "
          f"{len(SELFTEST_CASES) - len(fails)}/{len(SELFTEST_CASES)} PASS")
    return 1 if fails else 0

if __name__ == "__main__":
    if "--selftest" in sys.argv:  # before stdin, like log_agent_dispatch (#480)
        sys.exit(selftest())
    sys.exit(main())
