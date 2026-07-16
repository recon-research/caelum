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
# NAME THE OWNING SKILL and the steps owed. Field failure (Caelum, 2026-07-15):
# a session hand-drove git/gh below ship_pr; hook- and script-backed mechanics
# fired, skill-step-backed ones (claim/receipt/checkpoint) silently didn't.
# Skill invocation is unobservable to hooks, so the guard is routing at the
# moment, not enforcement. Retire-when: the harness gains native skill-step
# enforcement, or fleet receipts-coverage holds ~100% across 2+ retro periods.
#
# guard: #275 (intake #272, hit live) -- the claim-moment rule keys on
# `git push -u/--set-upstream` (a new branch's FIRST push is the claim moment),
# not a branch-prefix literal: the old `slice/` match was silently inert on
# topical-prefix downstreams -- a guard that looks wired while covering nothing.
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
     "preflight, never forward to merge. Merging belongs to ship_pr -- driving gh by "
     "hand skips its steps: the cost receipt (step 7) posts right after this merge, and "
     "the merge-time checkpoint rides the same breath (#263)."),
    (re.compile(SEP + r"gh\s+pr\s+create\b"), "pr-create",
     "PR creation is ship_pr step 4 -- if you are hand-driving gh, invoke the skill: "
     "the claim (step 0) should already exist on the ticket, the body goes via "
     "--body-file (never inline), and the cost receipt (step 7) is owed at merge (#263)."),
    (re.compile(SEP + r"git\s+push\b[^\n;&|]*[\s:]main\b"), "push-main",
     "Push rules (conventions > Merge policy): `main` is never pushed directly -- work "
     "rides a slice/checkpoint branch through a PR."),
    (re.compile(SEP + r"git\s+push\b[^\n;&|]*(?:\s-u\b|\s--set-upstream\b)"), "first-push",
     "First push of a branch -- if this is a slice claim (ship_pr step 0): post the "
     "claim comment on the ticket and snapshot `python3 scripts/slice_telemetry.py "
     "claim <NN>`; the merge receipt (step 7) reads it. Checkpoint/rescue branches: "
     "carry on (#275)."),
    (re.compile(SEP + r"gh\s+issue\s+close\b"), "issue-close",
     "Closing an issue by hand: an inbox ticket owes its receipt comment first "
     "(triage_inbox step 4); a decision ticket owes its D-NN row in ARCHITECTURE "
     "Appendix A before the close (onboard step 4 audits this) (#279)."),
]

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
                              text=True, timeout=10).stdout.strip()
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
                                 capture_output=True, text=True, timeout=10).stdout
            paths += [ln.strip() for ln in out.splitlines() if ln.strip()]
        return [(name, text) for pattern, name, text in PATH_RULES
                if any(pattern.match(p) for p in paths)]
    except Exception:
        return []  # fail-open, like every hook here


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
    if any(name == "commit" for name, _ in hits):
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
    sys.exit(main())
