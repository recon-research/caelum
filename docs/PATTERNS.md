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

### 2a. `mat-form-field` controls → **extend `CaeFormFieldControlBase`** (`caelum/form-field`, #46)

`cae-input` / `cae-textarea` / `cae-select` / `cae-autocomplete` extend it. The base provides the **string CVA** (`value()` signal, `commitValue()`, `writeValue`/`registerOnChange`/`registerOnTouched`/`setDisabledState`), the shared inputs (`label`/`placeholder`/`hint`/`required`/`disabled`/`appearance`/`ariaLabel`/`errorMessages`), and the validation-error-forwarding bridge. Each subclass adds only its specifics (type/attrs/IME for input, `rows` for textarea, `options` for select/autocomplete) + a one-line `updateInnerErrorState()` seam over its own inner control.

**The error-forwarding bridge** (#29 established, #47 extended): self-inject the **outer** `NgControl` (and **drop the `NG_VALUE_ACCESSOR` provider**), install a per-control `ErrorStateMatcher` that delegates *timing* to the DI `ErrorStateMatcher` (Material's default `invalid && (touched||submitted)` is identical to what we'd write — so **no `CaelumErrorStateMatcher` is shipped**, and an app root can still override), and **recompute in `ngDoCheck`** via the abstract `updateInnerErrorState()` (Material's own pattern — resilient to `[formControl]` swaps and the `resetForm()` model-before-`submitted` staleness; `control.events` only nudges CD for programmatic zoneless changes). `errorMessages` (`CaeErrorMessages`, in `caelum/shared`) renders `<mat-error>`.

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
- **Cross-entry-point without a runtime dependency**: type-only seams live in `caelum/shared` (`CaeTooltipPosition`; the structural `CaeMenuPanelHost`), imported with `import type` (erased). The panel resolves through the public **`CaeMenu.getMenuPanel()`** (over a now non-required `@internal` `panel` viewChild), synced into cae-button via an `effect`.

## 5. Content projection & DI coordination

- **`<ng-template>` + `contentChildren`** (cae-tabs, cae-stepper): the child (`cae-tab`/`cae-step`) captures its content in an `<ng-template>`, the parent collects children with `contentChildren` and stamps them via `ngTemplateOutlet`. **Tab bodies are lazy; stepper steps stamp eagerly.** A form control declared inside a projected step binds to the ancestor `FormGroup` (ControlContainer resolves through projection).
  - **cae-stepper `[linear]`** (#40): forward `cae-step.stepControl` → `mat-step`; drive Material's `selectedIndex` from an `effect` that reads its index back **`untracked`** and **re-emits on a refused linear move** (Material refuses silently, no event) so `[(selectedIndex)]` never desyncs. A consumer should still pre-validate before advancing.
- **Pure DI, no re-stamping** (cae-accordion #77): `hostDirectives:[MatAccordion]` + `<ng-content>`. Projected `cae-expansion-panel`s reach the accordion via `inject(MAT_ACCORDION, {optional:true, skipSelf:true})` walking **up the declaration-tree injector** (a content-projected child sees the projecting host's providers — Book 01 §3.3), so no template re-stamping is needed. Single-expand's auto-close **fires `expandedChange`**, so `[(expanded)]` self-syncs with no reconciliation (contrast the stepper's silent linear refusal). `multi`→**`multiple`** alias (PrimeNG + cae-select-button parity).
- **Structural `*matXxxDef` + `dataSource`/`childrenAccessor`** (cae-tree #27), **not** `@for`. WAI-ARIA **roving-tabindex** (plain-text labels + CDK `(activation)`, collapsed subtrees hidden via CSS; real-browser keyboard verify → #41).

## 6. Service passthrough (D-15 — the injectable family)

A **root-provided injectable over a Material service** — not a component wrapper. New tree-shakable entry point. Expose a **Caelum-stable API** returning a **structural ref** (`MatSnackBarRef`/`MatDialogRef` satisfy it → returned directly, no wrapper) and a **structural config subset** so Material types stay off the public surface.

- **`CaeToast`** (#96): `open(message, action?, config?)`/`dismiss()`. **Default duration 5000 ms** (p-toast auto-dismiss; `0` = sticky, **nullish-coalesced** so an explicit `undefined` still defaults while a real `0` is honored). An **actionable** toast opens **sticky** (`duration:0`) — MatSnackBar doesn't move focus into the toast, so a timed actionable toast fails WCAG 2.2.1.
- **`CaeDialog`** (#100): `open<T,R,D>(Type<T>, config?)`/`closeAll()`/`getById()`. **Content directives via `hostDirectives`** over Material's standalone ones (`caeDialogTitle`/`Content`/`Actions`/`Close`) so consumer templates need no `@angular/material` import; plus **`CAE_DIALOG_DATA`** (a re-export of `MAT_DIALOG_DATA` — same token) and **`injectCaeDialogRef()`**. `open()` takes Angular-core **`Type<T>`**, not CDK's `ComponentType`.
- **`CaeConfirmService`** (#101): built **on** `CaeDialog` (dogfooding). `confirm(options): Promise<boolean>`; opens an internal pure-`cae-*` body as **`role="alertdialog"`**, message wired as the accessible description (header) or name (no header), **initial focus parked on the non-destructive reject by default** (an accidental Enter can't fire a destructive accept); Escape/backdrop = reject. The reject/accept marker class ↔ the service's `autoFocus` selector derive from **one shared constant** so they can't desync.

## 7. Packaging gotchas (ng-packagr / APF)

- **An abstract `@Directive()` base must be DECLARED in its entry point's `public-api.ts` entryFile** (#46) — `rollup-plugin-dts` tree-shakes a *re-exported* abstract base out of the bundled typings (ships an empty `export {}`, so dependents can't resolve the type). A clean/CI build reproduces it; an incremental build masks it.
- **fesm2022 retains JSDoc comments** — docstrings ship as bundle bytes, so a size-budget row grows when you add docs (e.g. cae-stepper 3328→3841 B after documenting linear).
- **Keeping Material types off the public API**: `@internal` + tsconfig `stripInternal` (cae-menu `panel`). Note the literal `@internal` inside a class's JSDoc *is* a `stripInternal` marker — it silently drops the whole symbol from the typings if you write it in prose. `private`/`protected` do **not** strip a member's *type* from the `.d.ts` (the bridge matcher's `ErrorStateMatcher` type IS emitted — harmless: `@angular/material` is a peer dep so it resolves).
- Each entry point is self-contained; shared types in `caelum/shared`; `check-lib-exports.mjs` gates folder↔`exports`↔barrel; every entry point needs a `size-budget.json` row (~15–30 % headroom over measured gzip).

## 8. Bundle discipline — defer-before-raise (#85)

A heavy Material module used only by a **below-the-fold Forge demo** is wrapped in **`@defer (on idle)`** into a lazy chunk **instead of raising the initial-bundle budget**. Use **`on idle`, not `on viewport`**, so deferred content is only *transiently* absent (never scroll-stranded for a screen-reader/keyboard user). Watch the **value+type import trap**: a shared *value* import of a deferred component counts as an eager use and defeats the split → import the type with `import type`. Forge budget: **850 kB warn / 1 mb error**; a boundary test asserts the `@defer` block count so an un-defer regresses red.

## 9. Testing (Book 17)

- **Vitest / jsdom** is the v22 default runner. **jsdom can't open CDK overlays** (MatSlider geometry; the `matAutocomplete`/`mat-select` panels) — so panel options + keyboard nav are deferred to the **M4 real-browser a11y pass** (#41/#79/#110 family), and CVA + filter + blur logic is tested at the **component boundary via direct handler calls**.
- **Overlay-service tests** (toast/dialog/confirm): await ref signals, use `openDialogs` for state, direct-invoke lazy handlers (see the memory note on deterministic overlay testing).
- **Every public-API / a11y slice gets a 4-lens ultracode adversarial review** before merge (lenses: cva-forms / a11y / api-design / arch-packaging, adapted per slice).
