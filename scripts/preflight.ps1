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
# (POSIX equivalent: scripts/preflight.sh. Single-shell project?
# Declare it in scripts/audit_ops_config.py PREFLIGHT_SHELLS and delete the
# dead mirror -- the audit skips the parity checks for absent shells; D-218.)
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

# Known asymmetry vs the sh mirror (documented, accepted): this moves the CALLER's
# cwd to the repo root for the rest of the session (the sh script's `cd` dies with
# its subshell). Kept because the script exits from many stages and a Push/Pop pair
# across every exit path costs more than the asymmetry (#503).
Set-Location (Split-Path -Parent $PSScriptRoot)

$script:Failed = $false
$script:Skipped = 0
$script:Unwired = 0
$Watch = [System.Diagnostics.Stopwatch]::new()
$Total = [System.Diagnostics.Stopwatch]::StartNew()

# --- python3 sentinel (#299, intake #289) -- shell-level, python-free, FIRST.
# Every gate below AND every .claude/ hook (guards, telemetry, session banner)
# plus the statusline runs through python3 -- and hooks are fail-open, so a
# dead interpreter removes the guard rails SILENTLY. Fresh Windows boxes
# resolve python3 to the dead Microsoft Store alias stub; real installs ship
# python.exe but no python3.exe (hit live downstream).
$py3ok = $false
try {
    $global:LASTEXITCODE = 0
    $null = & python3 -c "print('ok')" 2>$null
    if ($? -and $LASTEXITCODE -eq 0) { $py3ok = $true }
} catch { $py3ok = $false }
if (-not $py3ok) {
    Write-Host "FAIL  python3 sentinel -- 'python3' is missing or not executable here." -ForegroundColor Red
    Write-Host "  Every gate below and every .claude/ hook depends on it, and hooks are"
    Write-Host "  fail-open: without it the guards, telemetry, and banner die SILENTLY."
    Write-Host "  Remedy (Windows): real installs ship python.exe but no python3.exe --"
    Write-Host "    copy or mklink python.exe -> python3.exe beside it (precedes the"
    Write-Host "    WindowsApps stub on PATH), and disable the Store 'App execution"
    Write-Host "    alias' for python3. Store Python ships python3.exe already."
    Write-Host "PREFLIGHT: FAIL -- do not push" -ForegroundColor Red
    exit 1
}

# Declared-unwired stages (#612): a project declines a conditionally-applicable
# gate with ONE line in UNWIRED_STAGES (scripts/audit_ops_config.py); both
# runners read that list here and report the stage UNWIRED -- a third state,
# distinct from FAIL and from the unconfigured SKIP placeholder. Fail-soft
# toward RUNNING: if the query dies, nothing is unwired and every gate runs.
# Non-generic Hashtable ctor is case-SENSITIVE (@{} is not), matching sh's
# awk exactness; exit-code gate mirrors sh's `|| UNWIRED_TSV=""` -- partial
# stdout from a dying query must unwire nothing.
$script:UnwiredStages = New-Object System.Collections.Hashtable
try {
    $unwiredLines = @(python3 scripts/audit_ops_config.py --unwired-stages 2>$null)
    if ($LASTEXITCODE -eq 0) {
        foreach ($line in $unwiredLines) {
            $parts = "$line" -split "`t", 2
            if ($parts.Count -eq 2) { $script:UnwiredStages[$parts[0]] = $parts[1] }
        }
    }
}
catch { $script:UnwiredStages = New-Object System.Collections.Hashtable }
$global:LASTEXITCODE = 0

function Test-Unwired {
    # Reports UNWIRED and returns $true iff $Name is declared unwired (#612).
    param([string]$Name)
    if (-not $script:UnwiredStages.ContainsKey($Name)) { return $false }
    Write-Host "==> $Name" -ForegroundColor Cyan
    Write-Host "UNWIRED  $Name ($($script:UnwiredStages[$Name]))" -ForegroundColor Yellow
    $script:Unwired++
    return $true
}

function Skip-Stage {
    # An unconfigured placeholder: reports SKIP (counted in the summary) instead
    # of a hollow PASS. configure_project replaces these with real Invoke-Stage bodies.
    # A DECLINED placeholder reports UNWIRED instead: declined is not
    # unconfigured, and configure_project must never "fill" it (#612).
    param([string]$Name, [string]$Reason)
    if ($script:Failed) { return }
    if (Test-Unwired $Name) { return }
    Write-Host "==> $Name" -ForegroundColor Cyan
    Write-Host "SKIP  $Name ($Reason)" -ForegroundColor Yellow
    $script:Skipped++
}

function Invoke-Stage {
    param([string]$Name, [scriptblock]$Body)
    if ($script:Failed) { return }
    if (Test-Unwired $Name) { return }
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

function Invoke-StageIfBrowser {
    # The real-browser suite (#240) needs a Playwright browser build on this box.
    # CI installs one explicitly; a dev machine may have none, and that must SKIP
    # loudly rather than fail the whole preflight -- the suite supplements the
    # jsdom gate, it does not replace it. `--check` resolves without running.
    #
    # -Vr asks the stricter visual-regression resolver (#732) instead: goldens
    # are per-engine AND per-platform, and a missing golden is CREATED rather
    # than failed, so a Firefox or non-Linux run would mint a parallel set that
    # passes locally and CI never compares (#735). On Windows this always skips.
    param([string]$Name, [scriptblock]$Body, [switch]$Vr)
    if ($script:Failed) { return }
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Skip-Stage $Name 'needs Node on PATH (durable wiring - #15)'
        return
    }
    $mode = if ($Vr) { @('--vr') } else { @() }
    node scripts/test-browser.mjs @mode --check *> $null
    if ($LASTEXITCODE -eq 0) {
        Invoke-Stage $Name $Body
    }
    elseif ($env:CAELUM_TEST_BROWSER) {
        # A pin that cannot resolve is a broken request, NOT an absent browser --
        # skipping it would report PASS for a suite that never ran (#538's shape).
        # Re-run --check as the stage so its own message is the failure output.
        Invoke-Stage $Name { node scripts/test-browser.mjs @mode --check }
    }
    else {
        Skip-Stage $Name 'no usable Chromium/platform for this suite - node scripts/test-browser.mjs --check'
    }
}

# --- The gates: the same commands as ci.yml's `format & lint` + `build & test` jobs
#     (run sequentially here; those jobs run in parallel in CI). ---
Invoke-StageIfNode 'format --check' { npm run format:check }
Invoke-StageIfNode 'lint (adapter isolation + angular-eslint)' { npm run lint }

if (-not $Quick) {
    # `npm run build:lib` = ng build caelum, then the post-build package gates:
    # US-origin attestation -> per-entry gzip size budget -> exports completeness (#28)
    # -> grid engine tree-shake (#182) -> package surface / installability (#851).
    # Called by name (like format/lint) so package.json stays the single source of
    # truth; cmd.exe's && short-circuits, LASTEXITCODE catches a failure. The STAGE
    # NAME is deliberately gate-list-agnostic — see the note in preflight.sh.
    Invoke-StageIfNode 'build library (+ post-build package gates)' { npm run build:lib }
    # Forge in production config exercises the angular.json 400/600 kB budgets.
    Invoke-StageIfNode 'build Forge (production budgets)' { npx ng build forge }
    # Vitest suite (caelum + Forge). No headless run-loop smoke: Caelum is a
    # client-side library, Forge a static SPA -- build+test IS the operability proof.
    # CI=true makes the builder run once and exit (GitHub Actions sets it too).
    Invoke-StageIfNode 'test (caelum + Forge)' {
        # Scope CI=true to this stage: PS scripts run in-process, so a bare assignment
        # leaks into the calling session (the sh mirror's `CI=true npx ng test` is
        # per-command by construction) (#503).
        $prevCI = $env:CI
        $env:CI = 'true'
        try {
            npx ng test
        } finally {
            if ($null -eq $prevCI) { Remove-Item Env:\CI -ErrorAction SilentlyContinue } else { $env:CI = $prevCI }
        }
    }
    # Build-tooling unit tests (node --test, no new dependency): the browser
    # resolver's fallback arm can only be exercised with an injected probe.
    Invoke-StageIfNode 'test scripts (node --test)' { npm run test:scripts }
    # Real-browser suite (#240) -- the *.browser.spec.ts files the jsdom target
    # excludes. Skips loudly when no browser build is installed.
    Invoke-StageIfBrowser 'test (real browser)' {
        # CI=true scoped to this stage, same reason as the jsdom stage above (#503).
        $prevCI = $env:CI
        $env:CI = 'true'
        try {
            npm run test:browser
        } finally {
            if ($null -eq $prevCI) { Remove-Item Env:\CI -ErrorAction SilentlyContinue } else { $env:CI = $prevCI }
        }
    }
    # Visual-regression goldens (#732) -- the *.vr.spec.ts arms. Chromium+Linux
    # only, so this stage always SKIPS here and says why (#735).
    Invoke-StageIfBrowser 'test (visual regression)' -Vr {
        $prevCI = $env:CI
        $env:CI = 'true'
        try {
            npm run test:vr
        } finally {
            if ($null -eq $prevCI) { Remove-Item Env:\CI -ErrorAction SilentlyContinue } else { $env:CI = $prevCI }
        }
    }
}

# --- Real-from-day-one gates (mirror ci.yml's consolidated `static gates` job) ---
Invoke-Stage 'library audits' {
    python3 textbooks/tools/_gen_sections.py
    if ($LASTEXITCODE -ne 0) { return }
    # The COMMITTED index is what agents grep to verify citations - regen must be a no-op.
    git diff --quiet -- textbooks/SECTIONS.json
    if ($LASTEXITCODE -ne 0) { Write-Host 'SECTIONS.json is stale - commit the regenerated index'; return }
    python3 textbooks/tools/_audit_refs.py
    if ($LASTEXITCODE -ne 0) { return }
    python3 textbooks/tools/_audit_routing.py
    if ($LASTEXITCODE -ne 0) { return }
    python3 textbooks/tools/_audit_links.py
}

Invoke-Stage 'research audit' { python3 research/tools/_audit_research.py }

# Dependency-provenance gate (issue #4, D-11): the M0-2 scan automated. Node-free
# (reads the committed package-lock.json + provenance/allowlist.json), mirrors
# CI's static-gates job.
Invoke-Stage 'provenance (deps license + US-origin, D-11)' { python3 scripts/check_provenance.py }

# Theming-invariant gate (D-04, guard #498): component sources take every design
# value from the --cae-* bridge - mechanical since the file-upload escape (#496).
Invoke-Stage 'theming scan (D-04 token-only)' { python3 scripts/check_theming.py }

# Evidence-gated-done gate (#733): docs/CAPABILITY_LEDGER.md is generated from repo
# evidence, so it goes stale the moment a component ships; this also refuses a sign-off
# pointer that does not resolve to a commit touching that entry point. Node-free.
Invoke-Stage 'capability ledger (evidence-gated done)' { python3 scripts/capability_ledger.py --check }

# Parity-map tracking gate (#810): every planned row in textbooks/reference/COMPARISON.md
# names a tracking issue, the promise the map makes twice and docs/MIGRATION.md repeats
# to consumers. The ledger stage above grades M4's exit clause 2; this grades clause 1,
# so the milestone is measured by gates rather than re-litigated (#808). Node-free.
Invoke-Stage 'parity map (COMPARISON tracking refs)' { python3 scripts/audit_comparison.py }

# Doc-drift budgets (#67), ops-config three-way-mirror integrity (#71), and the
# repo-docs relative-link audit (#73) - gates from the pyxis template sync (#245),
# mirroring ci.yml's static-gates steps and preflight.sh (same stage names).
Invoke-Stage 'doc budgets' { python3 scripts/audit_docs.py }
Invoke-Stage 'ops-config audit' { python3 scripts/audit_ops_config.py }

# Shellcheck (#643, the guard behind #642) - shebang-discovered shell at default
# severity. On Windows the binary is usually absent: the stage SKIPs loudly
# rather than failing (it hard-fails only in CI). Mirrors ci.yml's
# "Shellcheck (shebang-discovered shell)" step.
Invoke-Stage 'shellcheck' { python3 scripts/audit_shell.py }

# Repo-docs link audit (#73) - root/docs/.claude/.github/_intake relative links;
# textbooks/ and research/ have their own checkers. Mirrors ci.yml's "Repo-docs link audit" step.
Invoke-Stage 'repo-docs links' { python3 scripts/audit_repo_links.py }

# Name-leak audit (#363; D-455 accepted 2026-07-18: registry-fed runtime list
# over structural heuristics/hybrid) - shipped machinery carries no project codenames;
# the name list is fetched at run time from the pinned registry issue, never
# embedded (a shipped denylist would itself leak, #343). No reachable registry
# (downstream copy, offline) -> loud SKIP. Mirrors ci.yml's "Name-leak audit" step.
Invoke-Stage 'name-leak audit' { python3 scripts/audit_name_leaks.py }

# Secret-scan gate (#221) - tracked files carry no live credentials; named
# provider patterns with full random tails (redacted/prefix-only mentions are
# inert), private-key headers. Deliberate fixture? `secret-scan:allow` on the
# line. Mirrors ci.yml's "Secret scan" step.
Invoke-Stage 'secret scan' { python3 scripts/audit_secrets.py }

# Closing-keyword audit (#727) - GitHub's parser reads no context, so a negated,
# qualified, quoted, or past-tense mention beside a live issue number retires that
# ticket. Set equality: every closing ref must also appear in a subject line or a
# trailer line. Locally this sees the branch's commits (no PR context pre-push);
# CI adds the PR title/body and the closingIssuesReferences oracle. Mirrors
# ci.yml's "Closing-keyword audit" step.
Invoke-Stage 'closing keywords' { python3 scripts/audit_closing_keywords.py }

# Content-drift staleness (#222) - claim-heavy docs (research notes + ARCHITECTURE) whose
# referenced files changed after the doc's last commit. WARN-ONLY: the script always
# exits 0; warnings are re-verify prompts. Mirrors ci.yml's "Staleness audit" step.
Invoke-Stage 'staleness audit (warn-only)' { python3 scripts/audit_staleness.py }

# Skill eval admission gate (#302) - every gated skill's goldens parse and its
# eval stamp is green AND fresh (hashes match the current SKILL.md + goldens).
# Static only: agents never run here - the suite itself runs session-side
# (.claude/skills/EVALS.md). Mirrors ci.yml's "Skill evals" step.
Invoke-Stage 'skill evals' { python3 scripts/skill_evals.py audit }

Invoke-Stage 'todo hygiene (merge-base->worktree)' {
    # Mirrors ci.yml's hygiene step (same pathspecs, same regex - change both together).
    # Local window is merge-base->WORKTREE plus untracked files (#556): the uncommitted
    # tree is exactly where a formatter can create a naked marker; CI keeps the
    # committed PR range (tree == HEAD there, so the two windows gate the same set).
    $null = git rev-parse --verify -q origin/main
    if ($LASTEXITCODE -ne 0) { $global:LASTEXITCODE = 0; Write-Host '(no origin/main yet - skipped)'; return }
    $exempt = @(':!*.md', ':!.github', ':!textbooks', ':!scripts/preflight.sh', ':!scripts/preflight.ps1', ':!.claude', ':!scripts/audit_ops_config.py', ':!research/experiments/*/prompts/*')
    $mergeBase = "$(git merge-base origin/main HEAD)".Trim()
    $diffLines = git diff $mergeBase -- . @exempt
    $naked = @($diffLines | Where-Object { $_ -match '^\+' -and $_ -notmatch '^\+\+\+' -and $_ -match '(?i)\b(todo|fixme)\b(?!\(#\d+\))' })
    $untracked = @()
    foreach ($f in @(git ls-files --others --exclude-standard -- . @exempt)) {
        $hits = @(Get-Content -LiteralPath $f -ErrorAction SilentlyContinue |
            Where-Object { $_ -match '(?i)\b(todo|fixme)\b(?!\(#\d+\))' })
        if ($hits.Count -gt 0) { $untracked += "+(untracked) $f" }
    }
    $global:LASTEXITCODE = 0
    if ($naked.Count -gt 0 -or $untracked.Count -gt 0) {
        $naked | ForEach-Object { Write-Host $_ }
        $untracked | ForEach-Object { Write-Host $_ }
        Write-Host 'naked TODO/FIXME - file a ticket and write TODO(#NN)'
        $global:LASTEXITCODE = 1
    }
}

# Commit-message semantics (#591) - a closing keyword under a negation ("not
# fixed: #580") closes the ticket it documents as deferred. Pre-push is the only
# moment it is still fixable: undoing it on main would need a rewrite, which the
# merge policy forbids. Mirrors ci.yml's "Commit-message semantics" step, which
# additionally passes the PR title/body through the environment.
Invoke-Stage 'commit-msg semantics (vs origin/main)' { python3 scripts/check_commit_msgs.py }

# Slice telemetry (fail-open, #255): total gate duration -> the local ledger
# (.claude/metrics/preflight_times.jsonl); metrics.py trends it as the
# suite-growth lens. Never blocks: any failure here is swallowed.
try {
    $failedFlag = 0; if ($script:Failed) { $failedFlag = 1 }
    python3 scripts/slice_telemetry.py preflight ([int]$Total.Elapsed.TotalSeconds) $failedFlag $script:Skipped *> $null
}
catch {}
$global:LASTEXITCODE = 0

if ($script:Unwired -gt 0) {
    Write-Host "note: $($script:Unwired) stage(s) declared unwired (UNWIRED_STAGES, scripts/audit_ops_config.py) - declined, not unconfigured"
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
