# Caelum

**A comprehensive, accessible Angular component library built on Angular Material and the CDK — with the breadth teams expect when they migrate off PrimeNG.**

Caelum ships 68 components, each as its own tree-shakable secondary entry point (`@recon-research/caelum/button`, `@recon-research/caelum/table`, `@recon-research/caelum/galleria`, …), parity-mapped against PrimeNG (`p-*` → `cae-*`) so existing apps can adopt it one component at a time.

- **Token-only theming** — every color/space/radius/type value comes from the `--cae-*` design-token bridge, with light/dark parity and a density switch.
- **Accessibility as a baseline** — explicit keyboard + ARIA behavior per component, axe-verified.
- **US-origin-clean supply chain** — every runtime dependency is transitively vetted (permissive license, US-maintained); a machine-readable attestation (`us-origin.attestation.json`) ships in this package.
- **Clean adapter boundaries** — the data grid's TanStack dependency is optional (`peerDependenciesMeta`) and confined to a single adapter.

```bash
npm install @recon-research/caelum
```

## Versioning — read this before you pin

Caelum is in **`0.x`**. Until `1.0.0`, **breaking changes ship in _minor_ bumps** (`0.1.0` →
`0.2.0`) rather than majors. That is what SemVer specifies for `0.x`, and it is deliberate: the API
is young, and the right to correct a bad signature is worth more right now than a stability promise
we would have to break.

Practically: `^0.1.0` resolves as `>=0.1.0 <0.2.0`, so it already holds you inside one minor — which
is the behaviour you want here. Use `~0.1.0` or an exact pin if you want tighter. Every breaking
change is listed with a migration note in the
[changelog](https://github.com/recon-research/caelum/blob/main/CHANGELOG.md); a silent break is a
bug worth filing.

`1.0.0` waits on a real application shipping on Caelum — not on a component count.

## Peer dependencies

`@angular/core`, `@angular/common`, `@angular/forms`, `@angular/cdk`, `@angular/material`
(`^22.0.0 || ^23.0.0`). Two peers are **optional**, each needed only for the one entry point that
uses it: `@angular/router` (for `@recon-research/caelum/breadcrumb-router`) and
`@tanstack/table-core` (for `@recon-research/caelum/grid-tanstack`).

## Usage

```ts
import { CaeButton } from '@recon-research/caelum/button';

@Component({
  imports: [CaeButton],
  template: `<cae-button variant="filled">Save</cae-button>`,
})
export class MyComponent {}
```

Include the theme bridge once in your app's styles, then override `--cae-*` tokens to brand it.

## Docs

- [Repository & getting started](https://github.com/recon-research/caelum)
- [Changelog](https://github.com/recon-research/caelum/blob/main/CHANGELOG.md) — including the known gaps in this release
- [PrimeNG → Caelum migration guide](https://github.com/recon-research/caelum/blob/main/docs/MIGRATION.md)
- [PrimeNG → Caelum comparison map](https://github.com/recon-research/caelum/blob/main/textbooks/reference/COMPARISON.md)
- [Architecture & invariants](https://github.com/recon-research/caelum/blob/main/docs/ARCHITECTURE.md)

## License

[MIT](https://github.com/recon-research/caelum/blob/main/LICENSE) © 2026 Caelum contributors.
