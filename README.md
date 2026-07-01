# Caelum

**A comprehensive, accessible Angular 22 component library built on Angular Material, the CDK, and Angular Aria.**

Caelum is an open-source component library that pairs Material's foundation with the breadth a full-featured application UI needs, designed to be adopted incrementally — one component at a time — in new and existing Angular apps. Its canonical demo is **Forge**, an example admin console.

> **Status: early development (pre-release).** The domain knowledge library is complete; the component-code scaffold is the next milestone (**M0 — Foundation**). Nothing is published to npm yet. Track progress in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Design principles

- **Incremental adoption.** Caelum is built to drop into an existing app gradually, component by component — no big-bang rewrite. Teams coming from another component suite such as PrimeNG can use an optional mapping guide (`p-*` → `cae-*`) and schematic codemods to translate existing components to their Caelum equivalents at their own pace.
- **Accessibility as a baseline.** Every component ships with explicit keyboard and ARIA behavior, verified with axe plus manual keyboard and screen-reader passes.
- **Token-only theming.** Every color, space, radius, and type value comes from a design-token bridge — no hardcoded values — with light and dark parity. (`D-04`)
- **Free, permissively licensed dependencies.** Everything Caelum relies on at runtime is free and under a permissive license — no paid tiers.
- **US-origin supply chain.** As a project requirement, every runtime dependency — transitively — is maintained by a US-based entity under a permissive license; provenance is scanned in CI and a machine-readable origin attestation ships inside the package. (`D-05` / `D-10`)
- **Clean adapter boundaries.** The few areas that call for a specialized third-party library — data grid, charts, rich-text editor — sit behind neutral interfaces, with each library confined to a single adapter file and vetted for provenance, enforced by lint. (`D-03`)

## What's in this repository today

Caelum is built in the open, and the knowledge that drives it lives here alongside the (forthcoming) code:

| Path | What it is |
|------|------------|
| [`textbooks/`](textbooks/) | A 20-book, self-validating knowledge library (RAG) covering Angular 22, the CDK/Aria primitives, the adapter layer, quality, and distribution — see the [outline](textbooks/LIBRARY_OUTLINE.md) and the [library readme](textbooks/README.md). |
| [`docs/`](docs/) | [Architecture](docs/ARCHITECTURE.md) (shape, invariants, decision log) and the [Roadmap](docs/ROADMAP.md) (milestones M0–M4). |
| [`research/`](research/) | Frontier research notes — every claim sourced, tiered, and dated — that ground the library's decisions. |
| [`CLAUDE.md`](CLAUDE.md), [`.claude/`](.claude/) | The autopilot harness (see below). |

The component library (`projects/caelum`) and the Forge demo (`projects/forge`) arrive with milestone **M0**.

## Built on autopilot

Caelum is built and tested almost entirely by **Claude Code**, running on an autopilot harness, with a human making the architecture and scope calls. The working loop — ticket → implement → verify → review → merge — and the decision protocol are documented in [`CLAUDE.md`](CLAUDE.md) and [`PROJECT_CONVENTIONS.md`](PROJECT_CONVENTIONS.md). It's an experiment in how far a well-instrumented agent can carry a real, quality-gated library.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md). In short: **M0** foundation + theming + direct components → **M1** composed components → **M2** the three adapters → **M3** the long tail → **M4** parity hardening and adoption.

## Contributing

Caelum is in early foundation work; the public contribution flow opens up as the code scaffold lands. Until then, the [architecture](docs/ARCHITECTURE.md) and [roadmap](docs/ROADMAP.md) docs are the best way to understand where it's headed, and issues are welcome.

## License

[MIT](LICENSE) © 2026 Caelum contributors.
