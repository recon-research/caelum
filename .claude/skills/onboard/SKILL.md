---
name: onboard
description: Start or resume a working session. Use when the user says "welcome back", "let's onboard", "onboard and continue", "let's continue", or opens a fresh session. Branches between first-time onboarding (read the _intake/ brief and set up the project docs + textbook outline) and resuming an in-flight project (preflight, reconcile docs against the tracker, surface the decision queue, pick up the resume point).
---

# Onboard / Resume

The session entry point. Decide which mode you're in, then run it. Token-lean by design: the anchors are small; everything else is read on demand.

## Session snapshot (auto-rendered when this skill loads)

- Recent commits: !`git log --oneline -5 2>/dev/null || echo "(no git yet)"`
- Working tree: !`git status --porcelain 2>/dev/null | head -15`
- Open decisions: !`gh issue list --label decision --state open 2>/dev/null || echo "(no tracker yet)"`
- Open PRs: !`gh pr list --state open 2>/dev/null || echo "(none / no tracker)"`

## Procedure

**Mode A — First-time onboarding** (the `CLAUDE.md` Status block still has `<placeholders>`, or `_intake/` has new planning docs):
0. **Kickoff authorization (settings).** The README's kickoff line ends with *"…you have my permission to adjust the Claude Code settings and set everything up"* — that clause is the owner's settings grant. With it: finalize `.claude/settings.json` / `settings.local.json` for this project and machine (the shipped allowlist arrives with the copy — adopt it, apply any trims the owner asks for, put machine-specific spellings in `settings.local.json`; **never widen the allowlist beyond the shipped form without a fresh, explicit instruction**), then run the rest of onboarding unattended. Without the grant: proceed anyway, expect permission prompts, and surface the one-sentence kickoff line once — don't nag.
1. Read everything in [`_intake/`](../../../_intake/) — the brief, architecture notes, roadmap sketch, domain notes.
2. **The setup interview** — four questions, asked one at a time, **recommended default first** with one-line trade-offs on the others (the decision-protocol shape, run interactively). It doubles as the workflow walkthrough: each question names the machinery it configures, so the owner has seen every feature once before autopilot starts. Record each answer in `PROJECT_CONVENTIONS.md` › **Operating posture** — written config the skills read, not chat memory. If the kickoff is unattended (no answers), take every recommended default and mark the section *(provisional — defaults taken unattended; change any line by PR)*.
   1. **Repo visibility & plan** — *sets the CI recommendation + branch-protection expectations.* Public: Actions minutes free + protection enforceable on any plan, but the code is public. Private on Free/Pro: 2,000/3,000 min/month, and on Free the protection rules don't bind (`docs/AUTOMATION.md` §5–6). Recommend what the brief implies; state the consequence.
   2. **CI posture + gating** (`docs/AUTOMATION.md` §6) — *sets ci.yml's pacing.* Two linked knobs (count as one question): **posture** — `light` (recommended for private repos): the ~1-min `static gates` job per PR; heavy matrix on demand (`full-ci` label · dispatch · `M*` tag) · `full` (recommended for public repos or a self-hosted runner): the heavy matrix too · `manual`: zero minutes, preflight is the gate. Then, **only if `full`, gating** — `blocking` (default, safest: heavy runs on the PR and must be green) vs `advisory` (heavy runs **post-merge** on main as a sanity check; the PR merges on `static gates` + preflight; a rare post-merge red is fixed forward via a filed `bug`). Advisory suits an active solo private loop (preflight already runs the heavy gates locally); blocking suits shared/public repos. Note that **doc-only changes skip the heavy matrix automatically** (no config) and mention the self-hosted-runner option for an always-on spare machine (§6 — private repos only).
   3. **Review cadence** — *sets when `adversarial_review` must run; `definition_of_done` enforces it.* Recommended: **milestone exits + risky slices** (invariant / schema / security / public API). Alternatives: every slice (max rigor, a multi-agent fan-out's tokens per slice) · on request (cheapest, relies on the human remembering — the documented field failure).
   4. **Objection window** — *sets the decision loop's ratify-by-silence clock (`CLAUDE.md` §3).* Recommended **48h**; 24h if the owner answers daily; 1 week if they check in rarely.
3. Fill [`CLAUDE.md`](../../../CLAUDE.md): the project name, one-liner, and the **Status** block. Remove the "new project" blockquote. **Stamp provenance:** fill `TEMPLATE_VERSION` (template source path/URL · `git -C <source> rev-parse HEAD` · today) — [`update_from_template`](../update_from_template/SKILL.md) depends on this stamp; if the source isn't reachable, record what's known.
4. Draft [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) (shape, invariants, the initial `D-NN` decision log) and [`docs/ROADMAP.md`](../../../docs/ROADMAP.md) (milestones `M0..`, slices as stepping stones toward the ambitious end-state). Surface unresolved forks as `decision` items with a recommended default.
5. Propose the **textbook/RAG library outline** per [`textbooks/LIBRARY_SEED.md`](../../../textbooks/LIBRARY_SEED.md) §1 and get explicit approval. Hand off to [`build_library`](../build_library/SKILL.md).
6. Run [`configure_project`](../configure_project/SKILL.md) to fill [`PROJECT_CONVENTIONS.md`](../../../PROJECT_CONVENTIONS.md) once code/tooling exists.
7. **When the repo goes live** (`gh repo create <name> --private --source . --push` — or `--public` per the interview):
   - Create **every** label listed in `PROJECT_CONVENTIONS.md` › Tracker & Hygiene (one `gh label create <name> -d "<desc>" || true` each — idempotent; don't enumerate from memory or trust GitHub's default labels to cover the set).
   - **Apply the CI posture + gating:** `gh variable set CI_POSTURE --body <answer>` and, if `full`+`advisory`, `gh variable set CI_GATING --body advisory` (skip a var when its answer is the default — unset already means `light`/`blocking`; setting it documents intent either way).
   - Protect `main` — require PRs + green checks **and enable "include administrators"** (otherwise `gh pr merge --admin` silently bypasses every gate). Require **only the checks the posture+gating actually runs on a PR**: `light` or `full`+`advisory` → just `static gates`; `full`+`blocking` → also `build & test` + `format & lint`; `manual` → none. (Posture-skipped jobs satisfy required checks; a never-started workflow's required check sits "Expected" forever — never require `classify changes` — `docs/AUTOMATION.md` §5–6.) This is an **attended** step: use the web UI or `gh api` (deliberately not pre-approved). **Caveat:** on a free-plan **private** repo, GitHub does not enforce branch protection/rulesets — the options are GitHub Pro, an org plan, or a public repo. Until one of those holds, the written policy + the allowlist's narrowed grants are the *only* guard against force-push/main-push — say so in Status, and revisit the moment the repo goes public or Pro.
   - **Migrate any `PROJECT_BACKLOG.md` items to issues and delete that file** — once the tracker exists, a second backlog is a staleness machine.
   - File the standing day-one followup: replace `textbooks/AGENT_GUIDE.md` §1.5's schematic trace with a real one after the first slice ships.
8. **Feature self-test + recap (mechanical — run it, don't assert it).** The field failure this guards: a fresh copy whose workflow layer exists on paper but never fires. Each check is a command plus an expected observation:
   - **Skills load:** every entry under `.claude/skills/` is a `<name>/SKILL.md` directory (`ls .claude/skills/*/SKILL.md`) and the session's skill list shows them.
   - **Agents present:** `.claude/agents/adversarial-reviewer.md` and `mech-sweeper.md` exist.
   - **Hooks fire:** stage a scratch file containing a bare `TODO`, attempt a commit — expect a deny carrying `BLOCKED:` (that hook *error* is the gate working, not a fault — `docs/AUTOMATION.md` §2); discard the scratch. Banner: a `[status-anchor]` line appeared at this session's start. If either can't be observed because hooks were just wired (config snapshots at session start), say so in Status and verify next session.
   - **Gates green:** `bash scripts/preflight.sh --quick` PASSes, reporting its SKIP count honestly.
   - **Posture recorded:** conventions › Operating posture has no `<…>` placeholders left; once origin exists, `gh variable get CI_POSTURE` (and `CI_GATING` if set) matches the interview answer (unset = light/blocking).
   Close with the recap — one short table: posture + gating · review cadence · objection window · what runs on each PR (and what defers post-merge under advisory) · the three daily messages (`CLAUDE.md` › How we work). That recap is the walkthrough's exit: the owner has now seen every workflow feature and chosen its setting.

**Mode B — Resume an in-flight project** (the default day-to-day):
1. **Preflight (cheap, mechanical):** `gh auth status` works; `git status` clean; **main CI is green** (`gh run list --branch main -L 1`). Read the CI posture + gating (conventions › Operating posture) before judging: in `light` a main-push run reports conclusion **`skipped`** (its jobs were posture-skipped — verified live 2026-06-12), and in `manual` there may be no runs at all — neither is red; judge by the last PR's `static gates` / pasted preflight instead. **Under `full`+`advisory`, the main-push run IS the heavy matrix's only gate** (it didn't run on the PR) — so a red post-merge run is real: treat it like red main (file `bug`, fix forward) **before** new work, since the merge already landed. Edge cases, each with a safe default — never improvise here:
   - **Unexplained dirt** (not explained by Status — e.g. the last session died mid-slice): don't stash, don't discard. Commit it verbatim to a `rescue/<date>` branch, push, file a `followup` issue pointing at it, return to main, proceed.
   - **Red main** is the first slice — never build on red. Cause beyond your reach (CI infra, billing, secrets)? File `bug` + `blocked`, note it in Status, park CI-dependent work; CI-independent work may continue.
   - **Placeholder green is red:** if `scripts/preflight.*` / `ci.yml` still carry unconfigured (SKIP-placeholder) stages while real code exists, run `configure_project` to fill them before trusting any green — preflight's summary says how many stages were skipped.
   - **`gh` dead** (auth/network, after one retry)? Stop and report — don't run an autopilot loop on a dead tracker.
2. **Read the anchors only:** the `CLAUDE.md` Status block; the **current milestone section** of [`docs/ROADMAP.md`](../../../docs/ROADMAP.md); [`PROJECT_CONVENTIONS.md`](../../../PROJECT_CONVENTIONS.md). Don't re-read ARCHITECTURE or the library until the slice routes you there.
3. **Reconcile docs against reality** (truth order: git/CI > tracker > docs > chat): pull `gh issue list --state open`, `gh pr list`, and `git log --oneline -10`; if the Status block's claims or its **As-of** stamp disagree with the tracker / recent merges, **fix Status first**, then proceed. Sweep **new human comments** on open PRs/issues since the As-of stamp (`gh pr view <n> --comments`) — route each: act now / `track_followups` / a decision answer (step 4). Drain any `## Unfiled` section in `PROJECT_BACKLOG.md` into real issues. Docs are caches.
4. **Surface the decision queue — and read the answers.** `gh issue list --label decision` shows titles only; for each open one run `gh issue view <n> --comments`. A human comment **is the decision**: record it as `D-NN` (ARCHITECTURE Appendix A), reflect the ROADMAP, close the issue — and if it overrules a provisional default, file a re-route slice referencing every PR marked `Provisional on #<n>`. An objection window passed in **silence ratifies the default**: record the D-NN (note "ratified by silence") and close. Also reconcile `decision` issues *closed* since the As-of stamp against Appendix A — closed without a D-NN row is a miss; fix it now. Then present the compact digest — `D-NN (#issue) <fork> — recommended: <default> [provisional | blocked]` — the human may answer asynchronously; don't block on it.
5. **Pick up the Resume point** (branch · issue · next action · verify command) and run the [`textbooks/AGENT_GUIDE.md`](../../../textbooks/AGENT_GUIDE.md) build loop on the slice. Delegate broad exploration to read-only subagents; keep conclusions, not file dumps.
6. **At a fork**, follow `CLAUDE.md` §3: file the `decision` issue; proceed provisionally if reversible; park-and-switch to the next independent slice if not.

## Verification

- You can state in two sentences: the current milestone, the resume point, and the exact next action.
- Status agrees with the tracker (or was just fixed to); the decision digest was surfaced; **comments on open decisions were read, not just titles**.
- Build/test commands came from `PROJECT_CONVENTIONS.md`, not guessed; main was green before new work started.
- Mode A only: the Operating posture section is fully answered (no `<…>` left), and every self-test observation was actually produced by running its command — not assumed.

## Don't

- Don't start coding before the preflight + reconcile — building on a red main or a stale Status multiplies waste.
- Don't stash or `checkout --` away unexplained working-tree changes — rescue-branch them; they may be the only copy of a dead session's slice.
- Don't re-read the whole ROADMAP / ARCHITECTURE / library "for context" — the anchors are enough; route narrowly when the slice needs it.
- Don't silently resolve a fork to keep momentum, and don't stall on one either — provisional-proceed or park-and-switch per `CLAUDE.md` §3.
- Don't treat a silent decision issue as forever-open — silence past its stated window ratifies the recommended default.
- Don't re-litigate decisions already in the `D-NN` log.
- Don't run Mode A again on an onboarded project — confirm the resume point and go.
- Don't skip the setup interview because the kickoff ran unattended — take the recommended defaults, record them as provisional, and surface them in the recap; an unchosen default the owner never saw is how features go unexercised.
