#!/usr/bin/env python3
"""audit_shell.py -- shellcheck gate over every shell file in the repo (#643; exits non-zero).

The guard behind #642 (conventions > Guard provenance: every escape leaves a
guard, not just a fix). This repo linted no shell at all, so an SC2164 + SC2155
pair shipped in scripts/preflight.sh -- the most-copied shell in the
template's blast radius, run by every downstream as its merge-blocking gate --
and a DOWNSTREAM's linter was the first thing in the world to catch it
(intake #641). An unlinted mirror of the CI gate is exactly the file that
should be linted hardest.

The three open questions in #643, settled by measuring first:
  * SEVERITY: shellcheck's DEFAULT (= style, its strictest floor: info and
    style findings included), not the `-S warning` a downstream runs. The
    corpus was already clean at default the day this landed, so there was
    nothing to grandfather -- and a permissive start would only invite the
    drift back in under the bar.
  * DISCOVERY: by shebang, not a path list -- a future scripts/*.sh or a hook
    that grows one is linted without anyone remembering to register it.
    Extension `.sh` is unioned in for shell carrying no shebang. Untracked
    files are included on the #556 principle: the worktree is where a new
    script exists at preflight time, and catching it pre-push is the whole
    point of a local gate.
    ADOPTION (#690, intake #681): default severity means a downstream whose
    preflight sources a machine-local file -- nvm, a venv activate, an env
    file -- meets `SC1091 (info): Not following: ./nvm.sh was not specified
    as input` on its very first run. That is a real finding with a per-site
    remedy (`# shellcheck source=/dev/null` above the source line), NOT a
    reason to lower the severity globally. Upstream cannot reproduce it --
    this repo's preflight sources nothing -- which is exactly why the gap
    survived to be reported downstream. Full note: README.md > Per-feature
    adoption notes.
  * AVAILABILITY, deliberately asymmetric: shellcheck is not on every dev box,
    so a missing binary is a loud SKIP locally (rc=0) -- but a HARD FAIL under
    CI, because CI is the one environment we control, and a gate that quietly
    skips itself there is the silent-load class this repo keeps closing.

Why a Python script for a shell linter: one invocation, three call sites
(preflight.sh, preflight.ps1, ci.yml). Re-implementing shebang discovery in
PowerShell is precisely the mirror drift this file exists to avoid.

Wiring (four-way mirror, audit_ops_config-enforced): preflight.{sh,ps1}
"shellcheck" stage <-> ci.yml "Shellcheck (shebang-discovered shell)" step +
PREFLIGHT_TO_CI row; --selftest is offline/side-effect-free (#319) and
registered in SELFTEST_SCRIPTS.
"""
import os
import re
import shutil
import subprocess
import sys

# Windows cp1252 stdout guard (#296): gate output carries non-ASCII.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# cwd-independent: the script lives in scripts/, the repo root is its parent.
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# `#!/bin/sh -eu`, `#!/usr/bin/env bash`, `#!/usr/bin/ksh`. Deliberately NOT
# every `#!` line: handing a Python hook's shebang to shellcheck would fail
# the gate on files it cannot parse. Word-bounded, so `fish` never matches.
SHEBANG = re.compile(rb"^#!.*\b(?:ba|da|k|z|a)?sh\b")


def is_shell(name, first_line):
    """`.sh` by extension, or line 1 is a shell shebang. Pure on purpose --
    the selftest drives it directly; the file read stays with the caller."""
    return name.endswith(".sh") or bool(SHEBANG.match(first_line))


def discover():
    out = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        capture_output=True, text=False,
    ).stdout
    names = sorted({p.decode("utf-8", "replace") for p in out.split(b"\0") if p})
    found = []
    for name in names:
        try:
            # Bytes, not text: the corpus includes binaries, and a decode
            # error must never blind the gate to the file next to it.
            with open(name, "rb") as fh:
                line = fh.readline(200)
        except OSError:
            continue
        if is_shell(name, line):
            found.append(name)
    return found


def format_report(files, have_binary, in_ci):
    """-> (lines, rc). Pure (#319), extracted so the selftest drives the exact
    text and verdict main() produces (#746).

    Returns the verdict alongside the text rather than lines alone, because in
    this gate the branches ARE the decision: the same missing binary is a FAIL
    in CI and a SKIP on a dev box, and that asymmetry is the whole design (CI is
    the one environment we control, so an unlinted CI run is a config bug, not a
    code defect). `rc is None` means "environment is fine, go run shellcheck" --
    the one branch that stays in main(), since it shells out.

    Before this, all three verdicts lived inline and none had ever been executed
    by a test: they need a missing binary or an empty repo to reach, so a normal
    run touches only the fourth. Inverting the CI test here would silently turn
    every unlinted CI run green, which no fixture would have noticed (#746).
    """
    if not files:
        # Legitimate for a ps1-only downstream (D-218): it declared its shells
        # and deleted the dead mirror. Not silent -- the line says so.
        return (["shellcheck: no shell files found -- nothing to lint."], 0)
    if not have_binary:
        if in_ci:
            return ([f"shellcheck: FAIL -- binary absent from the CI runner; "
                     f"{len(files)} shell file(s) went unlinted.",
                     "  This is a CI config bug, not a code defect: CI is the one "
                     "environment we control, so the gate is loud here by design "
                     "(it SKIPs on a dev box). Install it in the workflow."], 1)
        return ([f"shellcheck: SKIP -- binary not installed; {len(files)} shell "
                 f"file(s) unlinted.",
                 "  apt install shellcheck / brew install shellcheck / "
                 "winget install koalaman.shellcheck",
                 "  CI runs this gate regardless, so a local skip only defers the "
                 "finding to the PR."], 0)
    return ([f"shellcheck: {len(files)} file(s) at default severity "
             f"(style+): {', '.join(files)}"], None)


def main():
    files = discover()
    lines, rc = format_report(files, shutil.which("shellcheck") is not None,
                              bool(os.environ.get("CI")))
    for line in lines:
        print(line)
    if rc is not None:
        return rc
    return subprocess.run(["shellcheck", *files]).returncode


# --- selftest (offline, side-effect-free; run by audit_ops_config) ----------
def selftest():
    failed = 0

    def check(name, got, want):
        nonlocal failed
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} shellcheck-discovery: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    check("bash shebang", is_shell("x", b"#!/usr/bin/env bash\n"), True)
    check("bare sh shebang with flags", is_shell("x", b"#!/bin/sh -eu\n"), True)
    check("ksh / zsh", is_shell("x", b"#!/usr/bin/ksh\n"), True)
    check(".sh extension without a shebang", is_shell("lib.sh", b"echo hi\n"), True)
    check("Python hook is NOT shell", is_shell("h.py", b"#!/usr/bin/env python3\n"), False)
    check("fish is NOT shell (word boundary)", is_shell("x", b"#!/usr/bin/fish\n"), False)
    check("no shebang at all", is_shell("README.md", b"# Title\n"), False)
    # A `#!` that isn't line 1 never reaches the matcher (the caller reads one
    # line) -- but an anchored regex is the belt to that suspenders.
    check("mid-file shebang text", is_shell("x", b"see #!/bin/sh below\n"), False)
    # Binary first bytes must not raise -- the gate reads every tracked file.
    check("binary garbage is inert", is_shell("x", b"\x89PNG\r\n\x1a\n"), False)

    # --- the three environment verdicts (#746). Each needs a missing binary or
    # an empty repo to reach, so an ordinary run executes only the fourth; an
    # inverted CI test here would turn every unlinted CI run green, silently.
    check("#746: no shell files is clean, not a failure (D-218 ps1-only)",
          format_report([], False, True)[1], 0)
    check("#746: a missing binary in CI is a FAIL",
          format_report(["a.sh"], False, True)[1], 1)
    check("#746: the same missing binary on a dev box is a SKIP",
          format_report(["a.sh"], False, False)[1], 0)
    check("#746: binary present defers the verdict to shellcheck itself",
          format_report(["a.sh"], True, False)[1], None)
    check("#746: the CI FAIL says it is a config bug, not a code defect",
          any("CI config bug" in ln for ln in format_report(["a.sh"], False, True)[0]), True)
    check("#746: the dev-box SKIP names the install commands",
          any("apt install shellcheck" in ln
              for ln in format_report(["a.sh"], False, False)[0]), True)
    check("#746: the lint line names the files it is about to lint",
          "a.sh" in format_report(["a.sh"], True, False)[0][0], True)

    # Zero-match reality check (#473): WARN, never fail -- a ps1-only downstream
    # legitimately has no shell, but upstream discovering none means the gate
    # has gone dark and nobody would have noticed.
    live = discover()
    if not live:
        print("WARN shellcheck-discovery: zero shell files found in this repo -- "
              "expected if this project declares no `sh` shell, otherwise the "
              "gate is silently dark.")
    else:
        print(f"PASS shellcheck-discovery: live repo -> {len(live)} shell file(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv[1:] else main())
