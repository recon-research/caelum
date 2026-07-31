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

The width budget (#232) is the count budget's horizontal twin: a line-count
cap REWARDS cramming -- each checkpoint appends to the same physical line and
the counter never moves (a downstream's milestone line hit 31,955 chars,
green on every count budget). So Status state lines and ROADMAP lines also
carry a per-line char cap; markdown table rows are exempt, and fenced code
arrives pre-blanked.

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
# Windows cp1252 stdout guard (#296): gate output carries non-ASCII
# (em-dashes, section signs, file text); a cp1252-strict console mojibakes
# or crashes an otherwise-green run. Uniform across every gate script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

STATUS_MAX_LINES = 15     # CLAUDE.md ## Status: non-blank, non-blockquote lines
MILESTONE_MAX_LINES = 30  # docs/ROADMAP.md: non-blank lines per milestone section
ROADMAP_MAX_LINES = 400   # docs/ROADMAP.md: total physical lines
LINE_MAX_CHARS = 700      # per physical line, Status state lines + ROADMAP; markdown
                          # table rows (|-leading) exempt -- the count budgets' blind
                          # spot is horizontal cramming (#232, hit live downstream)

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


def wide_lines(lines):
    """1-based (index, width) of over-budget lines. Table rows are exempt
    (legitimately wide); fence interiors arrive blanked from strip_code_fences."""
    return [(i + 1, len(ln)) for i, ln in enumerate(lines)
            if len(ln) > LINE_MAX_CHARS and not ln.lstrip().startswith("|")]


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
            state = [ln for ln in body if ln.strip() and not ln.lstrip().startswith(">")]
            widest = max((len(ln) for ln in state), default=0)
            print(f"CLAUDE.md Status block: {len(state)}/{STATUS_MAX_LINES} state lines "
                  f"| widest {widest}/{LINE_MAX_CHARS} chars")
            if len(state) > STATUS_MAX_LINES:
                problems.append(
                    f"CLAUDE.md ## Status has {len(state)} state lines (budget {STATUS_MAX_LINES}). "
                    "It is the 10-line summary -- detail lives in docs/ROADMAP.md and the "
                    "tracker, never here. Move narrative out; rewrite lines in place."
                )
            wide = wide_lines(state)
            if wide:
                problems.append(
                    f"CLAUDE.md ## Status has {len(wide)} state line(s) over {LINE_MAX_CHARS} "
                    f"chars (widest {max(w for _, w in wide)}). Journaling crept in "
                    "horizontally -- the width budget is the count budget's twin (#232): "
                    "move narrative to the tracker; rewrite the line lean."
                )
            return state
    print("(note: CLAUDE.md has no '## Status' heading -- status budget not checked)")
    return None


def placeholder_flags(state_lines):
    """Per-line: does the line carry a <placeholder> (outside inline code)?"""
    return [bool(PLACEHOLDER.search(CODE_SPAN.sub("", ln))) for ln in state_lines]


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


# #737: `source:` is the provenance stamp's PIN, so it has to name something
# checkable from ANY box -- a clone URL or an `owner/repo` slug. A bare filesystem
# path resolves on exactly one machine and reads as "upstream is unreachable"
# everywhere else: a downstream stamped `C:\Users\...\project_template`, and a
# later session concluded the template's tracker was out of reach and filed its
# findings into a local file -- beside a clone of that very repo, under an account
# it was already authenticated as. Nothing else on disk notices, which is what
# earns this a gate rather than another line of skill prose.
#
# Accepted trade-off, same shape as PLACEHOLDER's above: a deeper host slug
# (`group/subgroup/repo`) is character-for-character a relative path
# (`dir/sub/name`), so only two-segment slugs pass and deeper hosts stamp the
# clone URL -- which every host offers. Flagging a valid slug is a one-line fix;
# the ambiguity this gate exists to kill is not. The known miss runs the other
# way and is in the corpus: a two-segment relative path (`repos/template`) is
# indistinguishable from a slug and passes.
#
# `source_path:` is deliberately NOT checked: it is a box-local hint by design,
# so asserting that it resolves would fail on every machine but the stamping one.
REMOTE_SOURCE = re.compile(
    r"""^(?:
          [A-Za-z][A-Za-z0-9+.\-]*://\S+   # scheme://host/owner/repo
        | [^\s/\\@:]+@[^\s/\\:]+:\S+       # scp-style, e.g. git@host:owner/repo
        | [\w\-][\w.\-]*/[\w.\-]+          # owner/repo slug (leading dot excluded:
        )$""",                             # `../template` is a path, not a slug
    re.X,
)


def source_is_remote(value):
    """True iff a TEMPLATE_VERSION `source:` names something resolvable off the
    box that stamped it (#737). Pure -- the selftest corpus drives this."""
    return bool(REMOTE_SOURCE.match(value.strip()))


def check_template_stamp(root, onboarded, problems):
    """#737: a filled TEMPLATE_VERSION pins upstream by URL/slug, never by a path."""
    path = root / "TEMPLATE_VERSION"
    if not path.is_file():
        print("(skip: TEMPLATE_VERSION not found)")
        return
    value = ""
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("source:"):          # not source_path:, which is unchecked
            value = line.split(":", 1)[1].strip()
            break
    if not value or PLACEHOLDER.search(value):
        print("TEMPLATE_VERSION source: unstamped/placeholder -- not judged")
        return
    ok = source_is_remote(value)
    # Never echo the value: a stamped path is a machine path, and this repo's
    # name-leak gate exists because those get pasted into PR bodies (#728).
    print(f"TEMPLATE_VERSION source: {'resolvable remote' if ok else 'BARE PATH'}")
    if onboarded and not ok:
        problems.append(
            "TEMPLATE_VERSION `source:` is a filesystem path, not a resolvable remote -- "
            "it names a location that exists on one box, so every other session reads it "
            "as 'upstream is unreachable' and silently downgrades template syncs and "
            "pushed lessons to local files (#737). Stamp the clone URL or `owner/repo` "
            "slug -- `git -C <checkout> remote get-url origin` -- and keep the local "
            "path in `source_path:`, which this gate deliberately does not judge."
        )


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
    wide = wide_lines(lines)
    print(f"docs/ROADMAP.md widest line: "
          f"{max((len(ln) for ln in lines), default=0)}/{LINE_MAX_CHARS} chars")
    if wide:
        problems.append(
            f"docs/ROADMAP.md has {len(wide)} line(s) over {LINE_MAX_CHARS} chars "
            f"(first: line {wide[0][0]}, {wide[0][1]} chars). A status line is "
            "rewritten in place, never appended to -- the width budget is the count "
            "budget's horizontal twin (#232): move narrative to the tracker and "
            "write the line lean."
        )
    for i, line in enumerate(lines):
        # Milestone ids: digit-or-dash after `M` (M0, M1.5, M-H) — the class
        # still rejects prose headings like "## Milestones" (letter there).
        m = re.match(r"^(#{2,4})\s+(M[\d-]\S*)", line)
        if not m:
            continue
        body = section_bounds(lines, i, len(m.group(1)))
        count = sum(1 for ln in body if ln.strip())
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
    check_template_stamp(root, onboarded, problems)
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


# --- selftest (offline, side-effect-free; run by audit_ops_config) ------------
def selftest():
    """#737: the axis is *how a source is spelled*, and the fix that started this
    pinned exactly one point on it (a Windows drive path). Every spelling below is
    a real way a template source gets written down, each paired with the remote
    form it must NOT be confused with -- a deny corpus with no must-not-fire
    neighbours only proves the matcher is willing to say no (ANTI_PATTERNS "The
    Half-Closed Class")."""
    failed = 0

    def check(name, value, want_remote):
        nonlocal failed
        got = source_is_remote(value)
        ok = got == want_remote
        failed += 0 if ok else 1
        # Names and verdicts only -- fixtures are machine paths (#728).
        print(f"{'PASS' if ok else 'FAIL'} template-stamp: {name}"
              + ("" if ok else f" -> remote={got} (want {want_remote})"))

    # --- paths: one case per spelling, including the boring one ---
    check("windows drive path (the live sighting)",
          r"C:\Users\Recon\Documents\claude_projects\project_template", False)
    check("windows drive path, forward slashes",
          "C:/Users/Recon/claude_projects/project_template", False)
    check("windows UNC share", r"\\build01\shared\project_template", False)
    check("posix absolute", "/home/dev/claude/project_template", False)
    # The scp form is the one remote spelling with no `//`, so it is the branch
    # most easily widened into accepting paths; this pins the host slot.
    check("absolute path containing @ and : (scp look-alike)",
          "/srv/git@mirror:templates/project_template", False)
    check("home-relative", "~/claude/project_template", False)
    check("parent-relative", "../project_template", False)
    check("deeper relative path", "Documents/claude_projects/project_template", False)
    check("bare directory name -- the boring one", "project_template", False)

    # --- remotes: the must-not-fire neighbours, one per form ---
    check("https clone URL", "https://github.com/example/project_template", True)
    check("scp-style ssh remote", "git@github.com:example/project_template.git", True)
    check("ssh:// URL", "ssh://git@example.com/example/project_template.git", True)
    check("bare owner/repo slug", "example/project_template", True)
    check("slug carrying .git", "example/project_template.git", True)

    # The documented miss, asserted rather than hidden: a two-segment relative
    # path is character-for-character a slug, so it passes. Stated in the comment
    # above REMOTE_SOURCE; recorded here so a later widening notices it exists.
    check("KNOWN MISS: two-segment relative path reads as a slug",
          "repos/project_template", True)

    print(f"audit_docs selftest: {'FAILED' if failed else 'OK'} ({failed} failure(s))")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv[1:] else main())
