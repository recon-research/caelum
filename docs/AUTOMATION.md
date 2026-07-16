# AUTOMATION.md — The Operator Console

The automation surfaces beyond the core loop. §1–2 and §6 are **already wired** in this template (§6 defaults to the `light` CI posture); §3–5 **require the human once** (credentials/UI). Standing rule either way: `.claude/settings.json` is permission machinery — the agent only changes it on your explicit, in-your-own-words instruction. Each item is tiered like a research note. Lazy-read: nothing here loads into sessions.

## 1. Hooks — zero-token mechanical gates `[production-proven]` *(wired)*

Six hook scripts in [`.claude/hooks/`](../.claude/hooks/), wired in [`settings.json`](../.claude/settings.json) (each file's header documents its contract; all **fail open** — any internal error allows, so a hook can never wedge the loop; docs: https://code.claude.com/docs/en/hooks, accessed 2026-06-10). The last two are **local telemetry** — zero-token JSONL appends under `.claude/metrics/` (gitignored) feeding `scripts/metrics.py` › Local telemetry:

| Hook | Event | What it does |
|---|---|---|
| [`block_naked_todos.py`](../.claude/hooks/block_naked_todos.py) | `PreToolUse` (Bash\|PowerShell) | Blocks `git commit` while the staged diff adds a naked TODO/FIXME — local CI parity at the moment of commit, zero tokens. Blocking hooks take precedence over the allowlist, so the pre-approved `git commit:*` can't bypass it. The matcher covers **both shell tools** — on native Windows the agent commits via PowerShell, and a Bash-only matcher silently never fires. |
| [`block_chained_merge.py`](../.claude/hooks/block_chained_merge.py) | `PreToolUse` (Bash\|PowerShell) | Blocks a checks-watch/poll **chained into `gh pr merge` in one command** — the shape fires the merge the instant the watch exits, even over a red gate, and where branch protection is unenforced nothing else stops it (#176 → #177). Zero legitimate uses ⇒ blocking is safe; checks run *after* a merge (the post-merge glance) stay allowed. Carries `guard: #253` provenance; denies append to the guard-hits ledger. |
| [`inject_rule_reminders.py`](../.claude/hooks/inject_rule_reminders.py) | `PreToolUse` (Bash\|PowerShell) | Injects the matching one-line rule as `additionalContext` at the moment of a high-stakes command — `git commit` (staging/here-doc/no-trailer rules), `gh pr merge` (read-green-first + separate-command, #177; routes to `ship_pr` steps 5–7), `gh pr create` (ship_pr step 4: claim exists, body-file, receipt owed), a push aimed at `main` (never direct), a `slice/*` branch push (the claim moment — ship_pr step 0, #263). The merge/pr-create/slice-push texts also **name the owning skill and the steps owed** — hooks fire regardless of context decay, so they carry routing back into skill-step-backed mechanics a hand-driven session would silently skip (#263, from a live Caelum field failure). Top-of-context prose decays as a session grows; this rides recency instead of fighting it (#252) — reminders are pointers to each rule's durable home, never second copies. **Non-blocking by design**: emits *no* `permissionDecision`, so it can never widen or narrow the permission flow. Fires append to `.claude/metrics/guard_hits.jsonl` (gitignored) — the guard-lifecycle telemetry (#253): zero fires = dead weight, constant fires = misaimed noise. |
| [`session_start_banner.py`](../.claude/hooks/session_start_banner.py) | `SessionStart` (startup\|resume\|clear + compact) | Injects a 1–3 line banner: Status-anchor staleness (As-of sha vs HEAD) + the open decision queue. The `compact` matcher re-grounds the agent right after a surprise compaction; `clear` covers post-`/clear` windows, which start just as blank. ~100 tokens. Fail-open side effect: appends the session-start event (`source` incl. `compact`) to `.claude/metrics/events.jsonl` — how `metrics.py` counts compactions — and rewrites `.claude/metrics/session.json` with the current session's identity, read by claim comments (`PROJECT_CONVENTIONS.md` › Concurrent writers). |
| [`log_skill_usage.py`](../.claude/hooks/log_skill_usage.py) | `PostToolUse` (Skill) | Appends one JSONL row per skill invocation to `.claude/metrics/skill_usage.jsonl` (gitignored) — the CMMI-L4 usage ledger behind `scripts/metrics.py` › Local telemetry. A skill at 0 invocations in a mature ledger flags dead weight or broken routing. Zero tokens; `PostToolUse` can't block by design. |
| [`log_permission_denials.py`](../.claude/hooks/log_permission_denials.py) | `PermissionDenied` (all tools) | Appends one JSONL row per denied tool call (tool, truncated detail, reason) to `.claude/metrics/permission_denials.jsonl` (gitignored) — each denial is an autopilot stall; `metrics.py` trends the count so retrospectives see interruptions as data. The matching behavior rule (denial = decision point → survey the human) is `CLAUDE.md` › Working style. Telemetry only, fail-open. **Verified live**: `PermissionDenied` fires for auto-mode *classifier* denials too, not just rule-based and interactive denies — classifier reasons may arrive unnamed ("No reason provided"), so the reason-field probing stays defensive. |

Beyond the hooks, a **statusLine** ([`.claude/statusline.py`](../.claude/statusline.py)) renders `<model> | ctx NN% used | $X.XX`, color-banded with a `→ prepare compaction` nudge at ≥80% — so the human's context indicator and `prepare_compaction`'s proactive contract agree on when it's time. Display-only (no permission surface); each refresh upserts a per-session ledger row under `.claude/metrics/` for `scripts/metrics.py`.

Hook config is snapshotted at session start — edits take effect next session (or after review via `/hooks`). Don't add a **blocking** PreCompact hook — wedging compaction at full context is worse than anything it could check.

## 2. The `settings.json` posture *(ships with the template — adopted by the kickoff authorization)*

**Approval model:** the allowlist arrives with the copy; the README's one-sentence kickoff line (*"…you have my permission to adjust the Claude Code settings and set everything up"*) is the downstream owner's adoption of it, plus permission for setup-time adjustments (machine-local `settings.local.json`, requested trims). An agent must never **widen** the allowlist beyond the shipped form on its own — platform safety blocks agent-authored permission widening as self-modification, by design; a fresh, explicit owner instruction in chat is the only path. Same boundary, commit-side (#242, surfaced by a downstream syncing D-210): a settings change touching both classes ships as **two commits** — owner-gated grant edits (`allow`/`deny`) separate from mechanical updates (hooks, statusLine, attribution) — so a downstream sync can apply the mechanical commit wholesale and route the grant commit to its owner, instead of splitting one diff by hand at apply time.

What the committed file carries, and why:

- **allow** — the full autopilot loop in **both shell tools** (Bash *and* PowerShell — on native Windows the agent runs PowerShell, and an un-mirrored allowlist prompts at every step): read git/gh, tracker writes, branch/commit/push, PR create+checks+merge, `scripts/preflight.{sh,ps1}`, and the library/research audits (cwd-independent, so both root-relative and in-dir spellings work). The git grants are **narrowed** to the loop's actual shapes: `checkout -b` (not bare `checkout`, which would pre-approve `checkout -- .` discards), `push -u origin` / `push origin` (not bare `push`), `worktree add/list/prune` (not `remove`); `git rm` and `git stash` are deliberately absent (rescue-branch, don't stash), and PowerShell gets **no `git commit`** — commits route through the Bash here-doc path (conventions › PR / commit mechanics).
- **deny** — tripwires for the policy-forbidden forms in both shells: `git push --force` / `-f`, `gh pr merge --admin`. The prefix grammar can't catch every flag position (`git push origin --force`, `gh pr merge 12 --admin` slip the prefixes), so these are seatbelts, not the guard — the guard is branch protection with **"include administrators"** where the plan enforces it (§5, including the free-tier caveat) plus the written policy (`PROJECT_CONVENTIONS.md` › Merge policy).
- **hooks** — §1, via the braced `${CLAUDE_PROJECT_DIR}` placeholder, which Claude Code substitutes itself before any shell parses the command — so the wiring is shell-independent and works from any launch directory (the unbraced form relied on POSIX expansion and could invert the fail-open design into a fail-closed block on Windows). **Verified on Windows** (Windows 10, PowerShell 5.1, 2026-06-11): at cold startup the banner fires, and `block_naked_todos` blocks a staged naked-TODO `git commit` through **both** the Bash and PowerShell tools — via the script's own `BLOCKED:` message, not `python: can't open file`. That block surfaces as a hook *error* carrying the `BLOCKED:` line — Claude Code's framing for a deny (exit 2), i.e. the gate working, **not** a broken hook to file a ticket against. (The substitution is Claude-Code-version-dependent; re-confirm on a new box by staging a bare `TODO`, attempting a commit, expecting `BLOCKED:`, then discarding.)
- **Optional, not set:** `fallbackModel` — fallback model(s) tried when the primary is unavailable (changelog v2.1.166) — would keep an overnight run alive through an availability blip. Verify the current key shape in the docs before adding. `[published]`

## 3. `@claude` GitHub Actions — answer decision issues from your phone `[production-proven]`

`anthropics/claude-code-action@v1` responds to `@claude` mentions on issues/PRs and can implement + open PRs (https://code.claude.com/docs/en/github-actions, accessed 2026-06-10). With it, commenting `@claude go with option B` on a `decision` issue gets the re-route implemented remotely — the decision loop no longer waits for your desk.

- **Auth (Max/Pro):** run `claude setup-token` locally → repo secret `CLAUDE_CODE_OAUTH_TOKEN` → pass as `claude_code_oauth_token` (https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md, accessed 2026-06-10).
- **PUBLIC-repo security** (https://github.com/anthropics/claude-code-action/blob/main/docs/security.md, accessed 2026-06-10): triggers are restricted to users with **write access** by default — keep it that way; never set `allowed_non_write_users`; leave `show_full_output` off (logs are public); third-party issue text is prompt-injection surface even with sanitization; bound cost with `claude_args: --max-turns`.
- Minimal workflow (`.github/workflows/claude.yml` — not shipped; add when you add the secret):

```yaml
name: Claude
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write, issues: write, id-token: write, actions: read }
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: "--max-turns 30"
```

## 4. Scheduled runs — nightly hygiene without a session `[production-proven]`

- **Desktop app → Routines → New routine → Local** (https://code.claude.com/docs/en/desktop-scheduled-tasks, accessed 2026-06-10): runs a fresh session on a schedule, optionally in an isolated worktree, with per-task always-allow permissions. Suggested nightly prompt: *"Run scripts/preflight (audits + hygiene), `python3 research/tools/_audit_research.py --strict-staleness`, and reconcile the CLAUDE.md Status block against `gh issue list`/`gh pr list`; file a `followup` issue for anything found; change nothing else."*
- **Cloud Routines** `[experimental — research preview]` (https://code.claude.com/docs/en/routines, accessed 2026-06-10): machine-off schedules and GitHub triggers — but only `pull_request`/`release` events (not issues), so decision-issue automation still needs §3.
- **Headless CI** (`claude -p --bare --output-format json`) for scripted gates in Actions (https://code.claude.com/docs/en/headless, accessed 2026-06-10). Note: from June 15, 2026, subscription `claude -p` draws from a separate monthly Agent SDK credit pool.

## 5. Branch protection (repo setup, attended)

Require PRs + the CI checks **and enable "include administrators"** — without it, `gh pr merge --admin` (inside the pre-approved `gh pr merge:*` grant) bypasses every gate. `onboard` Mode A marks this step attended; `gh api` is deliberately not pre-approved. **Which checks to require depends on the CI posture + gating (§6):** in `light` **and in `full`+`advisory`**, require only `static gates` — the heavy jobs are posture-/gating-skipped on PRs, and a skipped job satisfies a required check, but a job whose workflow never runs sits "Expected" forever and blocks the PR; in `full`+`blocking`, also require `heavy matrix gate` — the aggregation job (#206): its name is stable while the matrix-leg names shift with the platform trim, and it fails when `classify changes` itself errors — the zero-coverage skip that the individual heavy checks would satisfy as green; in `manual`, require no checks (the pasted preflight is the gate). Never require `classify changes` or the matrix legs directly (plumbing / unstable names; the aggregate covers both).

**Free-tier caveat (hard-won):** on a free-plan **private** repo GitHub does not enforce branch protection or rulesets at all — the protection UI exists but the rules don't bind. Mechanical enforcement requires GitHub Pro, an org plan, or making the repo public. Until then the written merge policy (`PROJECT_CONVENTIONS.md`) plus the allowlist's narrowed grants are the *only* guard — treat the settings.json `$comment`'s honesty about prefix-matching holes as load-bearing, and revisit protection the moment the repo's plan or visibility changes.

## 6. CI minutes & pacing — the posture system `[production-proven]` *(wired — `light` + `blocking` by default)*

**The burn problem.** GitHub-hosted runners are free on **public** repos; private repos draw from the plan's monthly pool — **Free: 2,000 min, Pro: 3,000 min** — and Windows runners bill ~1.7× Linux ($0.010 vs $0.006/min) (https://docs.github.com/en/billing/concepts/product-billing/github-actions, accessed 2026-06-12). The pre-posture workflow (6 jobs × 2 OSes, every PR push **and** every main push) billed several minutes per push; field report 2026-06-12: a downstream private copy burned ~2,000 min in one week — a whole month's Free pool. Public repos never feel this, which is exactly why a template developed on a public repo didn't.

**The fix: two repo variables + automatic path modularity.** `ci.yml` reads `CI_POSTURE` (how much runs) and `CI_GATING` (when the heavy matrix runs); both default to the safe value when unset, because an unset variable is the empty string in a job `if:` (https://docs.github.com/en/actions/learn-github-actions/variables, accessed 2026-06-12).

```
gh variable set CI_POSTURE --body <light|full|manual>     # unset = light
gh variable set CI_GATING  --body <blocking|advisory>     # unset = blocking
```

**`CI_POSTURE` — how much runs:**

| Posture | What runs automatically | Typical burn | Pick when |
|---|---|---|---|
| `light` *(default)* | one consolidated `static gates` job per PR — library + research audits, skills structure, TODO hygiene (ubuntu, ~1 min) | ~5–15 min/day | private repo on Free/Pro — the recommended default |
| `full` | static gates + build/test matrix + lint (see gating for *when*) | ~100–150 min/day blocking; far less advisory | public repo (minutes free), org pool, or self-hosted runner |
| `manual` | nothing | 0 | zero budget; a clean preflight pasted in the PR is the gate |

**`CI_GATING` — when the heavy matrix runs** (only meaningful in `full`; in `light` the matrix is already on-demand):

| Gating | Heavy matrix | Merge gate | The trade-off |
|---|---|---|---|
| `blocking` *(default)* | on the PR | heavy must be green to merge | safest; you wait for the matrix on every code PR |
| `advisory` | **post-merge on the main push** | `static gates` + preflight; heavy is a sanity check | no PR wait; a rare post-merge red is fixed forward via a filed `bug` |

Advisory's safety rests on one fact: **preflight runs the same heavy gates locally before every push**, so advisory *defers re-running already-passed tests*, it doesn't skip testing. A post-merge red therefore means an environment-specific drift (an OS-only failure the local run couldn't see) — the rare 1% — and the next `onboard` catches it (Mode B checks main health first thing), files a `bug`, and fixes forward. Cheap, because nothing was built on top yet. This is the right default for an **active solo autopilot loop on a private repo** (the case the field report came from); keep `blocking` for shared repos, public APIs, or anything where a transiently-red main is costly.

**Path modularity (always on, no variable).** A **doc-only** change — every changed file is `*.md`, or under `docs/` or `_intake/` — never triggers the heavy matrix, in any posture. A cheap `classify changes` job (~10s, hand-rolled, fail-safe to "run the matrix") sets a `code` output; the heavy jobs gate on it via `needs:`. `static gates` still runs on docs (links, citations, SECTIONS freshness, hygiene). This removes the "15 minutes of full CI just to edit the roadmap" tax that motivated the change. The classifier itself is gated to run only when the heavy matrix could need it (full posture, or an explicit escalation), so it adds nothing in light/manual.

Escalation in **any** posture/gating: label a PR **`full-ci`** (heavy matrix for that PR, even doc-only — the label event re-triggers the run) · **`gh workflow run ci.yml`** (one full run) · push an **`M*`/`v*` milestone tag** (milestone exits always re-verify everything). Pacing changes *when CI re-verifies*, never *what must pass*: `scripts/preflight.{sh,ps1}` runs every gate locally before every push in every posture/gating, and `definition_of_done` still collects the evidence. The consolidation is itself part of the savings — split into four jobs, the same ~90s of audit work bills four runners' checkout + setup time.

**Why job-level `if:` and not `on:` filters** (load-bearing): a job skipped by its `if` conditional reports its status as "Success" — required checks stay satisfied — while a workflow skipped by path/branch filtering leaves its required checks "Pending" and **blocks the PR from merging forever** (https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks, accessed 2026-06-12). Both the path classifier and the posture/gating live in job `if:` for exactly this reason. Consequence for §5: require only the checks the posture+gating actually runs on a PR (`light` or `full`+`advisory` → `static gates`; `full`+`blocking` → also `heavy matrix gate`, the aggregate).

**Self-hosted runner — `full` posture at zero minutes** (the power option for an always-on spare box): repo Settings → Actions → Runners → "New self-hosted runner", run GitHub's installer on the spare machine (as a service for unattended), then retarget jobs — `runs-on: [self-hosted, Linux]`, or swap the matrix entries. Self-hosted runners "are free to use with GitHub Actions, but you are responsible for the cost of maintaining your runner machines" (https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners, accessed 2026-06-12). **Security boundary: "Self-hosted runners should almost never be used for public repositories"** — any fork PR can execute code on your machine (https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions, accessed 2026-06-12). A private autopilot repo is the natural fit.

The posture **and gating** are chosen at onboarding by the setup interview (`onboard` Mode A) and recorded in `PROJECT_CONVENTIONS.md` › Operating posture. This template repo itself runs the unset-`light`/`blocking` default — it's public (minutes free either way), but it dogfoods the configuration downstream copies inherit.
