# Book 00 — The Book Template (How To Write A Book In This Library)

> **This file is the template every book copies.** Duplicate it to `books/NN_your_title.md`, renumber, and replace the content. It both *describes* and *demonstrates* the conventions: the section-ID grammar, the standard arc, and citation discipline. Delete this blockquote in a real book. After adding a book, update `MANIFEST.json`, regenerate `SECTIONS.json`, and run the audits (see [AGENT_GUIDE.md](../AGENT_GUIDE.md) §6).

## 1. TL;DR

One paragraph: what this book covers and the single opinionated default it lands on. A reader should know after this paragraph whether this is the book they need. Heading form `## N. Title` → this is **§1**.

## 2. Conceptual Foundations

The *why* and the context — the mental model before the mechanics. Define the problem this area solves and the forces in tension.

### 2.1 A Subsection

Heading form `### N.M Title` → **§2.1**. Use subsections for the distinct ideas inside a section. Go one level deeper with `#### N.M.K` only when genuinely needed.

## 2B. Deep Dive — The Letter Convention (how to add depth later)

To expand a book *after* it has inbound citations, insert a letter section (`## 2B.` right after `## 2.`) instead of renumbering — so existing `§` citations never shift. This heading is **§2B**; a subsection would be `### 2B.1`. Cite it as `Book 00 §2B`. (Catalog-style books may instead use `## Section A:` / `### A1.` — see [LIBRARY_SEED.md](../LIBRARY_SEED.md) §2.1.)

## 3. Architecture & Design

The system-level *how*, with honest comparison to the alternative approaches in `<DOMAIN>`. This is where the book's opinion lives; state the trade-offs, don't hide them.

## 4. Implementation

Concrete patterns and **illustrative** pseudo-code (say plainly that it's illustrative, not necessarily compileable). Show the shape of a real implementation without pretending to be a working repo.

## 5. Bleeding Edge

Recent research and state of the art — what's changing, what's not yet settled. This section summarizes what has stabilized enough to teach; **live frontier work belongs in the project's `research/` layer** (sourced, tiered, dated) and graduates into here (or a deep-dive section) once it settles.

## 6. Gaps & Opportunities

Where the field (or this library's coverage) falls short. Anything thin here should get a matching entry in `MANIFEST.json` `coverage_gaps` with an honest `status`.

## 7. AI & Claude Code Integration

How an agent helps with *this* topic — and, honestly, where it's only ~1× (judgment calls, novel design, subtle debugging). Every book carries this section; it's what makes the library agent-aware rather than just a textbook.

## 8. Exercises & Further Reading

A few exercises that build the real skill, and pointers to the canonical external sources. Keep external links accurate.

---

*Conventions demonstrated above: one `# Book NN — Title` H1; `## N.` / `### N.M` numbering; the `## NB.` deep-dive letter convention; the concept → architecture → implementation → frontier → agent-integration arc; and "cite, don't assert" (every `Book NN §X` must resolve in `SECTIONS.json`).*
