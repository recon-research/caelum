# Caelum

**A US-origin-clean Angular 22 component library — Angular Material + CDK + Angular Aria, with PrimeNG-level breadth and parity.**

Caelum is an open-source component library for teams leaving PrimeNG. It builds on Material's foundation while delivering the density and breadth PrimeNG users expect, so you can adopt it **component-by-component** — the same way you adopted PrimeNG — instead of a big-bang rewrite. Its canonical demo is **Forge**, an example admin console.

> **Status: early development (pre-release).** The domain knowledge library is complete; the component-code scaffold is the next milestone (**M0 — Foundation**). Nothing is published to npm yet. Track progress in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Why Caelum

- **US-origin-clean, through the whole tree.** Every runtime dependency — transitively — is maintained by a US-based entity under a permissive license. Provenance is scanned in CI, and a machine-readable US-origin attestation ships inside the package. (`D-05` / `D-10`)
- **No paid licenses, ever.** Everything Caelum relies on at runtime is free and permissively licensed.
- **PrimeNG parity, adopted incrementally.** A living [`p-*` → `cae-*` map](textbooks/reference/COMPARISON.md) plus schematic codemods let you migrate one component at a time (the strangler-fig pattern), with a lint "ratchet" that keeps the migration converging.
- **Token-only theming.** Every color, space, radius, and type value comes from a token bridge — no hardcoded design values — with light + dark parity. (`D-04`)
- **Accessibility at parity.** Every component carries explicit keyboard + ARIA behavior, verified with axe plus manual keyboard and screen-reader passes.
- **Adapter isolation for the hard parts.** The three genuine gaps — data grid, charts, rich-text editor — sit behind neutral interfaces; each third-party library (TanStack Table, D3, Lexical) is confined to a single adapter file and provenance-vetted, enforced by lint. (`D-03`)

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
