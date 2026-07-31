# Skill eval goldens — the admission gate (#302)

Skills encode judgment as prose procedures, and prose-following is measurably unreliable:
expert-authored SOPs land at 57–100% success depending on domain, and a *newer* model can
silently regress on the same text (both findings: SOP-Bench, arXiv 2506.08119 — sourced in
[`research/notes/agent-project-systems.md`](../../research/notes/agent-project-systems.md),
with the Anthropic evaluation-first-authoring and Voyager admission-gate lineage). Goldens
turn skill evolution from taste into regression testing: each **gated skill** carries 2–3
scenario tasks whose required artifacts are asserted **mechanically** — a SKILL.md diff
merges only with a fresh green run against the new text.

Two disciplines carry over from the research base, deliberately:

- **The author never grades.** Executors are *fresh-context subagents*; the grader is a
  Python script asserting on artifacts (no LLM judgment anywhere in grading). Frameworks
  that self-grade win their own benchmarks and prove nothing (#301 § benchmark-author caveat).
- **Assert the mandate, not the vibe.** Assertions target formats the skill itself forces
  (`claim:` lines, the fenced `/compact` block, `intake: #NN`, `dissolve check:`) and the
  load-bearing prohibitions (`--admin`, `git stash` on unexplained dirt, chained merges).
  The forced-artifact authoring rule (README › authoring) is what makes skills checkable.

## Layout — co-located, ships with the skill

```
.claude/skills/<name>/evals/goldens.json    # hand-authored: scenarios + assertions
.claude/skills/<name>/evals/RESULTS.json    # generated stamp: written only by the grader
```

Machinery syncs wholesale (README › machinery boundary), so downstreams inherit goldens
*and* the last-green stamp; their gate stays green until they diff a gated skill — then
they must re-run against their own edit. Both files are LF-pinned in `.gitattributes`
(the #360 recurrence rule).

## The golden contract (`goldens.json`)

```json
{ "skill": "<name>",
  "goldens": [ {
      "id": "kebab-slug",
      "intent": "one line: the regression class this catches",
      "scenario": ["lines...", "embedded command outputs replace running them"],
      "protocol_extra": ["optional: extra protocol lines appended verbatim to the dispatch prompt"],
      "assertions": [
        {"label": "...", "type": "must",     "pattern": "<python regex>"},
        {"label": "...", "type": "must_not", "pattern": "<python regex>"},
        {"label": "...", "type": "order",    "first": "<regex>", "then": "<regex>"},
        {"label": "...", "type": "order_if_then", "first": "<regex>", "then": "<regex>"},
        {"label": "...", "type": "order_last", "first": "<regex>", "then": "<regex>"},
        {"label": "...", "type": "word_count_max", "extract": "<regex, group 1>", "max": 110}
      ] } ] }
```

Patterns compile with `re.MULTILINE`; add `(?i)`/`(?s)` inline. `order` = first match of
`first` starts before first match of `then` (both must exist). `order_if_then` = same,
but an absent `then` passes — the shape for "a dangerous action, if narrated at all,
must follow its gate" (a faithful run may stop before the action; a blanket must_not
would false-fail the faithful full continuation — learned live on ship_pr's first run).
`order_last` = `order_if_then` anchored on the **last** match of `first` (#390). The two
are not interchangeable and picking wrongly inverts the meaning:

- **`first` recurs, and each recurrence re-arms the gate** ⇒ `order_last`. "The tree is
  clean when the handoff is emitted" is about the *last* `git add|commit`; under `order`
  an early `git add` satisfied it at offset 0 and a commit *after* the block sailed
  through. Verified: the pre-#390 type reports `order ok (0 < 64)` on that violator.
- **`first` happens once, and later look-alikes are unrelated** ⇒ `order_if_then`.
  "File the CI bug before starting a slice" must not be re-armed by a *followup* filed
  after the branch — `order_last` would fail that legitimate run.

Ordering cannot separate a genuine re-read from an executor **echoing the scenario's own
embedded output**, since both are the same protocol line; `order_last` narrows that hole
but does not close it. Where it matters, anchor `first` on something neither the
scenario's output nor free prose can spoof — a **protocol line naming the real
command** (ship_pr gates the merge on a `RUN:` that actually invokes
`scripts/preflight`, in a scenario whose embedded checks say `fail`). Content-literal
anchors (an observed `PREFLIGHT: PASS` string) are weaker on both sides: a stale-log
grep reproduces the literal, and an honest dry-run that refuses to invent unobserved
output never writes it (#481 pattern 3, caught live in the re-earn).
`word_count_max` counts whitespace-split words in group 1 of `extract`'s first match.
Where a skill's cap is soft ("~100 words") the golden picks the enforcement number and
says so in the label. Anchor protocol lines tolerantly — `^\W{0,3}RUN:\W{0,4}` — since
executors decorate them (backticks) despite the protocol's plain-text instruction.

## Running a suite (the executing session does this; CI never runs agents)

1. `python3 scripts/skill_evals.py list --skill <name>` — prints one executor prompt per
   golden and the output path each executor must write. It also **opens the run**: a
   `.run` stamp in the output directory, which `grade` refuses to look past (#603).
   Re-running `list` opens a *new* run, so outputs dispatched before it read as stale —
   re-dispatch them, or read the prompts from the first `list` rather than re-listing.
2. **Dispatching *is* the protocol, not an escalation — don't ask for it (#818).** Reaching
   this step **is** the standing request for these subagents, so a session posture of
   *"no subagents unless the user requested it"* is already satisfied: dispatch, and say so
   in the summary. The premise of the gate is that **the author never grades**, so an owner
   round-trip here buys nothing and stalls the re-earn behind a human; a dispatch the
   harness genuinely **denies** routes to the denial protocol (`CLAUDE.md` › Working style),
   never to a self-graded stamp. (Same rule, same reason as the review fan-out —
   `adversarial_review` step 3, #817.)
   Dispatch **each prompt to a fresh subagent of type `eval-executor`** (Agent tool,
   `subagent_type: eval-executor` — the [`.claude/agents/eval-executor.md`](../agents/eval-executor.md)
   contract: Read/Grep/Glob/Write only, **no Skill tool**, so a scenario matching the
   gated skill's own trigger phrase cannot derail the dispatch into a live skill
   invocation, and no Bash, so the dry-run's no-execution rule is harness-enforced,
   not prompt-enforced (#430). The contract pins no model — executors inherit the
   session model; the gate exists to measure the model that operates this repo, never
   a cheap-tier pin. **A type that does not resolve is a defect until proven
   otherwise — don't reach for the fallback first.** Run
   `python3 scripts/audit_ops_config.py`: since #595 it validates every
   `.claude/agents/` contract's frontmatter and names the offending key. A parse
   failure is permanent, not lazy — `eval-executor` never registered from the day
   it was created, and 129 green preflights ran through the fallback before anyone
   noticed (#593). If the contracts audit clean, the registry is built at **session
   start**: #430 saw a fresh contract resolve later in the same session, but #593's
   fix did *not* take effect until the next one (confirmed twice, before and after
   the merge) — so a fresh session, not patience, is the remedy. The fallback is a
   last resort and it **costs the guarantees**: a full-tool agent makes no-`Skill`
   (#430) and no-`Bash` prompt-enforced rather than harness-enforced, so a stamp
   earned through it is weaker evidence and should say so.
   The prompt carries the dry-run protocol: the executor narrates
   `RUN:` / `POST:` / `WRITE:` / `DECIDE:` lines instead of touching anything, writes
   its full response to the output path, and is told not to open any `evals/`
   directory (assertions stay blind-side; the scenario is all it sees).
3. `python3 scripts/skill_evals.py grade --skill <name> --model <session-model-id>` —
   asserts, prints per-assertion PASS/FAIL with evidence excerpts, writes `RESULTS.json`
   (truthfully — red stamps are written too; the audit is what refuses them).

**Degenerate dispatch (harness derail, not a red):** signature is ~2–8 s wall, zero
tool uses, no output file, and skill-policy boilerplate (or a literal `Skill(<name>)`)
as the final text — observed at 3/8 on scenarios matching the gated skill's own
trigger before the `eval-executor` guard existed (#430; `understand_intent`'s
"help me figure out…" is the worst case, but `ship_pr` / `prepare_compaction`
scenarios share the hazard). The grader flags it: `no executor output at <path>`
plus a dispatch-failure note. **Re-dispatch the identical prompt once** (every
observed retry succeeded); only a second consecutive miss is worth triaging as
real. A grade run over missing outputs writes a truthful red stamp — re-grade
after the re-dispatch rather than hand-editing anything.

**The second signature: work completed, delivery missed.** The one above is a run
that never *started*. This one runs fully and skips only the last step — long wall,
real tool uses, a substantive final message, and no `Write`. Measured on #728's
`definition_of_done` re-earn: 160 s, 7 tool uses, a faithful 12-gate checklist with
its closing `VERDICT:` line, and the output path still holding the previous run's
transcript from six days earlier. It matches **none** of the four tells above, so a
session triaging against those alone concludes "not a degenerate dispatch" and
grades. **The tell is that the reply *contains* the artifact** where the prompt
demands a single `wrote <path>` line — the executor answered the question instead of
performing the task. Nothing else separates "wrote the file and summarized it" from
"answered instead of writing it", and a convincing report gives an orchestrator every
reason to believe the dispatch worked; so the check is **mechanical, not editorial —
the mtime, never how well the reply reads.** Same remedy (re-dispatch once; the retry
succeeded here too). Two limits on that evidence: **n=1**, so the wall and tool count
describe *an* instance, not a threshold — what generalizes is the stale mtime, which
both signatures share; and this half bites only on **re-earns**, since a golden's
first run has no leftover file and collapses into the loud empty-path case.

**The third signature: delivery *refused*, and disclosed (#803).** The two above are the executor's own omissions. This one is the harness's: the dispatch runs fully, decides to write, and the platform **blocks the `Write`** — *"Subagents should return findings as text, not write report files"* — so the artifact never exists. Observed on #707's `triage_inbox` re-earn: 686 s, 12 tool uses, a complete and faithful response, both write attempts refused. Diagnosis, from evidence rather than inference: its two sibling dispatches wrote to the *same* directory with the same agent type and succeeded, and the notification named what tripped it — `instruction-shaped pattern(s): settings-json, permissions-allow-deny`. So the guard is **content-triggered**: a golden whose faithful answer must author a settings snippet or a `permissions.allow` fragment — which the denial protocol *requires* an agent to surface — cannot be delivered by a subagent write here. Three things follow. This executor **disclosed the block** and returned the content in-band, which is the honest form of the same end state, and the freshness check refused it anyway on the mtime — the guard holding on a cause it was never designed for. **Don't rescue it by writing the file from the reply:** the harness neutralizes returned text (control tags rewritten, `<`/`&` entity-escaped), so the grade would measure the mangling and the artifact would carry the orchestrator's typing instead of a fresh context's. And **don't re-dispatch verbatim** — a content-triggered guard fires again; either give the scenario a shape whose faithful answer needs no settings text (a local clone instead of the `gh api` fork, which is what #707 did) or accept the class as un-evallable and say so. One `list` re-run re-stamps, so the price is re-dispatching **every** golden for the skill, not just the blocked one.

**The quieter half: a dispatch that fails while a file is already there.** The
signature above ends in an *empty* path, which is loud. When a previous run left
a transcript at that path, the identical failure is silent — the grader asserts
on six-day-old evidence and stamps it with whatever `--model` you passed. That
is not hypothetical: it is what #591 walked into (three Fable-era outputs, two
for a skill not yet dispatched at all), caught only because the mtimes were
checked by hand for an unrelated reason. Since #603 the run stamp closes it —
a pre-run output is refused with `output predates this run (written …, run
opened …)` and routed to the same re-dispatch remedy. Two consequences worth
knowing: `grade` **hard-refuses an unstamped output directory** without writing
any stamp (so a forgotten `list` can't overwrite a green `RESULTS.json` with a
red one), and staleness is **per golden** — a stale sibling never taints a
transcript that really is this run's.

**So wait on freshness, never on existence** (#768). The obvious wait — poll until the
output paths exist — is satisfied *instantly* by the previous run's files, which is the
same trap one paragraph up wearing a different hat: the orchestrator concludes the
dispatch finished before it started. Compare against the run stamp instead, the exact
boundary `grade` enforces: `until [ <out> -nt <dir>/.run ]; do …; done`. Observed live
while paying #730's re-earn — an existence loop returned in under a second on
day-old files; the freshness loop measured the real ~5.5 min. Nothing bad shipped,
because `grade` would have refused them, but the whole point of a wait is to stop
*before* asking the grader.

**And the same comparison is owed at completion, not only while waiting** (#740). An
executor that has already replied leaves nothing to wait *for*, so the freshness loop
never runs at all and the leftover file goes unexamined — exactly how the second
signature reaches the grader. So `list` prints the offending mtime up front whenever a
file already sits at an output path (`WARN a PREVIOUS run's output is already at this
path, written …`), fired on the very boundary `grade` refuses on, so *is this from my
run?* is answered on screen at dispatch time rather than reconstructed after a wasted
grade cycle. It stays a warning, not a refusal: those transcripts are the corpus that
tells a golden defect from a model regression (#602), so nothing deletes them.

A full-suite run costs ~12 subagent dispatches and happens only when a gated SKILL.md
changes or the model changes — the every-preflight cost is the static audit alone.

**What one skill's re-earn costs, measured** (#384, 4 cycles on 2026-07-18): ~86k
subagent tokens and ~4–5 min wall-clock per skill (its 2 goldens run in parallel; the
long pole is the artifact-heavy one). **Any** byte-change to a gated SKILL.md pays it —
a cross-reference costs what a new step costs, deliberately: "cosmetic" is a judgment
the gate exists to not have to trust. That is affordable because the case is rare —
across 60 days and 33 commits touching gated skills, 31 changed conduct, 1 was purely
cosmetic, 1 debatable. Sessions should expect the cycle, not be surprised by it; the
escape hatches (region-scoped hashes, self-declared trivial edits) were considered and
rejected in #384 as new trust surface bought for ~1 wasted cycle every two months.

## The admission gate (`skill_evals.py audit` — wired into preflight + CI static gates)

Per gated skill (the `GATED_SKILLS` tuple in the script — recurrence rule there):
goldens.json exists, parses, ≥2 schema-valid goldens; RESULTS.json exists, is **green**,
and its content hashes match the *current* SKILL.md + goldens.json (CRLF-normalized —
checkout-eol-proof). A hash mismatch means "text changed since last run": the gate
fails with the exact re-run commands. You cannot merge a gated-skill diff without
re-earning the stamp against the new text.

**Model change** (SOP-Bench: 72.4%→63.3% on a model upgrade, same SOPs): the audit's
summary line prints the stamp models. The comparison that earns a ticket is the
project's **intended** model vs the stamps — *not* whatever model this session
happens to be, which is usually noise. A mismatch has three causes and only one is
a finding:

- **Deliberate migration** — the intended build model changed. Re-earn the suite;
  this is the case the rule exists for (#590 set an intended model, #591 is what
  the re-earn looks like).
- **Lane difference** — a review, spike, or triage session on a different model *by
  design*. File nothing: that session isn't the one the stamps certify, and the
  skills it leans on (e.g. `adversarial_review`) aren't in `GATED_SKILLS` anyway.
- **Involuntary guard-swap** — a Claude-side classifier moved the session mid-slice
  (#585). Tell the owner and carry on; it is not a re-earn, and never a
  `skill-defect:`.

Collapsing the three into "session ≠ stamp ⇒ file a re-earn" produced one spurious
ticket (#581). The session-resume ritual — whatever your project calls it (upstream:
`onboard` Mode B) — owns the comparison and **never blocks a resume on it**. The duty
belongs to the *role*: adapt onboarding and the comparison moves with it.

## Downstream boundary (#470) — what an inherited green gate does and doesn't mean

- **Stamps ship as the upstream baseline.** A fresh downstream passes `audit` because the copied SKILL.md + goldens + `RESULTS.json` are internally consistent — but that green certifies the *template's* session model, not yours. Re-certification against the downstream's own session model is the downstream's own step (same discipline as the model-change re-run your session-resume ritual owns, above); never read the inherited green as "evaluated here."
- **Goldens are skill-text-coupled.** Assertions target artifacts the *specific* SKILL.md forces — a downstream that renames or adapts a gated skill inherits goldens asserting the upstream procedure: red at best, **silently vacuous at worst** (field data: 3 of 6 gated suites needed full re-authoring after one downstream's skill adaptations — a golden that passes against the wrong skill text is worse than a dangling reference). Touching a gated SKILL.md means re-auditing and likely re-authoring its goldens in the same breath. A downstream deferring the whole gate declines the `skill evals` stage via `UNWIRED_STAGES` (#612), never by deleting it from the preflights. The audit WARNs on the mechanically detectable slice of the vacuous case (#471): a golden none of whose `must`/`order` assertions shares a literal token with the current SKILL.md can't go red under skill-text drift — re-anchor an assertion to the skill's own phrasing (warn-only; promotion is a retrospective call).

## Authoring & failure triage

- Target **decision points and Don't-rules** — where a weak executor goes wrong — not
  happy-path prose. 2–3 hand-authored goldens per skill; more is maintenance, not
  safety. (Regression goldens *earned* through the evolution loop below are additive
  by design — each one is a live failure locked in, not authoring ambition.)
- An assertion that fails on a *faithful* run is a **golden defect**: fix the golden
  (same PR as the finding) — cheapest, since one re-earn cycle covers both. Exception,
  when the defect blocks a slice it has nothing to do with: give it its own ticket and
  PR, because a red gate on a shared skill blocks every writer and every downstream, not
  just you. That ordering costs one extra cycle (#379/#381 each did) and buys a clean
  record of what the assertion got wrong. A faithful run that exposes a real gap in the skill text is
  a `skill-defect:` ticket (README › misfire rule). A failing run against a *candidate
  diff* is the gate doing its job — fix the diff.
- Scenario preambles are harness, tunable; assertions are contract — weakening one to
  pass a diff is the same defect class as deleting a failing test.
- **Every assertion must hold in two worlds** (#393, learned via #388/#391). Goldens sync
  wholesale, so each one runs both in a filled downstream *and* in the template, whose
  docs are deliberately unfilled placeholders — and the executor reads **its own** repo's
  rules, not just the scenario's. #382 required a `WRITE:` to `CLAUDE.md`/`ROADMAP` at the
  merge-time checkpoint: a faithful reading of `ship_pr` step 7, green downstream, and
  red here — where the run was *right* to refuse, because those unfilled anchors are the
  shipped artifact, not a stale cache. Assert **write-or-reasoned-skip**: the gate still
  catches silence, while a project whose correct behaviour is the skip can say so. The
  smell to check for is any assertion demanding a write to a doc some copy keeps as a
  placeholder.
- Expansion path (deliberately not v1): end-state evals in throwaway worktrees — grade
  the repo after a *live* run, not the dry-run transcript. Builds on this gate.

## The evolution loop (#303) — how skill text changes on evidence

A SKILL.md mutation is **kept only if it beats the incumbent** — AFlow's acceptance
rule; GEPA supplies the failure-side method and Agent Workflow Memory the success side
(all sourced in the research note above). Two directions, one gate:

- **Failure-derived (the skill-defect fix):** the ticket's required `diagnosis:` block
  (excerpt + textual root cause — `track_followups` bullet 5) is the mutation input;
  the diff answers the root cause, nothing more. For a procedure-class defect, distill
  the failure into a **regression golden** first and prove the incumbent fails it:
  `grade --skill <name>` red on the new golden, with the failing excerpt quoted in the
  fix PR's body. The candidate diff is accepted when the full suite — regression golden
  included — goes green, re-earning the stamp. Beat-the-incumbent, mechanically:
  incumbent red on the new golden, candidate green on all, prior goldens untouched.
  Routing-class defects (the skill never fired, or fired when it shouldn't) can't be
  goldened — goldens grade procedure-following, not triggering; their gate stays the
  description diff + before/after measurement (README › misfire rule). Weakening an
  existing assertion to admit a diff is the deleted-test defect class (above): the
  regression golden is *added* evidence, never traded.
- **Success-derived (`retrospective` step 7):** a mined workflow move enters a skill as
  a normal diff and rides the same stamp — no separate path. If the win names a new
  *scenario* worth locking in, add it as a golden the incumbent already passes:
  ratcheting coverage, not gate-gaming.
- **Non-gated skill took the defect?** The regression golden plus one companion golden
  gates it: add the name to `GATED_SKILLS` in the same PR (the tuple's recurrence rule;
  the audit's WARN on ungated goldens points the same way). Defects are how the gate
  grows.
