---
name: research_topic
description: Survey a bleeding-edge topic online into a sourced, tiered research note in research/notes/. Use when the user says "research X", "what's the state of the art", "survey recent papers on X", "is there newer work on X", or when plan_work hits a frontier topic the library's Bleeding Edge coverage doesn't settle. Every claim gets a real fetched URL + accessed date + tier — never citations from memory.
---

# Research a Frontier Topic

Produce (or refresh) a survey note in [`research/notes/`](../../../research/notes/00_TEMPLATE.md) per the [research discipline](../../../research/README.md). The defining rule: **fetched, or not cited** — your training knowledge is stale by definition on frontier topics, and a hallucinated citation poisons every plan that later cites the note.

## Procedure

1. **Frame the consumer.** What decision (`D-NN`), slice, or experiment does this inform? File/locate the `research`-labeled issue (template provided). Research without a consumer is an `idea` ticket, not a survey.
2. **Check what exists:** `research/MANIFEST.json` (`topic_to_notes`) for a prior note — if one exists and is fresh, extend it; if stale (>~180 days), this run is the re-verify. Check the textbook routing too (`MANIFEST.json` → the book's Bleeding Edge section) so the note supplements rather than duplicates curriculum.
3. **Sweep the web broadly.** Multiple query formulations; prefer **primary sources** — arXiv abstract pages, DOIs, official docs/release notes, conference proceedings, the project's own repo — over blog summaries. If the harness provides a deep-research skill, use it for the fan-out; otherwise fan out **read-only subagents** (one per lens/subtopic, in parallel) with WebSearch/WebFetch. **Width rubric (#312)** — declare `effort: <class> → N agents · ~M sources` in the sweep plan and preserve it in the consumer-ticket comment with the raw sweeps: **targeted** (one load-bearing claim, or re-verifying a stale note) → 1–2 agents · ~4–6 sources · **survey** (grounds a slice or experiment — the default) → 3–4 agents · ~8–12 sources · **decision-grounding** (a `D-NN` / hard-to-reverse fork) → 5–6 agents · 12+ sources, primary-source majority. Anchors: `research/notes/agent-project-systems.md` (Anthropic's production prompts embed per-class effort-scaling rules; token budget explained ~80% of outcome variance). **Worker contract (#313):** each sweep agent writes its *full* findings to a disk artifact (URL + accessed date on every claim, unverified items flagged) and returns only a ~250-word distillation — paths, not payloads (EXP-01) — and a gap in its brief (ambiguous lens, unclear boundary with a sibling sweep) comes back as a question in the distillation, never a guessed scope (ask-don't-guess, #309). **Side-effect boundary (#329, incident pair with #319):** a worker writes only to its assigned artifact path(s) — temp downloads go under its own artifact directory so footprints stay bounded — and on environmental failure (disk full, dead tool, lost network) it *reports and stops*; it never remediates shared state (no deletions, no cache cleanup, no killing processes). Shared-environment remediation is the orchestrating session's call, made with damage visibility a worker doesn't have (hit live: a disk-full sweep worker ran `find -delete` across live session directories). Then **preserve each raw sweep verbatim as a comment on the consumer ticket before formalizing** — ticket comments survive compaction; scratchpads don't (field-validated twice: #290, #301).
4. **Fetch every source you will cite.** Open the actual page (WebFetch) before citing it — including any citation a deep-research pass or subagent handed you (verify before trusting). Record the URL + accessed date + the key numbers *while reading*. Paywalled? Cite the abstract page and tier accordingly — never pretend to have read what you couldn't. A **load-bearing claim whose primary source won't fetch** (403/404 across mirrors) goes in explicitly marked *secondary-verified* with a Watch entry to upgrade it — never tier-laundered (worked example: the MDMP line in `research/notes/intent-elicitation.md`). And **verify locally before filing:** a sweep claim checkable against *this repo* gets checked against HEAD before any ticket derives from it — a sweep can be right about the field and stale about the repo (hit live: intake #289's settings finding was already fixed upstream).
5. **Write the note** from [`notes/00_TEMPLATE.md`](../../../research/notes/00_TEMPLATE.md): framing → **State of the art** (each claim line: numbers, `[tier]`, `(source: <URL>, accessed YYYY-MM-DD)`) → **feasibility path** against this project's real stack and invariants → **candidate experiments** → **Watch** list. Set `> reviewed:` to today. When the survey grounds an adopt/reject call, **validations and rejections are first-class sections** — each rejection with its why. That's the decision ammunition: it keeps the next harvest from re-litigating, and it's what the note preserves that the shipped code can't (#313).
6. **Route + validate:** add the `notes[]` entry and `topic_to_notes` route in `research/MANIFEST.json`; run `python3 tools/_audit_research.py` from `research/` (green or fix). Ship via the normal PR flow.
7. **File the follow-ups:** each candidate experiment worth running becomes a ticket (`track_followups`); if the survey resolves or reframes a pending decision, update the `decision` issue.

## Verification

- The audit passes: every tiered claim line carries a real URL + accessed date; the note is routed in the MANIFEST.
- Spot-check: each cited URL was actually fetched this session (you can say what's on the page).
- Tiers are honest — nothing `[experimental]` is presented as `[production-proven]`; contested claims say so.
- The note ends with a feasibility path + candidate experiments + Watch — it's actionable, not encyclopedic.

## Don't

- **Don't cite from memory** — no URL you didn't fetch this session, no "(Smith et al. 2024)" without a link. This is the #1 failure mode this skill exists to kill.
- Don't launder tiers (a preprint is `[published]` at best, a repo demo is `[experimental]`).
- Don't write a literature review for its own sake — every note serves a named consumer.
- Don't plan against a stale note (>~180 days) without re-verifying its load-bearing claims first.
- Don't cite this layer as `Book NN §X` — research notes and textbooks have different trust models; cite `research/notes/<file>.md`.
