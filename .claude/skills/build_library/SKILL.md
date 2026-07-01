---
name: build_library
description: Author or extend the project's textbook/RAG knowledge library in textbooks/. Use when the user says "build the library", "write the textbooks", "let's build the library", "grow the library", or "add a book". Drives textbooks/LIBRARY_SEED.md — interview, approve an outline, write books to the conventions, and keep the four audits green.
---

# Build / Extend The Library

The library (`textbooks/`) is the domain knowledge the agent later consults and cites. It must stay **routable, verifiable, and honest**. This skill drives [`textbooks/LIBRARY_SEED.md`](../../../textbooks/LIBRARY_SEED.md) — read it; it is the authoritative instruction set.

## Procedure

**Building it the first time:**
1. **Interview** (LIBRARY_SEED §1): subject & scope, audience, the named example system, tech assumptions, the volume/book outline, depth, domain realities. Batch the questions.
2. **Propose the outline** (volumes → books + the reference-doc set) and get **explicit approval** before writing.
3. **Scaffold `MANIFEST.json`** from the outline (counts, `volumes[]`, a `books[]` entry per book). The `tools/` and reference templates are already present.
4. **Write the books** following the section-id grammar and the standard arc (LIBRARY_SEED §2.1–2.2). Copy `books/00_TEMPLATE.md` as the starting point. Cross-reference only sections you've actually written.
5. **Write the reference docs** for the domain; **derive the domain-specific execution skills** (the recurring "add a `<thing>`" / "debug a `<thing>`" ops) into `.claude/skills/`, each citing its backing book(s).
6. **Generate + validate:** `python tools/_gen_sections.py`, then write `ROUTING_EVAL.json` cases, then run all four audits to green.
7. **Adversarial content review — the errata pass** (LIBRARY_SEED §3 step 10). The audits prove the library is *consistent*, not *true*: every formula, attribution, version/feature claim, and security assertion came out of a single author pass, and the project will later treat it as ground truth. Once the audits are green, run `adversarial_review` over the **books as content**: parallel read-only reviewers ([`adversarial-reviewer`](../../agents/adversarial-reviewer.md)), one per volume or topic cluster, each mandated to **falsify the text against its own domain knowledge** — lenses like math/units/formulas, API-and-version reality, security claims, cross-book contradictions, staleness. Severity per the content scale (**Crit** = following it would ship a defect or waste a milestone · **High** = materially wrong · **Med** = wrong but unlikely to bite · **Low** = imprecision). Fix in one coordinated pass, record the ledger (`docs/notes/LIBRARY_REVIEW_<date>.md`: verdict counts · the Criticals named · a `file | locator | edit` table), regenerate SECTIONS, re-run the audits. A first pass on a mature real-world library found 3 Criticals and ~140 fixes — it earns its cost. Re-run after any major growth pass.

**Iterating on coverage (the usual loop with the user):**
- Pick a book or topic; deepen it. Add depth with the **letter convention** (`## 3B.`), never by renumbering.
- After each pass, regenerate `SECTIONS.json` and run the audits. Update `coverage_gaps` honestly. Log to `CHANGELOG.md`.
- Keep going until the user agrees the area is well-covered and detailed.

**Adding a single book later:** append the file, add the MANIFEST entry, update counts everywhere, add `topic_to_books`/`rag_hints` + a ROUTING_EVAL case, regenerate, audit, changelog.

## Verification

Run from `textbooks/`:
```
python tools/_gen_sections.py     # regenerate the section index
python tools/_audit_refs.py        # 0 unresolved Book NN §X
python tools/_audit_routing.py     # all ROUTING_EVAL cases pass
python tools/_audit_links.py       # 0 broken markdown links
```
- All four green. Counts (`total_books`/`total_volumes`) consistent across `MANIFEST.json` / `README.md` / `CLAUDE.md`. No leftover `<DOMAIN>` / `<EXAMPLE_SYSTEM>` placeholders in finished areas.

## Don't

- Don't skip the interview or write before the outline is approved — the point is a library shaped to *this* domain.
- Don't assert a `Book NN §X` citation you haven't verified in `SECTIONS.json`. Cite, don't guess.
- Don't renumber to add depth — use the deep-dive letter convention so inbound citations never break.
- Don't hard-code the example-system name or paths into skills — route them through `PROJECT_CONVENTIONS.md`.
- Don't trust counts from memory; grep and verify after every structural change.
