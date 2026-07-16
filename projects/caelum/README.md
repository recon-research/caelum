# Caelum

**A comprehensive, accessible Angular component library built on Angular Material and the CDK — with the breadth teams expect when they migrate off PrimeNG.**

Caelum ships 50+ components, each as its own tree-shakable secondary entry point (`caelum/button`, `caelum/table`, `caelum/galleria`, …), parity-mapped against PrimeNG (`p-*` → `cae-*`) so existing apps can adopt it one component at a time.

- **Token-only theming** — every color/space/radius/type value comes from the `--cae-*` design-token bridge, with light/dark parity and a density switch.
- **Accessibility as a baseline** — explicit keyboard + ARIA behavior per component, axe-verified.
- **US-origin-clean supply chain** — every runtime dependency is transitively vetted (permissive license, US-maintained); a machine-readable attestation (`us-origin.attestation.json`) ships in this package.
- **Clean adapter boundaries** — the data grid's TanStack dependency is optional (`peerDependenciesMeta`) and confined to a single adapter.

> **Not yet published to npm** — the package name is being finalized. Until then, build from source.

## Peer dependencies

`@angular/core`, `@angular/common`, `@angular/forms`, `@angular/cdk`, `@angular/material` (v22+); `@tanstack/table-core` only if you use the grid adapter.

## Usage

```ts
import { CaeButton } from 'caelum/button';

@Component({
  imports: [CaeButton],
  template: `<cae-button variant="filled">Save</cae-button>`,
})
export class MyComponent {}
```

Include the theme bridge once in your app's styles, then override `--cae-*` tokens to brand it.

## Docs

- [Repository & getting started](https://github.com/recon-research/caelum)
- [PrimeNG → Caelum comparison map](https://github.com/recon-research/caelum/blob/main/textbooks/reference/COMPARISON.md)
- [Architecture & invariants](https://github.com/recon-research/caelum/blob/main/docs/ARCHITECTURE.md)

## License

[MIT](https://github.com/recon-research/caelum/blob/main/LICENSE) © 2026 Caelum contributors.
