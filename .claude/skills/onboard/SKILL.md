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

**Mode A — First-time onboarding** (the `CLAUDE.md` Status block still has `<placeholders>`, or `_intake/` has new planning docs): **read [`MODE_A.md`](MODE_A.md) and run it end-to-end** — permissions gate (guided, incl. the global attribution offer) → `_intake/` brief → four-question setup interview → fill `CLAUDE.md` + draft ARCHITECTURE/ROADMAP (provenance stamp, `D-?` placeholder decisions) → library outline handoff → `configure_project` → repo-goes-live checklist (labels, `D-?` minting, CI vars, branch protection, backlog migration) → feature self-test + recap. It carries its own Verification and Don't blocks, and its step numbers are cited by other docs. It runs once per project lifetime — that's why it lives outside this body, which reloads at every session start (#87 budget; split: #101).

**Mode B — Resume an in-flight project** (the default day-to-day):
1. **Preflight (cheap, mechanical):** `gh auth status` works; `git status` clean; **main CI is green** (`gh run list --branch main -L 1`). Read the CI posture + gating (conventions › Operating posture) before judging: in `light` a main-push run reports conclusion **`skipped`** (its jobs were posture-skipped — verified live 2026-06-12), and in `manual` there may be no runs at all — neither is red; judge by the last PR's `static gates` / pasted preflight instead. **Under `full`+`advisory`, the main-push run IS the heavy matrix's only gate** (it didn't run on the PR) — so a red post-merge run is real: treat it like red main (file `bug`, fix forward) **before** new work, since the merge already landed. Edge cases, each with a safe default — never improvise here:
   - **Unexplained dirt** (not explained by Status — e.g. the last session died mid-slice): don't stash, don't discard. Commit it verbatim to a `rescue/<date>` branch, push, file a `followup` issue pointing at it, return to main, proceed.
   - **Red main** is the first slice — never build on red. Cause beyond your reach (CI infra, billing, secrets)? File `bug` + `blocked`, note it in Status, park CI-dependent work; CI-independent work may continue.
   - **Placeholder green is red:** if `scripts/preflight.*` / `ci.yml` still carry unconfigured (SKIP-placeholder) stages while real code exists, run `configure_project` to fill them before trusting any green — preflight's summary says how many stages were skipped.
   - **`gh` dead** (auth/network, after one retry)? Stop and report — don't run an autopilot loop on a dead tracker.
   - **Second writer live?** Sweep the detection signals (conventions › Concurrent writers): foreign `slice/*` heads via `git ls-remote --heads origin 'slice/*'`, claim comments / open PRs not carrying **your identity** (`<machine>/<session8>`, from `.claude/metrics/session.json`), commits in `git log <As-of sha>..origin/main` this session didn't merge, tracker activity since the As-of stamp (**`--state all`** — a file→merge→prune loop leaves no open-state footprint). Any hit ⇒ announce **"second writer live"** in the session summary and run the lane rules: claim before work, stay in your lane (builder+reviewer is the recommended pair), checkpoint doc-writes ride PRs — a merge conflict there is a protocol finding to file.
2. **Read the anchors only:** the `CLAUDE.md` Status block; the **current milestone section** of [`docs/ROADMAP.md`](../../../docs/ROADMAP.md); [`PROJECT_CONVENTIONS.md`](../../../PROJECT_CONVENTIONS.md). Don't re-read ARCHITECTURE or the library until the slice routes you there.
3. **Reconcile docs against reality** (truth order: git/CI > tracker > docs > chat): pull `gh issue list --state open`, `gh pr list`, and `git log --oneline -10`; if the Status block's claims or its **As-of** stamp disagree with the tracker / recent merges, **fix Status first**, then proceed. Sweep **new human comments** on open PRs/issues since the As-of stamp (`gh pr view <n> --comments`) — route each: act now / `track_followups` / a decision answer (step 4). Drain any `## Unfiled` section in `PROJECT_BACKLOG.md` into real issues. Open `inbox` tickets (free-form human requests)? Run `triage_inbox` before slice work — a collaborator is waiting on the receipt. Docs are caches.
4. **Surface the decision queue — and read the answers.** `gh issue list --label decision` shows titles only; for each open one run `gh issue view <n> --comments`. A human comment **is the decision**: record it as `D-NN` (ARCHITECTURE Appendix A), reflect the ROADMAP, close the issue — and if it overrules a provisional default, file a re-route slice referencing every PR marked `Provisional on #<n>`. An objection window passed in **silence ratifies the default**: record the D-NN (note "ratified by silence") and close. Also reconcile `decision` issues *closed* since the As-of stamp against Appendix A — closed without a D-NN row is a miss; fix it now. Then present the compact digest — `D-NN (#issue) <fork> — recommended: <default> [provisional | blocked]` — the human may answer asynchronously; don't block on it.
5. **Pick up the Resume point** (branch · issue · next action · verify command) and run the [`textbooks/AGENT_GUIDE.md`](../../../textbooks/AGENT_GUIDE.md) build loop on the slice. Delegate broad exploration to read-only subagents (`mech-sweeper` for mechanical breadth); keep conclusions, not file dumps.
6. **At a fork**, follow `CLAUDE.md` §3: file the `decision` issue; proceed provisionally if reversible; park-and-switch to the next independent slice if not.

## Verification

- You can state in two sentences: the current milestone, the resume point, and the exact next action.
- Status agrees with the tracker (or was just fixed to); the decision digest was surfaced; **comments on open decisions were read, not just titles**.
- Build/test commands came from `PROJECT_CONVENTIONS.md`, not guessed; main was green before new work started.
- Mode A only: `MODE_A.md` was read and its own Verification block passed — the posture answers recorded, the self-test observations actually produced.

## Don't

- Don't start coding before the preflight + reconcile — building on a red main or a stale Status multiplies waste.
- Don't stash or `checkout --` away unexplained working-tree changes — rescue-branch them; they may be the only copy of a dead session's slice.
- Don't re-read the whole ROADMAP / ARCHITECTURE / library "for context" — the anchors are enough; route narrowly when the slice needs it.
- Don't silently resolve a fork to keep momentum, and don't stall on one either — provisional-proceed or park-and-switch per `CLAUDE.md` §3.
- Don't treat a silent decision issue as forever-open — silence past its stated window ratifies the recommended default.
- Don't re-litigate decisions already in the `D-NN` log.
- Don't run Mode A again on an onboarded project — confirm the resume point and go.
