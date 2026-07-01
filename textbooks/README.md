# Caelum — Knowledge Library

A structured, self-validating RAG knowledge library for **Caelum** — a US-origin-clean Angular 22 Material + CDK component library — with the example system named **Forge** (a demo admin console). It is the reference the project's Claude Code agent consults and cites while building. *(**COMPLETE: all five volumes, Books 01–20 —** Books 01–04 (Angular 22 architecture; reactivity & forms; provenance & licensing; the theming token bridge), Books 05–11 (CDK primitives; Angular Aria headless primitives; form control fundamentals; numeric/mask/specialized inputs; overlay & menu components; data tables & virtualization; layout/panels/media & drag-drop) — the full component-level curriculum — Volume III's whole adapter layer: Book 12 (the adapter pattern) + Book 13 (the data grid adapter — headless TanStack) + Book 14 (the charts adapter — render-it-yourself D3 SVG, since visx is React-bound) + Book 15 (the rich-text editor adapter — Lexical, whose core is framework-agnostic with no React peer, and which is also a form control via CVA) — and Volume IV (Quality): Book 16 (accessibility & parity verification — the capability ledger, axe + keyboard + screen reader, the implementer-vs-adversarial split) + Book 17 (testing strategy & tooling — the test pyramid, Angular 22's Vitest default runner, the CDK ComponentHarness depth, Playwright visual-regression + golden discipline) + Book 18 (performance & bundle budgets — the two size gates app-vs-library, tree-shaking via APF/sideEffects/secondary entry points, @defer lazy loading, zoneless/OnPush change-detection cost proven with the profiler). and Volume V (Distribution & Adoption): Book 19 (packaging, versioning & distribution: ng-packagr + the Angular Package Format, the exports map + secondary entry points, peer deps + lockstep semver, and npm/SLSA build provenance vs the separately-shipped US-origin attestation) + Book 20 (migration & adoption: the living PrimeNG→Caelum `p-*`→`cae-*` map in reference/COMPARISON.md, strangler-fig incremental adoption, the standalone `ng generate` codemods distinct from Book 19's `ng-update`, and the forward-only lint-ratchet fitness function against adapter erosion). The full 20-book/5-volume [LIBRARY_OUTLINE.md](LIBRARY_OUTLINE.md) plan — built via [`build_library`](../.claude/skills/build_library/SKILL.md), driven by [LIBRARY_SEED.md](LIBRARY_SEED.md) — is now COMPLETE.)*

## What's here

| Path | What it is |
|------|------------|
| [LIBRARY_SEED.md](LIBRARY_SEED.md) | The complete instruction set for **building** this library from scratch in any domain. Start here. |
| [CLAUDE.md](CLAUDE.md) | Rules for **consulting** the library (routing table, citation discipline). |
| [AGENT_GUIDE.md](AGENT_GUIDE.md) | The **build loop** that turns the library into shipped work. |
| `MANIFEST.json` | Machine index: `topic_to_books`, `rag_hints`, per-book metadata, `coverage_gaps`. |
| `SECTIONS.json` | Generated index of every heading (for resolving/verifying `Book NN §X`). |
| `ROUTING_EVAL.json` | Routing smoke-tests (query → expected target). |
| [books/](books/) | The curriculum, numbered and grouped into volumes. (`00_TEMPLATE.md` is the template.) |
| [reference/](reference/) | Lookup docs: INDEX, GLOSSARY, ANTI_PATTERNS, DECISION_TREES, SYMPTOMS, PATTERNS, WORKFLOWS, STARTER_KIT. |
| [vision/](vision/) | Inspirational docs: PROLOGUE, FUTURES, MOONSHOTS. |
| [tools/](tools/) | The four maintenance scripts that keep the library honest. |

## Reading paths

- **To learn the domain (human):** start at the lowest-numbered book and read in order, or jump via [reference/INDEX.md](reference/INDEX.md).
- **To build something (agent):** follow [AGENT_GUIDE.md](AGENT_GUIDE.md) — route via `MANIFEST.json`, resolve sections via `SECTIONS.json`, pre-mortem via [reference/ANTI_PATTERNS.md](reference/ANTI_PATTERNS.md).

## Stats

- **Books:** 21 in `books/` — book_00 (template) + Books 01–20; **20 of 20** curriculum books in the [LIBRARY_OUTLINE.md](LIBRARY_OUTLINE.md) plan — **COMPLETE.** **Volumes:** Volume I **complete** (4/4), Volume II **complete** (7/7 — Books 05–11), Volume III **complete** (4/4 — Books 12–15: the adapter pattern + data grid + charts + rich-text editor), Volume IV **complete** (3/3 — Books 16–18: accessibility & parity verification; testing strategy & tooling; performance & bundle budgets), Volume V **complete** (2/2 — Book 19: packaging, versioning & distribution; Book 20: migration & adoption). **Sections:** 348 across 21 book files. **Reference docs:** 9 (8 templates + `COMPARISON.md`, the living PrimeNG→Caelum map, now filled). **Status:** **LIBRARY COMPLETE** — next is repo go-live (REPO-1) + the M0 code scaffold.
  *(Counts drift; trust the scripts, not this line. Update after any structural change.)*

## Keeping it honest

Run from this directory after any change to books or headings:

```
python tools/_gen_sections.py     # regenerate SECTIONS.json
python tools/_audit_refs.py        # 0 unresolved Book NN §X references
python tools/_audit_routing.py     # all ROUTING_EVAL cases pass
python tools/_audit_links.py       # 0 broken markdown links
```

A library that passes all four is internally consistent. The scripts **exit non-zero on failure**, so CI enforces them as a real merge gate (see [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)). See [LIBRARY_SEED.md](LIBRARY_SEED.md) §4 and §8.
