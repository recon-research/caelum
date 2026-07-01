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
# The library-audit / research-audit / todo-hygiene stages are REAL from day
# one (they mirror ci.yml's enforced jobs); the format/lint/build/test/smoke
# stages report SKIP — loudly, with a summary count — until configure_project
# fills them. A fresh copy is green but says exactly what it did NOT verify.
#
# Windows PowerShell 5.1 compatible (no &&, no ternary). Keep output strings
# ASCII: PS 5.1 reads un-BOM'd .ps1 files as ANSI, so non-ASCII renders as mojibake.
#
# Flags: -Quick (skip build/test/smoke; audits + hygiene always run) · -SkipSmoke (skip the run-loop gate)
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

# --- The gates, in the same order as ci.yml. configure_project replaces the Skip-Stage placeholders. ---
Skip-Stage 'format --check' 'unconfigured - configure_project fills this stage (PROJECT_CONVENTIONS.md > Format / lint)'
Skip-Stage 'lint (warnings as errors)' 'unconfigured - configure_project fills this stage'

if (-not $Quick) {
    Skip-Stage 'build' 'unconfigured - configure_project fills this stage'
    Skip-Stage 'test' 'unconfigured - configure_project fills this stage'
    if (-not $SkipSmoke) {
        # The headless / CI-operability gate (validate_headless_mode). Drop if no run loop.
        Skip-Stage 'headless smoke' 'unconfigured - configure_project fills this stage'
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

Invoke-Stage 'todo hygiene (vs origin/main)' {
    # Mirrors ci.yml's hygiene step (same pathspecs, same regex - change both together).
    $null = git rev-parse --verify -q origin/main
    if ($LASTEXITCODE -ne 0) { $global:LASTEXITCODE = 0; Write-Host '(no origin/main yet - skipped)'; return }
    $diffLines = git diff origin/main...HEAD -- . ':!*.md' ':!.github' ':!textbooks' ':!scripts/preflight.sh' ':!scripts/preflight.ps1' ':!.claude'
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
