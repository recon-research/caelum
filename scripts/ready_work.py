#!/usr/bin/env python3
# ready_work.py -- the ready-set query behind pick-next-slice and fleet sizing (#308).
#
# A ticket is READY iff: open, workable (no non-workable label), unclaimed
# (no assignee and no remote slice branch carrying its number), and every
# `Blocked-by: #NN` line in its body points at an issue that is no longer open.
#
# Blocker-state rule (one gh call, not N): a blocker is OPEN iff it appears in
# the open-issue listing this script already fetched. A number that is closed,
# nonexistent, or a PR therefore counts as not-blocking -- acceptable for an
# advisory query; the claim gate at slice start is the real arbiter.
#
# Consumers: onboard step 5 (pick next slice) and scripts/fleet_size.py (#332),
# which imports ready_items(). Convention single-homed in PROJECT_CONVENTIONS.md
# > Tracker & Hygiene > Dependency edges. Blocked-by lines are dogfooded by the
# #301 program tickets and the fleet program (#331-#333).
#
# The Blocked-by parser matches ANYWHERE in the body (own line preferred, but
# mid-sentence + trailing annotation occur in the wild -- #303's "Blocked-by:
# #302 (the accept gate...)" was the live miss). Bold (`**Blocked-by:** #N`)
# and list (`Blocked-by:` + `- #N` lines) forms count too (#479 -- both missed
# in the UNDER-blocking direction, contradicting the contract). A false
# positive over-blocks, which errs conservative -- the certify-safe direction
# (D-330); the lenient group below (blank lines inside a list still capture)
# leans the same way on purpose.
#
# Advisory query, not telemetry: unlike slice_telemetry.py this EXITS NONZERO
# on a dead tracker -- a wrong empty answer would silently misroute a session.
#
# Single-implementation Python (D-210: `python3` spelling), stdlib only,
# cwd-independent -- same conventions as metrics.py / slice_telemetry.py.
import json
import re
import subprocess
import sys
import os

# Windows cp1252 stdout guard (#296): ticket titles carry non-ASCII.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root

# Labels that mark a ticket as not directly workable by a builder session.
NON_WORKABLE = {"decision", "inbox", "epic", "idea", "blocked", "needs-human"}
# Pinned issues are tracker fixtures, never work (#525): the pin is this
# repo's discovery convention for living registries (#200's own comments),
# and no label can carry that fact -- workability is label-ABSENCE-based, so
# an unlabeled fixture reads as ready. Checked first: fixture-ness trumps
# every other classification.

# `\*{0,2}` on both sides of the colon absorbs the bold forms
# (`**Blocked-by:**` / `**Blocked-by**:`); the optional `[-*]` marker inside
# the group absorbs list items (#479).
BLOCKED_BY_RE = re.compile(
    r"Blocked-by\*{0,2}:\*{0,2}((?:\s*(?:[-*]\s*)?#\d+,?)+)", re.I)

# Branch-is-the-claim is scoped to slice/ heads: a date-named rescue or
# checkpoint branch (`rescue/2026-07-23`) must not read as a claim on #2026
# (#479). Branch naming: conventions > Tracker & Hygiene.
SLICE_HEAD_RE = re.compile(r"refs/heads/slice/(\d+)-")

# Blocker-state horizon: an open blocker past the listing limit reads as
# closed (the one-gh-call rule above). 200 was quietly saturable (#479);
# 1000 + a saturation warning keeps the advisory answer honest.
OPEN_LIMIT = 1000


def parse_blockers(body):
    """Issue numbers from every Blocked-by edge in the body (#308/#479)."""
    return {int(n) for m in BLOCKED_BY_RE.findall(body or "")
            for n in re.findall(r"\d+", m)}


def claimed_from_heads(heads):
    """Claimed issue numbers from `git ls-remote --heads` output (#479)."""
    return {int(n) for n in SLICE_HEAD_RE.findall(heads or "")}


def classify(issue, claimed_numbers, open_numbers):
    """One of 'pinned' | 'non_workable' | 'claimed' | 'blocked' | 'ready'.
    Pure, so --selftest drives it (#525); ready_items tallies the result."""
    if issue.get("isPinned"):
        return "pinned"
    labels = {lb["name"] for lb in issue.get("labels", [])}
    if labels & NON_WORKABLE:
        return "non_workable"
    if issue.get("assignees") or issue["number"] in claimed_numbers:
        return "claimed"
    if parse_blockers(issue.get("body")) & open_numbers:
        return "blocked"
    return "ready"


def _run(args, what):
    r = subprocess.run(args, capture_output=True, text=True, timeout=90,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit(f"ready_work: {what} failed: {(r.stderr or '').strip()[:200]}")
    return r.stdout


def ready_items():
    """(ready, stats) -- ready: list of open, workable, unclaimed, unblocked
    issue dicts (number, title, body, labels); stats: the exclusion tally."""
    issues = json.loads(_run(
        ["gh", "issue", "list", "--state", "open", "-L", str(OPEN_LIMIT),
         "--json", "number,title,body,labels,assignees,isPinned"],
        "gh issue list"))
    if len(issues) >= OPEN_LIMIT:
        print(f"ready_work: warning: open-issue listing saturated at "
              f"{OPEN_LIMIT}; blockers beyond it read as closed (#479)",
              file=sys.stderr)
    open_numbers = {i["number"] for i in issues}
    heads = _run(["git", "ls-remote", "--heads", "origin"], "git ls-remote")
    claimed_numbers = claimed_from_heads(heads)

    ready, stats = [], {"open": len(issues), "pinned": 0, "non_workable": 0,
                        "claimed": 0, "blocked": 0, "ready": 0}
    for i in issues:
        kind = classify(i, claimed_numbers, open_numbers)
        if kind != "ready":
            stats[kind] += 1
            continue
        ready.append({"number": i["number"], "title": i["title"],
                      "body": i.get("body") or "",
                      "labels": sorted(lb["name"] for lb in i.get("labels", []))})
    stats["ready"] = len(ready)
    ready.sort(key=lambda i: i["number"])
    return ready, stats


def main():
    ready, stats = ready_items()
    if "--json" in sys.argv:
        print(json.dumps([{k: i[k] for k in ("number", "title", "labels")}
                          for i in ready], indent=2))
        return
    print(f"ready_work: {stats['ready']} ready of {stats['open']} open "
          f"({stats['non_workable']} non-workable, {stats['claimed']} claimed, "
          f"{stats['blocked']} blocked, {stats['pinned']} pinned)")
    for i in ready:
        print(f"  #{i['number']}  {i['title']}")


def selftest():
    """Offline, side-effect-free (#319): the pure parsers only -- no gh."""
    failed = 0

    def check(name, got, want):
        nonlocal failed
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} ready-work: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    check("blockers: plain multi", parse_blockers("Blocked-by: #302, #303"),
          {302, 303})
    check("blockers: trailing annotation (#303 shape)",
          parse_blockers("Blocked-by: #302 (the accept gate...)"), {302})
    check("blockers: bold, colon inside (#479)",
          parse_blockers("**Blocked-by:** #12"), {12})
    check("blockers: bold, colon outside (#479)",
          parse_blockers("**Blocked-by**: #12"), {12})
    check("blockers: dash-list form (#479)",
          parse_blockers("Blocked-by:\n- #7\n- #9"), {7, 9})
    check("blockers: star-list form (#479)",
          parse_blockers("Blocked-by:\n* #7"), {7})
    check("blockers: absent", parse_blockers("no edges here, just #5 prose"),
          set())
    check("blockers: None body", parse_blockers(None), set())

    heads = ("abc\trefs/heads/slice/123-fix-parser\n"
             "def\trefs/heads/rescue/2026-07-23\n"
             "ghi\trefs/heads/checkpoint/2026-07-22\n"
             "jkl\trefs/heads/slice/86-orphaned-scope-fix\n"
             "mno\trefs/heads/main\n")
    check("claims: slice heads only; date-named branches ignored (#479)",
          claimed_from_heads(heads), {123, 86})
    check("claims: empty heads", claimed_from_heads(""), set())

    # classify() corpus (#525). The divergent fixture is the live #200
    # shape: pinned, workable label, unclaimed, unblocked -- the wrong
    # (label-only) reading calls it ready; the right one excludes it.
    def iss(n, pinned=False, labels=(), assignees=(), body=""):
        return {"number": n, "isPinned": pinned,
                "labels": [{"name": lb} for lb in labels],
                "assignees": list(assignees), "body": body}

    check("classify: pinned fixture with workable label (#200 shape)",
          classify(iss(200, pinned=True, labels=["followup"]), set(), set()),
          "pinned")
    check("classify: pinned trumps every other exclusion",
          classify(iss(7, pinned=True, labels=["decision"],
                       assignees=["x"], body="Blocked-by: #9"), set(), {9}),
          "pinned")
    check("classify: unpinned workable is ready",
          classify(iss(8, labels=["followup"]), set(), set()), "ready")
    check("classify: missing isPinned key reads unpinned (old gh output)",
          classify({"number": 9, "labels": [], "assignees": [], "body": ""},
                   set(), set()), "ready")
    check("classify: claimed via slice head",
          classify(iss(10), {10}, set()), "claimed")
    check("classify: blocked by an open issue",
          classify(iss(11, body="Blocked-by: #12"), set(), {12}), "blocked")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(selftest()) if "--selftest" in sys.argv[1:] else main()
