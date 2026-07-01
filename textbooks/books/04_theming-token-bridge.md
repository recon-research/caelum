# Book 04 — The Theming Token Bridge

> Volume I, Book 4 — the last Foundations book. Caelum renders through *two* engines: Angular Material's own components and the components Caelum builds on CDK/Aria (`Book 01 §3.4`). For a consuming team to believe Caelum is **one** design system and not a bag of parts, both engines must read design values from a single source. That source is the **token bridge** (`docs/ARCHITECTURE.md` D-04; the *token-only theming* invariant, §2; `brief §2.2`). The Material 22 theming specifics here — the `mat.theme()` mixin, `--mat-sys-` system tokens, `mat.theme-overrides()`, and the `light-dark()` function — are frontier and sourced in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md) (cited inline as *(platform note)*); the architectural reasoning (one token set, semantic layering, logical properties for RTL) is stable design knowledge.

## 1. TL;DR

Caelum defines **one semantic token set** as CSS custom properties under a `--cae-` namespace (`--cae-color-*`, `--cae-surface-*`, `--cae-space-*`, `--cae-radius-*`, `--cae-font-*`, `--cae-focus-*`), and that set is the **single source of design truth**. Built components read those variables and *only* those — never a hardcoded hex, px, or font (the token-only invariant, hard-gated by `definition_of_done`). Material's own components are bridged onto the same values by feeding Material 22's `mat.theme()` / `mat.theme-overrides()` (platform note) from the Caelum tokens, so a `<mat-card>` and a `<cae-panel>` resolve the *same* surface color, radius, and type. Light/dark, density, and RTL are then properties of the **token layer**, not of the components: you re-bind variables (via `light-dark()` or a theme selector), turn a density knob, and flip `dir` — the components don't change. The honest cost is R4: matching PrimeNG's tighter density and visual identity is deliberate token work, verified under light **and** dark, not a free drop-in.

## 2. Conceptual Foundations

### 2.1 The two-renderer problem

A consuming team adopting Caelum will, on one screen, mix a Material `<mat-select>`, a Caelum-built `<cae-multiselect>` (CDK/Aria, `Book 01 §3.4`), and eventually an adapter-wrapped data grid. If each carries its own colors and spacing, the screen looks like three libraries — which is exactly the incoherence teams leave PrimeNG to escape. The only way three render paths look like one system is if they all resolve design values from the same place at runtime. CSS custom properties are that place: they cascade through the DOM, are read identically by Material's emitted CSS and by Caelum's component styles, and can be re-bound at any scope without recompiling. The bridge is the discipline of making **both** render paths drink from one well.

### 2.2 Material 22's token model (the frontier facts)

Material 22 is itself token-based, which is what makes the bridge cheap (platform note):

- **`mat.theme()`** — a Sass mixin that takes a `(color: …, typography: …, density: …)` map and *emits CSS custom properties* (it no longer bakes static values into component rules the way older Material did).
- **`--mat-sys-*` system tokens** — Material exposes its design decisions as system-level CSS variables, e.g. `var(--mat-sys-surface)`, `var(--mat-sys-primary)`, `var(--mat-sys-on-surface)`. These are the seam.
- **`mat.theme-overrides(...)`** — redefines those system-level variables; and each component ships an overrides mixin (e.g. `mat.card-overrides(...)`) for component-scoped token changes.
- **`light-dark()`** — Material 22 colors use the CSS `light-dark(lightValue, darkValue)` function so a single token definition switches with the page's `color-scheme`, no duplicate dark stylesheet.

Because Material's design values are *already* CSS variables you can override, Caelum doesn't fight the framework — it **drives** Material's system tokens from the Caelum token set instead of theming Material and the built components separately.

### 2.3 Tokens are design truth; DI is behavior truth

Book 01 drew the line (`Book 01 §3.3`): **behavior and configuration flow through dependency injection; design values flow through CSS custom properties.** This book is the second half of that split. A built component must not read a color from an injected config object, and must not hardcode `#1976d2` or `8px` — it reads `var(--cae-color-primary)` and `var(--cae-space-2)`. This is the *token-only theming* invariant (`docs/ARCHITECTURE.md` §2, D-04): no hardcoded colors, spacing, radii, or typography in built components. The payoff is that a rebrand, a dark mode, a density change, and an RTL flip are all **token operations** — they touch the bridge, not a hundred component stylesheets.

## 3. Architecture & Design

### 3.1 The Caelum token namespace — primitive vs semantic tiers

Caelum tokens follow `--cae-<group>-<role>` (the identity convention in `LIBRARY_OUTLINE.md`), organized in two tiers so a rebrand changes few values and parity work has somewhere to hook:

- **Primitive tier (the palette)** — raw, context-free values: `--cae-palette-blue-40`, `--cae-size-4`. Few consumers read these directly.
- **Semantic tier (the API)** — role-named tokens that *reference* primitives and are what components actually consume:
  - **Color/surface:** `--cae-color-primary`, `--cae-color-on-primary`, `--cae-surface-base`, `--cae-surface-raised`, `--cae-color-on-surface`, `--cae-color-border`, `--cae-color-error`.
  - **Space/shape:** `--cae-space-1 … --cae-space-6` (a step scale), `--cae-radius-sm/md/lg`, `--cae-elevation-1/2/3`.
  - **Type:** `--cae-font-body`, `--cae-font-heading`, `--cae-line-body`, `--cae-weight-medium`.
  - **Focus/motion:** `--cae-focus-ring` (the a11y-critical focus indicator, Book 16), `--cae-motion-fast`.

Components bind to the **semantic** tier only. The semantic→primitive indirection is what lets light/dark and density re-point a handful of semantic tokens without renaming anything a component references.

### 3.2 The bridge — wiring `--mat-sys-*` to `--cae-*`

The bridge is one direction of authority: **Caelum tokens are the source; Material's system tokens are bound from them.** Concretely, the theme entry point (a) calls `mat.theme()` to stand Material up, then (b) calls `mat.theme-overrides()` mapping each relevant `--mat-sys-*` token to a `var(--cae-*)`. After that, a Material component resolving `var(--mat-sys-surface)` and a built component resolving `var(--cae-surface-base)` land on the *same* computed value, because the former was overridden to read the latter. One edit to `--cae-surface-base` moves both. The alternative — theming Material independently and hoping the two palettes stay in sync by hand — is the drift R4 warns about; the bridge makes sync structural, not vigilant.

### 3.3 Light & dark — re-bind the layer, not the components

Dark mode is a property of the token layer. Two compatible mechanisms (platform note for `light-dark()`):

- **`light-dark()` + `color-scheme`** (Material-native): define each semantic color token as `light-dark(<lightPrimitive>, <darkPrimitive>)` and set `color-scheme: light dark` (or a fixed scheme) on the root. The browser picks the arm; components are unaware.
- **A theme selector** (`:root` vs `:root[data-theme="dark"]` / `.cae-dark`): re-declare the semantic color tokens under a selector. Useful when the app wants an explicit user toggle independent of OS preference, or needs more than two themes.

Either way the components reference the same `var(--cae-color-on-surface)`; only the bridge's definitions change. Parity scenarios snapshot **both** schemes (R4) — a token that looks right in light and breaks contrast in dark is a real defect, caught only by testing both.

### 3.4 Density — the parity lever (R4)

Material defaults to a comfortable density looser than PrimeNG's; closing that gap is the single most-felt piece of parity work, and it is mostly a token job:

- **Material density** is a knob in the `mat.theme()` `density:` map (a 0-to-negative scale that tightens component metrics).
- **Caelum spacing** scales with the same intent: the `--cae-space-*` step scale (and component paddings built from it) shifts with a density setting so built components tighten in lockstep with Material's.

The goal is a *single density setting* that moves Material and built components together toward PrimeNG-equivalent compactness — budgeted explicitly, not assumed free (R4). Density parity is verified on real screens, since per-component metrics don't always tighten uniformly.

### 3.5 RTL & logical properties

Right-to-left is not a token *value* problem — colors and sizes are direction-agnostic — it's a *layout* problem, so it's handled in how components consume space, not in the bridge:

- Built components use **CSS logical properties** (`margin-inline-start`, `padding-inline`, `inset-inline`, `border-start-start-radius`) instead of physical `left`/`right`, so they mirror automatically under `dir="rtl"`.
- The CDK **`bidi`** package (platform note lists it among CDK primitives) provides the `Directionality` service for components whose *behavior* depends on direction (e.g. an overlay's preferred position, a stepper's arrow keys).
- Tokens stay direction-neutral; a `--cae-space-2` is the same magnitude in both directions — the logical property decides which physical edge it lands on.

### 3.6 Theming the gaps — built components read `--cae-*` only

The invariant that makes all of the above hold: **a built component's stylesheet contains no literal design values.** Every color is a `var(--cae-color-*)`, every gap a `var(--cae-space-*)`, every corner a `var(--cae-radius-*)`, every font a `var(--cae-font-*)`. A hardcoded `#fff` or `4px` is a defect, not a style choice — it is a value that *won't* move when the theme, scheme, or density changes, and it is precisely how a "themeable" system silently isn't. This is gateable: a lint/scan for hex colors, raw px, and font literals in component styles is the mechanical backstop behind the token-only invariant (the same shape as Book 03's provenance CI gate — a class of defect made un-mergeable rather than hoped-against).

## 4. Implementation

Illustrative, not necessarily compileable; verify exact Material mixin signatures against the platform note / Material 22 docs.

**The token sheet — the single source of design truth** (semantic tier, light/dark via `light-dark()`):

```scss
// projects/caelum/styles/_tokens.scss  →  the bridge's source of truth
:root {
  color-scheme: light dark;

  // semantic color (each arm references a primitive; light-dark switches them)
  --cae-color-primary:    light-dark(#1565c0, #90caf9);
  --cae-color-on-primary: light-dark(#ffffff, #06243f);
  --cae-surface-base:     light-dark(#ffffff, #121212);
  --cae-surface-raised:   light-dark(#f5f5f5, #1e1e1e);
  --cae-color-on-surface: light-dark(#1a1a1a, #e6e6e6);
  --cae-color-border:     light-dark(#d8d8d8, #3a3a3a);

  // space / shape / type — direction- and scheme-neutral
  --cae-space-2: 8px;  --cae-space-3: 12px;  --cae-space-4: 16px;
  --cae-radius-md: 8px;
  --cae-font-body: Roboto, system-ui, sans-serif;
  --cae-focus-ring: 2px solid var(--cae-color-primary);
}
```

**The bridge — drive Material's system tokens from the Caelum tokens:**

```scss
// projects/caelum/styles/theme.scss
@use '@angular/material' as mat;
@use 'tokens';

html {
  @include mat.theme((
    color: (primary: mat.$azure-palette, theme-type: light),
    typography: Roboto,
    density: -1,                       // tighten toward PrimeNG parity (R4)
  ));

  // bind Material's --mat-sys-* seam to the Caelum source of truth
  @include mat.theme-overrides((
    primary:    var(--cae-color-primary),
    on-primary: var(--cae-color-on-primary),
    surface:    var(--cae-surface-base),
    on-surface: var(--cae-color-on-surface),
    outline:    var(--cae-color-border),
  ));
}
// now <mat-card> and <cae-panel> resolve the SAME surface + outline values.
```

**A built component — reads semantic tokens only (no literals):**

```scss
// projects/caelum/src/lib/panel/panel.scss  →  <cae-panel>
.cae-panel {
  background: var(--cae-surface-raised);
  color: var(--cae-color-on-surface);
  border: 1px solid var(--cae-color-border);
  border-radius: var(--cae-radius-md);
  padding-inline: var(--cae-space-4);   // logical → mirrors under dir="rtl"
  padding-block: var(--cae-space-3);
  font-family: var(--cae-font-body);
}
.cae-panel:focus-visible { outline: var(--cae-focus-ring); }
```

A user toggle that overrides the OS scheme re-binds the layer, not the components:

```scss
:root[data-theme='dark'] { color-scheme: dark; }   // forces the light-dark() dark arm
```

## 5. Bleeding Edge

Tracked in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not hardened here:

- **`light-dark()` browser support.** It's the Material 22 path (platform note), but confirm it sits inside v22's Baseline "widely available" target (platform note) for the consuming team's browser floor before relying on it; the theme-selector fallback (§3.3) covers older targets.
- **CSS `@property`** (typed/animatable custom properties) and **relative color syntax** (`oklch(from … )`) could let the primitive tier *derive* hover/disabled/contrast variants from a base instead of hand-listing them — promising for shrinking the palette, but verify support and Material's stance first.
- **Container queries for density.** Per-region density (a dense table inside a comfortable page) is more naturally a container-query concern than a global `mat.theme()` knob; an opportunity once the data components land (Volume II).

## 6. Gaps & Opportunities

- **PrimeNG-parity *values* aren't specified yet.** This book gives the bridge's *architecture*; the actual palette/spacing/density numbers that make Caelum read like the team's PrimeNG theme are real design work (R4), deferred to the M0-3 token-bridge slice and a future deep-dive once Forge has screens to tune against.
- **The no-literal lint isn't written.** §3.6 describes the gate; implementing the hex/px/font scan (and its allowlist for genuinely static values) is an M0 slice, not yet built.
- **Elevation/shadow parity** across light and dark is thin everywhere — Material elevation is opacity-overlay-based in dark, PrimeNG uses shadows; reconciling them under one `--cae-elevation-*` token is an open question flagged for the layout/panel work (Book 11).
- **Token documentation surface.** A published, browsable token reference (what each `--cae-*` means, its light/dark values) is part of distribution (Book 19); until then the token sheet itself is the doc.

## 7. AI & Claude Code Integration

- **High leverage:** generating the token sheet and the `mat.theme-overrides()` bridge map from a palette spec; mechanically converting a built component's hardcoded values to `var(--cae-*)` references; writing the no-literal lint rule and its tests; producing light/dark snapshot test scaffolding.
- **~1× (bring judgment):** the *values* — which blue, how tight the density, whether dark-mode contrast clears WCAG (Book 16) — are design judgment verified by eye and by axe under both schemes, not lookup. And the seam mapping (`--mat-sys-*` ↔ `--cae-*`) must be checked against the **actual** Material 22 token names (platform note flags that exact mixin/token surfaces are frontier) — a confidently-wrong system-token name renders nothing and fails silently, the same trap Book 01 §3.2 warns about for change detection.

## 8. Exercises & Further Reading

**Exercises:**

1. Stand up the token sheet (§4) and the bridge; render a `<mat-card>` beside a `<cae-panel>` and prove — with computed styles, not eyeballing — that both resolve the same surface and border values.
2. Add dark mode two ways: once via `light-dark()` + `color-scheme`, once via a `[data-theme="dark"]` selector. Snapshot a screen in both schemes and confirm no component stylesheet changed.
3. Set `density: -1` (and scale `--cae-space-*` to match); measure a Material control and a built control before/after and argue whether they tightened in lockstep (R4).
4. Flip a sample component to `dir="rtl"`; show that logical properties mirrored it with zero token changes, and find one place a physical `left`/`right` would have broken.
5. Plant a hardcoded `#fff` and a raw `12px` in a built component; sketch the lint rule from §3.6 that would fail CI on both.

**Further reading (external — verify currency against the platform note):**

- Angular Material theming guide — https://github.com/angular/components/blob/main/guides/theming.md
- CSS custom properties — https://developer.mozilla.org/en-US/docs/Web/CSS/--*
- `light-dark()` — https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark
- CSS logical properties — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values
- CDK bidirectionality — https://material.angular.io/cdk/bidi/overview

**In-library:** `Book 01 §3.3` (the DI-for-behavior / tokens-for-design split this book completes) and `Book 01 §3.4` (the two render paths the bridge unifies); `docs/ARCHITECTURE.md` D-04 + the token-only invariant (§2) + the theming-bridge subsystem (§3.1); the focus-ring token serves the a11y parity of Book 16, and light/dark + density parity are snapshot-tested per Book 17; the layout/panel components that lean hardest on elevation tokens are Book 11; the Material 22 theming specifics are sourced in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md).

---

*Conventions: one semantic `--cae-*` token set is the single source of design truth; Material's `--mat-sys-*` is bound from it, never themed in parallel; built components read semantic tokens only — a hardcoded color/space/radius/font is a defect; light/dark, density, and RTL are token-layer operations, not component changes; parity is budgeted, verified under both schemes; version-specific Material APIs are grounded in the `research/` layer.*
