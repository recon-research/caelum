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

# Doc-drift budgets (#67), ops-config three-way-mirror integrity (#71), and the
# repo-docs relative-link audit (#73) — gates from the pyxis template sync (#245),
# mirroring ci.yml's static-gates steps and preflight.ps1 (same stage names).
stage "doc budgets" python3 scripts/audit_docs.py
stage "ops-config audit" python3 scripts/audit_ops_config.py
stage "repo-docs links" python3 scripts/audit_repo_links.py

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

if [ "$FAILED" -ne 0 ]; then
    echo "PREFLIGHT: FAIL — do not push"
    exit 1
fi
if [ "$SKIPPED" -gt 0 ]; then
    echo "PREFLIGHT: PASS with $SKIPPED unconfigured stage(s) skipped — run configure_project to make them real"
else
    echo "PREFLIGHT: PASS — safe to push"
fi
