---
name: build_library
description: Author or extend the project's textbook/RAG knowledge library in textbooks/. Use when the user says "build the library", "write the textbooks", "let's build the library", "grow the library", "add a book", or "spec the chapters". Drives textbooks/LIBRARY_SEED.md — interview, approve an outline, spec each book with the assignment-sheet pass (briefs + eval cases before prose), fill from the frozen specs, and keep the four audits green.
---

# Build / Extend The Library

The library (`textbooks/`) is the domain knowledge the agent later consults and cites. It must stay **routable, verifiable, and honest**. This skill drives [`textbooks/LIBRARY_SEED.md`](../../../textbooks/LIBRARY_SEED.md) — read it; it is the authoritative instruction set.

## Procedure

**Building it the first time:**
1. **Interview** (LIBRARY_SEED §1): subject & scope, audience, the named example system, tech assumptions, the volume/book outline, depth, domain realities. Batch the questions.
2. **Propose the outline** (volumes → books + the reference-doc set) and get **explicit approval** before writing.
3. **Scaffold `MANIFEST.json`** from the outline (counts, `volumes[]`, a `books[]` entry per book — each starting `status: "scaffolded"`). The maturity lifecycle `scaffolded → draft → covered` (LIBRARY_SEED §6.1) is what keeps hollow skeletons from acquiring citation authority: `_audit_refs.py` fails product-surface citations into non-`covered` books (#70). The `tools/` and reference templates are already present.
4. **Assignment-sheet pass — spec every book before any prose** (LIBRARY_SEED §2.7, #68). Per book: copy `books/00_TEMPLATE.md`, lay the complete heading skeleton (§2.1 grammar, §2.2 arc), and put a `<!-- BRIEF -->` block under every heading — must-answer questions, boundaries vs sibling books, depth, pre-harvested sources (stable refs inline with real URL + accessed date; frontier claims via `research/notes` tiers), length band. Write planned cross-refs as real `Book NN §X` (plans may cite ahead — #70). **Seed that book's `ROUTING_EVAL.json` cases now — eval-first.** Regenerate SECTIONS, run the audits on the skeletons, and give the user the brief-level scope check: scope errors die here as heading/brief edits, not as chapter rewrites.
5. **Fill pass — from the frozen specs.** One fill per book/chapter, consuming and replacing its BRIEF blocks. Synthesis and load-bearing claims (arc §§3/5/6/7, DECISION_TREES, ANTI_PATTERNS) stay on the session model — never routed down (the #49 anti-goal; reviewer-anchoring, measured by EXP-01). Commodity/definitional material may go to a cheaper tier and be checked strong. A fill that can't satisfy its brief stops and returns the missing specifics as *questions* — never improvises past the spec (ask-don't-guess, #309; ChatDev's dehallucination ablation is the measured case — `research/notes/agent-project-systems.md`). Parallel fills are safe (ids + cross-refs froze at spec time). Flip each book to `status: "draft"` as its prose lands. Every fill slice closes with the **root-docs refresh** (the gated step under Iterating, below) — the CHANGELOG entry and count re-check ride the same PR as the prose, never a later sweep.
6. **Write the reference docs** for the domain; **derive the domain-specific execution skills** (the recurring "add a `<thing>`" / "debug a `<thing>`" ops) into `.claude/skills/`, each citing its backing book(s).
7. **Generate + validate:** `python3 tools/_gen_sections.py`, then extend `ROUTING_EVAL.json` to full coverage (per-book cases already seeded in step 4), then run all four audits to green.
8. **Adversarial content review — the errata pass** (LIBRARY_SEED §3 step 10). The audits prove the library is *consistent*, not *true*: every formula, attribution, version/feature claim, and security assertion came out of a single author pass, and the project will later treat it as ground truth. Once the audits are green, run `adversarial_review` over the **books as content**: parallel read-only reviewers ([`adversarial-reviewer`](../../agents/adversarial-reviewer.md)), one per volume or topic cluster, each mandated to **falsify the text against its own domain knowledge** — lenses like math/units/formulas, API-and-version reality, security claims, cross-book contradictions, staleness. The API-and-version lens carries one **executable** check no prose reviewer can run: **every library the text names must import/resolve in the project's locked env** before a book recommends it (LIBRARY_SEED §10's stack-neutral phrasing) — through the project's own toolchain, not a hard-coded language (Python: `python -c "import <lib>"` via `conda run -n <env>` / the venv; TS/Node: it resolves in `package.json` / the installed major — whatever the project pins). The escape it exists for: a draft confidently taught pyproj idioms in a GDAL/OSR-only locked env — prose review passed it, the executed import failed it (#126, caught downstream; a TS/Angular downstream ported the same check by resolving against `package.json`). Severity per the content scale (**Crit** = following it would ship a defect or waste a milestone · **High** = materially wrong · **Med** = wrong but unlikely to bite · **Low** = imprecision). Fix in one coordinated pass, record the ledger (`docs/notes/LIBRARY_REVIEW_<date>.md`: verdict counts · the Criticals named · a `file | locator | edit` table), and **commit the contract-facts table** (#494) — the cross-book lens's working instrument, one row per fact the library states in more than one place (formulas, limits, defaults, API shapes): `fact · owning § · every restating §` — to `textbooks/CONTRACT_FACTS.md` as *standing review input*, separate from the date-stamped ledger: cross-book drift of a shared fact was a downstream pass's dominant Critical class (4 of its 13 Criticals), and the ad-hoc table that caught it evaporated with the session. Root-level placement means `_audit_refs.py` keeps its rows resolvable and covered-only (#70) from then on, and the root-docs refresh diffs every later slice against it. Then regenerate SECTIONS, re-run the audits. A first pass on a mature real-world library found 3 Criticals and ~140 fixes — it earns its cost. Re-run after any major growth pass. A book flips to `status: "covered"` **only here**, after its errata pass — that flip is what unlocks citing it from product surfaces (#70).

**Iterating on coverage (the usual loop with the user):**
- Pick a book or topic; deepen it. Add depth with the **letter convention** (`## 3B.`), never by renumbering.
- **Close every content-touching pass with the root-docs refresh (#494) — a gate, not a habit.** Regenerate `SECTIONS.json`, run the audits, then re-derive the root-doc claims from the tree, never memory: append this pass's `CHANGELOG.md` entry (unconditional — a content slice with no CHANGELOG line is not done), re-check README stats and MANIFEST counts / `status` / `coverage_gaps` against reality, and diff the edit against `textbooks/CONTRACT_FACTS.md` where it exists — touching a listed fact's site means updating every sibling site in its row in the same pass. Nothing else ties root docs to content changes: downstream, six errata findings shared that single cause — four fill slices, zero CHANGELOG entries.
- Keep going until the user agrees the area is well-covered and detailed.

**Adding a single book later:** append the file, add the MANIFEST entry (`status: "scaffolded"` until it clears the fill + errata loop), add `topic_to_books`/`rag_hints` + a ROUTING_EVAL case, then close with the root-docs refresh above (it owns the counts / changelog / audit close-out).

## Verification

Run from `textbooks/`:
```
python3 tools/_gen_sections.py     # regenerate the section index
python3 tools/_audit_refs.py        # 0 unresolved Book NN §X
python3 tools/_audit_routing.py     # all ROUTING_EVAL cases pass
python3 tools/_audit_links.py       # 0 broken markdown links
```
- All four green — including `_audit_refs.py`'s hollow/absent classes (#70). Counts (`total_books`/`total_volumes`) consistent across `MANIFEST.json` / `README.md` / `CLAUDE.md`. No leftover `<DOMAIN>` / `<EXAMPLE_SYSTEM>` placeholders in finished areas.
- Every book's MANIFEST `status` matches reality: `covered` ⇔ filled **and** errata-passed; anything less stays `scaffolded`/`draft`.
- The pass's diff carries its root-docs refresh: a `CHANGELOG.md` entry, README/MANIFEST claims re-derived (not remembered), and — where `textbooks/CONTRACT_FACTS.md` exists — sibling sites of any touched fact updated in the same diff.

## Don't

- Don't skip the interview or write before the outline is approved — the point is a library shaped to *this* domain.
- Don't assert a `Book NN §X` citation you haven't verified in `SECTIONS.json`. Cite, don't guess.
- Don't renumber to add depth — use the deep-dive letter convention so inbound citations never break.
- Don't hard-code the example-system name or paths into skills — route them through `PROJECT_CONVENTIONS.md`.
- Don't trust counts from memory; grep and verify after every structural change.
- Don't leave a shared fact ungoverned: a fact the library must state in two places gets a `CONTRACT_FACTS.md` row naming its owning section — and where prose allows, a citation beats a restatement.
