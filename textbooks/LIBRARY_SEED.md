# LIBRARY_SEED.md — Build A RAG-Ready Knowledge Library For Any Domain

> **You are Claude Code. A user dropped this file into an empty (or new) project folder and told you to read it and build a library for some subject.** This document is your complete instruction set. Follow it to produce a structured, self-validating, agent-ready knowledge library — the same architecture as a well-built engineering textbook series, but for *their* domain (a simulation engine, a trading system, a bioinformatics pipeline, a compiler, a robotics stack — anything).
>
> **How the user invokes you:** they say something like *"Read LIBRARY_SEED.md and let's build a library for &lt;X&gt;."* When you see that, **start at Step 1 (Interview)** below. Do not skip the interview — the whole point is a library shaped to *their* domain, not a generic dump.

This seed is domain-agnostic. Wherever it says "the subject" or "&lt;example-system&gt;", substitute the user's actual domain and their named example system.

---

## 0. What You're Building (the end state)

A finished library is a folder containing:

```
README.md  CLAUDE.md  AGENT_GUIDE.md  LIBRARY_SEED.md  CHANGELOG.md   — entry points & meta (root)
MANIFEST.json  SECTIONS.json  ROUTING_EVAL.json                        — machine indexes for RAG (root)
books/NN_title.md         — the curriculum, numbered, grouped into volumes
reference/                — lookup docs: GLOSSARY INDEX PATTERNS ANTI_PATTERNS DECISION_TREES
                            SYMPTOMS WORKFLOWS STARTER_KIT COMPARISON TOOLING (+ domain docs, see §6)
vision/                   — inspirational docs: PROLOGUE FUTURES MOONSHOTS (optional)
skills/                   — drop-in Claude Code skills + PROJECT_CONVENTIONS.md
tools/                    — _gen_sections.py _audit_refs.py _audit_routing.py _audit_links.py (embedded §9; run from root)
```

The library serves two audiences: a **human** reading a study path, and an **LLM agent** consulting it via RAG while building real things in the domain. Everything below exists to make both work — and to keep the library **internally consistent and self-validating** as it grows.

The three properties that make it good:
1. **Routable** — an agent can get from a question to the right section fast (MANIFEST + SECTIONS).
2. **Verifiable** — every cross-reference resolves; routing is tested; nothing is asserted that can't be checked (the three `_audit_*` / `_gen_*` scripts enforce this).
3. **Honest** — it states what it does *not* cover (`coverage_gaps`) and where an agent's leverage is low.

---

## 1. Step 1 — Interview The User

Before writing anything, establish the shape of the library. Ask the user (batch these; don't interrogate one at a time):

1. **Subject & scope.** What is the library about? What's in scope and explicitly out of scope?
2. **Audience & assumed background.** Who reads it? What can you assume they already know?
3. **The named example system.** Pick (or ask for) a memorable name for the canonical example the library builds throughout — the analogue of a reference implementation. (e.g., a sim library might call its example simulator "Flux".) A consistent named example makes the library cohere; it also becomes the default in `PROJECT_CONVENTIONS.md`.
4. **Tech / tool assumptions.** Default language(s), key libraries, formats, platforms — the "unless you say otherwise, we assume…" baseline.
5. **Major areas → the volume/book outline.** What are the big topic clusters? These become **volumes**; each splits into **books**. Get the user's mental model of the territory.
6. **Depth / scale & appetite.** How deep? A coherent **core of ~8–15 books** is a strong start; it can grow later via the deep-dive convention (§5). Don't over-commit to 40 books on day one unless they want that.
7. **Domain "realities."** Any non-technical concerns that matter (regulation, cost, team, ethics, ops)? These may warrant their own reference doc.

Then **propose a volume/book outline and the reference-doc set, and get explicit approval** before building. Show it as a numbered list grouped by volume. Iterate until they're happy. This outline drives everything else.

---

## 2. Step 2 — Conventions & Quality Bars (read before writing)

These conventions are what the validation scripts depend on. Adopt them exactly.

### 2.1 Section-ID grammar (critical — the scripts parse this)
Headings in books use these forms, and **citations reference them as `Book NN §X`**:
- `## N. Title` → section `N` (e.g. `## 4. Title` → §4)
- `### N.M Title` → subsection `N.M` (e.g. `### 4.3 Title` → §4.3); `#### N.M.K` for deeper.
- **Deep-dive sections** (to add depth without renumbering): `## N{Letter}. Title` and `### N{Letter}.M Title` — e.g. `## 4B. Deep Dive` → §4B, `### 4B.1` → §4B.1. **Use this to expand a book later** (a new §3B after §3) so existing §-citations never shift.
- **Section-letter books** (for big catalog-style books): `## Section A: Title` with `### A1. …`, `### A2. …`; cite as §A, §A1. (References may dot them: `§B.7` == heading `B7`.) For other catalog heading styles (`## Moonshot N`, `## Lesson N`, `## Case N`), add the lead word to the parser's word-set in `_gen_sections.py` / `_audit_refs.py` so `§N` resolves.
- Keep one `# Book NN — Title` H1 at the top of each book.

### 2.2 The book template (every book follows it)
A consistent skeleton makes books navigable and comparable:
1. **TL;DR** — one paragraph: what this book covers and the opinionated default it lands on.
2. **Conceptual foundations** — the *why* and context.
3. **Architecture & design** — system-level *how*, with comparisons to alternative approaches in the domain.
4. **Implementation** — concrete patterns / pseudo-code (illustrative, not necessarily compileable — say so).
5. **Bleeding edge** — recent research / state of the art.
6. **Gaps & opportunities** — where the field falls short.
7. **AI & Claude Code integration** — how an agent helps with *this* topic, and where it doesn't.
8. **Exercises & further reading.**
(Adapt headings to the domain, but keep the arc: concept → architecture → implementation → frontier → agent-integration.)

### 2.3 Citation discipline (the #1 rule)
**Never assert a `Book NN §X` citation you haven't verified exists.** After SECTIONS.json is generated, `grep` it (don't load it whole — it's large) to confirm a section before citing it. `_audit_refs.py` enforces this across the whole library; target is **0 unresolved references**. This is the single most important quality property — broken citations destroy agent trust.

### 2.4 Coverage honesty
Maintain `coverage_gaps` in MANIFEST: topics the library does **not** cover or covers only partially, each with `status` (`missing`/`partial`/`covered`), the nearest in-library section, and an external source. When an agent (or you) is asked about something thin, say so and point outward — do not fabricate coverage.

### 2.5 Leverage honesty
In CLAUDE.md and AGENT_GUIDE.md, state plainly where an agent's help is high vs low for this domain (boilerplate/refactor/tests ≈ high; novel architecture, judgment calls, debugging subtle interactions ≈ ~1×). An honest library sets correct expectations.

### 2.6 Validate after every structural change
Any time you add/rename/restructure: regenerate SECTIONS, run both audits, and grep for count drift. The scripts are fast; run them often. **Counts drift constantly** (book counts, skill counts, volume counts across README/CLAUDE/MANIFEST/memory) — treat a count as a thing to verify, not trust.

---

## 3. Step 3 — Build Order

Produce the library in this order (each step sets up the next):

1. **Scaffold `MANIFEST.json`** from the approved outline: `total_books`, `total_volumes`, `volumes[]`, and a `books[]` entry per book (`id` `book_NN`, `number`, `title`, `path`, `volume`, `topics[]`, `key_concepts[]`, `summary`). Leave `reference_docs`, `skills`, `topic_to_books`, `rag_hints`, `coverage_gaps` to fill as you go. (Schema in §6.1.)
2. **Create `tools/` and add the four scripts** (`_gen_sections.py`, `_audit_refs.py`, `_audit_routing.py`, `_audit_links.py` — verbatim from §9; run them from the repo root).
3. **Write the books** following §2.1–2.2. Cross-reference other books by `Book NN §X` — but only cite sections you've actually written (or fix citations at the end).
4. **Write the reference docs** appropriate to the domain (§6.2).
5. **Write the skills** — the 4 required universal meta-skills (+ the optional `adversarial_review`) + `PROJECT_CONVENTIONS.md` (templates in §7), plus domain-specific execution skills derived from the library's atomic operations.
6. **Generate `SECTIONS.json`**: run `_gen_sections.py`.
7. **Write `CLAUDE.md`, `AGENT_GUIDE.md`, `README.md`** (templates in §6.3–6.4) using the now-real structure.
8. **Write `ROUTING_EVAL.json`**: ~30–60 realistic queries spanning every volume + reference doc, each with expected target(s) (§6.5).
9. **Validate to green**: run `_audit_refs.py` (0 misses) and `_audit_routing.py` (all pass). Fix what they flag — broken citations in the books; routing gaps by adding `topic_to_books`/`rag_hints` entries or enriching a book's `topics`/`summary`.
10. **Adversarial content review (the errata pass)**: the audits prove *consistency*, not *truth*. Fan out parallel read-only reviewers (one per volume / topic cluster; lenses: math/units, API-and-version reality, security claims, cross-book contradictions, staleness) mandated to falsify the books' technical claims; severity-tag (Crit = following it would ship a defect or waste a milestone · High = materially wrong · Med = unlikely to bite · Low = imprecision), fix in one coordinated pass, commit a ledger (`docs/notes/LIBRARY_REVIEW_<date>.md`: verdict counts, the Criticals named, a `file | locator | edit` table), regenerate SECTIONS and re-audit. Repeat after major growth passes. (Orchestration recipe: the `build_library` + `adversarial_review` skills.)
11. **Write `CHANGELOG.md`** (initial entry) and a final consistency sweep (counts, JSON validity, 0 leftover placeholder / example-system names).

---

## 4. The Maintenance Scripts Are The Backbone

Four small, domain-agnostic scripts keep the library honest. They live in `tools/`, are embedded verbatim in **§9**, and self-configure from MANIFEST, so they work for any domain. Write them early and run them from the repo root:

- **`_gen_sections.py`** → reads MANIFEST + the books, writes `SECTIONS.json` (every heading's id/title/line). Re-run after any heading edit.
- **`_audit_refs.py`** → validates every `Book NN §X` (and `DOC §X`) reference against the real headings. Target: **0 misses**. This is what makes "cite, don't assert" enforceable.
- **`_audit_routing.py`** → scores each `ROUTING_EVAL.json` query against the routing data and confirms the expected target ranks top-3. Catches routing **gaps** and **mis-routes** that the citation check can't see.
- **`_audit_links.py`** → validates every relative markdown link `[text](file.md)` resolves on disk. The citation checker does **not** check markdown links, so this is what keeps navigation (and any later file reorganization) safe. Target: **0 broken**.

A library that passes all four is internally consistent. Make passing them a release gate — they exit non-zero on failure, so CI can enforce that gate mechanically.

---

## 5. Growing The Library Later

- **Add a book** → append to `books/`, add a MANIFEST entry, update counts everywhere (README/CLAUDE/MANIFEST), add `topic_to_books`/`rag_hints` for its topics, regenerate SECTIONS, run both audits, add a ROUTING_EVAL case, log it.
- **Add depth to an existing book** → use the **deep-dive letter convention** (§2.1): a new `## 3B.` after `## 3.` adds material without renumbering, so no existing citation breaks.
- **Close a coverage gap** → write the content, flip the `coverage_gaps` entry to `covered`, and point any prose "we don't cover X" at the new section.
- **Rename the example system** → a scripted case-aware global replace across `*.md` + `MANIFEST.json`, then regenerate SECTIONS and run the audits (no section numbers change, so refs stay intact).

---

## 6. Artifact Specifications

### 6.1 MANIFEST.json (the machine index)
Top-level fields:
- `version`, `series_title`, `last_updated`, `total_books`, `total_volumes`, `engine_name` (rename to e.g. `system_name` for non-engine domains), `primary_assumptions` (object), `section_index` (`{"path":"SECTIONS.json","purpose":"…"}`).
- `volumes[]`: `{number, name, books:[NN,…]}` — contiguous book-number ranges.
- `books[]`: `{id:"book_NN", number, title, path, volume, topics[], key_concepts[], summary}`.
- `reference_docs[]`: `{id, path, topics[], summary}` (lowercase ids; the in-text references use the UPPERCASE form, e.g. `DECISION_TREES`).
- `skills[]`: `{path, triggers[], description}` per skill.
- `topic_to_books`: `{ "<topic_keyword>": ["book_NN", "DOC_NAME", …], … }` — reverse index from concept → target(s). **This is the primary routing surface; invest in it.**
- `rag_hints`: `{ "for_<question_type>": ["book_NN"/"DOC", …], … }` — intent → targets.
- `coverage_gaps`: `{description, gaps:[{topic, status, nearest, external}]}`.

Keep it valid JSON at all times (no trailing commas, no duplicate keys — a duplicate key silently wins-last). Validate after each edit.

### 6.2 Reference docs — which to include
**Universal (almost always):**
- `GLOSSARY.md` — alphabetized term definitions, each pinned to the book(s) that cover it.
- `INDEX.md` — back-of-book topical index (`Topic — NN §X`), alphabetical + thematic clusters at the end.
- `ANTI_PATTERNS.md` — failure modes (Symptom / Diagnosis / Fix / Books).
- `DECISION_TREES.md` — the domain's recurring architectural forks as flowcharts, with the trade-offs.
- `SYMPTOMS.md` — symptom→diagnosis lookup keyed on the user's vocabulary ("X is slow / wrong / flaky") → routes to ANTI_PATTERNS + sections.
- `PATTERNS.md` — named recurring techniques (shared vocabulary).
- `WORKFLOWS.md` — recipe-style multi-book task guides.
- `STARTER_KIT.md` — a milestone-driven path from zero to a shipped result, with exit criteria.

**Domain-flavored (include the analogues that fit):**
- `COMPARISON.md` — the example system vs the real alternatives/tools, feature-by-feature (was COMPARISON_MATRIX).
- `TOOLING.md` / `STACKS.md` — language/framework/tool choices with honest trade-offs (was TECH_STACKS).
- An **optimization/cookbook** doc if the domain has a deep perf/quality craft (was RENDERING_OPTIMIZATION).
- A **production/business/ops** doc for the non-technical realities (legal, cost, team, compliance) if relevant.
- Inspirational docs (a Prologue "why this matters", a Futures, a Moonshots) — optional but good for morale and framing.

### 6.3 CLAUDE.md (agent consult-rules) — include:
- What the library is + the two uses; a pointer to AGENT_GUIDE for *building*.
- A **task→doc routing table** (task type → first lookup), e.g. architectural decision → DECISION_TREES; "what does X mean" → GLOSSARY; "why is X broken" → SYMPTOMS; implementation → the relevant book; etc.
- How to use MANIFEST (`topic_to_books`/`rag_hints`/`coverage_gaps`) and SECTIONS (resolve/verify `§` refs — **grep it, don't load it whole**).
- Default assumptions (the §1.4 tech baseline).
- A "Topics Not Covered (be honest)" note deferring to `coverage_gaps` as the source of truth.
- Leverage honesty as a **pointer to AGENT_GUIDE §5** — one canonical list; restating it is how it drifts.
- Style notes (cite at the most specific level; acknowledge alternatives; don't dogmatically apply patterns).

### 6.4 AGENT_GUIDE.md (the build loop) — include:
- **Load order** of artifacts (MANIFEST resident; SECTIONS grep-on-demand; STARTER_KIT for order; DECISION_TREES for forks; then the specific sections; skills; ANTI_PATTERNS/SYMPTOMS).
- A **"Finding the library" contract**: the downstream project's own CLAUDE.md carries a one-line pointer to the library path; if the agent can't find MANIFEST.json, ask.
- **The build loop**: classify → route → pre-mortem (ANTI_PATTERNS/SYMPTOMS first) → decide (DECISION_TREES) → implement → atomize (skill) → verify → profile → record.
- A **worked example**: one concrete end-to-end trace through the loop for a small feature, each step citing a verifiable `Book NN §X`. (Worked examples anchor agents far better than abstract description — always include one.)
- A **definition-of-done** checklist (the verification gate).
- A **skills map** — a pointer to the canonical catalog (MANIFEST `skills[]`, audited) + the loop-critical names; not a third full list.
- **Leverage honesty** table (this is the canonical home).
- **Maintenance**: regenerate SECTIONS + run both audits after edits.

### 6.5 ROUTING_EVAL.json — `{cases:[{query, expect:["book_NN"/"doc_id"], note?}]}`. Cover every volume and every reference doc with realistic, natural-language queries. Where more than one target is correct, list them all (pass = any in top-3).

---

## 7. Skills

Skills are drop-in Claude Code procedures (`.claude/skills/`). Each is a markdown file with **YAML frontmatter** (required — without it the skill will not load):
```
---
name: skill_name            # must match the filename
description: One sentence on what it does AND when to use it (the triggers). Claude reads this to decide when to invoke.
---
# Title
## Procedure   (numbered, actionable steps)
## Verification (how to confirm it worked)
## Don't       (the common mistakes)
```

**Create these universal meta-skills (near-verbatim — they're domain-independent; the fifth is optional):**
- **`plan_work`** — produce a *library-grounded plan* for a task: classify → route via MANIFEST/SECTIONS → ANTI_PATTERNS/SYMPTOMS pre-mortem → emit a plan (recommended approach with verifiable `Book NN §X` citations, alternatives + trade-offs, failure modes, steps each mapped to an execution skill, verification gates, leverage honesty, open decisions for the human). The planning front-end. *Don't*: invent citations; present one option as the only one; jump to code.
- **`review_against_library`** — *conformance audit* of an existing design/diff against the library (recommended approaches, cataloged anti-patterns, conventions), with cited findings grouped **Must-fix vs Consider**. Supports a `--fix` mode that applies only the mechanical Must-fix items (on a branch, re-verified), deferring redesigns to `plan_work`. *Don't*: dogmatically flag defensible divergence; hunt generic bugs (that's `/code-review`); invent citations.
- **`configure_project`** — inspect the repo and fill `PROJECT_CONVENTIONS.md` (the per-project paths/commands/stack the other skills read), so nothing is hard-coded per skill.
- **`definition_of_done`** — run the full verification gate (build/tests/the domain's checks/anti-patterns/etc.) with per-gate PASS/FAIL + evidence; refuse "done" with an unrun or failing gate. Orchestrates the other verification skills.
- **`adversarial_review`** *(optional but recommended)* — an end-of-feature *adversarial* review: fan out one independent reviewer per **failure-domain lens** for the domain (for an engine: performance/determinism, memory/data-layout, concurrency, library-conformance, headless/agent-playability; for a compiler: IR-invariants, perf, diagnostics, spec-conformance — pick the domain's real failure axes), each prompted to *find what's wrong*, then reconcile into cited Must-fix/Consider findings. **Delegate the fan-out** to the harness (`/code-review ultra`, the Workflow tool, or parallel subagents) — don't hand-roll orchestration. It *composes* `review_against_library` (the conformance lens) and `/code-review` (the generic-bug lens); it's the review pass before `definition_of_done`. *Don't*: reinvent agent spawning; make the lenses redundant; invent citations.

**Plus `PROJECT_CONVENTIONS.md`** (a config file, NOT a skill — keep it at project root): the example-system name, language, source layout, build/test/run commands, stack, conventions, and agent tooling — with the library's defaults filled in and a note to override per project. This is the **de-hardcoding mechanism**: skills read project specifics from here instead of baking them in.

**Optionally `PROJECT_BACKLOG.md`** (also project-root, also NOT a skill): a lightweight Now/Next/Blocked/Done convention keyed to the STARTER_KIT milestones that `plan_work` appends to and `definition_of_done` checks off — cross-session continuity, *not* an issue tracker (defer to GitHub Issues / Linear / the harness task tools at scale).

**Then derive domain-specific execution skills** from the library's recurring atomic operations — the "add a &lt;thing&gt;", "test a &lt;thing&gt;", "profile/optimize a &lt;thing&gt;", "debug a &lt;thing&gt;" tasks that come up repeatedly in *this* domain. Each cites its backing book(s). (For an engine these were add_component / add_render_pass / profile_subsystem / debug_shader…; for a sim they might be add_entity_type / add_event / add_metric / validate_determinism; for a compiler, add_pass / add_diagnostic / add_ir_node. Pick the real recurring operations.)

Wire every skill into the MANIFEST `skills[]` array — the **catalog of record**, cross-checked against the skills on disk by `_audit_routing.py` (a registered-but-missing or on-disk-but-unregistered skill fails the audit) — and the human-facing `.claude/skills/README.md` table. Other docs point at the catalog; they don't restate it (restated lists drift).

---

## 8. Pitfalls (hard-won — heed them)

- **Counts drift.** Book/skill/volume/word counts get stale across README/CLAUDE/MANIFEST/memory the moment you add anything. After any structural change, grep for the old count and fix every site. Trust the scripts, not your memory of the number.
- **Citations rot.** A `Book NN §X` that was right becomes wrong when sections move, or was a *line number* mistaken for a section, or names a real section on the wrong topic. The mechanical audit catches the first two; only reading catches the third. Run `_audit_refs.py` after every edit; spot-read citations for topic-match.
- **Routing is invisible until tested.** A missing `topic_to_books` entry silently sends agents nowhere; a mis-pointed `rag_hint` sends them to the wrong book. `_audit_refs` won't catch it — only `_audit_routing` will. Maintain ROUTING_EVAL.
- **Skills need frontmatter.** A skill file without valid `name`/`description` YAML frontmatter silently fails to load. Validate all skills parse.
- **Don't renumber to add depth.** Use the deep-dive letter convention; renumbering breaks every inbound citation.
- **Don't hard-code the example name or paths into skills.** Route them through PROJECT_CONVENTIONS — otherwise every downstream agent reads specifics that aren't its project's.
- **Big JSON indexes are query targets, not load targets.** Tell agents to grep SECTIONS.json, not load it (it's hundreds of KB).
- **Be honest about gaps and leverage.** A library that overclaims coverage or agent-leverage erodes trust faster than one that's modest and correct.

---

## 9. The Maintenance Scripts (write these verbatim)

These are domain-agnostic — they self-configure from MANIFEST. Write them to `tools/` and run from the repo root (with UTF-8 output, e.g. `PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python3 tools/_audit_refs.py`). The `_audit_refs.py` / `_audit_links.py` scans glob `reference/` and `vision/` as well — adjust the globbed dirs if your layout differs.

### 9.1 `_gen_sections.py`
```python
import re, json, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
M = json.load(open("MANIFEST.json", encoding="utf-8"))
by_num = {b["number"]: b for b in M["books"]}
HEAD = re.compile(r'^(#{2,5})\s+(.*?)\s*$')
def parse_id(title):
    toks = title.split()
    if not toks: return None, title
    lead = toks[0]
    if lead.rstrip(':.').lower() in ('section','appendix','part','chapter') and len(toks) >= 2:
        sid = toks[1].rstrip(':.')
        if re.fullmatch(r'[0-9A-Za-z]+', sid):
            rest = title.split(toks[1], 1)[1].lstrip(' :.-—').strip()
            return sid, (rest or title)
        return None, title
    m = re.match(r'^([0-9]+[A-Za-z]*(?:\.[0-9A-Za-z]+)*|[A-Za-z]+[0-9]+(?:\.[0-9]+)*)\.?\s+(.*)$', title)
    if m:
        sid = m.group(1).rstrip('.')
        if re.search(r'[0-9]', sid) or len(sid) <= 2:
            return sid, m.group(2).strip()
    return None, title
out = {"generated_from": "MANIFEST.json", "books": {}}
for num in sorted(by_num):
    b = by_num[num]; secs = []
    for i, line in enumerate(open(b["path"], encoding="utf-8"), 1):
        m = HEAD.match(line.rstrip("\n"))
        if not m: continue
        sid, clean = parse_id(m.group(2).strip())
        if sid is None: continue
        secs.append({"id": sid, "title": clean, "line": i, "level": len(m.group(1))})
    out["books"][str(num)] = {"path": b["path"], "title": b["title"], "section_count": len(secs), "sections": secs}
json.dump(out, open("SECTIONS.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"Wrote SECTIONS.json: {len(out['books'])} books, {sum(b['section_count'] for b in out['books'].values())} sections")
```

### 9.2 `_audit_refs.py`
```python
import re, glob, os, json, collections
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
M = json.load(open("MANIFEST.json", encoding="utf-8"))
DOCNAMES = sorted({d["id"].upper() for d in M["reference_docs"]}, key=len, reverse=True)
def canon(idtok):
    idtok = idtok.strip().rstrip('.').strip()
    if re.fullmatch(r'[0-9]+(\.[0-9]+)*', idtok): return idtok
    return re.sub(r'[.\s]', '', idtok).upper()
def prefixes(idtok):
    out=set(); c=canon(idtok); out.add(c)
    if re.fullmatch(r'[0-9]+(\.[0-9]+)*', c):
        p=c.split('.')
        for i in range(1,len(p)): out.add('.'.join(p[:i]))
    else:
        m=re.match(r'^([0-9]*[A-Z]+)([0-9]+)?$', c)
        if m and m.group(2): out.add(m.group(1))
        m2=re.match(r'^([0-9]+)([A-Z]+)$', c)
        if m2: out.add(m2.group(1))
    return out
HEAD=re.compile(r'^#{2,5}\s+(.*)$')
def ids_of(path):
    ids=set()
    for line in open(path, encoding='utf-8'):
        m=HEAD.match(line.rstrip('\n'))
        if not m: continue
        toks=m.group(1).strip().split()
        if not toks: continue
        first=toks[0]
        cand = toks[1].rstrip(':.') if (first.rstrip(':.').lower() in ('section','appendix','part','chapter') and len(toks)>=2) else first.rstrip(':.')
        if re.fullmatch(r'([0-9]+[A-Za-z]*|[A-Za-z]+[0-9]*)(\.[0-9A-Za-z]+)*', cand) and (re.search(r'[0-9]',cand) or len(cand)<=3):
            ids |= prefixes(cand)
    return ids
book_ids={}
for p in sorted(glob.glob("books/*.md")):
    mm=re.match(r'(\d+)_', os.path.basename(p))
    if mm: book_ids[int(mm.group(1))] = ids_of(p)
DOC_IDS={d["id"].upper(): ids_of(d["path"]) for d in M["reference_docs"] if os.path.exists(d["path"])}
GROUP=re.compile(r'(?<![\w.])(?:Book\s+)?(\d{1,2})\s*((?:§[A-Za-z0-9.]+)(?:\s*[,/&+]\s*§[A-Za-z0-9.]+)*)')
IDPART=re.compile(r'§([A-Za-z0-9.]+)')
DOCGROUP=re.compile(r'\b(' + '|'.join(DOCNAMES) + r')\s*((?:§[A-Za-z0-9.]+)(?:\s*[,/&]\s*§[A-Za-z0-9.]+)*)') if DOCNAMES else None
def disp(p):
    b=os.path.basename(p)
    return os.path.basename(os.path.dirname(p))+'/'+b if b=='SKILL.md' else b
bmiss=[]; dmiss=[]; bn_checked=0
for p in (sorted(glob.glob("*.md")) + sorted(glob.glob("books/*.md")) + sorted(glob.glob("skills/*.md"))
          + sorted(glob.glob("../.claude/skills/*/SKILL.md"))   # project-layout skills cite books too
          + sorted(glob.glob("reference/*.md")) + sorted(glob.glob("vision/*.md"))):
    if os.path.basename(p) in ('CHANGELOG.md','LIBRARY_SEED.md'): continue
    for i,line in enumerate(open(p,encoding='utf-8'),1):
        for g in GROUP.finditer(line):
            bn=int(g.group(1))
            if bn not in book_ids: continue
            for idp in IDPART.findall(g.group(2)):
                bn_checked+=1
                if canon(idp) not in book_ids[bn]: bmiss.append((disp(p),i,bn,'§'+idp))
        if DOCGROUP:
            for g in DOCGROUP.finditer(line):
                dn=g.group(1)
                if dn not in DOC_IDS: continue
                for idp in IDPART.findall(g.group(2)):
                    if canon(idp) not in DOC_IDS[dn]: dmiss.append((disp(p),i,dn,'§'+idp))
print(f"Book refs checked: {bn_checked} | misses: {len(bmiss)} | doc misses: {len(dmiss)}")
for x in bmiss: print("  BOOK", x)
for x in dmiss: print("  DOC ", x)
raise SystemExit(1 if (bmiss or dmiss) else 0)
```

### 9.3 `_audit_routing.py`
```python
import json, re, os, glob
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
M = json.load(open("MANIFEST.json", encoding="utf-8"))
EV = json.load(open("ROUTING_EVAL.json", encoding="utf-8"))
STOP=set("with that this into from your you should what does mean give make build using like want need have them and the for are can how why when which who your our its was just then than also more most some any all into onto over under via per each both these those an to of in on is it do i me my we us be as at or if so no not new use used uses".split())
SHORT_OK=set("ui vr ar xr 2d 3d ai ml ip rl gi io os db ui ux api sql".split())
def norm(s): return re.sub(r"[^a-z0-9]+"," ",s.lower())
corpus={}
for b in M["books"]:
    corpus[b["id"]] = norm(" ".join([b["title"]," ".join(b["topics"])," ".join(b["key_concepts"]),b["summary"]]))
for d in M["reference_docs"]:
    corpus[d["id"]] = norm(" ".join([d["id"]," ".join(d.get("topics",[]))," ".join([d.get("summary","")])]))
def add(key, targets):
    for t in targets:
        tid = t if t.startswith("book_") else t.lower()
        if tid in corpus: corpus[tid] += " " + norm(key.replace("_"," "))
for k,v in M.get("topic_to_books",{}).items(): add(k,v)
for k,v in M.get("rag_hints",{}).items(): add(k,[t for t in v if isinstance(t,str) and not t.startswith("skills/")])
cwords={t:set(c.split()) for t,c in corpus.items()}
def match(t,ws):
    for w in ws:
        if t==w: return True
        if len(t)>=4 and t in w: return True
        if len(w)>=4 and w in t: return True
        if len(t)>=5 and len(w)>=5 and t[:4]==w[:4]: return True
    return False
def sig(q):
    toks=[t for t in norm(q).split() if (len(t)>=4 or t in SHORT_OK) and t not in STOP]
    return toks, [toks[i]+" "+toks[i+1] for i in range(len(toks)-1)]
def score(q,tid):
    toks,bg=sig(q); ws=cwords[tid]; c=corpus[tid]
    return sum(1 for t in toks if match(t,ws)) + sum(2 for b in bg if b in c)
passed=0; fails=[]
for case in EV["cases"]:
    q=case["query"]; expect=[e if e.startswith("book_") else e.lower() for e in case["expect"]]
    ranked=sorted(corpus, key=lambda t: score(q,t), reverse=True)
    top=[t for t in ranked if score(q,t)>0][:3]
    if any(e in top for e in expect): passed+=1
    else: fails.append((q,expect,[(t,score(q,t)) for t in ranked[:3]]))
print(f"Routing eval: {passed}/{len(EV['cases'])} passed")
for q,e,t in fails: print(f"\nQ: {q}\n  expected {e}\n  got {t}")
# --- skills catalog: MANIFEST skills[] is the single catalog; it must match disk ---
# (Skipped when no ../.claude/skills exists — e.g. a standalone library checkout.)
sk_fails=[]
sk_listed={str(s.get("path","")).replace("\\","/") for s in M.get("skills",[])}
sk_disk={p.replace("\\","/") for p in glob.glob("../.claude/skills/*/SKILL.md")}
if sk_disk:
    sk_fails += [f"MANIFEST skills[] path missing on disk -> {p}" for p in sorted(sk_listed) if p.startswith("../.claude/") and not os.path.exists(p)]
    sk_fails += [f"skill on disk not in MANIFEST skills[] -> {p}" for p in sorted(sk_disk - sk_listed)]
for x in sk_fails: print("  SKILLS", x)
print(f"Skills catalog: {len(sk_listed)} listed, {len(sk_disk)} on disk, {len(sk_fails)} mismatch(es)")
raise SystemExit(1 if (fails or sk_fails) else 0)
```

### 9.4 `_audit_links.py`
```python
import re, glob, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # cwd-independent: data lives beside tools/
LINK = re.compile(r'\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
CODE_SPAN = re.compile(r'`[^`]*`')   # inline code — an illustrative [text](x) inside it is not a real link
SKIP = ('http://', 'https://', 'mailto:', '#')
FENCE = chr(96) * 3   # the code-fence marker, written via chr() so this snippet embeds safely
broken = []; checked = 0
for f in glob.glob("**/*.md", recursive=True):
    in_fence = False
    for i, line in enumerate(open(f, encoding='utf-8'), 1):
        if line.lstrip().startswith(FENCE):
            in_fence = not in_fence; continue
        if in_fence:
            continue
        for m in LINK.finditer(CODE_SPAN.sub('', line)):
            tgt = m.group(1).strip()
            if tgt.startswith(SKIP) or tgt.startswith('/'): continue
            path = tgt.split('#', 1)[0]
            if not path: continue
            checked += 1
            if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), path))):
                broken.append((f.replace("\\", "/"), i, tgt))
print(f"Markdown links checked: {checked} | broken: {len(broken)}")
for b in broken: print(f"  BROKEN  {b[0]}:{b[1]}  ->  {b[2]}")
raise SystemExit(1 if broken else 0)
```

---

## 10. Final Checklist (don't declare done until all true)

- [ ] The outline was approved by the user before building.
- [ ] Every book follows the template and the section-ID grammar.
- [ ] `MANIFEST.json` is valid JSON; counts (`total_books`, `total_volumes`) match reality; `coverage_gaps` is honest.
- [ ] `SECTIONS.json` regenerated; `_audit_refs.py` reports **0 misses**.
- [ ] `ROUTING_EVAL.json` covers every volume + reference doc; `_audit_routing.py` reports **all pass**.
- [ ] All skills are `<name>/SKILL.md` directories with valid frontmatter (`name:` = directory name); the 4 required meta-skills (+ optional `adversarial_review`) + `PROJECT_CONVENTIONS.md` exist; `_audit_routing.py`'s skills-catalog check passes (MANIFEST `skills[]` ↔ disk) and `.claude/skills/README.md` matches.
- [ ] `CLAUDE.md` (routing table + honesty) and `AGENT_GUIDE.md` (build loop + worked example + maintenance) exist and reflect the real structure.
- [ ] No leftover placeholder names; the example-system name is consistent everywhere; `PROJECT_CONVENTIONS.md` carries it as the default.
- [ ] `CHANGELOG.md` has an initial entry; `README.md` has reading paths + stats.
- [ ] A grep for the old/placeholder counts returns nothing.
- [ ] An **adversarial content review** (errata pass, §3 step 10) ran once the library stabilized; its ledger is committed and every Critical is fixed.

---

*This seed encodes a simple thesis: a knowledge library is most useful to an agent when it is **routable, verifiable, and honest** — and stays that way because small scripts make consistency a gate, not a hope. Build the library; then let the scripts keep it true.*
