# Sync Reference — the lookup half of `update_from_template`

Companion to [`SKILL.md`](SKILL.md), and part of the same wholesale-synced skill directory: it arrives in every downstream with the procedure it serves, so the skill's links to it resolve everywhere (#810).

**The split is by *how* you read, not by importance.** `SKILL.md` is read **in order** — the seven steps, each rule with the clause saying what ignoring it costs. This file is read **with a key in hand**: a path you just overwrote, a constant you're about to copy, a rule that surprised you. Nothing here is optional; it is *indexed*.

Five sections:

- **Classification buckets** — the first-match table step 3 sorts every machinery path through. Keyed by path.
- **Per-path reconciliation** — for each wholesale directory, what to re-apply after the overwrite. Keyed by path, walked during step 3.
- **Project-mirrored constants** — the roster's single home (#685). Keyed by constant.
- **Per-artifact port routing** — step 4's two rules for what a ported paragraph may carry. Keyed by the artifact in hand.
- **Field record** — the evidence, field numbers, and recovery procedures behind the skill's rules. Keyed by step.

**Where new sync lessons go.** A lesson learned on a sync lands in the field record below, not in `SKILL.md`'s body: that body lazy-loads in full on every invocation, and "agents appending lessons-learned" is the observed shape of a skill outgrowing its budget (`textbooks/tools/_audit_routing.py` states the budget and the reason). If the lesson also changes what a syncing agent must *do*, the imperative goes to the skill in one clause and its evidence comes here.

## Classification buckets

Step 3's opening move (#610). For every machinery path present at `$TGT`, compare *committed* blobs three ways — downstream `HEAD:<p>`, baseline `<sha>:<p>`, target `$TGT:<p>` — and take the **first** matching row:

| test | bucket | action |
|---|---|---|
| absent downstream | new upstream file | take it |
| `== $TGT:<p>` | already at target | no-op |
| `== <sha>:<p>` | untouched since the baseline | take upstream |
| `git -C <source> cat-file -e <downstream blob>` succeeds | **dirty-copy artifact** — content upstream has, from a revision the stamp doesn't name | take upstream |
| otherwise | **genuine downstream edit** | **hand-judge** |

The fourth row is why this beats ergonomics: a blob the downstream carries that upstream *also* has is upstream content whatever the stamp says, so it **recovers a missing `copied_dirty` pair after the fact** — the #243 gate's known miss. Needs a full local clone; a shallow one has no old blobs, so everything falls to the last row — more hand-judging, never a silent overwrite. Downstream-local paths are absent at `$TGT`, so they never enter the loop; preserving them is the wholesale rule in the skill, not a bucket here.

## Per-path reconciliation

Every row is machinery: upstream's version replaces yours. The third column is what you owe **after** the overwrite — skip it and the named cost lands on the first post-sync run, not later.

| Wholesale path | Re-apply / reconcile afterwards | Skipping it costs |
|---|---|---|
| `.claude/skills/` | re-create the project's **derived skills** and re-register them in `textbooks/MANIFEST.json` `skills[]` | the routing audit fails on any catalog↔disk mismatch |
| `.claude/skills/` (grounding notes) | a machinery skill may hard-cite a `research/notes/` file as its grounding — that note is **machinery too** (README boundary table › *skill-grounding note*): take it in this same pass | the citation dangles and the first post-sync run fails — `audit_repo_links` for a markdown-linked cite, `audit_ops_config` for a backticked one (#344, unenforced until #607) |
| `.claude/hooks/` | `block_naked_todos.py`'s `EXEMPT` is a **project-mirrored set**, not wholesale — reconcile against *your* preflight/ci/hook sites like a filled stage body | check 4 fails on pathspecs your other sites don't carry (#135, hit live) |
| `.claude/agents/`, `textbooks/tools/`, `research/tools/`, `textbooks/LIBRARY_SEED.md`, `textbooks/books/00_TEMPLATE.md`, `research/*/00_TEMPLATE.md` | nothing — plain wholesale | — |
| `scripts/`, `.github/` | take upstream's **structure**, then re-apply the project's **filled stage bodies / real CI commands** on top (structure is upstream's; commands are yours) | a synced structure running the template's placeholder commands |
| `scripts/`, `.github/` (diverged files) | a file the project has **structurally diverged** from (e.g. a flat template script re-nested into `main()`) is a recorded deviation and ports **by hand** | the upstream diff's line-contexts don't apply; a mechanical apply corrupts the file (#276) |
| `.github/` (issue forms) | a synced form that auto-labels (`labels: [...]`) needs its label(s) to exist — `gh label create <name>` for any the repo lacks | GitHub drops unknown labels at submission: the ticket lands unlabeled, label-filtered lanes never see it, and the lane looks wired while being invisible (#127, hit live) |

`.claude/settings.json` is deliberately **not** in this table — its rule is a trust boundary and stays in `SKILL.md` step 3 where it cannot be missed.

## Project-mirrored constants — the roster

**Machinery syncs wholesale, but these name *your* project's reality, so a verbatim copy is a regression rather than an update:** reconcile each like a filled preflight stage body. This is the **single home** of the roster (#685) — it previously lived in two partial, disagreeing copies (the skill and the README boundary table) and they drifted apart; the README now points here, and so does every machinery comment that names a mirror constant.

**Sweep rule when you extend the machinery:** a constant the audits compare against a project's real config belongs in this table. The two that started #685 were found by a downstream's red run, which is the expensive path.

| Constant | Where | Names *your*… | A verbatim copy costs you |
|---|---|---|---|
| `EXEMPT` | `.claude/hooks/block_naked_todos.py` | TODO-hygiene exemption pathspecs | check 4 fails on the first post-sync run (#135, hit live) |
| `TODO_EXEMPTION_SITES` | `scripts/audit_ops_config.py` | files check 4 compares those pathspecs across | auditing a site you don't have (#123) |
| `PREFLIGHT_TO_CI` | `scripts/audit_ops_config.py` | preflight-stage ↔ `ci.yml`-step map | red immediately — every filled stage name is yours (#685) |
| `CI_ONLY_STEPS` | `scripts/audit_ops_config.py` | CI steps with no preflight mirror | red immediately — toolchain/bootstrap steps are per-stack (#685) |
| `UNWIRED_STAGES` | `scripts/audit_ops_config.py` | stages you deliberately declined, each with its reason | your declines silently wiped — declined gates resurrect, SKIP-passing ones with no red at all (#612) |
| `MIRROR_DIVERGENCES` | `scripts/audit_ops_config.py` | mapped pairs whose sides deliberately differ, + the fingerprint pinning each | a fingerprint pins *your* stage bodies, so a copied one reads `drifted` the moment your sides differ from upstream's — and a filled stage with a real divergence (a `working-directory`, a per-shell spelling) needs *your* entry, which upstream's list cannot contain (#729) |
| `PREFLIGHT_SHELLS` | `scripts/audit_ops_config.py` | shells you actually ship | re-demands the mirror script a single-shell project deleted (D-218) |
| `IF_MIRROR_JOBS` | `scripts/audit_ops_config.py` | classifier/aggregate `ci.yml` job pair | half the pair present is *always* a failure if you restructured CI (#213) |
| `REF_EXEMPT` | `scripts/audit_staleness.py` | living / policy-home docs | re-flags the policy-pointer warns you already tuned out (#228) |
| `CHECKPOINT_PREFIXES` | `scripts/metrics.py` | receipt-less-by-design branch prefixes | the #269 receipt exemption is lost and the tripwire drowns (#295, hit live) |
| `CHECKPOINT_SUBJECT_PREFIXES` | `.claude/hooks/session_start_banner.py` | checkpoint commit-subject convention | zero matches — the checkpoint false-STALE returns (#340) |
| `CHECKPOINT_TRIO` | `.claude/hooks/session_start_banner.py` | checkpoint's real file footprint | a checkpoint that also stamps another doc still counts toward STALE (#507) |
| `HOT_FILES` | `scripts/fleet_size.py` | merge-owned hot files | lane seeds contradict your fleet protocol (#349) |
| `SUBJECT_CAP` | `.claude/hooks/block_commit_rules.py` | commit-subject bar | silently reverted to upstream's number every sync (#715) |
| `REGISTRY_ISSUE` | `scripts/audit_name_leaks.py` | pinned registry issue | the name list is fetched from *our* registry, not yours (#363) |
| `NON_WORKABLE` | `scripts/ready_work.py` | labels meaning "not a workable ticket" | a project-added blocking label reads as ready (#308) |
| `GATED_SKILLS` | `scripts/skill_evals.py` | admission-gated skill set | a derived skill ships ungated, or a skill you dropped fails the audit (#302) |
| `N skills total` | `.claude/skills/README.md` | on-disk skill catalog count | the first post-sync audit fails (#261, #294) |

### Three rows carry nuance a table cell can't

- **`CHECKPOINT_PREFIXES`** owns *every* receipt-less-by-design class, so add your grant-class settings-PR prefix too if you route one (#468) — but **never copy in a prefix you don't have**: a zero-match entry is the #295 trap pointing the other way.
- **`SUBJECT_CAP`** is a one-line re-key by construction (#715) — messages, `--report`, the commit *and* PR-create reminders, the derived `TITLE_CAP` for `gh pr create --title` (#735), and the whole selftest corpus all follow from it, so the suite stays green at any value. Measure yours first with `python3 .claude/hooks/block_commit_rules.py --report`, and read **both** columns it prints (stripped judges the hook, raw judges your `git log`).
- **`CI_ONLY_STEPS`** can also go stale in the *other* direction: when upstream deletes a CI step, a downstream still listing it holds a member with no referent (`3e5eed5` dropped `Skills are directories` exactly this way, #680 finding d) — so when a sync's diff removes a named CI step, drop it from your set in the same pass.

### One constant graduated off this table (#679), and the shape of that graduation is the point

`SELFTEST_HOOKS` / `SELFTEST_SCRIPTS` sat here as *"machinery you actually carry — prune yours"*, which is a reconciliation you owe **every sync forever**: the file syncs wholesale, so each sync re-adds the entries you pruned last time. Take the registries **verbatim** now and declare the gap instead — `.claude/project.json` `"unadopted": ["scripts/audit_name_leaks.py"]` (README boundary table › *Project posture*; reader `scripts/project_posture.py`); its preflight *stage* is declined separately via `UNWIRED_STAGES` (#612). A declaration is durable where a prune is not, and it says the true thing: the deviation is *yours*, not a difference in the registry.

Two arms make it real rather than mere tolerance — an **undeclared** absence still fails, so a script a sync dropped or someone deleted by accident is still a hole; and a declaration whose file **came back** fails as stale, which is not hypothetical: step 3 re-takes any machinery path absent downstream, so the sync that follows your deletion restores it and, without that arm, your recorded deviation silently reverts.

**Adopting machinery of your own?** Adding entries is an addition on top of wholesale (like a derived skill), never a reason to reopen this row.

## Per-artifact port routing

Step 4 hand-ports content, and two rules decide what a ported paragraph may carry. Both are keyed to the artifact in your hand, which is why they live here rather than in the step.

**Upstream `#NN` refs in ported prose (#300).** The template's ticket numbers name *live, unrelated* issues on the downstream tracker. Route by the **receiving doc's lineage**:

| receiving doc | upstream `#NN` refs | why |
|---|---|---|
| **template-lineage** — `PROJECT_CONVENTIONS.md`, `textbooks/reference/*` | keep them | the reader knows the doc is template-derived; same precedent that lets machinery guard comments carry provenance |
| **downstream-owned** — root `CLAUDE.md`, which speaks in the project's own ticket numbers | never a bare ref — translate to sync-date provenance (*"(Adopted at the YYYY-MM-DD template sync.)"*) or drop it | a bare ref silently cites whatever issue holds that number here |

**Research artifacts: notes travel; a report cite is dropped, not half-ported (#627).** Self-contained survey **notes** port cleanly. **Reports (`RR-NN`) generally don't** — the README boundary table's *cited research artifact* row carries the rule and the reason; at the port it means the **"neither" branch is a report's default**. So a ported doc or note carrying a backticked `research/reports/RR-NN_<slug>.md` cite either brings the report *and* the experiment data its `## Reproducibility` section names, or **drops the path and keeps the finding in prose**. Don't half-port the chain to clear the gate: `audit_ops_config` resolves the whole namespace (#625), so a ported cite with no report goes red — correctly, since the target really is absent.

## Field record — what each rule cost when it was learned

Keyed by the `SKILL.md` step that states the rule. Every entry is a rule that exists because a sync paid for it; the numbers are field measurements from the downstream corpus they were taken in, and are not claimed beyond it.

### Step 1 — baseline and target

- **An unresolvable `source_path:` means a different machine, not a dead upstream (#737).** The session that read it the other way filed its findings locally, beside a clone of the repo it was already authenticated against. That is why the resolution ladder ends in a clone: every rung is cheaper than concluding upstream is gone.
- **Two failures in one downstream's first sync, same root — a plausible sha naming the wrong tree.** Upstream published four commits mid-sync, so some ports read the newer revision and others the older: **a silent two-revision mix under a stamp naming one of them**, caught only by the luck of a verification ordering (#609). And the source checkout sat on an in-flight `slice/*` branch a commit ahead of main, so a literal `..HEAD` would have pulled **unmerged upstream work into a downstream, ahead of the template's own merge gate**.
- **The unfetched-source half is the quiet one (#686).** `origin/main` in a local clone is only as current as its last fetch, so a stale clone silently pins a stale target and the sync ports work upstream has already superseded. Same class as the branch-name bug, minus the symptom.
- **`copied_dirty: true` means the baseline is approximate** (onboard's clean-baseline gate, #243): the copy carried template work beyond `sha`, so expect some upstream commits to be already-on-disk no-ops, and diff the listed `dirty_files` at content level before applying.

### Step 3 — machinery

- **`rm -rf && cp -r` is the trap in "wholesale" (#466, hit live).** It deleted a downstream-local `PreToolUse` hook still registered in `settings.json`, and the missing file then hard-blocked every shell call — *including* the `git checkout` that would have restored it. **Recovery:** write a no-op stub at the path via the file-write tool, then checkout over the stub. This is why the rule is "upstream files replace their counterparts", never "the directory is replaced".
- **Per-feature adoption notes exist because four features each surprised a downstream on first wiring:** the name-leak audit is template-with-registry only (#469); fleet scripts need the ticket-grammar prerequisite (#470); skill-eval stamps are the upstream baseline while goldens are skill-text-coupled (#472); and the shellcheck gate's SC1091 on a sourced local toolchain is a documented first-run finding, not a broken gate (#690, intake #681 — upstream's preflight sources nothing, so the gap was only ever visible downstream). **Declining any of these *stages* is one `UNWIRED_STAGES` line, not three deletions (#612)** — the rule's single home is the constant's comment in `scripts/audit_ops_config.py` (incl. the live-CI caveat: there the ci.yml step deletion is still owed); reconcile the entry at sync like every roster row above. `unadopted` covers a declined script *file*; `UNWIRED_STAGES` a declined *stage*.
- **Classification beats reading the diff, measured: one field sync split 302 files as 50 / 18 / 25 / 13** — the difference between a sync a session can do carefully and one it rubber-stamps (#610). The dirty-copy row is why the split beats mere ergonomics: a blob the downstream carries that upstream *also* has is upstream content whatever the stamp says, so it **recovers a missing `copied_dirty` pair after the fact** — the #243 gate's known miss, hit live on a copy taken from a dirty source tree with nothing recording it.
- **A recorded deviation became 15 hard FAILs, and only re-reading the bucket dates it (#689, intake #681 finding 3).** At one sync a downstream deliberately declined `research/notes/agent-project-systems.md` — template-internal harvest research, no consumer there, and it would pollute a satellite-domain corpus. Correct that day, and the PR body recorded it. By a later sync **12 files under `.claude/skills/` hard-cited it** (D-615), so that one recorded deviation had silently become 15 FAILs — learned by running the gate, which is the expensive way. The deviation-recording discipline worked exactly as designed; what was missing was any signal that a file you *declined* had since become load-bearing. **A deviation is a decision with a shelf life, and nothing else stamps the date on it.**
  - **What re-reading the bucket cannot tell you**, stated rather than papered over (#703-shaped): upstream has no deviations of its own — it *is* the template — so the expiry **event** is unobservable there. The bucket is verified against the real citation graph; "a deviation that went stale" is a state only a downstream ever holds, and re-reading the list each sync is the whole of the coverage for that half.
- **Two time-sinks, both existing rules invisible from where you're standing (#613).** *EOL* — if your `.gitattributes` is broader than upstream's (a repo-wide `* text=auto eol=lf` against the template's per-file pins), extraction via `git archive` writes CRLF into the worktree and **every extracted file reads as modified**, turning the diff you're meant to read carefully into pure noise. Neither policy is wrong; comparing committed blobs sidesteps the clash, extraction doesn't. *Encoding* — shelling out to read upstream is exactly where `subprocess.run(..., text=True)` bites: cp1252-decoded upstream JSON mojibaked every em-dash in one sync. The rule and its remedy are single-homed in `PROJECT_CONVENTIONS.md` › *Python machinery encoding discipline* (#296).
- **A skill's grounding note is machinery, and 4 of 5 downstreams rediscovered that independently (#344)** — because until #607 the backticked half of the citation check was silently unenforced.
- **A relocated guard reads downstream as a deleted one — hit live, and the "responsible" fix made it worse (#647).** Upstream moved the flat-skill-file check out of a `ci.yml` step into `textbooks/tools/_audit_routing.py` (`ff071b7`), where it runs in **both** worlds via the `library audits` stage. The downstream read the deletion as a weakening and re-added the CI step with a widened exemption list — thereby re-creating the second home for that list which the move existed to remove. Worse off than doing nothing, while doing the responsible thing.
  - **Why the candidate list is a floor, not a census:** the gate-map diff names what *left* `PREFLIGHT_TO_CI` / `CI_ONLY_STEPS` (this case included — the step was a `CI_ONLY_STEPS` entry until `ff071b7` dropped it), but it cannot name the **destination**, which is the half you actually lack; read the removing commit's message for that (`ff071b7`'s states it verbatim). Enforcement that never entered those maps — hooks, checks inline to an audit script — never appears there at all.
- **Settings: the agent never adjudicates a trust-boundary rule case-by-case (#277).** Even a **D-210 dual-spelling entry** (a `python3` twin of an already-granted `python` command) is surfaced rather than applied. The owner's yes is expected to be one word, but it stays theirs to say.

### Step 4 — content ports

- **Ported upstream `#NN` refs mis-cite live downstream tickets (#300).** Two field reports watched it happen (intakes #284 item 4, #465 finding 6): a ported ref like `(#305)` names a real, unrelated issue on the receiving tracker. Hence the lineage split — template-lineage docs keep upstream refs because the reader knows they're template-derived (the same precedent that lets machinery guard comments carry provenance); downstream-owned docs get sync-date provenance instead.
- **A report cite is dropped, not half-ported (#627).** Upstream's own `research/notes/intent-elicitation.md` cites `reports/RR-01_elicitation-ordering.md` inside a sentence whose finding survives the path being removed — that is the worked shape.

### Step 5 — verify

- **A newly-adopted doc budget failing on *your* docs is the gate working, not a sync defect** — and the field split by debt size (#276). **Small debt:** both first #232-contact syncs absorbed it in the same PR; worst lines were 19,690 and 3,594 chars (#241), and the budget's own FAIL text carries the rewrite rule. **Milestone-narrative-scale debt:** one field case had 13 over-width lines, worst 11,966 chars, and another a single 76,358-char line — at that size two downstreams independently chose deferral against the old always-same-PR rule. The rule was under-specified, not the projects wrong.

### Step 6 — re-stamp

- **Nothing on disk forces the re-stamp, and a forgotten one poisons the next sync's baseline (#171, hit live downstream).** The next sync diffs from the stale sha — wrong by omission, and caught only by hand-diffing disk against the stamp. Stamping a freshly-resolved upstream HEAD instead of `$TGT` is the same failure with extra steps: after mid-sync motion it stamps commits nobody read (#609, #686).

### Step 7 — report upstream

- **The paste-ready fallback is an expected path, not a defect (#124).** Any of: no slug, no `gh` access, a missing label, or the harness's auto-mode classifier denying the cross-repo write — the last seen live *even with* `gh issue create` allowlisted, which places it at the classifier layer rather than the rules layer, so don't retry it and don't chase a settings rule.
- **No owner grant is owed per sync (#708).** The `--repo` write is **sanctioned path (1)** in `PROJECT_CONVENTIONS.md` › Merge policy: a standing downstream→upstream `inbox` lane whose target and action are fixed by protocol rather than chosen in the moment. That is not the agent picking a repo, which is what the rule forbids.
