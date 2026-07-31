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
#
# guard: #263 (skill-routing rules) -- the merge/pr-create/first-push texts also
# NAME THE OWNING SKILL and the steps owed. Field failure (a downstream, 2026-07-15):
# a session hand-drove git/gh below ship_pr; hook- and script-backed mechanics
# fired, skill-step-backed ones (claim/receipt/checkpoint) silently didn't.
# Skill invocation is unobservable to hooks, so the guard is routing at the
# moment, not enforcement. Retire-when: the harness gains native skill-step
# enforcement, or fleet receipts-coverage holds ~100% across 2+ retro periods.
#
# guard: #275 (intake #272, hit live) -- the claim-moment rules key on git
# VERBS, never a branch-prefix literal: the original `slice/` match was silently
# inert on topical-prefix downstreams -- a guard that looks wired while covering
# nothing. Both rules below inherit that: any `-b`/`-c`, any `-u` push.
# AMENDED by #634: `push -u` was the ONLY claim moment, and it is structurally
# AFTER every expensive thing a slice does -- so on the priciest slice class
# (gated skills, where the eval re-earn dominates) the reminder arrived
# guaranteed-too-late, and the receipt under-reported ~142k subagent tokens.
# The claim nudge therefore fires at branch CREATION; `push -u` demotes to the
# late backstop for branches created outside a matched command. The rows this
# produced are excluded from the wall ratio by metrics.py `_claim_at_push`
# (#657) -- fix and guard, per the retrospective discipline.
# Retire-when: with #263.
#
# guard: #279 (path-aware commit rules + issue-close) -- textbook/research/
# settings/ARCHITECTURE rules govern ARTIFACTS, not commands; the observable
# moment is `git commit`, where the index is already staged (explicit staging
# is the written convention), so the commit rule scans
# `git diff --cached --name-only` and appends path-conditional pointers.
# A chained `git add ... && git commit` defeats the index scan (the hook runs
# BEFORE the add) -- and chaining is the dominant pattern, so the `git add`
# segment's path tokens are harvested from the command string too (hit live on
# this rule's own shipping commit). Known limit, accepted: `git commit -a`
# (paths never appear anywhere) stays invisible -- non-blocking reminder,
# don't chase it. Rejected: Edit/Write matchers (fire per edit -- #253 noise bar);
# WebFetch citation reminders (high frequency, low precision -- the artifact
# passes through the commit anyway). Retire-when: with #263.
#
# guard: #290 (AskUserQuestion elicitation bar) -- the one moment where a JIT
# rule and its governed action coincide exactly: the question tool itself.
# TIMING, honest: additionalContext lands alongside the tool result -- i.e.
# with/after the owner's answer -- so this is the audit-the-exchange moment
# (was the owner equipped to evaluate these options? repair before building
# on the answer), never a pre-ask gate. Text routes to understand_intent +
# research/notes/intent-elicitation.md (single-home). Wired as its own
# settings matcher; owner go-ahead in-session 2026-07-16 on #290.
# Retire-when: with #263, or zero fires across 2+ retro periods (#253).
#
# guard: #662 (committing ON the default branch) -- the residual #634 exposed,
# found the only honest way: while shipping #634 itself, this file was edited on
# `main` and branched afterward, so the new branch-create nudge fired AFTER the
# work -- the exact failure it exists to close. #634 covers the normal path
# (branch, then work); it cannot cover the path where no branch is created at
# the start, and between the first edit and `git commit` nothing fired at all.
# The first mechanical objection arrived at `push-main`, by which time the
# commit already existed and ship_pr step 2 ("never commit on main") had been
# written policy with no backing. So the commit rule gains a HEAD check: it
# already shells out for the #279 path rules, making this one more cheap call
# in a handler that only runs at commit time.
# REMINDER, NOT A BLOCK (D-422): a blocking hook needs a "never, by anyone"
# shape, and committing on the default branch is legitimate pre-`origin` -- the
# template itself ships that way through PROJECT_BACKLOG.md's pre-tracker
# phase. Rejected, same as #279: a PreToolUse on Edit/Write would catch the
# truly right moment but fires on every edit (#253's noise bar; the run-cost
# caveat in retrospective s rung 1 prefers the once-per-ship gate when either
# would hold).
# AMENDED by #669, caught on this guard's OWN FIRST PRODUCTION USE: PreToolUse
# runs before the command, so on the chained `checkout -b X && git add … &&
# git commit …` form HEAD still read as the trunk and the nudge fired on a
# commit that was never going to land there. That form is the dominant one
# here -- every checkpoint types it -- so the false positive would have
# outnumbered the true ones and trained the reader to skim the line (#253).
# The fix is #279's, one rule over: for a hook that runs before the command,
# the COMMAND STRING is the oracle, not repo state -- so a `branch-create`
# match in the same command suppresses the nudge. Retire-when: with #263.
import json
import os
import re
import subprocess
import sys

# The cap is READ from the guard that enforces it, never restated (#715): a
# reminder quoting a bar the hook is not applying is worse than no number at
# all, and this line used to be one of fourteen places the literal 72 lived.
# Fail-open like everything else here -- an unreadable sibling costs the
# number, not the reminder.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from block_commit_rules import SUBJECT_CAP, TITLE_CAP
    _CAP_PHRASE = f"summary <={SUBJECT_CAP} chars"
    # A DIFFERENT number on purpose (#735): GitHub appends ` (#NNN)` to the
    # squash subject after every hook has run, so the title bar sits below the
    # subject bar. Read from the guard for the same reason the summary cap is.
    _TITLE_PHRASE = f"title <={TITLE_CAP} chars (GitHub's ` (#NNN)` is reserved on top)"
except Exception:
    _CAP_PHRASE = "summary within the cap block_commit_rules.py enforces"
    _TITLE_PHRASE = "title within the PR-title cap block_commit_rules.py enforces"

# The separator class matches block_naked_todos: compound ("a && git commit")
# and multi-line commands are routine, so a start-anchored match would
# silently wave them through (a downstream proved it live -> #207).
SEP = r"(?:^|[\n;&|])\s*"
# #342 (intake #327): gh may be invoked as a quoted/full-path gh(.exe) -- the
# sanctioned Windows idiom -- which a bare `gh\s+` anchor misses. #467: the
# quoted path is optional (& "gh.exe" is legal PowerShell); when present it
# must end in a separator, so foo-gh.exe never matches. Twin of the
# GH token in block_chained_merge.py; keep them in step.
GH = (r"(?:&\s*)?"
      r"(?:\"(?:[^\"\n]*[\\/])?gh(?:\.exe)?\""
      r"|'(?:[^'\n]*[\\/])?gh(?:\.exe)?'"
      r"|[^\s;|&\"'\n]*[\\/]gh(?:\.exe)?"
      r"|gh(?:\.exe)?"
      r")\s+")
# git-binary twin of GH (#559): same #342/#467 spellings, git-flavored
# interveners -- `git.exe commit` / full-path git used to skip the commit and
# push reminders while the blocking hooks judged the same command. Twin of the
# GIT token in block_naked_todos.py / block_commit_rules.py; keep in step.
GIT = (r"(?:&\s*)?"
       r"(?:\"(?:[^\"\n]*[\\/])?git(?:\.exe)?\""
       r"|'(?:[^'\n]*[\\/])?git(?:\.exe)?'"
       r"|[^\s;|&\"'\n]*[\\/]git(?:\.exe)?"
       r"|git(?:\.exe)?"
       r")(?:\s+-C\s+\S+|\s+-c\s+\S+|\s+--no-pager)*\s+")
RULES = [
    (re.compile(SEP + GIT + r"commit\b"), "commit",
     "Commit rules (conventions > PR / commit mechanics): stage explicitly and check "
     f"`git status` for strays; multiline message via Bash here-doc; {_CAP_PHRASE} "
     "citing the ticket; NO AI-attribution trailers (no Co-Authored-By / Claude-Session)."),
    (re.compile(SEP + GH + r"pr\s+merge\b"), "merge",
     "Merge rules (ship_pr steps 5-6, #177): the checks must have been READ GREEN with "
     "your own eyes already, and this merge must be a SEPARATE command -- never chained "
     "onto a watch/poll; never --admin; a red or unreadable check routes back to "
     "preflight, never forward to merge. Merging belongs to ship_pr -- driving gh by "
     "hand skips its steps: the cost receipt (step 7) posts right after this merge, and "
     "the merge-time checkpoint rides the same breath (#263)."),
    (re.compile(SEP + GH + r"pr\s+create\b"), "pr-create",
     "PR creation is ship_pr step 4 -- if you are hand-driving gh, invoke the skill: "
     "the claim (step 0) should already exist on the ticket, the body goes via "
     f"--body-file (never inline), {_TITLE_PHRASE}, and the cost receipt (step 7) is "
     "owed at merge (#263)."),
    (re.compile(SEP + GIT + r"push\b[^\n;&|]*[\s:]main\b"), "push-main",
     "Push rules (conventions > Merge policy): `main` is never pushed directly -- work "
     "rides a slice/checkpoint branch through a PR."),
    # #634: the claim nudge belongs HERE, at branch creation -- structurally
    # before the work -- not at first push, which is structurally after every
    # expensive thing a slice does. Branch NAMES vary per project (#275), so
    # this matches any -b/-c and lets the text disclaim; a `slice/` anchor would
    # go dark downstream. The first-push rule below stays as the backstop for a
    # branch created outside a matched command (a GUI, a bare `git branch`).
    # #670: the create flag need not be the FIRST token after the verb -- this
    # repo types `checkout -q -b` on every checkpoint, which the original
    # `checkout\s+-b` waved straight through: a guard that looks wired while
    # covering nothing (#275's own failure, fourth in the #418/#467/#559
    # spelling-gap lineage -- those hardened the BINARY spelling, this hardens
    # the FLAG spelling). Only `-`-leading tokens are skipped, so `git checkout
    # main` still must not match; -B/-C force-create is a claim moment too.
    (re.compile(SEP + GIT + r"(?:checkout(?:\s+-{1,2}[^\s;&|]+)*\s+-[bB]\s"
                            r"|switch(?:\s+-{1,2}[^\s;&|]+)*\s+-[cC]\s)"), "branch-create",
     "New branch = ship_pr step 0: claim BEFORE the work, not at first push. Post the "
     "claim comment on the ticket and snapshot `python3 scripts/slice_telemetry.py "
     "claim <NN>` now. A claim posted later measures only the slice's tail -- the cost "
     "delta starts at the snapshot (#634: a gated-skill slice under-reported ~142k "
     "subagent tokens) and the wall row degenerates to CI latency (#657). "
     "Checkpoint/rescue branches: carry on (#275)."),
    (re.compile(SEP + GIT + r"push\b[^\n;&|]*(?:\s-u\b|\s--set-upstream\b)"), "first-push",
     "First push of a branch -- LAST chance, and already late for a slice claim: if no "
     "`claim:` comment + `slice_telemetry.py claim <NN>` snapshot exists yet (ship_pr "
     "step 0), post them now and expect the receipt to carry `cost-src=late-claim` -- "
     "the numbers bound the tail, not the slice (#634). Checkpoint/rescue branches: "
     "carry on (#275)."),
    (re.compile(SEP + GH + r"issue\s+close\b"), "issue-close",
     "Closing an issue by hand: an inbox ticket owes its receipt comment first "
     "(triage_inbox step 4); a decision ticket owes its D-NN row in ARCHITECTURE "
     "Appendix A before the close (onboard step 4 audits this) (#279)."),
]

# #290: fired for the AskUserQuestion tool (own settings matcher), not for
# shell commands -- see the guard header for the timing honesty.
ASK_RULE = (
    "A structured question is reaching the owner (elicitation bar -- "
    "understand_intent owns the procedure; grounding: "
    "research/notes/intent-elicitation.md): options owe end-state consequences "
    "(what the owner's week looks like after shipping), recommended default "
    "first, genuinely distinguishable; only forks whose interpretations diverge "
    "in consequences deserve a question; teach before asking -- if the owner "
    "wasn't equipped to evaluate these options, close that gap before building "
    "on the answer (#290).")

# The branches a commit owes the #662 nudge on. A PROJECT-MIRRORED constant on
# the CHECKPOINT_PREFIXES / PREFLIGHT_SHELLS pattern (#295, #340, #349): a
# downstream whose trunk is `trunk` or `develop` sets ITS value and
# update_from_template preserves it through syncs. Resolving `origin/HEAD`
# instead was measured and rejected: `git clone` sets that ref but `git init` +
# `git remote add` does not, which is the template's OWN path -- so the probe
# would be dead exactly where the template lives and the literal would do the
# work anyway. One `symbolic-ref` call, one constant (#662).
DEFAULT_BRANCHES = ("main", "master")

COMMIT_ON_DEFAULT_RULE = (
    "Committing on the default branch: ship_pr step 2 -- work rides a "
    "slice/checkpoint branch through a PR, so branch FIRST and, if this is a "
    "slice, the claim is already late (#634). Legitimate pre-`origin` (the "
    "template's own PROJECT_BACKLOG.md phase) -- a reminder, not a block "
    "(D-422, #662).")


# The same rule one step earlier (#794). Every claim reminder above keys on a
# GIT EVENT -- creating the branch, or pushing it -- so a session that simply
# never branches has no event to intercept: it edits, tests, and dispatches its
# whole slice unguarded, and gets warned only once it reaches `git checkout -b`,
# after the spend. Observed on #750, whose receipt reads `agents=0 usd=1.08` on a
# slice whose eval re-earn burned ~220k subagent tokens; `cost-src=late-claim`
# fired correctly, but the marker only records the loss, it cannot prevent it.
# So the earliest observable is the first EDIT, which needs no git event at all.
EDIT_TOOLS = ("Edit", "Write", "MultiEdit", "NotebookEdit")

# The ledger dir is gitignored and written by the telemetry layer, not by slice
# work -- editing there is never the thing this guard is about. It is also where
# this guard's own once-per-session marker lands, so excluding it keeps the guard
# from tripping over its own bookkeeping.
LEDGER_REL = os.path.join(".claude", "metrics")

EDIT_ON_DEFAULT_RULE = (
    "Editing a repo file on the default branch: ship_pr step 0 wants the branch "
    "AND the claim BEFORE the work, not at the first commit. Nothing downstream "
    "recovers this -- the branch-create and first-push reminders both key on a git "
    "event, so work begun straight on the trunk runs unguarded until after it is "
    "paid for (#794, seen on #750: `agents=0 usd=1.08` on a row whose re-earn cost "
    "~220k subagent tokens). Branch now, post the `claim:` comment, and snapshot "
    "`slice_telemetry.py claim <NN>` -- otherwise expect `cost-src=late-claim`, "
    "which bounds the tail and not the slice (#634, #783). Legitimate pre-`origin` "
    "(the template's PROJECT_BACKLOG.md phase) or a deliberate direct-to-main doc "
    "fix -- a reminder, not a block (D-422). Fires ONCE per session: silence on the "
    "next edit is bookkeeping, not absolution.")


# Path-aware commit rules (#279): consulted only when the commit rule above has
# fired; each pattern matches repo-relative staged paths. One line per matched
# class, however many files hit it.
PATH_RULES = [
    (re.compile(r"^textbooks/"), "commit-textbooks",
     "Staged textbooks/: regenerate SECTIONS.json and run the audits before shipping "
     "(CLAUDE.md > Keep the library honest; build_library owns the procedure); "
     "Book NN §X citations verify against SECTIONS.json (#279)."),
    (re.compile(r"^research/(notes/|MANIFEST\.json$)"), "commit-research-notes",
     "Staged research notes: every claim carries a real fetched URL + accessed date + "
     "tier, and notes stale ~2 quarters (research_topic owns; audit: "
     "research/tools/_audit_research.py) (#279)."),
    (re.compile(r"^research/experiments/[^/]+/results/"), "commit-exp-results",
     "Staged experiment results: the pre-registration (EXPERIMENT.md hypothesis / "
     "metrics / success bar) must already be committed -- success is defined BEFORE "
     "results exist (run_experiment step 2, the cherry-picking guard) (#279)."),
    (re.compile(r"^\.claude/settings\.json$"), "commit-settings",
     "Staged settings.json: mechanical class only in autonomous sessions -- allow/deny "
     "grant edits ride the owner-gated path (#242) (#279)."),
    (re.compile(r"^docs/ARCHITECTURE\.md$"), "commit-architecture",
     "Staged ARCHITECTURE.md: D-NN rows are commitments -- a new row means a decision "
     "landed (close its issue); never edit an existing row to match drift (#279)."),
]


def repo_root():
    # Same repo-root resolution as block_naked_todos.
    root = os.environ.get("CLAUDE_PROJECT_DIR")
    if root and os.path.isdir(root):
        return root
    try:
        root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                              text=True, timeout=10, encoding="utf-8", errors="replace",
                              ).stdout.strip()
    except Exception:
        return None
    return root if root and os.path.isdir(root) else None


def command_add_paths(command):
    # Path tokens from any `git add` segment -- covers the chained
    # add-and-commit pattern the index scan can't see (see header). Tokens are
    # read as repo-relative (the session convention runs from repo root).
    paths = []
    for seg in re.findall(r"git\s+add\s+([^\n;&|]*)", command):
        paths += [t for t in seg.split() if not t.startswith("-")]
    return paths


def staged_path_hits(extra_paths=()):
    # #279: whatever is already staged, plus paths named by the command itself.
    try:
        paths = list(extra_paths)
        root = repo_root()
        if root:
            out = subprocess.run(["git", "-C", root, "diff", "--cached", "--name-only"],
                                 capture_output=True, text=True, timeout=10,
                                 encoding="utf-8", errors="replace").stdout
            paths += [ln.strip() for ln in out.splitlines() if ln.strip()]
        return [(name, text) for pattern, name, text in PATH_RULES
                if any(pattern.match(p) for p in paths)]
    except Exception:
        return []  # fail-open, like every hook here


def trunk_nudge(fired, branch):
    """True if this commit owes the #662 trunk nudge.

    Pure on purpose -- the selftest drives it directly and the `git
    symbolic-ref` call stays with the caller (the audit_shell/audit_secrets
    split).

    `branch` is "" on detached HEAD or any git failure, which reads as "don't
    nudge": fail-open, like every hook here. Membership is EXACT, never a
    substring test -- `maintenance` and `slice/main-fix` are not the trunk.

    `fired` is the rule-name set for the SAME command. A command that creates
    its branch ahead of the commit will not land on the trunk -- but PreToolUse
    runs BEFORE any of it executes, so repo state still reads `main` and the
    nudge fired on a commit that was never going to land there (#669, caught on
    this guard's own first production use). Identical root cause to #279's
    index scan, and the identical remedy: for a hook that runs before the
    command, the command string is the oracle, not repo state. The chained
    create-then-commit form is the DOMINANT one here -- every checkpoint types
    it -- so this clause is the difference between a guard and noise (#253).
    """
    if "branch-create" in fired:
        return False
    return branch.strip() in DEFAULT_BRANCHES if branch else False


def edit_nudge(path, branch, root):
    """True if this edit owes the #794 claim nudge. Pure, like `trunk_nudge`.

    Deliberately has NO checkpoint/rescue carve-out, which corrects the premise
    the ticket was filed on. #275 exempts checkpoint and rescue *branches* from
    the slice-claim reminder, and that exemption is about which branch you are
    on -- both flows branch FIRST and edit afterwards, so neither of them ever
    edits on the trunk. An edit here is premature whatever it touches, including
    the checkpoint trio: the repair is always "branch, then edit".

    Membership is EXACT (`maintenance` is not the trunk) and the tree test keeps
    the separator (`/repo-sibling` is not inside `/repo`) -- the same two traps
    `trunk_nudge` and #783's path filter each had to close. An empty branch means
    detached HEAD or a git failure and reads as "don't nudge": fail-open, like
    every hook here.
    """
    if not branch or branch.strip() not in DEFAULT_BRANCHES:
        return False
    if not path or not root:
        return False
    p = os.path.normcase(os.path.abspath(path))
    r = os.path.normcase(os.path.abspath(root))
    if p == r or not p.startswith(r + os.sep):
        return False
    return not p[len(r) + 1:].startswith(os.path.normcase(LEDGER_REL) + os.sep)


def edit_target(tool_input):
    """The path an edit tool is about to write. Pure so the corpus can pin it.

    `NotebookEdit` names its target `notebook_path`; every other edit tool uses
    `file_path`. Reading only one leaves a hole that no path or branch case can
    see -- the guard would simply never fire for that tool -- so the choice lives
    here rather than inline at the call site (#794).
    """
    ti = tool_input or {}
    return str(ti.get("file_path") or ti.get("notebook_path") or "")


def claim_nudge_owed(root, session_id):
    """Caller half of `edit_nudge`: True the first time a session earns it.

    A slice makes dozens of edits and an identical reminder on each one is how a
    guard dies -- the reader learns to skim exactly the line that mattered. The
    marker lands in the gitignored ledger dir, which `edit_nudge` excludes, so
    writing it can never re-arm the guard.

    Any failure returns True: a reminder repeated is recoverable, a reminder
    swallowed by a bookkeeping error is the whole defect this guard exists for.
    """
    try:
        tag = re.sub(r"[^0-9a-zA-Z]", "", str(session_id or "nosid"))[:8] or "nosid"
        path = os.path.join(root, LEDGER_REL, f"claim_nudge.{tag}")
        if os.path.exists(path):
            return False
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(tag + "\n")
        return True
    except Exception:
        return True


def head_branch():
    # Caller half of on_default_branch(). Empty string on detached HEAD, on a
    # repo-root miss, or on any subprocess failure -> no nudge.
    try:
        root = repo_root()
        if not root:
            return ""
        r = subprocess.run(["git", "-C", root, "symbolic-ref", "--short", "HEAD"],
                           capture_output=True, text=True, timeout=10,
                           encoding="utf-8", errors="replace")
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def log_fires(names):
    # Ledger is gitignored.
    try:
        root = repo_root()
        if not root:
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


def rule_names(command):
    """Rule names the command string fires (pure -- no ledger, no git)."""
    command = command.split("<<", 1)[0]
    return [name for pattern, name, _ in RULES if pattern.search(command)]


# --selftest (#342, side-effect-free per #319). (command, must_fire, must_not_fire).
SELFTEST_CASES = [
    ('& "C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 5', ["merge"], []),
    ("gh.exe pr create --body-file body.md", ["pr-create"], []),
    ("/usr/local/bin/gh issue close 7", ["issue-close"], []),
    ("gh pr merge 5 --squash", ["merge"], []),
    ('& "C:\\tools\\foo-gh.exe" pr merge 5', [], ["merge"]),
    ('& "gh.exe" pr merge 5', ["merge"], []),
    ('& "my-gh.exe" pr merge 5', [], ["merge"]),
    ("git commit -F msg.txt", ["commit"], ["merge"]),
    # -- #559: git-binary spellings beyond bare `git` --
    ("git.exe commit -m x", ["commit"], []),
    ('& "C:\\Program Files\\Git\\bin\\git.exe" commit -F -', ["commit"], []),
    ("git -C . push -u origin slice/1-x", ["first-push"], []),
    ("git.exe push origin main", ["push-main"], []),
    ("foo-git.exe commit -m x", [], ["commit"]),
    # -- #634: the claim nudge fires at branch creation, both spellings, and
    # survives the compound form this repo actually types (create && push).
    ("git checkout -b slice/634-x", ["branch-create"], ["first-push"]),
    ("git switch -c slice/634-x", ["branch-create"], []),
    ("git.exe checkout -b fix/1", ["branch-create"], []),
    ("git checkout -b slice/634-x >/dev/null && git push -u origin slice/634-x",
     ["branch-create", "first-push"], []),
    # Checking OUT an existing branch is not a claim moment -- a bare -b anchor
    # would fire on every `git checkout main` and train the reader to ignore it.
    ("git checkout main", [], ["branch-create"]),
    ("git switch main", [], ["branch-create"]),
    ("foo-git.exe checkout -b slice/1-x", [], ["branch-create"]),
    # -- #670: the create flag is not always the first token after the verb.
    # `-q` is what this repo types on every checkpoint branch, and it defeated
    # the rule silently. Negatives guard the other direction: skipping only
    # `-`-leading tokens must not turn `checkout main` into a claim moment.
    ("git checkout -q -b checkpoint/x", ["branch-create"], []),
    ("git checkout --quiet -b slice/670-x", ["branch-create"], []),
    ("git switch -q -c slice/670-x", ["branch-create"], []),
    ("git checkout -B slice/670-x", ["branch-create"], []),
    ("git switch -C slice/670-x", ["branch-create"], []),
    ("git checkout -q main", [], ["branch-create"]),
    ("git switch --quiet main", [], ["branch-create"]),
    ("git checkout -q -b checkpoint/x && git add docs/METRICS.md && git commit -q -m y",
     ["branch-create", "commit"], []),
]

# #662/#669: HEAD-state corpus for trunk_nudge (the command corpus above can't
# reach it -- rule_names is pure and never touches git). (fired, branch, owes).
# Two mutation targets, both real escapes this guard already made:
#   * `maintenance` / `slice/main-fix` -- relax exact membership to a substring
#     test and they go red (#662).
#   * the branch-create rows -- drop the #669 clause and they go red, which is
#     the false positive this guard shipped with.
TRUNK_CASES = [
    ([], "main", True),
    ([], "master", True),
    ([], "main\n", True),                       # symbolic-ref output, unstripped
    ([], "slice/662-commit-on-main-nudge", False),
    ([], "checkpoint/2026-07-28", False),
    ([], "maintenance", False),
    ([], "slice/main-fix", False),
    ([], "", False),                            # detached HEAD -> fail-open
    (["commit"], "main", True),                 # plain commit on the trunk
    (["commit", "branch-create"], "main", False),   # #669: chained create-then-commit
    (["commit", "branch-create"], "master", False),
    (["commit", "branch-create"], "slice/1-x", False),
]


# #794, pure over `edit_nudge`: (path, branch, root, want_nudge).
EDIT_CASES = [
    ("/repo/scripts/x.py", "main", "/repo", True),
    ("/repo/scripts/x.py", "master", "/repo", True),
    # No checkpoint carve-out: the trio on the trunk is still premature, because
    # a real checkpoint branches first (see the docstring -- this corrects the
    # premise #794 was filed on).
    ("/repo/CLAUDE.md", "main", "/repo", True),
    ("/repo/docs/METRICS.md", "main", "/repo", True),
    # On a slice or checkpoint branch there is nothing to say.
    ("/repo/scripts/x.py", "slice/794-claim-guard", "/repo", False),
    ("/repo/scripts/x.py", "checkpoint/750-metrics", "/repo", False),
    # Exact membership, never a substring -- `trunk_nudge`'s trap.
    ("/repo/scripts/x.py", "maintenance", "/repo", False),
    ("/repo/scripts/x.py", "slice/main-fix", "/repo", False),
    # Detached HEAD / git failure / no root -> fail-open, stay quiet.
    ("/repo/scripts/x.py", "", "/repo", False),
    ("/repo/scripts/x.py", "main", None, False),
    ("", "main", "/repo", False),
    # Scratchpad and other out-of-tree writes are not slice work.
    ("/tmp/scratch/measure.py", "main", "/repo", False),
    # The separator guard -- a sibling sharing the root's prefix is outside it
    # (#783's Q3 in a new place).
    ("/repo-sibling/x.py", "main", "/repo", False),
    # The root itself is not a file edit.
    ("/repo", "main", "/repo", False),
    # The gitignored ledger, incl. this guard's own once-per-session marker.
    ("/repo/.claude/metrics/slice_costs.jsonl", "main", "/repo", False),
    ("/repo/.claude/metrics/claim_nudge.854777a9", "main", "/repo", False),
    # ...but `.claude/` itself is shipped machinery and very much counts.
    ("/repo/.claude/hooks/inject_rule_reminders.py", "main", "/repo", True),
]


# #794: which key names the edit target. NotebookEdit is the whole reason this is
# a function -- its hole is invisible to every path and branch case above.
TARGET_CASES = [
    ({"file_path": "/repo/a.py"}, "/repo/a.py"),
    ({"notebook_path": "/repo/nb.ipynb"}, "/repo/nb.ipynb"),
    ({"file_path": "", "notebook_path": "/repo/nb.ipynb"}, "/repo/nb.ipynb"),
    ({"command": "git status"}, ""),
    ({}, ""),
    (None, ""),
]


def edit_fire_test():
    """End-to-end fire test for the #794 branch, isolated to a temp repo (#319).

    Every case above is pure, and no pure case can see whether `main()` actually
    EMITS -- delete the print and the whole corpus still passes while the guard
    goes silent in production. That is the fail-open shape this project keeps
    finding (#593, #588, #603), so the wiring gets measured too: a throwaway git
    repo on `main`, the real hook as a subprocess, the real payload shape.

    Never the checkout: the temp dir IS the repo under test, so there is no
    baseline to restore and the hazard is structurally absent rather than guarded
    (the #759 reasoning applied to a fire test).
    """
    import tempfile
    fails = []
    try:
        with tempfile.TemporaryDirectory() as td:
            root = os.path.join(td, "repo")
            os.makedirs(os.path.join(root, "scripts"))
            env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
            for args in (["init", "-q", "-b", "main"],
                         ["config", "user.email", "t@example.invalid"],
                         ["config", "user.name", "t"]):
                subprocess.run(["git", "-C", root] + args, capture_output=True, timeout=20)

            def fire(tool, key, rel, sid):
                payload = json.dumps({"tool_name": tool, "session_id": sid,
                                      "tool_input": {key: os.path.join(root, rel)}})
                r = subprocess.run([sys.executable, os.path.abspath(__file__)],
                                   input=payload, capture_output=True, text=True,
                                   timeout=30, env=env, encoding="utf-8",
                                   errors="replace")
                return "Editing a repo file on the default branch" in r.stdout

            for label, got, want in (
                    ("fire: an edit on the trunk reaches stdout",
                     fire("Edit", "file_path", "scripts/x.py", "fireAAAA"), True),
                    ("fire: the same session is not told twice",
                     fire("Write", "file_path", "scripts/y.py", "fireAAAA"), False),
                    ("fire: the gitignored ledger is never flagged",
                     fire("Write", "file_path", os.path.join(".claude", "metrics", "l.jsonl"),
                          "fireBBBB"), False)):
                if got != want:
                    fails.append(f"FAIL {label}: want {want} got {got}")
    except Exception as e:  # a fire test that cannot run must say so, not pass
        fails.append(f"FAIL edit fire test could not run ({e.__class__.__name__}: {e})")
    return fails


def selftest():
    fails = []
    for cmd, must, must_not in SELFTEST_CASES:
        names = rule_names(cmd)
        for m in must:
            if m not in names:
                fails.append(f"FAIL {cmd[:60]!r}: missing rule {m}")
        for m in must_not:
            if m in names:
                fails.append(f"FAIL {cmd[:60]!r}: spurious rule {m}")
    for fired, branch, want in TRUNK_CASES:
        if trunk_nudge(fired, branch) != want:
            fails.append(f"FAIL trunk {branch!r} fired={fired}: want owes_nudge={want}")
    for path, branch, root, want in EDIT_CASES:
        if edit_nudge(path, branch, root) != want:
            fails.append(f"FAIL edit {path!r} on {branch!r} (root {root!r}): "
                         f"want owes_nudge={want}")
    for ti, want in TARGET_CASES:
        if edit_target(ti) != want:
            fails.append(f"FAIL target {ti!r}: want {want!r} got {edit_target(ti)!r}")
    # The dedupe is the difference between a guard and noise, so it is measured,
    # not assumed. Confined to a temp dir -- never the checkout (#319).
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        first = claim_nudge_owed(td, "sess1234abcd")
        again = claim_nudge_owed(td, "sess1234abcd")
        other = claim_nudge_owed(td, "sess9999zzzz")
        for label, got, want in (("first edit of a session nudges", first, True),
                                 ("the same session stays quiet after", again, False),
                                 ("a different session is independent", other, True),
                                 ("no root -> nudge rather than swallow",
                                  claim_nudge_owed(None, "s"), True)):
            if got != want:
                fails.append(f"FAIL dedupe {label}: want {want} got {got}")
    fails += edit_fire_test()
    total = (len(SELFTEST_CASES) + len(TRUNK_CASES) + len(EDIT_CASES)
             + len(TARGET_CASES) + 4 + 3)
    print(f"inject_rule_reminders selftest: "
          f"{total - len(set(f.split(':')[0] for f in fails))}/{total} PASS")
    for f in fails:
        print(f)
    return 1 if fails else 0


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    tool = payload.get("tool_name")
    if tool == "AskUserQuestion":
        log_fires(["ask-user-question"])
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": ASK_RULE,
        }}))
        return 0
    if tool in EDIT_TOOLS:
        target = edit_target(payload.get("tool_input"))
        root = repo_root()
        if edit_nudge(target, head_branch(), root) and claim_nudge_owed(
                root, payload.get("session_id")):
            log_fires(["edit-on-default"])
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": EDIT_ON_DEFAULT_RULE,
            }}))
        return 0
    if tool not in ("Bash", "PowerShell"):
        return 0
    command = str(payload.get("tool_input", {}).get("command", ""))
    # Don't scan heredoc bodies: a commit MESSAGE that mentions `gh pr merge`
    # is prose, not a command (false positive hit live on this hook's own
    # shipping commit, 2026-07-15). Truncating at the first heredoc marker
    # drops anything chained after it -- acceptable for a non-blocking
    # reminder; commands before the heredoc have already been scanned.
    command = command.split("<<", 1)[0]
    fired = set(rule_names(command))
    hits = [(name, text) for _, name, text in RULES if name in fired]
    if any(name == "commit" for name, _ in hits):
        # #662 leads: "you are on the trunk" outranks the staging/message
        # mechanics, because the repair is to branch BEFORE any of them apply.
        # `fired` is passed so a chained create-then-commit is not misread as a
        # trunk commit (#669) -- the predicate owns that reasoning.
        if trunk_nudge(fired, head_branch()):
            hits.insert(0, ("commit-on-default", COMMIT_ON_DEFAULT_RULE))
        hits += staged_path_hits(command_add_paths(command))
    if not hits:
        return 0
    log_fires([n for n, _ in hits])
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "additionalContext": "\n".join(text for _, text in hits),
    }}))
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
