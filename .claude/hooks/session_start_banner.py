# SessionStart hook (matchers: startup|resume|clear, and compact): prints a
# tiny staleness banner — stdout is injected into the session as context, so
# the agent starts every session (and every post-compaction / post-/clear
# window) knowing whether the CLAUDE.md Status anchor is stale and what
# decisions are open, for ~100 tokens and zero conversation round-trips.
#
# Wiring (see docs/AUTOMATION.md, or your project's automation-policy home —
# settings.json changes are owner-applied;
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
# and an optionally-backticked sha (one downstream's "main @ `sha`" form made the
# staleness check silently inert — the hook's whole point, with no signal);
# (b) the placeholder test anchors to the As-of line itself — the old
# `"<date" in text` matched the literal `checkpoint/<date>` that our own
# branch-naming convention plants in downstream Status prose, instructing a
# re-onboard of an onboarded project. Silent no-banner is invisible without
# the corpus; --selftest is not a hook invocation, so it may exit nonzero.
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

# The docs a checkpoint owns, excluded from the staleness count below. This set is
# the convention, not a guess: ship_pr step 7 writes CLAUDE.md + docs/ROADMAP.md in
# the same breath as the merge, and prepare_compaction step 3 commits the refreshed
# docs/METRICS.md ledger. Excluding only CLAUDE.md (the pre-#525 behaviour) made the
# banner cry STALE after every correctly-executed checkpoint -- and an alarm that
# fires on the good path trains the reader to wave it off, which is exactly how a
# genuinely stale Status gets through. Add a path here only if the checkpoint itself
# starts writing it; anything else landing is real work and SHOULD stale the stamp.
# Accepted residual: a ROADMAP-only commit that is NOT a checkpoint (a plan_work
# re-plan) now reads fresh, so a Status "Next:" line can drift from the ROADMAP it
# caches without the banner saying so. Path-based exclusion can't tell the two apart,
# and onboard step 3 reconciles docs against the tracker regardless -- a guard that
# misses that case beats one that fires on every checkpoint and gets ignored.
#
# guard: #884 -- the last three paths, by that same rule. #860 found that a ledger
# row cannot ride the PR of the code it signs off (squash rewrites the branch sha it
# cites), so the row now ships in its OWN post-merge PR -- and that PR *is* the
# checkpoint, writing Status + ROADMAP + METRICS + the two ledger files + PATTERNS in
# one commit. prepare_compaction step 1 likewise routes reusable patterns into
# docs/PATTERNS.md instead of letting them bloat Status. With only the first three
# excluded, EVERY slice ended on a commit that cried STALE -- the #525 regression
# again, by a different route. Calibrated over the 60 commits before the widening:
# checkpoint-only 25 -> 34, and all 9 that flipped are checkpoints or ledger
# sign-offs by title; no real-work commit flipped, and 35 of 60 still stale the
# stamp. Revisit if the ledger stops being sha-based (#860's own retire-when).
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

# guard: #340 (intake #325 -- a downstream hit the false STALE live). Commit-subject
# sibling of scripts/metrics.py's CHECKPOINT_PREFIXES branch-prefix mirror
# (#295): the prescribed merge-time checkpoint commit touches CLAUDE.md +
# ROADMAP + METRICS in one breath, so a path filter alone counts it and STALE
# false-fires at the next onboarding. Subjects matched case-insensitively.
CHECKPOINT_SUBJECT_PREFIXES = ("docs: checkpoint", "docs: compaction checkpoint")
# ^ Caelum convention, measured 2026-07-30 over 300 subjects: 125 start
#   "docs: checkpoint", 0 non-checkpoints match; the "docs: compaction
#   checkpoint" family is the second spelling. Upstream default was
#   ("checkpoint:",) -- zero-match here (#473 trap).  # mirror -- verify
# against `git log --format=%s | grep -i "^checkpoint"` before trusting (subjects
# only -- git --grep would also match body lines): a downstream's real checkpoint
# subjects rarely match the template default, and a zero-match value is silent
# (#340; the #345 branch-prefix sibling carries the same nudge).

# guard: #507 (intake #503 -- a downstream false-tripped twice in one milestone
# even with a checkpoint-shaped commit, because the subject-prefix exclusion
# above is convention-coupled). The trio below keys the exclusion off the
# checkpoint's FILE FOOTPRINT instead -- commits confined to these paths never
# count toward STALE, whatever their subject. Trade-off, accepted: a ROADMAP-
# or METRICS-only drive-by edit no longer trips STALE either; onboard step 3's
# tracker reconcile is the backstop. Mirror to YOUR checkpoint's real footprint
# (#295-style: a downstream whose checkpoint also stamps another doc extends
# this tuple to match).
CHECKPOINT_TRIO = ("CLAUDE.md", "docs/ROADMAP.md", "docs/METRICS.md",
                   # Caelum checkpoints also stamp these (#507 extension arm):
                   "docs/PATTERNS.md", "docs/CAPABILITY_LEDGER.md",
                   "docs/capability-ledger.json")


def stale_pathspec():
    """git-log pathspec: only commits touching something OUTSIDE the trio
    count. Pure, so --selftest pins it against drift."""
    return [".", *[":!" + p for p in CHECKPOINT_TRIO]]


def log_guard_hit(rule, detail):
    # Guard-lifecycle telemetry (#253/#507): a STALE fire is a catch worth
    # counting -- retrospectives retire dead guards and retune noisy ones.
    # Fail-open like everything here; caller has already chdir'd to repo root.
    try:
        mdir = os.path.join(os.getcwd(), ".claude", "metrics")
        os.makedirs(mdir, exist_ok=True)
        row = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "guard": "session_start_banner", "rule": rule, "detail": detail}
        with open(os.path.join(mdir, "guard_hits.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
    except Exception:
        pass


def noncheckpoint_count(subjects):
    # Pure core of the staleness count (corpus-tested via --selftest): the
    # caller has already path-filtered ( :!CLAUDE.md ); this drops checkpoint-
    # subject commits and counts the rest. A non-checkpoint commit touching
    # tracked paths still counts -- the check must not go dead (#340 AC2).
    lows = tuple(p.lower() for p in CHECKPOINT_SUBJECT_PREFIXES)
    return sum(1 for s in subjects if not s.strip().lower().startswith(lows))


def zero_match_warnings(recent_subjects, anchor_kind):
    """#473 (3rd recurrence of the #295 class): warn-not-fail reality checks
    for the project-mirrored constants above. A drifted literal fails
    SILENTLY -- zero matches, nothing fires -- so --selftest compares each
    against reality and warns loudly instead of failing (a young repo or a
    subject-free convention legitimately matches zero). Pure over its
    inputs: the corpus pins both directions; the caller feeds real data."""
    warns = []
    lows = tuple(p.lower() for p in CHECKPOINT_SUBJECT_PREFIXES)
    if recent_subjects and not any(s.strip().lower().startswith(lows)
                                   for s in recent_subjects):
        warns.append("WARN zero-match (#473): CHECKPOINT_SUBJECT_PREFIXES "
                     f"{CHECKPOINT_SUBJECT_PREFIXES!r} matched none of the last "
                     f"{len(recent_subjects)} commit subjects -- if this project "
                     "has checkpoint commits, the mirror has drifted and the "
                     "STALE subject exclusion is inert.")
    if anchor_kind == ("none",):
        warns.append("WARN zero-match (#473): the As-of anchor regex matches "
                     "nothing in CLAUDE.md -- the staleness arm is inert. "
                     "Divergent Status anchor? classify() and its corpus must "
                     "key to the real shipped line.")
    return warns


# A placeholder Status has TWO causes and the banner cannot tell them apart
# (#361): a fresh copy awaiting Mode A, and a self-hosted template where the
# unfilled skeleton IS the shipped product and Mode A must never run -- it would
# fill the skeleton in place. So the line names the fork instead of commanding
# one branch of it. The hazard it removes: a context-free session reading
# "run onboard Mode A" as an instruction and overwriting the template.
#
# The mechanical discriminator proposed in #361 (placeholder `source:` in
# TEMPLATE_VERSION + non-trivial history) was tried and REJECTED: README ›
# Starting a new project says "copy this entire folder", which can carry the
# template's own git history into the copy, so "non-trivial history" is
# unreliable in exactly the case it must not be -- and a false "self-hosted"
# verdict is the dangerous direction, silently denying a real downstream its
# onboarding cue. A banner that cannot know does not get to assert.
PLACEHOLDER_LINE = ("[status-anchor] Status block is still template placeholders -- "
                    "fresh copy? run onboard Mode A. Self-hosted template (the unfilled "
                    "docs ARE the product)? Mode B: resume from the tracker, never Mode A.")


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
        ("downstream prose+backtick", "**As of:** 2026-07-16 · main @ `a7823dd`", ("anchored", "2026-07-16", "a7823dd")),
        ("downstream prose bare sha", "**As of:** 2026-07-16 · main @ a7823dd", ("anchored", "2026-07-16", "a7823dd")),
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
    # #340 corpus: the staleness count's subject filter. Path filtering is
    # git-side ( :!CLAUDE.md ); these subjects are what survives it.
    #
    # Subjects DERIVE from CHECKPOINT_SUBJECT_PREFIXES rather than restating it
    # (#693, intake #682 finding 3). That constant is project-mirrored and its
    # own comment tells a downstream to re-key it -- so a corpus of upstream
    # literals goes RED ON ARRIVAL for a project that did exactly as
    # instructed. Measured before this change: re-keying to ("ckpt:",) broke 6
    # cases in this file. Worth naming plainly -- this is the file that
    # IMPLEMENTS the #473 drift-warning layer, and its own corpus carried the
    # bug that layer exists to make survivable. Drift is already covered at
    # runtime by zero_match_warnings() against real history; pinning the
    # literal here bought nothing and cost every downstream a red suite.
    cp = CHECKPOINT_SUBJECT_PREFIXES[0] if CHECKPOINT_SUBJECT_PREFIXES else None
    # Not a checkpoint under ANY re-keying. Its own case below ("real slice
    # still counts") is what validates that claim -- no assert needed.
    plain = "zzz-not-a-checkpoint: parser rewrite (closes #9)"
    count_cases = [
        ("real slice still counts (no dead check)", [plain], 1),
        ("empty history", [], 0),
    ]
    if cp:
        count_cases += [
            # The downstream repro (intake #325): the prescribed checkpoint
            # commit -- subject-prefixed, touches CLAUDE.md + ROADMAP + METRICS,
            # so the pathspec passes it through -- must not count toward STALE.
            ("downstream repro: checkpoint subject touching ROADMAP+METRICS",
             [f"{cp} post-merge status stamp"], 0),
            ("case variant (matching is case-insensitive)",
             [f"{cp.upper()} metrics refresh -- 90d window (#111)"], 0),
            ("mixed: checkpoint + real slice", [f"{cp} stamp", plain], 1),
            ("prefix mid-subject stays counted",
             [f"fix {cp} subject handling (#5)"], 1),
        ]
    for name, subjects, want in count_cases:
        got = noncheckpoint_count(subjects)
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} banner-stale-count: {name} -> {got}" + ("" if ok else f" (want {want})"))
    # #507: the trio pathspec is the path-side exclusion -- pin it so a drifted
    # constant can't silently re-open the false-STALE class (3rd recurrence:
    # intakes #288, #325, #503). git behavior itself is exercised live; this
    # pins what we hand git.
    # Derived from CHECKPOINT_TRIO, which is itself project-mirrored ("a
    # downstream whose checkpoint also stamps another doc extends this tuple").
    # The anti-drift intent is preserved exactly -- these still fail if
    # stale_pathspec() drops an exclusion or invents one -- but they now pin the
    # BUILDER against its constant rather than pinning the constant's value, so
    # extending the tuple as instructed no longer reddens the suite (#693).
    ps = stale_pathspec()
    ps_cases = [
        ("pathspec starts at repo root", ps[0] == ".", True),
        ("pathspec excludes the full trio",
         [p for p in CHECKPOINT_TRIO if ":!" + p not in ps] == [], True),
        ("pathspec excludes nothing else", len(ps), len(CHECKPOINT_TRIO) + 1),
    ]
    for name, got, want in ps_cases:
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} banner-pathspec: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))
    # #361: the placeholder line must present BOTH readings. A line naming only
    # Mode A is the false positive that could start Mode A against the template
    # skeleton; a line naming only Mode B strands a real fresh copy.
    line_cases = [
        ("offers Mode A (fresh copy)", "Mode A", True),
        ("offers Mode B (self-hosted template)", "Mode B", True),
        ("does not command Mode A unconditionally", "placeholders -- run onboard Mode A", False),
    ]
    for name, needle, want in line_cases:
        got = needle in PLACEHOLDER_LINE
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} banner-placeholder-line: {name}"
              + ("" if ok else f" -> {got} (want {want})"))
    # #473 corpus: pin the warn layer in both directions (the warns themselves
    # are advisory; these pins are gates).
    zm_cases = [
        ("empty history stays quiet (young repo)", ([], ("anchored", "d", "s")), 0),
    ]
    if cp:
        zm_cases += [
            # Prefix present but not at the start -> zero matches -> warn.
            ("drifted subject prefix warns",
             ([f"docs: {cp} stamp (#1)", plain], ("anchored", "d", "s")), 1),
            ("matching prefix stays quiet",
             ([f"{cp} stamp (#1)", plain], ("anchored", "d", "s")), 0),
            ("inert anchor regex warns", ([f"{cp} stamp"], ("none",)), 1),
            ("placeholder anchor stays quiet",
             ([f"{cp} stamp"], ("placeholder",)), 0),
        ]
    for name, (subjects, kind), want in zm_cases:
        got = len(zero_match_warnings(subjects, kind))
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} banner-zero-match: {name} -> {got} warn(s)"
              + ("" if ok else f" (want {want})"))
    # #884 (Caelum): a CHECKPOINT_TRIO entry that no longer exists silently
    # excludes nothing -- git takes an unmatched :!pathspec without complaint --
    # and the only symptom is the false STALE quietly returning. Resolve from
    # __file__, not cwd: the audit runs this as a subprocess without setting one.
    hook_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, os.pardir)
    for rel in CHECKPOINT_TRIO:
        ok = os.path.exists(os.path.join(hook_root, rel))
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} banner-checkpoint-doc-exists: {rel}")
    # #473 reality check, warn-not-fail: the constants vs THIS repo's recent
    # subjects and its real CLAUDE.md. Fail-open -- a warn layer never wedges.
    root = run(["git", "rev-parse", "--show-toplevel"])
    real_subjects = run(["git", "log", "--format=%s", "-n", "200"]).splitlines()
    try:
        real_kind = classify(open(os.path.join(root, "CLAUDE.md") if root else "CLAUDE.md",
                                  encoding="utf-8", errors="replace").read())
    except Exception:
        real_kind = None
    for w in zero_match_warnings(real_subjects, real_kind):
        print(w)
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
            # Two exclusions keep the post-merge checkpoint from reading as
            # staleness forever: path-based (#507) -- commits confined to the
            # checkpoint trio (Status stamp + ROADMAP + METRICS), whatever
            # their subject; subject-based (#340) -- checkpoint-prefixed
            # subjects, for checkpoint commits that legitimately touch more.
            # Any other commit touching tracked paths still counts.
            subjects = run(["git", "log", "--format=%s", f"{stamp_sha}..HEAD", "--", *stale_pathspec()])
            behind = noncheckpoint_count(subjects.splitlines())
            if behind:
                lines.append(f"[status-anchor] STALE: CLAUDE.md Status stamped {stamp_date} @ {stamp_sha}, "
                             f"but HEAD is {head} ({behind} non-checkpoint commit(s) later) -- reconcile Status first (onboard step 3).")
                log_guard_hit("stale", f"{behind} non-checkpoint commit(s) past {stamp_sha}")
            else:
                lines.append(f"[status-anchor] fresh: stamped {stamp_date} @ {stamp_sha} (no non-checkpoint commits since).")
    elif kind[0] == "placeholder":
        lines.append(PLACEHOLDER_LINE)
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
