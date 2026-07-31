# Design Craft — the universal canon

This is the framework-agnostic design canon: the taste and process every user-visible surface is built against, and the standard it is reviewed against afterward. The `design_review` skill loads it in both of its moments — build mode, where Pass 1/Pass 2 below run before any code exists, and gate mode, where the banned-defaults list and craft rules audit a finished surface. It captures judgment, not boilerplate — the target is a screen that could not be mistaken for a templated default.

> **Provenance:** distilled from Fable-model design sessions, 2026-07 (D-137). The banned-defaults list is a snapshot of mid-2026 model tells — expect it to need refreshing as model defaults drift; treat a stale entry as a canon bug, not a rule.

House palette and register live in `house-style.md`; component-library doctrine in `ui-library-contract.md`; framework execution notes in `frameworks.md`.

## The two-pass process

Every user-visible surface gets Pass 1 (design plan) then Pass 2 (critique, then build) — never open a code block first. The canon is tuned for: game engines and editors, wargaming and space sims, AI/big-data research tools, and map-based planning apps.

**Pass 1 — Design plan:**
1. **Subject.** If the brief doesn't pin down the product, pin it yourself: one concrete subject, its audience, the page's single job. Distinctive choices come from the subject's own world — its instruments, materials, vernacular.
2. **Tokens.** Before any code: 4–6 named hex colors (background, surface, ink, muted, one accent, optional second accent); 2–3 typefaces with roles (characterful display used with restraint, complementary body, utility/mono for data); a one-sentence layout concept; and a **signature** — the single element this screen will be remembered by.
3. **Copy.** Draft the real headline and key labels now. Placeholder copy produces placeholder design.

**Pass 2 — Critique, then build:** Ask "would I have produced this same plan for any similar brief?" Revise anything that reads as a default rather than a choice. Only then write code, deriving every color and type decision from the tokens.

## Banned defaults (the "AI look")

Never use these unless explicitly requested:
- Warm-cream (#F4F1EA-ish) background + high-contrast serif + terracotta accent (especially near #D97757).
- Near-black + single acid-green or vermilion accent with glow.
- Faux broadsheet: hairline rules everywhere, zero radius, newspaper columns regardless of subject.
- Purple-to-blue gradients, especially on hero text or buttons.
- The template hero (big number, small label, three stats, gradient accent) as a reflex.
- Numbered markers (01/02/03) when content isn't actually a sequence. (Route waypoints ARE a sequence — numbering there is earned.)
- Emoji as icons; use a real icon set (lucide in React projects) or nothing.
- Reflexive three-card icon-title-blurb grids; glassmorphism on everything; shadows on every card; `rounded-2xl` by default.

## Craft rules

**Typography.** Type carries the personality; it is never neutral. Pair display and body deliberately and differently per project. One size scale, defined once — no scattered arbitrary values: 4–6 steps for prose-led surfaces; dense tool UI (ops consoles, editors, analysis surfaces) may run 8–11 steps with half/quarter gradations, still declared as a single scale (gallery-wide precedent — #191). Prose body ≥16px, line-height 1.5–1.7, measure 60–75ch. Uppercase only for labels, with tracking. Tabular numerals (`fontVariantNumeric: tabular-nums`) for ALL live or columnar data.

**Color.** Everything derives from the token palette; needing a seventh color means the palette is wrong. One accent, spent in one place. Body contrast ≥4.5:1. Tint grays toward the palette's temperature.

**Layout.** 4/8px spacing rhythm applied consistently — inconsistent gaps read as sloppy faster than any other flaw. Structure is information: dividers, eyebrows, and labels encode something true about the content. Responsive to 375px is part of done.

**Motion.** One orchestrated moment beats scattered effects. 150–300ms micro-interactions, ease-out entrances, `prefers-reduced-motion` respected. Excess animation is itself an AI tell. Good uses from the house catalog: radar sweep, pulse-ring on the live entity, marching-ants on planned routes, riseIn on new log entries, flash-highlight on changed fields, progressive "sampling in" of data points.

**Copy.** Words are design material. Write from the user's side of the screen ("Manage notifications," not "Webhook config"). Buttons say exactly what happens and keep their name through the flow. Errors state what went wrong and how to fix it — never apologize, never vague. No lorem ipsum ever; invent specific plausible content from the subject's world.

## Self-teaching UI patterns (the core UX philosophy)

Principle: **replace documentation with feedback.** A user must be able to start blind and learn by using. Every field answers three questions at once: *what is this, what should I put, what will happen.* The anti-clutter tool is hierarchy of ink — controls bright, teaching text dim, verdicts loud only when wrong — never hiding things in tabs.

1. **Config-as-a-sentence.** Render the whole configuration as one live plain-language sentence at the top ("Simulate a 6-hour engagement with 120 contacts at 20 ticks/sec — about 4 min to run"). Values in the sentence are visually marked. It is summary, sanity check, and mental model at once.
2. **Recommended bands, not just defaults.** Sliders carry a shaded safe zone and a notch at the recommendation, labeled in-line ("rec 20 · green = safe band"). Out-of-band is a tradeoff to explain, never an error to scold.
3. **Consequence previews.** Under every control, one live line written as an *outcome, not a definition*: "fast movers may teleport through each other," not "integration step size below threshold." Re-renders on every change (animate its entry so change is noticed).
4. **Plots that judge themselves.** Shade the healthy region ON the chart with its label inside it ("healthy: settles into this band"), and attach a plain-language verdict chip: LOOKS RIGHT / WASTEFUL / NOT TRUSTWORTHY, each with one sentence of why. Users learn to read the chart by watching the verdict change.
5. **Presets as teachers.** Applying a preset flash-highlights exactly the fields it changed (~1.5s amber wash). Diffing presets is how people learn the parameter space without reading.
6. **Impact tags + fearless reset.** Tag each setting AFFECTS RESULTS / AFFECTS SPEED / COSMETIC. Any off-recommendation field grows a "↺ back to recommended" button. Fear of breaking things is the real barrier to blind learning; make every touch cheap to undo.
7. **Plain-language search as the click-collapser.** A search box backed by a synonym map ("faster" → tick rate), filtering one scrollable surface. Everything reachable in one action; empty results teach vocabulary ("try words like speed, sensors, duration").
8. **Choice cards over jargon dropdowns.** Options are cards with a name plus a layman line stating when to use it ("Fast and forgiving — fine for layout and timing questions").
9. **Gates that explain themselves.** A disabled Run button says why ("Resolve warning to run") — a blocked action is a teaching moment, not a dead end.
10. **Teaching that fades.** Track help text the user has seen and acted on correctly; graduate it (full sentence → short hint → hidden, hover to recall). Same for hotkeys: show the key inline on buttons until used ~3 times. The UI densifies as the user levels up.
11. **Uncertainty as texture.** Confidence rendered visually — solid marks for correlated/trusted, hollow or dashed for uncertain — legible with no legend.
12. **Ghost previews.** Before commit, render the predicted outcome as a translucent ghost (alternate trajectory, dashed second plot line). What-if without commitment.

## LLM-native UI patterns

The self-teaching metadata is dual-use: everything that teaches a human grounds a model. Author once, serve both.

- **The schema IS the grounding.** Recommended bands, consequence strings, impact tags, and synonym maps live in structured data (the field definitions), so an LLM filling a config from plain language ("12-hour blockade with heavy jamming") inherits validation for free: out-of-band values flag, verdict chips audit the model's output, flash-highlight shows the human what the AI set. Human review is built into the same affordances.
- **Round-trip sentence.** The config sentence is editable in both directions — natural-language edits update fields (LLM parse), field edits update the sentence. It is the shared language between the non-technical stakeholder, the operator, and the model.
- **Change ledger.** Every mutation, human or AI, logs one plain sentence with author and timestamp ("AI: raised sensor fidelity to physical — detection ranges now match trials"). Simultaneously an audit trail (mandatory for AI-touched configs in serious domains) and accumulating fine-tuning data.
- **Explain-this-region.** Drag-select any window of a plot to get a plain-language read of just that window. Every chart becomes a conversation surface.
- **Attribution styling.** AI-originated values/annotations render in the amber channel (the "attention/AI" semantic) until human-confirmed, then normalize. Provenance is visible at a glance.

## Self-critique before delivering

1. Could this be mistaken for a generic prompt's output? What is the signature element, and is it doing work?
2. Chanel test: remove one accessory — cut the decoration that isn't earning its place.
3. Is boldness spent in exactly one place, everything around it quiet?
4. Can a first-time user start blind? Does every field answer what/recommended/consequence? Does every plot carry its own reading instructions?
5. Is everything reachable in ≤2 actions (search counts as one)? Is density handled by ink hierarchy rather than hiding?
6. Are the semantic accents (house default: amber/cyan/green/red — `house-style.md`) used semantically, never decoratively? Every number tabular? Every color and size traceable to tokens?
7. Focus states visible; holds at 375px; reduced motion respected; disabled actions explain themselves?
8. Does the copy sound like someone who understands the domain? Would the actual audience feel it was made for them?

Fix, don't annotate. Show work you have high confidence will delight.
