#!/usr/bin/env bash
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
cd "$(dirname "$0")/.."

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
stage() {
    local name="$1"; shift
    [ "$FAILED" -ne 0 ] && return 0
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
    local name="$1"; shift
    [ "$FAILED" -ne 0 ] && return 0
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

# --- The gates: the same commands as ci.yml's `format & lint` + `build & test` jobs
#     (run sequentially here; those jobs run in parallel in CI). ---
run_if_node "format --check" npm run format:check
run_if_node "lint (adapter isolation + angular-eslint)" npm run lint

if [ "$QUICK" -eq 0 ]; then
    # `npm run build:lib` = ng build caelum -> US-origin attestation -> per-entry gzip
    # size gate. Called by name (like format/lint) so package.json stays the single
    # source of truth and CI (`npm run build:lib`) can't drift from preflight.
    run_if_node "build library (+ US-origin attestation + size budget)" npm run build:lib
    # Forge in production config exercises the angular.json 400/600 kB budgets.
    run_if_node "build Forge (production budgets)" npx ng build forge
    # Vitest suite (caelum + Forge). No headless run-loop smoke: Caelum is a
    # client-side library, Forge a static SPA — build+test IS the operability proof.
    run_if_node "test (caelum + Forge)" test_ci
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

# Doc-drift budgets (#67), ops-config three-way-mirror integrity (#71), and the
# repo-docs relative-link audit (#73) — gates from the pyxis template sync (#245),
# mirroring ci.yml's static-gates steps and preflight.ps1 (same stage names).
stage "doc budgets" python3 scripts/audit_docs.py
stage "ops-config audit" python3 scripts/audit_ops_config.py
stage "repo-docs links" python3 scripts/audit_repo_links.py

# Content-drift staleness (#222) — claim-heavy docs (research notes + ARCHITECTURE) whose
# referenced files changed after the doc's last commit. WARN-ONLY: the script always
# exits 0; warnings are re-verify prompts. Mirrors ci.yml's "Staleness audit" step.
stage "staleness audit (warn-only)" python3 scripts/audit_staleness.py

todo_hygiene() {
    # Mirrors ci.yml's hygiene step (same pathspecs, same regex — change both together).
    git rev-parse --verify -q origin/main >/dev/null 2>&1 \
        || { echo "(no origin/main yet — skipped)"; return 0; }
    local naked
    naked=$(git diff origin/main...HEAD -- . ':!*.md' ':!.github' ':!textbooks' \
        ':!scripts/preflight.sh' ':!scripts/preflight.ps1' ':!.claude' ':!scripts/audit_ops_config.py' \
        | grep -E '^\+' | grep -vE '^\+\+\+' \
        | sed -E 's/(todo|fixme)\(#[0-9]+\)//gI' | grep -iE '\b(todo|fixme)\b' || true)
    [ -z "$naked" ] || { echo "$naked"; echo "naked TODO/FIXME — file a ticket and write TODO(#NN)"; return 1; }
}
stage "todo hygiene (vs origin/main)" todo_hygiene

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

if [ "$FAILED" -ne 0 ]; then
    echo "PREFLIGHT: FAIL — do not push"
    exit 1
fi
if [ "$SKIPPED" -gt 0 ]; then
    echo "PREFLIGHT: PASS with $SKIPPED unconfigured stage(s) skipped — run configure_project to make them real"
else
    echo "PREFLIGHT: PASS — safe to push"
fi
