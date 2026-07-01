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
# (Windows-native equivalent: scripts/preflight.ps1.)
#
# The library-audit / research-audit / todo-hygiene stages are REAL from day
# one (they mirror ci.yml's enforced jobs); the format/lint/build/test/smoke
# stages report SKIP — loudly, with a summary count — until configure_project
# fills them. A fresh copy is green but says exactly what it did NOT verify.
#
# Flags: --quick (skip build/test/smoke; audits + hygiene always run) · --skip-smoke (skip the run-loop gate)
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
    # The durable dev-env/CI Node wiring is #15/#6; until then, exercise these
    # locally with  PATH="$HOME/nodejs/bin:$PATH" bash scripts/preflight.sh.
    local name="$1"; shift
    [ "$FAILED" -ne 0 ] && return 0
    if command -v npx >/dev/null 2>&1; then
        stage "$name" "$@"
    else
        skip_stage "$name" "needs Node on PATH — wired into CI/preflight at #6 (see #15)"
    fi
}
library_gates() {
    # The shipped-library gates (issue #4): build the lib, emit + verify the
    # US-origin attestation, enforce the per-entry-point size budget.
    npx ng build caelum || return 1
    node scripts/emit-us-origin-attestation.mjs dist/caelum || return 1
    node scripts/check-lib-size.mjs || return 1
}

# --- The gates, in the same order as ci.yml. configure_project replaces the skip_stage placeholders. ---
skip_stage "format --check" "unconfigured — configure_project fills this stage (PROJECT_CONVENTIONS.md > Format / lint)"
run_if_node "lint (adapter isolation + angular-eslint)" npm run lint

if [ "$QUICK" -eq 0 ]; then
    skip_stage "build" "unconfigured — configure_project fills this stage"
    skip_stage "test" "unconfigured — configure_project fills this stage"
    if [ "$SKIP_SMOKE" -eq 0 ]; then
        # The headless / CI-operability gate (validate_headless_mode). Drop if no run loop.
        skip_stage "headless smoke" "unconfigured — configure_project fills this stage"
    fi
    run_if_node "library gates (build + US-origin attestation + size budget)" library_gates
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

todo_hygiene() {
    # Mirrors ci.yml's hygiene step (same pathspecs, same regex — change both together).
    git rev-parse --verify -q origin/main >/dev/null 2>&1 \
        || { echo "(no origin/main yet — skipped)"; return 0; }
    local naked
    naked=$(git diff origin/main...HEAD -- . ':!*.md' ':!.github' ':!textbooks' \
        ':!scripts/preflight.sh' ':!scripts/preflight.ps1' ':!.claude' \
        | grep -E '^\+' | grep -vE '^\+\+\+' \
        | sed -E 's/(todo|fixme)\(#[0-9]+\)//gI' | grep -iE '\b(todo|fixme)\b' || true)
    [ -z "$naked" ] || { echo "$naked"; echo "naked TODO/FIXME — file a ticket and write TODO(#NN)"; return 1; }
}
stage "todo hygiene (vs origin/main)" todo_hygiene

if [ "$FAILED" -ne 0 ]; then
    echo "PREFLIGHT: FAIL — do not push"
    exit 1
fi
if [ "$SKIPPED" -gt 0 ]; then
    echo "PREFLIGHT: PASS with $SKIPPED unconfigured stage(s) skipped — run configure_project to make them real"
else
    echo "PREFLIGHT: PASS — safe to push"
fi
