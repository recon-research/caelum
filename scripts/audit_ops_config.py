#!/usr/bin/env python3
"""audit_ops_config.py -- ops-config integrity (#71; exits non-zero).

The three-way mirror rule -- ci.yml <-> preflight.sh <-> preflight.ps1, stated
in all three file headers ("change one -> change the other") -- had zero
enforcement: a stage added to one and forgotten in another drifts silently
until a gate that "ran" locally never runs in CI (or vice versa). This script
is the enforcement:

  1. sh <-> ps1 exact mirror: the stage names defined by preflight.sh
     (`stage` / `skip_stage`) and preflight.ps1 (`Invoke-Stage` / `Skip-Stage`)
     must be string-identical sets. Gated on the declared shell posture
     (PREFLIGHT_SHELLS below, D-218): a single-shell project skips the mirror,
     drops the absent shell's file requirement and its check-4 site -- and
     FAILS on an undeclared script still on disk (unaudited machinery).
  2. preflight <-> ci.yml, in two rungs. The canonical stage-name ->
     step-name map is PREFLIGHT_TO_CI below -- single-homed HERE.
     (a) NAMES. A stage missing from the map, a map entry with no preflight
         stage, a mapped step absent from ci.yml, or a named ci.yml step that
         is neither mapped nor declared in CI_ONLY_STEPS all fail. Adding a
         stage anywhere forces an edit here or goes red -- that is the point.
         A DELIBERATE decline is one line instead of three deletions (#612):
         a stage declared in UNWIRED_STAGES (reason required) may be absent
         from any surface without going red, and the preflight runners query
         the same list (--unwired-stages) to report a still-present declared
         stage as UNWIRED -- a third state beside the SKIP placeholder.
     (b) COMMANDS (#729, intake #725). Names alone prove only that a gate
         EXISTS in three places, never that the three RUN the same thing:
         `audit_x.py --strict` locally against a bare `audit_x.py` in CI was
         green here for this script's whole life, and the gap runs the
         dangerous way -- the mirror is precisely why an agent believes
         "green preflight => green CI", and under the lighter postures the
         local run IS the merge gate. So each mapped stage's body is now
         resolved -- one level of shell-function dispatch in preflight.sh,
         the Invoke-Stage block in preflight.ps1, the step's `run:` in
         ci.yml -- and compared across every side. Repo-script invocations
         are compared WITH their flags, folding ci.yml's `working-directory`
         into the path and ignoring env; every other command is normalized
         and compared verbatim but not interpreted. Any pair that differs
         must be declared in MIRROR_DIVERGENCES with a reason and a
         fingerprint, so an undeclared difference, undeclared drift inside a
         declared pair, and a declaration whose divergence has gone all
         fail. What this does NOT do: understand inline shell, so equivalent
         spellings (`git diff --quiet` vs `--exit-code`) read as a
         divergence and get declared rather than proved equal.
  3. Settings sanity (ops config that must not rot): .claude/settings.json
     parses; every hook/statusLine command that references a repo file
     references one that exists; the deny tripwires (git push --force /
     gh pr merge --admin, in BOTH shells) are present.
  4. TODO-exemption mirror: the ':!' pathspec lists of the TODO-hygiene
     enforcement sites (TODO_EXEMPTION_SITES below -- a porting surface)
     must be identical sets -- the hook drifted when the other sites gained
     exemptions and blocked a legitimate commit downstream (#104).
  5. if-mirror (#213): the heavy-gate job's `if:` must be exactly
     `always() && (<changes.if>)`, compared as normalized strings. The pair
     was comment-enforced only; drift fails UNSAFE and silently -- widen
     changes.if without widening heavy-gate.if and the zero-coverage hole
     #206 closed reopens in the new condition slice with no red anywhere.
  6. interpreter spelling (D-210, #262): no bare-`python`-plus-whitespace
     invocation in the executable machinery (scripts/, hooks, workflows).
     Bare Ubuntu 24.04+ ships no `python`; dev boxes mask the defect via
     python-is-python3, and downstreams re-patched it on every sync.
  8. intra-module call arity (#746, from #739): a call to a module-level
     function defined in the SAME file must be able to bind that signature.
     #739 shipped `format_findings(hits)` against a 2-parameter def -- a
     TypeError on a gate's FAIL path, green for a day because that path runs
     only when the tree is dirty. No tool in this toolchain catches it (ruff
     implements no arity rule; pylint/mypy absent) and no fixture can, since
     a selftest driving the pure function never executes its caller. Measured,
     not assumed: with all five reporters fixtured, two of four wrong-caller
     mutations were still caught by nothing at all.
  7. rules frontmatter (#307): every .claude/rules/*.md that declares
     `paths:` carries >=1 non-empty glob entry, no tabs, and a terminated
     frontmatter block -- an invalid/empty glob matches nothing (v2.1.207
     semantics) and the rule goes silently dark: the skills-catalog
     silent-load class, for rules.

Mirrored three ways itself: ci.yml > static gates > "Ops-config audit" ==
preflight.{sh,ps1} "ops-config audit" stage (the map below includes it).
"""
import argparse
import ast
import hashlib
import io
import json
import os
import posixpath
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import project_posture  # noqa: E402  (#679: sibling module, same dir)
# Windows cp1252 stdout guard (#296): gate output carries non-ASCII
# (em-dashes, section signs, file text); a cp1252-strict console mojibakes
# or crashes an otherwise-green run. Uniform across every gate script.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# The canonical preflight-stage -> ci.yml-step map. Single-homed: when you add,
# rename, or drop a gate, this dict is the third file you must touch (after the
# two preflights or ci.yml) -- the audit goes red until all three agree.
PREFLIGHT_TO_CI = {
    "format --check": "Format check",
    "lint (adapter isolation + angular-eslint)": "Lint (adapter isolation + angular-eslint)",
    "build library (+ post-build package gates)": "Build library (+ post-build package gates)",
    "build Forge (production budgets)": "Build Forge (production budgets)",
    "test (caelum + Forge)": "Test (caelum + Forge)",
    "test scripts (node --test)": "Test scripts (node --test)",
    "test (real browser)": "Test (real browser)",
    "test (visual regression)": "Test (visual regression)",
    "library audits": "Library audits (refs / routing / links)",
    "research audit": "Research audit (citations / structure / links)",
    "provenance (deps license + US-origin, D-11)": "Dependency provenance (license + US-origin, D-11)",
    "theming scan (D-04 token-only)": "Theming scan (D-04 token-only)",
    "capability ledger (evidence-gated done)": "Capability ledger (evidence-gated done)",
    "parity map (COMPARISON tracking refs)": "Parity-map audit (COMPARISON tracking refs)",
    "doc budgets": "Doc budgets (anti-drift)",
    "ops-config audit": "Ops-config audit (preflight/CI mirror, settings sanity)",
    "shellcheck": "Shellcheck (shebang-discovered shell)",
    "repo-docs links": "Repo-docs link audit (root/docs/.claude/_intake)",
    "name-leak audit": "Name-leak audit (registry-fed, shipped machinery)",
    "secret scan": "Secret scan (tracked files, named patterns)",
    "staleness audit (warn-only)": "Staleness audit (content drift, warn-only)",
    "skill evals": "Skill evals (goldens fresh + green)",
    "closing keywords": "Closing-keyword audit (undeclared closing refs)",
    "todo hygiene (merge-base->worktree)": "No naked TODO/FIXME in added lines",
    "commit-msg semantics (vs origin/main)": "Commit-message semantics",
}

# Named ci.yml steps with deliberately no preflight stage. Everything else
# named in ci.yml must be a PREFLIGHT_TO_CI value.
CI_ONLY_STEPS = {
    "Install",                 # `npm ci` per-job; preflight runs in the already-set-up dev env
    "Aggregate heavy results", # heavy-gate aggregation (#206) reads CI job results; nothing to mirror locally
    "PR references a ticket",  # ticket-first gate (#75) is PR-only by nature; preflight runs pre-PR
    "Upload visual-regression diffs",  # failure-only artifact upload (#732); locally the diffs are already on disk
    # "Skills are directories" dropped at the 2026-07-30 sync: the flat-skill
    # guard relocated into textbooks/tools/_audit_routing.py (upstream ff071b7,
    # #647 case study) and now runs in both worlds via the library-audits stage.
}

# Stages this project has DELIBERATELY declined -- the sanctioned opt-out for
# conditionally-applicable gates (#612; the per-feature adoption notes in
# README.md say which features ship expecting it). A PROJECT-MIRRORED
# constant, same terms as MIRROR_DIVERGENCES: downstream this is YOUR list,
# upstream ships it empty (roster: SYNC_REFERENCE.md -- a verbatim sync copy
# silently wipes your declines). One line is the whole decline under a
# posture whose merge gate is the local preflight: check 2a tolerates the
# stage's absence from preflight.sh / preflight.ps1 / ci.yml in any
# combination, and while the files still carry it (kept byte-identical to
# upstream for sync's sake) both runners query this list (--unwired-stages)
# and report the stage UNWIRED at run time. Under LIVE CI the declined step
# still runs and can still fail there -- that decline is this line PLUS the
# ci.yml step deletion, re-applied at sync; and a stage with a
# MIRROR_DIVERGENCES entry keeps that entry's obligations until you delete
# them together. UNWIRED is a THIRD state, deliberately distinct from the
# SKIP placeholder: declined is not unconfigured, configure_project must
# never "fill" it, and onboard's placeholder-green-is-red check keeps
# discriminating. The value is the REQUIRED one-line reason ("why is this
# off?" is the question every later sync re-asks); red when empty, when it
# carries a newline/tab (the query is TSV), when the key is unknown to
# PREFLIGHT_TO_CI (typo / stale after an upstream rename), or when it names
# 'ops-config audit' (the auditor may not excuse itself). The audit does NOT
# rank which OTHER gates deserve declining -- that judgment is the owner's,
# surfaced by this line appearing in a PR diff with its reason.
UNWIRED_STAGES = {
    "name-leak audit": "leaf downstream, no Downstream-registry issue (#469 adoption note); script declined via .claude/project.json unadopted",
    "skill evals": "goldens are skill-text-coupled and Caelum carries local edits to gated skills (#472 adoption note); re-authoring tracked in #904",
}

# Mapped pairs whose three sides legitimately do NOT run the same commands
# (check 2b, #729). A PROJECT-MIRRORED constant, same terms as PREFLIGHT_TO_CI:
# downstream this is YOUR list of deliberate differences, reconciled at sync,
# never copied from upstream.
#
# `why` is for the human; `fingerprint` is what makes the entry a declaration
# rather than a permanent exemption -- it pins the exact divergence, so drift
# INSIDE a declared pair still goes red. Without it the two messiest stages in
# the repo (the ones with the most hand-maintained parallel shell, i.e. exactly
# where drift is likeliest) would get a lifetime pass, which is the hole #729
# exists to close, merely narrowed. Re-stamp deliberately: the audit prints the
# new fingerprint when a declared pair changes, and seeing that line is your cue
# to re-read both sides, not to paste the hash.
MIRROR_DIVERGENCES = {
    "library audits": {
        "why": "The four tool invocations DO match -- CI runs them with "
               "`working-directory: textbooks`, which check 2b folds into the "
               "path before comparing, and its PYTHONIOENCODING/PYTHONUTF8 env "
               "is ignored by design. What differs is the staleness guard "
               "between them: preflight asks `git diff --quiet`, CI asks "
               "`git diff --exit-code` (and against a workdir-relative path). "
               "Equivalent -- both exit non-zero on a dirty index, and neither "
               "prints the diff -- but inline shell is normalized, not "
               "interpreted, so the audit cannot know that and says so here.",
        "fingerprint": "d8d9f3c3445f",
    },
    "todo hygiene (merge-base->worktree)": {
        "why": "Zero script invocations on any side -- all three implement the "
               "detector in inline shell, so check 2b compares nothing here and "
               "this entry is what says so out loud. The windows differ BY "
               "DESIGN (#556): preflight diffs merge-base->worktree PLUS "
               "untracked files (where a formatter creates a naked marker on a "
               "tree whose commit would go red), CI diffs the committed PR "
               "range. sh and ps1 differ again in mechanism -- grep/sed pipeline "
               "vs Where-Object with the ticketed form as a negative lookahead. "
               "The part that actually drifted in the field is the pathspec "
               "exemption list (#104), and check 4 pins that across all four "
               "sites as string-identical sets -- a stronger check than this "
               "one, on the surface that moves.",
        "fingerprint": "b595ae76ca41",
    },
    "commit-msg semantics (vs origin/main)": {
        "why": "All three sides run scripts/check_commit_msgs.py; CI alone passes an "
               "explicit range (origin/<base_ref>..HEAD) plus a preceding fetch of the "
               "base ref, because a PR checkout has no local origin/main and the base "
               "may not be main. The shells rely on the script's default "
               "origin/main..HEAD -- same window in the dev env by construction.",
        "fingerprint": "41c9a68e5737",
    },
}

# The preflight shells this project actually ships (D-218, from harvest #208).
# A PROJECT-MIRRORED constant on the hook-EXEMPT pattern (#135): configure_project
# sets it from the stack, update_from_template preserves YOUR value through syncs,
# and harvest lens 1 filters it as an expected delta. A single-shell project
# declares its real set -- ("sh",) or ("ps1",) -- and DELETES the dead mirror
# script; the missing-file gate, check 1's mirror, and check 4's site list all
# condition on this. An undeclared script still on disk is a failure: unaudited
# machinery -- declare it or delete it.
PREFLIGHT_SHELLS = ("sh", "ps1")

# Shell key -> the preflight script that declares it (repo-relative); doubles
# as the check-4 site dropped when that shell is undeclared.
SHELL_SITES = {"sh": Path("scripts/preflight.sh"), "ps1": Path("scripts/preflight.ps1")}

# The TODO-hygiene enforcement sites whose quoted ':!' exemption pathspecs
# must stay string-identical sets (check 4, #104). PORTING SURFACE (#123),
# like the map above: downstream, this list = YOUR enforcement sites -- a
# site you don't have is not a site to audit; and if your sites use
# different exemption semantics (e.g. working-tree roots + name exemptions
# instead of ':!' pathspecs), adapting or dropping this check is expected,
# not a missed port. The hook entry is the site most likely to lag: syncs
# tend to touch preflight/ci together and miss it.
TODO_EXEMPTION_SITES = (
    Path("scripts/preflight.sh"),
    Path("scripts/preflight.ps1"),
    Path(".github/workflows/ci.yml"),
    Path(".claude/hooks/block_naked_todos.py"),
)

# The mirrored job-`if:` pair (check 5, #213): heavy-gate must fire exactly
# when the heavy matrix can. PORTING SURFACE, same terms as the tuple above:
# a downstream that restructured ci.yml (dropped the aggregate, renamed the
# classifier) adapts or drops this check -- both jobs absent is a skip, not
# a failure; HALF the pair present is always a failure.
IF_MIRROR_JOBS = ("changes", "heavy-gate")

# The two deny tripwires the shipped settings must keep, in both shell tools
# (prefix match -- the shipped rules carry a :* suffix).
DENY_TRIPWIRES = ("git push --force", "gh pr merge --admin")
SHELLS = ("Bash", "PowerShell")


def read(path):
    return path.read_text(encoding="utf-8", errors="replace")


def parse_sh_stages(path):
    # `stage "name"` / `skip_stage "name"` (either quote style — both are legal
    # sh and a downstream's style must not zero the parse), plus Caelum's
    # Node-gated wrapper `run_if_node "name" cmd` (project deviation #15 — the
    # Node stages only run with $HOME/nodejs on PATH) and the browser-gated
    # `run_if_browser "name" cmd` (#240 — skips when no Playwright build is
    # installed). The wrappers' own bodies call `stage "$name"` /
    # `skip_stage "$name"` with a variable, so names containing `$` are filtered.
    names = re.findall(
        r'''^\s*(?:skip_stage|stage|run_if_node|run_if_browser)\s+['"]([^'"]+)['"]''', read(path), re.M
    )
    return [n for n in names if "$" not in n]


def parse_ps1_stages(path):
    # `Invoke-Stage 'name'` / `Skip-Stage 'name'` (either quote style, as
    # above), plus Caelum's gated wrappers `Invoke-StageIfNode` (#15) and
    # `Invoke-StageIfBrowser` (#240). The wrapper bodies call `Invoke-Stage
    # $Name` with a variable -> `$` filtered. Longest alternative FIRST:
    # `Invoke-Stage` would match the prefix of the others and then fail on \s+.
    names = re.findall(
        r"""^\s*(?:Invoke-StageIfBrowser|Invoke-StageIfNode|Invoke-Stage|Skip-Stage)\s+['"]([^'"]+)['"]""",
        read(path),
        re.M,
    )
    return [n for n in names if "$" not in n]


def parse_ci_steps(path):
    # Step names only (`- name: X`); job- and workflow-level `name:` lines
    # have no leading dash, commented-out steps start with '#'.
    names = re.findall(r"^\s*-\s+name:\s*(.+?)\s*$", read(path), re.M)
    return [n.strip("'\"") for n in names]


def check_mirror(sh_stages, ps1_stages, problems):
    sh, ps1 = set(sh_stages), set(ps1_stages)
    print(f"preflight.sh stages: {len(sh)} | preflight.ps1 stages: {len(ps1)}")
    for name in sorted(sh - ps1):
        problems.append(
            f"stage '{name}' exists in preflight.sh but not preflight.ps1 -- "
            "the two scripts must define string-identical stage names."
        )
    for name in sorted(ps1 - sh):
        problems.append(
            f"stage '{name}' exists in preflight.ps1 but not preflight.sh -- "
            "the two scripts must define string-identical stage names."
        )


def unwired_problems(unwired, canon):
    """UNWIRED_STAGES validity (#612): every declared decline names a canonical
    stage and carries its one-line reason. Pure; the selftest drives it."""
    out = []
    for name in sorted(set(unwired) - set(canon)):
        out.append(
            f"UNWIRED_STAGES declares '{name}', which is not a PREFLIGHT_TO_CI stage -- "
            "a typo, or the stage was renamed/removed upstream and this declaration is "
            "stale (#612). Fix the name (the renaming sync's PREFLIGHT_TO_CI diff names "
            "the successor) or delete the entry."
        )
    if "ops-config audit" in unwired:
        out.append(
            "UNWIRED_STAGES declares 'ops-config audit' -- the auditor may not excuse "
            "itself: this stage is the only local runner of the validity gate that "
            "polices UNWIRED_STAGES, so a self-decline turns every ops-config check "
            "dark with nothing left to say so (#612)."
        )
    for name in sorted(unwired):
        reason = unwired[name]
        if not (isinstance(reason, str) and reason.strip()):
            out.append(
                f"UNWIRED_STAGES entry '{name}' carries no reason -- the one-line why is "
                "required: a bare decline is silent scope loss, the question every later "
                "sync re-asks (#612)."
            )
        elif any(c in reason for c in "\n\r\t"):
            out.append(
                f"UNWIRED_STAGES entry '{name}' has a newline/tab in its reason -- the "
                "--unwired-stages query is line-oriented TSV and a control character "
                "corrupts it (a newline can even mark an UNDECLARED stage unwired on "
                "the sh side): keep the reason one plain line (#612)."
            )
    return out


def check_ci_map(preflight_stages, ci_steps, problems, unwired=None, canon=None):
    # unwired/canon default to the module constants; the selftest passes
    # fixtures (#612) -- same pattern as the citation checks' `exists` hook.
    unwired = UNWIRED_STAGES if unwired is None else unwired
    canon = PREFLIGHT_TO_CI if canon is None else canon
    ci = set(ci_steps)
    print(f"ci.yml named steps: {len(ci)} | canonical map entries: {len(canon)}"
          + (f" | unwired (declared): {len(unwired)}" if unwired else ""))
    for name in sorted(preflight_stages - set(canon)):
        problems.append(
            f"preflight stage '{name}' is not in PREFLIGHT_TO_CI -- add it to the "
            "map (and to ci.yml) or remove the stage; a new gate touches all three files."
        )
    for name in sorted(set(canon) - preflight_stages - set(unwired)):
        problems.append(
            f"PREFLIGHT_TO_CI maps stage '{name}' but no preflight script defines it -- "
            "stale map entry or a stage was renamed/removed in only some files "
            "(a deliberate decline is an UNWIRED_STAGES entry, #612)."
        )
    for stage_name, step in sorted(canon.items()):
        if step not in ci and stage_name not in unwired:
            problems.append(
                f"stage '{stage_name}' maps to ci.yml step '{step}', which ci.yml does not "
                "define -- the gate runs locally but never in CI."
            )
    for step in sorted(ci - set(canon.values()) - CI_ONLY_STEPS):
        problems.append(
            f"ci.yml step '{step}' is neither mapped from a preflight stage nor declared "
            "in CI_ONLY_STEPS -- the gate runs in CI but never locally (or the map is stale)."
        )


# --- check 2b: the mapped pairs run the same commands, not just the same names
# (#729, intake #725) --------------------------------------------------------
#
# Fragment leads that are control flow or diagnostics, never a gate. Kept TIGHT
# on purpose: everything not listed here is recorded as `uncompared` rather than
# dropped, so a construct this parser cannot read shows up in the fingerprint
# instead of vanishing from it. `local`/`$var =` assignments are deliberately
# NOT here -- an assignment can wrap a real invocation.
NOISE_LEADS = frozenset({
    "echo", "printf", "Write-Host", "Write-Output",
    "if", "then", "elif", "else", "fi", "do", "done", "while", "for", "foreach",
    "return", "exit", "break", "continue", "true", "false", ":", "[", "[[", "]]", "]",
    "{", "}",
})
# Operators that end one command and start the next. `(` and `)` are absent on
# purpose: splitting there shreds `if ($LASTEXITCODE -ne 0)` into a fragment
# whose lead is a variable, which would read as an uncompared command.
FRAGMENT_SPLITS = frozenset({";", "|", "||", "&", "&&"})


def _fragments(body):
    """Token lists, one per shell fragment, line by line.

    A line the tokenizer cannot read (unbalanced quotes) yields a single
    `<unparseable>` fragment rather than nothing -- silence here would read as
    'the two sides agree' at exactly the moment the parser gave up.
    """
    out = []
    for line in re.sub(r"\\\n\s*", " ", body).split("\n"):
        if not line.strip():
            continue
        try:
            lex = shlex.shlex(line, posix=True, punctuation_chars=True)
            lex.whitespace_split = True
            tokens = list(lex)
        except ValueError:
            out.append(["<unparseable>", line.strip()])
            continue
        cur = []
        for tok in tokens:
            if tok in FRAGMENT_SPLITS:
                if cur:
                    out.append(cur)
                cur = []
            else:
                cur.append(tok)
        if cur:
            out.append(cur)
    return out


def extract_commands(body, workdir=""):
    """One side's commands -> (invocations, uncompared). Pure (#319).

    `invocations` are repo-script runs (`python3 <path> [args]`) normalized with
    their flags, with `workdir` -- ci.yml's `working-directory` -- folded into
    the path so CI's `tools/_audit_refs.py` under `working-directory: textbooks`
    compares equal to preflight's `textbooks/tools/_audit_refs.py`. This bucket
    is the whole reason the check can ignore the wrapper: it is where a drifted
    `--strict` shows up.

    `uncompared` is every other command -- inline git/sed/grep, a downstream's
    `cargo test` -- normalized (whitespace- and quoting-insensitive) but NOT
    interpreted. It is still COMPARED across sides; the name means this parser
    does not claim to understand it. A green run therefore means 'no provable
    divergence', never 'no divergence' -- same conservatism as check 8.
    """
    invocations, uncompared = [], []
    for tokens in _fragments(body):
        while tokens and tokens[0] in ("{", "}"):
            tokens = tokens[1:]
        if not tokens or tokens[0] in NOISE_LEADS:
            continue
        if tokens[0] == "python3" and any(t.endswith(".py") for t in tokens[1:]):
            invocations.append("python3 " + " ".join(
                posixpath.normpath(posixpath.join(workdir, t))
                if workdir and t.endswith(".py") and not t.startswith("/") else t
                for t in tokens[1:]))
        else:
            uncompared.append(" ".join(tokens))
    return tuple(invocations), tuple(uncompared)


def _sh_functions(text):
    """{name: body} for top-level `name() {` .. `}` definitions in sh."""
    funcs, lines = {}, text.split("\n")
    for i, line in enumerate(lines):
        m = re.match(r"^(\w+)\(\)\s*\{\s*$", line)
        if not m:
            continue
        body = []
        for ln in lines[i + 1:]:
            if ln.rstrip() == "}":
                break
            body.append(ln)
        funcs[m.group(1)] = "\n".join(body)
    return funcs


def sh_stage_bodies(text):
    """{stage name: command text} from preflight.sh, resolving ONE level of
    shell-function dispatch (`stage "library audits" library_audits`). A
    `skip_stage` placeholder has no command, hence the empty body -- which
    compares equal to ci.yml's `echo "SKIP (unconfigured): ..."` placeholder,
    since echo is diagnostics. That is what keeps a freshly-templated repo
    green while still failing the moment one side alone is filled in (#361).
    """
    funcs = _sh_functions(text)
    out = {}
    for m in re.finditer(r"""^[ \t]*(skip_)?stage[ \t]+(['"])(.+?)\2(.*)$""", text, re.M):
        skip, _, name, rest = m.groups()
        rest = rest.strip()
        out[name] = "" if skip else funcs.get(rest, rest)
    return out


def _brace_body(text, start):
    """Text inside the `{...}` opening at `start`, quote- and comment-aware.

    The comment skip is load-bearing, not defensive: preflight.ps1's stage
    blocks carry comments containing apostrophes ("ci.yml's hygiene step"), and
    a naive quote tracker reads that as an opening quote and swallows the
    closing brace -- silently returning the REST OF THE FILE as the stage body.
    """
    depth, quote, i = 0, "", start
    while i < len(text):
        c = text[i]
        if quote:
            if c == quote:
                quote = ""
        elif c == "#":
            nl = text.find("\n", i)
            i = len(text) if nl == -1 else nl
            continue
        elif c in "'\"":
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:i]
        i += 1
    return text[start + 1:]


def ps1_stage_bodies(text):
    """{stage name: command text} from preflight.ps1's Invoke-Stage blocks."""
    out = {}
    for m in re.finditer(r"""^[ \t]*(Skip|Invoke)-Stage[ \t]+(['"])(.+?)\2""", text, re.M):
        kind, _, name = m.groups()
        brace = -1 if kind == "Skip" else text.find("{", m.end())
        out[name] = "" if brace == -1 else _brace_body(text, brace)
    return out


def ci_step_bodies(text):
    """{step name: (run body, working-directory)} from ci.yml.

    Hand-parsed rather than via a YAML library: this gate must run on a bare
    interpreter with no third-party imports (it is the gate that guards the
    other gates), and the neighbouring checks already read ci.yml this way.
    """
    lines, steps, i = text.split("\n"), {}, 0
    while i < len(lines):
        m = re.match(r"^([ \t]*)-[ \t]+name:[ \t]*(.+?)[ \t]*$", lines[i])
        if not m:
            i += 1
            continue
        indent = len(m.group(1))
        block, j = [], i + 1
        while j < len(lines):
            ln = lines[j]
            if ln.strip() and len(ln) - len(ln.lstrip()) <= indent:
                break
            block.append(ln)
            j += 1
        steps[m.group(2).strip("'\"")] = _ci_run(block)
        i = j
    return steps


def _ci_run(block):
    workdir, run, k = "", "", 0
    while k < len(block):
        w = re.match(r"^[ \t]*working-directory:[ \t]*(.+?)[ \t]*$", block[k])
        if w:
            workdir = w.group(1).strip("'\"")
        r = re.match(r"^([ \t]*)run:[ \t]*(.*)$", block[k])
        if r:
            pad, inline = len(r.group(1)), r.group(2).strip()
            if inline in ("|", "|-", "|+", ">", ">-"):
                body, k2 = [], k + 1
                while k2 < len(block):
                    if block[k2].strip() and len(block[k2]) - len(block[k2].lstrip()) <= pad:
                        break
                    body.append(block[k2])
                    k2 += 1
                cut = min((len(b) - len(b.lstrip()) for b in body if b.strip()), default=0)
                run, k = "\n".join(b[cut:] for b in body), k2
                continue
            # A YAML-quoted scalar: strip the MATCHING outer pair only. Stripping
            # any quote character instead (`.strip("'\"")`) eats the inner closing
            # quote of `'echo "SKIP: ..."'` and hands the tokenizer an unbalanced
            # line -- every placeholder step then reads as an unparseable command.
            if len(inline) >= 2 and inline[0] == inline[-1] and inline[0] in "'\"":
                inline = inline[1:-1]
            run = inline
        k += 1
    return run, workdir


def mirror_fingerprint(sides):
    """A stable short digest of one stage's extracted commands, all sides."""
    payload = {k: {"inv": list(v[0]), "unc": list(v[1])} for k, v in sorted(sides.items())}
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:12]


def mirror_verdict(sides, declared):
    """One mapped stage's verdict (#729). Pure -- the caller does the IO.

    match      every side extracted identically, undeclared -- the ordinary case
    declared   sides differ, and the declaration pins this exact divergence
    undeclared sides differ with nothing declared -- the gap #729 closed
    drifted    declared, but the divergence is no longer the declared one
    stale      declared, yet the sides now agree -- the declaration outlived it
    """
    if len({(inv, unc) for inv, unc in sides.values()}) <= 1:
        return "stale" if declared else "match"
    if not declared:
        return "undeclared"
    return "declared" if declared.get("fingerprint") == mirror_fingerprint(sides) else "drifted"


def mirror_detail(sides):
    """The per-side commands, for a report a human can act on without re-deriving."""
    out = []
    for label, (inv, unc) in sorted(sides.items()):
        out.append(f"      {label}: " + ("; ".join(inv) if inv else "(no script invocations)")
                   + (f"  [uncompared: {'; '.join(unc)}]" if unc else ""))
    return "\n".join(out)


def check_mirror_commands(shell_paths, ci_path, problems):
    sides_by_stage, ci = {}, ci_step_bodies(read(ci_path))
    bodies = {}
    if "sh" in PREFLIGHT_SHELLS:
        bodies["preflight.sh"] = (sh_stage_bodies(read(shell_paths["sh"])), "")
    if "ps1" in PREFLIGHT_SHELLS:
        bodies["preflight.ps1"] = (ps1_stage_bodies(read(shell_paths["ps1"])), "")
    for stage, step in PREFLIGHT_TO_CI.items():
        sides = {label: extract_commands(stages[stage], workdir)
                 for label, (stages, workdir) in bodies.items() if stage in stages}
        if step in ci:
            sides["ci.yml"] = extract_commands(*ci[step])
        # A side that doesn't define the stage at all is check 2a's finding, not
        # this one's -- reporting it twice buries the clearer message.
        if len(sides) > 1:
            sides_by_stage[stage] = sides
    declared_count = 0
    for stage, sides in sorted(sides_by_stage.items()):
        declared = MIRROR_DIVERGENCES.get(stage)
        verdict = mirror_verdict(sides, declared)
        if verdict == "declared":
            declared_count += 1
        elif verdict == "undeclared":
            problems.append(
                f"stage '{stage}' does not run the same commands on every side -- names "
                "match but the commands do not, which is the drift check 2a cannot see "
                "(#729). Fix the odd side out, or, if the difference is deliberate, add "
                f"an entry to MIRROR_DIVERGENCES with a reason and fingerprint "
                f"{mirror_fingerprint(sides)}:\n" + mirror_detail(sides))
        elif verdict == "drifted":
            problems.append(
                f"stage '{stage}' is declared in MIRROR_DIVERGENCES, but its divergence "
                f"has changed (declared {declared.get('fingerprint')!r}, now "
                f"{mirror_fingerprint(sides)!r}) -- re-read all sides, update `why`, then "
                "re-stamp the fingerprint (#729):\n" + mirror_detail(sides))
        elif verdict == "stale":
            problems.append(
                f"MIRROR_DIVERGENCES declares '{stage}' divergent but every side now runs "
                "the same commands -- delete the entry (a declaration nobody deletes is "
                "how the next real divergence lands green, #729).")
    for stage in sorted(set(MIRROR_DIVERGENCES) - set(sides_by_stage)):
        problems.append(
            f"MIRROR_DIVERGENCES declares '{stage}', which is not a comparable mapped "
            "stage -- a renamed or removed stage leaves its declaration behind (#729).")
    print(f"mirror commands: {len(sides_by_stage)} mapped stage(s) compared "
          f"| {declared_count} declared divergence(s)")


def check_todo_exemptions(root, problems):
    # Every quoted ':!...' token in these files belongs to the TODO-hygiene
    # exemption list (verified at #104); an unrelated ':!' pathspec landing in
    # one of them later fails loudly here -- adjust this parser then, not the rule.
    undeclared = {p for shell, p in SHELL_SITES.items() if shell not in PREFLIGHT_SHELLS}
    sites = [s for s in TODO_EXEMPTION_SITES if s not in undeclared]
    specs = {}
    for site in sites:
        path = root / site
        if not path.is_file():
            problems.append(f"ops-config file missing: {path}")
            return
        specs[str(site)] = set(re.findall(r"""['"](:![^'"\n]+)['"]""", read(path)))
    union = set().union(*specs.values())
    dropped = sorted(str(p) for p in undeclared if p in TODO_EXEMPTION_SITES)
    note = f" (shell undeclared, site dropped: {', '.join(dropped)})" if dropped else ""
    print(f"TODO-exemption pathspecs: {len(union)} distinct across {len(sites)} sites{note}")
    for name, found in sorted(specs.items()):
        for spec in sorted(union - found):
            problems.append(
                f"TODO-hygiene exemption \"{spec}\" is missing from {name} -- the "
                f"{len(sites)} enforcement sites must carry an identical "
                "pathspec list; a drifted site blocks (or waves through) what the "
                "others don't (#104)."
            )


def parse_job_if(ci_text, job):
    # The JOB-level `if:` only: the job key sits at 2-space indent, its `if:`
    # at 4 -- step-level `if:` lines sit deeper and never match the anchor.
    # Handles both the folded (`if: >-` + continuation lines) and single-line
    # spellings, so a downstream reformat doesn't zero the parse.
    m = re.search(rf"^  {re.escape(job)}:\n((?:^(?: {{4,}}\S.*|\s*)\n)*)", ci_text, re.M)
    if not m:
        return None
    body = m.group(1)
    folded = re.search(r"^    if:\s*>-?\s*\n((?:^ {6,}\S.*\n)+)", body, re.M)
    if folded:
        return " ".join(folded.group(1).split())
    single = re.search(r"^    if:\s*(\S.*?)\s*$", body, re.M)
    return " ".join(single.group(1).split()) if single else None


def strip_always_wrapper(expr):
    # `always() && (X)` -> `X`. Unwrap the parens only when the leading one is
    # the pair the trailing one closes (depth never returns to 0 mid-string) --
    # `(A) || (B)` must not lose its structure.
    inner = re.sub(r"^always\(\)\s*&&\s*", "", expr)
    if inner.startswith("(") and inner.endswith(")"):
        depth = 0
        for i, ch in enumerate(inner):
            depth += ch == "("
            depth -= ch == ")"
            if depth == 0 and i < len(inner) - 1:
                return inner
        return inner[1:-1].strip()
    return inner


def check_if_mirror(ci_path, problems):
    text = read(ci_path)
    changes_job, gate_job = IF_MIRROR_JOBS
    changes_if = parse_job_if(text, changes_job)
    gate_if = parse_job_if(text, gate_job)
    if changes_if is None and gate_if is None:
        print(f"if-mirror: neither '{changes_job}' nor '{gate_job}' defines a job "
              "if -- pattern absent, check skipped (porting surface, see IF_MIRROR_JOBS)")
        return
    if changes_if is None or gate_if is None:
        missing = changes_job if changes_if is None else gate_job
        problems.append(
            f"if-mirror: job '{missing}' has no parseable job-level `if:` while its "
            f"partner does -- the pair must gate together or the aggregate fires (or "
            f"skips) in conditions the heavy matrix doesn't share (#213)."
        )
        return
    gate_core = strip_always_wrapper(gate_if)
    ok = True
    if not gate_if.startswith("always()"):
        ok = False
        problems.append(
            f"if-mirror: '{gate_job}' if must start with `always() &&` -- without it "
            "a FAILED heavy job skips the aggregate instead of failing it, and the "
            "gate can never go red (#206)."
        )
    if gate_core != changes_if:
        ok = False
        problems.append(
            f"if-mirror: '{gate_job}' if is not `always() && (<{changes_job}.if>)` -- "
            f"the two condition sets have drifted. A condition present in "
            f"'{changes_job}' but not the gate reopens the #206 zero-coverage hole in "
            f"that slice, silently. Normalized: {changes_job}={changes_if!r} vs "
            f"{gate_job}-core={gate_core!r} (#213)."
        )
    if ok:
        print(f"if-mirror: '{gate_job}'.if == always() && (<'{changes_job}'.if>) -- OK")


def check_settings(path, root, problems):
    try:
        data = json.loads(read(path))
    except json.JSONDecodeError as e:
        problems.append(
            f"{path.name} does not parse as JSON ({e}) -- a malformed settings file "
            "silently disables EVERY rule and hook in it."
        )
        return
    print(f"{path.name}: parses OK")

    commands = []
    for entries in (data.get("hooks") or {}).values():
        for entry in entries:
            for hook in entry.get("hooks", []):
                if hook.get("type") == "command" and hook.get("command"):
                    commands.append(hook["command"])
    status_line = (data.get("statusLine") or {}).get("command")
    if status_line:
        commands.append(status_line)

    checked = 0
    for cmd in commands:
        # #466 (intake #465, hit live): a registered-but-missing hook hard-blocks
        # every shell call, self-trapping the session -- so EVERY registration
        # spelling must resolve here, not just the shipped set's. Cover braced /
        # unbraced / Windows env forms; capture stops at whitespace or a quote,
        # so a path with spaces flags loudly as missing (conservative by design).
        paths = re.findall(
            r"(?:\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR\b|%CLAUDE_PROJECT_DIR%)"
            r"[\\/]([^\"'\s]+)", cmd)
        for tok in cmd.split():
            tok = tok.strip("\"'")
            if "$" not in tok and "%" not in tok and tok.endswith(".py") \
                    and ("/" in tok or "\\" in tok):
                paths.append(tok)
        for rel in paths:
            checked += 1
            if not (root / rel.replace("\\", "/")).is_file():
                problems.append(
                    f"settings command references '{rel}' but that file does not exist -- "
                    f"the hook/statusLine fails silently every time it fires. Command: {cmd}"
                )
    print(f"hook/statusLine repo-file references checked: {checked}")

    deny = (data.get("permissions") or {}).get("deny") or []
    for shell in SHELLS:
        for tripwire in DENY_TRIPWIRES:
            prefix = f"{shell}({tripwire}"
            if not any(rule.startswith(prefix) for rule in deny):
                problems.append(
                    f"deny tripwire missing: no permissions.deny rule starts with '{prefix}' -- "
                    "the canonical flag-first spelling must stay denied in both shells "
                    "(settings $comment > honest limitation)."
                )
    print(f"deny tripwires checked: {len(SHELLS) * len(DENY_TRIPWIRES)}")


# guard: #262 (D-210, intake #260) -- a bare-`python`-plus-whitespace invocation in
# the executable machinery breaks on bare Ubuntu 24.04+ (no `python` binary): loudly
# in preflight stages, silently where output is swallowed. Dev boxes mask it via
# python-is-python3, so only an audit catches it before a downstream does. Scope is
# executable surfaces incl. their copy-paste header comments; settings.json's
# dual-spelling allowlist entries are deliberate (see its $comment) and out of scope.
# Retire-when: D-210 is superseded (an interpreter shim ships with the template).
INTERPRETER_SCOPE = ("scripts/*.sh", "scripts/*.ps1", "scripts/*.py",
                     ".claude/hooks/*.py", ".claude/*.py",
                     ".github/workflows/*.yml")
# (?=\s|$): an end-of-line bare `python` (a shebang is exactly that) is the
# same D-210 defect -- the old \s-only lookahead was blind to it (#559).
BARE_PYTHON = re.compile(r"(?<![\w./-])python(?=\s|$)")


def check_interpreter_spelling(root, problems):
    for pat in INTERPRETER_SCOPE:
        for path in sorted(root.glob(pat)):
            for i, line in enumerate(read(path).splitlines(), 1):
                if BARE_PYTHON.search(line):
                    problems.append(
                        f"bare `python` invocation (D-210: spell it python3 -- bare "
                        f"Ubuntu ships no `python`) -> {path}:{i}: {line.strip()[:80]}"
                    )


# Hooks exposing a --selftest corpus (exit nonzero on mismatch). #297: the
# banner's silent-no-banner failure mode is invisible without asserting which
# banner each real downstream Status shape produces -- run the corpus here so
# every preflight/CI pass re-proves the detection logic. #356: every
# selftest-bearing hook registers here (side-effect-free per #319).
# #424 authoring discipline (both tuples): credit a corpus only after a
# load-bearing mutation of the guarded logic went RED naming its cases --
# assert coverage, then prove the assertion bites. Caveat: a mutation that
# stays green indicts the MUTATION first -- a no-op mutation and a strong
# test are indistinguishable from outside. Build mutations as asserted
# exact-string replacements and verify what they matched (field catches: a
# regex group already covered by its separator class, a downstream's PR; an
# edit that hit a corpus label instead of the pattern, #423; a threshold
# raise inert against an inf-baseline ratio, #426). And mutate only a
# COMMITTED baseline: a git-checkout restore recovers the last commit, so
# running the harness over uncommitted edits destroys the work under test
# (field catch: an untracked file un-restorable mid-run, then a checkout
# that erased the uncommitted logic wholesale -- both 2026-07-23, #471).
# The danger window is the SITUATION, not the harness (#759). It opens
# exactly when you mutate to validate something just written and not yet
# committed -- which is when a battery feels most useful -- so the rule
# reads like housekeeping right up until it deletes an hour of work. The
# persisted batteries carry a `git status --porcelain` refusal and it
# works; what destroyed a finished implementation was a five-line loop
# typed inline, too small to feel like it deserved the harness, which
# inherited the restore semantics without the guard (#746).
# Better than remembering to commit: RESTORE FROM A COPY YOU MADE. Copy the
# target to the scratchpad first and restore with `cp`, never `git checkout
# --`; git cannot then hand back a baseline that isn't the work under test,
# so the hazard is structurally absent instead of guarded against. Two
# batteries ran that way over deliberately uncommitted work on 2026-07-29
# (#737, #769). ANTI_PATTERNS "The Guard That Lives in the Harness".
SELFTEST_HOOKS = (
    ".claude/hooks/session_start_banner.py",
    ".claude/hooks/block_chained_merge.py",
    ".claude/hooks/inject_rule_reminders.py",
    ".claude/hooks/log_agent_dispatch.py",  # #480: --selftest dispatches before stdin
    ".claude/hooks/block_naked_todos.py",  # #492: add-harvest + naked-line scan, pure helpers
    ".claude/hooks/block_commit_rules.py",  # #310: escalated commit-message rung, pure verdict
    ".claude/hooks/session_close_contract.py",  # #749: Stop gate, pure turn/contract core
)

# Non-hook machinery exposing the same --selftest contract (#392). Same reason,
# one layer out: metrics.py is fail-soft telemetry, but its drift tripwire is
# real logic, and it mis-fired for a whole session (reading every delegated
# slice as bloat) before it had a corpus to regress against. Registered here so
# it runs every preflight rather than rotting as a flag nobody invokes -- the
# selftest must stay offline and side-effect-free (#319) to belong on this list.
SELFTEST_SCRIPTS = (
    "scripts/metrics.py",
    "scripts/slice_telemetry.py",  # #366: tok-* fallback's pure helpers
    "scripts/audit_name_leaks.py",  # #363: parse/expand/scan corpus (fake names only)
    "scripts/fleet_size.py",  # #349: hot-file lane exclusion + Surfaces parsing
    "scripts/ready_work.py",  # #479: Blocked-by forms + slice-head claim corpus
    "scripts/audit_secrets.py",  # #221: pattern corpus, split-literal fixtures
    "scripts/skill_evals.py",  # #471: grounding/vacuity corpus, pure helpers
    "scripts/audit_shell.py",  # #643: shebang matcher + zero-match reality check
    # #679: the posture reader consulted by the loop below. Its whole contract is
    # that every malformed shape degrades to the pre-#679 behaviour, which is only
    # a contract if a corpus holds it -- a raise here would take this gate offline.
    "scripts/project_posture.py",
    # #727: the sighting corpus IS the historical record -- every case is a real
    # closing-keyword grammar seen in production, so a regex edit that stops
    # catching one goes red wherever the gate runs.
    "scripts/audit_closing_keywords.py",
    # #692: the tag scan's quoted-span stripping. Registered because the rule it
    # guards was already wrong once on a corpus it wasn't measured against.
    "research/tools/_audit_research.py",
    # #737: the TEMPLATE_VERSION `source:` matcher. On the template repo itself
    # the stamp is a placeholder, so the gate is inert HERE and only ever judges
    # downstream -- the corpus is the only thing that can hold it honest before
    # it ships.
    "scripts/audit_docs.py",
    # Self-reference is deliberate (#595): this script's own agent-frontmatter
    # parser is real logic that must regress against the #593 fixture. The
    # --selftest path exits before main(), so the subprocess does not recurse.
    "scripts/audit_ops_config.py",
)


def check_hook_selftests(root, problems):
    # #679: these registries name "machinery you actually carry", so a downstream
    # that drops a gate its own adoption note told it not to adopt used to go red
    # for complying (#680, live). A path DECLARED unadopted in the posture file is
    # a recorded deviation and skips clean; an undeclared absence is still a hole,
    # and a declaration whose file came back -- which a wholesale sync does, since
    # step 3 re-takes any machinery path absent downstream -- is stale and says so,
    # or the deviation silently reverts on the next sync.
    declared = project_posture.unadopted(str(root))
    skipped = []
    for rel in SELFTEST_HOOKS + SELFTEST_SCRIPTS:
        path = root / rel
        verdict = project_posture.registry_verdict(rel, path.is_file(), declared)
        if verdict == "skip":
            skipped.append(rel)
            continue
        if verdict == "missing":
            problems.append(
                f"selftest target missing: {path} (SELFTEST_HOOKS/SELFTEST_SCRIPTS) -- "
                f"if this project deliberately does not carry it, declare the path in "
                f'{project_posture.POSTURE_PATH} "unadopted" (#679)')
            continue
        if verdict == "stale":
            problems.append(
                f'{project_posture.POSTURE_PATH} declares "{rel}" unadopted but the file '
                "is present (a sync re-takes machinery you dropped) -- delete it again "
                "or drop the declaration (#679)")
            continue
        try:
            r = subprocess.run([sys.executable, str(path), "--selftest"],
                               capture_output=True, text=True, encoding="utf-8",
                               errors="replace", timeout=30)
            if r.returncode != 0:
                fails = "; ".join(ln for ln in r.stdout.splitlines() if ln.startswith("FAIL"))[:300]
                problems.append(f"selftest failed -> {path}: {fails or r.stderr.strip()[:200]}")
            else:
                # #473: warn-not-fail zero-match reality checks live inside the
                # selftests; on a green run their WARN lines would otherwise be
                # swallowed here and "loud at first selftest" would be silent.
                for ln in r.stdout.splitlines():
                    if ln.startswith("WARN"):
                        print(f"{rel}: {ln}")
        except Exception as e:
            problems.append(f"selftest could not run -> {path}: {e}")
    # Printed, never silent: a deviation the operator can't see is one they can't
    # notice has gone stale, and this line is also the only confirmation that a
    # hand-edited declaration was spelled the way the registry spells it.
    if skipped:
        print(f"selftest targets declared unadopted ({project_posture.POSTURE_PATH}): "
              + ", ".join(skipped))


# guard: #746 (from #739) -- the defect that started this class was a call to a
# 2-parameter function written with 1 argument, on a gate's FAIL path. Nothing
# could catch it: ruff (pinned 0.15.21) implements no call-arity rule, pylint and
# mypy are not in this toolchain, and a selftest that drives the pure function
# cannot execute its CALLER -- measured, not assumed: fixtures for all five
# reporters left two of the four wrong-caller mutations caught by NOTHING,
# because that branch runs only when the tree is dirty. So the class closes
# statically or not at all. Deliberately conservative: it flags only what cannot
# possibly bind, so a green run means "no provable arity bug", never "no bug".
ARITY_SCOPE = ("scripts/*.py", ".claude/hooks/*.py", ".claude/*.py",
               "research/tools/*.py", "textbooks/tools/*.py")


def call_arity_problems(source, relpath):
    """Intra-module calls that cannot bind their own module-level def. Pure.

    Module level and plain `name(...)` calls only. Anything that could bind
    dynamically is skipped rather than guessed: decorated defs (a decorator can
    change the signature), *args/**kwargs (they bind anything), starred or
    **-splatted call sites, and any call whose keywords name a parameter the def
    doesn't declare -- that last one is a real error, but it belongs to a checker
    that models kwargs properly, and a false positive in a blocking gate costs
    more than the miss.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []  # ruff owns syntax; a parse error is not this gate's finding
    defs = {}
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        a = node.args
        if node.decorator_list or a.vararg or a.kwarg:
            continue
        positional = [p.arg for p in a.posonlyargs + a.args]
        required = len(positional) - len(a.defaults)
        kwonly_required = [k.arg for k, d in zip(a.kwonlyargs, a.kw_defaults) if d is None]
        defs[node.name] = (positional, required, kwonly_required,
                           {p.arg for p in a.posonlyargs},
                           positional + [k.arg for k in a.kwonlyargs], node.lineno)
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
            continue
        info = defs.get(node.func.id)
        if info is None:
            continue
        positional, required, kwonly_required, posonly, every, defline = info
        if any(isinstance(x, ast.Starred) for x in node.args) \
                or any(k.arg is None for k in node.keywords):
            continue
        named = {k.arg for k in node.keywords}
        if not named <= set(every):
            continue
        if len(node.args) > len(positional):
            out.append(f"{relpath}:{node.lineno}: {node.func.id}() takes at most "
                       f"{len(positional)} positional argument(s) but {len(node.args)} "
                       f"given -- TypeError the moment this line runs (defined line "
                       f"{defline}, #746)")
            continue
        bound = len(node.args) + len(named - posonly)
        if bound < required or not set(kwonly_required) <= named:
            out.append(f"{relpath}:{node.lineno}: {node.func.id}() requires "
                       f"{required} argument(s) but the call binds {bound} -- "
                       f"TypeError the moment this line runs (defined line "
                       f"{defline}, #746)")
    return out


def check_call_arity(root, problems):
    checked = 0
    for pattern in ARITY_SCOPE:
        for path in sorted(root.glob(pattern)):
            checked += 1
            problems.extend(call_arity_problems(read(path),
                                                path.relative_to(root).as_posix()))
    print(f"intra-module call arity: {checked} Python file(s) checked")


def check_rules(root, problems):
    """.claude/rules/*.md frontmatter sanity (#307): a rule whose `paths:` list
    is empty or malformed matches nothing (v2.1.207 semantics) and goes
    silently dark -- the skills-catalog silent-load class, for rules."""
    rules_dir = root / ".claude" / "rules"
    files = sorted(rules_dir.glob("*.md")) if rules_dir.is_dir() else []
    for f in files:
        lines = read(f).splitlines()
        if not lines or lines[0].strip() != "---":
            continue  # no frontmatter: loads unconditionally at launch (legal; discouraged -- AUTOMATION.md section 7, or your project's automation-policy home)
        try:
            end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
        except StopIteration:
            problems.append(f"{f}: unterminated frontmatter ('---' never closes) -- "
                            "the rule can fail to parse and go silently dark.")
            continue
        fm = lines[1:end]
        if any("\t" in ln for ln in fm):
            problems.append(f"{f}: tab in frontmatter -- YAML forbids tabs; the "
                            "rule can fail to parse and go silently dark.")
        if any(ln.strip().startswith("paths:") for ln in fm):
            globs = []
            for ln in fm:
                m = re.match(r"\s*-\s*(.*)$", ln)
                if m:
                    globs.append(m.group(1).strip().strip('"\''))
            if not globs or any(not g for g in globs):
                problems.append(
                    f"{f}: `paths:` carries no non-empty glob entries -- an empty/"
                    "invalid glob matches nothing (v2.1.207 semantics): the rule is "
                    "silently dark. Use the documented list form with quoted globs.")
    print(f"rules files checked: {len(files)}")


AGENT_REQUIRED_KEYS = ("name", "description", "tools")


def agent_frontmatter_problems(text, stem):
    """.claude/agents/*.md frontmatter sanity (#595). Pure, so --selftest drives
    it (#319). Sibling of check_rules: same silently-dark class, one directory
    over -- a contract that fails to parse never registers as a subagent type,
    and nothing says so; dispatch just reports the type as not-found.

    guard: #595. Earned by #593: `description:` carried an unquoted colon-space
    ("...pins no model: the eval gate exists..."), which YAML reads as a nested
    mapping key. The eval-executor contract therefore never registered across
    its entire existence, so every skill-eval dispatch silently fell back to a
    full-tool subagent -- the #430 guard it was created to provide was never
    once live. Retire this check when the harness itself reports a contract
    parse failure loudly at load time instead of omitting the agent."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return ["no frontmatter -- an agent contract must declare "
                "`name`/`description`/`tools` or it never registers as a subagent type."]
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return ["unterminated frontmatter ('---' never closes) -- the contract "
                "fails to parse and the agent type never registers."]
    fm, out, keys = lines[1:end], [], {}
    if any("\t" in ln for ln in fm):
        out.append("tab in frontmatter -- YAML forbids tabs; the contract fails to "
                   "parse and the agent type never registers.")
    for ln in fm:
        m = re.match(r"([A-Za-z_][\w-]*):\s*(.*)$", ln)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        keys[key] = val
        # #593: an unquoted scalar carrying ": " parses as a nested mapping.
        if val and val[0] not in "\"'[{|>" and ": " in val:
            i = val.index(": ")
            out.append(
                f"`{key}:` value carries an unquoted colon-space near "
                f"\"...{val[max(0, i - 20):i + 10]}...\" -- YAML reads it as a nested "
                "mapping, so the whole block fails to parse and the agent type never "
                "registers (#593). Quote the value or rephrase without the colon.")
    missing = [k for k in AGENT_REQUIRED_KEYS if k not in keys]
    if missing:
        out.append(f"frontmatter missing {', '.join(missing)} -- an incomplete "
                   "contract may not register.")
    if keys.get("name") and keys["name"] != stem:
        out.append(f"frontmatter name '{keys['name']}' != filename stem '{stem}' -- "
                   "dispatch resolves the declared name; a mismatch is the same "
                   "silently-not-found class.")
    return out


def check_agents(root, problems):
    agents_dir = root / ".claude" / "agents"
    files = sorted(agents_dir.glob("*.md")) if agents_dir.is_dir() else []
    for f in files:
        problems.extend(f"{f}: {msg}" for msg in
                        agent_frontmatter_problems(read(f), f.stem))
    print(f"agent contracts checked: {len(files)}")


# --- machinery research citations (#607) ------------------------------------
# Stops at ')' and ':' so a path lifted out of an adjacent markdown link or a
# trailing clause resolves cleanly. Placeholders (<slug>, globs) are matched on
# purpose, then skipped by name below -- silently not-matching them would hide
# a typo'd real path in the same shape.
RESEARCH_CITE = re.compile(r"research/(?:notes|reports|experiments|banked)/[A-Za-z0-9_./*<>-]*")
# Inside research/*.md the house spelling drops the namespace prefix -- a note
# cites a sibling as `reports/RR-01_x.md`, not `research/reports/...`. Anchored
# to a boundary so `textbooks/reports/x.md` can't match on its tail (#625).
RESEARCH_SIBLING = re.compile(
    r"(?:^|(?<=[\s(]))(?:notes|reports|experiments|banked)/[A-Za-z0-9_./*<>-]*")
CODE_SPAN_INNER = re.compile(r"`([^`]*)`")
FENCE_LINE = chr(96) * 3
# A span that stops at the namespace root names a KIND, not an artifact --
# `banked/` in research/README.md's table of directory kinds is the definition
# of the row, not a citation of anything inside it. Skipped by the same logic as
# placeholders above. The distinction is load-bearing rather than cosmetic:
# `research/banked/register-game-engine/` names a collection and stays checked
# (#688, intake #681 finding 2 / #682 finding 4).
NAMESPACE_KINDS = ("notes", "reports", "experiments", "banked")
# TEMPLATE-OPTIONAL content: a downstream without generation-banking omits the
# directory outright (#197), so a citation to it resolves HERE and dangles on
# every leaf downstream -- green upstream, red where it ships. That asymmetry is
# why this class took three instances and two downstreams to surface: #227 fixed
# the first, wrote "if a third appears, ask whether an audit should catch this
# mechanically", and the third arrived in #681/#682. The gate could not see it,
# because the gate only ever ran where the directory exists.
#
# So the rule follows the target's TRUST LEVEL, not its presence on this disk:
# outside research/ itself, template-optional content is written as prose, never
# as a citation (#646 -- illustrative, not grounding). research/ may cite its own
# optional members; nothing that must travel may depend on them.
TEMPLATE_OPTIONAL = ("research/banked/",)


def research_citation_problems(text, exists, sibling=False):
    """Backticked research/ citations that don't resolve -> [(line_no, path)].

    `exists` is injected so --selftest can trip this from an in-memory corpus
    (#319: offline, side-effect-free). `sibling=True` additionally matches the
    prefix-less spelling used INSIDE research/ (resolved by the caller against
    research/, not the repo root).

    Fenced blocks are skipped: a path in a ```-block is illustrative, the same
    reason CODE_SPAN exists in the link checkers (#625). No repo citation lives
    in a fence today (measured: 72 checked, identical either way) -- this is
    correct-by-construction, not a fix.

    guard: #607. Earned by #344's fifth downstream recurrence: README's boundary
    table promised that skipping a skill-grounding note "ships a dangling
    citation and audit_repo_links fails" -- but that audit strips code spans
    BEFORE matching links (audit_repo_links.py:25-26,49), so only the
    markdown-linked note was ever checked. `fleet_size`'s backticked citation to
    parallel-builder-fleet.md was invisible, and a downstream shipped it dangling
    while green. Enforcement was an accident of citation style, not a property of
    the rule. Retire this check when every machinery citation is a markdown link
    and audit_repo_links sees them all.
    """
    out = []
    in_fence = False
    for n, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith(FENCE_LINE):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for span in CODE_SPAN_INNER.findall(line):
            pats = (RESEARCH_CITE, RESEARCH_SIBLING) if sibling else (RESEARCH_CITE,)
            for pat in pats:
                for m in pat.finditer(span):
                    path = m.group(0)
                    if any(c in path for c in "<>*"):
                        continue  # placeholder/glob, not a citation
                    if path.rstrip("/").split("/")[-1] in NAMESPACE_KINDS:
                        continue  # names a kind, not an artifact in it
                    if not exists(path):
                        out.append((n, path))
    return out


# SCOPE IS THE NAMESPACE, NOT THE CITER (#625, intake #623). #607 resolved these
# under .claude/** only, which is why it caught fleet_size's dangling citation
# and missed two others in the same downstream sync: the citers were
# textbooks/reference/ANTI_PATTERNS.md (x4) and another research NOTE, and they
# sit under three different checkers' domains -- audit_repo_links owns root/docs/
# .claude, textbooks/tools/_audit_links owns the library, research/tools/
# _audit_research owns research/. No single traversal saw them all, so the rule
# was enforced for one citer class and unenforced for the rest.
#
# The thing being protected has ONE owner (the research/ namespace: closed,
# machine-listable, nothing illustrative in it) while its citers have three --
# so the scan follows the target, not the citer, and walks every repo .md.
# It lives here rather than in _audit_research.py (where intake #623 proposed
# it) because the pure function above and its offline selftest corpus already
# exist here: relocating would have meant a second home for one rule plus a new
# selftest harness in a script that has none -- double-coverage is exactly what
# the intake warned against. A NARROWER rule was measured and rejected upstream:
# "every backticked repo-relative path must exist" flags ~31 sites of which ~4
# are real, needing an exemption list that itself drifts.
def repo_md_files(root):
    """Every repo `.md`, sorted -- the citation rule's file scope, single-homed.

    The gate below and the `--cited-artifacts` bucket MUST walk the same set: the
    bucket's whole guarantee is that a new citation cannot appear without
    entering it (#689), and that holds only for files the resolver actually
    reads. Two copies of this line would let one widen without the other and
    quietly break that -- the bucket would then under-report exactly the
    citations the gate is enforcing.

    `.py` is deliberately NOT in scope, and this is the one non-obvious part:
    `scripts/fleet_size.py:4` really does carry a grounding citation the gate
    therefore misses (filed separately). Widening here is not the one-line fix
    it looks like -- this file's own selftest corpus is full of deliberately
    dangling fixture paths (`research/notes/missing-note.md`), so a `.py` walk
    would fail the gate on its own tests and list a fixture as a load-bearing
    artifact. Widening needs an exclusion mechanism, which is a slice, not a
    tweak.
    """
    wt = root / ".claude" / "worktrees"  # transient full-repo agent checkouts (#800's worktree variant, hit live in #827)
    return sorted(p for p in root.rglob("*.md") if ".git" not in p.parts and not p.is_relative_to(wt))


def check_research_citations(root, problems):
    files = repo_md_files(root)
    cited = resolved = 0
    for f in files:
        rel = f.relative_to(root).as_posix()
        in_research = rel.startswith("research/")
        # A sibling spelling resolves against research/, the namespace root.
        def _exists(p, _r=in_research):
            return (root / ("research/" + p) if _r and not p.startswith("research/")
                    else root / p).exists()
        text = read(f)
        # Count what RESOLVED too, not just what dangled: "0 dangling" reads
        # identically whether the rule is working or has gone inert (a drifted
        # regex, a moved namespace). The resolved count is the zero-match
        # tripwire (#473) -- if it ever prints 0, the gate is dark, not clean.
        # exists=False makes every match a "problem", so the length is the
        # total citations seen; subtracting the real dangling count below
        # leaves the resolved ones.
        seen = len(research_citation_problems(text, lambda p: False,
                                              sibling=in_research))
        dangling = research_citation_problems(text, _exists, sibling=in_research)
        resolved += seen - len(dangling)
        for n, path in dangling:
            cited += 1
            problems.append(
                f"{rel}:{n}: cites `{path}`, which does not exist -- "
                "a BACKTICKED citation is invisible to every link checker (they "
                "strip code spans before matching links), so this dangles "
                "silently (#607, widened #625). Port the cited artifact with the "
                "content that cites it, or fix the path.")
        # Leaf-downstream simulation (#688). Everything above asks "does this
        # resolve HERE" -- which is the wrong question for template-optional
        # targets, since they resolve here by definition and dangle wherever the
        # downstream declined them. Deny them and re-run: what breaks is what
        # ships broken. This is the mechanical catch #227 asked for after the
        # second instance; it runs upstream, where the fix is one edit, instead
        # of surfacing as a red preflight on someone else's first sync.
        if not in_research:
            def _leaf(p, _e=_exists):
                return False if p.startswith(TEMPLATE_OPTIONAL) else _e(p)
            for n, path in research_citation_problems(text, _leaf,
                                                      sibling=in_research):
                if (n, path) in dangling:
                    continue  # already reported above as simply missing
                cited += 1
                problems.append(
                    f"{rel}:{n}: cites `{path}`, which is TEMPLATE-OPTIONAL "
                    "content -- it resolves here and dangles on every downstream "
                    "that declined it, so this gate is green exactly where the "
                    "defect is authored (#688; #227's third instance). Outside "
                    "research/, write it as prose, not a citation (#646: "
                    "illustrative, not grounding).")
    if not resolved and not cited:
        problems.append(
            "research citation gate matched NOTHING across "
            f"{len(files)} file(s) -- the rule is dark, not clean (#473). "
            "The namespace or the citation spelling moved; fix the pattern.")
    print(f"research citations checked: {len(files)} file(s) repo-wide, "
          f"{resolved} resolved, {cited} dangling")


# --- the cited-artifact bucket (#689, intake #681 finding 3) -----------------
# A QUERY MODE, NOT A GATE, because the failure it serves is not authored here:
# it is a DOWNSTREAM declining a file that upstream machinery has since started
# citing, so nothing upstream is broken and there is nothing here to fail. The
# worked case (a deviation that quietly became 15 FAILs) is single-homed in
# `.claude/skills/update_from_template/SYNC_REFERENCE.md`'s field record (#810),
# whose reader has to act on it; this module owns the derivation, not the story.
def cited_artifact_map(files):
    """[(relpath, text)] -> {target: [(citer, line), ...]}; targets namespace-rooted.

    Derived from `research_citation_problems`, never a second scan: a citation
    the gate enforces and a citation the bucket lists are then the same event by
    construction, so a new citation cannot appear without entering the bucket
    (#689 AC1). Every skip the resolver makes -- fences, placeholders, globs, a
    bare namespace naming a KIND -- is inherited for free, which is the point of
    reusing it rather than re-deriving "what looks like a path".

    `exists` is pinned to False deliberately. The bucket answers *what is
    load-bearing*, not *what resolves here* -- and the artifact that needs the
    warning is ABSENT by construction on the box that needs it, since declining
    it is what put it in this position. Resolving first would empty the bucket
    exactly where it matters, which is #689's own defect one layer down.

    Sibling spellings normalize onto the namespace-rooted key, so a note cited as
    `notes/x.md` from inside research/ and as `research/notes/x.md` from a skill
    is ONE target with two citers, not two half-populated rows (live: 2 of the
    15 targets here are cited both ways).
    """
    out = {}
    for rel, text in files:
        in_research = rel.startswith("research/")
        for n, path in research_citation_problems(text, lambda p: False,
                                                  sibling=in_research):
            target = path if path.startswith("research/") else "research/" + path
            out.setdefault(target, set()).add((rel, n))
    return {t: sorted(v) for t, v in out.items()}


def format_cited_artifacts(bucket, scanned):
    """The `--cited-artifacts` report as lines. Pure (#746), so the selftest
    drives the exact text a sync reads -- this output IS the product here, the
    same reason `format_report` was extracted.

    An EMPTY bucket prints as a FAILURE, not a clean run. The consumer is a
    downstream deciding what it may safely decline, and to that reader "nothing
    listed" reads as "nothing is load-bearing" -- a silent green on the one
    question it asked. Same zero-match tripwire the resolved-count makes above
    (#473); here it is louder because silence is indistinguishable from consent.
    """
    if not bucket:
        return [f"cited-artifact bucket: EMPTY across {scanned} file(s) -- the rule "
                "is DARK, not clean (#473). Read this as 'the resolver found "
                "nothing', never as 'nothing is load-bearing': the namespace or "
                "the citation spelling moved. Fix the pattern before deciding "
                "anything you may decline (#689)."]
    lines = [
        f"cited-artifact bucket: {len(bucket)} research/ target(s) carrying "
        f"{sum(len(v) for v in bucket.values())} citation(s), from {scanned} "
        "file(s) scanned repo-wide (#689).",
        "These are machinery whatever their directory says. Declining one is not "
        "a deviation you record and forget -- its citers arrive wholesale on the "
        "next sync, so the citation dangles and `audit_ops_config` FAILs on the "
        "first post-sync run. Decline anyway only by porting the citers too, and "
        "re-read this list EVERY sync: that is what dates the decision.",
        "",
    ]
    for target, citers in sorted(bucket.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        lines.append(f"  {len(citers):3d}  {target}")
        lines.extend(f"         cited by {c}:{n}" for c, n in citers)
    return lines


def report_cited_artifacts(root):
    """`--cited-artifacts`: print the bucket, return its exit code. The thin IO
    shim; the walk, the map, and the text are all testable without it."""
    files = repo_md_files(root)
    bucket = cited_artifact_map(
        [(f.relative_to(root).as_posix(), read(f)) for f in files])
    for line in format_cited_artifacts(bucket, len(files)):
        print(line)
    return 0 if bucket else 1


def selftest():
    """Offline, side-effect-free (#319): the pure frontmatter parser only -- an
    in-memory corpus, never the repo's own contracts (those are check_agents')."""
    failed = 0

    def check(name, got, want):
        nonlocal failed
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} ops-config: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    def n(text, stem="a"):
        return len(agent_frontmatter_problems(text, stem))

    check("valid contract is silent",
          n("---\nname: a\ndescription: Does a thing.\ntools: Read, Grep\n---\n\nbody\n"),
          0)

    # The #593 shape, structurally verbatim -- the fixture that proves this
    # guard fires. Without it the check is an untested refusal.
    bad = ("---\nname: a\ndescription: Fresh-context executor. Deliberately pins no "
           "model: the eval gate exists to measure the session model.\n"
           "tools: Read, Grep\n---\n")
    check("#593: unquoted colon-space is caught", n(bad), 1)
    check("#593: the message names the offending key",
          "`description:`" in agent_frontmatter_problems(bad, "a")[0], True)
    check("quoted scalar may carry a colon",
          n("---\nname: a\ndescription: \"pins no model: it measures\"\ntools: Read\n---\n"),
          0)
    check("no frontmatter", n("just a body\n"), 1)
    check("unterminated frontmatter", n("---\nname: a\ntools: Read\n"), 1)
    check("tab in frontmatter",
          n("---\nname: a\ndescription:\tx\ntools: Read\n---\n"), 1)
    check("missing required key", n("---\nname: a\ndescription: x\n---\n"), 1)
    check("name != filename stem",
          n("---\nname: other\ndescription: x\ntools: Read\n---\n", stem="a"), 1)

    # --- backticked research citations (#607) ---
    # The guard merges with the input that trips it: the live shape from
    # fleet_size/SKILL.md:8, which audit_repo_links cannot see.
    # "research/notes/" is deliberately NOT in this set: the bare-namespace case
    # below must pass because the span names a kind (#688), not because the
    # directory happens to resolve -- otherwise removing that skip stays green.
    real = {"research/notes/parallel-builder-fleet.md"}
    ex = real.__contains__
    def cites(text):
        return research_citation_problems(text, ex)

    live = "the evidence-backed formula (D-330; `research/notes/parallel-builder-fleet.md`)"
    check("#607: a resolving backticked citation is silent", cites(live), [])
    check("#607: the fleet_size shape with the note ABSENT is caught",
          cites(live.replace("parallel-builder-fleet", "missing-note")),
          [(1, "research/notes/missing-note.md")])
    check("#607: placeholders and globs are not citations",
          cites("see `research/notes/<file>.md` and `research/experiments/*/prompts/*`"), [])
    check("#688: a bare namespace names a KIND, not an artifact in it",
          cites("notes live in `research/notes/`"), [])
    check("#607: an un-backticked markdown link is audit_repo_links' job, not ours",
          cites("see [the note](../../research/notes/missing-note.md)"), [])
    check("#607: a path lifted from a link inside a code span stops at ')'",
          cites("`](../../research/notes/missing-note.md): framing`"),
          [(1, "research/notes/missing-note.md")])
    check("#607: the line number is the citing line",
          cites("a\nb\n`research/notes/missing-note.md`"),
          [(3, "research/notes/missing-note.md")])

    # --- widened scope (#625) ---
    # The two citer shapes #607's .claude/**-only walk could not see. Both are
    # the real dangling cites from the intake, not constructed ones.
    check("#625: a REFERENCE doc's citation is caught (ANTI_PATTERNS x4 shape)",
          cites("Frontier evidence: `research/notes/cli-output-compression.md`"),
          [(1, "research/notes/cli-output-compression.md")])
    check("#625: banked/ joined the namespace",
          cites("frozen run in `research/banked/missing/README.md`"),
          [(1, "research/banked/missing/README.md")])
    # Sibling spelling: only inside research/, and only then.
    def sib(t):
        return research_citation_problems(t, ex, sibling=True)

    check("#625: a note's prefix-less sibling cite is caught inside research/",
          sib("see `reports/RR-01_elicitation-ordering.md`"),
          [(1, "reports/RR-01_elicitation-ordering.md")])
    check("#625: the same spelling OUTSIDE research/ is not our path to resolve",
          cites("see `reports/RR-01_elicitation-ordering.md`"), [])
    check("#625: a sibling-shaped tail inside another namespace is not a cite",
          sib("the library's `textbooks/reports/x.md`"), [])
    # --- template-optional targets (#688) ---
    # The live shapes from intake #681/#682. Both RESOLVE upstream, which is
    # precisely why three of them shipped: every existing case here asks "does
    # this resolve on the box running the gate", and for optional content that
    # question is always yes on the box that authors it.
    upstream = {"research/banked/register-game-engine/",
                "research/notes/parallel-builder-fleet.md"}
    here = upstream.__contains__

    def leaf(p):  # a downstream that declined generation-banking
        return False if p.startswith(TEMPLATE_OPTIONAL) else here(p)

    collection = ("Derived from the frozen collection "
                  "`research/banked/register-game-engine/` (specimens + shots)")
    check("#688: an optional-content cite is silent upstream (why 3 shipped)",
          research_citation_problems(collection, here), [])
    check("#688: the leaf simulation catches it where it actually breaks",
          research_citation_problems(collection, leaf),
          [(1, "research/banked/register-game-engine/")])
    check("#688: research/README's kind row survives the leaf simulation",
          research_citation_problems("| `banked/` | frozen generation data |",
                                     leaf, sibling=True), [])
    check("#688: a real member of an optional namespace still dangles for a leaf",
          research_citation_problems("`research/banked/gone/README.md`", leaf),
          [(1, "research/banked/gone/README.md")])

    # --- declared-unwired stages (#612) ---
    # The exit-criterion fixture: a declared decline keeps the mirror green
    # where the same absence undeclared is check 2a's two findings. Drives the
    # real caller (check_ci_map) with a fixture canon, not a re-implementation.
    canon = {"kept": "Kept", "declined": "Declined"}
    check("#612: a valid declaration is silent",
          unwired_problems({"declined": "leaf project -- permanently inert"}, canon), [])
    check("#612: an unknown stage name is caught (typo / stale after rename)",
          len(unwired_problems({"ghost": "why"}, canon)), 1)
    check("#612: an empty reason is caught -- the why is required",
          len(unwired_problems({"declined": "  "}, canon)), 1)
    probs = []
    check_ci_map({"kept"}, ["Kept"], probs,
                 unwired={"declined": "leaf project -- permanently inert"}, canon=canon)
    check("#612: a fixture-declined stage absent from every surface stays green",
          probs, [])
    probs = []
    check_ci_map({"kept"}, ["Kept"], probs, unwired={}, canon=canon)
    check("#612: the same absence undeclared is still the drift it always was",
          len(probs), 2)
    probs = []
    check_ci_map({"kept", "declined"}, ["Kept", "Declined"], probs,
                 unwired={"declined": "runtime-skip mode: files byte-identical"},
                 canon=canon)
    check("#612: declared-but-still-present is legal (runtime-skip mode)",
          probs, [])
    check("#612: a control character in a reason is caught (TSV integrity)",
          len(unwired_problems({"declined": "off\nfor now"}, canon)), 1)
    check("#612: a non-string reason is caught",
          len(unwired_problems({"declined": None}, canon)), 1)
    check("#612: the auditor may not excuse itself",
          len(unwired_problems({"ops-config audit": "slow"},
                               {"ops-config audit": "Ops"})), 1)
    probs = []
    check_ci_map({"kept", "rogue"}, ["Kept", "Orphan"], probs,
                 unwired={"declined": "x"}, canon=canon)
    check("#612: a declaration suppresses nothing unrelated (over-suppression)",
          len(probs), 2)

    # --- the cited-artifact bucket (#689) ---
    # The wrong readings this battery exists to kill, each one plausible:
    # list the directory (the live corpus says 15 of 122 -- a listing is 8x
    # wrong); bucket only what RESOLVES (empties itself on the box that needs
    # it); key by citer; treat any mention as a citation; two rows for one
    # target spelled two ways; print targets without citers (AC2 gone); and
    # report an empty bucket as clean.
    ground = "grounding: `research/notes/agent-project-systems.md`"
    check("#689: a citation enters the bucket keyed by TARGET, with its citer",
          cited_artifact_map([(".claude/skills/x/SKILL.md", ground)]),
          {"research/notes/agent-project-systems.md":
           [(".claude/skills/x/SKILL.md", 1)]})
    check("#689: the bucket is what is CITED -- existence is not the question",
          cited_artifact_map([("a.md", "`research/notes/declined-and-absent.md`")]),
          {"research/notes/declined-and-absent.md": [("a.md", 1)]})
    check("#689: two citers of one target are one row",
          cited_artifact_map([("a.md", ground), ("b.md", "x\n" + ground)]),
          {"research/notes/agent-project-systems.md": [("a.md", 1), ("b.md", 2)]})
    check("#689: a sibling spelling normalizes onto the namespace-rooted key",
          cited_artifact_map([("research/notes/a.md", "see `reports/RR-01_x.md`"),
                              (".claude/skills/y/SKILL.md",
                               "see `research/reports/RR-01_x.md`")]),
          {"research/reports/RR-01_x.md": [(".claude/skills/y/SKILL.md", 1),
                                           ("research/notes/a.md", 1)]})
    check("#689: the resolver's skips are inherited -- no fenced example enters",
          cited_artifact_map([("a.md", FENCE_LINE + "\n`research/notes/x.md`\n"
                               + FENCE_LINE)]), {})
    check("#689: nor a placeholder, a glob, or a bare namespace",
          cited_artifact_map([("a.md", "`research/notes/<f>.md` "
                               "`research/experiments/*/p` `research/notes/`")]), {})
    check("#689: an un-backticked link is not this rule's citation shape",
          cited_artifact_map([("a.md", "see [note](research/notes/x.md)")]), {})
    # The dedupe is a no-op on today's corpus -- measured, 0 duplicate
    # (target, line) pairs across 206 files -- so this fixture is the only thing
    # keeping it honest. It stays because the alternative over-counts the
    # headline citation total on an input that costs nothing to support, and
    # because it is what makes the sibling collapse above safe when both
    # spellings land on one line.
    check("#689: one target twice on a line is one citation, not two",
          cited_artifact_map([("a.md", "`research/notes/x.md` vs `research/notes/x.md`")]),
          {"research/notes/x.md": [("a.md", 1)]})
    check("#689: the report names every citer, not just the target (AC2)",
          format_cited_artifacts({"research/notes/x.md": [("s/SKILL.md", 7)]}, 3)[-2:],
          ["    1  research/notes/x.md", "         cited by s/SKILL.md:7"])
    check("#689: heaviest target first, ties alphabetical (deterministic)",
          [l[7:] for l in format_cited_artifacts(
              {"research/notes/b.md": [("a.md", 1)],
               "research/notes/a.md": [("a.md", 2)],
               "research/notes/c.md": [("a.md", 3), ("b.md", 4)]}, 3)
           if l.startswith("  ") and "cited by" not in l],
          ["research/notes/c.md", "research/notes/a.md", "research/notes/b.md"])
    check("#689: an empty bucket reports DARK, never 'nothing is load-bearing'",
          ("DARK" in format_cited_artifacts({}, 12)[0],
           len(format_cited_artifacts({}, 12))), (True, 1))
    # The three claims above the pure layer cannot reach, driven through main()
    # over a throwaway tree (temp dir only -- the repo is never touched, #319):
    # the walk is repo-wide and not .claude/**-only (#607's regression shape);
    # a citation to a MISSING artifact is still bucketed (resolving first would
    # empty the bucket on exactly the box that declined the file); and the flag
    # short-circuits BEFORE the ops-config file checks, so it answers on an
    # extracted `$TGT` tree that has no ci.yml yet -- which is how the sync
    # skill calls it. main()'s early return is a branch a human reads, so it
    # gets executed here rather than trusted (#746/#739).
    def run_flag(tree):
        argv, out = sys.argv, io.StringIO()
        sys.argv, keep = ["audit", "--root", str(tree), "--cited-artifacts"], sys.stdout
        try:
            sys.stdout = out
            return main(), out.getvalue()
        finally:
            sys.stdout, sys.argv = keep, argv

    with tempfile.TemporaryDirectory() as tmp:
        tree = Path(tmp)
        (tree / "docs").mkdir()
        (tree / "docs" / "d.md").write_text(
            "grounding: `research/notes/declined-and-gone.md`\n", encoding="utf-8")
        rc, text = run_flag(tree)
        check("#689: main() answers on a tree with no ci.yml (the $TGT shape)", rc, 0)
        check("#689: a repo-wide walk sees a citer outside .claude/",
              "research/notes/declined-and-gone.md" in text, True)
        check("#689: the MISSING target is bucketed -- absence is why it matters",
              "cited by docs/d.md:1" in text, True)
        (tree / "docs" / "d.md").write_text("no citations here\n", encoding="utf-8")
        rc, text = run_flag(tree)
        check("#689: no citations found exits NON-zero (silence != consent)",
              (rc, "DARK" in text), (1, True))

    # Fences: a path shown as an example is not a citation.
    check("#625: a fenced example path is illustrative, not a citation",
          cites(FENCE_LINE + "\n`research/notes/missing-note.md`\n" + FENCE_LINE), [])
    check("#625: citations resume after the fence closes",
          cites(FENCE_LINE + "\nx\n" + FENCE_LINE + "\n`research/notes/missing-note.md`"),
          [(4, "research/notes/missing-note.md")])

    # --- the FAIL report itself (#746). This branch runs only on a dirty tree,
    # so no ordinary invocation has ever executed it; next door that cost a
    # wrong-arity caller shipped green for a day (#739).
    rep = format_report(["stage 'x' is missing from ci.yml",
                         "settings command references 'nope.py'"])
    check("#746: the report opens with its blank separator", rep[0], "")
    check("#746: every problem is prefixed, and none is dropped",
          [ln for ln in rep if ln.startswith("OPS-CONFIG FAIL: ")],
          ["OPS-CONFIG FAIL: stage 'x' is missing from ci.yml",
           "OPS-CONFIG FAIL: settings command references 'nope.py'"])
    check("#746: the summary counts the problems it actually printed",
          rep[-1].startswith("audit_ops_config: 2 problem(s)"), True)
    check("#746: a single problem still renders every part of the report",
          len(format_report(["one"])), 4)

    # --- check 8: intra-module call arity (#746). The two halves that matter are
    # "catches the real #739 defect" and "stays silent on everything it cannot
    # prove" -- a false positive in a blocking gate costs more than a miss.
    def arity(body):
        return call_arity_problems(body, "x.py")

    check("#746: too FEW arguments -- the #739 defect verbatim",
          len(arity("def f(a, b):\n    return a\n\ndef g():\n    return f(1)\n")), 1)
    check("#746: too MANY positional arguments",
          len(arity("def f(a):\n    return a\n\ndef g():\n    return f(1, 2)\n")), 1)
    check("#746: the finding names the callee and the line",
          arity("def f(a, b):\n    return a\n\ndef g():\n    return f(1)\n")[0]
          .startswith("x.py:5: f() requires 2 argument(s) but the call binds 1"), True)
    check("#746: a correct call is silent",
          arity("def f(a, b):\n    return a\n\ndef g():\n    return f(1, 2)\n"), [])
    check("#746: a default makes the second argument optional",
          arity("def f(a, b=2):\n    return a\n\ndef g():\n    return f(1)\n"), [])
    check("#746: keywords count toward the requirement",
          arity("def f(a, b):\n    return a\n\ndef g():\n    return f(1, b=2)\n"), [])
    check("#746: a missing required keyword-only argument is caught",
          len(arity("def f(a, *, b):\n    return a\n\ndef g():\n    return f(1)\n")), 1)
    # Everything below can bind dynamically, so the gate must NOT guess.
    check("#746: *args binds anything -- skipped",
          arity("def f(*a):\n    return a\n\ndef g():\n    return f(1, 2, 3)\n"), [])
    check("#746: **kwargs binds anything -- skipped",
          arity("def f(a, **k):\n    return a\n\ndef g():\n    return f()\n"), [])
    check("#746: a decorator can rewrite the signature -- skipped",
          arity("@deco\ndef f(a, b):\n    return a\n\ndef g():\n    return f(1)\n"), [])
    check("#746: a starred call site is unknowable -- skipped",
          arity("def f(a, b):\n    return a\n\ndef g():\n    return f(*args)\n"), [])
    check("#746: a **-splatted call site is unknowable -- skipped",
          arity("def f(a, b):\n    return a\n\ndef g():\n    return f(**kw)\n"), [])
    check("#746: a name this module does not define is out of scope",
          arity("def g():\n    return imported_helper(1)\n"), [])
    check("#746: an attribute call is another module's contract -- skipped",
          arity("def f(a, b):\n    return a\n\ndef g():\n    return mod.f(1)\n"), [])
    check("#746: a nested def is not a module-level signature",
          arity("def g():\n    def f(a, b):\n        return a\n    return f(1)\n"), [])
    check("#746: unparseable source yields no findings (ruff owns syntax)",
          arity("def f(:\n"), [])

    # --- check 2b: the mapped pairs run the same COMMANDS (#729) ------------
    # The extractor first: what lands in `invocations` (compared with flags,
    # workdir folded in) vs `uncompared` (compared verbatim, not interpreted)
    # vs dropped entirely -- the last bucket is where a silent miss would live.
    check("#729: a gate invocation is captured with its flags",
          extract_commands("python3 scripts/audit_docs.py --strict")[0],
          ("python3 scripts/audit_docs.py --strict",))
    check("#729: a subcommand is part of the command, not a wrapper",
          extract_commands("python3 scripts/skill_evals.py audit")[0],
          ("python3 scripts/skill_evals.py audit",))
    check("#729: ci.yml's working-directory folds into the path",
          extract_commands("python3 tools/_audit_refs.py", "textbooks")[0],
          ("python3 textbooks/tools/_audit_refs.py",))
    check("#729: ... so the two sides of the live library-audits pair agree",
          extract_commands("python3 tools/_audit_refs.py", "textbooks")[0]
          == extract_commands("python3 textbooks/tools/_audit_refs.py")[0], True)
    check("#729: the shell wrapper around a gate is not a command",
          extract_commands("python3 scripts/audit_docs.py || return 1")[0],
          ("python3 scripts/audit_docs.py",))
    check("#729: diagnostics are noise, not a divergence",
          extract_commands('echo "SKIP (unconfigured): build command"'), ((), ()))
    check("#729: a skip_stage placeholder compares equal to ci.yml's echo",
          extract_commands("") == extract_commands('echo "SKIP: unconfigured"'), True)
    check("#729: a non-script command is recorded, never dropped",
          extract_commands("git diff --quiet -- textbooks/SECTIONS.json")[1],
          ("git diff --quiet -- textbooks/SECTIONS.json",))
    check("#729: an assignment may wrap a real command, so it is not noise",
          extract_commands("$r = cargo test --locked")[1] != (), True)
    # A line the tokenizer gives up on must SURFACE. Silence here would read as
    # "the two sides agree" at the exact moment the parser stopped working.
    # Asserted WITHOUT indexing on purpose: `[1][0]` turns the mutation that
    # deletes this surfacing into an IndexError, and a crash-only kill has not
    # been shown to be caught (#736) -- the wrong answer here is a perfectly
    # non-crashing empty tuple.
    check("#729: an unreadable line surfaces instead of vanishing",
          any(u.startswith("<unparseable>") for u in extract_commands("echo 'unbalanced")[1]),
          True)

    # The two parser bugs this check was actually born with, as fixtures.
    ps1_live = ("Invoke-Stage 'x' {\n"
                "    # Mirrors ci.yml's hygiene step (change both together).\n"
                "    python3 scripts/audit_docs.py\n"
                "}\n\nInvoke-Stage 'after' { python3 scripts/other.py }\n")
    # The WHOLE extraction, not just invocations: when the brace scan swallows
    # the rest of the file, the leaked `Invoke-Stage 'after' {...}` line lands
    # in `uncompared` (its lead is not python3), so an invocations-only
    # assertion visits the one half where right and wrong agree.
    check("#729: an apostrophe in a ps1 comment does not swallow the closing brace",
          extract_commands(ps1_stage_bodies(ps1_live)["x"]),
          (("python3 scripts/audit_docs.py",), ()))
    check("#729: ... and the stage after it is still parsed separately",
          extract_commands(ps1_stage_bodies(ps1_live)["after"])[0],
          ("python3 scripts/other.py",))
    ci_live = ("      - name: Build\n"
               "        run: 'echo \"SKIP (unconfigured): build command\"'\n"
               "      - name: Research audit\n"
               "        working-directory: research\n"
               "        env: { PYTHONUTF8: \"1\" }\n"
               "        run: python3 tools/_audit_research.py\n")
    check("#729: a YAML-quoted scalar keeps its inner quotes balanced",
          extract_commands(*ci_step_bodies(ci_live)["Build"]), ((), ()))
    check("#729: working-directory is read from the step, env ignored",
          extract_commands(*ci_step_bodies(ci_live)["Research audit"])[0],
          ("python3 research/tools/_audit_research.py",))
    sh_live = ('lib() {\n    python3 a.py\n    python3 b.py\n}\n'
               'stage "library" lib\nstage "solo" python3 c.py\n'
               'skip_stage "todo" "unconfigured"\n')
    check("#729: one level of shell-function dispatch is resolved",
          extract_commands(sh_stage_bodies(sh_live)["library"])[0],
          ("python3 a.py", "python3 b.py"))
    check("#729: a direct stage command needs no dispatch",
          extract_commands(sh_stage_bodies(sh_live)["solo"])[0], ("python3 c.py",))
    check("#729: skip_stage carries no command to compare",
          sh_stage_bodies(sh_live)["todo"], "")

    # The verdicts. `undeclared` is the gap #729 closed; `stale`/`drifted` are
    # what stop a declaration from decaying into a permanent exemption.
    same = {"sh": (("python3 a.py",), ()), "ci.yml": (("python3 a.py",), ())}
    diff = {"sh": (("python3 a.py --strict",), ()), "ci.yml": (("python3 a.py",), ())}
    check("#729: sides that agree, undeclared, are the ordinary case",
          mirror_verdict(same, None), "match")
    check("#729: a flag on ONE side with nothing declared FAILS",
          mirror_verdict(diff, None), "undeclared")
    check("#729: the same flag on BOTH sides is green",
          mirror_verdict({"sh": (("python3 a.py --strict",), ()),
                          "ci.yml": (("python3 a.py --strict",), ())}, None), "match")
    check("#729: a divergence whose fingerprint matches is declared",
          mirror_verdict(diff, {"fingerprint": mirror_fingerprint(diff)}), "declared")
    check("#729: losing the declaration turns it red again",
          mirror_verdict(diff, {}), "undeclared")
    check("#729: drift INSIDE a declared pair is not covered by the declaration",
          mirror_verdict(diff, {"fingerprint": "0" * 12}), "drifted")
    check("#729: a declaration whose divergence is gone is stale, not silent",
          mirror_verdict(same, {"fingerprint": mirror_fingerprint(same)}), "stale")
    check("#729: uncompared text is compared too -- a downstream's cargo pair",
          mirror_verdict({"sh": ((), ("cargo test --locked",)),
                          "ci.yml": ((), ("cargo test",))}, None), "undeclared")
    check("#729: ... and agrees when both sides say the same thing",
          mirror_verdict({"sh": ((), ("cargo test --locked",)),
                          "ci.yml": ((), ("cargo test --locked",))}, None), "match")
    check("#729: the fingerprint is order-sensitive across a stage's commands",
          mirror_fingerprint({"sh": (("python3 a.py", "python3 b.py"), ())})
          != mirror_fingerprint({"sh": (("python3 b.py", "python3 a.py"), ())}), True)

    print(f"audit_ops_config selftest: {'FAIL' if failed else 'OK'} ({failed} failure(s))")
    return 1 if failed else 0


def format_report(problems):
    """The gate's entire FAIL output as a list of lines. Pure (#319), extracted
    so the selftest drives the exact text main() prints (#746).

    Every audit here formatted its FAIL path inline in main(), which means the
    one branch a human ever reads had never been executed by a test: it runs
    only when the tree is dirty, and a gate's steady state is clean. #739 is
    what that costs -- a caller drifted to the wrong arity and shipped green,
    a TypeError standing where the finding should have been, at exactly the
    moment someone needed to read it ("The Untested Refusal", where for a gate
    the refusal path IS the product). main() keeps no logic left to drift.
    """
    return ([""]
            + [f"OPS-CONFIG FAIL: {p}" for p in problems]
            + ["",
               f"audit_ops_config: {len(problems)} problem(s) -- a gate must exist in "
               "preflight.sh, preflight.ps1, AND ci.yml (via PREFLIGHT_TO_CI), and the "
               "settings wiring must point at real files."])


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=".", help="repo root to audit (default: cwd)")
    ap.add_argument("--cited-artifacts", action="store_true",
                    help="list the research/ artifacts something cites, with their "
                         "citers, then exit -- the sync classification bucket (#689). "
                         "Exits non-zero on an empty bucket: a downstream reads "
                         "silence as consent to decline.")
    ap.add_argument("--unwired-stages", action="store_true",
                    help="print the declared-unwired stages (name<TAB>reason) and "
                         "exit 0 -- the preflight runners' query (#612); empty when "
                         "none. Prints declarations as written: validity is the "
                         "full audit's finding, never this query's.")
    args = ap.parse_args()
    root = Path(args.root)
    if args.unwired_stages:
        for name in sorted(UNWIRED_STAGES):
            print(f"{name}\t{UNWIRED_STAGES[name]}")
        return 0
    # Before every ops-config file check, deliberately: the bucket is a query
    # about the research/ namespace and must answer from an extracted `$TGT`
    # tree, where preflight.ps1 and ci.yml may legitimately not exist yet.
    if args.cited_artifacts:
        return report_cited_artifacts(root)

    problems = []
    problems.extend(unwired_problems(UNWIRED_STAGES, PREFLIGHT_TO_CI))
    ci_path = root / ".github" / "workflows" / "ci.yml"
    settings_path = root / ".claude" / "settings.json"
    shell_paths = {shell: root / site for shell, site in SHELL_SITES.items()}

    unknown = [s for s in PREFLIGHT_SHELLS if s not in SHELL_SITES]
    if unknown or not PREFLIGHT_SHELLS:
        problems.append(
            f"PREFLIGHT_SHELLS is {PREFLIGHT_SHELLS!r} -- it must be a non-empty "
            f"subset of {tuple(SHELL_SITES)}; a typo'd posture would silently skip "
            "the mirror checks it gates (D-218)."
        )
    else:
        for shell, path in sorted(shell_paths.items()):
            if shell not in PREFLIGHT_SHELLS and path.is_file():
                problems.append(
                    f"{path} exists but '{shell}' is not in PREFLIGHT_SHELLS -- an "
                    "undeclared preflight script is unaudited machinery: declare the "
                    "shell or delete the dead mirror (D-218)."
                )
        required = [shell_paths[s] for s in PREFLIGHT_SHELLS] + [ci_path, settings_path]
        missing = [p for p in required if not p.is_file()]
        if missing:
            for p in missing:
                problems.append(f"ops-config file missing: {p}")
        else:
            stages = {
                s: (parse_sh_stages if s == "sh" else parse_ps1_stages)(shell_paths[s])
                for s in PREFLIGHT_SHELLS
            }
            if len(stages) == 2:
                check_mirror(stages["sh"], stages["ps1"], problems)
            else:
                print(f"single-shell posture {PREFLIGHT_SHELLS!r}: sh <-> ps1 mirror "
                      "check skipped (PREFLIGHT_SHELLS, D-218)")
            check_ci_map(set().union(*stages.values()), parse_ci_steps(ci_path), problems)
            check_mirror_commands(shell_paths, ci_path, problems)
            check_todo_exemptions(root, problems)
            check_if_mirror(ci_path, problems)
            check_settings(settings_path, root, problems)
    check_interpreter_spelling(root, problems)
    check_hook_selftests(root, problems)
    check_call_arity(root, problems)
    check_rules(root, problems)
    check_agents(root, problems)
    check_research_citations(root, problems)

    if problems:
        for line in format_report(problems):
            print(line)
        return 1
    print("audit_ops_config: OK")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv[1:] else main())
