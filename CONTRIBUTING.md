# Contributing to Caelum

Thanks for your interest! Two paths in:

## Issues, requests, feedback (no process knowledge needed)

Use the **[Request / feedback form](https://github.com/recon-research/caelum/issues/new?template=0-request.yml)** — free-form, and the only template a newcomer needs. It gets triaged into the project's internal ticket flow, and you'll receive a disposition reply on the issue. The other issue templates (slice / decision / followup / research) are the project's internal process machinery; you're welcome to read them but don't need them.

For vulnerabilities, use [SECURITY.md](SECURITY.md) — not a public issue. Community standards: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Code contributions

A heads-up on how this repo works: Caelum is built almost entirely by an autopilot agent under human architectural direction (see [README › Built on autopilot](README.md#built-on-autopilot)), and every merge passes the same gates regardless of author.

1. **Before writing code**, open a Request / feedback issue describing the change — component work is planned against [`docs/ROADMAP.md`](docs/ROADMAP.md) and the PrimeNG-parity map, and a quick alignment check saves you a rewritten PR.
2. **Fork → branch → PR** against `main`. Branch naming here is `slice/<issue#>-<slug>`; PRs reference their issue.
3. **Every PR must pass the CI gates** (they mirror `scripts/preflight.sh` / `scripts\preflight.ps1`, which you can run locally): build (with per-entry-point size budgets), the full test suite (`CI=true npm test`), Prettier + ESLint (including the adapter-isolation fence), dependency provenance (permissive license + US-origin, transitively), doc/link audits, and TODO hygiene (a TODO must reference a ticket: `TODO(#NN)`).
4. **Component conventions** (the short version): one self-contained entry point per component under `projects/caelum/<name>/`; barrel + `size-budget.json` registration; token-only styling (`--cae-*` — no hardcoded colors/design values); explicit keyboard + ARIA behavior with specs. The full conventions live in [`PROJECT_CONVENTIONS.md`](PROJECT_CONVENTIONS.md).
5. Squash-merge, PR title becomes the commit subject: `M<n> <slice>: <imperative summary> (closes #<issue>)`.

### Local setup

```bash
npm ci
npm run build:lib   # library first — Forge and the tests consume dist/caelum
npm start           # Forge demo on :4200
CI=true npm test    # full suite, single run
bash scripts/preflight.sh   # everything CI will check (PowerShell: scripts\preflight.ps1)
```

## Licensing

Contributions are accepted under the repo's [MIT license](LICENSE). Note the supply-chain rule: new **runtime** dependencies are effectively a no (each one needs a provenance decision — permissive license, US-maintained, transitively); if your change seems to need one, raise it in the issue first.
