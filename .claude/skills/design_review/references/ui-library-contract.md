# The Agent-First UI Library Contract

This is the contract for a component library whose primary consumer is an AI coding agent — built so off-brand, low-quality UI is impossible to *express*, not merely discouraged. Taste lives in the components, not in each generation.

Adopt this contract the moment the project grows its first user-visible surface. Record the adoption — and the concrete paths chosen — in `PROJECT_CONVENTIONS.md` › Design surfaces.

*Distilled from Fable-model design sessions, 2026-07 (D-137).*

---

## Prime directive

**Compose screens ONLY from library primitives and tokens.** Never write a raw `<button>`, ad-hoc panel div, one-off hex color, or inline font stack in app code. If a needed component doesn't exist, that is a signal to add a primitive to the library (with docs and states), not to inline a special case. Taste lives in the components, not in each generation.

## Recommended layout

The library uses this shape by default:

```
/tokens        design tokens: color, type, space, motion (single source of truth)
/primitives    Panel, Button, Readout, Field, BandSlider, VerdictChip, ...
/patterns      composed patterns: ConfigSection, TrackList, PlotCard, SentenceBar
/docs          one .md per component — the agent-facing usage contracts
/screens       application screens (compose primitives/patterns only)
DESIGN.md      the house design system (aesthetic rules, banned defaults)
```

Read `DESIGN.md` and the relevant `/docs/*.md` before building any screen. `/docs` is the contract; source code is the implementation detail.

The actual paths are the project's call — record them in `PROJECT_CONVENTIONS.md`. The roles above are not negotiable; the paths are.

## Token law

- All color, spacing, radius, type, and motion values come from `/tokens`. Zero raw hex/px literals in components or screens (lint enforces this).
- The palette is small and semantic. The default palette and its semantic roles live in `house-style.md`. Semantic colors are never used decoratively.
- Needing a color outside the tokens means the design is wrong or the tokens need a deliberate, reviewed addition. Say which.

## Component API contract

Agents thrive on predictability. Every primitive follows the same conventions so generation is mechanical:

- **Variants, not boolean soup.** `variant="primary" | "quiet" | "danger"`, `size="sm" | "md"`. Never `isPrimary`, `isBig`, `isOutlined` combinations that can contradict.
- **No escape hatches in app code.** Primitives do not accept `style` or `className` passthrough from screens. Layout composition uses `Stack`, `Grid`, `Cluster` layout primitives with token-keyed `gap`/`pad` props.
- **Same prop names everywhere.** `label`, `value`, `onChange`, `disabled`, `loading`, `tone` mean the same thing in every component. One concept, one name, forever.
- **States are built in, never bolted on.** Every interactive primitive ships hover, focus-visible, active, disabled-with-reason (`disabledReason` prop renders the why), loading, and error states internally. Screens cannot ship a stateless button because none exists.
- **Accessibility is internal.** Primitives own their ARIA, keyboard handling, and focus rings. Screens get it for free.
- **Data components take data, not markup.** `<TrackList tracks={...}>` not hand-built rows — so density, alignment, and tabular numerals stay uniform.

## Self-teaching pattern components

These encode the house UX philosophy — a user must be able to start blind and learn by using:

- `Field` — label + plain-language help + impact tag (`results | perf | cosmetic`) + live `consequence` line (written as an outcome: "fast movers may teleport", not a definition) + auto "↺ back to recommended" when off-default.
- `BandSlider` — shaded recommended band, notch at the recommendation; out-of-band is a tradeoff, never an error.
- `ChoiceCards` — options carry a layman "when to use this" line; no jargon dropdowns.
- `PlotCard` — charts draw their healthy zone ON the plot with the label inside it, plus a `VerdictChip` (LOOKS RIGHT / WASTEFUL / NOT TRUSTWORTHY) with one sentence of why.
- `SentenceBar` — the whole config rendered as one live plain-language sentence; field metadata makes this generable automatically.
- `PresetRow` — applying a preset flash-highlights exactly the fields it changed.
- Field definitions are **structured data** (label, help, band, recommendation, consequence function, impact, synonyms). This schema is dual-use: it renders the self-teaching UI *and* grounds any LLM filling configs from natural language — out-of-band values flag, verdicts audit the model, flash-highlights show humans what the AI set. AI-originated values render in the amber channel until human-confirmed.

The UX philosophy these encode is `design-craft.md` § Self-teaching UI patterns.

## Docs format — agents learn from examples

Every component doc is ≤ 40 lines in this exact shape:

```
# BandSlider
One sentence: what it is and when to reach for it.

## Props (table: name, type, required, meaning)

## DO
<Field ...><BandSlider value={tick} min={1} max={60} bandLo={12} bandHi={30} rec={20} onChange={setTick}/></Field>

## DON'T
<input type="range" .../>            // raw control: no band, no a11y
<BandSlider style={{width: 300}}/>   // no style prop exists; use layout primitives

## Pairs with
Field, VerdictChip
```

DO/DON'T pairs are mandatory — they are the highest-leverage lines in the repo for generation quality.

## Screen-building procedure

1. Read `DESIGN.md` + docs for the components you'll use.
2. Plan before code: subject, which patterns/primitives, what the screen's signature element is, the copy. State the plan briefly.
3. Compose from primitives only. Real copy from the domain — never lorem ipsum.
4. **Verify:** run it, screenshot at desktop and 375px, and check against the review gate below. Fix, don't annotate.

## Review gate

Every screen must pass the design_review gate before presenting (see `../SKILL.md`).

The gate's checks assume this contract is in force — a library without it fails structurally, not cosmetically.

## Extending the library

New primitive checklist: token-only styling · full state set · a11y internal · doc with DO/DON'T · added to the pattern list above if it embodies a UX rule. A primitive without docs does not exist as far as generation is concerned.

## Framework portability

Framework mappings (React, Angular signal-first) live in `frameworks.md`; the library IS the design system — the framework underneath is an implementation detail.
