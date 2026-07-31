# Exemplar Gallery — worked examples of the canon

Rules constrain; examples calibrate. This gallery is the canon *executed*: six complete screens across four registers — two ORRERY (composed from a shared token + primitive layer exactly as `ui-library-contract.md` prescribes), one HALCYON, one ORDINATE, and two SEXTANT (mobile, Jetpack Compose) — each carrying its Pass-1 design plan in its header. When building a surface, imitate the anatomy here — don't re-derive it from the prose. When reviewing, the goldens are the concrete anchor for "what passing looks like."

> **Provenance:** authored by the Fable model (2026-07 design sessions), canonicalized per the ledgers below (D-137, #141; registers expanded by #149; mobile register by #250). The drafts' self-violations were *kept as ledger entries* — each fix is a worked DO/DON'T pair.

## The screens

| File | What it demonstrates |
|---|---|
| [ops-console.jsx](ops-console.jsx) | The register's anatomy: corner-bracketed panels, amber/cyan semantic duotone, mono-everything-data, a live signature element (the orbital plot + radar sweep), something alive on every panel (clock, drifting telemetry, appending log). |
| [scenario-builder.jsx](scenario-builder.jsx) | Self-teaching patterns 1–9 (`design-craft.md § Self-teaching UI patterns`): config-as-a-sentence, recommended bands, consequence previews, a plot that judges itself, presets that flash what they changed, impact tags + fearless reset, plain-language search, choice cards, a gate that explains itself. |
| [tokens.js](tokens.js) · [primitives.jsx](primitives.jsx) | The portable taste layer: single-source tokens; primitives that own their states and a11y internally, per the library contract. (ORRERY screens above.) |
| [editor-register/scene-editor.jsx](editor-register/scene-editor.jsx) | **HALCYON.** The editor-chrome anatomy: docked panels (tree \| viewport \| inspector) + sequencer strip, one selection on four surfaces, channel-color discipline, one time spine (every count derived at render time), bright scene inside quiet chrome. Own `tokens.js` in its dir. |
| [analysis-register/run-comparison.jsx](analysis-register/run-comparison.jsx) | **ORDINATE.** The analysis anatomy: finding-as-a-lede, chart-as-hero with the pilot bar drawn on the plot and a verdict chip, uncertainty as texture (bands / dashed / hollow marks with real binomial CIs), interlocking numbers throughout, gates that explain disabled actions, static honesty (stamped frozen dataset). Own `tokens.js` in its dir. |
| [mobile-register/fleet-companion.kt](mobile-register/fleet-companion.kt) | **SEXTANT** (portrait app, both themes). The handheld anatomy: pass-horizon arc as hero instrument, command tray docked above the M3 nav bar (one-thumb law), battery strip with a verdict chip, disabled-with-reason in the thumb zone, every repeated value derived from one fleet dataset (Gate C′ by construction). |
| [mobile-register/storm-hud.kt](mobile-register/storm-hud.kt) | **SEXTANT** (landscape game HUD, scene-driven dark). Corner clusters inside the safe rect, gust-ring signature around the speed readout, dark under-halos on every scene-riding glyph, deterministic Canvas scene (seeded rain, nested perspective gates). |
| [mobile-register/tokens.kt](mobile-register/tokens.kt) · [mobile-register/primitives.kt](mobile-register/primitives.kt) | The portable taste layer in Kotlin: single token home (scene palette included) mapped into an M3 `ColorScheme`; primitives for eyebrows, diamond pips, corner brackets, halo text. [mobile-register/capture/SextantGoldensTest.kt](mobile-register/capture/SextantGoldensTest.kt) is the executable capture spec (the JVM-offscreen recipe's worked example). |

## Canonicalization ledger — ORRERY gallery (D-137, #141)

Each row is a self-violation in the shipped Fable drafts, fixed here — cite the rule, not the fix, when reviewing:

| # | Shipped draft | Canonical | Rule |
|---|---|---|---|
| 1 | `TrackRow` set `outline: none` and hand-rolled focus via JS; nav modes were `<span>`s — not keyboard-reachable | CSS `:focus-visible` rings; nav tabs are real `<button>`s with `aria-current` | `frameworks.md § React` mandatory `:focus-visible` states + semantic HTML |
| 2 | `CmdButton` hover via `onMouseEnter` React state | interactive states live in the stylesheet, inside the primitive | `ui-library-contract.md § Component API contract` (states built in) |
| 3 | `primary` / `danger` boolean props; disabled Run button hand-rolled its reason into a raw `<button>` | `variant="primary\|quiet\|danger"` + `disabledReason` renders the why | contract: variants not boolean soup; disabled-with-reason |
| 4 | `Math.random()` jitter, `Date.now()`-phased waves | `mulberry32(0x5eed)` + phase accumulators; only the clock stays real (it *is* the alive element) | `frameworks.md § React` seeded PRNG for generated data |
| 5 | Focus ring color varied (cyan inset here, amber thumb there) | one amber ring everywhere — amber = attention | one concept, one name (contract); `house-style.md` semantics |
| 6 | Preset flash diffed four fields with four hand-written `if`s | config is one object; the diff is generic | laziest sufficient code (`CLAUDE.md › Working style`) |
| 7 | Both drafts' fixed-column grids overflowed at 375px | media-query stack under 900px / 760px | "holds at 375px is part of done" (`design-craft.md § Craft rules`) |
| 8 | Tokens, `GlobalStyle`, `Eyebrow` duplicated per file | shared `tokens.js` + `primitives.jsx` | contract § Prime directive: taste lives in the components |
| 9 | Builder's font stacks had no fallbacks | `tokens.js` stacks degrade gracefully | craft: the register must survive an offline render |
| 10 | `role="listbox"` wrapping `<button>`s (invalid ARIA); silent gauges | plain container + `aria-pressed` rows; gauges carry `role="img"` labels | contract: accessibility is internal |

## Canonicalization ledger — editor register (#149)

Derived from the frozen register-game-engine collection in the template's optional banked-generation content (VANTAGE / CADENCE / LATTICE specimens + shots), re-derived deliberately under the canon. Rows 1–6 are self-violations found in the frozen drafts, fixed in `editor-register/scene-editor.jsx` under a named rule; rows 7–12 are anatomy deliberately carried (the rule column carries the why):

| # | Banked draft (frozen) | Canonical | Rule |
|---|---|---|---|
| 1 | VANTAGE wrapped its whole viewport `div` in `role="img"` — with the Perspective/Lit/grid *buttons* inside it, making interactive descendants presentational and unreachable | `role="img"` sits on the SVG only; overlay chips are sibling elements, real buttons | contract: accessibility is internal; `frameworks.md § React` semantic HTML (same family as ORRERY ledger #10) |
| 2 | LATTICE's node cards are `div role="button" tabIndex=0` with hand-rolled key handling, and its mobile graph is a `role="img"` SVG containing click-only `<rect>`s — mouse-only affordances | nothing interactive lives inside any `role="img"`; every actionable element (tabs, tools, transport, tree eyes, scrubber) is a real `<button>` or a keyboard-handled ARIA slider/treeitem | `frameworks.md § React` "button for actions" + mandatory `:focus-visible` states; `design-craft.md § Self-critique` item 7 |
| 3 | raw hex scattered outside the token home: VANTAGE repeats its axis hex in 4+ places (gizmo JS, axis widget, CSS spines) plus JS badge/kind maps; CADENCE has loose grays in CSS; LATTICE inlines its tint hex twice | one `tokens.js` is the single home — zero raw hex in the screen file, and even translucency routes through an `alpha(token)` helper | `ui-library-contract.md § Token law` (single source; lint-enforceable) |
| 4 | VANTAGE ships transitions/animations with no `prefers-reduced-motion` handling; CADENCE's pulsing record dot ignores it (LATTICE guards only its two named animations) | one global reduced-motion kill switch covering all animation and transitions | `design-craft.md § Craft rules` — Motion ("prefers-reduced-motion respected") |
| 5 | VANTAGE relies on the mono face alone for numeral alignment — `font-variant-numeric` appears nowhere | `tabular-nums` declared at the root so every live/columnar numeral is tabular regardless of face (CADENCE did this right; carried from it) | `design-craft.md § Craft rules` — Typography (tabular numerals for ALL data) |
| 6 | CADENCE forks mobile/desktop into two DOM trees via a `window.innerWidth` resize listener — double-maintained markup, first-paint flash at the boundary | one render tree; the 375px re-architecture (viewport → scrub deck → tree → inspector) happens entirely in the stylesheet | craft: "responsive to 375px is part of done" via genuine re-architecture; laziest sufficient code — stylesheet-only where markup permits (a JS width fork earns its keep only where CSS can't express the change, e.g. re-parameterized SVG geometry or a table→cards swap, and must set its initial state synchronously — no first-paint flash; `run-comparison.jsx` is the worked example of the earned kind) |
| 7 | all three specimens independently converge on graphite ramps + ONE warm accent + fixed-meaning functional hue families (RGB axes, type badges, typed ports, judgment states) | carried as the register's core; the semantic why: editor chrome must recede behind arbitrary scene content, and with every cool channel claimed by a functional family, warm is the only accent that can never be read as data | `house-style.md § HALCYON` (incl. the periwinkle→warm supersede noted there); semantic accents never decorative |
| 8 | VANTAGE's "one selection, four surfaces": tree row, viewport outline + gizmo, inspector header, status segment all carry the same object, same numbers | carried — and hardened by construction: the exemplar's inspector floats, status coords, viewport gizmo and timeline keys all evaluate from one key dataset | what makes an editor read as one tool; blind judging fact-checks exactly this cross-surface coherence |
| 9 | CADENCE's one time spine: a single frame→pixel mapping drives dual-unit ruler, event flags, lanes; every count derived at render time so f↔s and key totals cannot disagree | carried — 240 f ↔ 8.000 s, F132 ↔ 4.400 s, `24 keys · 2 ev` summed from the track arrays | copy is design material; derived-not-duplicated numbers survive the gate's arithmetic checks (Gate C′) |
| 10 | CADENCE spends one hue on two meanings: red is both the playhead and record-arm | split deliberately: playhead = bright-ink spine + amber frame flag (attention), red reserved for record/destructive | one concept, one name (contract); semantic accents used semantically |
| 11 | VANTAGE/LATTICE status bar as truth strip: mirrors the newest console line, carries perf/cost segments repeated from one source | carried — status mirrors a real cook warning about an object that exists in the tree, and ms ↔ fps converts on every tick of the live (seeded) perf readout | anatomy of the register; "something alive" — a frozen perf counter reads as a hung editor |
| 12 | CADENCE's keyframe glyph language: diamond keys, hollow diamonds for group/summary unions, channel dots on the rail | carried, plus channel-color discipline extended: X/Y/Z channel rows tint dot *and* keys with the axis hue, so the channel is legible with no legend | register rule: channel-color discipline; axis semantics sacred |

## Canonicalization ledger — analysis register (#149)

Derived from the #149 frozen collections — EXP-04's PARALLAX specimens (t03 primary inspiration; t14 conventional reference; t06/t15 over-dressed cautionaries) and EXP-05's STRATA specimens — with the blind-judging record over both. Rows 1–8 are defect patterns seen there, closed in `analysis-register/run-comparison.jsx` under a named rule; rows 9–12 are anatomy deliberately carried:

| # | Frozen collections | Canonical | Rule |
|---|---|---|---|
| 1 | Over-dressed analysis takes set letterspaced all-caps micro-mono on section titles, column headers, and data labels — judges docked "dense all-caps mono" and "flattened hierarchy" in every duel they lost | Uppercase survives only on the wordmark; titles, headers, legends, and buttons are mixed-case body type; only data is mono | `house-style.md § ORDINATE` mixed-case rule (grown from the derate paragraph); `design-craft.md § Craft rules` uppercase-only-for-labels |
| 2 | Same takes crammed the loss chart into a mid-column panel with chrome rails competing on both sides — "cramped chart", "near-illegible small mono" dockings | The eval chart owns the widest column at reading sizes; hairline panels, hierarchy by ink; run detail is one quiet rail | `house-style.md § ORDINATE` chart-as-the-hero |
| 3 | Low-contrast dim values on dark surfaces drew the hardest dockings ("low-contrast micro-type", "dim low-contrast captions") | `muted` re-derived to hold ≥4.5:1 on surfaces; `faint` is chrome/de-emphasis-only by token law and never the *sole* carrier of text users must read (a `faint` disabled label always has its reason repeated in `muted`) | `design-craft.md § Craft rules` body contrast ≥4.5:1; ORDINATE token comment makes the floor structural |
| 4 | Baseline dashboards shipped arithmetic impossibilities (totals physically impossible for the elapsed time; the same metric stated two ways in two panels) — recomputing judges punished each one | Header totals, status counts, deltas, real-check percentages, and CI whiskers are computed from the single run-data object, so repeated values cannot disagree | `house-style.md § ORDINATE` numbers-interlock rule; Gate C′ |
| 5 | A time-of-day incoherence class: "burned tonight" beside an afternoon clock; live-feel dressing on frozen data | No clock, no fake liveness: the dataset is stamped with a provenance footer; nothing drifts | `house-style.md § ORDINATE` static honesty (the "something alive" rule is scoped to monitoring surfaces) |
| 6 | Curves rendered as uniform solid lines; uncertainty asserted in prose, if at all | Uncertainty as texture: seed-spread bands, dashed line + hollow endpoint for the still-training run, hollow diamonds with n-derived 95% whiskers for real-cell checks; the subtitle decodes the texture | `design-craft.md § Self-teaching UI patterns` 11 (uncertainty as texture) |
| 7 | Winning drafts' recommendations sometimes contradicted their own on-screen evidence | The promote decision is gated visibly: gates judged in place per run; every blocked button names its blocking gate; the one enabled action is the one the gates permit | `design-craft.md § Self-teaching UI patterns` 4 & 9; `ui-library-contract.md` disabled-with-reason |
| 8 | Drafts finished at a capture cap shipped unverified fixes — clipped captions and label collisions survived to judging | Render-review loop ran to a clean pass: fold overflow, endpoint-label/whisker collisions, and an incumbent-label/curve collision were caught in pixels, fixed in code, and the final fix re-captured before the goldens were copied | `design_review` gate discipline: fix, don't annotate; verify with pixels, not intent |
| 9 | **(carried)** The strongest PARALLAX draft's plain-language per-run diagnosis beside status — judges credited it in every duel it fought | Kept as the status substatus line: "fast but rough — fails collision ceiling" | `design-craft.md § Craft rules` copy: written from the user's side, domain vernacular |
| 10 | **(carried)** Its config-diff idiom: strikethrough old → accent new, plus an "N unchanged parameters" line — credited twice in blind judging | Kept in the detail rail, with the unchanged-count computed | `design-craft.md § Self-teaching UI patterns` 5 (diffs teach the parameter space) |
| 11 | **(carried)** The exemplar arm's finding-as-a-sentence lede with visually marked values — the anchor judges quoted back in rationales | Kept and promoted to a register rule: the screen opens with the finding, marked values in mono | `house-style.md § ORDINATE` open-with-the-finding; kin to `design-craft.md` pattern 1 |
| 12 | **(carried)** The ceiling's methodological self-narration — stated n's, CI method, blanks-with-a-why — the only quality the exemplar arm never beat it on | Kept as structure: provenance footer (suite, n, CI method), on-chart mechanism annotations | `house-style.md § ORDINATE` uncertainty-is-rendered + every-chart-teaches-its-reading |

## Canonicalization ledger — mobile register (#250)

Authored fresh under the canon (no frozen collection behind it), so this ledger records what the render→review loop caught and the deliberate calls a reviewer needs — same citation discipline: cite the rule, not the fix:

| # | First render | Canonical | Rule |
|---|---|---|---|
| 1 | The wind-hold alert — the screen's one actionable card — rendered below the fold, invisible in the golden | the alert docks as a **command tray above the nav bar**: attention and its actions pinned in the thumb zone, the list scrolls behind it | SEXTANT one-thumb law (`house-style.md`); design-craft pattern 9 is worthless below the fold |
| 2 | `HOLD FLEET` wrapped to two lines at 360dp | equal-weighted buttons, tighter content padding, `maxLines = 1` | "holds at the compact floor is part of done" (the 375px rule's mobile analog) |
| 3 | Track gates rendered near-equal in size, the farthest grazing the horizon | sharper perspective falloff; invariants verified by calculation — gate tops 0.71/0.67/0.64h all below the 0.62h horizon, widths strictly decreasing | `design_review` geometry pre-gate (canvas-idiom surfaces) |
| 4 | Corner brackets sub-legible at phone hairline weight | 34px arms / 3.5px stroke — and the motif survives **only on the hero instrument panel** | SEXTANT shape rule; a motif nobody can see is decoration debt |
| 5 | *(deliberate)* goldens' scroll fold cuts a list row mid-height | kept — the fold is the native scroll affordance, not a clip defect; the six-drone interlock stays verifiable via the battery strip's six marks | folds are stated, never passed off as complete compositions |
| 6 | *(deliberate)* SQUALL ships dark-only; BOSUN ships both themes | scene-driven game surfaces don't theme; phone apps must | SEXTANT both-themes rule; the exception is named, not silent |
| 7 | *(deliberate)* liveness is frozen data (`pkt 00:03`) — Paparazzi renders one frame | on-device, the monitoring-surface "something alive" rule stands; the exemplar carries the hook as copy, not animation | static-capture honesty; `CAPTURE_CONTRACT.md` determinism item |
| 8 | *(limit)* game **feel** — motion, timing, touch response — is invisible in stills | the golden gates composition, readability, and safe-area discipline only; feel stays human-playtested | stated in `storm-hud.kt`'s header and `house-style.md § SEXTANT` |
| 9 | a "stray line" appeared under the banner in the downscaled preview | pixel-probed: gradient dither in the 1000px-capped image, no defect — bucket-scan showed deviations only at the canyon walls | verify with pixels; when pixels mislead, verify the pixels |

## Rendering the exemplars

Any vite + react scratch project renders them: `npm create vite@latest -- --template react`, drop this directory in `src/`, mount a screen in `App.jsx`. The screens are self-contained ESM (fonts load from Google Fonts with local fallbacks; no other network dependency, no chart library — all visualization is hand-rolled SVG per the canon).

In-repo, the register subdirs ship capture-ready `specimens/` shims for the bundled harness. From the repo root (`CAPTURE_SPECIMENS` resolves against cwd):

```
CAPTURE_SPECIMENS=.claude/skills/design_review/references/exemplars/editor-register/specimens \
  node scripts/capture_ui/capture.mjs out/
```

regenerates a register's goldens (bootstrap: `scripts/capture_ui/README.md` — a code span, not a link, per #196).

The mobile register renders through the JVM-offscreen path instead — no browser, no emulator: an Android library module with the exemplar sources in its main source set and `capture/SextantGoldensTest.kt` in its test source set, then `gradle recordPaparazziDebug` writes every golden to `src/test/snapshots/images/`. Full recipe (toolchain bootstrap, version matrix, font downloads, caveats): `CAPTURE_CONTRACT.md` › JVM-offscreen Android (Compose).

## Goldens

`golden/*.png` — web screens at 1280×800 (viewport) and 375w (full page), captured headless (Chromium, ~1s settle, animations live); mobile screens at 412dp and 360dp portrait × both themes plus 915×412dp landscape, rendered single-frame by Paparazzi (report-writer capped at ~1000px long-edge — anchor grade, which is what goldens are). They are **reference anchors** for reviewers and agents — *what passing looks like* — not pixel-compare oracles: the telemetry is seeded but any live clock is real, so byte-identity is not expected (`PROJECT_CONVENTIONS.md › Validation machines` golden policy: environment-specific oracles compare like-for-like only). The #149-era and #250-era pairs (`scene-editor-*`, `run-comparison-*`, `fleet-companion-*`, `storm-hud-*`) render fictional *product* wordmarks (CAPSTAN, GANTRY; BOSUN, SQUALL), never register names — the #183 fork-and-own caveat applies only to the original ORRERY screens' pairs.
