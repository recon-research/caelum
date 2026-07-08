# preflight.ps1 — every merge-blocking gate, locally, in CI order.
# TEMPLATE: replace each `Skip-Stage` placeholder with a real `Invoke-Stage` body from
# PROJECT_CONVENTIONS.md > Build & Test (the same commands .github/workflows/ci.yml
# runs — keep the two mirrored: if you change one, change the other).
#
# Run before EVERY push. A clean preflight means CI should be green; a red CI
# after a clean preflight is environmental (read the log, don't guess).
# The CI posture (PROJECT_CONVENTIONS.md > Operating posture) paces when CI
# re-runs these gates; preflight always runs ALL of them, in every posture --
# in light/manual postures this script IS the heavy-gate evidence.
# (POSIX equivalent: scripts/preflight.sh.)
#
# All stages are real (configured by #6). The format/lint/build/test stages need
# the Node toolchain -- when npx isn't on PATH they SKIP (loudly, counted in the
# summary) rather than false-PASS. The audit / provenance / hygiene stages are
# node-free and always run.
#
# Windows PowerShell 5.1 compatible (no &&, no ternary). Keep output strings
# ASCII: PS 5.1 reads un-BOM'd .ps1 files as ANSI, so non-ASCII renders as mojibake.
#
# Flags: -Quick (skip build/test; audits + hygiene always run) -SkipSmoke (no-op -- kept for CLI compatibility; Caelum has no run-loop smoke gate)
[CmdletBinding()]
param(
    [switch]$Quick,
    [switch]$SkipSmoke
)

Set-Location (Split-Path -Parent $PSScriptRoot)

$script:Failed = $false
$script:Skipped = 0
$Watch = [System.Diagnostics.Stopwatch]::new()

function Skip-Stage {
    # An unconfigured placeholder: reports SKIP (counted in the summary) instead
    # of a hollow PASS. configure_project replaces these with real Invoke-Stage bodies.
    param([string]$Name, [string]$Reason)
    if ($script:Failed) { return }
    Write-Host "==> $Name" -ForegroundColor Cyan
    Write-Host "SKIP  $Name ($Reason)" -ForegroundColor Yellow
    $script:Skipped++
}

function Invoke-Stage {
    param([string]$Name, [scriptblock]$Body)
    if ($script:Failed) { return }
    Write-Host "==> $Name" -ForegroundColor Cyan
    $Watch.Restart()
    # Reset so a body that runs no native command can't inherit a stale exit
    # code, and a body whose command fails to even start (typo'd tool) can't
    # false-PASS: $? catches command-not-found, $LASTEXITCODE catches nonzero.
    $global:LASTEXITCODE = 0
    $ok = $true
    try {
        & $Body
        if (-not $?) { $ok = $false }
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { $ok = $false }
    }
    catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        $ok = $false
    }
    $secs = [math]::Round($Watch.Elapsed.TotalSeconds, 1)
    if (-not $ok) {
        Write-Host "FAIL  $Name (${secs}s)" -ForegroundColor Red
        $script:Failed = $true
    }
    else {
        Write-Host "PASS  $Name (${secs}s)" -ForegroundColor Green
    }
}

function Invoke-StageIfNode {
    # Run a stage only when the Node toolchain is on PATH; else SKIP with a note.
    # CI runs these via setup-node (#6); the durable dev-env Node wiring is #15.
    param([string]$Name, [scriptblock]$Body)
    if ($script:Failed) { return }
    if (Get-Command npx -ErrorAction SilentlyContinue) {
        Invoke-Stage $Name $Body
    }
    else {
        Skip-Stage $Name 'needs Node on PATH (durable wiring - #15)'
    }
}

# --- The gates: the same commands as ci.yml's `format & lint` + `build & test` jobs
#     (run sequentially here; those jobs run in parallel in CI). ---
Invoke-StageIfNode 'format --check' { npm run format:check }
Invoke-StageIfNode 'lint (adapter isolation + angular-eslint)' { npm run lint }

if (-not $Quick) {
    # `npm run build:lib` = ng build caelum -> US-origin attestation -> per-entry gzip
    # size gate. Called by name (like format/lint) so package.json stays the single
    # source of truth; cmd.exe's && short-circuits, LASTEXITCODE catches a failure.
    Invoke-StageIfNode 'build library (+ US-origin attestation + size budget)' { npm run build:lib }
    # Forge in production config exercises the angular.json 400/600 kB budgets.
    Invoke-StageIfNode 'build Forge (production budgets)' { npx ng build forge }
    # Vitest suite (caelum + Forge). No headless run-loop smoke: Caelum is a
    # client-side library, Forge a static SPA -- build+test IS the operability proof.
    # CI=true makes the builder run once and exit (GitHub Actions sets it too).
    Invoke-StageIfNode 'test (caelum + Forge)' {
        $env:CI = 'true'
        npx ng test
    }
}

# --- Real-from-day-one gates (mirror ci.yml's consolidated `static gates` job) ---
Invoke-Stage 'library audits' {
    python textbooks/tools/_gen_sections.py
    if ($LASTEXITCODE -ne 0) { return }
    # The COMMITTED index is what agents grep to verify citations - regen must be a no-op.
    git diff --quiet -- textbooks/SECTIONS.json
    if ($LASTEXITCODE -ne 0) { Write-Host 'SECTIONS.json is stale - commit the regenerated index'; return }
    python textbooks/tools/_audit_refs.py
    if ($LASTEXITCODE -ne 0) { return }
    python textbooks/tools/_audit_routing.py
    if ($LASTEXITCODE -ne 0) { return }
    python textbooks/tools/_audit_links.py
}

Invoke-Stage 'research audit' { python research/tools/_audit_research.py }

# Dependency-provenance gate (issue #4, D-11): the M0-2 scan automated. Node-free
# (reads the committed package-lock.json + provenance/allowlist.json), mirrors
# CI's static-gates job.
Invoke-Stage 'provenance (deps license + US-origin, D-11)' { python scripts/check_provenance.py }

# Doc-drift budgets (#67), ops-config three-way-mirror integrity (#71), and the
# repo-docs relative-link audit (#73) - gates from the pyxis template sync (#245),
# mirroring ci.yml's static-gates steps and preflight.sh (same stage names).
Invoke-Stage 'doc budgets' { python scripts/audit_docs.py }
Invoke-Stage 'ops-config audit' { python scripts/audit_ops_config.py }
Invoke-Stage 'repo-docs links' { python scripts/audit_repo_links.py }

Invoke-Stage 'todo hygiene (vs origin/main)' {
    # Mirrors ci.yml's hygiene step (same pathspecs, same regex - change both together).
    $null = git rev-parse --verify -q origin/main
    if ($LASTEXITCODE -ne 0) { $global:LASTEXITCODE = 0; Write-Host '(no origin/main yet - skipped)'; return }
    $diffLines = git diff origin/main...HEAD -- . ':!*.md' ':!.github' ':!textbooks' ':!scripts/preflight.sh' ':!scripts/preflight.ps1' ':!.claude' ':!scripts/audit_ops_config.py'
    $naked = @($diffLines | Where-Object { $_ -match '^\+' -and $_ -notmatch '^\+\+\+' -and $_ -match '(?i)\b(todo|fixme)\b(?!\(#\d+\))' })
    if ($naked.Count -gt 0) {
        $naked | ForEach-Object { Write-Host $_ }
        Write-Host 'naked TODO/FIXME - file a ticket and write TODO(#NN)'
        $global:LASTEXITCODE = 1
    }
}

if ($script:Failed) {
    Write-Host 'PREFLIGHT: FAIL - do not push' -ForegroundColor Red
    exit 1
}
if ($script:Skipped -gt 0) {
    Write-Host "PREFLIGHT: PASS with $($script:Skipped) unconfigured stage(s) skipped - run configure_project to make them real" -ForegroundColor Yellow
}
else {
    Write-Host 'PREFLIGHT: PASS - safe to push' -ForegroundColor Green
}
exit 0
