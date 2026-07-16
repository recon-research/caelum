# Security Policy

## Supported versions

Caelum is pre-release (nothing is published to npm yet); security fixes land on `main`. Once versioned releases exist, this table will state which lines receive fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

- Use GitHub's **[private vulnerability reporting](https://github.com/recon-research/caelum/security/advisories/new)** ("Report a vulnerability" under the repo's Security tab).
- Include: affected component/entry point, a reproduction, and impact as you understand it.

You should get an acknowledgement within **7 days**. Fixes are developed privately and disclosed once a patched release (or patched `main`) is available, with credit if you want it.

## Scope notes

- **Supply chain**: every runtime dependency is transitively vetted for license + origin (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), decisions `D-05`/`D-10`/`D-11`); the built package embeds a machine-readable `us-origin.attestation.json`. Reports about dependency provenance or attestation gaps are in scope and welcome.
- The Forge demo app is demo code, but XSS-class issues in **library components** (e.g. anything rendering user HTML) are high-priority in scope.
