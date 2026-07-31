---
name: design_review
description: "The design & UX gate plus the design canon it enforces (references/, per D-137). Two moments — BUILD: before creating or restyling any user-visible surface (screen, component, theme, chart, config UI), load the canon and run the two-pass process; GATE: before merging a diff touching design surfaces (PROJECT_CONVENTIONS › Design surfaces; any user-visible change when unset), run Gates A–D with screenshot evidence on the PR. Say \"design review\", \"review the UI\", \"does this look right\", \"check the design\". Complements adversarial_review (falsification fan-out) and /code-review (generic bugs)."
---

# Design Review — the craft canon and the design/UX gate

Make Fable-level UI/UX quality executable by any session on any model: the taste lives in written canon (`references/`), the quality bar in a gate that demands **evidence, not assertion** — screenshots and per-gate notes attached to the PR. The skill runs in two moments: **build** (canon in, before any code) and **gate** (checklist out, before any merge). Read project specifics from `PROJECT_CONVENTIONS.md`.

## The canon (`references/`)

| File | What it owns |
|---|---|
| [design-craft.md](references/design-craft.md) | The universal canon: two-pass process, banned AI-defaults, craft rules, the 12 self-teaching patterns, LLM-native patterns, self-critique. |
| [house-style.md](references/house-style.md) | The default register (ORRERY) + approved alternates. A default, not a mandate — see swap rules in the file. |
| [ui-library-contract.md](references/ui-library-contract.md) | The agent-first component-library doctrine: token law, API contract, docs with mandatory DO/DON'T pairs. |
| [frameworks.md](references/frameworks.md) | Per-framework execution notes (React; Angular signal-first). |

**Citation rule:** cite by file + section — e.g. `design-craft.md § Banned defaults` — and verify the section heading exists before asserting it. If the project has **promoted** the canon into its own design book (`build_library`, the D-137 fork-and-own path), that book is locally authoritative: cite it as `Book NN §X` per the normal library discipline instead.

**Ownership:** these files are template machinery, synced wholesale — a downstream edit is overwritten on the next `update_from_template`. Project taste lives in the `PROJECT_CONVENTIONS.md` Design-surfaces knobs or the promoted book; improvements to the shared canon go upstream via the inbox lane.

**Porting surfaces** (the seams a no-PR / non-GitHub downstream adapts — same class as the hook `EXEMPT` list #135 and check 4's site tuple #123): this skill's enforcement points in gate step 7 assume the GitHub PR lane — the report **attach point** ("attach to the PR"), the **merge-block** wording ("FAIL blocks merge"), and the **escalation route** (the `decision` issue). A lane without PRs maps these to its own equivalents (a review artifact, a merge-equivalent block, its own escalation), recorded project-side — it does **not** fork the synced body (that collides with the wholesale-overwrite rule above).

## When this fires

- **Build mode:** before composing or restyling anything a user sees. Also the entry point for standing up a component library (`ui-library-contract.md`).
- **Gate mode:** any PR touching the *Design surfaces* globs (`PROJECT_CONVENTIONS.md › Design surfaces`; **knob unset ⇒ judge by the diff** — any change to what a user sees counts), any new component's demo page, or on request.
- **Skip** for pure logic/infra slices (adapters, CI, scripts) — note the skip in the PR body.
- **Gate-mode prerequisite:** the pixel-evidence contract needs a **browser-capable** capture command (the `PROJECT_CONVENTIONS.md › Screenshot capture` knob). A unit-only stack (jsdom / Vitest, no browser runner) can't render or measure layout — gate mode is **degraded-only** there until capture infra lands, and deferring adoption with a filed ticket is a legitimate call, not a skipped gate. **React projects ship browser-capable by default:** the bundled `scripts/capture_ui/` harness (#150) is the wired path `configure_project` fills the knob with, so degraded mode is the exception (non-browser / unit-only / non-React), not the norm. **Every other stack builds its own command against [`CAPTURE_CONTRACT.md`](CAPTURE_CONTRACT.md)** — the contract plus per-family recipes (browser / JVM-offscreen Android / native-offscreen / unit-only), synced with this skill (#202, D-217; Android family + worked example: #250).

## Procedure — build mode

1. **Load the canon:** `design-craft.md` + `house-style.md`; `ui-library-contract.md` when the project has (or is adopting) a component library; `frameworks.md` for the stack at hand.
2. **Two passes, never code first** (`design-craft.md § The two-pass process`): Pass 1 — subject, tokens, signature element, real copy; Pass 2 — critique the plan ("would I have produced this for any similar brief?"), then build. Compose from the project's primitives wherever the library contract is in force.
3. **Self-verify** against `design-craft.md § Self-critique before delivering`, then run gate mode before presenting the work.

## Procedure — gate mode

1. **Capture the pixels.** The touched surface at the **geometries and themes named in the capture knob** (`PROJECT_CONVENTIONS.md › Screenshot capture`, which owns the list — web default when unset: ~1280w + 375w, light + dark if the surface themes), via the capture command there. **No capture wired — or no browser-capable renderer (a unit-only stack)?** Degraded mode: run the app and capture manually, attach the images, and file the capture-infra ticket via `track_followups` — a review without pixels is void, and a silent pass is worse than a loud gap.
   **Canvas-idiom surface? Geometry pre-gate first** (judgment-routed): when the surface renders a node graph / timeline / gantt / wire canvas **from data literals**, write a throwaway verifier for its geometric invariants — every wire joins a real output port to a real input port, no wire crosses a node body, no two spans share lane-space, positions derived from the data actually match it — and reach **zero violations before the first screenshot**. Look-and-patch is the wrong tool for this defect class (fixing one crossing creates another); a data-model check turns it mechanical — the geometry sibling of C′ (C′ checks values that repeat; this checks geometry derived from data). The verifier is scratch, never shipped; its run is the `geometry pre-gate` line in the output block. No extractable geometry ⇒ `n/a`, stated. Precedent: the LATTICE derivation solved 13 nodes / 16 typed wires to zero collisions pre-capture (template-internal example — it lives in the template's optional banked-generation content, absent in downstream copies; #159).
2. **Gate A — token & accent discipline** (objective): zero raw color/spacing/type values in the diff; semantic accents used semantically, one accent spent per screen; all live/columnar numerals tabular; uppercase only on labels, with tracking.
3. **Gate B — banned-default sweep**: sweep the diff against `design-craft.md § Banned defaults`. Every hit is fixed or explicitly justified against the canon in the PR.
4. **Gate C — self-teaching UX** (any form / config / plot surface): every field answers *what is this / what should I put / what will happen*; out-of-recommended is a stated tradeoff, never a bare error; judgment-bearing plots draw their healthy zone on the chart and carry a plain-language verdict; disabled actions say why; empty states invite an action; everything reachable in ≤ 2 actions; density handled by ink hierarchy, not hiding; copy from the user's side of the screen; no lorem ipsum anywhere, demos included.
5. **Gate C′ — cross-surface truth** (objective, the fact-checker pass): every number, ID, timestamp, count, and status that appears in more than one place — header vs panel, chip vs log line, summary vs detail, desktop vs mobile capture — must agree, and derived values must survive arithmetic (rates × times, sums of group counts, percentages of totals). Read the capture as a fact-checker, not a designer: list each repeated value, verify the pair, check the sums. A pixels-only review catches geometry, not semantics — this is the named step for the class blind judging punished hardest (a header ID contradicting a caption, a log clock disagreeing with the header clock; upstream EXP-04). **Where the surface offers reproducibility affordances** — an echoed CLI command, an export string, a copy-as-X button — verify each **agrees with the panel state it claims to reproduce**: the command's flags/args match the visible filters, the export matches the shown rows. N/a where the surface has none (from a downstream's independent cross-surface sweep, #170).
6. **Gate D — composition quality** (judgment, but evidenced): one signature element doing real work, everything around it quiet — Chanel test applied and named; *could this be mistaken for generic AI output?* (if yes, the **plan** was wrong — revise it, not the paint, and say what changed); holds at 375w; `prefers-reduced-motion` respected; motion is one orchestrated moment; something alive on ops-style screens.
7. **Report + enforce.** Attach the output block below to the PR. **FAIL blocks merge like any gate.** A judgment call that splits (agent says pass, gate says borderline) → `decision` issue with the screenshots, recommended default first, per `CLAUDE.md` §3. Every deferral → `track_followups`, at the moment it appears.

The gate is judgment — it stays on the session model (`.claude/skills/README.md` › Model & effort routing). Only the mechanical capture step may be delegated down. A substantial UI slice at review cadence additionally gets `adversarial_review` with its design lens; this gate is the per-diff check, not the deep fan-out.

## Output format (attach to the PR)

```
design_review: PASS | FAIL
screenshots: [per the capture knob's geometries × themes — web default 1280 & 375 × light/dark — or degraded-mode note + ticket #]
geometry pre-gate: n/a | pass — <invariants machine-checked, e.g. 16 wires port-valid · 0 body crossings> (canvas surfaces only)
A tokens/accents: pass|fail — notes
B banned defaults: 0 hits | list, each fixed-or-justified
C self-teaching: n/a | pass|fail — per-item notes
C′ cross-surface truth: pass|fail — <n> repeated values verified; every mismatch listed
D composition: signature = <element>; accessory removed = <thing>; verdict
citations: design-craft.md § … | Book NN §X (promoted book)
deferrals: none | #NN …
```

## Verification

- Pixels exist and are attached — or the degraded-mode note names the manual captures **and** the filed infra ticket. Never prose-only.
- Every gate line carries pass/fail with notes; Gate B states `0 hits` explicitly when clean; the `geometry pre-gate` line names its machine-checked invariants on canvas-idiom surfaces and says `n/a` everywhere else.
- Citations point at section headings that actually exist (grep the reference file; `SECTIONS.json` for a promoted book).
- A skipped run (logic-only slice) is noted in the PR body, not silently omitted.

## Don't

- Don't review without pixels — a checklist filled from memory of the code is assertion, not evidence.
- Don't look-and-patch canvas geometry — when the wires/spans come from data literals, extract and machine-check them (the pre-gate); pixel-hunting crossings converges on whack-a-mole.
- Don't repaint a surface that failed the generic-AI-output test — the plan is what failed; redo Pass 1.
- Don't use semantic accents decoratively or spend two accents on one screen — that's a Gate A finding, not a style preference.
- Don't edit `references/` in a downstream project — it's overwritten on sync; route canon improvements upstream (inbox lane) and project taste through the conventions knobs or the promoted book (D-137).
- Don't let a FAIL slide to "follow-up later" without a ticket; don't ticket-and-merge a Gate A/B FAIL at all — those are objective and cheap to fix now.
- Don't run the deep multi-lens fan-out from here — that's `adversarial_review`'s job at review cadence; this is the per-diff gate.
