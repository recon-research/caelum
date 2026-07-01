# CLAUDE.md — How To Use This Library As Reference

This file tells Claude Code how to consult this textbook/RAG library while working on **&lt;PROJECT_NAME&gt;**. If your job is to *build* (not just answer questions), read [AGENT_GUIDE.md](AGENT_GUIDE.md) — it is the operating loop that ties the library, the skills, and the verification gates together.

> **Still a blank library?** If `books/` only has the template and `MANIFEST.json` is a skeleton, the library hasn't been built yet. See [LIBRARY_SEED.md](LIBRARY_SEED.md) and run the [`build_library`](../.claude/skills/build_library/SKILL.md) skill.

## What This Library Is

A structured, self-validating knowledge library for **&lt;DOMAIN&gt;**, with the example system named **&lt;EXAMPLE_SYSTEM&gt;**. It serves two audiences: a human reading a study path, and an LLM agent (you) consulting it via RAG while building real things. It is **routable** (MANIFEST + SECTIONS get you to the right section fast), **verifiable** (every cross-reference resolves; the `tools/` audits enforce it), and **honest** (it states what it does *not* cover).

## How To Use It As Reference

### Step 1 — Classify the task, pick the first lookup

| Task type | First lookup |
|-----------|--------------|
| Architectural decision / a fork | [reference/DECISION_TREES.md](reference/DECISION_TREES.md) |
| "How do I add / do X?" | [reference/WORKFLOWS.md](reference/WORKFLOWS.md) (recipes); [../.claude/skills/](../.claude/skills/) (atomic ops) |
| "What does term X mean?" | [reference/GLOSSARY.md](reference/GLOSSARY.md) |
| "Where is topic Y covered?" | [reference/INDEX.md](reference/INDEX.md) |
| "Why is X broken / slow / wrong?" (a symptom) | [reference/SYMPTOMS.md](reference/SYMPTOMS.md) |
| Common mistakes to avoid | [reference/ANTI_PATTERNS.md](reference/ANTI_PATTERNS.md) |
| Named technique reference | [reference/PATTERNS.md](reference/PATTERNS.md) |
| Build phase / milestone order | [reference/STARTER_KIT.md](reference/STARTER_KIT.md) |
| Implementation work | the relevant `book(s)`; cross-reference via [MANIFEST.json](MANIFEST.json) |
| Bleeding-edge / "is there newer research?" / state of the art | [../research/MANIFEST.json](../research/MANIFEST.json) — the frontier layer ([discipline](../research/README.md)); survey via `research_topic`. Cite as `research/...`, never as a `Book §`. |
| Strategic / motivational | [vision/](vision/) (PROLOGUE / FUTURES / MOONSHOTS) |

### Step 2 — Use MANIFEST.json as the topic index
`MANIFEST.json` carries structured metadata about every book and doc:
- `topic_to_books` — reverse map from topic keyword → relevant target(s). **The primary routing surface.**
- `rag_hints` — question-type → recommended documents.
- per-book `topics` / `key_concepts` / `summary`.
- `coverage_gaps` — the **authoritative** list of what the library does *not* cover. Check it before claiming a topic is covered or absent.

### Step 3 — Resolve sections via SECTIONS.json, then read narrowly
Section references use `Book NN §M.N` format. To resolve or **verify** a `§` citation without opening the book, consult [SECTIONS.json](SECTIONS.json) — a machine index of every heading (`id`, `title`, `line`). **Grep it for the section you need; don't load it whole.** Verify every `§` citation against it before asserting one. Then read only the relevant sections — never whole books.

### Step 4 — Apply with judgment
The library is opinionated; trade-offs are documented. Stack adaptation and when to stop and ask the human are canonical in [AGENT_GUIDE.md](AGENT_GUIDE.md) §4–§5 — don't restate them, follow them.

## Default assumptions in the library

Unless the project says otherwise, the library assumes: &lt;fill in the domain's baseline — language(s), key tools/formats/platforms — during onboarding&gt;. Project stack differs? AGENT_GUIDE §4.

## Cross-reference conventions

- **`Book NN` / `Book NN — Title`** = a book; **`§N.M`** = a section; **`DOC.md`** = a reference doc; **`skills/SKILL.md`** = a skill.
- Prefer the most specific section reference, and a short summary of *what's there* over a bare link.

## Topics not covered (be honest)

Before guessing, check `MANIFEST.json` `coverage_gaps` — each entry has a `status` (`missing`/`partial`/`covered`), the nearest in-library section, and an external source. Trust that block over memory. If a topic is thin, say so and point outward; offer to author content if it would help future lookups.

## Leverage honesty

Where the agent is high-multiplier vs ~1× (stop and ask): the canonical list is [AGENT_GUIDE.md](AGENT_GUIDE.md) §5. One list, one home — it had already drifted when it lived in three places.

## Style notes

When citing the library: quote sparingly and summarize; link with relative paths; cite at the most specific level; acknowledge when the library's opinion is one of several valid approaches. If you find an error, flag it and suggest a fix — this is a living document.
