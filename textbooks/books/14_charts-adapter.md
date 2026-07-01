# Book 14 — Charts Adapter

> Volume III, Book 3 — the second *concrete* adapter. Book 12 set the pattern; Book 13 instantiated it on the data grid; this book applies it to **charts** — the one gap Angular Material fills *not at all*. The engine is the **render-it-yourself** approach `docs/ARCHITECTURE.md` **D-08** endorsed (visx) — but the research grounding for this book turned up a decisive fact: **visx is React-bound** and cannot be consumed by an Angular library, so the Angular instantiation runs on **D3's framework-agnostic modules directly** (the same substrate visx itself uses). All version/library/provenance specifics are grounded in [`research/notes/visx-charts.md`](../../research/notes/visx-charts.md) — cited as a research note, never as a `Book §`. It implements **D-08**, which is **deferred for the build** (the team is not using charts yet — ROADMAP M3 / cut order) but written here **in volume order**; the D-08 *refinement* (D3-direct, not visx) and the final library/provenance sign-off land at **M2** (filed as `DEC-CHARTS-LIB`).

## 1. TL;DR

Charts are the gap Material fills **not at all** — no first-party charting exists, so this is a pure third-party case from zero. The adapter pattern still applies unchanged (Book 12): a **neutral `CaeChartAdapter` interface** in Caelum's vocabulary (`cae-chart`, signal IO, Caelum-typed series/marks/axes — no vendor type leaks, Book 12 §3.1), a **single `chart.adapter.ts`** membrane fenced by ESLint (Book 12 §3.2–§3.3), and **DI swap** via `CAE_CHART` + `provideCaelumChart()` (Book 12 §3.4). The render-it-yourself engine D-08 named — **visx** — turns out to carry a hard **React peer dependency** (research note), so it is structurally unavailable to Angular; the Angular adapter therefore depends on **D3's modules directly** (`d3-scale` for scales, `d3-shape` for arc/line/area path generators — ISC, Mike Bostock/US). D3 emits only numbers and SVG path strings (no DOM, no CSS), so `cae-chart` draws the SVG itself with `--cae-*` tokens — the same clean token-bridge fit headlessness gave the grid (Book 13 §2.2/§3.3). Two things bite harder here than for the grid: **a11y** (a chart is not just a picture — §3.4), and **"size the need"** — because charts are deferred and the d3 tree is bushier, for a *small* chart need hand-rolled SVG may beat adding the dependency at all (Book 03; Book 12 §6; `brief §9.3`). Implements **D-08**; the visx→D3 refinement and sign-off are **M2** work.

## 2. Conceptual Foundations

### 2.1 The gap Material fills *not at all*

The grid gap was a gap of *scale and features* — `MatTable` exists, and Book 13 §2.1 drew the line where it runs out. Charts are different: Material ships **no charting whatsoever**, so there is no first-party floor to climb from. That sounds like a stronger case for a dependency, but it cuts the other way too — there is also no Material baseline tempting you to over-reach, and the honest first question (`brief §9.3`) is **how big is the chart need at all?** The team is not using charts now (D-08 deferred); when the need arrives it may be a handful of sparklines and a bar chart, not a visualization platform. The bottom rung (Book 12 §2.1) is reached only when the need is genuinely *engine-sized*; a small need stops higher — hand-rolled SVG and the lazier path Book 03 always offers. This book builds the adapter for the engine-sized case **and** keeps naming the cheaper exit, because for charts the cheaper exit is unusually often the right one.

### 2.2 Render-it-yourself — D3 math, *your* DOM

The render-it-yourself pattern is the charts analogue of the grid's headlessness (Book 13 §2.2): a library computes the **geometry** — scales that map data values to pixel positions, generators that turn data into SVG path `d` strings — and *you* render the SVG. D3's `d3-scale` and `d3-shape` are exactly that and nothing more: framework-agnostic functions that emit numbers and path strings, touching no DOM and imposing no styling (research note). That is the ideal adapter shape for the token bridge — geometry comes *in*, markup stays *ours*, and there is no vendor stylesheet to fight (Book 12 §3.5). A "batteries-included" chart component that renders its own styled DOM would be a strictly worse candidate, for the same reason a CSS-shipping grid would be (Book 13 §2.2).

### 2.3 visx is React-bound — the D-08 refinement, and why the interface saves us

D-08 endorsed **visx** (Airbnb's low-level visualization primitives). The research pass for this book found the decisive fact (`research/notes/visx-charts.md`): visx's rendering packages carry a **hard `react` peer dependency** — visx "combines the power of d3 to generate your visualization with the benefits of **react** for updating the DOM." It renders *through React*, so it is structurally unavailable to an Angular library. The resolution is a **refinement, not a reversal**: the visx *approach* — render-it-yourself viz primitives over D3 — is exactly right; the visx *package* is React-only, so the Angular instantiation depends on **D3 directly**, the same substrate visx wraps ("under the hood, visx is using d3 for the calculations and math"). This is filed for the M2 sign-off as `DEC-CHARTS-LIB` (reversible, low risk, charts deferred).

The load-bearing lesson is *why this cost almost nothing*: because the neutral interface (Book 12 §3.1) never named visx, discovering that visx won't work is an **adapter-implementation choice**, not a rewrite. `cae-chart` and every call site are written against `CaeChartAdapter`; whether that adapter is built on visx, D3, or hand-rolled SVG is invisible above the membrane. The neutrality test — *satisfiable two ways* — is precisely what turns "the endorsed library doesn't fit our framework" from a crisis into a one-file decision. This is the adapter pattern earning its keep before a single chart is drawn.

## 3. Architecture & Design

Book 13's method, instantiated for charts. §3.1 the vendor-free interface; §3.2 the single membrane over `d3-*`; §3.3 drawing SVG through the token bridge; §3.4 the a11y case charts make hardest; §3.5 DI + the no-dependency fallback as the "size the need" lever; §3.6 the checklist.

### 3.1 The neutral chart interface — designed vendor-free

Write the interface as if D3 did not exist (Book 12 §3.1; Book 13 §3.1). A series is a Caelum type (`CaeSeries<T>` — an `id`, a label, accessors `x: (d: T) => …` / `y: (d: T) => …`); a mark is a Caelum enum (`'line' | 'bar' | 'area' | 'arc'`); axes and the domain are Caelum-typed. The adapter port (`CaeChartAdapter`, an abstract class used as a DI token) exposes `setData` and the **computed geometry as signals** — the scaled points and the SVG path strings the template will render — plus the resolved axis ticks. The rule that keeps it real: **no `d3` type crosses the boundary** — no `ScaleLinear`, no `Selection`, no generator instance. Apply the two-way test to each member: if you cannot imagine producing the same `viewMarks` from hand-rolled coordinate math (the `brief §4` fallback), a d3 concept has leaked. That two-way satisfiability is what made the visx→D3 pivot free (§2.3).

### 3.2 The single membrane — `chart.adapter.ts` over `d3-*`

Exactly one file imports `d3-scale` / `d3-shape` (Book 12 §3.2). `chart.adapter.ts` maps Caelum series + marks to d3 scales (`scaleLinear`, `scaleBand`, …) and generators (`line()`, `area()`, `arc()`), computes the path strings and scaled points, and reads them back into the adapter's signals. The ESLint `no-restricted-imports` rule scopes `d3-*` to this one path (Book 12 §3.3) — the same membrane and the same anti-erosion guarantee as the grid (Book 13 §3.2), just pointed at the d3 packages. Vendor types live only here; above the membrane, `cae-chart` knows only `CaeChartAdapter`.

### 3.3 Drawing the SVG through the token bridge

Because the adapter hands up only numbers and path strings, `cae-chart` renders the `<svg>` itself — `<path>`, `<rect>`, `<line>`, `<text>` — with **every fill, stroke, and font from `--cae-*` tokens** (Book 04 §3.6; Book 13 §3.3). Categorical series color comes from a token ramp (`--cae-chart-series-1…n`), so a chart re-themes with the rest of Caelum and switches light/dark for free (Book 04). There is no vendor stylesheet because D3 produces no DOM. Responsive sizing feeds the container's measured width/height into signals (a `ResizeObserver`, or the CDK's layout utilities — *verify the exact CDK surface against Book 05 when built*), so the scales recompute on resize. The result is a chart that is Caelum's markup end to end, themable by the same tokens as every other component.

### 3.4 Accessibility — charts are the hard case

A chart is **not just a picture**, and this is where charts most often fail parity (Book 13 §3.6 leg 6; Book 16). Through the neutral surface, regardless of engine, `cae-chart` must carry: an **accessible name** (`role="img"` + `aria-label`, or a `<title>`/`<desc>` pair), a **text summary** of what the chart shows, and ideally a **data-table alternative** — the series rendered as a visually-hidden `<table>` so a screen-reader user gets the numbers, not silence. Interactive data points (hover/click) need a **keyboard path** and focus order. None of this comes from D3 (it emits geometry, not semantics), so the adapter/component owns all of it — exactly the "the adapter fills any a11y gap the library leaves" principle (Book 13 §3.6). Name it explicitly, because "it renders" hides "it is invisible to assistive tech."

### 3.5 DI wiring, the no-dependency fallback, and "size the need"

`CAE_CHART` is an `InjectionToken`, `provideCaelumChart()` provides the concrete adapter (Book 12 §3.4; the `provide*()` shape of Book 09 §3.1), and `cae-chart` injects the abstraction. The **fallback here is hand-rolled SVG with no library at all** — and that is unusually cheap, because render-it-yourself means even the fallback is mostly "compute a few coordinates" (a sparkline is a single `<polyline>`; a bar chart is a `map` to `<rect>`s). DI turns the **"size the chart need"** decision (`brief §9.3`) into a *provider choice*: a small need binds the zero-dependency `SvgChartAdapter`; a rich need (many chart types, scales, axes) binds the `D3ChartAdapter`. The fallback is therefore not a degraded mode but, for small needs, the *preferred* implementation — the lazier path Book 03 always offers, made first-class and selectable.

### 3.6 The chart-adapter checklist

Book 13 §3.6's legs, adjusted for charts (and still tracing to Book 12 §3.6):

1. **Neutral interface, vendor-free** — no `d3` type crosses the surface; satisfiable on D3 *and* on hand-rolled SVG (§3.1).
2. **Single membrane + ESLint** — only `chart.adapter.ts` imports `d3-*`, with the `no-restricted-imports` rule CI-enforced (§3.2; R6).
3. **DI-swappable, no-dep fallback exists** — `CAE_CHART` token, `provideCaelumChart()`, and a working zero-dependency `SvgChartAdapter` (§3.5).
4. **Token-themed SVG** — fills/strokes/fonts and the series-color ramp read `--cae-*` only; no color literals (§3.3; Book 04 §3.6).
5. **A11y carried by the component** — accessible name + text summary + data-table alternative + keyboard for interactive points (§3.4; Book 16).
6. **Provenance signed at M2** — the d3 transitive tree (bushier than the grid's — `d3-scale` alone pulls five sub-modules, research note) walked with `npm ls` + a license scan and signed off (Book 03 §3.2; D-10).
7. **Need-sized** — confirmed the chart need is engine-sized, not a few sparklines better hand-rolled (§2.1; `brief §9.3`).

## 4. Implementation

Illustrative pseudo-code (Angular 22, signal-first, `OnPush`) — shapes, not a compileable repo. D3 specifics are kept to the surface the research note verified; the eventual library is an M2 decision (`DEC-CHARTS-LIB`).

**(a) The neutral, app-owned interface — no vendor types (§3.1).**

```ts
// cae-chart.types.ts
export interface CaeSeries<T> {
  readonly id: string;
  readonly label: string;
  readonly data: readonly T[];
  readonly x: (d: T) => number | Date;
  readonly y: (d: T) => number;
}
export type CaeMark = 'line' | 'bar' | 'area' | 'arc';
export interface CaeViewMark { readonly seriesId: string; readonly path: string; readonly color: string; }
export interface CaeAxisTick { readonly pos: number; readonly label: string; }

export abstract class CaeChartAdapter<T = unknown> {            // the port (used as a DI token)
  abstract setData(series: readonly CaeSeries<T>[], mark: CaeMark, size: { w: number; h: number }): void;
  abstract readonly viewMarks: Signal<readonly CaeViewMark[]>;  // computed SVG path strings, signal-driven
  abstract readonly xTicks: Signal<readonly CaeAxisTick[]>;
  abstract readonly yTicks: Signal<readonly CaeAxisTick[]>;
}
```

**(b) DI wiring — provide the concrete adapter behind the token (§3.5).**

```ts
// cae-chart.providers.ts
export const CAE_CHART = new InjectionToken<CaeChartAdapter>('CaeChartAdapter');
export function provideCaelumChart(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CAE_CHART, useClass: D3ChartAdapter }]);
}
// a small need binds the zero-dep fallback instead: useClass: SvgChartAdapter
```

**(c) The neutral component — injects the ABSTRACTION, draws token-styled SVG, carries a11y (§3.3, §3.4).**

```ts
@Component({
  selector: 'cae-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg role="img" [attr.aria-label]="summary()" class="cae-chart"
         [attr.viewBox]="'0 0 ' + size().w + ' ' + size().h">
      @for (m of adapter.viewMarks(); track m.seriesId) {
        <path [attr.d]="m.path" [attr.stroke]="m.color" fill="none"/>   <!-- color from a --cae-* ramp -->
      }
    </svg>
    <table class="cae-visually-hidden">                          <!-- the data-table a11y alternative (§3.4) -->
      @for (s of series(); track s.id) { <caption>{{ s.label }}</caption> /* …rows… */ }
    </table>`,
})
export class CaeChart<T> {
  protected adapter = inject(CAE_CHART);                 // depends on the interface, not d3
  readonly series = input.required<readonly CaeSeries<T>[]>();
  readonly mark = input<CaeMark>('line');
  readonly size = input.required<{ w: number; h: number }>();
  readonly summary = input.required<string>();           // the accessible text summary
  constructor() { effect(() => this.adapter.setData(this.series(), this.mark(), this.size())); }
}
```

**(d) The single adapter file — the ONLY place a chart library is imported (§3.2, §3.3).**

```ts
// chart.adapter.ts
import { scaleLinear, scaleBand } from 'd3-scale';        // ← the one sanctioned import group (ISC, research note)
import { line, area, arc } from 'd3-shape';               //    d3 emits path strings; it renders nothing
export class D3ChartAdapter<T> implements CaeChartAdapter<T> {
  readonly viewMarks = signal<readonly CaeViewMark[]>([]);  // template reads back via a signal (zoneless-safe, Book 01 §3.2)
  readonly xTicks = signal<readonly CaeAxisTick[]>([]);
  readonly yTicks = signal<readonly CaeAxisTick[]>([]);
  setData(series: readonly CaeSeries<T>[], mark: CaeMark, size: { w: number; h: number }) {
    /* build d3 scales from the domain + size; run line()/area()/arc() to path strings; push into the signals */
  }
  // d3 types live ONLY in this file; nothing above the membrane can name them.
}
```

**(e) The no-dependency fallback sketch — same interface, no d3 (§3.5).**

```ts
// svg-chart.adapter.ts — satisfies CaeChartAdapter with hand-rolled coordinate math; imports NOTHING.
export class SvgChartAdapter<T> implements CaeChartAdapter<T> { /* a sparkline is one polyline — the §2.1 cheap exit */ }
```

The ESLint rule from Book 12 §3.3 closes the loop: any file other than `chart.adapter.ts` that imports `d3-*` fails the build. Above the membrane, nothing in Caelum knows whether charts run on D3, a future library, or hand-rolled SVG — which is exactly what made the visx→D3 refinement (§2.3) a one-file decision rather than a rewrite.

## 5. Bleeding Edge

The settled-enough-to-teach frontier for charts is three tensions — all library facts grounded in `research/notes/visx-charts.md`, not memory:

- **The library is genuinely undecided, and that's fine.** D-08 endorsed visx; the research refined it to *D3-direct for Angular* (§2.3; `DEC-CHARTS-LIB`). Because charts are deferred, **do not pin a chart library before M2** — the neutral interface is the insurance that makes waiting free. And every adapter is provisional (Book 12 §5): if a framework-agnostic, US-clean, well-maintained Angular-friendly viz library emerges, the adapter swaps to it at one file.
- **The d3 tree vs the lazier path — a real fork, not a formality.** `d3-scale` pulls five sub-modules (research note); for a small need that tree may cost more than it saves, and hand-rolled SVG wins (Book 03; Book 12 §6). The "size the need" decision (`brief §9.3`) is made with a *profiled* bundle number, not a guess (Book 18). Charts are the gap where Book 03's "the cheapest dependency is the one you don't add" most often returns "don't."
- **Zoneless, large data, and SSR.** D3 scale/shape are pure synchronous functions — zoneless-friendly (Book 01 §3.2); any animation drives through signals or `requestAnimationFrame` outside Angular (`NgZone.runOutsideAngular`, the one safe `NgZone` use, Book 01 §3.2) marshaled back. For large series, **downsample/aggregate before rendering** — never emit 100k `<path>` nodes. SVG is the default render target because it is token-themable, accessible, and **serializable** (so SSR can ship a static chart snapshot — an advantage over canvas); a canvas/WebGL mode for very large series is a future adapter mode that trades away token theming + a11y unless they are mirrored (§6).

## 6. Gaps & Opportunities

- **Chart-type breadth admits incrementally.** line/bar/area/arc/scatter are cheap over `d3-scale` + `d3-shape`; exotic types (sankey, treemap, force-directed) each pull additional d3 modules and must clear Book 03's gate individually, not wholesale. The cut order already defers exotic chart types (ROADMAP) — build them only on a real need.
- **Canvas/WebGL for very large series** is the future render mode SVG can't match on raw node count, but it loses token theming and a11y unless the adapter mirrors them (a hidden data-table, a token-fed color uniform). Note the trade-off; default to SVG.
- **`add_adapter`, instantiated for charts.** Same skeleton as the grid (Book 13 §6): neutral interface + `chart.adapter.ts` + the ESLint override + `provideCaelumChart()` + the zero-dep `SvgChartAdapter` — the isolation rule shipping in the same PR (R6).
- **Honest status: charts are deferred (D-08).** The book is written so the discipline is ready; the *build* waits for the team's chart need (ROADMAP). For the live status, read `MANIFEST.json` `coverage_gaps` (single-homed there).

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on chart-adapter work:

- **Scaffolding + the a11y alternative.** Given a chart spec, an agent reliably emits the §3.6 skeleton (neutral interface, `chart.adapter.ts`, ESLint override, provider, the zero-dep fallback) and maps the spec to `d3-scale`/`d3-shape` calls; it can also generate the **data-table a11y alternative** (§3.4) mechanically from the series — a high-value, easily-forgotten artifact.
- **Catching erosion + leaks.** Grepping a diff for any `import … from 'd3-…'` outside `chart.adapter.ts` is a reliable erosion lens (R6); the agent confirms the ESLint rule names exactly one file.
- **Surfacing the visx-is-React finding.** The agent must route visx/d3 questions through `research/notes/visx-charts.md` and **report that visx is React-bound** rather than assuming it works in Angular — exactly the kind of frontier fact that recall gets wrong (visx is famous, so memory says "use visx"; the peer dependency says otherwise).

Where it is only ~1× and must defer to a human:

- **"Size the need."** Whether a chart need is engine-sized or a hand-rolled sparkline (`brief §9.3`; §2.1) is a product/architecture call — and the one most likely to be over-answered toward "add the library."
- **The D-08 library refinement sign-off** (D3-direct vs a future option) and the d3 transitive-provenance sign-off — compliance judgments at M2 (Book 03 §3.1).
- **Chart-design judgment** — whether a given chart type honestly represents the data — is a perception/communication call, not the agent's to make.

## 8. Exercises & Further Reading

**Exercises:**
1. Write the `CaeChartAdapter` interface and prove it neutral by sketching **both** a `D3ChartAdapter` (line chart via `d3-scale` + `d3-shape`) and a zero-dependency `SvgChartAdapter` against the same signature — naming no `d3` type in the interface (§2.3, §3.1; Book 12 §3.1).
2. **The visx trap:** find `@visx/shape`'s `react` peer dependency in its package metadata and write the one-paragraph explanation of why the adapter must use `d3` directly in Angular (§2.3; research note).
3. Render a bar chart with every fill from a `--cae-chart-series-*` token ramp and **zero color literals**; switch light/dark and confirm the chart re-themes with no code change (§3.3; Book 04 §3.6).
4. **A11y drill:** add `role="img"` + `aria-label` + a visually-hidden data-table alternative to a `cae-chart`, and verify a screen reader announces the data, not silence (§3.4; Book 16).
5. **Size-the-need:** implement a sparkline hand-rolled (no library) and again on `d3`, compare LOC + added bundle KB, and write the verdict against `brief §9.3` (§2.1; Book 03).

**Further reading:** the library/version/provenance grounding for this book is [`research/notes/visx-charts.md`](../../research/notes/visx-charts.md) (a research note — web-sourced and staling, **not** a `Book §`); D3's scale/shape modules at [`d3js.org`](https://d3js.org/) as the framework-agnostic engine; and visx at [`airbnb.io/visx`](https://airbnb.io/visx/) as the **React** reference implementation of the same render-it-yourself idea (the one this book cannot use directly). In this library: Book 12 (the adapter pattern this instantiates), Book 13 (the first concrete adapter — the template this mirrors: §2.2 headless-is-the-right-shape, §2.3 the interface as swap insurance, §3.1 the vendor-free interface, §3.3 token-themed render, §3.6 the checklist, §5 the provisional dependency), Book 03 §2.3/§3.1/§3.2 (the bushier d3 transitive tree and its M2 sign-off), Book 04 §3.6 (the token bridge the SVG renders through), Book 01 §3.2 (zoneless + signal CD), Book 09 §3.1 (the `provide*()` precedent); and forward to Book 15 (Rich-Text Editor Adapter — the third gap), Book 16 (Accessibility & Parity Verification — charts are its hard case), Book 18 (Performance & Bundle Budgets — the d3-tree cost and large-series rendering), and Book 20 (Migration & Adoption).
