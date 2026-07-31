#!/usr/bin/env python3
"""project_posture.py -- the per-project posture file (#679).

THE GAP. On a self-hosted template no wholesale-synced path can hold a setting
that is true here and false downstream: `.claude/settings.json` syncs its
hook/deny updates, `.claude/hooks/` is wholesale-overwrite machinery, and
`PROJECT_CONVENTIONS.md` is prose that stays skeleton here under the #361
carve-out. So the template's only expressible postures were "on for everyone"
and "off for everyone" -- and the missing third one is invisible until someone
tries to use it, which is exactly how #645 came to recommend a mechanism that
did not exist. This module is that third posture, read by any gate or hook
that wants one.

WHY THE TEMPLATE SHIPS NO SUCH FILE, and must not start. The safety here is
structural, not a promise: `update_from_template` step 3 classifies each
machinery path present *at the upstream target*, so a path absent upstream
never enters the loop at all and cannot be overwritten by a sync. Ship an
example `.claude/project.json` upstream and that guarantee inverts -- the first
sync takes it as a new upstream file and every later sync hand-judges a
"genuine downstream edit", which is precisely the wholesale-overwrite failure
the file exists to escape. The README boundary table carries the row so that
nobody adds one later without reading this paragraph.

ABSENT IS THE SHIPPED DEFAULT, not an error (#679, owner 2026-07-29). Every
downstream that syncs before creating the file is in that state, so a gate
hard-failing on a missing posture file would arm the exact failure this exists
to prevent. No file, unreadable file, malformed JSON, wrong value type: all
degrade to the empty posture, whose behaviour is byte-for-byte what the gates
did before this module existed.

ONE KEY, because one consumer (#679: "first consumer decides the key shape;
resist generalizing the schema beyond it until a second one exists"):

    { "unadopted": ["scripts/audit_name_leaks.py"] }

`unadopted` = repo-relative paths of shipped machinery this project has
DELIBERATELY not adopted, spelled exactly as the registry spells them. The
motivating case is #680: `audit_name_leaks.py` earns its place only on a repo
that is itself a template with a Downstream registry, so its own adoption note
tells a leaf downstream not to adopt it and to record the deviation -- and then
`SELFTEST_SCRIPTS` red-lined them for doing so. The template told a downstream
not to carry a script and failed them for removing it.

Note what a *declaration* buys over simply tolerating absence: tolerating it
silently would also green-light a script someone deleted by accident, or one a
sync dropped. Declared-vs-undeclared is the whole difference between a recorded
deviation and a hole, so the verdict below keeps them apart -- and flags a
declaration that has gone stale, since a posture entry matching nothing is the
#295 zero-match trap wearing a different hat.
"""
import argparse
import json
import os
import sys
if hasattr(sys.stdout, "reconfigure"):  # Windows cp1252 stdout guard (#296)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

POSTURE_PATH = ".claude/project.json"


def parse(text):
    """Posture dict from file text. Pure; never raises -- see ABSENT above."""
    try:
        data = json.loads(text)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def declared_unadopted(posture):
    """The `unadopted` path set. Pure. A non-list, or non-str members, degrade
    to empty/skipped rather than raising: a typo in a hand-edited posture file
    must not take the gate that reads it offline."""
    value = (posture or {}).get("unadopted")
    if not isinstance(value, list):
        return frozenset()
    return frozenset(v.replace("\\", "/") for v in value if isinstance(v, str) and v)


def registry_verdict(rel, present, declared):
    """One registry entry's verdict (#679). Pure -- the caller does the IO.

    run     present, undeclared        -- the ordinary case
    skip    absent, declared unadopted -- a recorded deviation, clean
    missing absent, undeclared         -- a hole: the gate's original FAIL
    stale   present, declared          -- the declaration outlived the removal
    """
    if present:
        return "stale" if rel in declared else "run"
    return "skip" if rel in declared else "missing"


def load(root="."):
    """The posture for `root`, or {} (fail-soft). The ONE reader of the file."""
    try:
        with open(os.path.join(root, POSTURE_PATH), encoding="utf-8") as f:
            return parse(f.read())
    except Exception:
        return {}


def unadopted(root="."):
    """Convenience: the declared-unadopted path set for `root`."""
    return declared_unadopted(load(root))


def selftest():
    """Offline, side-effect-free corpus over the pure core (#319; SELFTEST_SCRIPTS)."""
    failed = 0

    def check(name, got, want):
        nonlocal failed
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} {name}"
              + ("" if ok else f" -> got {got!r}, want {want!r}"))

    # --- parse: every malformed shape degrades to the empty posture, because
    # the absent-file default is the whole safety property (#679).
    check("parse: a well-formed posture survives",
          parse('{"unadopted": ["scripts/a.py"]}'), {"unadopted": ["scripts/a.py"]})
    check("parse: malformed JSON is the empty posture", parse("{not json"), {})
    check("parse: empty text is the empty posture", parse(""), {})
    # A JSON document whose top level is a list/str parses FINE but is not a
    # posture; `.get` would raise on it, taking the gate down at import time.
    check("parse: a non-object top level is the empty posture", parse("[1, 2]"), {})
    check("parse: a bare JSON string is the empty posture", parse('"unadopted"'), {})

    # --- declared_unadopted: the key's shape, and every way it can be wrong
    check("declared: the ordinary list",
          declared_unadopted({"unadopted": ["scripts/a.py", "scripts/b.py"]}),
          frozenset({"scripts/a.py", "scripts/b.py"}))
    check("declared: absent key is empty", declared_unadopted({}), frozenset())
    check("declared: empty posture is empty", declared_unadopted(None), frozenset())
    check("declared: a string value is not a one-element list",
          declared_unadopted({"unadopted": "scripts/a.py"}), frozenset())
    check("declared: a dict value degrades to empty",
          declared_unadopted({"unadopted": {"scripts/a.py": True}}), frozenset())
    check("declared: non-str members are skipped, str members survive",
          declared_unadopted({"unadopted": ["scripts/a.py", 7, None, ""]}),
          frozenset({"scripts/a.py"}))
    # Windows-authored posture files spell paths with backslashes; the registries
    # are POSIX-spelled, so a declaration would silently never match (#296 family).
    check("declared: backslash paths normalize to the registry spelling",
          declared_unadopted({"unadopted": [r"scripts\audit_name_leaks.py"]}),
          frozenset({"scripts/audit_name_leaks.py"}))

    # --- registry_verdict: the four-way branch, each arm pinned
    d = frozenset({"scripts/gone.py"})
    check("verdict: present + undeclared runs",
          registry_verdict("scripts/here.py", True, d), "run")
    check("verdict: absent + declared is a recorded deviation",
          registry_verdict("scripts/gone.py", False, d), "skip")
    check("verdict: absent + undeclared is still a hole",
          registry_verdict("scripts/here.py", False, d), "missing")
    check("verdict: present + declared is a stale declaration",
          registry_verdict("scripts/gone.py", True, d), "stale")
    # The empty posture must reproduce the pre-#679 behaviour EXACTLY: present
    # runs, absent fails. If this pair ever diverges, the shipped default moved.
    check("verdict: empty posture runs a present entry",
          registry_verdict("scripts/here.py", True, frozenset()), "run")
    check("verdict: empty posture still fails an absent entry",
          registry_verdict("scripts/here.py", False, frozenset()), "missing")

    # --- load: a missing file is the empty posture, on a path that cannot exist
    check("load: a missing posture file is the empty posture",
          load(os.path.join("no", "such", "root")), {})
    check("unadopted: a missing posture file declares nothing",
          unadopted(os.path.join("no", "such", "root")), frozenset())

    print(f"\nproject_posture selftest: {'FAIL' if failed else 'PASS'} ({failed} failed)")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--selftest", action="store_true",
                    help="run the offline corpus over the pure core")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    posture = load(".")
    declared = declared_unadopted(posture)
    if not posture:
        print(f"{POSTURE_PATH}: absent or empty -- shipped default "
              "(all registered machinery is expected present)")
    else:
        print(f"{POSTURE_PATH}: {len(declared)} path(s) declared unadopted")
        for rel in sorted(declared):
            print(f"  {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
