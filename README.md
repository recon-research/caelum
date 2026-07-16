# Caelum

[![CI](https://github.com/recon-research/caelum/actions/workflows/ci.yml/badge.svg)](https://github.com/recon-research/caelum/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**A comprehensive, accessible Angular 22 component library built on Angular Material, the CDK, and Angular Aria — with the breadth teams expect when they leave PrimeNG.**

Caelum pairs Material's foundation with a full application-UI surface, designed to be adopted incrementally — one component at a time — in new and existing Angular apps. Components are named and parity-mapped against their PrimeNG counterparts (`p-*` → `cae-*`), so a migrating team can swap them in at their own pace. Its canonical demo is **Forge**, an example admin console built only from Caelum components.

> **Status:** in active development and further along than you'd guess — 50+ components, 1,300+ tests, CI-gated a11y/theming/provenance invariants. Milestones M0–M2 are complete; M3 (the long tail) is in progress. **Not yet published to npm** — it will publish as **`@recon-research/caelum`** (D-501; the repo-wide rename lands pre-publish, [#514](https://github.com/recon-research/caelum/issues/514)). The live plan is [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Components

Every component is its own tree-shakable secondary entry point, importable independently.

| Family | Components |
|---|---|
| Form controls | form-field · input · textarea · select · autocomplete · multi-select · listbox · checkbox · radio · switch · slider · password · input-mask · input-number · input-otp · select-button · toggle-button |
| Buttons & menus | button · split-button · menu · menubar · context-menu · tab-menu · breadcrumb |
| Data | table · grid (TanStack adapter) · tree · tree-table · tree-select · order-list · pick-list |
| Overlays & feedback | dialog · confirm · toast · tooltip · progress-bar · progress-spinner |
| Media | image · image-compare · carousel · galleria |
| Layout & structure | accordion · card · tabs · stepper · splitter · toolbar · scroll-panel · divider |
| Misc | badge · chip · chip-set · file-upload |

Coming from PrimeNG? The **[`p-*` → `cae-*` comparison map](textbooks/reference/COMPARISON.md)** covers the full PrimeNG surface with a migration-effort tier per component.

## Try it

Caelum isn't on npm yet. Until it is, the Forge demo is the fastest way to see the library:

```bash
git clone https://github.com/recon-research/caelum.git
cd caelum
npm ci
npm start   # Forge on http://localhost:4200 — light/dark, density toggle, live components
```

A hosted Forge demo is planned ([#495](https://github.com/recon-research/caelum/issues/495)).

## Design principles

- **Incremental adoption.** Caelum is built to drop into an existing app gradually, component by component — no big-bang rewrite. Teams coming from another component suite such as PrimeNG can use the mapping guide (`p-*` → `cae-*`) to translate existing components to their Caelum equivalents at their own pace.
- **Accessibility as a baseline.** Every component ships with explicit keyboard and ARIA behavior, verified with axe plus manual keyboard and screen-reader passes.
- **Token-only theming.** Every color, space, radius, and type value comes from a design-token bridge — no hardcoded values — with light/dark parity (via `color-scheme` + `light-dark()`) and a density switch. (`D-04`)
- **Free, permissively licensed dependencies.** Everything Caelum relies on at runtime is free and under a permissive license — no paid tiers.
- **US-origin supply chain.** As a project requirement, every runtime dependency — transitively — is maintained by a US-based entity under a permissive license; provenance is scanned in CI and a machine-readable origin attestation ships inside the package. (`D-05` / `D-10`)
- **Clean adapter boundaries.** The few areas that call for a specialized third-party library — data grid, charts, rich-text editor — sit behind neutral interfaces, with each library confined to a single adapter file and vetted for provenance, enforced by lint. (`D-03`)

## What's in this repository

| Path | What it is |
|------|------------|
| [`projects/caelum/`](projects/caelum/) | The library — one self-contained entry point per component, plus the [token bridge](projects/caelum/styles/). |
| [`projects/forge/`](projects/forge/) | Forge, the demo admin console exercising every shipped component. |
| [`docs/`](docs/) | [Architecture](docs/ARCHITECTURE.md) (shape, invariants, decision log) and the [Roadmap](docs/ROADMAP.md) (milestones M0–M4). |
| [`textbooks/`](textbooks/) | A 20-book, self-validating knowledge library (RAG) that grounds the build — see the [outline](textbooks/LIBRARY_OUTLINE.md) and [library readme](textbooks/README.md). |
| [`research/`](research/) | Frontier research notes — every claim sourced, tiered, and dated. |
| [`CLAUDE.md`](CLAUDE.md), [`.claude/`](.claude/) | The autopilot harness (see below). |

## Built on autopilot

Caelum is built and tested almost entirely by **Claude Code**, running on an autopilot harness, with a human making the architecture and scope calls. The working loop — ticket → implement → verify → review → merge — and the decision protocol are documented in [`CLAUDE.md`](CLAUDE.md) and [`PROJECT_CONVENTIONS.md`](PROJECT_CONVENTIONS.md). It's an experiment in how far a well-instrumented agent can carry a real, quality-gated library.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md). In short: **M0** foundation + theming ☑ → **M1** composed components ☑ → **M2** adapters ☑ → **M3** the long tail ◐ → **M4** parity hardening and adoption.

## Contributing

Bugs, requests, and feedback are welcome — the [Request / feedback form](https://github.com/recon-research/caelum/issues/new?template=0-request.yml) needs no knowledge of the project's internal process. For code contributions (PR flow, CI gates, conventions), see [`CONTRIBUTING.md`](CONTRIBUTING.md); to report a vulnerability, see [`SECURITY.md`](SECURITY.md). Community standards: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) (Contributor Covenant v2.1).

## License

[MIT](LICENSE) © 2026 Caelum contributors.
