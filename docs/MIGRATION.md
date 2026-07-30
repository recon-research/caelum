# Migrating from PrimeNG to Caelum

A practical guide for a team moving an Angular app from PrimeNG to Caelum, component by component.

Caelum is built on Angular Material + CDK and deliberately covers the same surface PrimeNG does, so most of a migration is mechanical. This guide is about the part that **is not** mechanical: the API deltas a rename cannot infer, and the handful of places where migrated code compiles cleanly and then behaves differently.

> **The component map lives elsewhere, on purpose.** Which `p-*` maps to which `cae-*`, what to import it from, and whether it ships today are all in **[`textbooks/reference/COMPARISON.md`](../textbooks/reference/COMPARISON.md)** — the single canonical map. This guide links it rather than copying it, so the two can never disagree.

> **⚠ Two provenance notes, read them before you trust a name.**
> 1. **PrimeNG-side names here are sourced, not verified.** `primeng` is not a dependency of this repository, so every `p-*` prop and event name quoted below comes from the tracker or the PrimeNG documentation — never from a real installed package. Check each against the version you actually run ([#253](https://github.com/recon-research/caelum/issues/253)). Every **Caelum-side** claim is read off shipped source.
> 2. **The package name changes before npm publish.** Caelum is not published yet; it will publish as **`@recon-research/caelum`** ([D-501](ARCHITECTURE.md), [#514](https://github.com/recon-research/caelum/issues/514)). Import paths in this guide use the current `caelum/*` root — expect a one-time prefix rename at publish, and prefer to schedule your migration around it rather than through it.

---

## 1. Inventory before you plan

Caelum ships the parity surface; **your codebase decides the order**. Before scheduling anything:

```bash
# which p-* you actually use, ranked by real usage
grep -rhoE '<p-[a-z]+' src/ | sort | uniq -c | sort -rn

# and the directives, which are easy to forget
grep -rhoE '\bp[A-Z][a-zA-Z]+' src/ | sort | uniq -c | sort -rn
```

Then, for each selector that matters, enumerate the props **your call sites actually use** — not the props the component offers. Most components are used at a fraction of their API, and that fraction is what you are really migrating.

Now open [COMPARISON.md](../textbooks/reference/COMPARISON.md) and sort your inventory by its **Status** column *first*, frequency second:

| Status | Meaning | What to do |
|---|---|---|
| ☑ shipped | The entry point exists today. | Schedule it. |
| ◐ partial | No dedicated `cae-*`; an existing Material/CDK path covers it. | Schedule it, but read the row — the replacement is not a `cae-*`. |
| ☐ planned | Mapped target, no code. Every ☐ row names its tracking issue. | **Decide before you schedule**, not mid-migration — see §6. |

Discovering a ☐ halfway through a migration wave is the single most expensive way to find one.

---

## 2. Install and theme

```bash
npm install @recon-research/caelum
```

Angular `^22.0.0 || ^23.0.0` is a peer (`core`, `common`, `forms`, `cdk`, `material`). Two peers are
**optional** and only needed by the one entry point that uses each: `@angular/router` for
`@recon-research/caelum/breadcrumb-router`, and `@tanstack/table-core` for
`@recon-research/caelum/grid-tanstack`.

> **Caelum is `0.x`, and that changes how you pin.** Until `1.0.0`, **breaking changes ship in
> _minor_ bumps** (`0.1.0` → `0.2.0`), not majors — SemVer's `0.x` rule, chosen deliberately
> ([D-850](ARCHITECTURE.md)) while the API is young enough that correcting a bad signature beats
> promising a stability we would then break. This matters mid-migration: a range of `^0.1.0`
> resolves as `>=0.1.0 <0.2.0`, so it already pins you inside one minor — which is what you want.
> Moving to the next minor is a deliberate step, and every breaking change in it carries a
> migration note in the [changelog](../CHANGELOG.md). `1.0.0` waits on a real application shipping
> on Caelum. If you are migrating a large app, pin exactly and upgrade on your own schedule.

Caelum's theming is a **token bridge**: you adopt one Sass entry point, and every component follows.

```scss
// styles.scss
@use '@recon-research/caelum/styles/theme' as caelum;

@include caelum.theme();
```

```html
<html data-theme="dark" data-density="compact">
```

Two things to know up front, because they differ structurally from a per-component approach:

- **There is no `[density]` input anywhere.** Density is the global `data-density` attribute ([D-19](ARCHITECTURE.md)). Setting `data-density="compact"` re-declares the `--cae-space-*` scale *and* re-emits Material's density at `-2` in one move. Compact never drops an interactive target below the density-invariant `--cae-target-min` (24px), so WCAG 2.5.8 holds in every arm.
- **`theme()` is a mixin, so a compile-time baseline is available too** ([D-757](ARCHITECTURE.md)). `@include caelum.theme($density: -2, $density-compact: -3)` bakes a compact **Material** baseline *and* keeps the runtime knob switching to something tighter still. Two things to know: the `--cae-space-*` scale that Caelum's own components pad with is **not** compile-time settable — it stays a runtime-only knob, so a baked baseline tightens Material's controls while `cae-*` spacing waits for `data-density`. And both density arms are yours to set, with the mixin validating them: `$density` and `$density-compact` must be unitless integers in `0…-5`, and `$density-compact` must be **strictly tighter** than `$density` or `null`. Anything else is a hard `@error` rather than a warning, because every rejected shape fails *silently* at runtime — equal arms emit ~2.8 kB that changes nothing, a looser one inverts the knob, and `-2px` or `'compact'` are quietly treated by Material as comfortable. At `$density: -5` nothing tighter exists, so pass `$density-compact: null`.
- **Theming is tokens only.** Components expose no colour inputs. Where PrimeNG offers a `severity` colour on a control, Caelum either maps it to a token-backed variant or deliberately omits it (see `cae-button` and `cae-badge` in §4.5).

---

## 3. The mechanical pass

Rename selectors and import paths using COMPARISON's **Caelum** and **Import** columns as the codemod's lookup table.

**Import from the per-component entry point, not the barrel:**

```ts
import { CaeSelect } from '@recon-research/caelum/select';       // ✅ pulls one component
import { CaeSelect } from '@recon-research/caelum';              // ⚠ pulls the whole library
```

**Two entry points are not in the barrel at all, by design:**

```ts
import { CaeBreadcrumbRouterLink } from '@recon-research/caelum/breadcrumb-router';  // needs @angular/router
import { provideTanStackGrid }     from '@recon-research/caelum/grid-tanstack';      // needs @tanstack/table-core
```

Both import **optional** peer dependencies. A bundler resolves the static import graph *before* tree-shaking, so re-exporting either from the barrel would make its peer mandatory for every consumer — which is why `import { provideTanStackGrid } from '@recon-research/caelum'` is a resolution failure rather than an oversight ([D-595](ARCHITECTURE.md), [D-652](ARCHITECTURE.md)).

Leave a `TODO(caelum-migrate)` marker anywhere the codemod cannot resolve a prop or event, and work the markers in §4.

---

## 4. The semantic pass — API differences

These are the deltas a rename cannot infer. Each one is verified against shipped Caelum source.

### 4.1 `ariaLabelledBy` → `ariaLabelledby` — with one exception that matters

Caelum spells the naming input **`ariaLabelledby`** (lowercase `b`), mirroring Angular Material's own alias. PrimeNG uses `ariaLabelledBy`. Copying the PrimeNG casing produces an unknown-input template error, so it fails loudly rather than silently degrading accessibility.

```html
<p-checkbox   [ariaLabelledBy]="'billing-heading'" />   <!-- PrimeNG -->
<cae-checkbox [ariaLabelledby]="'billing-heading'" />   <!-- Caelum -->
```

**⚠ Do not run this as a blanket find-and-replace.** `CaeDialogConfig` keeps the capital `B`:

```ts
// The one place the capital B is correct — a config object, not a template input.
this.dialog.open(RenameDialog, { ariaLabelledBy: 'rename-heading' });
```

`CaeDialogConfig.ariaLabelledBy` and `.ariaDescribedBy` are a structural passthrough to Material's `MatDialogConfig`, so they follow *its* naming. A library-wide codemod would rewrite these and silently strip the accessible name from every dialog — the failure mode the loud template error protects you from everywhere else. ([#133](https://github.com/recon-research/caelum/issues/133))

The sibling `ariaDescribedby` input follows the same lowercase rule on components. `cae-pick-list` uses per-side `sourceAriaLabelledby` / `targetAriaLabelledby`.

### 4.2 Options are typed data — there is no `optionLabel` / `optionValue`

PrimeNG's selects take arbitrary objects plus accessor strings. Caelum's take a typed array and expose **no accessor inputs at all**:

```ts
export interface CaeSelectOption {  // same shape on select, listbox, multi-select,
  value: string;                    // radio, select-button, autocomplete
  label: string;
  disabled?: boolean;
}
```

```html
<p-select [options]="users" optionLabel="fullName" optionValue="id" [(ngModel)]="userId" />
<cae-select [options]="userOptions()" [(ngModel)]="userId" />
```

```ts
readonly userOptions = computed(() =>
  this.users().map((u) => ({ value: u.id, label: u.fullName })),
);
```

**The value type is `string`, not `any`** — a numeric or object-valued binding must be stringified in and parsed out. This is the largest data-shape change in the form family, and it is worth doing as its own commit.

**Exception — the generic families.** `cae-chip-set`, `cae-order-list` and `cae-pick-list` are generic over `T` and use **accessor functions** instead (`[label]`, `[trackBy]`, `[disabledMatch]`, `[filterMatch]`). The split is deliberate ([D-526](ARCHITECTURE.md)): a concrete named-field model carries its metadata on the node; a generic `T` has nowhere to hang it.

### 4.3 Item models are named-field interfaces, and `command` is not a callback

| Model | Fields | Used by |
|---|---|---|
| `CaeMenuItem` | `label` · `value?` · `disabled?` · `icon?` · `url?` · `items?` | menu, menubar, context-menu, split-button, panel-menu |
| `CaeTreeNode` | `label` · `value?` · `disabled?` · `children?` | tree, tree-select, tree-table |
| `CaeBreadcrumbItem` | `label` · `url?` · `disabled?` · `command?` (**boolean**) | breadcrumb |
| `CaeTabMenuItem<T>` | `label` · `value` (**required**) · `disabled?` · `icon?` | tab-menu |
| `CaeTableColumn` | `key` · `header` · `sortable?` · `sticky?` / `stickyEnd?` | table |
| `CaeColumn<T>` | `id` · `header` · `value: (row) => …` · `sortable?` · `align?` · `width?` | data-grid |

Two things bite:

- **`command` is a boolean, not a function.** PrimeNG's `MenuItem.command` is a callback. `CaeBreadcrumbItem.command: true` marks a url-less crumb as an activatable `<button>`, and you wire the action through the `(itemSelect)` output. `CaeMenuItem` has no `command` field at all — every menu emits `(itemSelect)` with the whole item.
- **`CaeTableColumn.key` does not resolve dot paths.** A `p-table` `field="user.name"` becomes a blank cell that sorts as a no-op. Flatten the row, or project a `caeCellDef` template. `cae-data-grid`'s `CaeColumn<T>.value(row)` accessor *does* handle nested and computed fields — that is the documented escape hatch.

### 4.4 Overlays are services, not `[(visible)]` components

This is usually the largest structural rewrite in a migration ([D-15](ARCHITECTURE.md)).

```html
<p-dialog [(visible)]="showRename" header="Rename">…</p-dialog>
```

```ts
private readonly dialog = inject(CaeDialog);

const ref = this.dialog.open<RenameDialog, string, { name: string }>(RenameDialog, {
  data: { name: this.workspace() },
  role: 'dialog',            // 'alertdialog' for interruptions
});
ref.afterClosed().subscribe((name) => name && this.workspace.set(name));
```

Inside the dialog body, `CAE_DIALOG_DATA` and `injectCaeDialogRef()` replace `DynamicDialogConfig` / `DynamicDialogRef`, and the `caeDialogTitle` / `caeDialogContent` / `caeDialogActions` / `caeDialogClose` directives lay it out — **consumer code never imports from `@angular/material`**.

Confirm is one contract with two presentations, so `p-confirmDialog` and `p-confirmPopup` both land on the same service:

```ts
private readonly confirm = inject(CaeConfirmService);
private readonly destroyRef = inject(DestroyRef);

await this.confirm.confirm({ message: 'Delete project?', header: 'Delete' });  // centered
await this.confirm.confirmAt(triggerEl, { message: 'Delete project?' }, this.destroyRef);  // anchored
```

There is **no `<cae-confirm-popup>` selector to bind to** — the popup body is internal and reachable only through `confirmAt()`.

> **`confirmAt` takes a third argument that `p-confirmPopup` has no equivalent for** ([D-831](ARCHITECTURE.md)). An anchored panel is positioned against its trigger, so a component that goes away while its confirm is open would leave the panel anchored to a detached node with a click-swallowing backdrop over whatever replaced it. Passing your own `DestroyRef` binds the confirm to your component: teardown resolves it `false`. It is required rather than optional so the leak cannot reappear by omission — PrimeNG leaves this to the caller, so this is one of the deltas a rename cannot infer. The centered `confirm()` needs no such argument.

Toast follows the same shape:

```ts
private readonly toast = inject(CaeToast);
this.toast.open('Workspace saved');                     // auto-dismisses (see §5.6)
const ref = this.toast.open('Project archived', 'Undo');
ref.onAction().subscribe(() => this.restore());
```

`CaeToastConfig` carries `duration` · `horizontalPosition` · `verticalPosition` · `politeness` · `announcementMessage` · `panelClass`. There is **no `severity` field**.

> If the programmatic shape causes real friction in your migration, say so on [D-15](ARCHITECTURE.md)'s issue — the decision explicitly reserves revisiting a declarative dialog if a real migration surfaces it. That feedback is wanted.

### 4.5 Renamed inputs worth a codemod rule

`caeTooltip` and `caeBadge` are host directives that re-alias Material's inputs one-for-one:

| PrimeNG | Caelum |
|---|---|
| `pTooltip="…"` | `caeTooltip="…"` |
| `tooltipPosition` | `caeTooltipPosition` |
| `[tooltipDisabled]` | `[caeTooltipDisabled]` |
| `showDelay` / `hideDelay` | `caeTooltipShowDelay` / `caeTooltipHideDelay` |
| `pBadge` / `[value]` | `[caeBadge]="count"` |
| `badgeSize` | `caeBadgeSize` |
| — | **`caeBadgeDescription`** — add it; a bare numeric badge is decorative to a screen reader |

And the rest:

- **`cae-button [variant]`** takes `'filled' | 'tonal' | 'elevated' | 'outlined' | 'text'`. There is **no `severity`** — `p-button severity="danger"` has no colour equivalent today ([#105](https://github.com/recon-research/caelum/issues/105)).
- **`cae-button [tooltip]`**, *not* `[caeTooltip]`. The real `<button>` is nested inside the wrapper, so a tooltip bound to the host is pointer-only and never announced.
- **`cae-button [menuTriggerFor]`** pairs a `<cae-menu>` with a `<cae-button>`; the bare `caeMenuTriggerFor` directive targets a plain `<button>`.
- **`cae-order-list`**: `dataKey` → `[trackBy]` (an item→key function, no index) · per-item disabling → `[disabledMatch]` predicate · `emptyFilterMessage` → `[emptyMessage]`.
- **`cae-multi-select`**: `filter` → `[filterable]`, and it is **off by default** (see §5.4).
- **`cae-tree-select`** has no `(onClear)` output — clearing flows through the `ControlValueAccessor` only.

### 4.6 Two-way binding: which components hold their own state

Caelum uses two shapes, and the difference decides whether a component self-updates without a binding:

- **True `model()`** — self-updating even unbound: `cae-carousel [(page)]` · `cae-galleria [(activeIndex)]` `[(visible)]` · `cae-image-compare [(value)]` · `cae-order-list [(value)]` `[(selection)]` · `cae-pick-list [(source)]` `[(target)]` (+ selections) · `cae-table [(selection)]` `[(expanded)]` · `cae-tree-table [(expanded)]` · `cae-tab-menu [(activeValue)]`.
- **`input` + a matching `…Change` output** — the banana-box syntax works, but the component does **not** hold the state: `cae-tabs [(selectedIndex)]` · `cae-stepper [(selectedIndex)]` · `cae-expansion-panel [(expanded)]`.
- **Value-bearing form controls are `ControlValueAccessor`s** — bind `[(ngModel)]` or `[formControl]` exactly as you did with PrimeNG. This is deliberate: the CVA seam is what makes form migration mostly mechanical.

### 4.7 Value shapes that changed

| Component | Caelum value | Note |
|---|---|---|
| `cae-select` · `cae-autocomplete` · `cae-input` · `cae-textarea` | `string` | empty is `''` |
| `cae-multi-select` | `string[]` | empty is `[]` |
| `cae-listbox` · `cae-select-button` | `string`, or `string[]` with `[multiple]` | **`[multiple]` must be set at first render** — Material fixes the mode at init |
| `cae-input-number` | `number \| null` | not a formatted string |
| `cae-input-mask` | **unmasked** `string` | mask literals are not in the value |
| `cae-input-otp` | one `string` | not per-cell |
| `cae-rating` | `number \| null` | **writes back once when your value's *shape* is wrong** — fractional rounds, `0` becomes `null` (so `required` behaves), numeric strings coerce (`'3'` → `3`), junk becomes `null`; the corrected value is emitted on a microtask, so `valueChanges` fires without user action ([#823](https://github.com/recon-research/caelum/issues/823)). **Out-of-range is *not* rewritten** — `[stars]` may still grow, so a `7` on a 5-star group is kept and merely displayed clamped, settling on the first interaction. `p-rating` leaves every bad value in place |
| `cae-datepicker` | `Date \| null` · `CaeDateRange` · `Date[]` | shape follows `[selectionMode]` |
| `cae-tree-select` | `string \| readonly string[] \| null` | **node keys**, not node objects; parents are derived |
| `cae-table [(selection)]` | `readonly T[]` **even in `selectionMode="single"`** | a 0/1-length array, so the binding type is stable across modes |
| `cae-tab-menu [(activeValue)]` | `TValue \| undefined` | **value-based**, not the reference-based `activeItem` |

**⚠ `cae-table` selection and expansion match by reference identity.** A `[data]` refresh that produces new object instances silently drops both. A stable-identity `dataKey` is tracked in [#144](https://github.com/recon-research/caelum/issues/144).

### 4.8 Per-item icons

Data-driven components take icons two ways, and the template wins when both are set:

```html
<!-- (a) a built-in glyph, by name -->
<cae-menu [items]="[{ label: 'New folder', icon: 'folder' }]" />

<!-- (b) any other glyph — context is { $implicit: item, index } -->
<cae-menu [items]="items" [iconTemplate]="glyph">
  <ng-template #glyph let-item><svg>…</svg></ng-template>
</cae-menu>
```

The built-in registry is deliberately small and closed — `home` · `folder` · `file` · `plus` · `search` · `user` · `chevron-{up,right,down,left}`. There is **no icon font and no `iconUrl` / `iconSvg` input**: both were rejected for US-origin/no-CDN reasons and because raw SVG is an HTML-injection trust boundary ([D-596](ARCHITECTURE.md)). Anything else goes through `iconTemplate`.

`[iconTemplate]` ships on menu, menubar, context-menu, split-button, panel-menu, breadcrumb, tab-menu, tag and rating.

**⚠ `cae-rating` renders its off stars differently from `p-rating`.** Supply only `[icon]` (or only `[offIcon]`) and both states share one glyph, so Caelum draws the off state as a **dashed, slightly smaller** outline — `cae-icon` glyphs are stroke-only, so the built-in star's solid/hollow trick isn't available, and without a shape cue on/off would be conveyed by colour alone (WCAG 1.4.1). Supply **both** icons and nothing is altered: your two glyphs already distinguish the states. On the `[iconTemplate]` path the cue is **yours to draw** — the context's `item.active` is what to branch on ([#823](https://github.com/recon-research/caelum/issues/823)).

**⚠ Known issue:** an `iconTemplate` that stamps *text* poisons `MatMenu`'s typeahead and the item's accessible name ([#648](https://github.com/recon-research/caelum/issues/648)). Keep icon templates to graphics.

---

## 5. Behaviour review — the differences a codemod passes silently

§4 fails loudly: wrong names do not compile. **This section is the dangerous half** — the code looks migrated, compiles, and behaves differently. Review each against your app's actual expectations.

### 5.1 `cae-autocomplete` requires choosing a suggestion **by default**
The default is force-selection, which is the flip from `p-autocomplete` (whose `forceSelection` defaults to `false`): a typed value that matches no suggestion is **reverted on blur**. Add **`[freeText]`** to get the upstream behaviour back — blur then commits the trimmed text verbatim, so the model may hold a suggestion key *or* an arbitrary string. This sits on two migration paths, because the `p-chips` form case routes here too (§5.9).

### 5.2 `cae-table` single-select does not deselect on re-click
Single-select is a native radio group, and ARIA gives a radio group no path back to the empty selection — so clicking the selected row again does nothing. Opt back in with **`[allowDeselect]`**, which restores it by mouse **and** by Space (never mouse-only — WCAG 2.1.1). A first-class `role=listbox` alternative is [#236](https://github.com/recon-research/caelum/issues/236).

### 5.3 Disabled items stay keyboard-focusable
Across tab-menu, tree, tree-select, order-list and breadcrumb, a disabled item renders `aria-disabled="true"`, is dimmed, and cannot be activated — **but focus still lands on it**, so a screen-reader user can perceive that it exists. Native `[disabled]` would remove it from the tab order and hide it silently.

**⚠ `cae-chip-set` is the exception**: a `[chipDisabled]` chip *is* dropped from Material's roving tab order and is not keyboard-reachable. For a value that must stay readable but not removable, use a **locked** chip (`[chipRemovable]` → `false`) instead.

### 5.4 `cae-multi-select [filterable]` defaults off
PrimeNG's filter is on by default. Caelum ships it off because the filter box is not yet keyboard- or screen-reader-reachable (Material keeps focus on the host) — enabling it by default would layer a mouse-only convenience over an otherwise fully accessible typeahead. [#138](https://github.com/recon-research/caelum/issues/138) makes it accessible and flips the default.

### 5.5 The current breadcrumb crumb is never a link
The last crumb is inert text carrying `aria-current="page"`, and separators are `aria-hidden`. A breadcrumb that linked its own page loses that link. This also makes `routerLinkActive` moot.

### 5.6 Confirm defaults to **reject**; toast auto-dismisses
`CaeConfirmOptions.defaultFocus` defaults to `'reject'`, and Escape / outside-click both resolve as reject — so a flow that relied on Enter confirming a destructive action changes behaviour. Separately, `cae-toast` auto-dismisses after **5000 ms** (a deliberate flip from `MatSnackBar`'s stay-until-dismissed); pass `duration: 0` for a sticky toast, and pair it with an action.

### 5.7 `cae-tag` is not interactive, and severity is not carried by text colour
The tag is non-focusable with `role: null` and no ripple. Severity reads from the **background hue plus the decorative icon**, never the label colour — a saturated severity colour as text on its own tint fails WCAG 1.4.3 at mid-tone hues. Give every severity tag real text; a dev-mode warning fires if you do not.

### 5.8 `cae-badge` has no severity colours and no standalone component
Theming is token-bridge-only, so `matBadgeColor` is not exposed. Wrap any element with the `[caeBadge]` directive for the `pBadge` case. Both gaps are [#129](https://github.com/recon-research/caelum/issues/129).

### 5.9 There is no `cae-chips`
`p-chips` was **removed** upstream in PrimeNG v20-rc, and its replacement is `p-autocomplete [multiple]`. Building a `cae-chips` would chase a deleted component, so Caelum routes the two cases separately ([D-549](ARCHITECTURE.md)): **display** → `<cae-chip-set [textEntry]>`; **form/CVA** → `<cae-autocomplete [multiple] [freeText]>`, which binds `[formControl]`/`[(ngModel)]` to a `string[]` of tags.

```html
<!-- p-chips -->                          <!-- Caelum -->
<p-chips [(ngModel)]="tags" />            <cae-autocomplete multiple freeText
                                            [formControl]="tags" label="Tags" />
```

Enter and comma commit a tag; each renders as a removable chip. Duplicates are rejected (a repeat would throw NG0955 out of the `@for` that renders the chips), and `[options]` may still be supplied to offer suggestions alongside free entry — already-chosen options drop out of the panel. Without `[freeText]` the field becomes multi-select-from-suggestions only.

### 5.10 Other divergences worth a glance
`cae-toggle-button` has one projected label for both states (no `onLabel`/`offLabel` — [#75](https://github.com/recon-research/caelum/issues/75)) · `cae-tab-menu` matches on `item.value` rather than an item reference, and owns its `mat-tab-nav-panel` so the bar renders the full ARIA tabs pattern · `cae-input-number`, `cae-input-mask`, `cae-input-otp` and `cae-password` are **components**, not directives, because each owns its own `mat-form-field` wrapper.

---

## 6. Gaps — the build-or-drop decision

A **☐ planned** row in COMPARISON means the target is mapped but not built. Every ☐ names a tracking issue, so you always have somewhere to comment with your use case — and a real consumer need is exactly what promotes one of these into a built slice.

| Kind | Where | What to do |
|---|---|---|
| **Shipped with a stated edge** | `p-panel`/`p-fieldset` → `cae-panel`/`cae-fieldset` ship (`@recon-research/caelum/panel`), with three deliberate divergences. `cae-fieldset`'s **`[legend]` is required** (`p-fieldset`'s is optional) — an unnamed group is the defect the component exists to prevent. `p-panel`'s `toggler="header"` (whole-header click) is **not ported**: it makes anything interactive in the header a nested interactive. There is no `onBeforeToggle`/`onAfterToggle` — `(collapsedChange)` is the after-toggle event. There is no `[disabled]`; disable the group through its form (`formGroup.disable()`). Shared with `p-fieldset`: when `[toggleable]`, the toggle lives inside the `<legend>`, so AT announces the group name twice on entry ("Billing details, grouping, Billing details, button"). | Bind `[legend]` on every fieldset. Replace `(onAfterToggle)` with `(collapsedChange)`, and a header-click toggle with the icon toggle. |
| **Shipped with a stated edge** | `p-drawer` → `cae-drawer` ships (`@recon-research/caelum/drawer`), but `position` is `start`/`end` only — Material's `MatDrawer` has no top/bottom. A top or bottom drawer is [#854](https://github.com/recon-research/caelum/issues/854) | Migrate left/right drawers now. If you used `position="top"`/`"bottom"`, say so on #854. |
| **Shipped with a stated edge** | `p-message` → `cae-alert` ships (`@recon-research/caelum/alert`); note `severity="error"` is **`"danger"`** here. A live region announces *changes*: a `role="alert"` node is announced when **inserted after load with new text**, but not when already present at first paint, not reliably when re-inserted with identical text, and `role="status"` insertion is AT-dependent. This is how live regions work, not a wrapper limitation ([#866](https://github.com/recon-research/caelum/issues/866) tracks the screen-reader verification) | Inserting a `danger` alert on submit announces. For a polite message that must be heard, keep the alert **mounted** — `visible` stays `true` and the *projected content* changes. Setting `visible="false"` destroys the live-region element, so re-showing it is an insertion, not an update. |
| **On-demand** | [#667](https://github.com/recon-research/caelum/issues/667) (knob, org-chart, mega-menu, dock) · [#712](https://github.com/recon-research/caelum/issues/712) (standalone paginator, data-view, meter-group, cascade-select, mention, colour-picker, speed-dial, key-filter, inplace, block-UI, scroll-top, animate-on-scroll) | Built when someone asks. If you need one, say so on the issue. |
| **Shipped with a stated edge** | `p-tieredmenu` → **nested `items` on `cae-menu`** ([#150](https://github.com/recon-research/caelum/issues/150)); there is no separate `cae-tiered-menu`. Any item with a non-empty `items` array is a submenu branch, to any depth, and `cae-split-button` / `cae-menubar` inherit it. Two edges: a branch is **navigational**, so `(itemSelect)` only ever emits a leaf — a PrimeNG model that hung a `command` on a parent item must move it to a leaf; and `items` must be an acyclic tree held in a stable reference (a `signal` or `readonly` field), because rows track by item identity — rebuilding the array on every change detection now rebuilds every row. `cae-context-menu` submenus are separately tracked as [#158](https://github.com/recon-research/caelum/issues/158). | Nest `items` directly; no new component or import. Move any parent-item `command` down to leaves. |
| **Adapters** | `cae-chart` [#233](https://github.com/recon-research/caelum/issues/233) · `cae-editor` [#232](https://github.com/recon-research/caelum/issues/232) | Third-party engines behind a neutral port; on-demand. |
| **Use the CDK directly** | `p-virtualscroller` → `@angular/cdk/scrolling`; `pDraggable`/`pFocusTrap`/`pAutoFocus`/`pRipple` → their CDK/Material equivalents | No `cae-*` wrapper is planned — the primitive is already ergonomic. |
| **No first-party path** | `p-terminal`, `pStyleClass`, `pBind`, `p-fluid`, `FilterService` | Keep, replace, or drop — there is no Caelum target. |

For anything unbuilt, make the **build-or-drop** call *before* the wave that needs it: keep the PrimeNG component running side by side, build it yourself, or drop the feature. All three are fine; discovering the choice mid-wave is not.

Note also that a shipped component may still have parity extras outstanding — the tracker is the source of truth, and each component's row in COMPARISON names its follow-up issues.

---

## 7. Hold the line

A migration that is not ratcheted slides back. Once a wave lands, make regression mechanical:

- **No new `primeng/*` import. No new `<p-*>` tag.** Enforce with a lint rule or a CI grep; the falling count is your burndown.
- **Track state per component, with evidence.** A component is not migrated because it renders — it is migrated when its behaviour is verified. Keep a ledger and require proof to advance a row.
- **Migrate by feature slice, not by component type.** Rewriting every dialog across the app at once maximises the blast radius of §4.4; taking one feature end to end keeps each change reviewable.

---

## See also

- **[COMPARISON.md](../textbooks/reference/COMPARISON.md)** — the canonical component map: `p-*` → `cae-*`, import path, shipped status, effort tier.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the decision log; every `D-NN` cited above is recorded there with its reasoning.
- **[ROADMAP.md](ROADMAP.md)** — what is being built next.
- **[PATTERNS.md](PATTERNS.md)** — conventions used across the library.
