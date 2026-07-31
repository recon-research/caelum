# research/ — The Frontier Library

The bleeding-edge supplement to [`textbooks/`](../textbooks/): topics too new, too contested, or too project-specific to be curriculum yet. Where the textbooks are settled knowledge with audited `Book NN §X` citations, this layer is **live research** — surveyed papers, pre-registered experiments, and paper-style reports — with a deliberately different trust model: every claim is **web-sourced, tiered, and dated**, and it **stales**.

## The lifecycle

```
QUESTION (a `research`-labeled issue: what it unblocks)
   → SURVEY   research_topic        → notes/<topic>.md          (sourced + tiered claims)
   → EXPERIMENT  run_experiment     → experiments/EXP-NN_<slug>/ (pre-registered, reproducible)
   → REPORT   write_research_report → reports/RR-NN_<slug>.md    (paper artifact, real references)
   → GRADUATE  build_library        → the finding settles into textbooks/ (Bleeding Edge → curriculum);
                                       the note shrinks to a delta + cross-link
```

Reports and notes **ground `D-NN` decisions** exactly like book sections do — a decision issue may cite `RR-NN` or `research/notes/<file>.md` as its grounding.

## The discipline (audited — these are not suggestions)

1. **Fetched, or not cited.** Every present-tense claim carries `(source: <URL>, accessed YYYY-MM-DD)` **on the same line**. A model's training knowledge is stale by definition on frontier topics — claims come from pages actually fetched this session, never from recall. No consulted source → no claim.
2. **Every claim is tiered**, from a **closed** vocabulary — `[production-proven]` (shipped in a real product) · `[published]` (peer-reviewed paper / official docs / release notes) · `[experimental]` (preprint, proposal, community project) · `[analysis]` (a **derivation** from premises stated on the line — a cited artifact's documented semantics, a repo mechanic — so there is no page to fetch and rule 1 doesn't apply). Don't launder experimental into proven, and don't reach for `[analysis]` to dodge the source rule on an empirical claim. The set is closed because an invented tag reads as a trust signal while being checked by nothing: the audit **fails** on any tier-shaped `[tag]` outside the vocabulary (#564), and its error message lists the current set — that message and `KNOWN_TIERS` in `tools/_audit_research.py` are the machine-checked home, so no other doc re-lists the tags. **Something you can't verify isn't a low tier — it isn't a claim**: write it as a *re-check question* in Watch instead. *(The tier tag is also the enforcement hook: the audit mechanically checks source + accessed-date on every tier-tagged line. An untagged claim would otherwise escape the gate — so the audit also **warns** (warn-only, never fails) on the lowest-noise slice of that gap: a bare **quantitative** claim — a percentage or an `N×` multiplier — that carries neither a tier tag nor a source. That backstop is deliberately narrow; prose claims stay the tag-everything-that-asserts discipline plus review. A noisy gate trains the agent to ignore gates, so the heuristic stays conservative by design.)*
3. **Notes stale.** Every note carries `> reviewed: YYYY-MM-DD` and goes stale **~180 days** later: re-verify load-bearing claims (and bump the date) before planning against it. The audit warns on stale notes (`--strict-staleness` to fail).
4. **Different trust models stay distinguishable.** Cite this layer as `research/notes/<file>.md` / `EXP-NN` / `RR-NN` — **never as a `Book NN §X`**. Plans, tickets, and PRs must show which library a claim came from.
5. **Project-relative, not encyclopedic.** Every note ends with a feasibility path tied to this project's actual constraints, candidate experiments, and a Watch list (what to re-check, where, roughly when).
6. **Experiments are pre-registered.** Metrics and success criteria are written down **before** running (no post-hoc goalposts); baselines are named; seeds, commands, commit sha, and environment are recorded; variance is reported when margins are close; **negative results are recorded** — they prevent re-litigating.
7. **Figures regenerate — re-execution is a different, perishable promise.** Every figure in an experiment or report is produced by a committed script from committed data — no orphaned images. A report's numbers trace to `results/` files. That promise is about **regenerating from committed data**, and it is the durable half: it survives even the deletion of the code under test, because the plot script reads `results/`, not the subject. **Re-running the experiment is the perishable half, and was never promised** — a refuted mechanism gets deleted, and deleting refuted code is the correct call. So when the code under test is removed, the experiment's `## Reproducibility` section records the **last reproducing commit**, and **the deleting PR owes that note** — that PR is where the knowledge exists, and an experiment's frozen pre-registration tools must never be reworded to paper over the gap. Two traps worth knowing before you trust a re-run: the break is often **not loud** (EXP-09's probe still exits 0 with its mechanism deleted, writing a fresh results file that reports the treatment as a no-op — the template's EXP-09 `research/experiments/EXP-NN_<slug>/EXPERIMENT.md` › Reproducibility records the shape, upstream #713), and **no gate catches this class** — the needles are arbitrary string literals inside tools that may not be edited, so a checkable `reproduces_at:` field would go green while the actual breakage stayed invisible. The discipline rides the deleting PR by design; this is prose because a weak gate here would be worse than none.

## Layout

| Path | What it is |
|------|------------|
| [`MANIFEST.json`](MANIFEST.json) | Routing (`topic_to_notes`) + the lifecycle index (status per note/experiment/report). Audited. |
| [`notes/`](notes/00_TEMPLATE.md) | Survey notes — one per topic. Template: [`notes/00_TEMPLATE.md`](notes/00_TEMPLATE.md). |
| [`experiments/`](experiments/00_TEMPLATE.md) | `EXP-NN_<slug>/` dirs: `EXPERIMENT.md` + `results/` (data + plots + plot scripts). Template: [`experiments/00_TEMPLATE.md`](experiments/00_TEMPLATE.md). |
| [`reports/`](reports/00_TEMPLATE.md) | `RR-NN_<slug>.md` paper artifacts, markdown-first (export to docx/pdf is a rendering step, never the source of truth). Template: [`reports/00_TEMPLATE.md`](reports/00_TEMPLATE.md). |
| `banked/` | Frozen generation data captured from a scarce generator (e.g. a frontier-model access window), provenance-stamped as raw material for a later deliberate re-derivation slice. **No citation authority** — not notes, not experiments; each collection's `README.md` carries its provenance and trust model, and is routed in the MANIFEST like everything else. *Template-optional:* downstreams without generation-banking simply omit the directory — the audit no-ops on absence (tool header, #197), and the citation gate reads a bare `banked/` as the *name of this kind* rather than a citation into it (#688). That second half is load-bearing: #625 widened the citation gate repo-wide and silently made this row's own promise false for every downstream that omitted the directory, until #688. Cite a **collection** (`banked/<slug>/`) from outside `research/` and the gate will refuse it — deliberately, because optional content cannot travel with machinery. |
| [`tools/_audit_research.py`](tools/_audit_research.py) | The mechanical gate (below). Exits non-zero; CI runs it. |

## The audit

Run `python3 tools/_audit_research.py` from this directory (CI does, on every push):

- `MANIFEST.json` is valid; every entry's path exists; every on-disk note/experiment/report/banked collection is routed in the MANIFEST.
- Every note has a `reviewed:` date; every **tiered claim line** carries an inline `(source: https://…)` **and** an `accessed YYYY-MM-DD`. Untagged **quantitative** claims (a percentage / `N×` with no tier *and* no source) **warn** — a narrow, low-noise backstop for the gap where an untagged claim would skip the source gate; prose claims remain the discipline-plus-review boundary.
- Every report has its required sections (`## References`, `## Reproducibility`, …); every reference entry carries a URL.
- Every experiment has `EXPERIMENT.md` with the pre-registration sections.
- Every relative link / figure path in this layer resolves on disk.
- Stale notes warn (or fail with `--strict-staleness`). `--live` optionally HEAD-checks every cited URL (run locally before a report ships; not in CI — link liveness is too flaky to gate merges on).

## Authoring

Use the skills — they encode the procedure: [`research_topic`](../.claude/skills/research_topic/SKILL.md) (survey), [`run_experiment`](../.claude/skills/run_experiment/SKILL.md) (test), [`write_research_report`](../.claude/skills/write_research_report/SKILL.md) (publish). All three go through the normal ticket → branch → PR flow.

**Editing `MANIFEST.json` (#483):** it is hand-maintained — keep its existing indent and edit entries in place; never round-trip the whole file through `json.dump`, whose default indent re-serializes every line (a downstream sync's 6-entry change produced a 578-line diff and erased blame history). If tooling ever writes it, pin `indent=1` to match `SECTIONS.json`. The operative rule is also stamped in the file's own `$comment` (#644) — that copy is the one an agent doing mechanical bookkeeping actually reads, since nothing routes it through this doc first; keep the two in step.
