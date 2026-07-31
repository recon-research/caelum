# Framework Execution Notes

The canon in `ui-library-contract.md` and `design-craft.md` is framework-agnostic; this file is the per-framework execution appendix. Add a mapping here when a downstream stack demands one — through the template (inbox lane), not a local edit, since this file syncs wholesale to every downstream project.

*Distilled from Fable-model design sessions, 2026-07 (D-137).*

---

## React

- Tokens live in ONE place (a `T` object or CSS variables) referenced everywhere; never scatter hex values.
- File structure of every build: (1) tokens, (2) global style/keyframes, (3) primitives, (4) app. This makes taste portable — lift sections 1–3 into any project.
- Mandatory states for anything interactive or data-bound: hover, focus-visible (visible ring; never remove outline without replacing), active, disabled-with-reason, loading, empty (inviting an action), error (what happened + how to fix).
- Semantic HTML: `button` for actions, `a` for navigation, ordered headings, labeled inputs, `aria-label` on icon buttons and SVG charts (`role="img"` + description).
- If a className exceeds ~12 utilities, extract a component. Prefer composition over prop-flag explosions.
- Live-feel implementation: setInterval-driven state for ticking values (clean up in useEffect), seeded PRNG (e.g. mulberry32) for reproducible generated data, SVG for all bespoke visualization (orbits, contours, projections, cluster fields) — no chart library needed for signature visuals.
- **Pixel capture ships wired:** `scripts/capture_ui/` (#150 — bootstrap in its README; a code span, not a link, so non-React downstreams can take design_review without the React harness, #196) renders specimens to the design_review geometries via vite + playwright — the template's default so gate mode gets real pixels, not degraded/manual. A specimen is a `.jsx` composing the real component with real copy (Pass-1 discipline); `configure_project` fills the capture knob with it.
- **Sandboxed preview environments (artifacts):**
  - In sandboxed/artifact environments prefer inline styles from the token object over arbitrary-value Tailwind classes, which may not compile.
  - No localStorage in artifacts; state in memory.

## Angular (signal-first, v21/22)

- The same component contract maps to standalone components with signal inputs.
- The schema-driven `Field` maps naturally onto Signal Forms.
- Component docs ship as agent skills, exactly as in React.
- Tokens live as a `T` module or CSS custom properties — the same single-source-of-truth rule as React.
- Everything else in the contract carries over unchanged: variants over boolean soup, states built in internally (never bolted on), accessibility owned by the component, data components taking data rather than markup.
- **Capture harness is React-only; the recipe is not:** `scripts/capture_ui/` targets a vite/React root. An Angular downstream builds its own command against the capture contract's browser recipe ([`CAPTURE_CONTRACT.md`](../CAPTURE_CONTRACT.md) — Angular's esbuild dev server + the same playwright loop; #202, D-217). A *shipped* Angular harness stays demand-gated: build the recipe first, and if it wasn't enough, say so in a sync report.

Mandatory states, semantic HTML, and focus rules in `design-craft.md` § Craft rules apply identically.

## Qt / PySide6 (desktop; signal-first via signals/slots)

Desktop downstreams (PySide6/Qt6) report the craft rules transfer intact; only the *execution* re-derives. These notes are grounded in Qt6 documentation, **not** verified against a running capture rig — the template repo has no Qt renderer, so treat the idioms as sound and the pixel outcomes as unverified; version-sensitive bits are marked.

- **Tokens — one Python module, injected; never scatter hex.** The `T` object becomes a token module (a dict or dataclass) referenced everywhere — the same single-source rule as React. Qt styles through two layers: **QPalette** (semantic color roles the native style consults) and **QSS** (CSS-like stylesheets). Keep both token-derived — a QSS *template* string with `{ink}`/`{surface}` placeholders filled from the module, and QPalette roles set from that same module. **Sanctioned homes for a literal color:** the token module, the QSS template that reads it, the QPalette setup that reads it — nowhere else. A raw hex in a widget's inline `setStyleSheet("color:#…")` is the Qt equivalent of scattered hex, and banned.
- **When a base stylesheet owns the chrome** (e.g. qdarkstyle — a legitimately single-theme, dark-only base): layer your token-derived QSS *after* it (`app.setStyleSheet(base + tokens_qss)`), overriding only the semantic accents and the surfaces you own. Don't fork the base theme's hex to re-skin it — that scatters the token law across a vendored file. Single-theme is a legitimate desktop reality; the surface themes only if the app ships more than one.
- **Mandatory states via QSS pseudo-states:** `:hover`, `:focus`, `:pressed`, `:disabled`, `:checked` map directly onto the mandatory-states list. **focus-visible:** QSS `:focus` fires for both mouse and keyboard; for a keyboard-only ring, gate on the focus reason (`focusInEvent` → `event.reason()`; `Qt.TabFocusReason` vs `Qt.MouseFocusReason`). If you kill the default focus rectangle (`outline:none`), replace it with a visible border — never remove it. **disabled-with-reason:** `:disabled` paints the state; the *why* goes in a `setToolTip` or an adjacent label — Qt has no native "explain the disable," so the rule still lands, manually.
- **Tabular numerals** on all live/columnar data: set the mono token family on data-bearing widgets, or on a proportional face enable `tnum` via `QFont.setFeature("tnum")` — **Qt 6.7+ only**; on earlier Qt, use a monospace family for every live/aligned numeral. Same gate as the web "tabular numerals" rule.
- **"Something alive" without a JS event loop → `QTimer`.** A `QTimer` parented to the widget (so it dies with its parent — Qt ownership replaces React's `useEffect` cleanup), `timeout` → a slot that advances the ticking clock / drifting telemetry / appending log. Seeded reproducible data: `random.Random(seed)`. Bespoke visualization (orbits, contours, sparklines): a custom `paintEvent` with `QPainter`, or Qt Quick shapes — no chart library needed for signature visuals, same as SVG on the web.
- **Semantics & accessibility:** the right widget for the job (`QPushButton` for actions, not a clickable `QLabel`); `setAccessibleName` / `setAccessibleDescription` on icon-only buttons and custom-painted charts — the Qt analogue of `aria-label` + `role="img"` on an SVG.

## Jetpack Compose (Android; phones — apps and game HUDs)

Grounded AND pixel-verified: the SEXTANT exemplars (`exemplars/mobile-register/`) render through the JVM-offscreen recipe in [`CAPTURE_CONTRACT.md`](../CAPTURE_CONTRACT.md) (#250) — unlike the Qt notes above, these idioms shipped through a real capture rig.

- **Tokens — one `tokens.kt`, injected via CompositionLocal.** A data class per theme (`SxColors`-style) + `staticCompositionLocalOf`; zero raw `Color(0x…)` outside the token home, scene/content palettes included (the `SxScene` precedent). **Map the tokens into an M3 `ColorScheme`** (primary = the command accent, secondary = telemetry, tertiary = nominal, error = threat) and wrap screens in `MaterialTheme(colorScheme = …)` — Material components then inherit the register instead of fighting it.
- **Platform anatomy is the register's frame, not its enemy:** `Scaffold` + `NavigationBar`, edge-to-edge with `WindowInsets.safeDrawing` routed everywhere. One-thumb law: ≥48dp targets, 56dp rows, primary action in the bottom third — dock the actionable card above the nav bar (never below the fold) rather than letting it sink in a scroll column. Shape rule: rounded (12dp) where the thumb lands, square where data lives.
- **Mandatory states** map to M3 color params (`disabledContentColor` etc.); **disabled-with-reason** is manual, same as Qt: the disabled state paints, the *why* renders as an adjacent `muted` line (never `faint` alone).
- **Type:** app body stays the platform's own face (Roboto) — identity comes from the display face, the mono, and the tokens; mono + `fontFeatureSettings = "tnum"` on every live/columnar numeral. Bundle OFL font TTFs as `res/font` downloads, not committed binaries.
- **Live-feel:** `rememberInfiniteTransition` / `LaunchedEffect` tickers with seeded data; respect the system animator-duration-scale (the platform's reduced-motion). Bespoke instruments (arcs, rings, pips, scenes) are `Canvas` draws from tokens — no chart library.
- **Accessibility:** real clickable components for actions; `Modifier.semantics { contentDescription = … }` on icon-only buttons and `Canvas` instruments — the Compose analogue of `aria-label` + `role="img"`.
- **Game HUDs:** full-bleed `Canvas` scene + corner-anchored clusters inside the safe rect (cutouts and corner radii are real on device even when the capture rig draws none); every HUD glyph carries a dark under-halo (`Shadow`) so it reads on any scene. Feel (motion, timing, touch) is not judgeable from stills — the gate covers composition, readability, and safe-area discipline; feel stays human-playtested.
- **Capture ships as a recipe with a worked example**, not a wired harness: `exemplars/mobile-register/capture/SextantGoldensTest.kt` + the JVM-offscreen family in `CAPTURE_CONTRACT.md`.
