# Book 05 — CDK Primitives

> Volume II, Book 5 — the first book of *Building on Primitives*. Volume I decided *what* Caelum is (Book 01), *how it reacts and binds to forms* (Book 02), *what it may depend on* (Book 03), and *how it looks like one system* (Book 04). Volume II is where components get built, and almost every one of them is built on the **Angular CDK** — the unstyled behavior + accessibility layer that Angular Material is itself built on. The CDK package inventory and a11y-utility list are version-specific (CDK 22, stable 2026-06-03, *after* the model's training cutoff) and are grounded in the frontier note [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), cited inline as *(platform note)*. The CDK's *behavioral patterns* — overlay positioning, focus management, key managers, drag-drop, virtual scroll — are long-stable and are taught here from settled knowledge.

## 1. TL;DR

Angular Material ships roughly a third of PrimeNG's surface; the rest of Caelum is built, and the **CDK is what it is built on**. The CDK is a headless toolkit — it supplies *behavior* (overlay positioning, focus trapping, roving-tabindex keyboard navigation, live-region announcements, drag-drop, virtual scrolling, the structural logic of menus/listboxes/steppers/trees/tables) and supplies it **accessibility-complete**, while imposing **no visual opinion at all**. This book lands on one opinionated default: **every Caelum Build-* component composes CDK primitives for behavior and reads only the token bridge (Book 04) for design — never hand-rolled focus management, never hand-rolled overlay math, never bespoke keyboard handling.** The reason is not convenience, it is correctness: a11y parity is a non-negotiable Definition-of-Done gate, and the two hardest things to get right in a UI component — **correct focus/keyboard/ARIA semantics** and **correct overlay positioning** (flip, push, reposition-on-scroll) — are essentially free with the CDK and essentially never complete when hand-rolled. The CDK gives behavior; you bring structure, tokens, signal-driven change detection (Book 01 §3.2), and a `ControlValueAccessor` where a form value is involved (Book 02 §3.4). That four-legged stool — **CDK behavior · token design · signal CD · CVA forms** — is the recipe for every built component in Volume II.

## 2. Conceptual Foundations

### 2.1 What the CDK is — behavior without opinion

The Component Dev Kit is the set of primitives the Angular Components team factored *out* of Material so that Material's behavior could be reused without Material's look. It is the "sanctioned toolkit for building the components Material doesn't ship" (`brief §0`, `brief §1`). Mechanically it is a collection of import-scoped packages under `@angular/cdk/*`; CDK 22 ships these (folders under `src/cdk`): **a11y, accordion, bidi, clipboard, coercion, collections, dialog, drag-drop, keycodes, layout, listbox, menu, observers, overlay, platform, portal, scrolling, stepper, table, testing, text-field, tree** (platform note). Each is a small, tree-shakable unit of behavior — you import `@angular/cdk/overlay` to get positioning, `@angular/cdk/a11y` to get focus management, and nothing you don't use comes along.

The defining property is that the CDK brings **behavior and accessibility but no markup and no styling**. `CdkTree` knows how to flatten hierarchical data and manage expansion state; it renders nothing you didn't write. `Overlay` knows how to position a floating element against a trigger and keep it positioned through scroll and viewport edges; what goes *in* the overlay, and what it looks like, is yours. This is exactly the seam Caelum needs: the CDK supplies the parts that are hard and a11y-critical and stable, and Caelum supplies the structure and the `--cae-*` tokens (Book 04 §3.6) so a built component is visually indistinguishable from a Material one.

### 2.2 Where the CDK sits on the reach-for ladder

Book 01 §3.4 established Caelum's three-layer first-party stack — **Material → Angular Aria → CDK** — and the reach-for ladder that orders them: prefer a styled **Material** component when one fits; drop to an **Angular Aria** headless pattern when you need custom styling over a standard interaction pattern; drop to **raw CDK** primitives when neither fits; and only then build bespoke. The CDK is the rung you land on for two distinct reasons, and keeping them separate clarifies the whole book:

- **No higher rung covers the *pattern*.** There is no Material splitter, no Material carousel, no Material OTP input. You assemble these from CDK primitives (drag-drop, overlay, focus management) plus your own structure.
- **You need *infrastructure*, not a whole pattern.** Even a Material or Aria component sometimes needs lower-level plumbing — an overlay to float in, a `FocusTrap` to contain, a `BreakpointObserver` to react to viewport, a `Directionality` to resolve RTL. These are infrastructural primitives that sit *underneath* patterns; Aria itself uses them. They are always-CDK and have no higher-rung equivalent.

The first reason overlaps with Volume II's later books and with Angular Aria (Book 06): `@angular/cdk/menu`, `@angular/cdk/listbox`, `@angular/cdk/stepper`, and `@angular/cdk/tree` cover *patterns* that Aria now also covers as signal-era headless directives (platform note lists 12 Aria patterns including Listbox, Menu, Menubar, Tabs, Tree, Grid). The second reason does not overlap at all: `overlay`, `portal`, `drag-drop`, `scrolling` (virtual scroll), and most of `a11y` are infrastructure with **no Aria replacement**. Book 06 owns the "CDK structural directive vs Aria headless pattern" decision in full; this book owns the infrastructure that both rest on, and teaches the structural directives as the battle-tested option they remain.

### 2.3 The two things that are ruinous to rebuild — and free here

A component author can hand-roll a dropdown in an afternoon. They cannot hand-roll a *correct* one, and the gap between the two is precisely what the CDK closes. Two areas dominate:

**Accessibility.** Correct focus order, roving tabindex or active-descendant semantics, `aria-*` wiring, screen-reader announcements for asynchronous changes, focus restoration when an overlay closes, distinguishing keyboard focus from mouse focus so the focus ring shows only when it should — each of these is a small research project, and getting all of them right for a novel widget is the work of weeks. The CDK has done it: `FocusKeyManager`, `cdkTrapFocus`, `LiveAnnouncer`, `FocusMonitor`, `aria-describer`. Because Caelum's Definition of Done hard-blocks on a11y parity (axe + keyboard), building on these isn't a nicety — it's the difference between a component that can pass the gate and one that structurally cannot.

**Overlay positioning.** A floating panel must open against its trigger, **flip** to the other side when it would clip the viewport, **push** back into view when it overflows, reposition when the page scrolls, and tear down cleanly with focus restored. The geometry alone (and the scroll/resize bookkeeping behind it) is a notorious source of bugs. The CDK `Overlay` with a `FlexibleConnectedPositionStrategy` is the most reused primitive in all of Material — every menu, select, tooltip, autocomplete, and dialog sits on it — and reusing it is how a built `OverlayPanel` (`brief §3`) inherits behavior that took years to harden. Staying on first-party CDK here is also a *provenance* decision (Book 01 §2.3): the floating-UI problem is exactly the kind of thing a team would otherwise reach for a foreign npm package to solve, and the CDK lets Caelum not.

## 3. Architecture & Design

The CDK's surface is wide, so this section organizes it into the families that matter for building components, and states Caelum's decision for each. Three families are **infrastructure** (overlay/portal, a11y, layout/scrolling) reused by everything; two are **interaction** (drag-drop, the structural directives); and §3.6 is the discipline that composes them into a Caelum component.

### 3.1 Overlay & Portal — the floating-UI substrate

`@angular/cdk/portal` is the "render this elsewhere" primitive: a `CdkPortal` (or `ComponentPortal` / `TemplatePortal`) captures a piece of UI, and a `CdkPortalOutlet` renders it somewhere else in the DOM — typically outside the component tree, so it escapes `overflow: hidden` and stacking-context traps. `@angular/cdk/overlay` builds on portals to provide *positioned, layered* floating UI: `Overlay.create()` returns an `OverlayRef` (a handle to a managed pane in a top-level container) configured by two strategies:

- a **`PositionStrategy`** — `GlobalPositionStrategy` (centered/anchored to the viewport, for dialogs) or `FlexibleConnectedPositionStrategy` (anchored to a trigger element with an ordered list of fallback positions, for menus/popovers/selects). The connected strategy is where flip/push live: you give it preferred `connectedPosition`s and it picks the first that fits.
- a **`ScrollStrategy`** — `reposition` (follow the trigger on scroll), `close` (dismiss on scroll), `block` (lock the page), or `noop`.

Everything floating in Caelum sits here: `MatDialog`/`MatMenu`/`MatTooltip`/`MatSelect` already do, and the built overlays from the migration map — `OverlayPanel`/`Popover`, `ConfirmPopup`, `CascadeSelect`, `Mention`, `SpeedDial` (`brief §3`) — must too, rather than positioning a `position: absolute` div by hand. **Caelum decisions:** (1) the overlay *pane* is styled exclusively through the token bridge (`--cae-*` surface/elevation/radius tokens, Book 04 §3.6), so floating UI matches inline UI; (2) library-wide overlay defaults (default scroll strategy, default flexible positions) are exposed as **behavioral DI config** via a `provideCaelum…()` token, not baked per component — this is exactly the DI-carries-behavior / CSS-carries-design split from Book 01 §3.3; (3) a thin set of position presets (below-start, above-start, …) is shared so every Caelum overlay flips consistently. Book 09 (Overlay & Menu Components) builds the user-facing components on this substrate; this section is the substrate.

### 3.2 The a11y package — the parity engine

`@angular/cdk/a11y` is the package that makes "a11y parity" a checkbox instead of a project. It contains **focus-trap, live-announcer, focus-monitor, interactivity-checker, key-manager, and aria-describer** utilities (platform note). The load-bearing ones for a component author:

- **`FocusTrap` / `cdkTrapFocus`** — keeps Tab/Shift-Tab inside a region (every modal overlay needs this) and restores focus to the trigger on close. Hand-rolling focus restoration is a top source of a11y regressions; this is one directive.
- **`FocusMonitor`** — reports *how* an element was focused (keyboard / mouse / touch / program) and tags it (e.g. `.cdk-keyboard-focused`). This is what lets the focus ring appear on keyboard focus and not on click — it drives the focus-ring token from Book 04 rather than a guessed `:focus` rule.
- **`LiveAnnouncer`** — pushes text into an ARIA live region so a screen reader announces asynchronous changes (a filter result count, a "copied", a validation summary) that have no natural focus event. Built components that change content without moving focus are silently inaccessible without it.
- **`InteractivityChecker`** — answers "is this element focusable / tabbable / visible to AT?", the primitive behind correct focus traversal in custom widgets.
- **The key managers** — `ListKeyManager` and its specializations `FocusKeyManager` (roving tabindex — focus physically moves) and `ActiveDescendantKeyManager` (`aria-activedescendant` — focus stays on the container). These are the engine behind *every* list-like widget: arrow-key navigation, Home/End, type-ahead, wrap, skip-disabled, horizontal/vertical orientation. Any Caelum component with a navigable set of items (listbox, menu, OTP, rating, button-toggle group, tree) drives its keyboard from a key manager, never from bespoke `keydown` math.

This section is what earns §2.3's claim. Caelum's rule: **no built component manages focus or keyboard interaction by hand** — if you're writing a `keydown` switch over arrow keys, you've skipped a key manager. The matching verification (axe has nothing to flag, the keyboard scenarios pass) is a DoD gate; the testing discipline that keeps it honest lives in Book 17.

### 3.3 Layout, scrolling & virtual scroll — behavioral CSS in TypeScript

This family is "responsive/scroll behavior you can read and react to in TypeScript," plus the single most important performance lever in the library.

- **`@angular/cdk/layout`** — `BreakpointObserver` / `MediaMatcher` expose media queries as observable/signal-readable state, so a component can *change behavior* (not just CSS) at a breakpoint — collapse a toolbar to a menu, switch a density. (Pair the observable with `toSignal` to stay signal-first, Book 02 §2.1.)
- **`@angular/cdk/scrolling`** — `CdkScrollable` + `ScrollDispatcher` give a unified scroll-event stream (used by the overlay reposition strategy in §3.1), and **`cdk-virtual-scroll-viewport`** renders only the items currently visible. This is the lever behind the **R1 scar**: `MatTable` and plain `*ngFor` lists are fine for hundreds of rows and fall over at tens of thousands; the fix is virtual scroll, decided **per screen by row count**, not a blanket default (`brief §8`). Book 10 (Data Tables & Virtualization) owns grid-vs-table-by-row-count in full; the primitive lives here.
- **`@angular/cdk/bidi`** — `Directionality` resolves the ambient `dir` (LTR/RTL) as injectable, observable state, so behavioral code (drag axes, key-manager horizontal orientation, overlay flip) honors direction. This is the *behavioral* half of RTL; the *visual* half is logical properties in the token layer (Book 04 §3.5).
- **`@angular/cdk/text-field`** — `cdkTextareaAutosize` (grow-to-content textarea) and autofill monitoring, the small primitives behind form-field polish.
- **`@angular/cdk/observers`** — `cdkObserveContent` (a directive wrapper over `MutationObserver`) for reacting to projected-content changes.

### 3.4 Drag & drop — `@angular/cdk/drag-drop`

`CdkDrag`, `CdkDropList`, and `CdkDropListGroup` provide sortable lists, transfer between lists, drag handles (`cdkDragHandle`), movement boundaries (`cdkDragBoundary`), and customizable preview/placeholder templates — with the pointer math, auto-scroll, and reordering animation handled. This one primitive backs a whole column of the migration map: **OrderList** (sort within a list), **PickList** (transfer between two lists), **FileUpload** (drop target + `HttpClient`), **Carousel** (drag to advance), and **Splitter** (drag a divider) (`brief §3`). Caelum builds all of these on `@angular/cdk/drag-drop` rather than raw pointer events or a foreign drag library — which also keeps the provenance surface clean (Book 03). **Zoneless note:** drag-drop runs high-frequency pointer handling; it is legitimate to run that work via `NgZone.runOutsideAngular` for performance (Book 01 §3.2 marks this as the one safe `NgZone` use), but any state the template reads back — drop result, current order — must land in a **signal** so change detection fires correctly under a zoneless host. RTL drag axes resolve through `Directionality` (§3.3).

### 3.5 Structural interaction primitives — menu, listbox, stepper, tree, table

These are the CDK packages that implement a *pattern's* logic headlessly:

- **`@angular/cdk/menu`** — `cdkMenuTriggerFor` / `cdkContextMenuTriggerFor` and the menu/menuitem directives: focus, typeahead, submenu opening, and overlay wiring for menus, context menus, and tiered menus (`brief §3` Menu rows).
- **`@angular/cdk/listbox`** — `cdkListbox` / `cdkOption`: single/multi selection, key-managed navigation, and form integration for custom select/listbox controls.
- **`@angular/cdk/stepper`** — `CdkStepper`: the linear/non-linear step state, selection, and completion logic behind a custom stepper (Material's `MatStepper` extends exactly this).
- **`@angular/cdk/tree`** — `CdkTree` with flat or nested data sources: expansion state and level/`aria-level` management behind TreeSelect/TreeTable (`brief §3`).
- **`@angular/cdk/table`** — `CdkTable`: the headless table engine (column definitions, row templates, sticky rows/columns, `trackBy`) that `MatTable` is a styled skin over. Building a custom data table on `CdkTable` directly is the path when you need table behavior without Material's cell styling (Book 10).

**The honest design tension:** several of these patterns — menu, listbox, stepper, tree — now *also* exist as Angular Aria headless directives (platform note), and the platform note's feasibility analysis recommends, for *net-new* signal-era builds, reaching for **Aria before raw CDK** (Material → Aria → CDK → bespoke). So this section's directives are not always the first choice. The rule Caelum applies: **`overlay` / `portal` / `drag-drop` / `scrolling` / `a11y` are always-CDK infrastructure with no Aria equivalent; the pattern directives (`menu` / `listbox` / `stepper` / `tree`) are a battle-tested option that Aria is increasingly the forward-looking alternative to.** Book 06 makes that choice precisely and is the right place to decide it per component; `CdkTable` and `CdkStepper` (which Material extends and which have no Aria pattern) remain CDK regardless.

### 3.6 The composition discipline — how a built component is assembled

The catalog above only pays off if it composes into one repeatable method. A Caelum Build-* component is four things at once:

1. **Behavior from the CDK** — focus/keyboard from a key manager (§3.2), floating from `Overlay` (§3.1), drag from `drag-drop` (§3.4), scale from virtual scroll (§3.3). No bespoke equivalents.
2. **Design from the token bridge** — every color/space/radius/elevation/focus value is a `var(--cae-*)` read; zero hardcoded design literals (Book 04 §3.6, enforced by the no-literal lint). This is what makes a CDK-built component sit beside a Material component without a seam.
3. **Change detection from signals** — `OnPush`, signal-driven, no `zone.js` dependency, no zone-coupled `NgZone` APIs (Book 01 §3.2). CDK utilities expose observables (`FocusMonitor.monitor()`, `BreakpointObserver.observe()`); bridge them with `toSignal` so the component stays signal-first (Book 02 §2.1).
4. **Forms from a CVA** — if the component holds a value (listbox, OTP, rating, color), it implements `ControlValueAccessor` so it works under classic Reactive Forms *and* Signal Forms (Book 02 §3.4; the deep dive is Book 07).

Hold those four and a built component is a first-class Caelum citizen; drop any one and it regresses — a hardcoded color breaks theming, a hand-rolled `keydown` breaks a11y, a zone-coupled API breaks zoneless hosts, a missing CVA breaks form integration. The `add_component` execution skill (named in the library outline) encodes this checklist so the method is mechanical, not remembered.

## 4. Implementation

Illustrative pseudo-code (Angular 22, signal-first, `OnPush`) — shapes, not a compileable repo. Three representative builds; each is deliberately small because the CDK carries the hard part.

**(a) An `OverlayPanel` on a connected overlay (`brief §3`, Build-S).** The CDK positions and layers; the component supplies a token-styled pane and signal-driven open state.

```ts
@Component({
  selector: 'cae-overlay-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template cdkPortal>
      <div class="cae-overlay-pane" cdkTrapFocus>
        <ng-content />
      </div>
    </ng-template>`,
})
export class CaeOverlayPanel {
  private overlay = inject(Overlay);
  private portal = viewChild.required(CdkPortal);
  private ref?: OverlayRef;
  readonly open = signal(false);

  toggle(trigger: ElementRef<HTMLElement>) {
    if (this.open()) return this.close();
    this.ref = this.overlay.create({
      positionStrategy: this.overlay.position()
        .flexibleConnectedTo(trigger)
        .withPositions(CAE_BELOW_START_POSITIONS),   // shared presets (§3.1)
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
    this.ref.attach(this.portal());                  // Portal → OverlayRef
    this.open.set(true);
  }
  close() { this.ref?.dispose(); this.open.set(false); } // dispose restores focus via cdkTrapFocus
}
```
```scss
.cae-overlay-pane {                 // design = tokens only (Book 04 §3.6)
  background: var(--cae-surface-overlay);
  border-radius: var(--cae-radius-md);
  box-shadow: var(--cae-elevation-2);
  padding-block: var(--cae-space-2);
}
```

**(b) A key-managed item list — the a11y engine (§3.2).** No `keydown` math; the manager owns navigation.

```ts
export class CaeOptionList implements AfterViewInit {
  readonly options = contentChildren(CaeOption);     // signal query
  private keyManager!: FocusKeyManager<CaeOption>;

  ngAfterViewInit() {
    this.keyManager = new FocusKeyManager(this.options())
      .withWrap().withTypeAhead().skipPredicate(o => o.disabled());
  }
  onKeydown(e: KeyboardEvent) { this.keyManager.onKeydown(e); } // arrows/Home/End/typeahead handled
}
```

**(c) A virtual-scrolled list — the R1 lever (§3.3).** Tens of thousands of rows, only the visible ones in the DOM.

```html
<cdk-virtual-scroll-viewport itemSize="48" class="cae-scroll-viewport">
  <cae-row *cdkVirtualFor="let row of rows()" [row]="row" />  <!-- rows() is a signal -->
</cdk-virtual-scroll-viewport>
```

And the cross-cutting wiring — library-wide overlay behavior provided once via DI (§3.1, Book 01 §3.3), never hardcoded per component:

```ts
export function provideCaelumOverlay(opts: CaelumOverlayOptions): EnvironmentProviders { /* … */ }
// app bootstrap: provideCaelumOverlay({ scrollStrategy: 'reposition' })
```

## 5. Bleeding Edge

The settled-enough-to-teach frontier here is **Angular Aria's stabilization** (v22) and what it does to the CDK story. Aria ships 12 first-party headless patterns — Autocomplete/Listbox/Select/Multiselect/Combobox, Menu/Menubar/Toolbar, Accordion/Tabs/Tree/Grid (platform note) — as signal-era directives that manage keyboard/ARIA/focus while you bring structure and CSS. That overlaps the CDK's *pattern* packages (`menu`, `listbox`, `tree`, and conceptually `table`/`stepper`) and shifts the recommended default for net-new builds toward Aria (Material → Aria → CDK → bespoke). Crucially it does **not** overlap the CDK's *infrastructure* — `overlay`, `portal`, `drag-drop`, `scrolling`, and the `a11y` utilities remain the foundation Aria patterns themselves stand on, with no replacement. So the trend is "Aria for new pattern logic, CDK for the floating/focus/scroll/drag plumbing underneath," and the CDK is not being deprecated — it is being *split* into the layer Aria covers and the layer only it covers. A second current is the gradual signalization of CDK APIs (queries and state surfacing as signals); the practical guidance is unchanged — bridge any remaining observable surfaces with `toSignal`. Live, unsettled frontier work belongs in `research/`; the per-component CDK-vs-Aria adjudication is Book 06's job.

## 6. Gaps & Opportunities

Honest limits of the CDK as a build substrate:

- **No first-party splitter, carousel, or resize-as-primitive.** Splitter and Carousel are assembled from `drag-drop` + overlay/structure (Book 11); there is no drop-in. `@angular/cdk/observers` covers content mutation but element-resize reactions still lean on the platform `ResizeObserver` wrapped by hand.
- **The CDK/Aria overlap is real friction.** Two first-party ways to build a menu/listbox/tree is a genuine "which do I learn?" cost for a contributor. The library's answer is the reach-for ladder plus Book 06's per-component decision, but the ambiguity exists and is worth naming rather than papering over.
- **Virtual scroll defaults to fixed item size.** `cdk-virtual-scroll-viewport` is simplest with uniform row heights; variable/autosize strategies exist but cost more care — relevant when Book 10 sizes a real grid.
- **`CdkTable` is powerful but verbose.** The headless table is flexible precisely because it makes you define columns and row templates explicitly; for the common case `MatTable`'s styling is worth inheriting (Book 10 draws the line).

The CDK *primitives* are covered by this book; the **component families** that build on them (overlay/menu, data tables, layout/media — Books 09–11) and the **Aria patterns** (Book 06) are authored progressively across Volume II. For the live, authoritative status of what's covered vs still open, read `MANIFEST.json` `coverage_gaps` (single-homed there) rather than trusting any frozen list here.

## 7. AI & Claude Code Integration

Where an agent is genuinely high-leverage on CDK work:

- **Scaffolding a built component from its migration-map row.** Given "`brief §3` says OverlayPanel = Build-S on `CdkConnectedOverlay`," an agent reliably produces the §3.6 four-legged skeleton — `OnPush`, portal+overlay wiring, token-only SCSS, a CVA stub if it holds a value — because the pattern is mechanical and this book encodes it. This is what the `add_component` skill automates.
- **Wiring the boring-but-error-prone plumbing.** Position-strategy fallback lists, `toSignal` bridges over `FocusMonitor`/`BreakpointObserver`, `trackBy`/`itemSize` for virtual scroll, key-manager configuration (`withWrap`/`withTypeAhead`/`skipPredicate`) — repetitive, well-documented, and easy to get consistent.
- **Generating the a11y test scenarios** (axe assertions + a keyboard-traversal script) from the component's interaction contract, so the DoD gate has teeth (Book 17).

Where it is only ~1× and must defer to a human:

- **Choosing the right position and scroll strategy for a *novel* overlay** — does it flip or close on scroll? push or reposition? block the page? — is a UX judgment, not a lookup.
- **Getting roving-tabindex vs active-descendant semantics exactly right for a widget with no precedent**, and the final **adversarial a11y pass** with a real screen reader. The CDK makes the *correct* path available; it does not decide *which* correct path a new pattern needs.
- **Drawing the grid-vs-table line** for a specific screen (R1) — a data and worst-case-load judgment (Book 10).

## 8. Exercises & Further Reading

**Exercises:**
1. Build a `cae-overlay-panel` on `CdkConnectedOverlay` with a fallback position list; verify it flips above the trigger near the viewport bottom and restores focus to the trigger on close.
2. Take a hand-rolled arrow-key list and rebuild its navigation on `FocusKeyManager` (`withWrap().withTypeAhead()`); run axe and a keyboard pass before and after and record the difference — this is §2.3 made concrete.
3. Render a 10,000-row list with and without `cdk-virtual-scroll-viewport`; measure DOM node count and scroll smoothness. State the row count at which you'd switch (your R1 threshold for that screen).
4. Add `LiveAnnouncer` to a filterable list so the result count is announced on each keystroke; confirm with a screen reader that an otherwise-silent change is now spoken.
5. Wire `BreakpointObserver` (via `toSignal`) so a toolbar collapses into a `CdkMenu` below a breakpoint — behavior changing, not just CSS.

**Further reading:** the CDK guides at [`angular.dev`](https://angular.dev) — Overlay, Portal, Accessibility (a11y), Drag and Drop, Scrolling/Virtual Scroll, Layout, Bidi, and the Menu/Listbox/Stepper/Tree/Table directives; the version-specific package inventory and a11y-utility list in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md); the failure modes catalog in [`reference/ANTI_PATTERNS.md`](../reference/ANTI_PATTERNS.md). In this library: Book 01 §3.4 (the reach-for ladder this book operationalizes), Book 04 §3.6 (the token-only rule built components obey), Book 02 §3.4 (the CVA bridge), and forward to Book 06 (Angular Aria headless primitives — the per-pattern CDK-vs-Aria decision), Book 09 (Overlay & Menu Components), Book 10 (Data Tables & Virtualization), and Book 11 (Layout, Panels, Media & Drag-Drop).
