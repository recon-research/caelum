#!/usr/bin/env python3
"""Commit-message semantics gate -- negated closing keywords (guard: #591).

GitHub's closing-keyword parser has **no notion of negation**: it reads
`fixed: #580` inside the sentence "Filed, not fixed: #580" and closes #580.
That is exactly how #580 came to sit CLOSED-as-COMPLETED with the bug fully
live in `main` (commit 710a0a7, PR #582) -- the sentence documenting that the
work was *deferred* is what marked it done.

The failure is silent and INVERTED: the more carefully a message records that
something is not done, the more likely it is to be closed. A ticket closed as
completed drops out of `gh issue list --state open`, out of the deferral log,
and out of every Status/ROADMAP reconciliation that reads open state -- so the
normal safety nets confirm the wrong answer instead of catching it. No amount
of care at writing time fixes a parser-semantics gap; only a mechanical check
placed before the push does, which is the one moment it is still fixable
(rewriting `main` to undo it is forbidden by the merge policy).

Scope: commit subjects+bodies in a range (default `origin/main..HEAD`, i.e.
this slice's commits), plus the PR title/body when `PR_TITLE`/`PR_BODY` are set
-- GitHub honours closing keywords in BOTH, and a squash merge lands the commit
message on the default branch. Deliberately NOT history-wide: a gate that
re-litigates merged commits can never go green.

Detection is a negation word within `WINDOW` tokens BEFORE a closing keyword
that binds an issue ref. Tuned against this repo's full history (334 commits):
it fires on 710a0a7 and nothing else. That specificity is the point -- a guard
that also fires on the correct path trains you to skim it (#525/#570/#566).

Preferred deferral phrasing, which this gate accepts:
    Deferred: #580, #581            Filed, out of scope here: #580
    Refs #580 (not fixed here)      Follow-ups: #580, #581
An intentional close needs no special placement: a keyword inside its own
parenthetical is exempt, which is this repo's usual subject shape --
`fix: ... by step identity, not index (closes #608)` (#627).

Catches append (fail-open) to .claude/metrics/guard_hits.jsonl per the guard
discipline (#253).

Exit 0 = clean; exit 1 = a negated close (printed as source: matched text).
"""

from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent

# GitHub's documented closing keywords, all inflections it accepts. An optional
# colon is included because that is the observed real breach (`not fixed: #580`)
# -- GitHub binds the ref through it.
KEYWORD = r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#\d+"

# Negation carriers. Split into words (token-counted against WINDOW) and
# phrases (matched literally, since "out of scope" spans tokens).
NEGATION_WORDS = {
    "not", "no", "never", "without", "nor", "neither", "unfixed", "unresolved",
    "isn't", "aren't", "wasn't", "weren't", "won't", "wont", "don't", "dont",
    "doesn't", "doesnt", "didn't", "didnt", "cannot", "can't", "cant",
    "deferred", "defer", "defers", "pending", "unable",
}
NEGATION_PHRASES = ("out of scope", "yet to be")

# How many tokens before the keyword a negation may sit and still bind to it.
# 2, not more, and calibrated -- NOT guessed. GitHub only binds a ref that sits
# ADJACENT to the keyword ("not fixed in this PR: #580" does not close, because
# the words between break the binding), so a negation that binds the same
# keyword must be adjacent too. A wider window reaches into a neighbouring
# clause and invents breaches: at 4, this fired on `require it not per-leg
# names (closes #32)` -- a deliberate close whose "not" belongs to the subject.
#
# History bounds the false-positive rate only for shapes ALREADY WRITTEN: this
# window measured clean across 334 commits and then fired on the very next
# natural subject it met (`..., not index (closes #608)` -- #627). Both misses
# were the same shape, a negation in the prose against a close in a trailing
# parenthetical, which is why the fix was a scope boundary (`_negation_scope`)
# rather than yet another window tweak.
WINDOW = 2

TOKEN = re.compile(r"[A-Za-z']+")

# Innermost parentheticals, content captured. Used to bound a negation's reach
# (see `_negation_scope`); nesting is not a real commit-message shape, so the
# no-inner-parens character class is deliberate rather than a limitation.
PAREN = re.compile(r"\(([^()]*)\)")


def _negation_scope(sentence: str, start: int) -> str:
    """The text a negation may bind to this keyword FROM.

    A parenthetical is grammatically detached from the prose around it, so a
    negation outside one cannot govern a keyword inside it. That is what makes
    this repo's usual subject shape safe --

        fix: reconcile cae-stepper by step identity, not index (closes #608)

    where `not` negates *index*, not the close (#627). Sentence- and even
    clause-splitting both fail here: split on the comma and the negation is
    still in the same fragment as the keyword (measured). The parenthetical is
    the boundary that actually matches the grammar.

    A negation INSIDE the same parenthetical still binds, so `(not fixed: #580)`
    -- a deferral written parenthetically -- is caught exactly as before.
    """
    for p in PAREN.finditer(sentence):
        if p.start(1) <= start < p.end(1):
            return sentence[p.start(1) : start]
    return sentence[:start]


def negated_closes(text: str) -> list[str]:
    """Return the offending fragments: a closing keyword under a negation."""
    hits: list[str] = []
    # Bound each search to its own sentence/line: a negation in the previous
    # sentence has no grammatical hold on this keyword, and pretending it does
    # is how a guard earns its false positives.
    for sentence in re.split(r"(?<=[.!?;])\s+|\n", text):
        for m in re.finditer(KEYWORD, sentence, re.IGNORECASE):
            before = _negation_scope(sentence, m.start())
            lowered = before.lower()
            if any(p in lowered for p in NEGATION_PHRASES):
                hits.append(sentence.strip())
                continue
            tokens = [t.lower() for t in TOKEN.findall(before)]
            if any(t in NEGATION_WORDS for t in tokens[-WINDOW:]):
                hits.append(sentence.strip())
    return hits


# Pinned behaviour, checked on every run (see `selftest`). Both historical
# miscalibrations of this detector are here as cases: the breach it exists to
# catch, and the house subject shape it wrongly caught. In-band rather than a
# separate test file because the failure mode being guarded against is a guard
# that goes SILENTLY PERMISSIVE -- the same shape as the #580 bug itself -- and
# a check that only runs when someone remembers to run it does not cover that.
SELFTEST: tuple[tuple[str, bool], ...] = (
    # The #580 breach, verbatim from 710a0a7. Must always fire.
    ("Filed, not fixed: #580", True),
    # The #627 false positive: negated prose, close in a trailing parenthetical.
    ("fix: reconcile by step identity, not index (closes #608)", False),
    # ...but a deferral written INSIDE the parenthetical still binds.
    ("Rewrote the reconciler (not fixed: #580)", True),
    # The phrasings this gate's own docstring recommends must stay accepted.
    ("Refs #580 (not fixed here)", False),
    ("fix: clamp the index (closes #592)", False),
    # Phrase carriers and the colon binding GitHub actually honours.
    ("Out of scope here, fixes #77", True),
    ("Deferred, resolves #99", True),
)


def selftest() -> list[str]:
    """Return a description of each pinned case the detector now gets wrong."""
    return [
        f"{'expected a hit' if want else 'expected NO hit'}: {text!r}"
        for text, want in SELFTEST
        if bool(negated_closes(text)) is not want
    ]


def commits_in_range(rev_range: str) -> list[tuple[str, str]]:
    """(sha, full message) for each commit in the range; [] if the range is
    unresolvable (a fresh clone with no origin/main, a detached CI checkout)."""
    try:
        out = subprocess.run(
            ["git", "log", "--format=%H%x00%B%x1e", rev_range],
            cwd=ROOT, capture_output=True, text=True,
            encoding="utf-8", errors="replace", check=False,
        )
    except OSError:
        return []
    if out.returncode != 0:
        return []
    commits = []
    for record in out.stdout.split("\x1e"):
        if "\x00" not in record:
            continue
        sha, _, body = record.strip().partition("\x00")
        commits.append((sha[:8], body))
    return commits


def main() -> int:
    rev_range = sys.argv[1] if len(sys.argv) > 1 else "origin/main..HEAD"

    # Before judging anyone else's messages, prove the detector still works.
    broken = selftest()
    if broken:
        for case in broken:
            print(f"selftest: {case}")
        print(
            "::error::The negated-close detector fails its own pinned cases, so "
            "its verdict on this range means nothing. Fix the detector (#591, "
            "#627) -- do NOT relax the cases to make this pass."
        )
        return 1

    violations: list[tuple[str, str]] = []

    for sha, message in commits_in_range(rev_range):
        for hit in negated_closes(message):
            violations.append((f"commit {sha}", hit))

    # PR title/body flow in through the environment, never argv -- untrusted
    # input, same discipline as the ticket-reference gate in ci.yml.
    for name in ("PR_TITLE", "PR_BODY"):
        for hit in negated_closes(os.environ.get(name, "")):
            violations.append((name, hit))

    if violations:
        for source, hit in violations:
            print(f"{source}: {hit}")
        print(
            "::error::A closing keyword sits under a negation -- GitHub ignores "
            "the negation and will CLOSE the ticket you are deferring (#591, the "
            "#580 breach). Rephrase the DEFERRAL -- 'Deferred: #NN', 'Refs #NN "
            "(not fixed here)' -- rather than moving the close: an intentional "
            "'(closes #NN)' inside its own parenthetical is already exempt, so "
            "what fired here binds the ref straight out of negated prose (#627)."
        )
        try:
            mdir = ROOT / ".claude" / "metrics"
            mdir.mkdir(parents=True, exist_ok=True)
            with open(mdir / "guard_hits.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "ts": datetime.datetime.now(datetime.timezone.utc)
                        .isoformat(timespec="seconds"),
                    "guard": "#591 commit-msg semantics",
                    "rule": "negated-closing-keyword",
                    "hits": len(violations),
                }) + "\n")
        except Exception:
            pass
        return 1

    print("COMMIT MSGS: GREEN - no negated closing keywords (#591).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
