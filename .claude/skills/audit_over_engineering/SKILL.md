---
name: audit_over_engineering
description: Sweep the WHOLE repository (or a subsystem) for accumulated over-engineering — dead code, hand-rolled stdlib, single-use abstractions, one-caller layers, speculative flags — and produce a ranked, biggest-cut-first ledger with a net-savings tally (-N lines, -M deps) and a filed `debt` ticket per finding. Use on a maturing codebase when the user says "audit for over-engineering", "what can we delete", "find dead code / bloat", "is this over-engineered", "simplification sweep", "tech-debt sweep", "what's unused". Repo-scoped + on-demand — the complement to adversarial_review's diff-scoped over-engineering lens. Inspired by the ponytail project.
---

# Audit Over-Engineering (whole-repo simplification sweep)

Catches what no per-diff review can see: cruft that accrued across many individually-reasonable changes — an interface that's had exactly one implementation for thirty PRs, a flag nobody sets, a wrapper that only delegates, a dependency the platform now ships. [`adversarial_review`](../adversarial_review/SKILL.md)'s over-engineering lens catches bloat as it *enters* (diff-scoped, pre-merge); this sweeps what is *already there* (repo-scoped, on-demand). The discipline is `CLAUDE.md` › Working style ("Laziest sufficient code"); read paths / stack from `PROJECT_CONVENTIONS.md`.

**Scope honesty (read first):** this earns its keep on a codebase with *accumulated* abstraction. On a young or already-lean repo it will correctly find little — say "lean already" and stop. **Never manufacture cuts to look productive** — a padded ledger trains the reader to ignore it, and the whole point is a YAGNI tool that is itself not over-built.

## Procedure

1. **Frame the sweep.** Whole repo, or a subsystem (`PROJECT_CONVENTIONS.md` › Source Layout). Delegate the broad read to read-only subagents — [`mech-sweeper`](../../agents/mech-sweeper.md) (haiku) for the mechanical inventory, the session model only where judgment bites (the three-tier table: [`README`](../README.md) › Model & effort routing) — and keep **conclusions, not file dumps**. This is a fan-out, not one linear read.
2. **Hunt, by tag** (the vocabulary shared with `adversarial_review`'s lens), capturing `file:line` for each:
   - **delete** — dead / unreachable / unused code, types, flags, or dependencies nothing imports.
   - **stdlib** — hand-rolled what the language's standard library already ships.
   - **native** — a dependency doing what the platform / runtime already does.
   - **yagni** — a single-implementation interface, a one-caller indirection layer, a factory of one product, a config nobody sets, speculative generality.
   - **shrink** — the same behavior in materially fewer lines.
3. **Verify before asserting** (laziness *without understanding* ships a confident wrong fix — `CLAUDE.md`). For each candidate, confirm it is truly unused / equivalent: grep every caller and import; check it is **not** a public API, a plugin/extension point, a documented seam (`docs/ARCHITECTURE.md` invariants / `D-NN`), or load-bearing for a non-negotiable (validation, error / data-loss handling, security, accessibility, determinism). *A documented seam with one implementation today is intentional, not YAGNI.* Drop anything you cannot confirm.
4. **Rank biggest-cut-first and tally.** The bar is **cut without loss**.
5. **File, don't cut.** Each surviving finding becomes a `debt` ticket via [`track_followups`](../track_followups/SKILL.md), ranked; the actual removal is a normal slice through the gated flow ([`ship_pr`](../ship_pr/SKILL.md), with tests proving nothing broke). **This skill never edits the tree** — a whole-repo sweep that deletes as it goes is the footgun it exists to avoid. Findings only.

## Output

A ranked ledger, biggest cut first:

```text
<tag> <what to cut> -> <replacement / nothing>.  [file:line]
...
net: -<N> lines, -<M> deps possible.   (filed: #NN, #NN, …)
```

If the repo is already lean: **"Lean already — nothing worth cutting."** and stop.

## Verification

- Every finding was confirmed unused / equivalent (callers + imports grepped; not a documented seam or a non-negotiable) — not guessed.
- Findings are filed as `debt` tickets; **`git status` is unchanged** (this skill finds, it does not cut).
- A young / lean repo correctly yielded little — no manufactured cuts.

## Don't

- **Don't edit the tree** — file `debt` tickets; removal is a separate gated slice with tests.
- Don't flag a documented architectural seam (an invariant / `D-NN` extension point) as YAGNI — one implementation today can be deliberate.
- Don't simplify away a non-negotiable (validation, error / data-loss handling, security, accessibility, determinism) to cut lines.
- Don't pad the ledger on a young repo — "lean already" is a valid, honest result.
- Don't duplicate `adversarial_review` — that's the per-diff, pre-merge lens; this is the repo-wide, on-demand sweep. Reach for it periodically (a `retrospective` cadence), not on every change.
