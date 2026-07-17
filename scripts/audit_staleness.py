#!/usr/bin/env python3
"""audit_staleness.py -- content-drift staleness for claim-heavy docs (#222; WARN-ONLY, always exits 0).

The third staleness kind, adapted from memtrace's `scan` concept
(github.com/memtrace-dev/memtrace). The link audits catch references whose
target is GONE (existence); the research discipline ages notes on a clock
(time-based, ~180 days). Nothing caught a doc whose referenced file CHANGED
after the doc was last touched -- content drift: a note or invariant that
keeps looking green while describing code that moved on.

Scope is deliberately narrow (owner decision, 2026-07-10): claim-heavy docs
only -- research/notes/*.md + docs/ARCHITECTURE.md. Policy docs (CLAUDE.md,
conventions, skills) reference paths as POINTERS under the single-home rule;
a pointer does not stale when its target changes, so sweeping them would be
warn fatigue, not signal. The output states this scope so a clean run is
never read as "all docs fresh".

Dates are git last-commit dates, never filesystem mtimes (clone/pull/branch-
switch rewrite mtimes wholesale -- fs dates are machine-dependent noise).
One batched `git log` pass builds the path->date map; a shallow clone or a
git failure degrades to a loud SKIP, never a false warning. (ci.yml's
static-gates checkout uses fetch-depth: 0, so CI dates are real.)

References that are themselves living doc-caches (Status-bearing CLAUDE.md,
ROADMAP, conventions, the regenerated SECTIONS index, METRICS) are exempt:
they churn at every checkpoint BY DESIGN, and their churn is not evidence a
claim staled -- drift is measured against implementation artifacts. Policy-
home docs (docs/AUTOMATION.md here) are exempt for the single-home reason:
claim docs cite them as pointers ("the policy lives there"), and a policy
edit is a decision, not drift evidence (#228, surfaced by moonlight-engine's
first run). REF_EXEMPT is project-mirrored -- see the constant's comment.

WARN-ONLY: exits 0 always. Promotion to a failing gate (or a wider scope) is
a retrospective's call after flag quality is observed on real runs -- #222.
"""
import glob
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
# Windows cp1252 stdout guard (#296): gate output carries non-ASCII
# (em-dashes, section signs, file text); a cp1252-strict console mojibakes
# or crashes an otherwise-green run. Uniform across every gate script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# cwd-independent: the script lives in scripts/, the repo root is its parent.
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SCOPE_NOTE = "research/notes/*.md + docs/ARCHITECTURE.md (claim-heavy docs only; pointer docs excluded by design)"
# 00_TEMPLATE.md is the fill-in scaffold, not a claim-doc -- its references are
# instructions ("add your note to MANIFEST"), the same pointer idiom the scope excludes.
SCOPE = sorted(p for p in glob.glob("research/notes/*.md")
               if os.path.basename(p) != "00_TEMPLATE.md") \
    + [p for p in ("docs/ARCHITECTURE.md",) if os.path.isfile(p)]

# Exempt reference targets, two classes: living doc-caches -- updated
# continuously by design (merge-time checkpoints, index regeneration), so
# "changed after the claim-doc" is their normal state -- and policy-home docs
# -- single-home pointer targets, where a policy edit is a decision, not drift
# evidence (#228). A PROJECT-MIRRORED constant on the hook-EXEMPT pattern
# (#135, PREFLIGHT_SHELLS D-218): configure_project adds YOUR living/policy
# docs (e.g. a downstream's docs/OPERATIONS.md), update_from_template preserves
# your value through syncs, and harvest lens 1 filters it as an expected delta.
# A first-run WARN on an ARCHITECTURE->policy-doc pointer means an entry is
# missing here, not that the doc staled. Repo-root-relative, forward slashes.
REF_EXEMPT = {
    "CLAUDE.md",
    "docs/ROADMAP.md",
    "docs/METRICS.md",
    "docs/AUTOMATION.md",
    "PROJECT_CONVENTIONS.md",
    "textbooks/SECTIONS.json",
    "textbooks/MANIFEST.json",
    "research/MANIFEST.json",
}

LINK = re.compile(r'\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
CODE_SPAN = re.compile(r'`([^`]+)`')
# A code span counts as a path reference only if it is purely path-shaped and
# crosses a directory (repo-root files like `CLAUDE.md` are pointer idiom).
PATHISH = re.compile(r'[A-Za-z0-9_.][A-Za-z0-9_./-]*')
LINE_SUFFIX = re.compile(r':\d+$')   # `scripts/foo.py:42` -> scripts/foo.py
SKIP_PREFIX = ('http://', 'https://', 'mailto:', '#')
FENCE = chr(96) * 3


def norm(path):
    return os.path.normpath(path).replace("\\", "/")


def git_last_commit_dates():
    """One-pass path -> last-commit unix time map, or None when history is unusable."""
    def run(*args):
        return subprocess.run(["git", *args], capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
    shallow = run("rev-parse", "--is-shallow-repository")
    if shallow.returncode != 0 or shallow.stdout.strip() == "true":
        return None
    log = run("log", "--format=%x00%ct", "--name-only")
    if log.returncode != 0:
        return None
    dates, ts = {}, None
    for line in log.stdout.splitlines():
        if line.startswith("\x00"):
            ts = int(line[1:])
        elif line.strip() and ts is not None:
            # log is newest-first: the first time a path appears is its last commit.
            dates.setdefault(line.strip().strip('"'), ts)
    return dates


def referenced_paths(doc):
    """Existing repo files referenced by markdown links or path-shaped code spans."""
    refs = set()
    in_fence = False
    for line in open(doc, encoding="utf-8"):
        if line.lstrip().startswith(FENCE):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        # Markdown links (doc-relative, same skip logic as the link audits).
        for m in LINK.finditer(CODE_SPAN.sub('', line)):
            tgt = m.group(1).strip()
            if tgt.startswith(SKIP_PREFIX) or tgt.startswith('/'):
                continue
            path = tgt.split('#', 1)[0]
            if path:
                cand = norm(os.path.join(os.path.dirname(doc), path))
                if os.path.isfile(cand):
                    refs.add(cand)
        # Code spans: repo-root-relative first (the dominant idiom), then doc-relative.
        # Only paths that exist are kept -- illustrative examples must not warn;
        # existence of link targets is the link audits' job, not this one's.
        for m in CODE_SPAN.finditer(line):
            tok = LINE_SUFFIX.sub('', m.group(1).strip())
            if '/' not in tok or not PATHISH.fullmatch(tok):
                continue
            for cand in (norm(tok), norm(os.path.join(os.path.dirname(doc), tok))):
                if os.path.isfile(cand):
                    refs.add(cand)
                    break
    return refs - REF_EXEMPT - {norm(doc)}


def day(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


dates = git_last_commit_dates()
if dates is None:
    print(f"Staleness scope: {SCOPE_NOTE}")
    print("SKIP -- no usable git history (shallow clone or git unavailable); "
          "content drift not evaluated. Full-history checkouts evaluate it for real.")
    sys.exit(0)

warns = []
compared = 0
uncommitted = 0
for doc in SCOPE:
    doc_ts = dates.get(norm(doc))
    if doc_ts is None:          # brand-new, uncommitted doc: nothing committed to drift against
        uncommitted += 1
        continue
    for ref in sorted(referenced_paths(doc)):
        ref_ts = dates.get(ref)
        if ref_ts is None:      # uncommitted ref: in-flight work, not committed drift
            continue
        compared += 1
        if ref_ts > doc_ts:
            warns.append((norm(doc), ref, ref_ts, doc_ts))

note = f" | uncommitted docs skipped: {uncommitted}" if uncommitted else ""
print(f"Staleness scope: {SCOPE_NOTE}")
print(f"Claim-docs checked: {len(SCOPE)} | referenced paths date-compared: {compared} | drift warnings: {len(warns)}{note}")
for doc, ref, ref_ts, doc_ts in warns:
    print(f"  WARN  {doc} (last commit {day(doc_ts)})  ->  {ref} changed {day(ref_ts)}")
if warns:
    print("warn-only (#222): drift is a re-verify prompt, not a gate -- "
          "re-check the doc's claims against the changed file, then touch or supersede the doc.")
sys.exit(0)
