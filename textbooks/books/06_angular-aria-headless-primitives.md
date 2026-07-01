# Book 06 — Angular Aria Headless Primitives

> Volume II, Book 6. Angular Aria is a **new-in-v22** first-party library (Angular 22 stable 2026-06-03, *after* the model's training cutoff), so every concrete claim about its patterns and directive API is frontier and is grounded in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md) — cited inline as *(platform note)*, which carries the real fetched sources (angular.dev/guide/aria/* and Angular's `angular-aria` reference, accessed 2026-06-30). The *architectural* ideas — headless behavior, roving tabindex, styling off ARIA state — are stable and taught from settled knowledge. This book pairs with Book 05: that one is the CDK *infrastructure*; this one is the *pattern* layer that sits on top of it.

## 1. TL;DR

Angular Aria is Angular's new first-party set of **headless WAI-ARIA patterns** — directives that supply the keyboard interactions, ARIA-attribute management, focus/roving-tabindex, and screen-reader support for a standard interaction pattern, while you supply the DOM structure, the CSS, and the business logic (platform note). v22 ships **12** such patterns in three groups — *search/selection* (Autocomplete, Listbox, Select, Multiselect, Combobox), *navigation/CTA* (Menu, Menubar, Toolbar), and *content organization* (Accordion, Tabs, Tree, Grid) (platform note). This book lands one opinionated default: **for any Caelum component whose interaction matches a standard Aria pattern, Aria is now the preferred build substrate — it sits one rung above raw CDK on the reach-for ladder (Material → Aria → CDK → bespoke, Book 01 §3.4).** Aria gives an a11y-complete pattern for far less code than hand-wiring a CDK key manager and the ARIA roles yourself (Book 05 §3.2); because it is *headless* it themes natively through the token bridge (Book 04 §3.6); and because it is first-party MIT/Google it stays US-origin-clean (Book 03). The crucial caveat — and the thread of this whole book — is that **Aria does not replace the CDK, it stands on it**: an Aria menu opens through `cdkConnectedOverlay` (platform note), Aria patterns are the newest and least battle-tested of the three layers, and the choice "Aria vs CDK" only exists at the *pattern* layer, never at the *infrastructure* layer. This refines D-02; it is flagged to become a `D-NN` (DEC-ARIA-LADDER) when component code starts.

## 2. Conceptual Foundations

### 2.1 What "headless" means, precisely

A *headless* pattern ships **behavior and accessibility but no markup and no styles** — the same headless idea as the CDK (Book 05 §2.1), one layer up. Angular Aria draws the line explicitly (platform note):

- **Aria provides:** keyboard interactions (arrows / Enter / Escape / Tab / Home / End / typeahead), ARIA-attribute management (`aria-expanded`, `aria-selected`, `aria-disabled`, `aria-current`, …), focus management and roving tabindex, and screen-reader support.
- **You provide:** the HTML structure, the **CSS styling (mandatory — Aria ships no styles; you style each visual state off the ARIA attributes Aria sets)**, form integration (via a `[formField]` binding), and the business/data logic.

The consequence that matters for theming: because there are no shipped styles, the **styling hooks are the ARIA attributes themselves** — you write `.cae-option[aria-selected="true"] { … }`, not a vendor class. That is the cleanest imaginable fit for the token bridge (§3.3). Contrast the three first-party options on exactly this axis: **Material** ships behavior *and* a complete style (you accept or override it); **Aria** ships behavior and *no* style (you author all of it, keyed on ARIA state); **raw CDK** ships *lower-level* behavior (you assemble the pattern yourself from key managers + roles). Aria is the middle rung: a whole pattern's behavior, none of its looks.

### 2.2 The twelve patterns — and the signal-era API shape

The patterns, by group (platform note):

- **Search / selection:** Autocomplete, Listbox, Select, Multiselect, Combobox.
- **Navigation / CTA:** Menu, Menubar, Toolbar.
- **Content organization:** Accordion, Tabs, Tree, Grid.

An honest nuance the platform note records: **"Select," "Multiselect," and "Autocomplete" are usage patterns composed from the Combobox + Listbox directives**, not separate directive packages — which is why the *named-pattern* count (12) exceeds the number of distinct directive packages. (An earlier draft of the platform note miscounted these as "13"; the overview lists exactly twelve — corrected 2026-06-30, and a small reminder that frontier counts get verified, not recalled.)

The API shape is uniform and signal-era (platform note): directives are imported per-pattern from `@angular/aria/<pattern>` secondary entry points (`@angular/aria/listbox`, `@angular/aria/menu`, `@angular/aria/combobox`, …) and applied as **`ng`-prefixed attribute selectors** (`ngListbox`/`ngOption`, `ngMenu`/`ngMenuItem`/`ngMenuTrigger`/`ngMenuContent`, `ngCombobox`/`ngComboboxPopup`/`ngComboboxWidget`, `ngTabs`/`ngTab`/`ngTabPanel`, `ngAccordionGroup`/`ngAccordionTrigger`/`ngAccordionPanel`, `ngTree`/`ngTreeItem`, `ngToolbar`/`ngToolbarWidget`, `ngGrid`/`ngGridRow`/`ngGridCell`). Selection is a **two-way signal binding** — e.g. `ngListbox` exposes `[(value)]` as a `Signal<V[]>` (platform note). This is the same signal-first substrate the whole library is authored on (Book 02), so an Aria pattern drops into an `OnPush` Caelum component with no impedance mismatch (Book 01 §3.2).

### 2.3 Why Aria changes Caelum's build calculus

The migration brief was written in the window *before* Aria stabilized; it assumed "build the gaps on the CDK" (`brief §0`, `brief §1`). Aria's stabilization is upside that shifts the plan: several components the brief scoped as raw-CDK builds — listbox, tree, tabs, menu, multiselect, combobox-driven selects — now have a **first-party headless behavior layer** that is more complete and less code than wiring CDK key managers by hand (platform note). The provenance story is unchanged (Aria is MIT/Google, US-origin-clean, Book 03) and the theming story improves (headless + ARIA-keyed styling is a perfect token-bridge fit). This is a *refinement* of D-02 ("build on CDK + Angular Aria headless primitives"), not a contradiction of it, and the platform note recommends recording it as the **Material → Aria → CDK → bespoke** ladder once code starts (the `DEC-ARIA-LADDER` backlog item). The rest of this book makes that ladder precise and honest about Aria's youth.

## 3. Architecture & Design

### 3.1 The reach-for ladder, made precise

This is the book's core contribution — the decision the outline asks for ("when to reach for Aria vs CDK vs Material"). Walk it top-down and stop at the first rung that holds:

1. **Material** — *Is there a Material component that looks complete without custom styling and meets the design intent?* Then use it (Direct, in brief §3 terms). Material is behavior **and** a finished look; the official guidance is to use it when "components look complete without custom styling" (platform note). For Caelum this is the `MatButton`/`MatCheckbox`/`MatDialog`/`MatTabGroup`-class rows.
2. **Angular Aria** — *Else, does the interaction match a standard Aria pattern, and do we need custom (PrimeNG-parity) styling over it?* Then use the Aria headless pattern + token-bridge styling. The official guidance names exactly this case — "building a design system / enterprise component libraries / custom brand requirements" (platform note). This is Caelum's sweet spot: we are a design system that must hit PrimeNG's density and aesthetics (`brief §1`), so even where Material *has* a component, an Aria headless build can be the right call when the styling delta is large.
3. **Raw CDK** — *Else, do we need a lower-level primitive Aria doesn't model* — overlay positioning, drag-drop, virtual scroll, a focus trap, or a key manager for a **non-standard** arrangement? Then drop to the CDK (Book 05). This is the rung for everything that isn't a standard pattern.
4. **Bespoke** — *Else*, build on platform APIs directly — the last resort, and rare once the three first-party rungs are exhausted.

Two guardrails on the ladder. The official "**not** Aria" case is *rapid prototyping*, where a pre-styled library is faster (platform note) — irrelevant to Caelum, which *is* the library. And **native HTML** remains correct for genuinely simple form controls that get accessibility for free (platform note); don't reach for an Aria pattern to wrap a plain checkbox.

### 3.2 Aria and the CDK are layers, not alternatives

The single most important clarification in this book: **"Aria vs CDK" is a false framing at the infrastructure layer.** Aria patterns are *built on* CDK infrastructure. The platform note records it concretely — Angular's own Menu guide opens a menu through `cdkConnectedOverlay` / `OverlayModule`, with the trigger exposing `expanded()` as a signal — so an Aria menu is Aria's *pattern logic* (focus, typeahead, submenu semantics, ARIA roles) sitting on the CDK's *floating-UI substrate* (Book 05 §3.1). The same is true conceptually throughout: roving tabindex is the same accessibility mechanism the CDK's `FocusKeyManager` implements (Book 05 §3.2); Aria just packages it per-pattern.

So the choice is only ever at the **pattern layer**: *use Aria's ready pattern, or hand-wire a CDK key manager + ARIA roles yourself?* — and Caelum's answer is **prefer Aria** (less code, better a11y floor). At the **infrastructure layer** — overlay, portal, drag-drop, virtual scroll, focus trap — there is no choice: it is **always CDK**, whether you reached it directly (Book 05) or transitively underneath an Aria pattern. The rule that falls out: **never reach below Aria to re-implement a pattern Aria already ships, and never imagine you've "avoided the CDK" by using Aria — you're using both, by design.**

### 3.3 Styling a headless pattern through the token bridge

Because Aria ships zero styles and sets ARIA attributes for every meaningful state, the styling model is **CSS selectors keyed on ARIA attributes, with every value a `--cae-*` token read** (Book 04 §3.6). The official guidance is literally "use CSS to style different states based on ARIA attributes" and "target `[aria-selected='true']` for the selected state" (platform note). So a Caelum Aria component's stylesheet is a small set of attribute-selector rules over the token set:

```scss
.cae-option {                                   // base — tokens only
  padding-inline: var(--cae-space-3);
  color: var(--cae-text-primary);
}
.cae-option[aria-selected="true"] { background: var(--cae-surface-selected); }
.cae-option[aria-disabled="true"] { color: var(--cae-text-disabled); }
```

This is the *cleanest* possible token-bridge fit — cleaner even than a Material override (Book 04 §3.2), because the component is nothing but structure + token-driven CSS over ARIA state, with no vendor styles to override. The keyboard-focus ring keys off the same focus-origin concept the CDK's `FocusMonitor` exposes (Book 05 §3.2), so a focused option shows the `--cae-focus-ring` only on keyboard focus. Get this right and an Aria-built `cae-listbox` is visually indistinguishable from a Material `mat-selection-list` sitting beside it — which is the whole point of the bridge (`brief §2.2`).

### 3.4 Forms — `[formField]` inside, `ControlValueAccessor` outside

Aria patterns that hold a value (listbox, select, multiselect, combobox, tree-select, toolbar toggle groups) integrate with forms through a `[formField]` binding (platform note). Caelum still wraps them in a **`ControlValueAccessor`** (Book 02 §3.4): the CVA is the *public* contract that makes a `cae-*` control work under **both** classic Reactive Forms and Signal Forms (the forms-API-agnostic guarantee, the R3 scar), while `[formField]` is an *internal* wiring detail between the CVA and the Aria pattern's value signal. The shape is: the Aria pattern owns the `Signal<V[]>` selection; the component projects that to/from the CVA's `writeValue`/`onChange`; consumers see a normal form control. This keeps the §3.1 ladder's "use Aria for the pattern" decision orthogonal to the library's standing "every control is a CVA" rule. The full control-authoring treatment — validation, error state, `mat-form-field` integration — is Book 07.

### 3.5 The maturity caveat — prefer Aria, keep the CDK fallback live

Aria is the **newest** of the three layers — stable only since v22 (2026-06-03), with the least production mileage and an API the platform note's watch list flags as still potentially moving. The research pass for this book also surfaced a real open behavior issue (combobox/listbox `hostDirectives` mouse-click interaction) — evidence that the edges are still being sanded. Caelum's posture, therefore, is *prefer but verify*:

- **Prefer Aria** for new pattern builds (§3.1), but keep the **raw-CDK build one rung down as a live fallback** for anything Aria can't yet do, or does buggily, for a given pattern.
- **Gate adoption per-pattern on evidence**, not faith: the component's pre-committed parity scenarios (`brief §6`) plus the pre-registered **Aria-vs-CDK parity experiment** (platform note — does an Aria build match a raw-CDK build on a11y while costing less code?). Until a pattern's scenarios are green, don't ship a component on it.
- **Pin Aria in lockstep** — `@angular/aria` peers `@angular/cdk` at an *exact* version and rides the Angular release train (platform note, Book 01 lockstep invariant), so version drift isn't a worry, but a *breaking-change* on a young API is — re-verify on each major.

This is not hedging; it is the same evidence-gated discipline the whole project runs on (Definition of Done). Aria is the default; the CDK is the safety net that makes defaulting to a young library responsible.

### 3.6 Mapping the twelve patterns onto the migration map

Where each Aria pattern serves as first-party headless behavior for a `brief §3` row (the *whether* — Material-styled vs Aria-headless — is the §3.1 call, resolved per-row in Books 09–11):

- **Listbox / Select / Multiselect** → Select/Dropdown, MultiSelect, Listbox rows (custom-styled selection controls).
- **Combobox / Autocomplete** → AutoComplete, Mention, filterable selects.
- **Menu / Menubar** → Menu, Menubar, ContextMenu, TieredMenu (Aria pattern logic over the CDK overlay of Book 05 §3.1 — see Book 09).
- **Tabs** → Tabs/TabView, TabMenu (where custom styling beats `MatTabGroup`).
- **Accordion** → Accordion, PanelMenu.
- **Tree** → Tree, TreeSelect, and the tree-behavior half of TreeTable (the data/virtualization half is Book 10).
- **Toolbar** → toolbars and segmented/toggle button groups.
- **Grid** → 2-D keyboard/selection for calendars and grid-like widgets — **not** a virtualized data grid (that is Book 10 + the TanStack adapter, Book 13; Aria Grid gives keyboard/selection semantics, not rows-at-scale).

The honest boundary: Aria is the **behavior** layer for these; it is not a styled component set and not a data-grid. Which rows take Material vs Aria vs a CDK build is decided where those components are built (Books 09–11), using §3.1.

## 4. Implementation

Illustrative pseudo-code (Angular 22, signal-first, `OnPush`); directive names and inputs are the real, sourced API (platform note), but treat this as *shape*, not a compileable repo.

**(a) A `cae-listbox` on `ngListbox`/`ngOption`, wrapped in a CVA (§3.4).** The Aria directive carries selection + keyboard; the component adds the CVA contract and token-keyed styling.

```ts
import { Listbox, Option } from '@angular/aria/listbox';

@Component({
  selector: 'cae-listbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Listbox, Option],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: CaeListbox, multi: true }],
  template: `
    <div ngListbox [multi]="multi()" [(value)]="value" orientation="vertical">
      @for (opt of options(); track opt.id) {
        <div ngOption [value]="opt.id" class="cae-option">{{ opt.label }}</div>
      }
    </div>`,
})
export class CaeListbox implements ControlValueAccessor {
  readonly options = input<CaeOptionModel[]>([]);
  readonly multi = input(false);
  readonly value = model<unknown[]>([]);          // two-way, bound to ngListbox
  // CVA glue: project value <-> writeValue/registerOnChange (Book 02 §3.4) …
}
```
```scss
.cae-option[aria-selected="true"] { background: var(--cae-surface-selected); }  // §3.3
.cae-option[aria-disabled="true"] { color: var(--cae-text-disabled); }
```

**(b) A `cae-menu` on `ngMenu` through the CDK overlay (§3.2) — Aria pattern logic, CDK floating substrate.**

```html
<button ngMenuTrigger #trigger="ngMenuTrigger" [menu]="formatMenu()">Format</button>

<ng-template [cdkConnectedOverlayOpen]="trigger.expanded()">   <!-- CDK overlay, Book 05 §3.1 -->
  <div ngMenu #formatMenu="ngMenu" class="cae-menu-pane">      <!-- Aria menu pattern -->
    <ng-template ngMenuContent>
      <div ngMenuItem value="bold" class="cae-menu-item">Bold</div>
      <div ngMenuItem value="more" [submenu]="moreMenu()" class="cae-menu-item">More…</div>
    </ng-template>
  </div>
</ng-template>
```

The two snippets together are the book in miniature: a standard pattern's behavior comes from Aria, the floating/positioning comes from the CDK (Book 05), the look comes from `--cae-*` tokens keyed on ARIA state (Book 04), change detection is signal-driven `OnPush` (Book 01), and a value-bearing control exposes a CVA (Book 02). The §3.6 four-legged stool of Book 05, now with Aria on the behavior leg.

## 5. Bleeding Edge

Angular Aria *is* the bleeding edge of first-party Angular UI, which makes this section unusually load-bearing. **Settled enough to teach:** the twelve patterns are stable in v22, the per-pattern `@angular/aria/<pattern>` + `ng*`-selector + signal-`[(value)]` API shape is consistent, and the headless-styled-off-ARIA model is sound and a strong token-bridge fit (platform note). **Not yet settled:** the API surface may still shift on a young library (platform note watch list); new patterns are likely beyond the current twelve; and the `hostDirectives`-based composition that powers Select/Multiselect/Autocomplete (combobox + listbox) is powerful but has visible rough edges (an open mouse-click interaction issue surfaced during this book's research pass). The design direction is unmistakable and aligned with the rest of the platform — **signal-first two-way state**, headless behavior, accessibility as a first-class default — so betting Caelum's pattern layer on Aria is a bet *with* the Angular team's direction, hedged (§3.5) by the CDK fallback and the parity experiment. Live tracking of Aria's evolution stays in `research/` (the platform note's watch list names the pages to re-fetch); a book section is a snapshot, not a feed.

## 6. Gaps & Opportunities

- **Aria only covers standard patterns.** Anything that isn't one — Splitter, Carousel, OTP, Rating, ColorPicker, InputNumber/Mask (`brief §3` Build rows) — stays on raw CDK or bespoke (Book 05; Books 08, 11). Aria widens the "first-party headless" set; it doesn't eliminate custom builds.
- **Aria Grid is not a data grid.** It gives 2-D keyboard/selection semantics (calendars, grid widgets), not virtualized rows-at-scale; the data-grid gap is unchanged (Book 10 + the TanStack adapter, Book 13).
- **The learning cost is now three-way.** Material, Aria, *and* CDK can each produce a menu/tree/tabs. That is real cognitive load for a contributor; the §3.1 ladder is the mitigation, but the redundancy is a genuine cost worth naming, not hiding.
- **Maturity is the headline risk** (§3.5): least mileage of the three layers, API may move, edges still being sanded.

These map to `MANIFEST.json` `coverage_gaps`: the **Aria headless patterns** are now *covered* (this book); the **component families** that consume them — form controls (Book 07), specialized inputs (Book 08), overlay/menu (Book 09), data tables (Book 10), layout/media (Book 11) — remain the open Volume II items.

## 7. AI & Claude Code Integration

High-leverage for an agent:

- **Scaffolding an Aria-based `cae-*` component** from a migration-map row plus the §3.1 ladder decision: the per-pattern API is regular and well-documented, so generating the `ngListbox`/`ngMenu`/… skeleton — `OnPush`, signal IO, the CVA wrapper, the ARIA-keyed token SCSS — is mechanical and reliable (the `add_component` skill encodes exactly this).
- **Translating the headless contract into styling**: emitting the `[aria-selected]`/`[aria-expanded]`/`[aria-disabled]` attribute-selector rules over the `--cae-*` token set (§3.3) is pattern-work an agent does well.
- **Wiring the CDK substrate underneath** an Aria pattern (the `cdkConnectedOverlay` for a menu) consistently across components.

Only ~1× — defer to a human:

- **The maturity judgment (§3.5)** — *is this Aria pattern ready to ship this component on, or do we fall back to the CDK build?* That weighs open issues, the parity-experiment result, and risk appetite; it is not a lookup, and because Aria is young the answer changes over time.
- **Which states and tokens to style**, and the **adversarial a11y pass with a real screen reader** — Aria gives the correct ARIA scaffold, but design judgment and SR verification are human.
- **Deciding the §3.1 rung for a contested row** (Material-styled vs Aria-headless when both are viable) — a styling-effort vs parity trade-off call.

## 8. Exercises & Further Reading

**Exercises:**
1. Build a `cae-listbox` on `ngListbox`/`ngOption` with a `ControlValueAccessor` wrapper; style it **purely** off `[aria-selected]`/`[aria-disabled]` with `--cae-*` tokens; run axe and a keyboard pass. Then build the same listbox on a raw-CDK `FocusKeyManager` (Book 05 §3.2) and compare lines of code and axe results — this is the platform note's pre-registered Aria-vs-CDK experiment, made concrete.
2. Build a `cae-menu` on `ngMenu`/`ngMenuTrigger` opened through `cdkConnectedOverlay`; confirm by inspection that the floating substrate is the *same* CDK overlay you used in Book 05 — §3.2 made tangible.
3. Take three rows from `brief §3` (say Select, Tree, ContextMenu) and walk each down the §3.1 ladder out loud, writing the one-line justification for the rung you stop at.
4. For one Aria pattern, write the per-state token-keyed SCSS (`base`/`hover`/`selected`/`disabled`/`focus-ring`) and verify a built component sits seamlessly beside its Material cousin in light and dark (Book 04 §3.3).

**Further reading:** the Angular Aria guides at [`angular.dev/guide/aria`](https://angular.dev/guide/aria/overview) (overview + the per-pattern pages: Listbox, Combobox, Select, Menu, Tabs, Tree, Toolbar, Grid, Accordion) and Angular's [`angular-aria` developer reference](https://github.com/angular/angular/blob/main/skills/dev-skills/angular-developer/references/angular-aria.md); the sourced directive-level API and the corrected pattern count in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md). In this library: Book 05 (the CDK infrastructure every Aria pattern stands on), Book 01 §3.4 (the three-layer stack and the reach-for ladder this book operationalizes), Book 04 §3.6 (the token-only rule, here keyed on ARIA state), Book 02 §3.4 (the CVA the value-bearing patterns wear), Book 03 (why a first-party MIT/Google pattern layer matters), and forward to Book 07 (form controls), Book 09 (overlay & menu components), Book 10 (data tables — and why Aria Grid isn't one), and Book 11 (layout, panels, media).
