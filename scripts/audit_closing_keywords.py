#!/usr/bin/env python3
"""audit_closing_keywords.py -- undeclared closing references (#727; exits non-zero).

GitHub's closing-keyword parser scans for `<keyword> #<number>` and reads NO
surrounding context. A negated ("does not close 12"), qualified ("close 13 on
the freeze"), or *quoted* mention beside a live issue number creates a real
closing link, and merging it retires that ticket. Five sightings downstream in
five grammars (intake 723) -- including the PR that documented the bug causing
it again, and the PR shipping the guard causing it a third way by pasting a
findings block as liveness evidence.

The template ships the risk surface: PULL_REQUEST_TEMPLATE.md instructs a prose
closing ref in the "What & why" paragraph, and ship_pr tells agents to write
multi-slice bodies that discuss other tickets.

THE RULE -- set equality, deliberately not "ban prose refs":
  declared = closing refs in a SUBJECT line (the PR title, or line 1 of any
             commit) or a TRAILER line (a line of nothing but closing refs --
             the escape hatch when a subject cannot hold them all)
  found    = every closing ref anywhere (subjects, trailers, and prose)
  FAIL iff found != declared.

The simpler "ban prose refs" rule was tried downstream first and the data killed
it: because the shipped PR template puts a closing ref in body prose, 11 of their
last 40 merged PRs did exactly that and would have red-flagged. Set equality
passes them -- their subjects already declare the same issue -- and still fails
every real sighting, whose refs appear in no subject or trailer.

POSITIONAL AND QUOTE-BLIND ON PURPOSE. This gate never tries to exempt a
negated / qualified / quoted form. Four attempts to be clever there failed in
production downstream; position is the only signal that held.

BOTH the PR title and each commit subject count as declaring, and BOTH the PR
body and each commit body are scanned -- measured here, not assumed (the #707
rule: measure the corpus you actually gate). Replaying this rule over this
repo's last 40 merged PRs: 1 flagged, PR 719 -- a commit body reading "The
ticket's premise was partly already fixed: 609 replaced step 1's ...". Past-tense
"already fixed: N" is a SIXTH grammar beyond the five sightings intake 723
carried, and it is this template's own house idiom: reporting that a ticket's
premise turns out to be already fixed is a routine finding here (686's entire
result was exactly that). It landed as a near-miss rather than damage only
because 609 was already closed three days earlier -- GitHub recorded a
`referenced` event where an open ticket would have been retired.

Reading both documents is what makes the gate correct, and PR 673 is the case
that proves it: its PR body wraps as prose ("Closes 621, closes 665. Claimed at
branch creation ..."), while its squash COMMIT body puts `closes 665` alone on
line 2 -- a clean trailer, i.e. a legitimate declared two-ticket close. Reading
only the PR body flags it; reading only commits misses PR-body refs; the commit
is what GitHub actually acts on. 4 of the last 40 also carried a PR title whose
closing refs differ from the squash-commit subject's -- here the DOMINANT
pattern is the opposite of the reporting downstream's: a bare PR title with the
ref living only in the commit subject.

THE TRAP IN THE OBVIOUS FIX. `closingIssuesReferences` looks like GitHub stating
what it will act on. It has a hole and it is exactly the case that matters:
verified downstream, that field read EMPTY for a PR whose squash commit retired
a live ticket anyway (the issue timeline named the squash sha as the closer). It
reflects links made from the PR title/body; a keyword living only in a COMMIT
MESSAGE creates no PR-level link and still fires when the squash lands. So the
field is kept here as a SECOND, INDEPENDENT oracle for the opposite hole --
anything GitHub names that the scan did not model fails loudly rather than being
trusted away -- never as the primary check.

QUOTABLE OUTPUT (intake 724, ticket 728). This gate's defect class is "this text
must not appear in this place", so its own report is a carrier: paste it as
definition_of_done evidence and you re-introduce the bug. Every number this
script's own commentary prints is therefore BARE, never `#`-prefixed, so a green
or red report is safe to quote. The offending source line is still echoed
verbatim -- hiding it would make the finding unfixable -- behind a warning.

Accepted residual: under CI_POSTURE=manual no checks run, so a PR body is scanned
by nothing (the local run has no PR context pre-push). The commit-message half is
still covered locally. A PreToolUse rung that blocks the keyword at write time is
the natural escalation, filed as 731 -- with the note that its admission bar has
NOT been measured as a block yet (README > Blocking guards).

Wiring (four-way mirror, audit_ops_config-enforced): preflight.{sh,ps1}
"closing keywords" stage <-> ci.yml "Closing-keyword audit" step + PREFLIGHT_TO_CI
row; --selftest is offline/side-effect-free (#319) and registered in
SELFTEST_SCRIPTS. The fixtures ARE the historical record -- each is a real
sighting or a real legitimate close, and they run on EVERY invocation, so a regex
edit that stops catching a sighting goes red wherever this gate runs.
"""
import json
import os
import re
import subprocess
import sys

# Windows cp1252 stdout guard (#296): gate output carries non-ASCII.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# cwd-independent: the script lives in scripts/, the repo root is its parent.
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# GitHub's keyword list -- theirs, not ours, so this is NOT a project-mirrored
# constant (#294): no downstream re-keys it, because no downstream chooses it.
_KW = r"clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed)"
# `#12`, `owner/repo#12`, `GH-12` -- every form GitHub acts on.
_REF = r"(?:[\w.-]+/[\w.-]+)?#\d+|GH-\d+"

CLOSING_RX = re.compile(rf"\b(?:{_KW})\b\s*:?\s+({_REF})", re.I)
# A line of nothing but closing refs (list markers / quote marks / punctuation
# allowed) -- the escape hatch when a subject cannot hold them all.
TRAILER_RX = re.compile(rf"[\s\-*>]*(?:(?:{_KW})\b\s*:?\s+(?:{_REF})[\s,;.]*)+", re.I)


def _norm(ref):
    """`GH-12` and `#12` are the same link to GitHub; normalize so they are here."""
    m = re.fullmatch(r"GH-(\d+)", ref.strip(), re.I)
    return "#" + m.group(1) if m else ref.strip()


def refs_in(text):
    """Every closing reference in `text`, normalized. Pure -- the fixture corpus
    drives this directly (#319), which is what makes the rule replayable against
    a foreign repo's corpus without running the gate there."""
    return {_norm(m.group(1)) for m in CLOSING_RX.finditer(text or "")}


def is_trailer(line):
    """True if `line` is nothing but closing refs."""
    s = (line or "").strip()
    return bool(s) and TRAILER_RX.fullmatch(s) is not None


def evaluate(docs):
    """The rule. `docs` is an iterable of (label, subject, body).

    Returns (declared, found, sites): `sites` maps each ref to the
    (label, lineno, line) that first mentioned it in prose, for the report.
    Pure, and the single home of the rule -- fixtures and both callers use it."""
    declared, found, sites = set(), set(), {}
    for label, subject, body in docs:
        subject_refs = refs_in(subject)
        declared |= subject_refs
        found |= subject_refs
        for lineno, line in enumerate((body or "").splitlines(), 1):
            line_refs = refs_in(line)
            if not line_refs:
                continue
            found |= line_refs
            if is_trailer(line):
                declared |= line_refs
            else:
                for ref in line_refs:
                    sites.setdefault(ref, (label, lineno, line.strip()))
    return declared, found, sites


# --- collectors (impure; everything above is pure) --------------------------
def _git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=60)
    return r.stdout if r.returncode == 0 else None


def _event_payload():
    """The PR payload GitHub hands the runner -- title/body with no token and no
    network. Absent locally, which is why `gh` is the fallback and not the path."""
    path = os.environ.get("GITHUB_EVENT_PATH")
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            return (json.load(fh) or {}).get("pull_request")
    except (OSError, ValueError):
        return None


def _gh_json(args):
    try:
        r = subprocess.run(["gh", *args], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0 or not r.stdout.strip():
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def collect_commits():
    """(docs, base_label). The branch's own commits -- merge-base..HEAD."""
    pr = _event_payload()
    base = (pr or {}).get("base", {}).get("sha")
    if not base:
        base = (_git("merge-base", "origin/main", "HEAD") or "").strip() or None
    if not base:
        return None, None
    raw = _git("log", "--format=%H%x1f%B%x1e", f"{base}..HEAD")
    if raw is None:
        return None, None
    docs = []
    for rec in raw.split("\x1e"):
        rec = rec.strip("\n")
        if not rec.strip():
            continue
        sha, _, message = rec.partition("\x1f")
        lines = message.splitlines()
        docs.append((f"commit {sha[:7]}", lines[0] if lines else "",
                     "\n".join(lines[1:])))
    return docs, base[:7]


def collect_pr():
    """((label, title, body), number, api_refs). Every element is optional: no PR
    context locally, and no oracle without a `pull-requests: read` token."""
    pr = _event_payload()
    if not pr:
        pr = _gh_json(["pr", "view", "--json", "number,title,body"])
    if not pr:
        return None, None, None
    number = pr.get("number")
    doc = (f"PR {number}" if number else "PR", pr.get("title") or "",
           pr.get("body") or "")
    api = _gh_json(["pr", "view", str(number), "--json", "closingIssuesReferences"]) \
        if number else None
    api_refs = None
    if api is not None:
        api_refs = {f"#{i['number']}" for i in api.get("closingIssuesReferences") or []}
    return doc, number, api_refs


# The paste warning, one home so the report and its fixtures can't disagree on
# how many lines precede the findings (the shape #739 settled next door).
_PASTE_WARNING = (
    "  !! The quoted lines below still contain LIVE closing keywords. Do not",
    "     paste this block into a PR body or commit message -- that is how",
    "     this defect propagates (see 728). The summary line above is safe.")


def format_report(undeclared, unmodelled, sites):
    """The gate's entire FAIL output as a list of lines. Pure (#319), extracted
    so the selftest drives the exact text main() prints (#746).

    This gate's FAIL path had never been executed by a test -- it runs only when
    the tree is dirty, and a gate's steady state is clean, which is precisely
    how #739's wrong-arity caller shipped green next door. Note what this one
    would have cost: the report quotes LIVE closing keywords, so a drifted
    caller here breaks the very block whose paste-safety warning is the reason
    the split exists (#728). `sites.get` keeps its default -- a ref found by the
    API oracle but not the scan has no site, and a KeyError here would replace
    the finding with a traceback.
    """
    out = [f"audit_closing_keywords: FAIL -- {len(undeclared)} undeclared, "
           f"{len(unmodelled)} unmodelled."]
    out.extend(_PASTE_WARNING)
    for ref in undeclared:
        label, lineno, line = sites.get(ref, ("?", 0, ""))
        out.append(f"  undeclared: issue {ref.lstrip('#')} -- {label}, body line {lineno}")
        out.append(f"      > {line[:160]}")
    out.extend(f"  unmodelled: GitHub will close issue {ref.lstrip('#')} but this "
               "scan did not find the reference -- the rule is missing a form."
               for ref in unmodelled)
    out.append("  Fix: put the reference in the subject line (PR title or commit "
               "subject), or on a trailer line of nothing but closing refs. If the "
               "mention is not meant to close anything, drop the keyword.")
    return out


def main():
    commits, base = collect_commits()
    if commits is None:
        print("Closing-keyword audit: no merge base against origin/main "
              "(fresh clone or no remote) -- SKIPPED.")
        return 0
    pr_doc, _number, api_refs = collect_pr()
    docs = list(commits) + ([pr_doc] if pr_doc else [])
    declared, found, sites = evaluate(docs)

    # Counts and bare numbers only -- this line is always safe to paste (728).
    print(f"Closing-keyword audit: {len(commits)} commits since {base} | "
          f"PR context: {'yes' if pr_doc else 'no'} | "
          f"oracle: {'yes' if api_refs is not None else 'unavailable'} | "
          f"declared {len(declared)} | found {len(found)}")

    undeclared = sorted(found - declared, key=lambda r: (len(r), r))
    # The second, independent oracle -- for the hole the scan cannot see, never
    # as the primary check (see the header: it misses commit-only keywords).
    unmodelled = sorted((api_refs or set()) - found) if api_refs is not None else []

    if not undeclared and not unmodelled:
        return 0

    for line in format_report(undeclared, unmodelled, sites):
        print(line)
    return 1


# --- selftest (offline, side-effect-free; run by audit_ops_config) ----------
def selftest():
    """The fixtures ARE the historical record: each case below is a real sighting
    (intake 723) or a real legitimate close from this repo's corpus. They run on
    every invocation, so a regex edit that stops catching a sighting goes red
    wherever this gate runs."""
    failed = 0

    def check(name, docs, want_undeclared):
        nonlocal failed
        declared, found, _ = evaluate(docs)
        got = sorted(r.lstrip("#") for r in found - declared)
        want = sorted(want_undeclared)
        ok = got == want
        failed += 0 if ok else 1
        # Names and bare numbers only -- never echo a fixture body (728).
        print(f"{'PASS' if ok else 'FAIL'} closing-keywords: {name}"
              + ("" if ok else f" -> undeclared {got!r} (want {want!r})"))

    # --- the five downstream sighting grammars (intake 723) ---
    check("negated mention still closes",
          [("c", "docs: explain the trap", "This does not close #12.")], ["12"])
    check("qualified mention still closes",
          [("c", "docs: note the freeze", "We close #13 on the freeze.")], ["13"])
    check("quoting a prior sighting re-arms it",
          [("c", "docs: write up the bug",
            'The offending line read "does not close #14".')], ["14"])
    check("pasting gate findings as evidence re-arms them",
          [("c", "guards: add the gate",
            "Liveness:\n  undeclared -- closes #15\n  undeclared -- closes #16")],
          ["15", "16"])
    check("colon form is not a loophole",
          [("c", "chore: tidy", "Closes: #17 once review lands.")], ["17"])

    # --- real legitimate closes from this repo's corpus ---
    # The dominant local pattern: bare-ish subject carries the ref, body prose
    # repeats it alongside other numbers. 3 of the last 4 merges look like this.
    check("subject declares, prose repeats -- the common local shape",
          [("c", "sync: fetch before pinning (closes #686)",
            "Closes #686. intake: #680 (a downstream sync report, finding g).")], [])
    # THIS repo's own sighting, quoted VERBATIM from PR 719's commit body -- a
    # sixth grammar beyond intake 723's five: a past-tense report that a ticket's
    # premise was ALREADY fixed. That sentence is house idiom here (686's whole
    # finding was one), which is what makes it the local high-risk form. It was a
    # near-miss only because 609 had been closed three days earlier.
    check("past-tense 'already fixed: N' still closes (PR 719's sighting)",
          [("c", "sync: fetch before pinning, and re-stamp the pinned sha (closes #686)",
            "The ticket's premise was partly already fixed: #609 replaced step 1's\n"
            "`<sha>..HEAD` with a pinned TGT and the")], ["609"])
    # PR 673, VERBATIM and in BOTH its forms -- the case that decides the design.
    # The PR body wraps the same content as prose; the squash commit puts the
    # second ref alone on line 2, a clean trailer. Reading only the PR body
    # false-positives here; the commit is what GitHub acts on. Do not "tidy" the
    # wrapping in either fixture -- the wrapping IS the difference.
    check("commit trailer declares what the PR body wraps as prose (PR 673)",
          [("PR 673", "metrics: receipts measure the implementation window (closes #621)",
            "Closes #621, closes #665. Claimed at branch creation on both tickets "
            "before the work; no deferrals filed (nothing was deferred)."),
           ("commit 5143a98", "metrics: receipts measure the implementation window "
            "(closes #621) (#673)",
            "closes #665\n\nTwo tickets, one boundary, and the investigation moved "
            "both premises.")], [])
    check("PR-body prose alone, with no commit trailer, is caught",
          [("PR 673", "metrics: receipts measure the implementation window (closes #621)",
            "Closes #621, closes #665. Claimed at branch creation on both tickets "
            "before the work; no deferrals filed (nothing was deferred).")], ["665"])
    check("trailer line declares what a subject cannot hold",
          [("c", "epic: land the sweep",
            "Body prose with no refs.\n\nCloses #18, closes #19")], [])
    check("list-marker trailer is still a trailer",
          [("c", "epic: land the sweep", "- Fixes #20")], [])
    check("PR title declares for a commit that does not",
          [("commit", "ci: reseat the guard", "Closes #21. intake: #22."),
           ("PR", "ci: reseat the guard (closes #21)", "")], [])

    # --- forms and inertness ---
    check("GH-N is the same link as #N",
          [("c", "chore: tidy", "Resolved GH-23 in passing.")], ["23"])
    check("cross-repo ref is caught",
          [("c", "chore: tidy", "Fixes owner/repo#24 too.")], ["owner/repo#24"])
    check("keyword with no reference is inert",
          [("c", "chore: tidy", "This closes the loop on the design.")], [])
    # Added because mutation-checking found nothing pinned the word boundary:
    # dropping \b from the keyword pattern killed ZERO cases. Both spellings
    # below are live house vocabulary here -- PR 718's body discusses
    # CHECKPOINT_SUBJECT_PREFIXES, and "unclosed" is ordinary prose -- so an
    # unanchored pattern would fire on real, correct writing.
    check("keyword embedded in a larger word is inert",
          [("c", "chore: tidy",
            "The CHECKPOINT_SUBJECT_PREFIXES #294 rule, and an unclosed #12 "
            "bracket in the suffixes #13 table.")], [])
    check("bare issue number without a keyword is inert",
          [("c", "chore: tidy", "See #25 and #26 for context.")], [])
    check("no references at all is inert", [("c", "chore: tidy", "Nothing here.")], [])

    # Contract checks the fixtures above cannot express.
    def contract(name, ok):
        nonlocal failed
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} closing-keywords: {name}")

    contract("subject-only ref is declared, not found-undeclared",
             evaluate([("c", "feat: thing (closes #27)", "")]) [0] == {"#27"})
    contract("prose line is not mistaken for a trailer",
             not is_trailer("Closes #28. intake: #29 (report, finding 1)."))
    contract("pure trailer is recognized", is_trailer("Closes #30, closes #31."))
    contract("report commentary prints no live keyword",
             not refs_in("undeclared: issue 665 -- commit a1b2c3d, body line 2"))

    # --- the FAIL report itself (#746). Reachable only on a dirty tree, which
    # is how #739's wrong-arity caller shipped green next door -- and here the
    # drifted branch would be the one whose paste-safety warning exists because
    # the text quotes LIVE keywords (#728).
    rep = format_report(["#41"], ["#42"],
                        {"#41": ("commit a1b2c3d", 2, "Fixes #41 while in there")})
    contract("#746: the report names the undeclared ref",
             any("undeclared: issue 41 -- commit a1b2c3d, body line 2" in ln for ln in rep))
    contract("#746: the report quotes the offending line",
             any(ln.startswith("      > Fixes ") for ln in rep))
    contract("#746: the report names the unmodelled ref",
             any("unmodelled: GitHub will close issue 42" in ln for ln in rep))
    contract("#746: the paste warning sits between the summary and the findings",
             list(rep[1:4]) == list(_PASTE_WARNING))
    # The API oracle can name a ref the scan never sited; `sites.get`'s default
    # is what keeps that a finding instead of a KeyError traceback.
    contract("#746: an unsited undeclared ref reports rather than raising",
             any("body line 0" in ln for ln in format_report(["#7"], [], {})))
    contract("#746: unmodelled-only still emits the fix instruction",
             format_report([], ["#99"], {})[-1].startswith("  Fix: "))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv[1:] else main())
