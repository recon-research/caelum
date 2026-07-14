#!/usr/bin/env python3
"""audit_docs.py -- anti-drift budgets for the doc caches (#67; exits non-zero).

The docs are STATE CACHES of the tracker (CLAUDE.md > Source of truth). The
field failure this gates (2026-07, two sibling projects): a ROADMAP milestone
section accreted ~6,000 words of session journal, because every other guard
checks *consistency* with the tracker, and a doc can agree with the tracker
while still growing narrative without bound.

Budgets are deliberately loose (~5x the template's shape). Tripping one never
means "raise the budget" -- it means journaling crept in: move the narrative
to the tracker / git history and rewrite state lines in place
(docs/ROADMAP.md header carries the write rule).

v2 (#74) adds three placeholder-aware state checks. The discriminator: a
Status block whose state lines ALL carry <placeholders> is the fresh template
(everything tolerated); ZERO placeholders is onboarded (the invariants bind);
MIXED is partial-update drift and always fails. When onboarded: the tracker
exists, so PROJECT_BACKLOG.md must be gone (a second backlog is a staleness
machine), and ARCHITECTURE Appendix A's D-NN ids must be well-formed and
unique (a duplicated D-number poisons every cross-reference; a supersede is a
NEW row, never an edit).

Mirrored three ways (change together): ci.yml > static gates > "Doc budgets"
== preflight.sh / preflight.ps1 "doc budgets" stage.
"""
import argparse
import re
import sys
from pathlib import Path

STATUS_MAX_LINES = 15     # CLAUDE.md ## Status: non-blank, non-blockquote lines
MILESTONE_MAX_LINES = 30  # docs/ROADMAP.md: non-blank lines per milestone section
ROADMAP_MAX_LINES = 400   # docs/ROADMAP.md: total physical lines
LINE_MAX_CHARS = 700      # any single budgeted line (#402): the line-COUNT budgets above
                          # only measure height, so journaling drifted *horizontally* --
                          # per-PR narrative crammed onto one 30k-char physical line passes
                          # every count budget (and cramming is what dodging the count
                          # budget rewards). This caps width so narrative can't hide sideways.
                          # Table rows (leading `|`) are exempt. A trip means the same thing:
                          # move the narrative to the tracker/git and rewrite the line lean.

# A <fill-me> template field. The shipped docs spell it as HTML entities
# (&lt;...&gt;) so the placeholders survive GitHub's markdown rendering;
# hand-filled or downstream text may use literal angle brackets -- match both.
# The content must start with a letter: comparator prose in a filled Status
# line ("pointing <0.5 deg ... windows >1-orbit") must NOT read as a
# placeholder (#105, escaped downstream). Accepted trade-off: a digit-initial
# hand-written placeholder goes unflagged (misses a flag) rather than prose
# wrongly failing the gate (blocks a merge).
PLACEHOLDER = re.compile(r"<[A-Za-z][^<>\n]*>|&lt;[A-Za-z][^\n]*?&gt;")
CODE_SPAN = re.compile(r"`[^`]*`")       # inline code is not a placeholder (e.g. `gh pr view <n>`)


def strip_code_fences(lines):
    """Blank out fenced-code-block interiors so headings in examples don't count."""
    out, in_fence = [], False
    for line in lines:
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append("")
            continue
        out.append("" if in_fence else line)
    return out


def section_bounds(lines, start, level):
    """Lines belonging to the heading at `start` (exclusive), ending before the
    next heading of the same or higher level."""
    for i in range(start + 1, len(lines)):
        m = re.match(r"^(#{1,6})\s", lines[i])
        if m and len(m.group(1)) <= level:
            return lines[start + 1 : i]
    return lines[start + 1 :]


def check_status(root, problems):
    """Budget-check the Status block; return its state lines (None if absent)."""
    path = root / "CLAUDE.md"
    if not path.is_file():
        print("(skip: CLAUDE.md not found)")
        return None
    lines = strip_code_fences(path.read_text(encoding="utf-8", errors="replace").splitlines())
    for i, line in enumerate(lines):
        if re.match(r"^##\s+Status\b", line):
            body = section_bounds(lines, i, 2)
            state = [l for l in body if l.strip() and not l.lstrip().startswith(">")]
            print(f"CLAUDE.md Status block: {len(state)}/{STATUS_MAX_LINES} state lines")
            if len(state) > STATUS_MAX_LINES:
                problems.append(
                    f"CLAUDE.md ## Status has {len(state)} state lines (budget {STATUS_MAX_LINES}). "
                    "It is the 10-line summary -- detail lives in docs/ROADMAP.md and the "
                    "tracker, never here. Move narrative out; rewrite lines in place."
                )
            wide = wide_lines(state)
            if wide:
                problems.append(
                    f"CLAUDE.md ## Status has {len(wide)} state line(s) over {LINE_MAX_CHARS} chars "
                    f"(longest {max(wide)}). Journaling crept in HORIZONTALLY -- a single line "
                    "accreting per-PR narrative dodges the line-count budget. Move it to the "
                    "tracker/git history; rewrite the line lean (a pointer, not a changelog)."
                )
            return state
    print("(note: CLAUDE.md has no '## Status' heading -- status budget not checked)")
    return None


def wide_lines(lines):
    """Physical lines exceeding the width budget (markdown table rows exempt --
    a legit `| ... |` row can be wide; prose journaling has no pipes)."""
    return [len(l) for l in lines
            if not l.lstrip().startswith("|") and len(l.rstrip()) > LINE_MAX_CHARS]


def placeholder_flags(state_lines):
    """Per-line: does the line carry a <placeholder> (outside inline code)?"""
    return [bool(PLACEHOLDER.search(CODE_SPAN.sub("", l))) for l in state_lines]


def check_status_mixed(state_lines, problems):
    """#74.1: the Status block is all-placeholders (template) or none (onboarded) -- never mixed."""
    if not state_lines:
        return
    flags = placeholder_flags(state_lines)
    if any(flags) and not all(flags):
        stale = sum(flags)
        problems.append(
            f"CLAUDE.md ## Status is MIXED: {stale}/{len(flags)} state lines still carry "
            "<placeholders> while the rest are filled -- partial-update drift. Fill every "
            "field (or none, on the pristine template); a half-updated Status lies to the "
            "next session."
        )


def check_backlog(root, onboarded, problems):
    """#74.2: once the Status block is onboarded, the tracker exists -- PROJECT_BACKLOG.md must be gone."""
    present = (root / "PROJECT_BACKLOG.md").is_file()
    print(f"PROJECT_BACKLOG.md: {'present' if present else 'absent'} | status: "
          f"{'onboarded' if onboarded else 'template/pre-onboarding'}")
    if onboarded and present:
        problems.append(
            "PROJECT_BACKLOG.md still exists but the Status block is onboarded -- once the "
            "tracker is live a second backlog is a staleness machine (onboard step 7 / "
            "prepare_compaction): migrate any items to issues and delete the file."
        )


def check_decision_log(root, onboarded, problems):
    """#74.3: Appendix A D-NN ids are well-formed and unique. Pre-onboarding the
    template's example rows are tolerated (same discriminator)."""
    path = root / "docs" / "ARCHITECTURE.md"
    if not path.is_file():
        print("(skip: docs/ARCHITECTURE.md not found)")
        return
    if not onboarded:
        print("(decision log: pre-onboarding -- template example rows tolerated)")
        return
    lines = strip_code_fences(path.read_text(encoding="utf-8", errors="replace").splitlines())
    ids, seen = [], set()
    in_appendix = False
    for line in lines:
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            in_appendix = bool(re.match(r"Appendix A\b", m.group(2)))
            continue
        if not in_appendix:
            continue
        row = re.match(r"^\|\s*(D-\S+)\s*\|", line)
        if not row:
            continue
        did = row.group(1)
        ids.append(did)
        if not re.fullmatch(r"D-\d{2,}", did):
            problems.append(
                f"docs/ARCHITECTURE.md Appendix A row id '{did}' is malformed -- decision ids "
                "are D-NN (two or more digits); cross-references resolve by exact id."
            )
        elif did in seen:
            problems.append(
                f"docs/ARCHITECTURE.md Appendix A has DUPLICATE id {did} -- a duplicated "
                "D-number poisons every cross-reference. A supersede is a NEW row referencing "
                "the old one, never a reused id (and never an edit to match drift)."
            )
        seen.add(did)
    print(f"docs/ARCHITECTURE.md Appendix A: {len(ids)} D-NN row(s), {len(set(ids))} unique")


def check_roadmap(root, problems):
    path = root / "docs" / "ROADMAP.md"
    if not path.is_file():
        print("(skip: docs/ROADMAP.md not found)")
        return
    raw = path.read_text(encoding="utf-8", errors="replace").splitlines()
    print(f"docs/ROADMAP.md total: {len(raw)}/{ROADMAP_MAX_LINES} lines")
    if len(raw) > ROADMAP_MAX_LINES:
        problems.append(
            f"docs/ROADMAP.md is {len(raw)} lines (budget {ROADMAP_MAX_LINES}). "
            "The ROADMAP is the live plan, not an archive -- completed detail "
            "belongs in the tracker and git history."
        )
    lines = strip_code_fences(raw)
    for i, line in enumerate(lines):
        # Milestone ids: digit-or-dash after `M` (M0, M1.5, M-H) — the class
        # still rejects prose headings like "## Milestones" (letter there).
        m = re.match(r"^(#{2,4})\s+(M[\d-]\S*)", line)
        if not m:
            continue
        body = section_bounds(lines, i, len(m.group(1)))
        count = sum(1 for l in body if l.strip())
        name = m.group(2)
        print(f"docs/ROADMAP.md {name}: {count}/{MILESTONE_MAX_LINES} lines")
        if count > MILESTONE_MAX_LINES:
            problems.append(
                f"docs/ROADMAP.md milestone {name} has {count} non-blank lines "
                f"(budget {MILESTONE_MAX_LINES}). A milestone section is a state "
                "cache -- goal / slices / exit criterion / leverage / status -- "
                "not a session journal. Move narrative to the issue tracker; "
                "rewrite the Status line in place instead of appending."
            )
        wide = wide_lines(body)
        if wide:
            problems.append(
                f"docs/ROADMAP.md milestone {name} has {len(wide)} line(s) over {LINE_MAX_CHARS} "
                f"chars (longest {max(wide)}). A milestone line is a state cache, not a session "
                "journal -- the per-PR narrative belongs in the tracker; rewrite the line lean."
            )


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=".", help="repo root to audit (default: cwd)")
    args = ap.parse_args()
    root = Path(args.root)

    problems = []
    state_lines = check_status(root, problems)
    check_status_mixed(state_lines, problems)
    onboarded = bool(state_lines) and not any(placeholder_flags(state_lines))
    check_backlog(root, onboarded, problems)
    check_decision_log(root, onboarded, problems)
    check_roadmap(root, problems)

    if problems:
        print()
        for p in problems:
            print(f"DOC-BUDGET FAIL: {p}")
        print(f"\naudit_docs: {len(problems)} problem(s) -- a budget trip means narrative "
              "crept in (move it to the tracker); a state trip means a doc cache lies "
              "(fix the doc). Never fix the audit.")
        return 1
    print("audit_docs: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
