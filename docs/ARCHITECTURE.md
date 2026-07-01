# ARCHITECTURE — Caelum

The durable description of the system's shape, its non-negotiable invariants, and the log of every architectural decision. Onboarding drafted this from the [`_intake/` brief](../_intake/primeng-to-material-migration-brief.md); it's updated whenever a `D-NN` decision is made. Keep it honest and current — `plan_work` and `review_against_library` both lean on it.

## 1. Shape

Caelum is a layered Angular component library. **Thesis:** *stay inside the Angular org's own stack — Angular Material + CDK + Angular Aria, all Google-maintained and MIT (US-origin) — and build the gaps on those primitives, isolating the few genuine third-party needs behind app-owned adapters.* This sidesteps the provenance-audit problem for the majority of components (brief §0, §1).

Layers, top to bottom:

```
consuming app  ─►  <cae-*> public component API     (PrimeNG-parity ergonomics, app swaps p-* → cae-*)
                          │
        ┌─────────────────┼───────────────────────────┐
        ▼                 ▼                            ▼
  composition       built primitives             adapter layer
  (Material+CDK     (CDK Overlay/A11y/DragDrop/   (the ONLY files importing an
   assembled)        Scrolling/Menu/Listbox +      admitted 3p lib — grid/chart/editor)
        │             Angular Aria headless)              │
        └─────────────────┬───────────────────────────────┘
                          ▼
                  theming token bridge   (one CSS-custom-property token set:
                  the single source of design truth; Material's theming API AND
                  every built component read the same variables)
```

- **Public component API** — Caelum's exported components/directives, shaped for PrimeNG-parity so a consuming team replaces `p-*` selectors with `cae-*` (or Material directly) with minimal call-site churn.
- **Composition layer** — components assembled from existing Material + CDK pieces (e.g. ConfirmDialog = `MatDialog` + wrapper; MultiSelect = `MatSelect[multiple]` + filter/chip-summary).
- **Built primitives** — components Material doesn't ship, built on **CDK** (Overlay, A11y/FocusTrap/LiveAnnouncer, DragDrop, Scrolling/VirtualScroll, Menu, Listbox, Stepper) and **Angular Aria** headless ARIA primitives (stable in Angular 22).
- **Adapter layer** — the *only* code that imports an admitted third-party UI library; exposes a neutral, app-owned interface (brief §2.1). Three adapters: data grid, charts, rich-text editor.
- **Theming token bridge** — one CSS-custom-property token set (color, surface, spacing, radius, typography, focus ring) consumed by Material's theming API *and* by every built component (brief §2.2).

The two load-bearing patterns (adapter isolation, token bridge) are the spine; see brief §2 and `D-03`/`D-04` below.

## 2. Invariants (the non-negotiables)

The properties that must hold no matter what. `definition_of_done` gates on them; every change is checked against them.

- **Provenance purity** — every runtime dependency *and its full transitive tree* is US-origin **and** free/MIT-compatible. No paid licenses; no non-US origin. A violation is a hard-block, not a soft-flag. (brief §0; `D-05`)
- **Adapter isolation** — no app/component code imports an admitted third-party UI library directly; only that library's single adapter file does. Mechanically enforced by ESLint `no-restricted-imports`. (brief §2.1, §8; `D-03`)
- **Token-only theming** — built components read design values only from the token bridge (CSS custom properties); no hardcoded colors/spacing/radii/typography. (brief §2.2; `D-04`)
- **A11y parity** — every component meets or exceeds PrimeNG's keyboard nav, focus order, ARIA roles, and screen-reader labels. Direct/Material components inherit it; **built** components are explicitly axe- + keyboard-tested. (brief §6)
- **Evidence-gated done** — a component is "done" only with passing parity scenarios **plus** adversarial sign-off, never because it renders. Tracked in the capability ledger. (brief §7)
- **Angular lockstep** — track Angular / Material / CDK majors in lockstep (zero version lag is the entire reason for the stack choice); no pinning the library a major behind. (brief §0)

## 3. Subsystems

One subsection per major component cluster; filled in as the system grows. The book section(s) behind each land here once `build_library` runs.

- **3.1 Theming token bridge** — the token set, Material theming API wiring, light/dark + density, PrimeNG-parity overrides.
- **3.2 Built component families** — forms/inputs, buttons, panel/layout, overlay/menu, data, feedback/messages, media, misc directives (brief §3 migration map).
- **3.3 The three adapters** — grid, charts, editor: each a neutral interface + a single adapter file (brief §2.1, §4).
- **3.4 Parity & a11y verification harness** — the capability ledger (`untouched → mapped → implemented → parity-verified → adversarial-passed`), pre-committed scenario specs, axe + keyboard + visual-regression (brief §6, §7).
- **3.5 Provenance / compliance gate** — dependency vetting on the transitive tree (`npm ls` + license scan), the admit/reject record per third-party lib (brief §0, §4).

## 4. Risks

From the brief's pre-loaded scars (§8) plus this repo's standalone-library constraint.

| # | Risk | Mitigation |
|---|------|------------|
| R1 | `MatTable` at scale — fine for hundreds of rows, not tens of thousands | Decide grid-vs-`MatTable` **by row count, per screen**; document the virtual-scroll threshold; the grid adapter covers the heavy case |
| R2 | Calendar time-of-day gap (`MatDatepicker` is date/range only) | Build the time-of-day picker explicitly; tracked as a slice, not assumed away |
| R3 | InputNumber / InputMask locale parity (grouping, currency, paste, negatives) | Test against locale/currency/paste/negative cases; don't ship "looks the same" |
| R4 | Theming parity is not free — Material ≠ PrimeNG out of the box | Budget explicit token work; parity scenarios snapshot under light **and** dark |
| R5 | Foreign transitive deps — a US top-level package can pull a non-US dependency | Provenance check on the dependency **tree**, not the package; gate in CI |
| R6 | Adapter erosion — first direct import "just this once" kills isolation | ESLint `no-restricted-imports` scoping each lib to its adapter + a review lens |
| R7 | **No access to the consuming app** — can't rank work by real `p-*` usage | Build the full parity surface ranked by *general* PrimeNG frequency; ship an adoption/usage-mapping guide so the team maps their own usage on adoption |

---

## Appendix A — Decision Log

Every architectural decision, recorded once. `D-01..D-06` are settled by the brief + this onboarding; `D-07..D-09` are open forks surfaced to the human (see [ROADMAP](ROADMAP.md) › Open decisions). **Grounding** cites the intake brief (`brief §N`) for now; upgrade each to a verified `Book NN §X` once `build_library` runs.

| # | Decision | Choice | Grounding |
|---|----------|--------|-----------|
| D-01 | UI foundation | **Angular Material + Angular CDK** on Angular 22 (over: freeze on PrimeNG 21 MIT; pay for PrimeNG 22; NG-ZORRO/Taiga; build the whole kit from scratch) | brief §1 — only option clearing both hard rules with zero cost + zero version-lag |
| D-02 | How to cover the ~30% Material lacks | **Build on CDK + Angular Aria headless primitives** (not bespoke DOM) | brief §1, §2 — first-party, stable, a11y handled |
| D-03 | Third-party isolation | Every admitted 3p lib wrapped behind **one app-owned neutral adapter**; enforced by ESLint `no-restricted-imports` | brief §2.1, §8 — swappable + auditable provenance surface |
| D-04 | Theming | **One CSS-custom-property token bridge**; Material theming API and built components read the same set; no hardcoded design values | brief §2.2 — visual coherence + rebrand-as-token-change |
| D-05 | Dependency admission rule | **US-origin + free/MIT only, transitive tree included, behind an adapter, after provenance sign-off**; no paid licenses | brief §0 — the two canonical hard rules |
| D-06 | This repo's scope | **App-agnostic, public, reusable library** (Caelum) the team adopts — *not* an in-place migration of the proprietary app (no access to it) | Onboarding decision, 2026-06-29 (the human's call) — see ROADMAP R7 |
| D-07 | Advanced data-grid library | **TanStack Table** (headless, MIT, US) — direction endorsed by human 2026-06-29; fallback `MatTable` + CDK virtual scroll. Final transitive-provenance sign-off at M2 (provisional). | brief §4; D-10 |
| D-08 | Charts library | **visx** (MIT, US/Airbnb), kept lightweight — **charts not in current team use; deferred to a later milestone** (build only when the need lands). D3 only if it grows heavy. | brief §4, §9.3 — heaviness resolved (light/future) by human 2026-06-29 |
| D-09 | Rich-text editor library | **Lexical** (MIT, US/Meta) — direction endorsed 2026-06-29; fallback `contenteditable` + CDK toolbar (last resort). Provenance sign-off at M2 (provisional). | brief §4; D-10 |
| D-10 | Working definition of "US-origin" | **Maintaining entity HQ'd in the US + permissive license (MIT/BSD/Apache-2.0) + no non-US dependency in the runtime transitive tree.** Applied to all dependency vetting (D-05). **→ Refined by D-11 (#21, 2026-07-01): shipped-runtime scope + allied-nation (UK/DE/…) fallback; the strict "no non-US in the transitive tree" clause is superseded.** | Human decision 2026-06-29 (resolves brief §9.2); revisit if the team's compliance issues a stricter rule |
| D-11 | Refinement of the "US-origin" rule — scope + allied-nation fallback | **Two refinements of D-10, decided by the human on #21 (2026-07-01): (1) Scope = shipped-runtime reachability** — the origin gate binds packages whose code reaches a consumer's *shipped production bundle*, not every package installed into `node_modules`; a build-time / dev / schematics-only dep that tree-shakes out is out of scope. **(2) Origin = US-preferred with an allied-nation fallback** — non-US is avoided *when the need can be met by a US-origin or self-built option*; where it genuinely cannot, permissive-licensed deps from **allied nations (UK, Germany, and comparable friendly democracies) are acceptable**. **Angular's own transitive closure is accepted wholesale** (what the mandated D-01/D-02 foundation brings over is fine — e.g. `parse5`/`entities` (UK), `@standard-schema/spec`). An individual maintainer resident in the US or an allied nation, under a permissive license, satisfies origin — a US *legal entity* is not required. **The license rule (permissive + free, no paid) is unchanged and absolute.** For M0 the shipping target is pinned to the zoneless browser client; adopting SSR re-triggers the scan (though UK-origin `entities` on the SSR path is now acceptable under the fallback). | Human decision on #21, 2026-07-01, grounded in the M0-2 scan (`docs/provenance/M0-2-transitive-provenance-scan.md`); refines D-10, which was mechanically incompatible with D-01/D-02 under a strict full-installed-tree/US-only reading |

> **Adding a decision:** append the next `D-NN`; cite the grounding (verify any `Book NN §X` against `textbooks/SECTIONS.json` first); reflect it in `docs/ROADMAP.md` and the `CLAUDE.md` Status block. Don't re-litigate a logged decision — supersede it with a new row referencing the old if it genuinely changes.
