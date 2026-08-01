# PATTERNS — Caelum Direct-Component Cookbook

The single home for the **distilled engineering recipe** behind every `cae-*` Direct component (thin wrappers over Angular Material). This is the *why/how* that used to accrete in the `CLAUDE.md` Status block.

**What lives where** (single-home rule, `CLAUDE.md` › Source of truth):
- **Per-slice history** → the closed GitHub issue + merged PR + the `docs/ROADMAP.md` M0 one-liner index. Not here.
- **The mechanical "add an entry point" checklist** → `PROJECT_CONVENTIONS.md` › Source Layout. Not here.
- **Invariants / decisions** (`D-NN`) → `docs/ARCHITECTURE.md`. Not here.
- **The reusable *design* patterns + the gotchas that bit us** → *here*. When a new component follows precedent, this is the precedent.

Each pattern cites the slice that established it (`#NN`) so you can read the full story in that issue/PR.

---

## 1. The Direct-component shape

- A thin **standalone** component wrapping one (or a few) Material primitives; **`OnPush` + signal inputs** (zoneless-compatible — `D-12`); **no `color` input** — theming is free through the `--cae-*`/`--mat-sys-*` bridge (`D-04`; ARCHITECTURE §3.1).
- Each ships as its **own tree-shakable secondary entry point** `caelum/<name>` (#28). The mechanical checklist (folder + barrel + `size-budget.json` row) is in CONVENTIONS › Source Layout.
- **Reach-for ladder** (`D-13`): Material → Aria → CDK → bespoke. Don't hand-roll what a primitive already does.
- **Icons: self-authored inline SVG** (stroked `currentColor`), never `mat-icon` — Material Icons is a Google-CDN font, avoided under the US-origin/no-CDN discipline (M0-2). Precedent: cae-chip's remove "×" (#83).

## 2. Form controls — the CVA seam

Two families, chosen by whether the control is a `MatFormFieldControl`:

### 2a. `mat-form-field` controls → **extend `CaeFormFieldControlBase`** (`@recon-research/caelum/form-field`, #46)

`cae-input` / `cae-textarea` / `cae-select` / `cae-autocomplete` / `cae-multi-select` extend it. The base provides the **CVA** (`value()` signal, `commitValue()`, `writeValue`/`registerOnChange`/`registerOnTouched`/`setDisabledState`), the shared inputs (`label`/`placeholder`/`hint`/`required`/`disabled`/`appearance`/`ariaLabel`/`errorMessages`), and the validation-error-forwarding bridge. Each subclass adds only its specifics (type/attrs/IME for input, `rows` for textarea, `options` for select/autocomplete/multi-select) + a one-line `updateInnerErrorState()` seam over its own inner control.

- **Generic over the value type** (`CaeFormFieldControlBase<T = string>`, #135): the CVA value is `string` by default; a non-string control sets `T` and overrides the protected **`emptyValue()`** method (`cae-multi-select` → `string[]`, returns `[]`). `emptyValue()` is a *method* (not a ctor arg) so the base can seed `value = signal<T>(this.emptyValue())` in a field initializer — a prototype override resolves during `super()`, unlike a subclass *field* — which keeps the seam DI-clean (no constructor param → no `prefer-inject`/NG2016) and leaves the four string controls source-unchanged. Reuse this before hand-rolling an array CVA + error bridge.
- **Composed form control over `mat-select[multiple]`** (`cae-multi-select`, #135): value is `string[]`; a **chip-summary trigger** (`mat-select-trigger` + `mat-chip-set`) and an **opt-in in-panel filter** compose over the Direct select. Two gotchas: (1) **data-loss guard** — `mat-select` drops the selection for any option that *unmounts*, so a filtered view must **always keep currently-selected options rendered** or a filtered-out choice silently vanishes from the form; (2) a projected filter input is **not keyboard/SR-reachable** (Material parks focus on the `role=combobox` host, not a projected input) — full APG-combobox access (focus-on-open + `aria-activedescendant` mirroring) is real-browser work, so the filter ships opt-in/off until then (#138).

**The error-forwarding bridge** (#29 established, #47 extended): self-inject the **outer** `NgControl` (and **drop the `NG_VALUE_ACCESSOR` provider**), install a per-control `ErrorStateMatcher` that delegates *timing* to the DI `ErrorStateMatcher` (Material's default `invalid && (touched||submitted)` is identical to what we'd write — so **no `CaelumErrorStateMatcher` is shipped**, and an app root can still override), and **recompute in `ngDoCheck`** via the abstract `updateInnerErrorState()` (Material's own pattern — resilient to `[formControl]` swaps and the `resetForm()` model-before-`submitted` staleness; `control.events` only nudges CD for programmatic zoneless changes). `errorMessages` (`CaeErrorMessages`, in `@recon-research/caelum/shared`) renders `<mat-error>`.

**Gotchas:** matInput **suppresses `aria-invalid` on an empty-required field** by design (mapping `required` still leaves it SR-silent there); `mat-select` reflects `errorState`→`aria-invalid` **unconditionally** (no such suppression). `cae-autocomplete`'s inner matInput is **uncontrolled**, so the base's bridge applies directly (like cae-select).

### 2b. Non-form-field controls → **controlled-CVA, no `<mat-error>`**

`cae-radio` / `cae-checkbox` / `cae-switch` / `cae-toggle-button` / `cae-select-button` / `cae-slider` / `cae-listbox`. These aren't `MatFormFieldControl`s, so there's no inner form field and no `<mat-error>`.

**Controlled-CVA pattern** (cae-slider #109, cae-listbox #114, cae-select-button #73): own the value signal, **bind it into** the inner Material control (`[value]`/`[selected]`/`[checked]`), **read the authoritative state back** on the change event, then emit. Loop-free — re-binding an identical value is a no-op, so there's no feedback cycle.

**Mode-dependent value seam** (#73): single = `string`|`number`|`boolean`; `multiple`/`range` = an array (`string[]` / `[start, end]`). Material fixes the mode at `ngOnInit` and **throws if it changes**, so read `multiple`/`range` **statically** (set once, don't toggle). `writeValue` **normalizes a mismatched shape** to mode-empty.

**Touched** fires on `(focusout)`/blur (a refinement to gate on focus actually leaving the host via `relatedTarget` is filed → #117).

## 3. Non-form-field a11y — the consumer-owned `ariaDescribedby` hook (#47)

Non-form-field controls take an **`ariaDescribedby` input the *consumer* renders and points at** (the library ships no `<mat-error>` for them; a built-in `errorMessages` is reversible/additive → #51). Forward it onto the **focusable inner control, never the non-focusable container** — a description on `role=radiogroup`/`role=listbox` isn't reliably announced, and roving tabindex puts focus on the *option*, not the host:

- **Simple controls with a native `aria-describedby` input** (radio/checkbox `<input>`, switch `<button role="switch">`): declarative `[attr.aria-describedby]="$any(ariaDescribedby() || null)"` (the `$any`/`|| null` bridges Material's `string`-typed input so empty → attribute absent).
- **Grouped/roving controls** — no describedby input + a `role="presentation"` host (button-toggle #73), or per-option focus (listbox #114): forward onto **each focusable inner `<button>`/option via an `afterRenderEffect`** (guaranteed post-render, reactive on `options()`) — not declaratively.

The **label-less naming seam** (`ariaLabel`/`ariaLabelledby` — for controls used with no projected visible label, e.g. a settings row whose text is a separate element; #70) is the sibling of the describedby hook (**naming ≠ describing**), and forwards onto the same focusable inner control — but *how* differs by control:

- **checkbox/switch** (single control): bind Material's **own** `aria-label`/`aria-labelledby` *inputs* (`[aria-label]="$any(ariaLabel() || null)"`), not `[attr.]` — Material lands them on the inner `<input>`/`<button role="switch">`; the accessible name then follows WAI-ARIA precedence (labelledby > label), arbitrated by the **browser accname computation** for `mat-checkbox` (it just renders both attributes) and **actively** by `mat-slide-toggle` (it drops its internal label when a labelledby is set). ($any note: Material types these aria inputs inconsistently across controls — `aria-label` is `string` on checkbox but `string | null` on slide-toggle — so the uniform `$any(x() || null)` bridges all six bindings as one idiom; matches the pre-existing `ariaDescribedby` seam.) Gotcha: `mat-slide-toggle` *always* points its button's `aria-labelledby` at its own internal `_labelId`, so it's never null by default; a set `ariaLabelledby` input wins (`_getAriaLabelledBy()`). `mat-checkbox` names via `<label for>` instead, so its `aria-labelledby` *is* absent by default. Test the switch as an **override**, the checkbox as **absent→set**.
- **radio** (group): `[attr.aria-label]`/`[attr.aria-labelledby]` on the `mat-radio-group` host — the `role=radiogroup` element itself carries the group name.

Caveat to document on every naming input: setting **either** naming input (`ariaLabel` *or* `ariaLabelledby`) alongside a *visible* projected label overrides it as the accessible name (WCAG 2.5.3 "label in name" mismatch — `ariaLabelledby` pointing at differing text drops the visible label just as `ariaLabel` does) — use one or the other. Prefer the projected label; reach for the naming seam only when there's none.

## 4. Directive forwarding seams — focusable-host a11y

`caeTooltip`/`caeMenuTriggerFor` apply to **focusable hosts only**. The `<cae-button>` wrapper is not focusable (the real control is its inner `<button>`), so cae-button **forwards** to that inner button:

- **`tooltip`/`tooltipPosition`** (#36), **`menuTriggerFor`** (#57), **`disabledInteractive`** (#58).
- `menuTriggerFor` uses a **two-branch template**: the trigger is applied **only when a menu is bound**, because `MatMenuTrigger` binds `aria-expanded` unconditionally — an always-present trigger would announce every plain button as a collapsed disclosure.
- `disabledInteractive` drops the native `disabled` attribute for `aria-disabled="true"`, keeping a *disabled* button focusable/hoverable so its forwarded tooltip/menu still surface (the `<p-button pTooltip disabled>` parity case). The action is **not** auto-suppressed — the consumer guards `(click)`/`(ngSubmit)`; a bound `menuTriggerFor` stays openable, so unbind it (`[menuTriggerFor]="busy ? undefined : menu"`) to block.
- **Cross-entry-point without a runtime dependency**: type-only seams live in `@recon-research/caelum/shared` (`CaeTooltipPosition`; the structural `CaeMenuPanelHost`), imported with `import type` (erased). The panel resolves through the public **`CaeMenu.getMenuPanel()`** (over a now non-required `@internal` `panel` viewChild), synced into cae-button via an `effect`.

## 5. Content projection & DI coordination

- **`<ng-template>` + `contentChildren`** (cae-tabs, cae-stepper): the child (`cae-tab`/`cae-step`) captures its content in an `<ng-template>`, the parent collects children with `contentChildren` and stamps them via `ngTemplateOutlet`. **Tab bodies are lazy; stepper steps stamp eagerly.** A form control declared inside a projected step binds to the ancestor `FormGroup` (ControlContainer resolves through projection).
  - **cae-stepper `[linear]`** (#40): forward `cae-step.stepControl` → `mat-step`; drive Material's `selectedIndex` from an `effect` that reads its index back **`untracked`** and **re-emits on a refused linear move** (Material refuses silently, no event) so `[(selectedIndex)]` never desyncs. A consumer should still pre-validate before advancing. **Clamp before assigning** (#592): CDK's setter *throws* on NaN/negative/out-of-range, and an unguarded index taken from a wrapper `effect` crashes change detection rather than degrading. Only re-emit when CDK **stayed put** (`actual === before`), else a clamped request double-fires, since CDK already emitted through the template forward.
    - **Reconcile a 3p's index AFTER RENDER, not in a plain `effect`** (#598 — the generalizable one). A wrapper's own `contentChildren` updates *before* the wrapped component's content query does, so a plain `effect` decides "is this index in range?" against the 3p's **previous** list — measured on cae-stepper: 3→1 shrink reads our 1 vs CDK's 3, 1→4 grow reads our 4 vs CDK's 1. Assigning from there throws out of change detection the moment a list grows and an index moves in the same tick (an ordinary "load rows, restore persisted index"). Inside `afterRenderEffect` the counts agree, which is what makes the child count usable as a dependency at all. Then guard the dependency you just gained: re-clamp **where the user actually is** (`changed ? requested : current`), never re-assert the declared index, or a structural change yanks them off a step they clicked. Costs: render hooks don't run on the server (#602), and consumers must `await whenStable()` — a bare `detectChanges()` now sees the un-reconciled state.
    - **A repair must report itself.** CDK's `steps.changes` handler writes its index signal *directly* and emits nothing, so when its `-1` decrement lands on a valid index nobody tells the consumer and `[(selectedIndex)]` sits permanently ahead of the screen (both review lenses caught this; measured). Route **every** emission — the 3p's forwarded output included — through one method that records what the consumer was last told, or the repair re-announces an index the 3p already reported.
    - **A repair moves focus in BOTH wrong directions — fix each with a different signal** (#598 steal, #604 strand). *Steal:* the 3p focuses the newly-selected header whenever focus is inside the widget, so an automatic repair drags the user off something they chose (WCAG 3.2.5, measured: header 0 → 1) — capture `document.activeElement` *before* assigning, restore if it survived. *Strand:* when the focused element was **destroyed**, focus is already on `<body>` before the reconciler runs, so `activeElement` can no longer tell removal from a deliberate park — capture on **`focusin`** instead and gate the restore on `remembered.isConnected === false` **plus** `activeElement === body` (the second stops you yanking focus from a widget the user tabbed to), and **clear the marker the moment it is detached** — spent whether or not the restore fired, or a later unrelated change yanks focus in with no user action. **Restore to the element the 3p nominates as its tab stop (`[tabindex="0"]`), never to a positional index.** CDK's `FocusKeyManager` can still point at a destroyed header after a no-op repair; `_onKeydown` does `selectedIndex = activeItemIndex`, so handing focus to a header it disagrees with re-throws the out-of-bounds error (measured). In that state NO header carries `tabindex="0"`, so targeting the tab stop makes the code decline instead of arming a crash — a restore you must skip is better than one that crashes on Enter (#611).
    - **Reaching into a 3p private — the D-623 shape** (#611 keyboard trap, #605 refused repair). Allowed only when the public seam is *closed exactly in the case that needs it*: CDK's `set selectedIndex` re-syncs the key manager, but inside `if (this.selectedIndex !== index)`, and the desync happens precisely when it did not change; the same setter gates backward assignment on `steps[index].editable`, which refuses an identity repair onto a non-editable step. Verify that by reading the 3p source before concluding there is no seam. Then **three guards, all three**: (1) a **feature-detect** (`typeof mgr?.updateActiveItem === 'function'`) that degrades to the pre-fix behaviour rather than throwing, plus a test proving the degraded path still works; (2) a **shape-pin test** asserting the private exists *with a meaningful value* (`activeItemIndex === 0`, not just truthy — a truthiness check passes against a stub), so a 3p bump fails in CI and not in a user's keyboard; (3) an **upstream report**, and drop the local reach when it lands. Two further lessons: prefer the *narrowest* private (`updateActiveItem` sets the active item **without** focusing — `setActiveItem` focuses, which is a steal on a repair; CDK picks between them on `_containsFocus()` only for a real selection change), and **gate a bypass on the reason it is sound** — forcing a refused assignment is justified only when nothing moved and just the index shifted, so gate on `!changed && byIdentity >= 0`; widening that gate breaks the whole `[linear]` refusal contract (measured: 4 tests, including the original #40 ones).
    - **A rendered attribute lags the state it derives from.** After repairing a 3p's internal index, the DOM attribute bound to it (`[tabIndex]="_getFocusIndex() === …"`) does not re-render until the *next* pass — so a same-pass DOM lookup for the repaired value finds the stale one and the fix silently does nothing (measured: focus stranded on `<body>` despite a correct key manager). Read the repaired **state**, not the DOM it will eventually produce, and keep the DOM query as the degraded fallback.
    - **A snap-back can only answer a request the component RECEIVES** (#607 — the boundary of the two rules above, and it applies to every signal input, not just this one). Re-requesting a *refused* value from a plain mutable property never arrives: the first refusal reports back and drives the host property to the live value, so the identical second write leaves nothing for Angular to observe — no signal, no dirty view, so the binding expression is never re-evaluated and the reconciler never runs. Measured on cae-stepper by instrumenting **both** the binding expression and the effect: the expression evaluates exactly three times (`0, 1, 0`), all inside the FIRST attempt, then never again; `markForCheck()` does not change it. The consumer's property is then left sitting on a step that is not rendered. **Unfixable from inside a component that is never invoked** — so document the host contract (bind a signal) rather than hunting for an emit rule that recovers it. Note the filed cause can be wrong here: #607 was filed as an input round-tripping `1 → 0 → 1` and being deduped, which the instrumentation refuted.
    - **Scope a positional child lookup to your OWN 3p instance.** `host.querySelectorAll('mat-step-header')[i]` also matches a NESTED `cae-stepper`'s headers (measured: 12 matches for a 4-step stepper, since Material stamps every step body eagerly). Horizontal hides it — all outer headers precede any body — but **vertical interleaves header/body pairs**, so the index lands on an inner header. Filter by `h.closest('mat-stepper') === myStepperEl`. A nested test only has teeth if the restore index is **≥ 1**; at index 0 the scoped and unscoped lookups agree.
- **Pure DI, no re-stamping** (cae-accordion #77): `hostDirectives:[MatAccordion]` + `<ng-content>`. Projected `cae-expansion-panel`s reach the accordion via `inject(MAT_ACCORDION, {optional:true, skipSelf:true})` walking **up the declaration-tree injector** (a content-projected child sees the projecting host's providers — Book 01 §3.3), so no template re-stamping is needed. Single-expand's auto-close **fires `expandedChange`**, so `[(expanded)]` self-syncs with no reconciliation (contrast the stepper's silent linear refusal). `multi`→**`multiple`** alias (PrimeNG + cae-select-button parity).
- **Structural `*matXxxDef` + `dataSource`/`childrenAccessor`** (cae-tree #27), **not** `@for`. WAI-ARIA **roving-tabindex** (plain-text labels + CDK `(activation)`, collapsed subtrees hidden via CSS; real-browser keyboard verify → #41).

### 5a. Composed data table — declarative config over an imperative data source (#141)

`cae-table` (the first M1 *composed display* component, no CVA) turns `mat-table`'s per-column `matColumnDef`/`matHeaderCellDef`/`matCellDef` boilerplate into two signal inputs — a `columns` config array + a `data` array — the common p-table case:

- **Dynamic columns with `@for` inside the table.** `@for (col of columns(); track col.key) { <ng-container [matColumnDef]="col.key"> … }` — MatTable queries its column defs via `@ContentChildren`, so `@for`-generated defs register and re-render when `columns()` changes. The header/row defs read a `columnKeys = computed(() => columns().map(c => c.key))`. A `sortable` column stamps `mat-sort-header` (keyboard + `aria-sort` for free); non-sortable stamps a plain `<th>`.
- **Bridge signals → the imperative `MatTableDataSource` with effects** (reach-for ladder D-13 — use Material's client-side sort/paginate facility, don't hand-roll comparators/slicing). Own one `new MatTableDataSource<T>([])`; wire it in the constructor: `effect(() => ds.data = [...data()])`, `effect(() => ds.sort = sort() ?? null)`, `effect(() => ds.paginator = paginator() ?? null)` (the `MatSort`/`MatPaginator` come from `viewChild`; the paginator's is inside an `@if (paginated())` so it resolves to `undefined` until opted in). MatTableDataSource re-renders on any of data/sort/paginator changing, so effect ordering is irrelevant. This is jsdom-testable (sort click + client paginate need no overlay), unlike `mat-select`/autocomplete panels.
- **Accessible name = a projected `<caption>`** (MatTable natively projects `caption`/`colgroup`), *or* an `ariaLabel` — **not both**: bind `[attr.aria-label]="(caption() ? null : ariaLabel()) || null"` so a present caption *suppresses* the aria-label (else the label overrides the visible caption as the name — the "label in name" caveat of the #70 naming seam). **Unconstrained** generic `<T = Record<string, unknown>>` (a *declared* interface has no implicit index signature, so `T extends Record<string, unknown>` would reject the common typed-row case at the template — verified) + a `cellText(row, key)` helper (nullish row *and* value → `''`, not `"null"`) keeps template indexing type-honest via one localized cast. Empty state = a **persistent** `role="status"` region whose text varies (`''`↔message) so a filter-to-empty transition is announced (a region stamped with its text via `@if` is not) — the Forge live-region convention. A dev-only `ngOnInit` guard throws a clear message on a duplicate column `key` (which would otherwise crash as NG0955 / MatTable duplicate-column). Consumer-facing Material union types get a `@recon-research/caelum/shared` alias (`CaeSortDirection`, mirroring `CaeTooltipPosition`) to keep Material off the public surface.
- **Deferred, not budgeted** (#85): MatTable + MatSort + MatPaginator are heavy, so the Forge demo `@defer (on idle)`s it into its own lazy chunk. Gotcha this exposed: a `@defer`'d component still pulls its *shared* Material deps (MatPaginator needs MatSelect/MatFormField/MatButton for the page-size picker) into the eager bundle when they're shared across enough chunks — this nudged Forge's initial total ~12 kB over the 850 kB warn (→ provisional raise to 875 kB, `decision` #142; the 1 mb error + the shipped-lib per-entry-point budgets are the real guards).

### 5b. Composed-over-composed — a higher-level component over the `cae-*` wrappers (#148, #153)

`cae-split-button` (a primary command joined to a secondary-action dropdown) is the M1 pattern for building *up* the stack: compose Caelum's own primitives, not raw Material, so their a11y seams and token theming come for free. `cae-menubar` (#153) applies the same recipe one scale up — a bar of triggers, each embedding a whole `cae-menu`.

- **Own the parts you must style together; borrow the parts you can reuse whole.** The two `<button matButton>` halves are declared *in this component's template* (not two nested `cae-button`s) so the joined visual — squared inner corners + a `margin-inline-start:-1px` tuck that collapses adjacent outlines into one seam — needs no cross-component-boundary styling. The dropdown is a whole `<cae-menu>` reused verbatim: its data-driven `CaeMenuItem[]`, its `caeMenuTriggerFor` seam, and its `(itemSelect)` output are delegated straight through. Rule of thumb: **inline** the primitive when the composite must restyle *across* it; **embed** the wrapper when it stands alone.
- **The a11y seam does the heavy lifting.** `[caeMenuTriggerFor]="menu"` on the toggle `<button>` puts `aria-haspopup`/`aria-expanded` + overlay keyboard handling on the focusable native button (#57) — the composite inherits correct menu semantics without touching Material.
- **Owning a native `<button>` means owning its `type`.** `matButton` sets **no** default `type`, so a bare `<button matButton>` is `type="submit"` and submits an enclosing `<form>` (the toggle would submit merely to open its menu — the 4-lens review's one confirmed major, found by all four lenses). Set `type="button"` on every owned button (the toggle always; the primary via a `type` input defaulting to `'button'`, mirroring `cae-button`). This is the correctness tax of owning the element instead of using `cae-button` (which already guards it).
- **Cross-entry-point reuse is free at runtime; re-export the borrowed types.** `@recon-research/caelum/split-button` imports `CaeMenu`/`CaeMenuTrigger` from `@recon-research/caelum/menu` (a runtime dep) and `CaeButtonVariant` from `@recon-research/caelum/button` (`type`-only, erased). ng-packagr builds entry points in dependency order and the composite's fesm just *imports* the others (not inlines them), so its size-budget row stays small and "pay only for what you import" holds. Re-export the borrowed public types (`export type { CaeMenuItem } from '@recon-research/caelum/menu'`) so the entry point is self-typing — identical re-exports dedupe, so the barrel `export *` does not collide.
- **Composed-over-composed in the demo:** Forge's "New member" split-button appends to a `members` signal that drives the `cae-table` (§5a) above it — one composite driving another, live (a persistent `role="status"` note announces each add, the §5a live-region convention).
- **Roving over a *bar* of embedded menus (`cae-menubar` #153).** A `MatToolbar` shell (`role="menubar"`) holds one owned `<button matButton>` per group, each embedding a whole `cae-menu` (the *embed-the-wrapper* rule again — each dropdown stands alone). The new piece is the *bar-level* keyboard: a CDK a11y **`FocusKeyManager`** (D-13 rung 2) over the top-level triggers gives roving tabindex, Left/Right/Home/End + typeahead, and skip-disabled, while MatMenu owns each panel (Escape-restore, item nav). Two gotchas the 4-lens review caught: (1) the bar is horizontal, so **disable vertical roving and intercept Down/Up to *open* the active panel** (`withVerticalOrientation(false)` + `menuTriggers.get(activeIndex()).open()`) — otherwise Down silently roves and the "Down opens a menu" promise is a lie; (2) the internal roving directive must be `export`ed for Angular to accept it in `imports`, so keep it out of the public surface by **name-exporting only the public symbols** from `public-api.ts` (not `export *`). The owned buttons re-apply the `type="button"` tax; a group with no items is treated as disabled (no dead-end empty menu). Its Forge demo (a deferred "command bar") drives a live command log — composed-over-composed again.

### 5c. Wrapping an *unstyled* CDK behaviour primitive — the context menu (`cae-context-menu` #157)

When the reach-for ladder (`D-13`) lands **below** Material — on a raw `@angular/cdk` primitive that ships *behaviour only, no theme* — the wrapper owns the styling that Material would otherwise give free. `cae-context-menu` wraps the **CDK Menu** family (`@angular/cdk/menu`), the right-click path `MatMenu` can't do (`p-contextMenu` → `cae-context-menu`, Book 09 §3.4; Book 05 §3.5). The recipe:

- **Bind the panel template-ref directly — no TS wiring.** A `<ng-template #panel cdkMenu>` of data-driven `<button cdkMenuItem>`s, and `[cdkContextMenuTriggerFor]="panel"` on a projecting wrapper. The *menu-panel* a11y — `role="menu"`/`menuitem`, arrow roving + typeahead, Escape-close, focus trap — is **free from the primitive** (the whole point of dropping to CDK).
- **But the *trigger* a11y is not free — make the target focusable yourself.** The keyboard route to a context menu is the Menu key / Shift+F10, which fire the native `contextmenu` event on the **focused** element (`CdkContextMenuTrigger` binds only `(contextmenu)` and sets **no** tabindex). So a `display: contents` transparent wrapper — however tidy — is a **keyboard trap-out**: a non-focusable region can never receive the Menu key, and the 4-lens review flagged exactly this (all three a11y/api/parity lenses, 0/2 refuted — the DoD "keyboard" gate, shipped broken). Fix: the wrapper gives the target `[tabindex]="items().length ? 0 : -1"` on a real box (`display: block` — `display:contents` is *not* reliably focusable) plus a `--cae-focus-ring` on `:focus-visible`, so keyboard opening works out of the box with no consumer plumbing. General rule: **when you wrap a CDK trigger, the wrapper owns the trigger's focusability**, not just the panel's.
- **Style the overlay panel token-only, with `ViewEncapsulation.None`.** The panel renders in a CDK overlay *outside* the component view, which emulated encapsulation would not reach — so use `None` + BEM-namespaced `cae-context-menu__*` classes (Material does the same for its overlay content). Panel = `--mat-sys-surface-container-high` + `--cae-elevation-2` + `--mat-sys-corner-extra-small`; item hover = a `color-mix(… var(--mat-sys-on-surface) 8/12%, transparent)` **state layer** (always visible regardless of the panel surface), and item focus gets a real `--cae-focus-ring` on **every** roved item (the CDK key manager roves onto disabled items too — `skipPredicate(() => false)` — so the ring must not be gated on `:not(.cdk-menu-item-disabled)`; only the *tint* is). `CdkMenuItem` reflects disabled as **`.cdk-menu-item-disabled` / `aria-disabled`, not the native `disabled` attr** — key off the class in CSS and assert `aria-disabled` in tests.
- **Empty model → disable the trigger, don't open an empty panel.** `[cdkContextMenuDisabled]="items().length === 0"` makes right-click fall through to the browser's own menu (the `cae-menubar` empty-items rule, applied to the target). Owned `<button cdkMenuItem>` re-apply the `type="button"` tax (#148). Reuse the `CaeMenuItem` type (re-export it) so the menu family shares one model.
- **Testability nuance (vs §9).** Unlike `mat-select`/autocomplete panels, the **CDK context menu *opens* in jsdom** (positioned at pointer coords, no geometry needed) — so panel render, `role` wiring, `type=button`, `aria-disabled`, and click activation are all jsdom-testable; only *overlay keyboard* (Escape-close) needs the M4 real-browser pass. Read a reactive input back off the directive via a **direct `ComponentRef.setInput` fixture** (the zoneless pattern), not a host-property reassign.

## 6. Service passthrough (D-15 — the injectable family)

A **root-provided injectable over a Material service** — not a component wrapper. New tree-shakable entry point. Expose a **Caelum-stable API** returning a **structural ref** (`MatSnackBarRef`/`MatDialogRef` satisfy it → returned directly, no wrapper) and a **structural config subset** so Material types stay off the public surface.

- **`CaeToast`** (#96): `open(message, action?, config?)`/`dismiss()`. **Default duration 5000 ms** (p-toast auto-dismiss; `0` = sticky, **nullish-coalesced** so an explicit `undefined` still defaults while a real `0` is honored). An **actionable** toast opens **sticky** (`duration:0`) — MatSnackBar doesn't move focus into the toast, so a timed actionable toast fails WCAG 2.2.1.
- **`CaeDialog`** (#100): `open<T,R,D>(Type<T>, config?)`/`closeAll()`/`getById()`. **Content directives via `hostDirectives`** over Material's standalone ones (`caeDialogTitle`/`Content`/`Actions`/`Close`) so consumer templates need no `@angular/material` import; plus **`CAE_DIALOG_DATA`** (a re-export of `MAT_DIALOG_DATA` — same token) and **`injectCaeDialogRef()`**. `open()` takes Angular-core **`Type<T>`**, not CDK's `ComponentType`.
- **`CaeConfirmService`** (#101): built **on** `CaeDialog` (dogfooding). `confirm(options): Promise<boolean>`; opens an internal pure-`cae-*` body as **`role="alertdialog"`**, message wired as the accessible description (header) or name (no header), **initial focus parked on the non-destructive reject by default** (an accidental Enter can't fire a destructive accept); Escape/backdrop = reject. The reject/accept marker class ↔ the service's `autoFocus` selector derive from **one shared constant** so they can't desync.

### 6a. A root-provided service that creates a *raw* CDK overlay owns no lifetime — bind one (#825, D-831)

A service passthrough over `MatDialog`/`MatSnackBar` inherits Material's disposal story for free. A service that reaches past Material to `overlay.create()` inherits **nothing**, and the gap is invisible because the two presentations look symmetrical from the call site. Three defaults conspire:

- **`OverlayConfig.disposeOnNavigation` defaults `false`** (`cdk/_overlay-module-chunk.mjs`), while **`MatDialogConfig.closeOnNavigation` defaults `true`** (`material/dialog.mjs`). So a service offering both presentations of "one contract" silently disagrees with itself on navigation — and a backdrop cannot block history navigation, so the leaked panel lands on top of the *next* route. **Know what the flag actually covers**, because its name oversells it: the CDK subscribes `Location`, whose subject is fed *only* from `onPopState`, so it fires on **Back/Forward and hash changes** and **not** on a push navigation (`router.navigate` → `Location.go` → `_notifyUrlChangeListeners`, a different channel). A push is covered only because the caller usually unmounts with the route — which is an argument for binding the caller's lifetime, not a substitute for it.
- **`providedIn: 'root'` means no `DestroyRef`**, and a method call is not an injection context, so the service cannot obtain the caller's lifetime on its own. Take it as a **required** argument (D-831 chose required over optional: an opt-in guard protects everyone except the consumer who doesn't know the leak exists).
- **`new ComponentPortal(C, null, injector)` binds the panel to `ApplicationRef`**, not to the caller's view. `viewContainerRef = null` is what makes the overlay outlive its opener.

The recipe: guard on `destroyRef.destroyed` **before** `overlay.create()` (`onDestroy` throws NG0911 on a destroyed view, and a throw *after* `create()` strands exactly the overlay you were preventing); set `disposeOnNavigation: true`; register the teardown hook **before** `attach()` so a throw there still has a route out; and net every remaining detach with `overlayRef.detachments().subscribe(() => respond(false))` — without it a CDK-initiated detach (scroll strategy, `appRef.destroy()`, navigation) leaves the returned promise **pending forever**, which is the failure mode a "one funnel" doc-comment hides rather than prevents.

Unregistering the destroy hook when the overlay settles is safe to do *from inside* that hook: Angular nulls `lView[ON_DESTROY_HOOKS]` before iterating a detached copy, so the unregister no-ops there instead of splicing the array mid-iteration. Sibling directives (`CaePopoverTrigger`) get the caller lifetime for free from their own `DestroyRef` — this whole class is specific to the **service** shape.

## 7. Packaging gotchas (ng-packagr / APF)

- **An abstract `@Directive()` base must be DECLARED in its entry point's `public-api.ts` entryFile** (#46) — `rollup-plugin-dts` tree-shakes a *re-exported* abstract base out of the bundled typings (ships an empty `export {}`, so dependents can't resolve the type). A clean/CI build reproduces it; an incremental build masks it.
- **fesm2022 retains JSDoc comments — but the size gate no longer charges for them (#603).** ng-packagr ships the FESM unminified and comment-preserving, so docstrings *are* real bytes in the published artifact. They used to be gated bytes too, and that was not a rounding error: comments were ~32% of the gzipped total across all entry points and up to ~64% of a single row, and an A/B on `caelum-stepper.mjs` had ~1.9 kB of added comments costing **+167 B** against ~1.9 kB of added code costing **+153 B** — prose was more expensive than logic. Since #603 `check-lib-size.mjs` minifies (esbuild) before gzipping, so it weighs what a consumer's build actually ships: the same A/B now costs **+0 B** for prose and **+129 B** for code. **Consequence: a breach is no longer "prose or code?" — prose is free, so a breach IS code, and the question is whether the growth is warranted.** Trimming comments to duck a budget (as #598/#592 had to) is now pointless; write the finding down. Historical row figures predating #603 refer to the legacy raw-gzip measurement and are not comparable — see `size-budget.json`'s `$comment`, and #586 for the separate order-list/pick-list duplication question.
  - **`npm run size:lib` measures the EXISTING `dist` — it does not rebuild.** Running it straight after a source edit reports the *previous* build's bytes, so a prose trim looks like it saved exactly 0 B. Always `npm run build:lib` (or a full preflight) first, then read the row — otherwise you can talk yourself out of a real trim, or into an unnecessary budget bump (#592).
- **Keeping Material types off the public API**: `@internal` + tsconfig `stripInternal` (cae-menu `panel`). Note the literal `@internal` inside a class's JSDoc *is* a `stripInternal` marker — it silently drops the whole symbol from the typings if you write it in prose. `private`/`protected` do **not** strip a member's *type* from the `.d.ts` (the bridge matcher's `ErrorStateMatcher` type IS emitted — harmless: `@angular/material` is a peer dep so it resolves).
- Each entry point is self-contained; shared types in `@recon-research/caelum/shared`; `check-lib-exports.mjs` gates folder↔`exports`↔barrel; every entry point needs a `size-budget.json` row (~15–30 % headroom over the measured minified+gzip size).

## 8. Bundle discipline — defer-before-raise (#85)

A heavy Material module used only by a **below-the-fold Forge demo** is wrapped in **`@defer (on idle)`** into a lazy chunk **instead of raising the initial-bundle budget**. Use **`on idle`, not `on viewport`**, so deferred content is only *transiently* absent (never scroll-stranded for a screen-reader/keyboard user). Watch the **value+type import trap**: a shared *value* import of a deferred component counts as an eager use and defeats the split → import the type with `import type`. Forge budget: **875 kB warn / 1 mb error** (the warn was 850, provisionally raised for shared-dep hoisting when the table landed — `decision` #142; the 1 mb error is the hard guard); a boundary test asserts the `@defer` block count so an un-defer regresses red.

**Deferring a *service* buys the bundle win and a liveness gap — guard the continuation (#915).** `@defer` is declarative and Angular owns its lifecycle; a hand-rolled `await import()` in a click handler has no such owner. Forge's `renameWorkspace()`/`deleteWorkspace()` both resume with `this.injector.get(…)` once the chunk lands, and nothing awaits those handlers — so destroying the component inside that gap (navigate away mid-chunk, or a test finishing) resumes the continuation against a torn-down injector and throws **NG0205 as an *unhandled rejection***, which the runner attributes to whichever test is running when node reports it. Price the gap honestly: the cold chunk measured **265 ms** on windows-latest. One line after every such `await` closes it — `if (this.destroyRef.destroyed) return;` — keyed on the **component's** `DestroyRef`, *not* injector liveness, because the realistic user path leaves the root injector alive and would otherwise open a modal owned by nothing. (Distinct from #825/D-831's seam: `confirmAt` takes a caller `DestroyRef` because it owns a raw CDK overlay; this window is *before* the service is ever injected.)

## 9. Testing (Book 17)

- **Vitest / jsdom** is the v22 default runner. Geometry-dependent overlays (MatSlider) still defer to the **real-browser a11y pass** (#41/#79/#110 family). **But "jsdom can't open CDK overlays" was too broad, and the over-claim shipped a bug**: the `matAutocomplete` panel attaches fine under real `focusin`/`input`/`keydown` dispatches, as `autocomplete.spec.ts`'s #897 block proves. That header claim is what justified testing the component "at the boundary via direct handler calls" — which measures handler *bodies* and proves nothing about template wiring, so `(optionSelected)` could be deleted with the suite green (#889 → #897, #900). **Prefer real dispatched events; make a component-boundary handler call the documented exception, not the default** — and before recording a harness limitation, defeat the mechanism once to check it is real (§9e's rule for negative and browser-only claims). The #900 migration landed the counter-suite and priced the gap: nine binding deletions, each of which had left the whole file green, now each fail. Two traps it surfaced. **A mutation that stops the build is not a test kill** — deleting `[matChipInputFor]` unmatches Material's selector so its sibling bindings fail NG8002, and a harness reading only the exit code scores that `KILLED`; a drafted assertion resting on it was inert and was deleted, so classify compile breaks separately. And **a hand-rolled `KeyboardEvent` needs `keyCode`** — Material branches on `event.keyCode === BACKSPACE`, which is `0` when the event is built from `key` alone, so the keystroke silently no-ops and the assertion after it passes against anything.
- **A poll bounded by iterations is not bounded by time (#915).** `await new Promise(r => setTimeout(r))` yields for the *clamped* minimum (~1 ms), so `for (let i = 0; i < 25; i++)` is a **~25 ms budget wearing a retry count's clothing** — while reading to every reviewer as 25 generous chances. Forge's confirm poll lost that race to a 265 ms cold `import()` on windows-latest and reported it as *"the dialog never attached"*; the abandoned continuation then poisoned the next test (§8). Budget async waits in **milliseconds against a deadline**, take the number from a measurement and say so in the comment, and keep it under the suite's own ceiling (#886) so a breach arrives as your named assertion, not an opaque runner timeout. Better still, delete the race: `await import()` yields at least a microtask even when cached, so destroying **synchronously** after the call makes a teardown test deterministic with nothing to slow down artificially. Two harness traps came with it — a `--filter` narrower than the mutated code's callers manufactures SURVIVED rows (filtering `#915` excluded the only tests calling the mutated helper), and a `NOBUILD` classifier matching a bare `/NG\d{4}/` matches your own test *titles*.
- **Overlay-service tests** (toast/dialog/confirm): await ref signals, use `openDialogs` for state, direct-invoke lazy handlers (see the memory note on deterministic overlay testing).
- **Every public-API / a11y slice gets a 4-lens ultracode adversarial review** before merge (lenses: cva-forms / a11y / api-design / arch-packaging, adapted per slice).
- **A `*.browser.spec.ts` must load the theme itself** — call `loadCaelumTheme()` from `testing/theme.ts` before creating the component. The `test-browser` target has no `styles` option, so without it the page carries no theme, every token read goes invalid-at-computed-value-time, and axe's `color-contrast` silently compares *unstyled defaults* — green, and worthless (#724). Three traps it exposes: a custom property computes as a token stream (`--cae-color-on-surface` reads back as literal `light-dark(…)` in Chromium too), so assert the **used** value (`getComputedStyle(el).color`), which is what axe reads; any geometry assertion written on a themeless page is measuring a **0px border** — compare against the content box, not the border box; and **half a theme looks exactly like a whole one** (below).
- **Load the whole bridge — and don't mistake "the rule ran" for evidence.** `_tokens.scss` emits the `--cae-*` properties and **zero** `--mat-sys-*`; only `_theme.scss`'s `mat.theme()` emits Material's seam. Caelum is a library of Direct wrappers, so loading only the token layer left nearly every shipped component resolving colour and font against an undefined property — `cae-button` rendered as bare serif text with no container on four of five variants (#736, found via #732's goldens). **Since D-757/#413 the superset is no longer `_theme.scss` itself** — that file is mixin-only, so compiling it as a `styleUrl` emits the token layer and, again, zero `--mat-sys-*`. `loadCaelumTheme()` compiles `testing/_theme-probe.scss` (`@use … as caelum; @include caelum.theme();` — the real adoption line); point a new probe at `_theme.scss` and you silently restore this exact bug. The instructive part is the *diagnosis*: the obvious guess — "axe reported `color-contrast` as `incomplete`" — is **wrong**, and measurably so. In a browser the rule lands in `passes` either way; what differed was *which colours it judged*. An assertion that the rule was evaluated is therefore inert (it holds identically before and after the fix); assert the rendered result instead — a painted container, a themed foreground.
- **Find the #405 work by grepping the components' own prose.** A doc block that says *"verified in a real browser at M4"* is an **unverified claim** with a known expiry, and they are enumerable (6 carried one; a plain `grep` under-counts — comment wrapping splits the phrase, so flatten `\n * ` first). Richer than the #405 checklist, which missed `cae-listbox` entirely. Two of them were promises about **placement** that the jsdom spec "covered" only as **DOM order** — different claims: `cae-toolbar`'s groups bunch 440px from the end edge with `flex-grow: 0`, and every existing order assertion still passes. When the browser confirms the claim, rewrite the prose to point at the spec, or the deferral note outlives the deferral.
- **A browser spec needs teeth in-file.** Passing geometry can't distinguish *"the mechanism works"* from *"the layout happened to look right anyway"*, so pair each claim with an arm that **neutralizes its mechanism at runtime** (`host.style.display = 'block'`, `spacer.style.flex = '0 0 auto'`) and asserts the collapse. That arm is a permanent guard, not a one-off mutation test — and it doubles as executable proof of *why* the CSS exists: `cae-divider`'s vertical rule really does measure 0px tall without `display: contents`.
- **Drive real interaction with `userEvent` from `vitest/browser`** (not `@vitest/browser/context` — deprecated in v4). It delivers genuine key/pointer events to the focused element, which is precisely the half a jsdom spec has to stub — `slider.spec.ts` fires the component's own `valueChange` output because a synthetic `input` never reaches `MatSliderThumb`. **How wide that gap is, measured:** severing the range slider's `[value]="start()"` binding — so every start thumb renders at 0 regardless of the bound form value — leaves **all 1674 jsdom tests green** and fails only the browser spec, because the jsdom range tests can assert the component's internal signals but never a rendered thumb. When a jsdom spec's header says it asserts *component state* instead of the DOM, that delta is the browser spec's job.

## 9a. Don't assert ARIA a native control already implies

`cae-slider`'s thumbs are `<input type="range">`. A first pass asserted `aria-valuenow` and found `null` — but that is **correct**: the implicit `slider` role makes the browser derive `valuenow` from the element's `value`, so a hand-written attribute could only drift out of sync. Material supplies `aria-valuetext` on top, and that *is* assertable. The source's docstring had claimed Material sets both (corrected in #405). Two habits this pays for: probe the real element (`outerHTML`) before believing an ARIA assumption, and pin the absence (`expect(el.hasAttribute('aria-valuenow')).toBe(false)`) so a well-meaning "fix" that adds the redundant attribute fails.

## 9b. Visual regression — pin the render, don't tolerate the drift (#732, #735)

`*.vr.spec.ts` files run under the separate `caelum:test-vr` target (`npm run test:vr`) and compare each component against committed PNGs in its `__vr__/`. Four arms — `light|dark` × `comfortable|compact` — because that is the cross product `_tokens.scss` actually branches on (`:root[data-theme]` flips `color-scheme`, hence every `light-dark()`; `[data-density=compact]` re-scales spacing **and** re-emits Material's density arm — two emitters under one attribute, which is the half #413 turns on). Comfortable is the *unattributed* default, not a third value.

- **Goldens live in `__vr__/`, never `__screenshots__/`** — the latter is where Vitest drops *failure* captures and #240 gitignored it. Write goldens there and they stay untracked: green forever locally, nothing to compare in CI.
- **A missing golden is CREATED, not failed.** So anything that changes the golden's filename — engine, platform, both of which are in it — silently mints a *parallel set* that passes locally and CI never compares. Hence `resolveVrBrowser()` refuses a Firefox fallback and refuses a non-Linux host outright, rather than doing the helpful thing.
- **Pin the typeface; do not tolerate the difference.** `_tokens.scss` asks for `Roboto, system-ui, …` and *none* of those is guaranteed installed, so the generic tail decides and fontconfig answers differently everywhere: **measured**, `sans-serif` → Noto Sans on a dev box, **WenQuanYi Zen Hei** (a CJK face) in the Playwright image, which share only six font families and have no Roboto between them. That is a different typeface, not a hinting nuance — no pixel tolerance could absorb it. Pinning `Liberation Sans` (shipped by `fonts-liberation`, which is in Playwright's own `--with-deps` list) makes host and container agree **exactly** at `threshold: 0, includeAA: true`. The trade, recorded on purpose: goldens do not rasterize the *shipped* font, because this suite hunts token regressions and font noise would drown them.
- **The tolerance you don't need.** With the render pinned, zero tolerance works — and a one-unit channel shift (`#1565c0` → `#1565c1`, invisible) fails the two light arms while dark stays green. Reach for `allowedMismatchedPixels` and you have started measuring the wrong quantity; remove the instability instead (`vr.ts` freezes animation, transition, caret and ripples for the same reason).
- **A golden is also a theme-liveness check.** The first VR run rendered `cae-button` unstyled and *passed* — four distinct md5s, four worthless images. Look at the PNG before trusting a golden; that inspection is what surfaced #736 (see §9), which `vr.ts` now inherits via `loadCaelumTheme()` rather than carrying its own theme host.
- **A pin that wins by document order must be re-asserted every test.** The font pin is a plain `:root` custom-property declaration, and Angular re-injects the theme stylesheet on each `TestBed` reset — landing it *after* the frozen-motion sheet. `freezeMotion`'s `if (already present) return` guard therefore surrendered the cascade from the second test onward: measured with a probe, `--cae-font-body` read `'Liberation Sans'` in arm 1 and reverted to the shipped `Roboto, system-ui, …` stack in arms 2–4, so **three of every four goldens were rasterized unpinned** — #735's exact failure, reintroduced by the mechanism meant to prevent it. It is invisible on one machine by construction: an unpinned stack only becomes different *pixels* in a second environment. `appendChild` an existing node to move it; don't early-return.
- **Extend the set only against a second environment.** The dev box alone cannot falsify a portability claim. Running the container arm is what exposed the above — and it flagged **only the card and table body copy**, because those are the components with text Material does *not* font: a card's title and subtitle have `--mat-card-*-font` tokens, its content has none and simply inherits. Which leads to the next one.
- **Give the page the app-shell text contract.** Caelum deliberately does not style a consumer's `body`; Forge sets `font-family/font-size/line-height` from the tokens and real apps are expected to. A VR page has no shell, so inherited text fell through to the **UA default serif** — `cae-card` body copy rasterized in serif beside a sans title. Not a library defect, but it pictured text no consumer sees *and* escaped the font pin, since the UA serif differs per environment. `renderArm` now sets background, colour, font, size and line-height from tokens.
- **Make the failure fast and legible.** `expect.element()` is `expect.poll()` underneath and retries the whole matcher; settling is already handled by `toMatchScreenshot`'s own `timeout`. Measured: a real one-unit token regression took **15093ms** and reported `Test timed out in 15000ms` — a regression disguised as a hang, diff buried. Capped via `VR_POLL` at the call site (`test.expect.poll.timeout` has no effect through the Angular builder), the same mismatch reports in **~400ms** as `Screenshot does not match the stored reference.`
- **The golden-update path is an env var, not a flag.** `@angular/build:unit-test` has no `update` option, so `ng run … -- --update` is rejected outright — the spelling a first pass will document and nobody will test. `scripts/test-browser.mjs` takes `--update` and translates it into `CAELUM_VR_UPDATE=1` for the child (`npm run test:vr:update`), which also keeps it portable: an inline `VAR=1 npm run …` does not survive PowerShell.
- **"Representative by token surface" needs auditing against the tokens, not eyeballed.** The original five (#732) covered surface, elevation, radius, type and density — and missed the **status palette** entirely. Not a judgement call in hindsight: #425 darkened two *shipped* primitives (`--cae-amber-40`, `--cae-green-40`) and the suite stayed **20/20 green**. Correct for those components, blind for the library. `cae-tag` (#745) closes it in one component — all four severities, and the only golden that exercises `color-mix` at all. When adding to the set, prove the new arm sees something the old ones can't: reverting the amber fails exactly the two **light** tag arms and nothing else in the suite.
- **Diffs need a writable `.vitest-attachments/`.** A container run without `--user "$(id -u):$(id -g)"` leaves it root-owned, and the next host run writes no diff at all — the CI artifact upload then has nothing to upload on a genuine failure.

## 9c. Token contrast is a *token-layer* contract (#425, #744)

`theming/contrast.browser.spec.ts` resolves every semantic foreground against every surface token in both schemes and asserts WCAG 1.4.3's 4.5:1. It is a browser spec for the reason in §9 (a custom property computes as a token stream; only a **used** value resolves `light-dark()`), and it belongs at the token layer because the alternatives can't see the gap: axe judges only the pairings a component happens to render, and a VR golden sees a colour change without any opinion on whether it is *readable*.

- **The binding surface is the darkest one in the scheme, not `-base`.** Measured for `--cae-color-warn`: 4.24:1 on `--cae-surface-base` but **3.65:1 on `--cae-surface-sunken`**. #425 quoted only the base figure and so under-stated its own defect — a value tuned against white still fails in a sunken container. Check every surface a component may legally paint behind the text.
- **A contrast test's vacuity mode is that it passes *hardest* when measuring nothing.** An undefined or misspelled custom property is invalid at computed-value time, so `color` falls back to **inherited** and `background-color` to `transparent` — a probe whose tokens all died reads near-black on white, ~19–21:1, the most comfortable pass in the suite. Same family as #724/#736 (§9). The guard: paint the probe's ancestor a sentinel (`rgb(255,0,255)`) and **throw** on "still the sentinel" / "not an opaque `rgb()`" rather than scoring it. Mutation-tested — a typo'd token name fails in both schemes with `is undefined — color inherited the sentinel`, and the message is itself the proof that the inherit path is real. **The two halves fail differently and need separate mutations:** `color` inherits (→ sentinel), but `background-color` does not — it falls to `transparent`, which serializes as `rgba(0, 0, 0, 0)` and so *matches* an rgb-shaped regex, reading as **opaque black**. A first pass caught only the `color` half; measured, a dead surface token then scored a light dark-scheme foreground at ~17:1 and passed. Reject any alpha ≠ 1.
- **Measure the whole family before picking a fix.** #425 assumed the error/success siblings shared warn's defect. They don't: `--cae-color-error` clears 4.5:1 on *every* surface (4.84 at worst) and is correctly used as text today; `--cae-color-success` failed only on sunken, and only by 0.09. Three tokens, three different verdicts — a blanket "these are fill-only" rule would have been wrong on two of them, and the cheap fix (darken two hex values, no new API) only became visible once the numbers existed.
- **Pin the *spread*, not just the floor.** The three status colours are held within 0.5 of each other on the binding surface, so a tweak that rescues one into compliance while leaving its siblings visually mismatched fails. A per-token floor alone would pass that.

## 9d. Style components from `--cae-*`, and prove the bridge is bound (D-04, #510)

Component styles read **Caelum's** tokens, never Material's `--mat-sys-*` seam — the bridge runs one way (`_theme.scss` re-points `--mat-sys-*` *at* `--cae-*`), so reading the far side works but inverts the authority D-04 grants. Convention is a **bare** `var(--cae-*)`: 604 usages carry no fallback against 10 that do, and those 10 are either `data-grid` (the optional-peer component) or genuinely consumer-settable knobs (`--cae-splitter-gutter-size`, `--cae-tt-level`) where the second argument is a *default value*, not a safety net.

- **Don't copy a `--mat-sys-*` fallback across as the migration target (#496).** `var(--mat-sys-surface-container-high, transparent)` bridges to `--cae-surface-raised`; the `transparent` is the unthemed degraded path, and a sweep that maps the fallback silently inverts a surface. Read the target off `_theme.scss`'s override block, not off the declaration you're replacing.
- **Dropping the fallback costs nothing real.** It only ever fired when `@recon-research/caelum/styles/theme` was absent — and in that state the component's other ~50 token reads (spacing, radius, elevation, focus ring) have already failed, so the one surviving colour was never rescuing anything. `cae-table`'s sticky-header comment made this argument first.
- **A token absent from the override block is a *value* question, not a rename.** `--mat-sys-corner-extra-small` is unmapped, so it still carries Material's own default — migrate it only after measuring what that default is. Compile the theme and read it (`npx sass --load-path=node_modules --load-path=projects/caelum/styles`); here it measured 4px, identical to `--cae-radius-sm`, which turned an assumed restyling into a pixel-exact rename. The assumption had been recorded on the ticket as fact and was wrong.
- **`mat.theme-overrides()` ignores unknown keys silently — so pin the map.** `theming/bridge.browser.spec.ts` asserts every bound pair resolves to the same **used** value in both schemes. Comparing the raw custom properties cannot work (one side reads `var(--cae-color-on-surface)`, the other `light-dark(#1a1c1e, #e6e7ea)` — two unresolved strings). Mutation-tested with a one-character key typo: Material's default and Caelum's token diverge to `rgb(224,226,236)` vs `rgb(138,144,153)` in dark — a glaring two-tone theme that no other gate saw. Its vacuity guard is §9c's, plus one for lengths: `border-radius` doesn't inherit, so a dead token reads `0px`, and no radius Caelum ships is zero.

## 9e. Verifying roving tabindex in a real browser (#405 — `cae-tree`, `cae-listbox`, `cae-accordion`)

Roving-tabindex components share one browser-spec shape: assert **exactly one** `tabindex="0"` and **all remaining** items at `-1` (both counts, so an item carrying no `tabindex` at all fails), then drive real keys through `userEvent` from `vitest/browser` and read `document.activeElement`. The traps are what the shape doesn't tell you.

- **A negative claim needs its vacuity guard *inside the same test*.** `cae-accordion` used to document that it did **not** rove, and pinned that absence. "Focus did not move" is exactly the assertion that also passes when the harness delivers no keys, the fixture is detached, or the header can't take focus — so the same test pressed **Enter on the same element** afterwards and asserted it toggled, proving the arrows were *inert* rather than *undelivered*. Don't lean on a sibling test for that; test order is not a dependency. **The claim was since inverted (#759, §9k) and the test flipped to a behaviour test** — which is the second half of the lesson: pinning a limitation is what makes fixing it a legible, mechanical diff instead of an argument.
- **Prove *why* a behaviour holds before calling it browser-only.** `cae-tree` stamps collapsed descendants into the DOM and hides them with CSS, so "Down skips the hidden subtree" looks like a layout-dependent claim. It isn't: forcing the subtree visible (`display: block !important`) and roving again still lands on the next sibling — the CDK skips by **expansion state**, and that arm would pass in jsdom too. Worth asserting anyway, paired with the render check, because the two mechanisms are independent and the invariant is that they *agree*; but the file must say which half the browser is actually buying.
- **`offsetParent !== null` is the rendered-vs-merely-stamped discriminator.** jsdom returns `null` always, so it cannot tell a hidden node from a visible one — this is the genuine browser-only lever for any component that renders more DOM than it shows.
- **Measure the key manager's contract; don't assume it.** Material's list key manager **wraps** (Up from the first option lands on the last) and **roves onto disabled options** rather than skipping them (aria-disabled-focusable). Both were asserted the other way first and both were wrong. They're user-visible contracts a Material upgrade could flip silently, so pin them.

## 9f. Live regions: assert the mutation, and measure timing on the production path (#405, #762)

An `aria-live` region announces a **change to a watched node**, so the testable contract is a *mutation type*, not a DOM state — and reading `textContent` after a tick cannot tell "text changed in place" from "node arrived already holding text" (the reliably-silent case). Instrument with a `MutationObserver`: assert ≥1 `characterData` record on the region and **zero** additions of the region carrying text. Pair it with the reason the node survives being emptied — `display: none` prunes it from the a11y tree and un-watches it, so a clip-based hide is load-bearing and is a *computed-style* assertion only a browser can make.

- **`fixture.detectChanges()` is the wrong instrument for anything timing-sensitive.** Under zoneless CD it completes the whole tick — including `afterNextRender` and the re-render that follows — inside one synchronous call, so any claim of the form "empty first, message on the next pass" is invisible through it. Drive `ApplicationRef.tick()` and sample across real `requestAnimationFrame`s instead. That is what showed the grid's status message landing synchronously (`atCreate="" | syncAfterTick="No data." | rAF1="No data."`), i.e. with no painted empty frame at all.
- **A guard that survives mutation is not automatically inert** (cf. the usual "kills 0 tests ⇒ delete it" reading). It may be guarding something the harness cannot observe — here, a11y-tree timing. Distinguish the two by measuring the production path *before* concluding; if the mechanism turns out to be unobservable rather than absent, file it (#762) rather than writing a test shaped to pass.
- **Hide an empty live region by CLIPPING it, never with `display: none`** — and assert that in the **populated** state. `display: none` prunes the node from the a11y tree and un-watches the region, and that is precisely the state a "table is empty" region sits in for the entire time the table *has* rows — i.e. right up to the transition it exists to announce, which then lands on a region nothing was watching. Found in **both** `cae-table` and `cae-tree-table` (which had copied each other; its template comment said *"Mirrors cae-table"*) while `cae-data-grid` had the rule and the reason written in its own stylesheet — a defect class, so **grep the siblings whenever you find one**. The trap for the test author: the mutation-record assertion above does **not** catch it (Angular updates the same text node either way, and by the time the region holds text it is displayed even when buggy). The single guard is `expect(getComputedStyle(region).display).not.toBe('none')` **while the region is still empty** — confirmed by mutation, which killed that assertion and left the mutation-type one green.

## 9g. Focus geometry: sticky occlusion and animation-gated focus (#405 — `cae-table` #254, `cae-confirm` #107)

Two browser-only failures that a jsdom spec cannot express, and that both look fine if measured slightly wrong.

- **Measure the element that carries `position: sticky`, not the one you picture.** Material applies sticky to the header **cells**; the `<tr>` box scrolls away beneath them, so `thead tr` reports the un-stuck position and reads as *"sticky is broken."* Read `thead th`. Same trap for any sticky pattern — assert on the styled node.
- **A focus-occlusion test only bites on a *short* move.** Chromium **centers** an element that is far out of view, so jumping across the table parks a control comfortably clear of the band — measurably identical with sticky **on and off** (`scrollTop 1442->108`, `btnClear=85` both ways), which also proves Chromium is *not* sticky-aware. Reproduce the real hazard by stepping back **one row**, the minimum-scroll case: the control lands flush at clearance `0`, inside the pinned band (WCAG 2.2 SC 2.4.11). Then assert the fix — `scroll-padding-block-start` equal to the header height — with the *same* movement. The two arms discriminate each other by construction: one asserts obscured, the other clear, under configs that differ only by the padding.
- **Re-focusing an already-focused element scrolls nothing.** `el.focus()` when `el` is already `document.activeElement` is a no-op, so a probe that scrolls and then re-focuses the same node measures nothing and reports "no change" — which is easy to misread as "no hazard". Move focus via a *neighbour*.
- **Focus can be gated on an animation, so no amount of flushing reaches it.** Material defers a dialog's `_trapFocus()` until the open animation ends: `sync=BODY | stable=BODY | task=BODY | raf=BODY | +50=BODY | +100=BUTTON`. Neither `whenStable()` nor a macrotask nor a rAF gets there. Wait on the **settled state** (`vi.waitFor`), and split the wait from the claim — one helper absorbs "the surface took focus" so the assertion below reads as *wrong element*, never *not yet*. The same gap means the modal does not contain focus while it is open (#765).

## 9h. Settle the render before axe reads colours (#779)

axe grades `color-contrast` from **composited** colours, so an assertion fired mid-animation judges
the blend rather than the component. `cae-confirm`'s dialog has a settled **5.746:1**; scanned while
~89% opaque it graded **4.408** and failed CI — on a palette that is fine.

- **Recognise it by the alpha, not the colour.** Recover the implied alpha per channel from
  `reported = settled + (background - settled) x (1 - a)`. One *consistent* alpha across R/G/B is a
  compositing snapshot; a real token defect does not blend uniformly. Here: 0.8932 / 0.8961 / 0.8889.
  Do this before routing the failure into the contrast track (§9c) — the two look identical in a CI
  log and have nothing in common.
- **Focus-settled is not render-settled.** Material defers `_trapFocus()` to the open animation's
  *done* event, which makes "focus landed" feel like a settle signal. It isn't: the
  `.cdk-overlay-backdrop` transition is still running at that moment, and under a slowed enter so are
  the container and surface transitions.
- **Ask the browser, don't sleep.** `getAnimations({subtree: true})` plus `await a.finished` waits
  exactly as long as needed; a fixed delay is either dead time or a flake generator (#765).
- **Exclude infinite animations or you swap a failure for a hang.** `cae-progress-spinner`'s
  indeterminate arc never completes, so awaiting its `finished` never resolves and the suite dies by
  timeout, reporting nothing. Filter on a finite `endTime`.
- The wait belongs in `expectNoA11yViolations` itself (`testing/animation.ts`), not in each caller —
  the hazard is "run axe after a state change", not any one overlay. It no-ops in jsdom.


## 9i. A gate exemption must be re-derived, not recorded (#773)

The capability ledger shipped with **no** exemption field on purpose: a field that lets a row opt
out of its evidence is the obvious way to let anything be waved through. When one genuinely-exempt
case appeared (`@recon-research/caelum/shared` is type-only, so axe has nothing to scan), the fix was not to trust
the recorded reason but to make the gate **re-prove it from the source on every run**.

- **Record the reason for the reader; derive the grant from the code.** `exempt: {reason}` is
  documentation. What actually grants it is `runtime_exports()` finding no runtime export in the
  entry point — the exemption cannot be pointed at anything that renders.
- **Design for the day the premise stops holding**, which is the whole point. Add a component to an
  exempt entry point and the exemption does not quietly persist: the gate fails naming the file and
  the row drops back onto the ladder as a visible gap. An exemption that can outlive its fact is
  just a rubber stamp with extra steps.
- **Fail toward "not exempt".** The two error directions are not symmetric: over-matching only
  refuses an exemption (the entry point falls back to needing a real assertion), while
  under-matching grants one to something that renders. Bias the detector accordingly.
- **A silent detector needs its own corpus.** This one's failure mode is invisible — weaken it and
  every exemption still passes green. So it carries a `--selftest` corpus (real shapes *and* the
  prose that must not trip it) run quietly inside `--check`, i.e. by every preflight and CI run,
  with no separate stage to forget. Prove the corpus bites by neutralising one branch of the
  detector — a guard nobody has ever seen fire is indistinguishable from an inert one.
- **Exempt rows leave the denominator, not the report.** `64/64 + 1 exempt` — folding an exemption
  in as a pass, or leaving it in as a gap, both misreport the fraction the milestone gates on.

## 9j. Scan the state the contract lives in, not the pristine one (#773)

A sweep that adds one axe assertion per component reliably scans each component's *default* render,
because that is what a fresh fixture gives you. Measured across this library, that left **zero** axe
assertions covering a form control in its **error** state — and the error state is where the
`mat-form-field` family's least-obvious contract lives: `matInput` *suppresses* `aria-invalid` on an
empty required field, so the linked `<mat-error>` is the only thing that announces the failure.

- **Ask what state the claim is about**, then render that one. For the shared base
  (`CaeFormFieldControlBase`) the claim is about the error bridge, so the test marks the control
  touched and asserts through a *real* subclass (`cae-input`), not the synthetic one the unit tests
  use — a bare `<span>` is not the DOM the base produces in practice.
- **Guard the scan against vacuity in both directions.** The message must be **rendered** (or axe
  grades a pristine field and proves nothing) *and* **referenced** by `aria-describedby` (the actual
  point — an unlinked `<mat-error>` looks fine and is inaudible).
- **Mutation-test every new axe assertion.** Inject a known violation (an `<img>` with no `alt` is
  reliable and universally detected) into the exact root being scanned; if the test stays green the
  scan is not reaching that DOM. A dangling `aria-labelledby` idref is *not* a usable probe — axe
  grades it `incomplete`, not a violation.
- **Watch the scan root.** `expectNoA11yViolations()` defaults to `document.body`, not `document`:
  the unit harness's own page has no `<title>` and no `lang`, so a `document`-rooted scan fails on
  page-level rules before it ever reaches the component. Overlays still land in scope — they attach
  under `<body>`.


## 9k. Feeding a 3p key manager across a view boundary (#759, D-623)

A wrapper that renders a 3p's child **inside its own view** silently breaks that 3p's `@ContentChildren` query — content queries don't cross a component view boundary. `cae-accordion` lost APG arrow-key roving exactly this way: `MatAccordion`'s `FocusKeyManager` was alive and receiving keys (the header's `_keydown` forwards them, and its focus monitor calls `_handleHeaderFocus`), but its **item list was empty**. Diagnose before rebuilding: the missing piece is usually just the list.

- **Supply the list; don't stand up a second manager.** Reusing the 3p's own manager keeps `withWrap()`, `withHomeAndEnd()`, and the focus→active-item sync that makes ArrowDown continue from the header the user *tabbed* to. A hand-rolled manager must re-implement all three and keep them in step forever. Recipe: child exposes its inner instance via `viewChild` marked `/** @internal */` (`stripInternal` keeps it out of published typings); parent collects with `contentChildren`, then in an **`afterRenderEffect`** resets the 3p's own list. Mirror the 3p's ownership predicate verbatim — Material's is `header.panel.accordion === this` — so nested instances stay disjoint.
- **`contentChildren` defaults to `descendants: false`** — *measured*, and the opposite of the note in `contentChild`'s adjacent doc comment, which is easy to misread as covering both. Omit it and a panel wrapped in a plain `<div>` is never collected, so it never roves — a parity gap against the very 3p being wrapped (Material queries with `descendants: true`). Two boundaries, don't conflate them: `descendants` controls plain-element depth, while a nested **component's** content is out of reach either way.
- **`reset()` is not enough — `notifyOnChanges()` is what re-maps the active *index*.** The manager reads its item array lazily, so roving works without the notification; but it tracks the active item positionally, and only the notification tells it a focused item moved. Insert a panel above the focused one without it and the next ArrowDown goes backwards. Same failure as #611 — and it stays invisible until a test changes the list *while an item is focused*.
- **After-render, not `effect()`.** The 3p's `ngAfterContentInit` resets that list from its own (empty) query. Only the after-render phase is guaranteed to run after every lifecycle hook in the pass, so the write is never the clobbered one. Diff against the list's **live** contents rather than a cached copy — that's what makes the repair self-healing after a 3p re-reset instead of guarding itself away.
- **Roving focus ≠ roving tabindex.** Material binds `[attr.tabindex]="disabled ? -1 : tabIndex"` on *every* header, so arrows are additive and each header stays independently tabbable. Re-homing into one tab stop would drop the rest out of the Tab order — assert the all-tabbable shape so the "obvious" fix can't land silently.

## 9l. `ngDoCheck` is a *parent-view* hook — it runs before your own template binds (#741)

A wrapper that pokes its inner 3p control from `ngDoCheck` is reading state the inner control does not have yet. Lifecycle hooks belong to the view that **declares** the node, so on the first pass `ngDoCheck` fires while the wrapper's own template is still unexecuted — every `[input]` it binds on the inner control is unset. `CaeFormFieldControlBase` bridged validity this way and a control marked touched *before* `[formControl]` bound rendered no error at all: `updateErrorState()` found `[errorStateMatcher]` unbound, fell back to Material's DI-default matcher, evaluated it against the inner control's deliberately-absent `NgControl`, and latched `false`.

- **Recompute once after the first render.** `afterNextRender(() => this.updateInnerErrorState())` in the base constructor closes exactly the startup gap and nothing else. Prefer it to `ngAfterViewInit` on a base class: subclasses can define their own and silently forget `super`, whereas a constructor-scoped hook cannot be overridden away.
- **Steady state is not evidence.** Every *later* transition repairs itself — a `[formControl]` swap re-enters `ngDoCheck`, and a programmatic `markAsTouched()` emits on `control.events`, which the CD nudge turns into another check. Only the pre-binding case emits nothing, because the flag is already set when the subscription is created. A bug that repairs itself on the second event looks like a timing flake; it is an ordering defect.
- **The symptom points at the wrong layer.** `touched` was never lost — measured `true` on the control throughout. Confirm *which* side dropped the state before fixing either; here a plausible "Angular forms drops pre-binding touched" story would have produced a fix for a bug that did not exist.
- **Test it on a real subclass, and pin the premise.** The base's stub-subclass specs cannot see this — the mechanism *is* the real Material binding order, so a stub host passes with the fix deleted. Assert the host is genuinely pre-touched **and** that the control emits nothing afterwards; the zero-emission count is what proves the recompute did the work rather than an incidental nudge.
- **Second instance — an `@if` arm swap, which nothing later repairs (#901).** `cae-autocomplete` switches its inner `MatFormFieldControl` between a `matInput` and a `MatChipGrid` on `[multiple]`. The same ordering applies mid-life: on the pass that flips the input, `ngDoCheck` runs *before* the `@if` stamps the new arm, so the incoming control is still `undefined`. Unlike the startup case there is **no self-repair** — both `MatChipGrid.ngDoCheck` and `MatInput.ngDoCheck` gate their own `updateErrorState()` on owning an `NgControl`, which this family deliberately never gives them (#46) — so the field renders *valid* over an invalid model until some unrelated CD pass, which zoneless may never schedule. Fold the recompute into the wrapper's `afterRenderEffect` and read the `viewChild` signals inside it: the arm swap then becomes its own trigger, with no new subscription. **Test both directions** — the defect is symmetric, and a recompute accidentally scoped to one arm passes a one-way test.

## 10. Interactive hit targets — floor with `--cae-target-min` (WCAG 2.5.8, #456)

**Any custom clickable affordance** (icon button, nav arrow, expand/collapse toggle, indicator dot, remove/clear `×`) MUST floor its hit target with the density-INVARIANT `--cae-target-min` (24px) — **never** size it off the `--cae-space-*` scale, which tightens under `[data-density=compact]` (space-5 → 16px, space-4 → 12px, space-2 → 6px) and drops the target below the WCAG 2.5.8 (AA) 24×24 CSS-px minimum. The gap is **silent**: jsdom does no layout, so `theming/density.spec.ts` guards only the *token* (`--cae-target-min ≥ 24`), not its per-affordance use — code review + the M4 browser pass (#240) are the only checks.

**Flooring uniformly is a house convention, deliberately stricter than the success criterion** — say it that way rather than calling every sub-24px control a WCAG failure. 2.5.8 carries exceptions that often apply: **Spacing** (an undersized target conforms if a 24px circle centred on it doesn't intersect *another target's* circle — non-interactive content isn't a target, so an isolated splitter divider likely already conformed) and **Equivalent** (order-list's grip duplicates the move buttons). We floor anyway because those exceptions are brittle under consumer layout — but an honest justification matters when the floor itself costs something (see the splitter bullet). By technique:

- **Square icon button / toggle** — `min-inline-size: var(--cae-target-min); min-block-size: var(--cae-target-min)`. For a *borderless* toggle (`border:0; background:none`) this grows only the invisible tap area; the glyph stays centred, unchanged. Keep any existing `inline-size/block-size: var(--cae-space-N)` (the min dominates) — consistency with the `tree-select __clear` precedent.
- **Small visible mark (indicator dot)** — floor the *button* to `--cae-target-min` (inline-flex, centred) and draw the smaller visible mark in a `::before`; sizing the button itself off `--cae-space-2` gives a 6px target (galleria/carousel `__indicator`). On a *primary* pager that can have many pages add `flex-wrap: wrap` so the wider floored strip doesn't overflow a no-wrap controls row.
- **Leaf/branch alignment coupling** — a toggle-width compensator on sibling rows (`tree __row--leaf` padding, `tree-table __toggle-spacer`) MUST track the *floored* footprint (`calc(--cae-target-min + gap)`, or floor the shared rule), or leaves go ragged once the toggle jumps to a fixed 24px. Fix the compensator in the same change.
- **Thin drag/resize affordance between scrollable panes** (splitter `__gutter`) — a *visible* 24px floor wrecks the pane layout, so extend an invisible `::before` **hit-slop** along the cross-axis instead — but **keep it gated to `@media (pointer: coarse)`**. This bullet used to prescribe the slop "on all pointers"; #456 tried that and backed it out, because on a divider it is a net regression that two independent review lenses caught: the panes set `overflow: auto`, so each pane's **native scrollbar sits flush against the divider** and ~9px of a ~15px scrollbar silently becomes a drag handle; a pane collapsed to `minSize: 0` puts two dividers side by side, where the later one's slop swallows the earlier one's visible body (#544); and a positioned descendant in the *following* pane out-paints the trailing half (#545). Coarse pointers hit none of this (overlay scrollbars) and are where a thin target actually fails a user. **Derive** the extension from the invariant token — `calc((<visible-thickness> - var(--cae-target-min)) / 2)` per side — never a fixed `--cae-space-*` slop, which is itself sub-floor under compact (a 6px gutter + 2×6px of space-2 slop measures 18px: the trap that hid in the original rule). Single-home the thickness in a `--_cae-*` custom property so the visible size and the slop can't drift.
- **In-flow grip** (order-list `__handle`) — a drag grip in normal flow is **not** a slop case: floor it *visibly* (`min-inline/block-size` + `inline-flex` centring). Unlike a slop it cannot claim presses meant for the row content beside it — prefer this whenever the affordance can grow. Note it also floors the row height (grip + padding), so check the row rhythm. A bare glyph grip is the usual offender: its box is the ~14px line box, tracking the *type* scale rather than the target token.
- **Check what actually receives the pointer before flooring a child** — and then leave it alone. Several drag-shaped affordances are not targets at all: image-compare's `__handle` is `aria-hidden` decoration over a press-anywhere `__track` (#318) that is already the real target; order-list/pick-list row-drag and image-preview pan target the whole row/image; a native `<textarea>` resizer is a UA control (2.5.8 exempt). Flooring such a child is not belt-and-suspenders, it is a silent **layout change** justified by an a11y rationale that doesn't apply — #456 nearly shipped exactly that (a `min-inline-size` on image-compare's handle would have overridden its flex automatic minimum and widened the visible circle; #546).
- **Text / label button** — floor `min-block-size: var(--cae-target-min)` + `box-sizing: border-box` always (Caelum ships no reset, so a bare consumer is content-box; without border-box the floor stacks on the padding and overshoots). A `<label>` needs `inline-flex` + `align-items:center` to centre; a native `<button>` centres itself. Add `min-inline-size` too **only** for a no-inline-padding label that can be narrower than 24px (breadcrumb crumbs, `padding:0`) — *not* for a padded/always-wide label (file-upload `__button`, `padding-inline: --cae-space-4` = 24px at compact).

- **A 3p-supplied affordance you re-skin is still yours to floor** — "custom" above undersells the rule. `matChipRemove` is *Material's* trailing action, and it measures **18×18 at every density**: not a density collapse, simply under-spec, so `cae-autocomplete`'s chip `×` failed 2.5.8 in all three arms (default included) until #900. Scope the floor with your own class **plus** Material's (`.cae-autocomplete__remove.mat-mdc-chip-remove`) to win on specificity without `!important`. The tell that a wrapper owes this check: you re-skinned the affordance (here, a `<svg>` glyph replacing Material's icon) without ever measuring its box.

Token policy: ARCHITECTURE §3.1 (D-19). Applied: galleria/carousel/lightbox/image-preview navs & dots, order-list/pick-list btns, tree/tree-select/tree-table toggles, tree-select `__clear`, breadcrumb link/button, file-upload buttons, password/split-button toggles, splitter gutter (coarse slop), order-list grip, autocomplete + chip + chip-set `×` (#282, #456, #900, #925). **Falsify a floor with `--cae-space-5`** (24px at default — the WCAG number itself — and 16px at compact, so it kills the compact arm *alone*), never `--cae-space-6` (32 → 24, still legal, so it survives and reads as a missing test). Audited and deliberately *not* floored: image-compare handle, order-list/pick-list row-drag, image-preview pan, textarea resizer.

## 11. Type sizing — `em` for glyphs, `--cae-text-*` for text (#509)

Both idioms are correct; they answer different questions, so **neither is swept away**. The test is *what the size is relative to*:

- **A glyph that must track the text it sits beside ⇒ `em`.** An icon inside a button, a `✓`/`−` inside a checkbox, a `×` clear mark, a sort caret, a star. These are drawn at a multiple of their *own control's* font-size, so they stay proportional when a consumer sizes that control — a fixed rem step would leave the glyph visually detached the moment the control's text changed size. `cae-icon` makes this explicit: it draws at `1em` of the local font-size, so `split-button __chevron` sets `font-size: 1.25em` to scale it. Applied: `data-grid __sort-icon` (0.85em), `tree-select __clear` (1.1em) and `__checkbox` (0.75em), `split-button __chevron` (1.25em), `rating __icon` (1.25em).
- **Text that is a step on the type scale ⇒ `var(--cae-text-*)`.** Hints, help/secondary lines, status and error text, size/percent labels. These belong to the *document's* scale, not to whatever font-size an ancestor happens to carry, so `em` here makes the text re-scale on an unrelated wrapper change — a silent, hard-to-trace drift. Applied: `file-upload` size/percent/error/done, `datepicker`, `tag __label`, `password __capslock`.

**Why this is written down rather than mechanised:** #509 read the mix as a convention that had drifted and proposed sweeping one idiom onto the other. Auditing all six `em` sites showed the opposite — five were glyphs and correct; exactly one (`password __capslock`, a secondary-text hint) was on the wrong side, and it moved to `--cae-text-sm` (numerically identical at a 1rem parent, so a no-op visually and a fix semantically). A blanket sweep would have made the five *wrong*. There is no gate for this: `check_theming` scans for hardcoded colours and `font-px` literals, and a ratio like `1.25em` is neither — code review is the only check, so the classification has to be legible here.

## 12. A composite ARIA role owns a *subtree*, not the visual frame (#718)

`table` / `grid` / `treegrid` / `listbox` / `tree` permit only their specific children (`table` → `row`, `rowgroup`, `caption`). A component's **visual frame** — the bordered, clipped, `position: relative` box — usually needs to hold more than that: a `role="status"` live region, a pager, a toolbar. Putting the role on the frame therefore makes those siblings **disallowed children** (axe `aria-required-children`, *critical*), and AT may announce them as table structure.

- **Split the two elements.** The frame keeps the border/radius/`overflow:hidden` and the `position:relative` overlay anchor; an inner wrapper carries the role and wraps *exactly* the tabular content. The wrapper repeats the frame's flex column and adds nothing else, which makes the split **layout-inert** — verify that by measuring against a `display: contents` control (it reproduces the pre-split box tree; `data-grid` matched byte-for-byte). Don't *ship* `display: contents` on a role-bearing element: browsers have historically dropped such nodes from the a11y tree, and axe reads the DOM, so it would never catch it.
- **A global-ARIA attribute makes a wrapper opaque.** axe recurses through role-less elements, so a plain `<div>` between the role and its rows is fine — but a `<span aria-live="polite">` (the pager's range label) counts as an owned child in its own right. Bare structural wrappers are safe; anything carrying `aria-*` or a role is not.
- **Test both arms.** The defect is *conditional*: `data-grid`'s unpaginated axe spec passed for months while the pager arm — buttons, `<select>`, the `aria-live` range — was never scanned at all. When a role's subtree changes with an input, every arm needs its own run.
- **A `disableRules` carve-out is a suspect, not a settled fact.** This one blamed jsdom's empty rowgroup and masked a real critical that *jsdom could see all along* — removing it failed 2 jsdom specs immediately. Re-derive the stated reason before trusting one. It was also the repo's **only** component carve-out (the sole remaining use is `testing/a11y.spec.ts` exercising the suppression mechanism itself), so "sweep the carve-outs" is a heuristic that is now spent — don't plan around it.

## 13. `track $index` is safe only while the rendered child is stateless (#774)

Data-driven lists in this library started out tracking `$index` — and that is correct only while
the rows are pure renderers: every visible byte comes from a binding, so re-keying just re-binds.
`cae-context-menu` and `cae-breadcrumb` still qualify. Two did not, and each was found by *auditing
the stated exception list rather than trusting it*: `cae-menu` when its branches gained submenus
(#150) and `cae-menubar`, which stamps a `caeMenuTriggerFor` per group (**#879**). The family
comment in `panel-menu.ts` names the current audit — keep it honest when a member changes side.

It stops being correct the moment the child owns state the parent never binds. `cae-panel-menu`
composes `cae-expansion-panel`, whose `expanded` flag lives **inside Material** and is not bound by
the menu — so `$index` reuse handed a surviving panel's open state to whatever item landed on that
position. Reproduced: open a branch, drop it from `model`, and its *collapsed* sibling renders
*expanded*. No error, no failing test — a nav filtering by permission or search just shows the wrong
sections open.

- **The question to ask of any `@for`** is not "are the items stable?" but **"what state does the
  child hold that isn't a binding?"** — expansion, scroll position, uncommitted input text,
  animation phase, focus. Any of those ⇒ track identity.
- **Probe the trade before switching.** Measured on Angular 22: the same item object twice within
  one level, and one shared across levels, both render **without throwing**, so `track item` adds no
  new crash mode here.
- **It does add a consumer contract** — stable object references; don't build the model in a
  template expression, or the panels re-stamp and expansion resets. Document it on the component.
- **`$index` still has a job.** The D-596 icon context's `index` is genuinely positional; only the
  track key changes.

## 14. A content query and a row's DI both key off the *declaration* site (#150 — `cae-menu`)

Wrapping a 3p that finds its children by `@ContentChildren` **and** lets each child inject the
parent: recursion has to be a **component**, not a recursive `<ng-template>` + `ngTemplateOutlet`.

- **Why.** Both mechanisms follow where a template is *declared*, not where its view is inserted. A
  recursive `ng-template` declared outside `<mat-menu>` put every row outside the panel's query
  scope, so `MatMenu` matched **zero** items — `FocusKeyManager` empty, roving focus and typeahead
  dead — while every would-be submenu trigger injected the *outer* panel and opened as a standalone
  menu that closed its own parent.
- **It renders perfectly.** The rows are in the DOM and every assertion about markup, ARIA,
  emission and depth passes. The only observable symptom is **focus**, so that is where the guard
  belongs: open the panel and assert arrow keys actually move `document.activeElement`.
- **The `cae-panel-menu` idiom is not transferable.** Outlet recursion is fine *there* because
  `cae-expansion-panel` needs neither mechanism. Ask what the wrapped 3p resolves by query or DI
  before reusing a recursion shape.
- **Corollary — don't credit the wrong mechanism.** Material *also* filters rows by injected parent
  panel, but with a component boundary that filter is a no-op; naming it as the reason is worse than
  silence, because it is exactly what would *not* have caught this.

## 15. Prose inside a `template:` literal ships; JSDoc does not (#150)

The per-entry-point size gate charges for HTML comments in a component's `template:` string.

- **Why.** They are string *content* of a template literal, so the minifier cannot drop them — they
  land in the published FESM. Verified by grepping a comment's text out of `dist/`, and by
  `caelum-panel-menu` breaching its budget by 53 B on a **comment-only** edit.
- **JSDoc is free** — it minifies away. So keep explanatory prose in the class doc and leave short
  pointers in the template. Doing that took `caelum-menu` from **2779 B (90%) to 2099 B (68%)** with
  no documentation lost, and let the budget land at 2560 instead of 3072.
- **Triage rule.** `size-budget.json`'s own `$comment` said "prose is now free, so a breach IS code".
  That is true for JS/JSDoc only; it has been corrected in place. On a breach, check *where* the
  prose lives before bumping a row.
- **Any shipped *string* is charged, not just template prose** — same mechanism, other locations.
  A `console.warn` argument is the common one: it survives minification like template content does,
  even inside `if (isDevMode())`. #855's four-line warning cost ~300 B and trimming it to one line
  recovered 84 B of a 216 B breach. Prose in a comment is free; the same sentence in a string is not.
- **A bump is still legitimate when the growth is code.** After the trim, #855's drawer was +132 B
  from three real behaviours, and `size-budget.json`'s stated policy is that real growth bumps the
  row deliberately with 15-30% headroom. Trim what is prose, then bump for what is not — the
  anti-pattern is bumping *first*, which bakes the waste in ([[repeated-gate-bumps-mean-wrong-units]]
  is the same error one level up).


## 16. Parity or deviation? Measure upstream before classifying a "bug" (#919)

A ticket that reports wrong behaviour may be reporting *correct parity*. The classification decides
**whose call the fix is** — a bug-fix ships on the agent's judgment, a deviation from PrimeNG is a
`decision` for the owner (`CLAUDE.md` §3).

- **Order: reproduce → measure upstream → then classify.** Reproducing first stops you arguing about
  a phantom; measuring second stops you shipping a deviation as a bug-fix. #919 reproduced three
  ways (one the ticket hadn't named), and *still* turned out to be parity.
- **Docs are not the measurement — read the source.** PrimeNG's own page did not document the case
  at all; `autocomplete.ts` did (`updateInputWithForceSelection` resolves a typed label to its key
  only under `forceSelection`). "Not documented" is not "no constraint".
- **Our own shipped docs count too.** `MIGRATION.md` §5.1 already stated the behaviour #919 wanted
  changed. A documented contract is a promise; changing it is a deviation even where upstream is
  silent.
- **Deviating is often right** — Caelum already flips this control's headline default. The point is
  that the *choice* routes to the owner: reversible ⇒ file the `decision`, proceed provisionally,
  carry `Provisional on #NN` in the PR body, keep working. Reversibility here rested on nothing being
  published and **D-850**; post-1.0 the same fork is the park-and-switch branch.
- **Sibling trap, same slice.** When a *pre-existing* test fails from your change, ask whether its
  **subject** is affected or only its **setup**. #901's trigger-resync test broke because its token
  happened to be an option label — incidental. Updating its expectation would have been wrong twice
  (a resolved key is *taken*, so `filtered()` empties and `panelOpen` reads false for an unrelated
  reason). Re-key the fixture to something the new rule cannot touch, and comment why.


## 17. A component `effect` runs *before* its own template bindings reach a 3p (#857)

When you reconcile a third party's internal state against a value your own template binds to it, the
reconcile has to run in the **after-render** phase. A component `effect` does not.

- **The failure is silent.** `cae-drawer-container` binds `[hasBackdrop]` to `<mat-drawer-container>`
  and then re-pokes Material so its focus trap and `inert` recompute. Written as `effect(() => …)`
  the poke fired *before* the binding reached Material, so it asked Material to recompute from the
  value it already had — a fix that ran, touched the right object, and changed nothing. The tests
  went green on the *other* half of the slice; only the reproduction showed it.
- **Use `afterRenderEffect`** for this shape: it runs after the DOM write, so the 3p has the new
  input. Reserve plain `effect` for reconciling your *own* signals, where no binding is in the path.
- **How to tell them apart before writing either.** Ask: does the code I am about to run read state
  that a *template binding in this same component* just wrote? If yes, a plain `effect` is racing
  its own template. The dependency is invisible in the effect body — it reads `hasBackdrop()`, not
  the Material instance — which is why this survives review.
- **Verify the lever separately from the wiring.** The poke itself (re-assigning an unguarded 3p
  setter its current value) was proven in isolation *first* — `beforePoke=true` → `afterPoke=null`
  — which is what made "the lever works, the timing does not" a two-minute diagnosis instead of a
  rewrite. Related: [[probe-by-failing-assertion]] for getting real runtime values out of vitest.

## 18. A guard that reads *projected* content is not reactive (#863)

Projected content is not a signal. A dev guard that inspects `<ng-content>`'s rendered text runs when
its own signal deps change — and a consumer changing the message changes none of them.

- **The blind spot lands on the recommended path.** `cae-alert`'s WCAG 1.4.1 "no message" guard is an
  `afterRenderEffect` keyed on `visible()`/`severity()`, reading `.cae-alert__content`'s `textContent`.
  It fired on mount and on toggles, but never on `<cae-alert>{{ errorText() }}</cae-alert>` going
  `'Boom'` → `''` — which is precisely the arrangement the class doc *recommends*. A guard is worth
  least exactly where the docs send people.
- **The fix is a dev-only `MutationObserver`**, disposed via `DestroyRef.onDestroy`. Observe
  `{ subtree: true, childList: true, characterData: true }`: interpolation updates arrive as
  `characterData` on a text node *below* the queried element, so dropping `subtree` silently loses
  them (mutation-tested — it kills the runtime-emptying specs).
- **Re-point the observer from the render effect, not once at init**, whenever the observed node
  lives inside an `@if`. Hiding and re-showing destroys it and renders a fresh one; an observer
  attached only at first render is left watching a detached node forever.
- **Latch the warning.** The callback fires per mutation *batch*, not per empty-transition, so an
  unlatched guard re-warns on unrelated projected churn. Clear the latch when the content is
  non-empty again, or the *second* real emptying goes unreported — both directions want a spec.
- **Same trap, other components:** any `querySelector` + `textContent` check inside a projection
  boundary (`cae-tag`'s #669 convention, and anything copying it) inherits it.

## 19. Hiding a region blurs whatever is inside it — and the window to react is one frame (#870)

Collapsing by `[hidden]` (rather than `@if`) still strands focus: the engine blurs the unrendered
element and `document.activeElement` becomes `<body>`, so the keyboard user loses their place (WCAG
2.4.3).

- **Measure the 3p before claiming you exceed it (§16, again).** The first draft of this entry said
  "`MatExpansionPanel` and `p-panel` both do this" and framed the fix as Caelum exceeding Material.
  A review lens read the source: `MatExpansionPanelHeader` subscribes `panel.closed` filtered on
  `_containsFocus()` (itself `activeElement` + `contains`) and focuses the header via
  `focusVia(el, 'program')` — the same technique, the same destination, and no `preventScroll`
  either. It is *convergent design*, and the correction strengthened the slice: Material is prior
  art for both decisions. `p-panel` stays **unmeasured** — primeng is not installed, and §16 asks
  for source, not assumption. Say "unmeasured"; do not round it to "the same".
- **The component usually cannot cause it, which is why it survives review.** `cae-panel`'s and
  `cae-fieldset`'s toggles sit *outside* their own content region, so the click path always leaves
  focus on the toggle. The reachable paths are a control *inside* the region, and anything
  programmatic — a timer, a route change.
- **An external *button* is the exemplar that does not work.** On Chromium/Firefox `mousedown`
  focuses the button, so focus has already left the region before the handler writes the model. A
  demo built around one therefore exercises none of this — check that the shipped example reaches
  the code it advertises, or the liveness gate passes on a path nothing can travel.
- **The fixup is deferred to the next rendering opportunity, so `afterRenderEffect` is inside the
  window.** Measured in Chromium: synchronously after the model write and CD, `activeElement` is
  *still* the now-hidden element; one frame later it is `<body>`. So a post-render read can still ask
  "was focus inside me?" — no pre-write capture is needed. #870 assumed the opposite and specified a
  `collapsed`-write interceptor; measuring first replaced it with four lines. **Pin it with a
  mutation**: deferring the redirect by a single `requestAnimationFrame` must turn the browser arm
  red, or the timing claim is decorative.
- **A frame later the question is unanswerable** — `activeElement === body` cannot distinguish a
  collapse from a deliberate park (the `external-removal-focus-restore` trap).
- **Scope the target with a view query, never a host `querySelector`.** A component that can nest
  inside itself will match the *inner* instance's control first in document order, and focus lands in
  a different component — inside the region just hidden. `viewChild` cannot see into projected
  content, which is exactly the boundary wanted. Grade this **per component**: the query lives in
  each component's own source, so a two-component family needs a nested fixture for *each*, or one
  half regresses green.
- **Pin the region's *scope*, not just the containment test.** Passing the component host instead of
  the content region survives a suite built the obvious way — but the toggle is inside the host, so
  every collapse-by-click re-`focus()`es the already-focused toggle, and `focus()` re-runs
  scroll-into-view whether or not focus moved. Assert that a collapse with focus already **on** the
  toggle calls `focus()` zero times.
- **Read `activeElement` off the region's own root.** `document.activeElement` retargets to the
  outermost shadow host, so a panel mounted inside a `ViewEncapsulation.ShadowDom` consumer gets an
  *ancestor* — containment is false, and the guard declines *and* skips its own warning.
  `region.getRootNode().activeElement` is identical in light DOM and correct in both shadow
  directions. CDK's `_getFocusedElementPierceShadowDom` is the wrong tool: it pierces **down**, and
  `contains()` does not cross shadow boundaries, so it breaks the case that already worked. And
  unlike the focus fixup, **jsdom does model shadow retargeting** — a host with
  `encapsulation: ViewEncapsulation.ShadowDom` kills the mutation in the unit suite, so this one is
  pinnable rather than documentation-only. Assert `shadowRoot.activeElement`, and use
  `document.activeElement === host` as the positive control that retargeting really happened.
- **jsdom grades none of this.** It never blurs a hidden element, so both the strand and the window
  are invisible: every jsdom assertion about the redirect passes on a runner with no fixup to outrun.
  jsdom owns the redirect (the component's own `focus()` call) and the dev warning; the browser arm
  owns the timing and the residual strand.
- **When there is nothing to focus, say so rather than inventing a target.** With no toggle rendered
  there is no control belonging to the component; a `tabindex="-1"` host would be a focusable
  non-interactive element whose announcement nobody here can verify. A dev warning naming the
  consumer's two ways out keeps the gap loud and honest (decision #951).

## 20. Bound a self-recursive component per *node*, not per *path* or per *depth* (#877, #880)

A component that stamps itself for nested data (`cae-menu` on `CaeMenuItem.items`) inherits the
model's shape as its recursion depth — so a cyclic model recurses forever. Two things make that
worse than it sounds, and both are why the guard has to be structural rather than a `try/catch`:

- **It happens at the first change detection, not on open.** A branch's nested panel is projected
  content, and Angular *creates* projected views eagerly, deferring only their DOM insertion.
  Nothing has to be opened, hovered or clicked. Angular also leaves the view dirty on throw, so the
  next scheduled tick re-attempts it.
- **The 3p's own recursion guard will not catch it.** `MatMenu` throws only when a panel is its own
  *direct* parent; under a component recursion every level is a distinct instance, so the check
  never fires. Verify what the 3p actually guards before relying on it (§16).

**Depth counting is the wrong instrument** — a depth cap invents a limit the model never stated and
turns a legal deep tree into a broken one. But the obvious replacement is wrong too, and the gap
between them is the lesson:

- **Path-scoped ("is this item one of my ancestors?") terminates without bounding.** Walking a DI
  parent chain is cheap, needs no depth counter, and passes every self-loop and mutual-pair test.
  It also lets *every simple path* through a cyclic graph unroll, because each path stays legal
  until it repeats. Measured on a symmetric 7-node graph — every item listing the other six, which
  is what a graph-flavoured API produces by accident — that was **1957 panels and 2377 ms of
  blocking first change detection**, growing factorially; ten nodes is ~986k panels. It replaced a
  fast, loud `RangeError` with a silently frozen tab, and the dev warning never printed because view
  creation is what hung. **A termination proof is not a boundedness proof** — an adversarial lens
  caught this by asking for a *dense* cycle, not another shape of small one.
- **Node-scoped ("is this item on a cycle at all?") bounds it.** One colouring DFS over the model
  per model change: an item still on the current path is a back edge, and back edges are exactly the
  cycles. Mark those items, and the recursion stops at the *first* sighting — `O(V+E)`, and the
  7-node graph renders one disabled row. It is also **less code**: the DI lookup, the internal
  input threading ancestry down, and the ancestor walk all delete.
- **On-path and already-finished are different sets, and conflating them kills legal models.** A
  subtree object reused under two *sibling* branches is a finite DAG — a shared "Share…" submenu is
  exactly that — and it must render in full under **both** parents. A visited-ever check passes
  every cycle test and silently drops the second sibling, so **open both** in the spec; opening only
  the first is the vacuous version of that test.
- **Compare by object identity, not by label or id.** `Settings ▸ Advanced ▸ Settings` is two
  distinct objects sharing a name — an ordinary menu, not a cycle. Nothing else in a suite tends to
  repeat a label, so a label comparison survives every other arm; it needs its own spec.
- **Break unconditionally; warn only in dev, and put the gate *outside* `effect()`.** Gating the
  *break* on `isDevMode()` leaves production non-terminating, which is the one build where you
  cannot see why (#955). Gating from *inside* the effect body still allocates and schedules an
  effect node per instance — 259 of them for one 4×6 menu. Keep the message terse: a runtime string
  is shipped bytes (§15) while the reasoning next to it in JSDoc is free.

**The same predicate answers "should this render as a branch at all".** Once a component asks "can
this item open a usable panel", a *cycle* and *every child disabled* are the same answer with two
causes — a row that has children but no panel worth opening. Rendering that as a **disabled leaf**
keeps the family's no-dead-end rule without inventing a selection: it is neither a trigger that
opens an empty panel (Material parks focus on the bare `role="menu"` div, where the arrows do
nothing and only Escape recovers) nor a command that emits an item the model never offered. Note
`[].every(…)` is vacuously **true**, so an explicit length test is what keeps an *empty* `items`
array an ordinary enabled leaf — and that distinction needs its own spec, because the mutation that
breaks it is a one-character edit.

**Deadness is not transitive here, and that is a known hole rather than a design.** `cae-menu` reads
each child's own `disabled` flag, so a branch whose only child is *itself* a dead end still opens a
panel with one disabled row — the same strand, one level in. Filed rather than fixed because it
predates the slice; the point for a reader is that "no dead ends" and "no dead ends *transitively*"
are different claims, and the cheap predicate only buys the first.