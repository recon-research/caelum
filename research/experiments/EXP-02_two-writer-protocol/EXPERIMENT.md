# EXP-02 — Two-writer protocol: does a concurrent pair beat solo without duplicated effort?

> status: run 1 complete — inconclusive (see Outcome) · opened: 2026-07-08 · amended pre-run: 2026-07-17 (#328) · run 1: 2026-07-17 (#358) · ticket: #97 · branch/PR: slice/97-exp02-prereg

## Hypothesis

Under the multi-writer v2 protocol (epic #93: claim comments + identity + lanes, shipped in #95/#96), a two-session pair working a matched batch of small slices completes it with **zero duplicated effort** and **lower wall-clock** than a solo session, at a token overhead of **≤ 25% per merged PR**. Source: decision need — #93 stage 4 (should multi-writer become normal operation, or stay an owner-triggered exception?); grounded in #86's live evidence (a second writer's file→implement→merge→prune loop is invisible to open-state listings) rather than a survey note.

## Metrics & success criteria

- **Metric 1 — duplicate effort:** slices in the batch with more than one `claim:` comment (without an intervening `unclaim:`) or more than one PR — counted from `gh issue view <n> --comments` and `gh pr list --state all --search <n>`. **Bar: zero.** This is the protocol's core promise; a single duplicated slice refutes regardless of speed.
- **Metric 2 — wall-clock:** first `claim:` comment timestamp → last merge timestamp (UTC, from `gh`), pair batch vs the solo baseline batch. Human-availability pauses > 30 min (no session activity on either machine, from the local ledgers) are subtracted from both arms and reported.
- **Metric 3 — token cost per merged PR:** each machine's local ledger (`scripts/metrics.py` › $/merged-PR; `.claude/metrics/sessions/`), summed across both machines by hand — cross-machine aggregation is manual (the #57 known gap) and the arithmetic is shown in `results/`.
- **Success bar (pre-committed):** **supported** iff duplicate effort = 0 AND wall-clock(pair) ≤ 0.7 × wall-clock(solo) AND cost-per-merged-PR(pair) ≤ 1.25 × solo. **Refuted** iff any duplicated slice occurs, or wall-clock(pair) ≥ wall-clock(solo), or cost-per-PR(pair) > 1.5 × solo. Otherwise **inconclusive** (e.g. faster but pricier than 1.25×: a real trade-off for the owner, not a win).
- **Runs & variance plan:** N=1 pair run — the second machine is owner-driven, so repeats are owner-budget-gated. Slice-size mismatch is the dominant confound; the batches are matched by count and scope class (Method › Held fixed), residual mismatch is reported as a caveat, and margins within it are reported as ties, not wins.

## Method

- **Baseline (named):** a solo-session batch of 4 small ops slices from this repo's tracker, measured from tracker timestamps + the local ledger. A candidate already on record: the 2026-07-08 solo guard batch (#71–#75, #86–#87 — timestamps and ledger rows exist). The baseline batch is **declared in this file at run time, before the pair batch starts** — never selected afterwards to flatter the result.
- **Variant:** two sessions on two machines (the Linux and Windows boxes), running `PROJECT_CONVENTIONS.md` › Concurrent writers end-to-end: claim comments with `<machine>/<session8>` identity, lanes per the runbook. The arm — **builder + reviewer** (default) or two lane-partitioned builders — is declared at run time, before starting.
- **Held fixed:** same repo, same CI posture (light), batches matched in slice count (4) and scope class (single-file guard/doc slices — no library builds, no research surveys); the protocol docs at the sha recorded at run time.
- **Implementation:** no new code — the protocol under test *is* the shipped conventions + skills; the measurement commands live in Reproducibility. Nothing here runs in CI.

### Amendment — 2026-07-17, pre-run (#328; recorded before any run, visibly)

- **Environment un-gated:** the #328 sweep established that worktree-per-session is the field-standard isolation and satisfies this repo's one-writer-per-checkout rule — so the pair may run as **two sessions in two `git worktree` checkouts on one machine**, not only on two machines. The two-machine arm stays valid; the run declaration states which environment was used. This removes the "second machine live" gate: the run needs only the owner to start a second session in a worktree.
- **Metric 3 on one box:** both sessions share one machine ledger; per-session cost comes from `.claude/metrics/sessions/<sid>.json` keyed by each session's claimed identity. The manual cross-machine aggregation caveat applies only to the two-machine arm.
- **Protocol version:** the run declaration records the conventions sha live at run time — v2 (shipped) or v3 (#331, adds scoped claims / strict landing / leases / WIP cap). The hypothesis and all bars are unchanged; v3 is an extension of the protocol under test, and which version ran is reported, not hidden.

## Reproducibility

- **Commands:** at run time, append the run declaration (baseline batch, arm, sha, date) to Results; each session then works per conventions › Concurrent writers. Afterwards, from either machine: `gh issue view <each slice> --comments` (claim/unclaim log) · `gh pr list --state all --search "<each>"` (PR count per slice) · `gh pr view <each PR> --json createdAt,mergedAt` (timings) · `python scripts/metrics.py` on **each** machine ($/merged-PR). Raw outputs land in `results/` as `claims.json`, `timings.json`, `costs.json`; the comparison table regenerates from them via a committed script added with the results.
- **Seed(s):** none — an agent-workflow experiment is not seed-controllable; a re-run reproduces the *protocol*, not the bytes. · **Commit:** the pre-registration sha is this file's merge commit (committed before any run); the run-time sha is recorded in Results. · **Environment:** two machines (Linux + Windows boxes), Claude Code, each machine's session model per its settings — recorded at run time.
- **Data:** `results/` is intentionally absent until the run; it will hold the three JSON files above plus the table/figure generator (research discipline #7: figures regenerate from committed data).

## Results

*Pre-registered 2026-07-08 · **run 1 executed 2026-07-17** — declaration, report, and Outcome below. (The original owner-gating on a second live machine was superseded pre-run by amendment #334: a one-box worktree pair suffices. Run 1 used two machines anyway, by the owner's choice.) The pre-registration was `N=1`, so this experiment is **complete as registered**; Metric 2's indeterminate leg is a future run's job, tracked as #808 — open, not pending here. Nothing above this line changes after the run; deviations from plan are recorded here, visibly. — Status clause corrected 2026-07-29 during the #93 decomposition: it still read "Not yet run" while the declaration, the report, and a committed Outcome sat directly beneath it. Editorial only — no change to the plan, the bars, or anything above this line.*

### Run declaration — 2026-07-17 (run 1; committed before any pair work started)

- **Environment** *(corrected 2026-07-17 pre-run — owner opted for the two-machine arm, valid per the amendment):* two machines — writer A: the Linux box primary checkout (`pyxis`); writer B: a fresh full clone on the owner's laptop. The one-box worktree (`pyxis-w2`, prepared in #350) went unused this run. Laptop caveat, pre-known: writer B runs without the desktop's machine-local allow rules — more permission prompts, inflating B's wall-clock, which *disadvantages* the pair arm on Metric 2 (conservative direction).
- **Protocol version:** v3 (conventions sha at declaration: bdda8c0 — scoped claims, strict landing, leases, WIP cap, writer≠reviewer markers, merge-owned hot files).
- **Arm:** two lane-partitioned builders (the D-330 fleet topology). Writer A is the declaring session; writer B is a fresh session the owner starts in the worktree.
- **Pair batch (4):** #340, #341, #342, #345 — guard-class slices derived from the 2026-07-17 sync-report triage (#323–#327), pairwise-disjoint Surfaces (all four are `fleet_size` lane seeds), authored via the #337 template. Batch membership is declared here; **claim order is left to the protocol** (tracker-mediated, uncoordinated) — claim contention is part of what Metric 1 observes.
- **Baseline batch (4, from the on-record 2026-07-08 pool):** #72, #73, #75, #87 — the four smallest single-purpose guard slices of the pool, matching the pair batch's scope class. #71/#74/#86 excluded as multi-invariant (larger) slices; excluding them *shortens* the solo baseline wall-clock, the conservative direction for Metric 2.
- **Metric 3 operationalization** *(updated with the environment correction):* per-session spend keyed by claimed identity. Writer A is a long-running session — its number is the **spend delta** between its first claim and its last merge (snapshot values + arithmetic in `results/costs.json`). Writer B, a fresh session on its own machine, is the representative marginal-builder cost, bootstrap included; cross-machine aggregation is the pre-reg's manual path, now largely read off the per-PR cost receipts (`usd= by=`, #269/#295 — machinery post-dating the pre-registration), with the arithmetic still shown in `results/`.
- **Pre-known limitations of this run:** writer A authored the batch tickets during triage (warm context on all four slices — advantages A's per-slice speed and understates a representative builder's cost; writer B is the clean datum). N=1; the pre-registered bars are unchanged.

### Run 1 report — 2026-07-17 (build phase 23:10–23:26Z; data + generator in `results/`)

- **Executed:** batch #340/#341/#342/#345 → PRs #354/#353/#355/#352, split 3A/1B by natural claim order; all four PRs cross-reviewed (`review:` markers, writer ≠ reviewer held, each review substantive — B twice reproduced ACs independently on Windows); strict landing throughout; one benign **2-second landing race** (#354 landed between A's main-position check and A's #355 merge — disjoint files, clean result; the bounded-race class D-330 accepted in rejecting a merge queue).
- **Metric 1 (bar: zero duplicated effort): PASS** — 0 duplicated claims, 0 duplicated PRs (`results/claims.json`); near-contention datum: claims on #340 (B) and #341 (A) landed 1 s apart on *different* tickets.
- **Metric 2 (bar: pair ≤ 0.7× solo): INDETERMINATE** — pair 15m12s (no pauses). The declared solo baseline (#72/#73/#75/#87) turned out to interleave non-batch work and contains a 64-min tracker-silent window covering #87 that no surviving ledger can decompose into pause vs build (claims did not exist on 2026-07-08). Defensible readings put solo at 12m35s–83m19s → ratios 0.20–1.21, spanning supported→refuted; the pre-registered tie rule applies (`results/timings.json`).
- **Metric 3 (bar: pair ≤ 1.25× solo $/merged-PR): SUPPORTED** — pair (12.20 + 19.02)/4 = **$7.81/PR** vs solo **$8.39/PR** (0.93×: under parity, not just under the bar). Writer B total $19.02, source: harness UI `/cost` hand-read by the owner (the laptop ledger has no sessions writer — sourced absence, B's #93 report); writer A = session-delta $12.20, snapshots posted live at run time (`results/costs.json`).
- **Deviations from plan, recorded:** environment corrected pre-run to the two-machine arm (#351, before any claim); solo baseline lacked claim instrumentation (predates the protocol) → the Metric-2 decomposition gap; writer B's cost is a hand-read harness-UI value, not a ledger row.
- **Run-surfaced findings:** #357 (claim-identity churn across rapid relaunches, filed by writer B mid-run); per-slice receipt windows overlap under interleaved claims (their sum $25.93 > the true A delta $12.20 — session delta is the honest run number); the pair number *includes* 4 cross-reviews the solo arm never performed (quality/throughput trade documented, quality not a pre-registered metric).

## Failure modes & limitations

- **Owner-in-the-loop scheduling:** wall-clock is sensitive to human availability on two machines; the >30-min-pause subtraction bounds but does not eliminate this.
- **Batch matching is approximate:** slices are not identical work units; scope-class matching bounds the confound, and the tie rule absorbs what remains.
- **N=1:** an outcome says "the protocol held / failed on this batch", not "multi-writer pays in general".
- **The reviewer arm changes quality, not just throughput** — review findings are counted and reported, but quality is *not* a pre-registered metric (that would need a blind-judge design like EXP-01's; a follow-up experiment if this one supports adoption).
- **Shared-account attribution:** identity comes from claim comments (the #95 mechanism itself) — if a session forgets to claim, the run is invalidated for Metric 1 and reported as a protocol failure, which is itself a finding.

## Outcome

**INCONCLUSIVE** against the pre-registered bar — and informative. *Supported* required all three legs; *refuted* required an affirmed failure; run 1 delivered neither: **Metric 1 PASS** (the protocol's core promise — zero duplicated effort, with real cross-machine review), **Metric 3 SUPPORTED** (pair $7.81/merged-PR vs solo $8.39 — cheaper than solo, well under the 1.25× bar, with writer B's bootstrap included), **Metric 2 INDETERMINATE** (the baseline's instrumentation gap, tie rule applied — reported as a tie, not a win, exactly as pre-registered). Feeds #93 stage 4 as: **protocol validated at N=2; throughput unproven.** Run 2 fixes Metric 2 mechanically — solo baselines are now claim-instrumented by the very protocol under test, or a contiguous baseline is declared; no bar changes needed.
