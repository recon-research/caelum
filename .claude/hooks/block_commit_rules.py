# guard: #310 -- PreToolUse hook (matcher: Bash|PowerShell): BLOCKS a `git
# commit` whose explicitly-authored message breaks the commit-message
# mechanics -- the escalation rung (#310, program #301) for a reminder the
# ledger shows demonstrably ignored.
#
# Evidence at admission (2026-07-23, issue #310): the `commit` reminder
# (inject_rule_reminders.py) fired 96x since it landed 2026-07-15, and in the
# same window 38 of 122 authored subjects on main exceeded 72 chars
# (char-accurate, squash suffix stripped) -- 31% recurrence -- plus a live
# same-session ignore (PR #523's commit shipped subject-folded at 74 chars
# with the reminder on screen, needing an amend). Fires-but-ignored is the
# graduation trigger #310 pre-registered; blocking is earned by that ledger
# evidence, never the starting posture. Those figures are HISTORY, measured
# at the cap of the day (72) -- a record of what was observed, never a cache
# to re-fit when the cap moves.
#
# The cap MOVED to 100 on 2026-07-28 (#715, owner's call). The rule's shape is
# untouched -- D-422 admitted it on shape, never on frequency -- this only
# tunes the parameter. Basis: every active downstream measured from here at
# both values (#707's rule: measure them, don't ask them). At 72 their recent
# windows ran 5-45% over; at 100, seven of eight sit at 0% and the eighth is a
# by-construction convention (#681) that is its own owner's fork. 100 is a
# knee, not a round number: of 378 blocked subjects across those corpora, 84%
# fall at or under 100, and the next 10 characters buy only 25 more. The cost
# is terminal legibility -- 72 exists so `git log --oneline` fits 80 columns --
# bought deliberately in exchange for downstream adoption.
#
# The rules below, each declared never-by-anyone at admission (D-422): a
# blocking hook needs a shape with zero legitimate uses, binding the owner too
# (PreToolUse can't tell human from agent; a genuine exception runs outside
# the session). Every one qualifies because no use *requires* the violating
# shape -- a compliant rewrite always exists, nothing is lost by it. (Deliberately
# not "three rules": the list grows, and a hand-written count of a growable list
# drifts by construction -- ANTI_PATTERNS "The Hand-Written Count", which this
# header was an instance of the moment #731 added a fourth.)
#   subject-body-unseparated  -- no blank line after the summary: git folds
#       everything up to the first blank line into one long subject; nobody
#       ever intends that.
#   subject-too-long          -- summary over SUBJECT_CAP characters
#       (measured in CHARACTERS, not bytes -- em-dashes are 3 UTF-8 bytes and
#       must not count as 3); detail always fits in the body instead.
#   ai-attribution-trailer    -- Co-Authored-By: Claude / Claude-Session /
#       "Generated with Claude": this repo opts out globally (conventions >
#       PR / commit mechanics). Human co-author trailers stay legal.
#   undeclared-closing-ref    -- a closing keyword in the BODY naming an issue
#       the message never declares (subject, or a trailer line of nothing but
#       closing refs). Qualifies on D-422's shape argument like the others: no
#       message *requires* the undeclared form, since declaring it or dropping
#       the keyword always works. The rule itself is imported, never restated
#       (see the import guard below) -- this is the WRITE-time rung of the gate
#       that already closes the merge path (#727); the residual it retires is
#       that gate's own (#731): pre-push there is no PR to read, and under
#       CI_POSTURE=manual no check runs at all, so a downstream on that posture
#       had this scanned by nothing.
#       ADMISSION MEASURED BEFORE ACCEPTING IT (2026-07-29, #731), on the last
#       300 messages here: 10 would refuse -- 3.3%. Of those, 6 are checkpoint
#       bodies naming an already-closed ticket (the class the guard exists for,
#       one of which #761 hit live), 2 quote a historical message verbatim, and
#       2 are legitimate multi-closes placed in prose rather than on a trailer
#       line -- a one-line move. ZERO required the refused shape, which is the
#       shape argument measured rather than assumed. Per-repo, never
#       transplanted: re-measure downstream before trusting this number
#       (README > Blocking guards; the `over_cap` docstring carries the same
#       warning for the cap, learned the hard way).
#   pr-title-too-long         -- `gh pr create|edit --title` over TITLE_CAP.
#       NOT a fourth rule needing its own admission: it is subject-too-long's
#       shape argument at the second surface that writes a subject onto main,
#       which D-422 already covers. It carries its own name only so the ledger
#       can retire the two enforcement points separately (Retire when, below).
#
# THE SECOND SURFACE (#735, intake #726). Until then this hook capped a string
# an agent typed locally while the squash subject on main could come from the PR
# title instead -- ungated, and ungated in a way that reads as compliance: a
# blocking hook with zero refusals is indistinguishable from one that cannot see
# the corpus. Nobody lied; the calibration corpus (authored subjects on main,
# i.e. PR titles on a squashing repo) and the enforcement point (local commit
# messages) were simply never checked against each other. Measured here before
# accepting the severity (2026-07-29): 0 of the last 200 non-merge subjects are
# over 100 raw OR stripped, longest 97; 0 of the last 60 merged PR titles are
# over TITLE_CAP, longest 76 and 83 with its suffix. No live exposure -- but
# that is a post-#715 fact, not a refutation: the cap raise happened to drain
# the hole, and the reporting downstream read 8 of 15 over raw at the same
# moment. --report now prints both columns so the two questions stay separable.
#
# Judge honesty (#310 wording): the rung's contract is verdict +
# what-to-do-instead; the judge is as cheap as the rule allows. These rules
# are mechanical, so the judge is len() and a regex -- a cheap-MODEL judge is
# reserved for fuzzy rules (e.g. over-implementation) if their ledger
# evidence ever arms. The reminder keeps firing alongside (it carries
# staging/path-aware rules this hook does not judge).
#
# Retire when (#253): a review period's ledger shows zero denies here while
# authored subjects on main stay compliant -- the reminder alone holds again
# -- judged at retro time, never auto-pruned.
#
# Contract: stdin = tool-call JSON; exit 0 = allow, exit 2 = block (stderr is
# the reason). Any internal error -> allow (fail-open). Detection scans only
# the text before the first heredoc marker (prose in heredoc bodies is not a
# command -- the #252 lesson); the first heredoc body is then read back as
# the message payload for a `-F -` commit. Denies append to
# .claude/metrics/guard_hits.jsonl (guard lifecycle, #253).
#
# Accepted residuals (tripwire, not a sandbox -- the twins' stance): the
# scan is quote-blind (a quoted separator can end a segment early; prose
# packing a separator plus the shape into one string can false-fire); a
# commit *after* the first heredoc is not scanned; `-F <file>` and
# editor-path commits carry no extractable message and pass unjudged;
# PowerShell backtick escapes inside -m payloads are read literally.
# Named so it is a residual rather than a silent hole (#735): `gh pr merge
# --subject` writes the squash subject DIRECTLY, with no suffix appended, so it
# would need SUBJECT_CAP rather than TITLE_CAP -- a third cap-selection branch
# for a form no house path uses (ship_pr merges with --squash and nothing else).
# Web-UI edits are outside any hook's reach by construction. A guard that
# advertises more than it enforces is worse than one that says where it stops.
import json
import os
import re
import subprocess
import sys

# The closing-keyword rule is IMPORTED, never re-implemented (#731). `evaluate`
# is pure and is that rule's single home (#727/#319), so the write-time rung and
# the merge-time gate cannot drift into two readings of "declared" -- which is
# the whole risk of adding a second enforcement point to a rule with a subtle
# definition (declared = subject OR a trailer line of nothing but closing refs).
# Fail-open, the same shape inject_rule_reminders.py uses to read SUBJECT_CAP
# (#715): an unreadable sibling costs this rule, not the hook, and the CI gate
# still closes the merge path -- which is the only path that can retire a ticket.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                os.pardir, os.pardir, "scripts"))
try:
    from audit_closing_keywords import evaluate as _closing_evaluate
except Exception:
    _closing_evaluate = None

SEP = r"(?:^|[\n;&|])\s*"
# The git-binary token mirrors block_chained_merge's GH token (#342, #467):
# optional call operator, quoted full path / quoted bare name / unquoted
# path / bare git(.exe). Keep the family in step.
GIT = (r"(?:&\s*)?"
       r"(?:\"(?:[^\"\n]*[\\/])?git(?:\.exe)?\""
       r"|'(?:[^'\n]*[\\/])?git(?:\.exe)?'"
       r"|[^\s;|&\"'\n]*[\\/]git(?:\.exe)?"
       r"|git(?:\.exe)?"
       r")")
# Only `commit` as the (near-)first subcommand: the allowed interveners are
# git's own global flags, so `git log --grep commit` never matches.
COMMIT = re.compile(SEP + GIT +
                    r"(?:\s+-C\s+\S+|\s+-c\s+\S+|\s+--no-pager)*\s+commit\b")
# The gh-binary token, the same union spelling and the same reason as the git
# one -- twins in block_chained_merge.py and inject_rule_reminders.py, keep all
# three in step (#342, #467, #559). A fresh bare `gh\s` anchor here would
# re-open the exact hole those three tickets each closed once.
GH = (r"(?:&\s*)?"
      r"(?:\"(?:[^\"\n]*[\\/])?gh(?:\.exe)?\""
      r"|'(?:[^'\n]*[\\/])?gh(?:\.exe)?'"
      r"|[^\s;|&\"'\n]*[\\/]gh(?:\.exe)?"
      r"|gh(?:\.exe)?"
      r")\s+")
# `pr create` / `pr edit` only (#735): an ISSUE title never becomes a commit
# subject, and `--fill` takes its title from a commit this hook already judged,
# so that form is covered transitively and needs no case of its own.
PR_TITLE = re.compile(SEP + GH + r"pr\s+(?:create|edit)\b")
FILE_STDIN = re.compile(r"(?:^|\s)(?:-F|--file=?)\s*-(?=\s|$)")
# -[a-zA-Z]*m covers combined short flags (-am, -sm) -- the value always
# follows the trailing m; `--amend` can't match (its second char is a dash).
M_ARG = re.compile(r"(?:^|\s)(?:-[a-zA-Z]*m|--message=?)\s*"
                   r"(?:'([^']*)'|\"((?:[^\"\\]|\\.)*)\"|(\S+))")
# Same value-quoting alternation as M_ARG, but the separator is MANDATORY --
# there is no combined-short-flag form to accommodate here, so `--titlefoo bar`
# must not read as a title of "foo".
TITLE_ARG = re.compile(r"(?:^|\s)--title(?:=|\s)\s*"
                       r"(?:'([^']*)'|\"((?:[^\"\\]|\\.)*)\"|(\S+))")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_]\w*)\1")
# THE one home for the cap -- project-mirrored (#294 rule): a downstream whose
# convention wants a different bar re-keys this line and nothing else. That was
# a claim rather than a fact until #715: the literal was restated in the block
# messages, the reminder hook, ship_pr/SKILL.md, two docs, and ~12 selftest
# fixtures whose lengths (73/75/80/90) were hard-coded relative to 72 -- so
# re-keying did not merely fail to propagate, it turned the suite RED, the
# #693 / intake-#682-finding-3 shape aimed at the most-adopted constant here.
# Everything below now DERIVES from this line: change it and the guard, the
# messages, --report, the reminder, and every fixture move together.
SUBJECT_CAP = 100
# GitHub appends ` (#NNN)` when it squash-merges -- AFTER this hook has run.
# Stripping it is load-bearing in --report (see over_cap).
SQUASH_SUFFIX = re.compile(r"\s\(#\d+\)$")
# The same suffix read FORWARD instead of backward (#735). --report strips it to
# judge what the hook saw; the title path must RESERVE it, because a PR title is
# text the platform will extend before it lands in `git log`. Which of the two
# sources GitHub composes the subject from is a repo setting -- this one reads
# `squash_merge_commit_title=COMMIT_OR_PR_TITLE`, so a single-commit PR takes the
# commit subject (hook-gated all along, which is why the gap never surfaced here)
# and a multi-commit PR takes the title; a repo set to PR_TITLE is ALWAYS on the
# title path. The reserve is the widest form this repo can reach -- a repo past
# 99999 PRs re-keys SUFFIX_DIGITS and nothing else.
SUFFIX_DIGITS = 5
SUFFIX_RESERVE = len(" (#") + SUFFIX_DIGITS + len(")")
# DERIVED, never a second literal: #715 made SUBJECT_CAP the one home and a fresh
# number here would re-create exactly the defect it removed. Re-key the cap and
# this moves with it, no other edit.
TITLE_CAP = SUBJECT_CAP - SUFFIX_RESERVE
TRAILER = re.compile(
    r"(?im)^\s*(?:co-authored-by:.*\b(?:claude|anthropic)\b"
    r"|claude-session\b"
    r"|\W*\s*generated with\b.*\bclaude\b)")

UNSEP_MSG = (
    "BLOCKED: no blank line after the commit summary -- git folds everything up "
    "to the first blank line into one long subject (guard: #310).\n"
    f"Format: summary line (<={SUBJECT_CAP} chars, cite the ticket), then a BLANK "
    "line, then the body (conventions > PR / commit mechanics).\n")
# `{n}` survives the f-string as a .format() field (doubled braces); the cap is
# interpolated at import so the refusal can never quote a bar it is not applying.
# The admission stats that used to ride this message are gone on purpose: they
# were measured at the old cap and would now be a stale number in the one place
# an agent reads under pressure. They live in the header, marked as history.
LONG_MSG = (
    f"BLOCKED: commit summary is {{n}} chars; the cap is {SUBJECT_CAP} "
    "(guard: #310).\n"
    "Tighten the summary and cite the ticket; detail belongs in the body after "
    "the blank line (conventions > PR / commit mechanics).\n")
# Quotes the TITLE cap, never SUBJECT_CAP: an agent refused at 91 and told "the
# cap is 100" reads the guard as broken and retries. The reserve is spelled out
# because the number is otherwise unexplainable from the outside.
TITLE_MSG = (
    f"BLOCKED: PR title is {{n}} chars; the cap is {TITLE_CAP} (guard: #310). "
    f"GitHub appends ` (#NNN)` when it squash-merges, AFTER every hook has run, "
    f"so {SUFFIX_RESERVE} of the {SUBJECT_CAP}-character subject cap is reserved "
    "for that suffix.\n"
    "Tighten the title; detail belongs in the PR body.\n")
TRAILER_MSG = (
    "BLOCKED: AI-attribution trailer in the commit message (guard: #310). This "
    "repo opts out of Co-Authored-By: Claude / Claude-Session / Generated-with-"
    "Claude trailers everywhere (conventions > PR / commit mechanics). Human "
    "co-author trailers are fine.\n"
    "Drop the trailer and retry.\n")
# PASTE-SAFE BY CONSTRUCTION, and deliberately unlike the CI gate's report
# (#728). That one quotes the offending line -- its reader cannot see the tree --
# and pays for it with a three-line do-not-paste warning, because the finding IS
# the forbidden text. A refusal needs no such quote: the agent is looking at the
# message it just typed. So this names the issue NUMBER with its keyword stripped
# and never echoes the line, and therefore no live closing ref can leave this
# hook -- there is nothing here to warn about. Adding the quote back would
# re-import exactly the propagation path #728 closed.
CLOSING_MSG = (
    "BLOCKED: the body mentions issue {refs} with a closing keyword, but the "
    "message does not declare it (guard: #310, rule: scripts/"
    "audit_closing_keywords.py).\n"
    "GitHub's parser reads NO surrounding context, so a negated, qualified, or "
    "quoted mention still retires that ticket when this lands.\n"
    "Fix: put the reference in the subject line, or on a trailer line of nothing "
    "but closing refs. If it is not meant to close anything, drop the keyword "
    "(`re #NN` and a bare `#NN` are both inert).\n")


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
            f.write(json.dumps({"ts": ts, "guard": "block_commit_rules",
                                "rule": rule, "action": "deny"}) + "\n")
    except Exception:
        pass


def heredoc_body(command):
    """Body of the FIRST heredoc in the command, or None."""
    m = HEREDOC.search(command)
    if not m:
        return None
    delim = m.group(2)
    nl = command.find("\n", m.end())
    if nl == -1:
        return None
    body = []
    for line in command[nl + 1:].split("\n"):
        if line.strip() == delim:
            break
        body.append(line)
    return "\n".join(body)


def check_message(msg):
    """(rule, message) for the first violated rule, or None. Order matters:
    a folded subject is the root cause when both it and length fire."""
    lines = msg.split("\n")
    subject = lines[0].rstrip() if lines else ""
    if len(lines) >= 2 and lines[1].strip():
        return "subject-body-unseparated", UNSEP_MSG
    if len(subject) > SUBJECT_CAP:
        return "subject-too-long", LONG_MSG.format(n=len(subject))
    if TRAILER.search(msg):
        return "ai-attribution-trailer", TRAILER_MSG
    # Last, and after the structural rules on purpose: a folded subject changes
    # what counts as "the subject", so judging declarations before that is fixed
    # would report a ref as undeclared when the real defect is the fold.
    if _closing_evaluate is not None:
        declared, found, _ = _closing_evaluate([("msg", subject, "\n".join(lines[1:]))])
        undeclared = sorted(found - declared, key=lambda r: int(r.lstrip("#")))
        if undeclared:
            return "undeclared-closing-ref", CLOSING_MSG.format(
                refs=", ".join(r.lstrip("#") for r in undeclared))
    return None


def check_title(title):
    """(rule, message) for an over-cap PR title, or None. Pure, so --selftest
    drives it (#319).

    Only the length rule applies here, and the omissions are deliberate rather
    than lazy: a `--title` value is one line by construction, so the
    subject/body separation rule has nothing to judge, and an attribution
    trailer is a message-BODY shape that no title carries. Its own rule name,
    because the ledger has to be able to retire the two enforcement points
    separately (header > Retire when) -- but not its own admission: this is
    D-422's shape argument at a second surface, not a fourth rule.
    """
    title = title.rstrip()
    if len(title) > TITLE_CAP:
        return "pr-title-too-long", TITLE_MSG.format(n=len(title))
    return None


def verdict(command):
    """(rule, message) to block, or None to allow. Pure, so --selftest drives
    it. Detection runs on the pre-heredoc text only (#252); flag scanning is
    bounded to the commit's own line (quote-blind residual, header)."""
    command = str(command)
    head = command.split("<<", 1)[0]
    for m in COMMIT.finditer(head):
        seg = head[m.end():]
        cut = seg.find("\n")
        if cut != -1:
            seg = seg[:cut]
        msg = None
        if FILE_STDIN.search(seg):
            msg = heredoc_body(command)
        else:
            parts = ["".join(g for g in mo.groups() if g)
                     for mo in M_ARG.finditer(seg)]
            if parts:
                msg = "\n\n".join(parts)
        if msg is None:
            continue  # --amend / editor / -F <file>: nothing to judge
        hit = check_message(msg)
        if hit:
            return hit
    # The second writing surface for what becomes a subject on main (#735,
    # intake #726). Same segment discipline as above.
    for m in PR_TITLE.finditer(head):
        seg = head[m.end():]
        cut = seg.find("\n")
        if cut != -1:
            seg = seg[:cut]
        mo = TITLE_ARG.search(seg)
        if not mo:
            continue  # --fill / interactive / --body-only edit: nothing to judge
        hit = check_title("".join(g for g in mo.groups() if g))
        if hit:
            return hit
    return None


def over_cap(subjects, cap=SUBJECT_CAP):
    """(n_over, n_total, worst3, n_over_raw) over authored subjects. Pure, so
    --selftest drives it (#319); the git call stays with report().

    TWO NUMBERS, TWO QUESTIONS (#735). Stripped answers *would this guard have
    refused my authored subjects* -- the calibration question, and the only one
    that judges the hook. Raw answers *is main's log actually bounded* -- what a
    reader sees after the platform appended its suffix. #715 noted the strip is
    correct and that was true; it was also only half, and the missing half is
    the one a reader of `git log` experiences. A repo can sit at 0 stripped and
    well over raw, and neither number is wrong -- they are answers to different
    questions, and quoting one at the other's question is how a guard ends up
    calibrated against a corpus it does not enforce on.

    STRIPS THE SQUASH SUFFIX FIRST, and that is the whole point. GitHub
    appends ` (#NNN)` when it squash-merges, *after* this hook has run, so a
    raw count scores the platform's own text against a guard that never saw
    it, and condemns a guard that is doing its job.

    The gap is real on every squash-merging repo, but its SIZE is corpus-
    specific -- 16 vs 0 here, 43 vs 36 on one downstream, 42 vs 21 on another
    -- so never transplant one repo's ratio onto another repo's number. This
    docstring used to do exactly that: it read the downstream that shipped
    this hook unwired at 21/60 as an 11x-inflated raw count (our ratio, not
    theirs), when 21/60 was their HONEST stripped number all along (#705
    measured it; #601 finding g, #645, #636). Their corpus is genuinely a
    35% corpus. Every count in this paragraph was measured at the cap of the
    day (72); #715 moved it to 100. They are history and were deliberately not
    re-fitted -- the lesson is about transplanting ratios, and it survives the
    cap change untouched. Characters, not bytes, matching check_message: an
    em-dash is 3 UTF-8 bytes and must not count as 3.
    """
    stripped = [SQUASH_SUFFIX.sub("", s).rstrip() for s in subjects]
    over = [s for s in stripped if len(s) > cap]
    raw = [s for s in subjects if len(s.rstrip()) > cap]
    return (len(over), len(stripped), sorted(over, key=len, reverse=True)[:3],
            len(raw))


# Newest-first slices of the log. A FLAT window is the wrong instrument: it
# straddles whatever convention change the repo has been through and reports the
# ERA rather than the practice. Measured live on a downstream (#682): 40% flat
# over 60, but 10% over the last 20, 55% at 21-60, 73% at 61-120 -- a repo that
# converged months ago, which the flat number would have told to decline a guard
# costing it nothing. That is the exact inverse of the failure the adoption note
# exists to prevent. Reproduced here: the recent and mid windows are clean and
# every violation sits in the older one (the count slides as commits land).
# But the era effect is NOT guaranteed -- a second downstream measured 35% flat
# and 35% recent (#705), a repo that simply never converged. Split to FIND OUT
# which case you are in; do not assume the recent row comes in lower.
# (Those percentages are cap-72 history, kept as measured -- #715.)
RECENCY_WINDOWS = ((0, 20, "recent (1-20)"),
                   (20, 60, "mid (21-60)"),
                   (60, 120, "older (61-120)"))


def recency_split(subjects, cap=SUBJECT_CAP, windows=RECENCY_WINDOWS):
    """[(label, n_over, n_total, worst3, n_over_raw)] per window, newest first.
    Pure, so --selftest drives it (#319); the git call stays with report().

    Short corpora simply yield fewer rows -- a 30-commit repo reports `recent`
    and a partial `mid`, never a padded window. The DECISION reads the first
    row: adoption is a question about current practice, and the older windows
    are there to show which way the repo is moving, not to be averaged in.
    """
    out = []
    for lo, hi, label in windows:
        chunk = subjects[lo:hi]
        if chunk:
            over, total, worst, raw = over_cap(chunk, cap)
            out.append((label, over, total, worst, raw))
    return out


def report(n=120):
    """Measure this repo's corpus against the cap. Refuses nothing, exits 0
    always: this is the adoption instrument (#645 option B), not the guard.

    A blocking guard's admission bar is a claim about the corpus it was
    measured on, never a universal (README > blocking guards, #611) -- so
    before wiring this hook a project should COUNT, and count the right thing.
    #645 was filed on a 2/21/36-per-60 spread that argued for shipping this
    hook unwired; the spread turned out to be substantially instrument error
    (flat windows, raw counts, bytes-for-characters), and the decision landed
    on B: the guard stays wired and the MEASUREMENT changed.
    """
    try:
        r = subprocess.run(["git", "log", f"-{int(n)}", "--no-merges", "--format=%s"],
                           capture_output=True, text=True, timeout=30,
                           encoding="utf-8", errors="replace")
    except Exception as e:
        print(f"block_commit_rules --report: git unreadable ({e}) -- no measurement")
        return 0
    subjects = [s for s in r.stdout.splitlines() if s.strip()] if r.returncode == 0 else []
    if not subjects:
        print("block_commit_rules --report: no authored subjects readable -- "
              "no measurement (a fresh repo or an unreadable git).")
        return 0
    rows = recency_split(subjects)
    label, over, total, worst, raw = rows[0]
    print(f"block_commit_rules --report: {over}/{total} recent authored subjects "
          f"over {SUBJECT_CAP} characters ({100.0 * over / total:.0f}%), "
          f"squash suffix stripped; {raw}/{total} raw.")
    print(f"  {'window':<14} {'stripped':>9} {'raw':>9}")
    for lbl, o, t, _, rw in rows:
        print((f"  {lbl:<14} {o:>4}/{t:<4} {rw:>4}/{t:<4}"
               + ("   <- adoption reads STRIPPED, this row"
                  if lbl == label else "")).rstrip())
    print(f"STRIPPED is what this hook sees -- calibration: would it have refused "
          f"the subjects you typed? RAW is what a reader sees in `git log` after "
          f"GitHub appended ` (#NNN)` -- is main bounded? Both are real questions "
          f"and they are NOT interchangeable: the guard is judged on stripped, "
          f"the log is judged on raw, and a repo can sit clean on one while the "
          f"other runs high. Titles reserve {SUFFIX_RESERVE} characters "
          f"(cap {TITLE_CAP}) so the raw column has a guard behind it too (#735).")
    if worst:
        print("Worst in the recent window:")
        for s in worst:
            print(f"  {len(s)}: {s}")
    print("A DECLINE IS EARNED ONLY WHEN THE RECENT WINDOW FAILS. A flat window "
          "straddles convention changes and reports the era, not the practice: a "
          "downstream measured 40% flat over 60 and 10% over its last 20 (#682, "
          "#697). Averaging in the older rows re-imports the confound.")
    print("A high number is MIGRATION COST, not a wrong guard: D-422 admitted this "
          "on shape -- no message requires the violating form, a compliant rewrite "
          "always exists -- never on frequency (this repo measured 31% at "
          "admission, when the cap was 72). Re-measure to SIZE the migration, not "
          "to decide the rule is wrong for you.")
    print("If the recent window still fails, the usual cause is a documented "
          "convention that produces long subjects BY CONSTRUCTION -- a PR-title "
          "format that becomes the squash subject, checkpoint subjects packing "
          "metrics into the summary line (#681). That is a real fork and it is "
          "the owner's to pick: change the convention, RE-KEY SUBJECT_CAP to a "
          "bar your convention can actually meet (one line, and everything here "
          "follows it -- #715), or ship unwired and record the deviation. "
          "Declining is sanctioned; declining on a flat number is not a "
          "decision, it is a measurement error.")
    # Cross-repo figures CANNOT be derived at run time -- the corpora live in
    # other repositories -- so they are hand-maintained prose, and undated prose
    # reads as current forever (#722). Every one below carries the day it was
    # measured; your rows above are always live, these are not.
    print(f"Reference points at the CURRENT cap ({SUBJECT_CAP}), MEASURED "
          "2026-07-28 across eight sibling repos, read from upstream rather "
          "than asked (#707): seven read 0/20 recent, the eighth 6/20 -- and "
          "that one is the by-construction case above, not a careless corpus. "
          "Upstream itself read 0/120. These age; your own rows do not.")
    print("The cap moved for exactly this reason. Measured the same day, at 72 "
          "those same recent windows ran 5-45% and every sibling was resisting "
          "the bar; 84% of what 72 refused sits at or under 100, so the bar "
          "moved rather than the projects (#715). The cap-72 era's numbers -- "
          "31% here at admission (measured 2026-07-23, #310), downstreams at "
          "35/60/64% flat, one 40%-flat/10%-recent (#682) and one honestly 35% "
          "both ways (#705), both measured 2026-07-28 -- are kept as history in "
          "this file, not re-fitted: they are what the OLD bar cost, and the "
          "lesson they carry (never transplant one repo's ratio onto another's "
          "number) is what justified measuring your corpus in the first place.")
    return 0


def _hd(msg, opts="-F -"):
    return "git commit %s <<'EOF'\n%s\nEOF" % (opts, msg)


# Every length below is DERIVED from SUBJECT_CAP, never written as a literal
# (#715, the #693 rule applied to this repo's most-adopted constant). A fixture
# that spells out "80 chars" encodes a cap of 72 by implication: re-key to 100
# and the must-fire cases silently stop firing -- a suite that goes green while
# testing nothing, which is worse than one that goes red. `over` and `under`
# take a distance so each case still reads as near-boundary or comfortably-past.
def _over_cap_subject(ch, past=1):
    """A subject `past` characters beyond the cap -- must always fire."""
    return ch * (SUBJECT_CAP + past)


def _under_cap_subject(ch, under=0):
    """A subject `under` characters below the cap (0 = exactly at it, the
    compliant boundary) -- must never fire."""
    return ch * (SUBJECT_CAP - under)


def _title(value, sub="create", binary="gh", rest=""):
    return f"{binary} pr {sub} --title \"{value}\"{rest}"


# --selftest (side-effect-free per #319: pure verdict() checks, no stdin, no
# ledger writes). `want` is the expected rule, or None for allow. FAIL-line
# format matches check_hook_selftests' scrape. Divergent fixtures per the
# two-reading rule: chars-vs-bytes (em-dash case), first-line-vs-first-
# paragraph subject (folded case), Claude-vs-human co-author.
SELFTEST_CASES = [
    # -- must fire --
    (_hd(_over_cap_subject("x") + "\n\nbody"), "subject-too-long",
     "one character past the cap (boundary above)"),
    (_hd("fix: something (closes #1)\nbody with no blank line before it"),
     "subject-body-unseparated", "folded subject -- the live PR #523 shape"),
    (_hd("fix: ok subject\n\nbody\n\nCo-Authored-By: Claude <noreply@anthropic.com>"),
     "ai-attribution-trailer", "Co-Authored-By Claude trailer"),
    (_hd("fix: ok subject\n\nClaude-Session: abc123"),
     "ai-attribution-trailer", "Claude-Session trailer"),
    (_hd("fix: ok subject\n\n\U0001F916 Generated with [Claude Code](https://claude.com)"),
     "ai-attribution-trailer", "emoji-prefixed Generated-with-Claude line"),
    ("git add -A && " + _hd(_over_cap_subject("y", 8)), "subject-too-long",
     "chained after && -- detection past the first command"),
    (_hd(_over_cap_subject("z", 18), opts="--amend -F -"), "subject-too-long",
     "amend with explicit message is not exempt"),
    ('git commit -m "' + _over_cap_subject("w", 8) + '"', "subject-too-long",
     "-m form"),
    ('git commit -am "' + _over_cap_subject("u", 8) + '"', "subject-too-long",
     "-am combined short flag is still -m"),
    ('& "C:\\Program Files\\Git\\bin\\git.exe" commit -m \''
     + _over_cap_subject("v", 3) + "'",
     "subject-too-long", "quoted full-path git.exe (PowerShell spelling)"),
    # -- undeclared closing refs (#731). One case per point on the DECLARATION
    # axis (subject / trailer / prose) and the SUPPLY axis (heredoc / -m), each
    # paired with its must-not-fire neighbour below, because a corpus that grew
    # by exactly one case is unfinished (ANTI_PATTERNS "The Half-Closed Class").
    # The plain form leads deliberately: the obfuscated members are what a
    # reviewer types, and the boring one is what an author actually writes.
    (_hd("docs: tidy the guide\n\nThis also closes #12 while we are here."),
     "undeclared-closing-ref", "the BORING case -- a plain prose close in the body"),
    (_hd("docs: tidy the guide\n\nThis does not close #12; that is a separate ticket."),
     "undeclared-closing-ref", "negated mention still closes it (parser reads no context)"),
    (_hd("checkpoint: refresh metrics ledger (re #625)\n\n"
         "Merge-time checkpoint for PR #639 (closes #615)."),
     "undeclared-closing-ref",
     "the live #761 shape: a checkpoint body, nothing of its own to close"),
    ('git commit -m "docs: tidy" -m "quoting a log line: abc123 (closes #430)"',
     "undeclared-closing-ref", "-m -m supply form reaches the rung too"),
    # -- must NOT fire --
    (_hd(_under_cap_subject("x") + "\n\nbody"), None,
     "exactly at the cap (compliant boundary)"),
    (_hd("docs: tidy the guide (closes #12)\n\nThis closes #12 as discussed."),
     None, "declared in the subject -- the body may repeat it freely"),
    (_hd("docs: tidy the guide\n\nSome prose.\n\nCloses #12"),
     None, "declared on a trailer line of nothing but closing refs"),
    (_hd("checkpoint: refresh metrics ledger (re #625)\n\n"
         "Merge-time checkpoint for PR #639. Ledger only; see #615."),
     None, "no keyword anywhere -- `re #NN` and a bare `#NN` are inert"),
    (_hd("fix: short subject (closes #9)"), None, "subject-only message, no body"),
    ("git commit --amend", None, "amend with no explicit message"),
    ("git commit -F notes.txt", None, "-F <file> carries no inline message (residual)"),
    ("gh issue comment 5 --body-file - <<'EOF'\ngit commit -m \""
     + _over_cap_subject("q", 8) + "\"\nEOF",
     None, "over-cap commit mentioned only in heredoc prose (#252)"),
    ("git log --oneline -5", None, "not a commit"),
    ("git log --grep commit -m 'x'", None, "commit as an argument, not the subcommand"),
    (_hd("fix: ok subject\n\nCo-Authored-By: Jane Doe <jane@example.com>"),
     None, "human co-author trailer is legitimate"),
    # Exactly AT the cap in characters and 6 over it in UTF-8 bytes (three
    # 3-byte em-dashes): tighter than a merely-under fixture, because a
    # byte-counting regression has nowhere left to hide.
    (_hd("res: " + "—" * 3 + "x" * (SUBJECT_CAP - 8) + "\n\nbody"), None,
     "at the cap in characters, 6 bytes over -- the cap counts characters"),
    ('git commit -m "short subject" -m "' + _over_cap_subject("b", 18) + '"',
     None, "second -m is body, not subject"),
    ('echo "git commit -m \'' + _over_cap_subject("p", 8) + "'\"", None,
     "echoed prose (quote-blind SEP)"),
    ('git commit -m "subject ok (re #2)" && git push', None, "clean commit chained to push"),
    # -- #735: the PR-title surface. Lengths derive from TITLE_CAP, never from a
    # literal and never from SUBJECT_CAP (#715's rule at the second cap).
    (_title("t" * (TITLE_CAP + 1)), "pr-title-too-long",
     "one character past the title cap (boundary above)"),
    # THE case the reserve exists for, and the one that dies first if anyone
    # judges a title against SUBJECT_CAP: this length is a compliant COMMIT
    # subject and an over-cap PR TITLE, because the platform will extend it.
    (_title(_under_cap_subject("t")), "pr-title-too-long",
     "at the SUBJECT cap: legal as a commit subject, over once GitHub appends"),
    (_title("t" * (TITLE_CAP + 4), sub="edit"), "pr-title-too-long",
     "gh pr edit retitles a PR and lands in the same squash subject"),
    ("gh pr create --title=" + "t" * (TITLE_CAP + 4), "pr-title-too-long",
     "--title=value form"),
    (_title("t" * (TITLE_CAP + 4), binary="gh.exe"), "pr-title-too-long",
     "bare gh.exe spelling (the shared token, #467)"),
    ('& "C:\\Program Files\\GitHub CLI\\gh.exe" pr create --title \''
     + "t" * (TITLE_CAP + 4) + "'",
     "pr-title-too-long", "quoted full-path gh.exe (PowerShell spelling)"),
    # -- must NOT fire --
    (_title("t" * TITLE_CAP), None, "exactly at the title cap (compliant boundary)"),
    # The converse of the case above -- proof the two caps did not merge into
    # one: this subject sits between the caps and is legal where it is typed.
    (_hd("t" * (TITLE_CAP + 1) + "\n\nbody"), None,
     "over the TITLE cap but under the subject cap: legal as a commit"),
    ("gh pr create --fill", None,
     "--fill takes the title from a commit already judged (covered transitively)"),
    ("gh pr create --body-file /tmp/b.md", None, "no explicit title to judge"),
    ("gh pr edit 5 --add-label full-ci", None, "an edit that touches no title"),
    ("gh issue create --title \"" + "t" * (TITLE_CAP + 40) + "\"", None,
     "an ISSUE title never becomes a commit subject"),
    # Pins the MANDATORY separator, and the discriminating shape took two
    # tries: `--titlefoo <long string>` reads the same under both spellings,
    # because the value group takes `foo` and stops -- an agreeable fixture that
    # made the tightening look tested while testing nothing. The value has to
    # run straight on from the flag for the two readings to diverge.
    ("gh pr create --title" + "t" * (TITLE_CAP + 4), None,
     "--titlettt... is an unknown flag, not a title (the separator is mandatory)"),
    ("my-gh pr create --title \"" + "t" * (TITLE_CAP + 4) + "\"", None,
     "my-gh is not gh -- an optional prefix must end in a separator (#467)"),
    ("gh issue comment 5 --body-file - <<'EOF'\n" + _title("t" * (TITLE_CAP + 4))
     + "\nEOF",
     None, "over-cap title mentioned only in heredoc prose (#252)"),
]


# --report's corpus (#676). The two mutation targets are what these cases exist
# for: delete the SQUASH_SUFFIX strip in over_cap and cases 0-1 go RED; loosen
# `> cap` to `>= cap` and cases 0 and 2 go RED (both land exactly at the cap).
# Verified live at caps 72, 100, and 150 -- identical kills at each, which is
# the #715 point: a re-key must not cost the corpus its teeth.
#
# Case 0 used to be a real squash-merged subject from this repo's history (74
# chars as GitHub stores it, 67 as the hook saw it: the confound in one row).
# At a cap of 72 that fixture was a live boundary; at 100 it is compliant
# either way, so it tested nothing and took the strip's mutation target down
# with it -- a real subject cannot stay on the boundary when the boundary
# moves. The provenance is kept here in prose and the fixture derives instead:
# at-cap plus the 7-character suffix is over-cap raw and exactly compliant
# stripped, at ANY cap.
#
# The raw column (#735) adds a third mutation target: compute `raw` from the
# STRIPPED list instead of the original subjects and cases 0-1 go RED -- they are
# the two rows where the two answers genuinely differ (0 stripped, 1 raw), which
# is the whole reason the column exists. A corpus where raw always equals
# stripped would be an agreeable fixture: it cannot tell the two apart.
_SUFFIX = " (#628)"
OVER_CAP_CASES = [
    ([_under_cap_subject("x") + _SUFFIX], 0, 1, 1,
     "suffix alone pushes an at-cap subject over: stripped, it is compliant"),
    ([_under_cap_subject("x", 3) + _SUFFIX], 0, 1, 1,
     "same, landing below the cap rather than on it"),
    ([_under_cap_subject("y")], 0, 1, 0,
     "exactly at the cap is compliant (boundary)"),
    ([_over_cap_subject("z")], 1, 1, 1, "one over the cap fires (boundary)"),
    ([_over_cap_subject("w", 8) + " (#1)"], 1, 1, 1,
     "genuinely over even after stripping"),
    (["short subject (#12)", _over_cap_subject("a", 18),
      "b" * (SUBJECT_CAP // 2)], 1, 3, 1,
     "mixed corpus counts only the real one"),
    ([], 0, 0, 0, "empty corpus is not a division"),
]


# The reserve's contract, checked rather than asserted in a comment (#735): the
# suffix SUFFIX_RESERVE budgets for must be one SQUASH_SUFFIX actually strips,
# or --report and the title cap are budgeting against different suffixes and the
# two halves of this file quietly disagree. Narrow the strip's digit class or
# mis-count the reserve and these go RED.
RESERVE_CASES = [
    (" (#" + "9" * SUFFIX_DIGITS + ")", True,
     "the widest suffix the reserve budgets for is one the strip removes"),
    (" (#" + "9" * (SUFFIX_DIGITS + 1) + ")", True,
     "past the reserve the strip still fires -- the reserve bounds the BUDGET, "
     "never the strip"),
    (" (#12) trailing text", False, "the strip stays anchored to the end"),
]


# recency_split's corpus (#697, intake #682). Case 0 is the finding in one row:
# a repo that converged. Flat over 60 it reads 20/60 (33%) and declines the
# guard; split, its recent window is clean and the debt is all in the tail --
# the ERA, not the practice. Collapse RECENCY_WINDOWS to a single flat window
# and case 0 goes RED; the short-corpus cases guard the other direction, that a
# small repo yields fewer rows rather than padded ones.
# Reproduces the REPORTED corpus, not a synthetic one: 2/20 recent, 22/40 mid,
# 44/60 older -- which reads 24/60 = 40% flat and 10% recent, the exact pair the
# downstream measured (#682). The fixture IS the finding.
_over = _over_cap_subject("x", 18)
_converged = ([_over] * 2 + ["ok"] * 18
              + [_over] * 22 + ["ok"] * 18
              + [_over] * 44 + ["ok"] * 16)
RECENCY_CASES = [
    (_converged, [("recent (1-20)", 2, 20, 2), ("mid (21-60)", 22, 40, 22),
                  ("older (61-120)", 44, 60, 44)],
     "a converged repo: 40% flat over 60, 10% recent -- the #682 case"),
    ([_over_cap_subject("z", 18)] * 20 + ["ok"] * 40,
     [("recent (1-20)", 20, 20, 20), ("mid (21-60)", 0, 40, 0)],
     "a regressing repo: recent fails, tail clean -- decline IS earned"),
    (["ok"] * 5, [("recent (1-20)", 0, 5, 0)],
     "a short corpus yields one partial row, never a padded window"),
    (["ok"] * 30, [("recent (1-20)", 0, 20, 0), ("mid (21-60)", 0, 10, 0)],
     "30 commits spill into a partial mid window"),
    # The raw column has to survive the SPLIT, not just over_cap: every subject
    # here is compliant as authored and over-cap as the platform stores it, so a
    # window that forwards `over` in raw's place reads 0 and goes RED. The cases
    # above cannot catch that -- none of them carries a suffix.
    ([_under_cap_subject("x") + _SUFFIX] * 5, [("recent (1-20)", 0, 5, 5)],
     "raw and stripped diverge inside a window, not only in over_cap"),
    ([], [], "empty corpus yields no rows at all"),
]


def selftest():
    fails = []
    for cmd, want, label in SELFTEST_CASES:
        got = verdict(cmd)
        got_rule = got[0] if got else None
        if got_rule != want:
            fails.append(f"FAIL {label}: want {want or 'allow'}, got {got_rule or 'allow'}")
    for subjects, want_over, want_total, want_raw, label in OVER_CAP_CASES:
        n_over, n_total, _, n_raw = over_cap(subjects)
        if (n_over, n_total, n_raw) != (want_over, want_total, want_raw):
            fails.append(f"FAIL over-cap {label}: want {want_over}/{want_total} "
                         f"stripped + {want_raw} raw, got {n_over}/{n_total} + "
                         f"{n_raw} raw")
    for subjects, want, label in RECENCY_CASES:
        got = [(lbl, o, t, rw) for lbl, o, t, _, rw in recency_split(subjects)]
        if got != want:
            fails.append(f"FAIL recency {label}: want {want}, got {got}")
    widest = " (#" + "9" * SUFFIX_DIGITS + ")"
    if len(widest) != SUFFIX_RESERVE:
        fails.append(f"FAIL reserve arithmetic: budgets {SUFFIX_RESERVE} chars "
                     f"for {widest!r}, which is {len(widest)}")
    for text, want_match, label in RESERVE_CASES:
        if bool(SQUASH_SUFFIX.search(text)) != want_match:
            fails.append(f"FAIL reserve {label}: {text!r} "
                         f"{'should' if want_match else 'should not'} strip")
    total = (len(SELFTEST_CASES) + len(OVER_CAP_CASES) + len(RECENCY_CASES)
             + len(RESERVE_CASES) + 1)
    print(f"block_commit_rules selftest: {total - len(fails)}/{total} PASS "
          "(verdict + over-cap + recency + reserve)")
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
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    if "--report" in sys.argv:
        sys.exit(report())
    sys.exit(main())
