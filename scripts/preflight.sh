#!/usr/bin/env bash
# shellcheck disable=SC2034  # SKIP_SMOKE: documented no-op flag (no run-loop smoke gate), kept for CLI compat
# preflight.sh — every merge-blocking gate, locally, in CI order.
# TEMPLATE: replace each `skip_stage` placeholder with a real `stage` body from
# PROJECT_CONVENTIONS.md › Build & Test (the same commands .github/workflows/ci.yml
# runs — keep the two mirrored: if you change one, change the other).
#
# Run before EVERY push. A clean preflight means CI should be green; a red CI
# after a clean preflight is environmental (read the log, don't guess). This
# kills the "fix one lint, push, wait for CI to find the next one" loop.
# The CI posture (PROJECT_CONVENTIONS.md > Operating posture) paces when CI
# re-runs these gates; preflight always runs ALL of them, in every posture —
# in light/manual postures this script IS the heavy-gate evidence.
# (Windows-native equivalent: scripts/preflight.ps1. Single-shell project?
# Declare it in scripts/audit_ops_config.py PREFLIGHT_SHELLS and delete the
# dead mirror — the audit skips the parity checks for absent shells; D-218.)
#
# All stages are real (configured by #6). The format/lint/build/test stages need
# the Node toolchain — when npx isn't on PATH they SKIP (loudly, counted in the
# summary) rather than false-PASS; run with PATH="$HOME/nodejs/bin:$PATH" to
# exercise them (durable dev-env/CI Node wiring is #15). The audit / provenance /
# hygiene stages are node-free and always run.
#
# Flags: --quick (skip build/test; audits + hygiene always run) · --skip-smoke (no-op — kept for CLI compatibility; Caelum has no run-loop smoke gate)
set -u
# `|| exit` is load-bearing, not lint appeasement (SC2164): there is no `set -e`
# here, so a failed cd would run every stage against whatever tree the caller
# happened to be in — a verdict about the wrong repo (#642).
cd "$(dirname "$0")/.." || exit 1

QUICK=0
SKIP_SMOKE=0
for arg in "$@"; do
    case "$arg" in
        --quick) QUICK=1 ;;
        --skip-smoke) SKIP_SMOKE=1 ;;
        *) echo "unknown flag: $arg (use --quick, --skip-smoke)" >&2; exit 2 ;;
    esac
done

# --- python3 sentinel (#299, intake #289) — shell-level, python-free, FIRST.
# Every gate below AND every .claude/ hook (guards, telemetry, session banner)
# plus the statusline runs through python3 — and hooks are fail-open by design,
# so a dead interpreter removes the guard rails SILENTLY. The banner can't
# self-report (it is python); preflight is the loud sentinel. Fresh Windows
# boxes resolve python3 to the dead Microsoft Store alias stub; real installs
# ship python.exe but no python3.exe (hit live downstream).
if ! python3 -c 'print("ok")' >/dev/null 2>&1; then
    echo "FAIL  python3 sentinel — 'python3' is missing or not executable here."
    echo "  Every gate below and every .claude/ hook depends on it, and hooks are"
    echo "  fail-open: without it the guards, telemetry, and banner die SILENTLY."
    echo "  Remedy (Windows): real installs ship python.exe but no python3.exe —"
    echo "    copy or mklink python.exe -> python3.exe beside it (precedes the"
    echo "    WindowsApps stub on PATH), and disable the Store 'App execution"
    echo "    alias' for python3. Store Python ships python3.exe already."
    echo "  Remedy (Debian/Ubuntu): sudo apt install python3."
    echo "PREFLIGHT: FAIL — do not push"
    exit 1
fi

FAILED=0
SKIPPED=0
UNWIRED=0
# Declared-unwired stages (#612): a project declines a conditionally-applicable
# gate with ONE line in UNWIRED_STAGES (scripts/audit_ops_config.py); both
# runners read that list here and report the stage UNWIRED — a third state,
# distinct from FAIL and from the unconfigured SKIP placeholder. Fail-soft
# toward RUNNING: if the query dies, nothing is unwired and every gate runs.
UNWIRED_TSV=$(python3 scripts/audit_ops_config.py --unwired-stages 2>/dev/null) || UNWIRED_TSV=""
unwired_reason() {
    # Prints the declared reason and succeeds iff "$1" is declared unwired.
    # Name passes via ENVIRON (-v escape-processes backslashes); trailing CR
    # stripped for Git-Bash-on-Windows query output.
    [ -n "$UNWIRED_TSV" ] && printf '%s\n' "$UNWIRED_TSV" \
        | UNWIRED_NAME="$1" awk -F'\t' \
            '$1==ENVIRON["UNWIRED_NAME"]{sub(/\r$/,"",$2); print $2; found=1} END{exit !found}'
}
mark_unwired() {
    echo "==> $1"
    echo "UNWIRED  $1 ($2)"
    UNWIRED=$((UNWIRED + 1))
}
# Full output, unconditionally -- this matches Invoke-Stage in preflight.ps1.
# Don't re-add a log-and-print-a-pointer mode: EXP-09 refuted it (#691).
stage() {
    local name="$1"; shift
    [ "$FAILED" -ne 0 ] && return 0
    local why
    if why=$(unwired_reason "$name"); then
        mark_unwired "$name" "$why"
        return 0
    fi
    echo "==> $name"
    local t0=$SECONDS
    if "$@"; then
        echo "PASS  $name ($((SECONDS - t0))s)"
    else
        echo "FAIL  $name ($((SECONDS - t0))s)"
        FAILED=1
    fi
}
skip_stage() {
    # An unconfigured placeholder: reports SKIP (counted in the summary) instead
    # of a hollow PASS. configure_project replaces these with real `stage` bodies.
    # A DECLINED placeholder reports UNWIRED instead: declined is not
    # unconfigured, and configure_project must never "fill" it (#612).
    local name="$1"; shift
    [ "$FAILED" -ne 0 ] && return 0
    local why
    if why=$(unwired_reason "$name"); then
        mark_unwired "$name" "$why"
        return 0
    fi
    echo "==> $name"
    echo "SKIP  $name ($*)"
    SKIPPED=$((SKIPPED + 1))
}
run_if_node() {
    # Run a stage only when the Node toolchain is on PATH; else SKIP with a note.
    # CI runs these via setup-node (#6); locally, exercise them with
    # PATH="$HOME/nodejs/bin:$PATH" bash scripts/preflight.sh (durable dev-env Node → #15).
    local name="$1"; shift
    [ "$FAILED" -ne 0 ] && return 0
    if command -v npx >/dev/null 2>&1; then
        stage "$name" "$@"
    else
        skip_stage "$name" "needs Node on PATH — run with PATH=\"\$HOME/nodejs/bin:\$PATH\" (durable wiring → #15)"
    fi
}
test_ci() {
    # Vitest via @angular/build:unit-test (jsdom, no browser). CI=true makes the
    # builder run once and exit instead of watching (GitHub Actions sets it too).
    CI=true npx ng test || return 1
}
test_browser_ci() {
    CI=true npm run test:browser || return 1
}
test_vr_ci() {
    CI=true npm run test:vr || return 1
}
run_if_browser() {
    # The real-browser suite (#240) needs a Playwright browser build on this box.
    # CI installs one explicitly; a dev machine may have none, and that must SKIP
    # loudly rather than fail the whole preflight — the suite is a supplement to
    # the jsdom gate, not a second copy of it. `--check` resolves without running.
    #
    # $1 = stage name, $2 = "--vr" to ask the VR resolver instead, rest = command.
    local name="$1"; shift
    local mode=""
    if [ "${1:-}" = "--vr" ]; then mode="--vr"; shift; fi
    [ "$FAILED" -ne 0 ] && return 0
    if ! command -v npx >/dev/null 2>&1; then
        skip_stage "$name" "needs Node on PATH — run with PATH=\"\$HOME/nodejs/bin:\$PATH\" (durable wiring → #15)"
    elif node scripts/test-browser.mjs $mode --check >/dev/null 2>&1; then
        stage "$name" "$@"
    elif [ -n "${CAELUM_TEST_BROWSER:-}" ]; then
        # A pin that cannot resolve is a broken request, NOT an absent browser —
        # skipping it would report PASS for a suite that never ran (#538's shape).
        # Re-run --check as the stage so its own message is the failure output.
        stage "$name" node scripts/test-browser.mjs $mode --check
    else
        # VR is stricter than the behavioural suite: it also declines a non-Linux
        # box, because a missing golden is CREATED rather than failed there (#735).
        skip_stage "$name" "no usable Chromium/platform for this suite — node scripts/test-browser.mjs $mode --check"
    fi
}

# --- The gates: the same commands as ci.yml's `format & lint` + `build & test` jobs
#     (run sequentially here; those jobs run in parallel in CI). ---
run_if_node "format --check" npm run format:check
run_if_node "lint (adapter isolation + angular-eslint)" npm run lint

if [ "$QUICK" -eq 0 ]; then
    # `npm run build:lib` = ng build caelum, then the post-build package gates:
    # US-origin attestation -> per-entry gzip size budget -> exports completeness (#28)
    # -> grid engine tree-shake (#182) -> package surface / installability (#851).
    # Called by name (like format/lint) so package.json stays the single source of
    # truth and CI (`npm run build:lib`) can't drift from preflight. The STAGE NAME is
    # deliberately gate-list-agnostic: the chain is package.json's business, and naming
    # its members here made the label go stale twice (it still said "size budget" three
    # gates later). Adding a gate to build:lib must not force a four-file mirror edit.
    run_if_node "build library (+ post-build package gates)" npm run build:lib
    # Forge in production config exercises the angular.json 400/600 kB budgets.
    run_if_node "build Forge (production budgets)" npx ng build forge
    # Vitest suite (caelum + Forge). No headless run-loop smoke: Caelum is a
    # client-side library, Forge a static SPA — build+test IS the operability proof.
    run_if_node "test (caelum + Forge)" test_ci
    # Build-tooling unit tests (node --test, no new dependency): the browser
    # resolver's fallback arm can only be exercised with an injected probe.
    run_if_node "test scripts (node --test)" npm run test:scripts
    # Real-browser suite (#240) — the *.browser.spec.ts files the jsdom target
    # excludes. Skips loudly when no browser build is installed.
    run_if_browser "test (real browser)" test_browser_ci
    # Visual-regression goldens (#732) — the *.vr.spec.ts arms. Chromium+Linux
    # only, and it says so when it skips rather than reporting a phantom pass.
    run_if_browser "test (visual regression)" --vr test_vr_ci
fi

# --- Real-from-day-one gates (mirror ci.yml's consolidated `static gates` job) ---
library_audits() {
    python3 textbooks/tools/_gen_sections.py || return 1
    # The COMMITTED index is what agents grep to verify citations — regen must be a no-op.
    git diff --quiet -- textbooks/SECTIONS.json \
        || { echo "SECTIONS.json is stale — commit the regenerated index"; return 1; }
    python3 textbooks/tools/_audit_refs.py || return 1
    python3 textbooks/tools/_audit_routing.py || return 1
    python3 textbooks/tools/_audit_links.py
}
stage "library audits" library_audits

stage "research audit" python3 research/tools/_audit_research.py

# Dependency-provenance gate (issue #4, D-11): the M0-2 scan automated. Node-free
# (reads the committed package-lock.json + provenance/allowlist.json), so it runs
# in every posture and mirrors CI's static-gates job.
stage "provenance (deps license + US-origin, D-11)" python3 scripts/check_provenance.py

# Theming-invariant gate (D-04, guard #498): component sources take every design
# value from the --cae-* bridge — mechanical since the file-upload escape (#496).
# Node-free; mirrors ci.yml's static-gates step.
stage "theming scan (D-04 token-only)" python3 scripts/check_theming.py

# Evidence-gated-done gate (#733): docs/CAPABILITY_LEDGER.md is generated from repo
# evidence, so it goes stale the moment a component ships; this also refuses a sign-off
# pointer that does not resolve to a commit touching that entry point. Node-free;
# mirrors ci.yml's static-gates step.
stage "capability ledger (evidence-gated done)" python3 scripts/capability_ledger.py --check

# Parity-map tracking gate (#810): every ☐ row in textbooks/reference/COMPARISON.md
# names a tracking issue, the promise the map makes twice and docs/MIGRATION.md repeats
# to consumers. The ledger stage above grades M4's exit clause 2; this grades clause 1,
# so the milestone is measured by gates rather than re-litigated (#808). Node-free.
stage "parity map (COMPARISON tracking refs)" python3 scripts/audit_comparison.py

# Doc-drift budgets (#67), ops-config three-way-mirror integrity (#71), and the
# repo-docs relative-link audit (#73) — gates from the pyxis template sync (#245),
# mirroring ci.yml's static-gates steps and preflight.ps1 (same stage names).
stage "doc budgets" python3 scripts/audit_docs.py
stage "ops-config audit" python3 scripts/audit_ops_config.py

# Shellcheck (#643, the guard behind #642) — this very script is the most-copied
# shell in the template's blast radius, and it was linted by nothing until a
# downstream's linter found the bug. Shebang-discovered, default severity;
# SKIPs loudly when the binary is absent locally, hard-fails when absent in CI.
# Mirrors ci.yml's "Shellcheck (shebang-discovered shell)" step.
stage "shellcheck" python3 scripts/audit_shell.py

# Repo-docs link audit (#73) — root/docs/.claude/.github/_intake relative links;
# textbooks/ and research/ have their own checkers. Mirrors ci.yml's "Repo-docs link audit" step.
stage "repo-docs links" python3 scripts/audit_repo_links.py

# Name-leak audit (#363; D-455 accepted 2026-07-18: registry-fed runtime list
# over structural heuristics/hybrid) — shipped machinery carries no project codenames;
# the name list is fetched at run time from the pinned registry issue, never
# embedded (a shipped denylist would itself leak, #343). No reachable registry
# (downstream copy, offline) → loud SKIP. Mirrors ci.yml's "Name-leak audit" step.
stage "name-leak audit" python3 scripts/audit_name_leaks.py

# Secret-scan gate (#221) — tracked files carry no live credentials; named
# provider patterns with full random tails (redacted/prefix-only mentions are
# inert), private-key headers. Deliberate fixture? `secret-scan:allow` on the
# line. Mirrors ci.yml's "Secret scan" step.
stage "secret scan" python3 scripts/audit_secrets.py

# Content-drift staleness (#222) — claim-heavy docs (research notes + ARCHITECTURE) whose
# referenced files changed after the doc's last commit. WARN-ONLY: the script always
# exits 0; warnings are re-verify prompts. Mirrors ci.yml's "Staleness audit" step.
stage "staleness audit (warn-only)" python3 scripts/audit_staleness.py

# Skill eval admission gate (#302) — every gated skill's goldens parse and its
# eval stamp is green AND fresh (hashes match the current SKILL.md + goldens).
# Static only: agents never run here — the suite itself runs session-side
# (.claude/skills/EVALS.md). Mirrors ci.yml's "Skill evals" step.
stage "skill evals" python3 scripts/skill_evals.py audit

# Closing-keyword audit (#727) — GitHub's parser reads no context, so a negated,
# qualified, quoted, or past-tense mention beside a live issue number retires that
# ticket. Set equality: every closing ref must also appear in a subject line or a
# trailer line. Locally this sees the branch's commits (no PR context pre-push);
# CI adds the PR title/body and the closingIssuesReferences oracle. Mirrors
# ci.yml's "Closing-keyword audit" step.
stage "closing keywords" python3 scripts/audit_closing_keywords.py

todo_hygiene() {
    # Mirrors ci.yml's hygiene step (same pathspecs, same regex — change both together).
    # Local window is merge-base→WORKTREE plus untracked files (#556): the uncommitted
    # tree is exactly where a formatter can create a naked marker (a downstream's ruff
    # format merged adjacent string literals into one — the committed-range form stayed
    # green on a tree whose commit would go red). CI keeps the committed PR range:
    # tree == HEAD there, so the two windows gate the same set.
    git rev-parse --verify -q origin/main >/dev/null 2>&1 \
        || { echo "(no origin/main yet — skipped)"; return 0; }
    strip_ticketed() { sed -E 's/([Tt][Oo][Dd][Oo]|[Ff][Ii][Xx][Mm][Ee])\(#[0-9]+\)//g'; }
    local exempt=(':!*.md' ':!.github' ':!textbooks' \
        ':!scripts/preflight.sh' ':!scripts/preflight.ps1' ':!.claude' \
        ':!scripts/audit_ops_config.py' \
        ':!research/experiments/*/prompts/*')
    local naked untracked fail=0
    naked=$(git diff "$(git merge-base origin/main HEAD)" -- . "${exempt[@]}" \
        | grep -E '^\+' | grep -vE '^\+\+\+' \
        | strip_ticketed | grep -iE '\b(todo|fixme)\b' || true)
    untracked=$(git ls-files --others --exclude-standard -- . "${exempt[@]}" \
        | while IFS= read -r f; do
            strip_ticketed <"$f" 2>/dev/null | grep -qiE '\b(todo|fixme)\b' \
                && echo "+(untracked) $f"
        done || true)
    [ -z "$naked" ] || { echo "$naked"; fail=1; }
    [ -z "$untracked" ] || { echo "$untracked"; fail=1; }
    [ "$fail" -eq 0 ] || { echo "naked TODO/FIXME — file a ticket and write TODO(#NN)"; return 1; }
}
stage "todo hygiene (merge-base->worktree)" todo_hygiene

# Commit-message semantics (#591) — a closing keyword under a negation ("not
# fixed: #580") closes the ticket it documents as deferred. Pre-push is the only
# moment it is still fixable: undoing it on main would need a rewrite, which the
# merge policy forbids. Mirrors ci.yml's "Commit-message semantics" step, which
# additionally passes the PR title/body through the environment.
stage "commit-msg semantics (vs origin/main)" python3 scripts/check_commit_msgs.py

# Slice telemetry (fail-open, #255): total gate duration -> the local ledger
# (.claude/metrics/preflight_times.jsonl); metrics.py trends it as the
# suite-growth lens. Never blocks: any failure here is swallowed.
python3 scripts/slice_telemetry.py preflight "$SECONDS" "$FAILED" "$SKIPPED" >/dev/null 2>&1 || true

if [ "$UNWIRED" -gt 0 ]; then
    echo "note: $UNWIRED stage(s) declared unwired (UNWIRED_STAGES, scripts/audit_ops_config.py) — declined, not unconfigured"
fi
if [ "$FAILED" -ne 0 ]; then
    echo "PREFLIGHT: FAIL — do not push"
    exit 1
fi
if [ "$SKIPPED" -gt 0 ]; then
    echo "PREFLIGHT: PASS with $SKIPPED unconfigured stage(s) skipped — run configure_project to make them real"
else
    echo "PREFLIGHT: PASS — safe to push"
fi
