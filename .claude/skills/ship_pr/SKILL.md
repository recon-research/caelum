---
name: ship_pr
description: Ship a change through the PR-gated flow — preflight, feature branch, properly-formatted commit, gh PR, CI watch, merge per the project's merge policy, prune, merge-time checkpoint — encoding the gh/PowerShell gotchas so the mechanics never need rediscovering. Use whenever work is ready to land on main. Say "ship it", "open a PR", "land this", "merge this change". Direct pushes to main are policy-forbidden; this is the only path.
---

# Ship PR (the gated path to main)

The mechanics of landing work. Read the merge policy, branch naming, and PR title convention from `PROJECT_CONVENTIONS.md` › Tracker & Hygiene; the PR body shape from `.github/PULL_REQUEST_TEMPLATE.md`.

## Procedure

0. **Claim check, then claim** (conventions › Concurrent writers) — run at slice **start**, before implementation; re-verify here if the slice somehow reached landing unclaimed. For ticket `#NN`: `git ls-remote --heads origin | grep "/<NN>-"` (prefix-independent — branch conventions vary per project; the issue number in the slug is the invariant, #275) · `gh pr list --search "<NN>" --state all` · `gh issue view <NN> --json state,assignees` + scan its comments for a foreign `claim:` with no matching `unclaim:`. A foreign remote branch or claim, an existing PR, a foreign assignee, or a **closed** state (a concurrent writer may have just finished it — open-state listings won't show that) ⇒ the ticket is claimed or done: pick another. Clear ⇒ `git checkout -b slice/<NN>-<slug>` from up-to-date `main`, **push it immediately** — the remote branch *is* the claim — then post the claim comment: `claim: <machine>/<session8> · <UTC ISO> · <branch>` (identity from `.claude/metrics/session.json`), and snapshot the session cost for the merge receipt: `python3 scripts/slice_telemetry.py claim <NN>` (fail-soft telemetry, #255). Parking the slice later ⇒ post the matching `unclaim:` comment.
1. **Preflight** — `scripts/preflight.sh` (or `scripts\preflight.ps1`) must PASS. Re-run after *any* edit, however small — the classic CI failure is an edit made after the format check ran.
2. **Branch** — created and pushed at step 0 (the claim); if it somehow doesn't exist yet, create it now from up-to-date `main`: `git checkout -b <branch per conventions>` (e.g. `slice/<issue#>-<slug>`). Never commit on `main`.
3. **Commit** — stage explicitly (`git add <paths>`; check `git status` for strays). **This subject is the one that lands** on a single-commit slice — GitHub ignores the PR title unless the PR has ≥2 commits (conventions › Merge policy), so it cannot be fixed later at step 4. Never write an issue ref next to a negated closing keyword (`not fixed: #NN` **closes** #NN — #591; say `Deferred: #NN`); the `commit-msg semantics` gate enforces it. Multiline message via the **Bash tool** with a here-doc (PowerShell here-string quoting mangles git args):
   ```bash
   git commit -F - <<'EOF'
   <type>: <imperative summary> (closes #NN)

   <what + why; cite Book NN §X / research note; name the gates run>
   EOF
   ```
4. **Push + PR** — `git push -u origin <branch>`, then `gh pr create --body-file <tempfile>` with a body following the PR template (what & why · DoD evidence · tracker hygiene). Write the tempfile UTF-8. **Always `--body-file`, never inline `--body`** (Windows PowerShell 5.1 splits inline bodies at embedded double quotes; body-file is portable everywhere). Building on an unratified decision default? The body carries `Provisional on #NN` — the overrule path greps for it.
5. **Watch CI — per the posture + gating** (conventions › Operating posture). `gh pr checks <n> --watch` (or poll `gh pr checks <n>`); expect **one** run per push event. *light* / *full+blocking*: `static gates` green is the floor; the heavy jobs run only in `full`+`blocking` (or via `full-ci` / dispatch / tag), and report **skipped — which satisfies required checks and is not a failure** — when posture-skipped or when the change is doc-only (path modularity). Label the PR `full-ci` first when a change warrants the real matrix in a non-full posture (risky slice, milestone closer, build/test commands changed). *full+advisory*: the heavy matrix does **not** run on the PR — `static gates` green + your clean preflight is the merge gate; the matrix runs **post-merge** on the main push as a sanity check (the next onboard formally gates on it). *manual*: no checks appear — paste the preflight PASS output into the PR body as the merge evidence. Any red check routes back to step 1 via preflight — a clean preflight with a red CI is environmental (read the log, don't guess). **Read this output to green with your own eyes *before* step 6 — never chain the merge onto the watch/poll in one command** (`gh pr checks --watch && gh pr merge …`): a compound command fires the merge the instant the watch exits, unconditionally, even over a red gate, and where branch protection is unavailable the platform won't stop it (conventions › Merge policy) — so reading green is the only enforcement. A red or unreadable result routes back to step 1, never forward to merge (#176 merged a checkpoint PR over a red `static gates` exactly this way — #177).
6. **Merge + prune — a *separate* command, issued only after step 5's checks were read green** — `gh pr merge <n> --squash --delete-branch` (or the project's merge mode per conventions). Known behavior, not errors: it also deletes the **local** branch and fast-forwards local `main` — so a later `git branch -d` says "not found" and `git pull` says "Already up to date". Finish with `git remote prune origin` and verify `git log --oneline -1` on `main` shows the merge commit.
7. **Checkpoint (mandatory, same breath as the merge)** — first, **post the cost receipt**: `python3 scripts/slice_telemetry.py receipt <pr#> <NN>` puts the one-line `cost:` comment on the merged PR (wall from the claim comment, churn from the PR, session-cost delta from this box's ledger — every value from a source, `n/a` where one is missing, never hand-typed) and prints the same line: **include it in the merge summary** so the owner sees the slice's price without asking. Receipts are the per-slice data behind `docs/METRICS.md` › Per-slice cost & pace — tripwires, never targets (#255). Then the merge-time checkpoint: update the `CLAUDE.md` Status line (one line for what just merged + the **Resume** line) and the ROADMAP slice/milestone state. Pre-`origin`, tick the item in `PROJECT_BACKLOG.md` instead. Compaction can then strike at any time and lose at most the in-flight slice. *Under `full`+`advisory`*, the post-merge main run is the heavy matrix's only gate — glance at it if you're still here, but it's the **next onboard** that formally catches a red one (files a `bug`, fixes forward); don't block this session waiting on it.

## Output

The PR URL, the merged commit hash on `main`, the CI result (which checks ran, which were posture-skipped, their states), and the `cost:` receipt line (step 7).

## Verification

- Preflight PASS precedes the push (evidence: its final line).
- The posture's merge gate held before merge (checks green / pasted preflight in `manual`); `main` fast-forwarded to the merge commit; no leftover branch, local or remote.
- The PR body names the gates actually run; any validation only a specific machine could perform is declared with its evidence link (see conventions › Validation machines, if used).
- The Status line + ROADMAP reflect the merge (gate: definition_of_done's merge-time-checkpoint).
- The merged PR carries its `cost:` receipt comment and the merge summary echoes the line — or the summary says why not (the script is fail-soft; a gh hiccup prints the line without posting).

## Don't

- Don't push to `main` directly — policy-forbidden regardless of what the permission grammar allows; don't retry it expecting otherwise.
- Don't `--no-verify`, don't amend published commits, don't force-push shared branches — a broken branch gets a new branch.
- Don't `gh pr merge --admin` — it bypasses the required checks; if a green PR won't merge, merge `main` *into* the branch, re-preflight, wait for green.
- Don't merge with a failing or still-running check "because it's probably fine".
- Don't inline multiline bodies/messages on PowerShell — body-file / here-doc only (conventions › PR / commit mechanics).
- Don't push through a permission/classifier denial of the merge — that's the owner's call, not an error to engineer around: run the denial protocol (`CLAUDE.md` › Working style — diagnose rule-vs-classifier, then survey the owner with approve-retry / unblock-this-session / standing-rule / merge-it-yourself choices) and continue with independent work meanwhile.
