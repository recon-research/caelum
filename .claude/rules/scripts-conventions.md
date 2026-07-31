---
paths:
  - "scripts/**"
  - ".github/workflows/**"
  - ".claude/hooks/**"
---

# Working on the machinery (scripts / workflows / hooks) — auto-injected reminder

Path-scoped rule (#307): loads only when a matching file is read. Canonical conventions live in `PROJECT_CONVENTIONS.md` and the file headers — this is the short reminder, not a second copy (mechanism + house stance: `docs/AUTOMATION.md` §7).

- **The three-way mirror**: a preflight stage exists in `preflight.sh`, `preflight.ps1`, AND `ci.yml` — via the `PREFLIGHT_TO_CI` map in `scripts/audit_ops_config.py`, its single home — or goes red; change one → change all in the same commit.
- **Windows-safe machinery** (`PROJECT_CONVENTIONS.md` › Shell gotchas): UTF-8 + `newline="\n"` on every committed write; stdout reconfigured at gate-script entry; no bare `python` in shipped machinery (D-210); PS 5.1 parses no `&&`.
- **An exit code that arrived through a pipe is not evidence** — both directions bite. False RED: `cmd | Select-Object -First N` broken-pipes the producer (exit 255 on a healthy run). False GREEN, the dangerous one: `cmd 2>&1 | tail -40` reports *tail's* status, so a failing gate reads as passed and gets absorbed. Verify with `${PIPESTATUS[0]}` / `| Out-Null; $LASTEXITCODE`, or judge the gate's own terminal `PREFLIGHT: PASS|FAIL` line, which is pipe-safe where the exit code is not (conventions › Build & Test).
- **Gates exit non-zero; telemetry is fail-soft** — audits and preflight stages hard-fail by design, the metrics/receipt layer never blocks work; don't invert either. Hook changes need side-effect-isolated fire-tests (#319) and `SELFTEST_HOOKS` registration (#356).
- **A gate whose defect class is textual keeps its own report quotable** (#728) — when the finding *is* the forbidden thing (a codename, a closing keyword, a credential), agents following "evidence is output, not assertion" paste it into a PR body and commit the defect. Summary line and counts safe by construction, echoed matches under a warning, redact in the locations (`audit_name_leaks.py` `format_findings` is the worked shape; the rule is single-homed in `definition_of_done` › Output). A gate that merely *locates* a defect — links, shellcheck, naked TODOs — is unaffected.
- **Command-matching hooks use the family's shared GIT/GH spelling token** — never a fresh bare `git\s`/`gh\s` anchor. Three spelling-gap escapes (#418 → #467 → #559) each bought a silent guard-bypass window; the token comments name their siblings — keep the twins in step (ANTI_PATTERNS "The Spelling-Changing Wrapper").
