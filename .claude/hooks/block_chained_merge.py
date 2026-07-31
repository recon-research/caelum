# guard: #253, #423 -- PreToolUse hook (matcher: Bash|PowerShell): BLOCKS two
# merge shapes with zero legitimate uses, in any spelling of the gh binary:
#
# 1. (#253) A checks-watch/poll chained into `gh pr merge` in one command
#    (`gh pr checks --watch && gh pr merge ...`, or any checks/watch command
#    sequenced before a merge in one tool call) fires the merge the instant
#    the watch exits, unconditionally, even over a red gate -- and where
#    branch protection is unavailable the platform won't stop it. #176 merged
#    a checkpoint PR over a red `static gates` exactly this way; #177 made
#    the policy explicit (ship_pr steps 5-6: read the checks green with your
#    own eyes, THEN merge as a SEPARATE command). `gh pr checks N && gh pr
#    merge N` without --watch is the same defect ("merge if the poll exits 0"
#    -- eyes never read anything), so it blocks too.
# 2. (#423) `--admin` in ANY argument position on a merge -- the
#    branch-protection override. settings.json cannot deny this
#    mechanically: deny rules match by PREFIX, so `gh pr merge 5 --admin`
#    sails past the flag-first deny AND matches the `pr merge:*` allow (the
#    $comment's HONEST LIMITATION). A hook sees the whole command string, so
#    the real enforcement lives here. On this repo branch protection
#    backstops it; downstream copies on free-plan private repos have prose
#    policy only -- this rule is their sole mechanical `--admin` guard.
#    OWNER-BINDING (D-422, ratified -- never-by-anyone class): PreToolUse cannot tell
#    human from agent, so this blocks the owner's in-session `--admin` too.
#    A genuine override is the owner's call, run OUTSIDE the session.
#
# Guard lifecycle (#253): the `guard: #NN` header line above is the
# provenance convention (conventions > Tracker & Hygiene); every deny appends
# to .claude/metrics/guard_hits.jsonl so retrospectives can see catches --
# a blocking guard with zero catches across periods is a retirement
# candidate, judged (not auto-pruned) at retro time. Retire when: (#253) the
# platform enforces required checks mechanically here (branch protection
# with include-administrators active) AND the harness gates compound
# commands itself; (#423) additionally only when the downstream repo class
# this template ships to inherits that protection -- free-plan private
# copies can't, so the rule outlives this repo's own backstop.
#
# Contract: stdin = tool-call JSON; exit 0 = allow, exit 2 = block (stderr is
# the reason shown to the agent). Any internal error -> allow (fail-open).
# Matcher covers BOTH shell tools (#135); heredoc BODIES are excluded from
# scanning (prose mentioning commands is not a command -- the #252 lesson),
# but command text after each body's terminating delimiter IS scanned (#559 --
# the old first-`<<` cut let a chained merge hide behind any heredoc).
# The decision is pure (verdict()) and corpus-tested via --selftest, run by
# audit_ops_config's check_hook_selftests. Known residual, accepted: the
# scan is quote-blind in both directions -- a quoted separator among a
# merge's own arguments ends its scanned segment early, and prose that packs
# a separator plus the shape inside one quoted string can false-fire. This
# guard is a tripwire against rationalized sloppiness, not a sandbox; blocks
# are visible and safe, and the heredoc carve-out covers the common prose
# path.
import json
import os
import re
import subprocess
import sys

SEP = r"(?:^|[\n;&|])\s*"
# #342 (intake #327): a gh invocation is not always the bare word -- the
# sanctioned Windows idiom is a quoted full path behind the call operator
# (& "C:\Program Files\GitHub CLI\gh.exe" pr merge ...), which the old
# `gh\s+` anchor waved through. #467 (intake #464): the quoted path is
# OPTIONAL -- & "gh.exe" pr merge is legal PowerShell with no path component
# -- but when present it must end in a separator, so foo-gh.exe and words
# containing "gh" never match (the two-downstream union token: each prior
# form had a hole the other closed). The unquoted alternative keeps its
# mandatory separator; bare gh(.exe) has its own alternative. Same token in
# inject_rule_reminders.py; keep the twins in step.
GH = (r"(?:&\s*)?"
      r"(?:\"(?:[^\"\n]*[\\/])?gh(?:\.exe)?\""
      r"|'(?:[^'\n]*[\\/])?gh(?:\.exe)?'"
      r"|[^\s;|&\"'\n]*[\\/]gh(?:\.exe)?"
      r"|gh(?:\.exe)?"
      r")\s+")
WATCHISH = re.compile(SEP + GH + r"(pr\s+checks|run\s+watch)\b")
MERGE = re.compile(SEP + GH + r"pr\s+merge\b")

# guard: #423 -- `--admin` anywhere among the merge's own arguments. The
# lookbehind keeps `----admin`-ish noise out; \b keeps `--administrator`-ish
# flags out. Attribution is scoped per merge segment (see verdict()).
ADMIN = re.compile(r"(?<![\w-])--admin\b")
SEP_CHARS = "\n;&|"
# Same heredoc token as block_commit_rules (keep the twins in step).
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_]\w*)\1")


def strip_heredoc_bodies(command):
    """Drop heredoc BODIES (prose is not a command -- the #252 lesson) but keep
    the command text around them, including everything AFTER each body's
    terminating delimiter. The pre-#559 scan stopped at the first `<<`, so a
    chained watch->merge (or --admin merge) sequenced after any heredoc passed
    unjudged -- the dangerous direction for this gate. An unterminated heredoc
    swallows the rest of the string as body (matching shell semantics).
    Residual, accepted: multiple heredocs opened on one line scan only the
    first's tail."""
    out, rest = [], str(command)
    while True:
        m = HEREDOC.search(rest)
        if not m:
            out.append(rest)
            return "".join(out)
        out.append(rest[:m.end()])
        end = re.search(r"(?m)^[ \t]*%s[ \t]*$" % re.escape(m.group(2)), rest[m.end():])
        if not end:
            return "".join(out)
        rest = rest[m.end() + end.end():]

CHAINED_MSG = (
    "BLOCKED: checks-watch/poll chained into `gh pr merge` in one command -- the merge "
    "would fire the moment the watch exits, even over a red gate (#176 -> #177; guard: #253).\n"
    "Run the watch/poll alone, READ the checks green with your own eyes, then issue the "
    "merge as its own separate command (ship_pr steps 5-6).\n"
)
ADMIN_MSG = (
    "BLOCKED: `--admin` on a `gh pr merge` -- the branch-protection override, which merges "
    "over whatever the gate says (guard: #423; ship_pr > Don't, conventions > Merge policy).\n"
    "A red or unreadable check routes back to preflight, never forward to an admin merge. "
    "A genuine override is the owner's call, run outside the session -- this hook binds "
    "human and agent alike by design (decision #422).\n"
)


def log_hit(rule):
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
            f.write(json.dumps({"ts": ts, "guard": "block_chained_merge",
                                "rule": rule, "action": "deny"}) + "\n")
    except Exception:
        pass


def verdict(command):
    """(rule, message) to block, or None to allow. Pure, so --selftest drives it.

    Heredoc bodies are excluded from scanning (the #252 lesson). Every MERGE
    match is examined, not just the first -- `gh pr merge 4; gh pr merge 5
    --admin` hides the violation on the SECOND merge (a hole in one downstream's
    reference implementation, closed here). `--admin` attribution is scoped
    to each merge's own segment (up to the next separator) so a later
    unrelated command carrying the flag is not blamed on the merge."""
    command = strip_heredoc_bodies(command)
    watch = WATCHISH.search(command)
    for merge in MERGE.finditer(command):
        tail = command[merge.end():]
        cuts = [i for i in (tail.find(c) for c in SEP_CHARS) if i != -1]
        if ADMIN.search(tail[:min(cuts)] if cuts else tail):
            return "admin-merge", ADMIN_MSG
        if watch and watch.start() < merge.start():
            return "chained-merge", CHAINED_MSG
    return None


# --selftest (#342, side-effect-free per #319: pure verdict() checks, no
# stdin, no ledger writes). `want` is the expected rule, or None for allow.
# FAIL-line format matches check_hook_selftests' scrape. Corpus proven to
# bite per #424: every must-fire case allowed by the pre-#423 code, every
# near-miss red under a targeted mutation (evidence in PR).
SELFTEST_CASES = [
    # -- #253: chained watch/poll -> merge --
    ("gh pr checks 5 --watch && gh pr merge 5", "chained-merge", "bare gh, watch chained"),
    ("gh pr checks 5 && gh pr merge 5", "chained-merge", "bare gh, poll chained (no --watch)"),
    ('& "C:\\Program Files\\GitHub CLI\\gh.exe" pr checks 5 --watch; '
     '& "C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 5', "chained-merge",
     "quoted full-path gh.exe behind the call operator"),
    ("gh.exe pr checks 5 --watch && gh.exe pr merge 5", "chained-merge", "bare gh.exe"),
    ("/usr/local/bin/gh pr checks 5 && /usr/local/bin/gh pr merge 5", "chained-merge",
     "unquoted full path"),
    ("& 'C:\\tools\\gh cli\\gh.exe' run watch 9; & 'C:\\tools\\gh cli\\gh.exe' pr merge 4",
     "chained-merge", "single-quoted path with spaces, run-watch form"),
    ('& "gh.exe" pr checks 5 --watch; & "gh.exe" pr merge 5', "chained-merge",
     "quoted gh.exe with NO path -- legal PowerShell (#467)"),
    ("gh pr merge 4 --squash; gh pr checks 5 --watch && gh pr merge 5", "chained-merge",
     "watch chained before the SECOND merge (finditer, not first-match)"),
    # -- #423: --admin in any position, any spelling --
    ("gh pr merge 5 --admin", "admin-merge", "flag-later -- the prefix-deny blind spot"),
    ("gh pr merge --admin 5", "admin-merge", "flag-first (the settings deny's own shape)"),
    ("gh pr merge 5 --admin --squash --delete-branch", "admin-merge", "mid-argument-list"),
    ('& "C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 5 --admin', "admin-merge",
     "quoted full-path spelling, trailing --admin"),
    ("gh.exe pr merge 5 --admin", "admin-merge", "bare gh.exe spelling"),
    ('& "gh.exe" pr merge 5 --admin', "admin-merge", "quoted no-path gh.exe (#467)"),
    ("gh pr checks 5 --watch && gh pr merge 5 --admin", "admin-merge",
     "both shapes in one command -- admin-merge names the worse one"),
    ("gh pr merge 4 --squash; gh pr merge 5 --admin", "admin-merge",
     "--admin on the SECOND merge (finditer, not first-match)"),
    # -- near-misses that must NOT fire --
    ("gh pr merge 5 --squash --delete-branch", None, "merge alone"),
    ("gh pr checks 5 --watch", None, "watch alone"),
    ('& "C:\\tools\\foo-gh.exe" pr checks 1 --watch; & "C:\\tools\\foo-gh.exe" pr merge 1',
     None, "foo-gh.exe is not gh"),
    ('& "my-gh.exe" pr checks 1 --watch; & "my-gh.exe" pr merge 1', None,
     "my-gh.exe is not gh -- an optional prefix must still end in a separator (#467)"),
    ("gh pr merge 5 && gh pr checks 5", None, "merge before checks (wrong order)"),
    ("echo 'gh pr checks --watch && gh pr merge'", None, "prose after echo"),
    ("echo 'never run gh pr merge 5 --admin'", None, "--admin in echoed prose"),
    ("gh api /admin/teams && gh issue list --label admin", None,
     "non-merge gh subcommands mentioning admin"),
    ("gh pr merge 5 --squash && terraform apply --admin", None,
     "--admin on a later unrelated command (segment attribution)"),
    ("gh issue comment 5 --body-file - <<'EOF'\ngh pr checks --watch && gh pr merge 5 --admin\nEOF",
     None, "heredoc prose mentioning both shapes (#252)"),
    # -- #559: commands AFTER a heredoc body are scanned again --
    ("gh issue comment 5 --body-file - <<'EOF'\nprose notes\nEOF\n"
     "gh pr checks 5 --watch && gh pr merge 5", "chained-merge",
     "chained watch->merge sequenced after a heredoc body (#559)"),
    ("gh pr comment 5 --body-file - <<'EOF'\nreview notes\nEOF\ngh pr merge 5 --admin",
     "admin-merge", "--admin merge after a heredoc body (#559)"),
    ("git commit -F - <<'MSG'\nfix: x\n\nbody\nMSG\ngh pr merge 5 --squash", None,
     "clean merge after a heredoc commit still allowed (#559)"),
    ("gh issue comment 5 --body-file - <<'EOF'\ngh pr merge 5 --admin", None,
     "unterminated heredoc: the rest is body, stays prose (#559)"),
]


def selftest():
    fails = []
    for cmd, want, label in SELFTEST_CASES:
        got = verdict(cmd)
        got_rule = got[0] if got else None
        if got_rule != want:
            fails.append(f"FAIL {label}: want {want or 'allow'}, got {got_rule or 'allow'}")
    print(f"block_chained_merge selftest: "
          f"{len(SELFTEST_CASES) - len(fails)}/{len(SELFTEST_CASES)} PASS")
    for f in fails:
        print(f)
    return 1 if fails else 0


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") not in ("Bash", "PowerShell"):
        return 0
    hit = verdict(payload.get("tool_input", {}).get("command", ""))
    if not hit:
        return 0
    rule, message = hit
    log_hit(rule)
    sys.stderr.write(message)
    return 2


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
