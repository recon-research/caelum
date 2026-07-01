# Provenance — the automated US-origin + license gate

This directory holds the machine-readable **source of truth** for Caelum's two hard
dependency rules (no paid/copyleft license; US-origin, per **D-11**). It automates
the manual [M0-2 transitive provenance scan](../docs/provenance/M0-2-transitive-provenance-scan.md)
so the invariant is enforced on every push instead of re-audited by hand.

- **[`allowlist.json`](allowlist.json)** — the curated, vetted set: the D-11 `policy`
  (permissive-license sets + allied-nation origin list), every vetted `runtime`
  package with its license + origin + shipped-reachability, the `optionalPeers`
  (`@angular/animations`, `zone.js` — conditionally shipped, pre-vetted), and the
  `devCopyleftExceptions` ledger (currently just `rollup-plugin-dts`, LGPL-3.0-only).

## The gates (all wired into `scripts/preflight.*` and CI)

| Gate                      | Script                                   | Runs in                                                 | Enforces                                                                                        |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Dependency provenance** | `scripts/check_provenance.py`            | CI `static gates` (**required, node-free**) + preflight | Runtime tree is permissive + US/allied + vetted; dev tree is license-clean (Book 03 §3.3, §3.4) |
| **Shipped-library size**  | `scripts/check-lib-size.mjs`             | preflight `library gates` (CI matrix at #6)             | Each `fesm2022/*.mjs` entry point ≤ its `size-budget.json` budget (Book 18 §3.2)                |
| **US-origin attestation** | `scripts/emit-us-origin-attestation.mjs` | preflight `library gates` (CI matrix at #6)             | Emits `dist/caelum/us-origin.attestation.json` INTO the tarball (Book 19 §3.5, §4(e))           |
| **Adapter isolation**     | `eslint.config.js` → `npm run lint`      | CI `lint` job + preflight                               | No admitted 3p engine imported outside its one `*.adapter.ts` (D-03, Book 12 §3.3)              |

The size gate + attestation emitter both consume `allowlist.json`; the adapter fence
is the _code-import_ analogue of what provenance is for _dependencies_.

## The forward-only ratchet — how to add a dependency

The gate **fails on any runtime package not in `allowlist.json`**. That is deliberate
(Book 03 §3.4, Book 12 §3.3): a new shipped dependency must be a _human_ decision,
not a silent `npm install`.

1. **A runtime dependency** (`dependencies` / a shipped peer): vet its license **and**
   its transitive tree's origin (US-preferred; allied-nation UK/DE/… fallback only when
   a need can't be met US-origin or self-built — D-11). If it clears, add a row under
   `runtime` with `license`, `origin`, `maintainer`, `shipped`, and a `note`. If it
   pulls a foreign or non-permissive transitive dep, it fails — the tree is the unit
   (Book 03 §2.3, R5). Non-trivial admissions get an ADR/`decision` issue and a line in
   the M0-2 scan doc.
2. **A dev-only dependency** (`devDependencies`): license must still be permissive.
   A **weak/file-level copyleft** dev tool (MPL-2.0 / LGPL) that ships _zero_ bytes is
   admissible **only** via a `devCopyleftExceptions` row with the "zero shipped bytes"
   justification (the axe-core precedent, Book 16 §3.2). Strong copyleft (GPL) needs an
   explicit human override; **AGPL and source-available (BUSL/SSPL/Elastic/PolyForm)
   are never admissible**.
3. Run `npm run check:provenance` (or `bash scripts/preflight.sh --quick`) until GREEN.

## Two orthogonal provenances (don't conflate — Book 19 §2.2)

The shipped `us-origin.attestation.json` attests **what the package is made of and who
owns that** (license + national origin of the runtime tree). It is _separate_ from
npm/SLSA **build** provenance (which commit/CI built the tarball, via Sigstore/OIDC/
Rekor). A complete release ships **both**; neither implies the other. The attestation's
`orthogonality.note` field states this in-band.

See `docs/ARCHITECTURE.md` Appendix A (**D-05**, **D-10**, **D-11**) for the policy of
record, and Books 03 / 12 / 16 / 18 / 19 for the grounding.
