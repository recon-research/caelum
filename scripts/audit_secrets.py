#!/usr/bin/env python3
"""audit_secrets.py -- mechanical secret-scan gate over the worktree (#221; exits non-zero).

The repo's only secret guard was written policy ("verify no secrets before
any push"); this is the mechanical rung. Rung 1 of #221's ladder --
GitHub-native secret scanning + push protection -- is unavailable here
(personal-plan private repo: security_and_analysis is null, verified
2026-07-23), so this stdlib pattern scan is the ladder's first available
rung, and it inherits to downstreams via the normal template sync
regardless of their plan or visibility.

Precision over recall, ON PURPOSE: named provider patterns whose tails are
long random strings (a GitHub token needs its full 36-char tail; `gho_***`
redactions and prefix-only prose never match), plus private-key block
headers. No entropy heuristics -- a generic-high-entropy rung is a
different trade (false positives in a docs-heavy repo) and needs its own
ticket if the residual ever bites. A deliberate example that must live in
a tracked file opts out with `secret-scan:allow` on the same line.

Residuals accepted at admission (#221): a secret on a pushed branch reaches
the remote before CI judges it (a push-time guard would need rung 1 or a
PreToolUse hook -- escalation is a retrospective call, #310 shape); and
coverage is the named-pattern list, not all conceivable credentials.

Findings print file:line + pattern name with the match REDACTED (first 8
chars) -- the gate must never republish what it caught.

Wiring (four-way mirror, audit_ops_config-enforced): preflight.{sh,ps1}
"secret scan" stage <-> ci.yml "Secret scan" step + PREFLIGHT_TO_CI row;
--selftest is offline/side-effect-free (#319) and registered in
SELFTEST_SCRIPTS. Corpus fixtures are split literals (concatenated at run
time) so this file's own text never matches its own patterns.
"""
import os
import re
import subprocess
import sys

# Windows cp1252 stdout guard (#296): gate output carries non-ASCII.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# cwd-independent: the script lives in scripts/, the repo root is its parent.
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

ALLOW_MARKER = "secret-scan:allow"

# (name, pattern). Tails are exact-length random segments -- that's what makes
# redacted/truncated mentions inert. Sources deliberately don't match
# themselves (a character class is not 36 alphanumerics).
PATTERNS = [
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,255}\b")),
    ("github-pat", re.compile(r"\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b")),
    ("anthropic-key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{32,}")),
    ("openai-key", re.compile(
        r"\bsk-proj-[A-Za-z0-9_-]{40,}|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b")),
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}\b")),
    ("stripe-key", re.compile(r"\b[sr]k_live_[0-9a-zA-Z]{24,}\b")),
    ("private-key-block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----")),
]


def scan_lines(lines):
    """[(lineno, pattern-name, redacted-match)] for one file's lines. Pure --
    the selftest corpus drives this directly (#319)."""
    findings = []
    for i, line in enumerate(lines, 1):
        if ALLOW_MARKER in line:
            continue
        for name, rx in PATTERNS:
            m = rx.search(line)
            if m:
                findings.append((i, name, m.group(0)[:8] + "…"))
    return findings


def scan_files():
    # WORKTREE, NOT INDEX (#656, the #556 principle one gate over). Plain
    # `ls-files` sees only staged paths, while `ship_pr` runs preflight at step 1
    # and stages at step 3 -- so every new file is invisible the first time this
    # gate sees the tree, which is precisely where a pasted credential lands.
    # `--exclude-standard` honours .gitignore, so .env / *.key / *.pem stay out
    # (deliberately untracked) while a non-ignored `creds.txt` sitting in the
    # tree now fails preflight loudly -- correct: it is one `git add .` from
    # being committed. CI is unaffected (a runner's tree has no untracked files).
    r = subprocess.run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                       capture_output=True, timeout=60)
    if r.returncode != 0:
        sys.exit("audit_secrets: git ls-files failed -- cannot enumerate files to scan")
    return [p for p in r.stdout.decode("utf-8", "replace").split("\0") if p]


def format_report(hits, scanned):
    """The gate's entire output -- both paths -- as a list of lines. Pure (#319),
    extracted so the selftest drives the exact text main() prints (#746).

    Covers the green path too, unlike its siblings, because this gate's summary
    line prints either way: splitting it would leave main() holding formatting
    again, which is the thing #746 is retiring. Callers decide the exit code
    from `hits`, never from this text.

    The findings are already redacted upstream in `scan_lines` (first 8 chars +
    an ellipsis) and this function must not un-redact them -- a gate whose
    defect class is textual keeps its own report quotable (#728), or the fixer
    pastes the leak into the PR body as done-gate evidence.
    """
    out = [f"Secret scan: {scanned} text files (tracked + untracked) | "
           f"findings: {len(hits)}"]
    out.extend(f"  LEAK? {h}" for h in hits)
    if hits:
        out.append("audit_secrets: FAIL -- rotate anything real, rewrite it out of "
                   "history before merge; a deliberate fixture takes the allow marker.")
    return out


def main():
    hits, scanned = [], 0
    for path in scan_files():
        try:
            data = open(path, "rb").read()
        except OSError:
            continue  # ls-files can name a path deleted in the working tree
        if b"\0" in data[:8192]:
            continue  # binary
        scanned += 1
        for lineno, name, redacted in scan_lines(data.decode("utf-8", "replace").splitlines()):
            hits.append(f"{path}:{lineno}  {name}  {redacted}")
    for line in format_report(hits, scanned):
        print(line)
    return 1 if hits else 0


# --- selftest (offline, side-effect-free; run by audit_ops_config) ----------
def selftest():
    failed = 0

    def check(name, lines, want):
        nonlocal failed
        got = [(n) for _, n, _ in scan_lines(lines)]
        ok = got == want
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'} secret-scan: {name}"
              + ("" if ok else f" -> {got!r} (want {want!r})"))

    # Live-shaped fixtures, split so this file never matches itself.
    gh = "ghp_" + "Ab1" * 12                      # 36-char tail
    pat = "github_pat_" + "A1" * 11 + "_" + "b2C" * 19 + "xy"
    ant = "sk-ant-" + "api03-" + "Zx9" * 12
    aws = "AKIA" + "EXAMPLE123456789"[:16].ljust(16, "Q")
    slack = "xoxb-" + "123456789012-abcDEF"
    key = "-----BEGIN OPENSSH " + "PRIVATE KEY-----"

    check("github token fires", [f"export GH_TOKEN={gh}"], ["github-token"])
    check("fine-grained PAT fires", [pat], ["github-pat"])
    check("anthropic key fires", [f'key = "{ant}"'], ["anthropic-key"])
    check("aws + slack, one per line", [aws, slack],
          ["aws-access-key", "slack-token"])
    check("aws temp-cred (ASIA) fires", ["ASIA" + "J7Q2" * 4], ["aws-access-key"])
    check("private key header fires", [key], ["private-key-block"])
    check("redacted token is inert", ["Token: gho_" + "*" * 36], [])
    check("prefix-only prose is inert",
          ["the gh[pousr]_ family, e.g. ghp_ tokens; sk-ant- keys"], [])
    # Literal marker on purpose, never the constant: the documented opt-out
    # string is a contract; a drifted ALLOW_MARKER must go red here.
    check("allow marker suppresses", [gh + "  # secret-scan:allow"], [])
    check("pattern source is inert",
          [r'("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,255}\b"))'], [])
    check("PRIVATE KEY prose is inert", ["never commit a PRIVATE KEY file"], [])

    # Redaction contract: the finding truncates the match to 8 chars.
    red = scan_lines([gh])[0][2]
    ok = red == gh[:8] + "…" and len(red) == 9
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'} secret-scan: finding is redacted"
          + ("" if ok else f" -> {red!r}"))

    # --- the report itself (#746). The FAIL half runs only when the tree is
    # dirty, and this gate's report is the one a fixer pastes as evidence, so a
    # drift here breaks the redaction contract above at the worst moment (#728).
    def rcheck(name, got, want):
        nonlocal failed
        passed = got == want
        failed += 0 if passed else 1
        print(f"{'PASS' if passed else 'FAIL'} secret-scan: {name}"
              + ("" if passed else f" -> {got!r} (want {want!r})"))

    clean = format_report([], 12)
    rcheck("#746: a clean scan reports the count and nothing else",
           clean, ["Secret scan: 12 text files (tracked + untracked) | findings: 0"])
    dirty = format_report([f"a.py:3  GitHub token  {red}"], 12)
    rcheck("#746: the summary counts the findings it lists",
           dirty[0].endswith("| findings: 1"), True)
    rcheck("#746: each finding is listed under the LEAK? marker",
           dirty[1], f"  LEAK? a.py:3  GitHub token  {red}")
    rcheck("#746: a dirty scan closes with the FAIL verdict",
           dirty[-1].startswith("audit_secrets: FAIL"), True)
    rcheck("#746: the report never un-redacts what scan_lines truncated",
           any(gh in ln for ln in dirty), False)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv[1:] else main())
