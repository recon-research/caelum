# Changelog

All notable changes to Caelum are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) **with the 0.x contract below** — read it
before pinning a range.

## The 0.x stability contract

Caelum is in `0.x`. Until `1.0.0`:

- **Breaking changes ship in _minor_ bumps** (`0.1.0` → `0.2.0`), not majors. This is what SemVer
  specifies for `0.x`, and it is a deliberate choice rather than an oversight (**D-850**): the API
  is young, and buying the right to correct a bad signature is worth more right now than the
  stability a premature `1.0.0` would promise and then break.
- **Pin accordingly.** `^0.1.0` does _not_ protect you the way `^1.2.0` would — npm treats `^0.1.0`
  as `>=0.1.0 <0.2.0`, so it holds you inside one minor. That is the behaviour you want here; use
  `~0.1.0` or an exact pin if you want tighter.
- **Every breaking change is listed** in this file under a `### Changed` or `### Removed` heading
  with a migration note. A silent break is a bug — [file it](https://github.com/recon-research/caelum/issues/new?template=0-request.yml).
- **`1.0.0` waits on a real app shipping on Caelum**, not on a component count. Until a production
  consumer has exercised the API surface, "stable" would be a guess.

## [Unreleased]

## [0.1.0] - 2026-07-29

First public release — the first version of Caelum installable from npm as
[`@recon-research/caelum`](https://www.npmjs.com/package/@recon-research/caelum).

### Added

- **68 components**, each its own tree-shakable secondary entry point
  (`@recon-research/caelum/button`, `…/table`, `…/datepicker`, …). The primary barrel re-exports
  all of them except the two that import an optional peer — import those directly.
- **Token-only theming** (`D-04`): every colour, space, radius, and type value resolves through the
  `--cae-*` design-token bridge, with light/dark parity via `color-scheme` + `light-dark()` and a
  three-step density switch. No hardcoded design values — CI-enforced.
- **Accessibility as a shipped invariant**: every entry point carries axe coverage plus explicit
  keyboard and ARIA behaviour, and 67 of 68 carry an independently-reviewed adversarial sign-off in
  the [capability ledger](docs/CAPABILITY_LEDGER.md) (the 68th is a recorded exemption, re-proven
  from source on every CI run).
- **A US-origin-clean supply chain** (`D-05`/`D-10`/`D-11`): every runtime dependency, transitively,
  is permissively licensed and US-maintained; a machine-readable origin attestation ships inside the
  package, and the tree is scanned in CI.
- **Adapter isolation** (`D-03`): the one third-party engine (TanStack Table, behind
  `@recon-research/caelum/grid-tanstack`) is confined to its own entry point, so a client-default
  grid consumer ships **zero** engine bytes — enforced by a bundle-level tree-shake gate, not by
  convention.
- **A PrimeNG migration path**: 88 `p-*` → `cae-*` rows mapped with a per-component effort tier in
  the [comparison map](textbooks/reference/COMPARISON.md), and a
  [migration guide](docs/MIGRATION.md).

### Peer dependencies

Angular `^22.0.0 || ^23.0.0` (`core`, `common`, `forms`, `cdk`, `material`). Two peers are
**optional** and needed only for the entry point that uses them:

| Peer                   | Needed for                                 |
| ---------------------- | ------------------------------------------ |
| `@angular/router`      | `@recon-research/caelum/breadcrumb-router` |
| `@tanstack/table-core` | `@recon-research/caelum/grid-tanstack`     |

### Known gaps

`0.1.0` ships every mapped parity row **except 14**, each a deliberate policy deferral rather than
unfinished work — they are built on demand, and a real need promotes one into its own slice. The
[comparison map](textbooks/reference/COMPARISON.md) is the authoritative list; in summary:

- **Built on request** ([#712](https://github.com/recon-research/caelum/issues/712)) — `p-paginator`
  (standalone; pagination already ships _inside_ `cae-table`/`cae-data-grid`), `p-dataview`,
  `p-metergroup`, `p-cascadeselect`, `p-mention`, `p-colorpicker`, `p-speeddial`, `pKeyFilter`, and
  `p-inplace`/`p-blockui`/`p-scrolltop`/`pAnimateOnScroll`.
- **Built on request** ([#667](https://github.com/recon-research/caelum/issues/667)) — `p-knob`,
  `p-organizationchart`, `p-megamenu`/`p-dock`.
- **Adapter-backed, deferred by `D-18`** — charts (`p-chart` →
  [#233](https://github.com/recon-research/caelum/issues/233), D3 behind `CaeChartAdapter`) and the
  rich-text editor (`p-editor` → [#232](https://github.com/recon-research/caelum/issues/232),
  Lexical behind `CaeEditorAdapter`). Both are designed but unbuilt: Material ships no equivalent,
  so each needs a vetted third-party engine behind a neutral port.

Open work of every other kind lives in the
[issue tracker](https://github.com/recon-research/caelum/issues), which doubles as the project's
deferral log.

[Unreleased]: https://github.com/recon-research/caelum/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/recon-research/caelum/releases/tag/v0.1.0
