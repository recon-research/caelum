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
  2. preflight <-> ci.yml mapping: the canonical stage-name -> step-name map
     is PREFLIGHT_TO_CI below -- single-homed HERE. A stage missing from the
     map, a map entry with no preflight stage, a mapped step absent from
     ci.yml, or a named ci.yml step that is neither mapped nor declared in
     CI_ONLY_STEPS all fail. Adding a stage anywhere forces an edit here or
     goes red -- that is the point.
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

Mirrored three ways itself: ci.yml > static gates > "Ops-config audit" ==
preflight.{sh,ps1} "ops-config audit" stage (the map below includes it).
"""
import argparse
import json
import re
import sys
from pathlib import Path

# The canonical preflight-stage -> ci.yml-step map. Single-homed: when you add,
# rename, or drop a gate, this dict is the third file you must touch (after the
# two preflights or ci.yml) -- the audit goes red until all three agree.
PREFLIGHT_TO_CI = {
    "format --check": "Format check",
    "lint (adapter isolation + angular-eslint)": "Lint (adapter isolation + angular-eslint)",
    "build library (+ US-origin attestation + size budget)": "Build library (+ US-origin attestation + size gate)",
    "build Forge (production budgets)": "Build Forge (production budgets)",
    "test (caelum + Forge)": "Test (caelum + Forge)",
    "library audits": "Library audits (refs / routing / links)",
    "research audit": "Research audit (citations / structure / links)",
    "provenance (deps license + US-origin, D-11)": "Dependency provenance (license + US-origin, D-11)",
    "doc budgets": "Doc budgets (anti-drift)",
    "ops-config audit": "Ops-config audit (preflight/CI mirror, settings sanity)",
    "repo-docs links": "Repo-docs link audit (root/docs/.claude/_intake)",
    "staleness audit (warn-only)": "Staleness audit (content drift, warn-only)",
    "todo hygiene (vs origin/main)": "No naked TODO/FIXME in added lines",
}

# Named ci.yml steps with deliberately no preflight stage. Everything else
# named in ci.yml must be a PREFLIGHT_TO_CI value.
CI_ONLY_STEPS = {
    "Install",                 # `npm ci` per-job; preflight runs in the already-set-up dev env
    "Skills are directories",  # cheap CI structural check; locally covered by the library audits' skills catalog
    "Aggregate heavy results", # heavy-gate aggregation (#206) reads CI job results; nothing to mirror locally
    "PR references a ticket",  # ticket-first gate (#75) is PR-only by nature; preflight runs pre-PR
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
    # Node stages only run with $HOME/nodejs on PATH). The wrapper's own body
    # calls `stage "$name"` / `skip_stage "$name"` with a variable, so names
    # containing `$` are filtered.
    names = re.findall(r'''^\s*(?:skip_stage|stage|run_if_node)\s+['"]([^'"]+)['"]''', read(path), re.M)
    return [n for n in names if "$" not in n]


def parse_ps1_stages(path):
    # `Invoke-Stage 'name'` / `Skip-Stage 'name'` (either quote style, as
    # above), plus Caelum's Node-gated wrapper `Invoke-StageIfNode 'name'
    # {...}` (project deviation #15). The wrapper body calls `Invoke-Stage
    # $Name` with a variable -> `$` filtered.
    names = re.findall(
        r"""^\s*(?:Invoke-StageIfNode|Invoke-Stage|Skip-Stage)\s+['"]([^'"]+)['"]""", read(path), re.M
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


def check_ci_map(preflight_stages, ci_steps, problems):
    ci = set(ci_steps)
    print(f"ci.yml named steps: {len(ci)} | canonical map entries: {len(PREFLIGHT_TO_CI)}")
    for name in sorted(preflight_stages - set(PREFLIGHT_TO_CI)):
        problems.append(
            f"preflight stage '{name}' is not in PREFLIGHT_TO_CI -- add it to the "
            "map (and to ci.yml) or remove the stage; a new gate touches all three files."
        )
    for name in sorted(set(PREFLIGHT_TO_CI) - preflight_stages):
        problems.append(
            f"PREFLIGHT_TO_CI maps stage '{name}' but no preflight script defines it -- "
            "stale map entry or a stage was renamed/removed in only some files."
        )
    for stage_name, step in sorted(PREFLIGHT_TO_CI.items()):
        if step not in ci:
            problems.append(
                f"stage '{stage_name}' maps to ci.yml step '{step}', which ci.yml does not "
                "define -- the gate runs locally but never in CI."
            )
    for step in sorted(ci - set(PREFLIGHT_TO_CI.values()) - CI_ONLY_STEPS):
        problems.append(
            f"ci.yml step '{step}' is neither mapped from a preflight stage nor declared "
            "in CI_ONLY_STEPS -- the gate runs in CI but never locally (or the map is stale)."
        )


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
        paths = re.findall(r"\$\{CLAUDE_PROJECT_DIR\}/([^\"']+)", cmd)
        for tok in cmd.split():
            tok = tok.strip("\"'")
            if "${" not in tok and tok.endswith(".py") and "/" in tok:
                paths.append(tok)
        for rel in paths:
            checked += 1
            if not (root / rel).is_file():
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
                     ".claude/hooks/*.py", ".github/workflows/*.yml")
BARE_PYTHON = re.compile(r"(?<![\w./-])python(?=\s)")


def check_interpreter_spelling(root, problems):
    for pat in INTERPRETER_SCOPE:
        for path in sorted(root.glob(pat)):
            for i, line in enumerate(read(path).splitlines(), 1):
                if BARE_PYTHON.search(line):
                    problems.append(
                        f"bare `python` invocation (D-210: spell it python3 -- bare "
                        f"Ubuntu ships no `python`) -> {path}:{i}: {line.strip()[:80]}"
                    )


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=".", help="repo root to audit (default: cwd)")
    args = ap.parse_args()
    root = Path(args.root)

    problems = []
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
            check_todo_exemptions(root, problems)
            check_if_mirror(ci_path, problems)
            check_settings(settings_path, root, problems)
    check_interpreter_spelling(root, problems)

    if problems:
        print()
        for p in problems:
            print(f"OPS-CONFIG FAIL: {p}")
        print(f"\naudit_ops_config: {len(problems)} problem(s) -- a gate must exist in "
              "preflight.sh, preflight.ps1, AND ci.yml (via PREFLIGHT_TO_CI), and the "
              "settings wiring must point at real files.")
        return 1
    print("audit_ops_config: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
