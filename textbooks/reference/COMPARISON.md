# COMPARISON — The Living PrimeNG → Caelum Component Map

> **This is the canonical, living migration map** for a team leaving PrimeNG for Caelum: every PrimeNG `p-*` component to its Caelum `cae-*` equivalent, the Angular Material / CDK primitive underneath, and the effort tier. It is the artifact [Book 20 — Migration & Adoption](../books/20_migration-and-adoption.md) drives (`§2.2`, `§3.1`), the behavior source the pre-committed parity scenarios of [Book 16](../books/16_accessibility-and-parity-verification.md) derive from, and the map the mechanical `p-*`→`cae-*` codemods (Book 20 §3.3) read.
>
> **It is a *starting allocation*, not a contract.** Effort tiers are predictions — log actuals and correct them (intake brief §3). A **mapped row is not a migrated component**: it names a target that *exists*, not one that has been built and verified at parity. A component is "migrated" only at `adversarial-passed` on the capability ledger (Book 16 §2.2), never because it renders (Book 20 §2.2). Adapter rows (grid/charts/editor) are isolated third-party engines behind a neutral interface (Book 12); everything else is first-party Material/CDK.

## Legend — effort tier (from brief §3)

- **Direct** — ~1:1 drop-in on a Material component.
- **Compose** — assembled from existing Material/CDK pieces.
- **Build-S / M / L** — a custom `cae-*` component on CDK/Aria; Small / Medium / Large.
- **Adapter** — a genuine gap needing a vetted, US-origin, MIT third-party engine, isolated behind a neutral adapter (Book 12; the brief calls this tier **Vet-lib**).

The **Book** column points at the Caelum book that covers that component family (plain reference, no section — the book resolves the detail).

## ⚠ Source-selector versioning

A migrating team is typically moving across PrimeNG **17 → 21**, and PrimeNG **renamed** several components in that span. The `p-*` your app actually uses depends on your PrimeNG version, and the codemod's input side must account for it (Book 20 §3.1, §3.3). Known renames:

| Older `p-*` | Current `p-*` |
|---|---|
| `p-dropdown` | `p-select` |
| `p-calendar` | `p-datepicker` |
| `p-inputswitch` | `p-toggleswitch` |
| `p-overlaypanel` | `p-popover` |
| `p-sidebar` | `p-drawer` |
| `p-tabview` | `p-tabs` |
| `p-virtualscroller` | `p-scroller` |

Below, the **current** selector is listed with the historical alias noted. Verify the exact rename set against the team's installed `primeng` version at adoption.

## Form / inputs

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `pInputText` (directive), `pTextarea` | `cae-input` / `cae-textarea` | `matInput` + `mat-form-field` | Direct | 07 |
| `p-select` (was `p-dropdown`) | `cae-select` | `MatSelect` | Direct | 09 |
| `p-multiselect` | `cae-multi-select` | `MatSelect[multiple]` + filter + chip summary | Compose | 09 |
| `p-autocomplete` | `cae-autocomplete` | `matAutocomplete` (v1 force-selection default, unlike `p-autocomplete`; free text → #120) | Direct | 09 |
| `p-checkbox` | `cae-checkbox` | `MatCheckbox` | Direct | 07 |
| `p-radiobutton` | `cae-radio` | `MatRadioButton` | Direct | 07 |
| `p-toggleswitch` (was `p-inputswitch`) | `cae-switch` | `MatSlideToggle` | Direct | 07 |
| `p-togglebutton`, `p-selectbutton` | `cae-toggle-button` / `cae-select-button` | `MatButtonToggle` (group) | Direct | 11 |
| `p-slider` | `cae-slider` | `MatSlider` | Direct | 07 |
| `p-listbox` | `cae-listbox` | `mat-selection-list` (or `cdkListbox`) | Direct | 06 |
| `p-datepicker` (was `p-calendar`) | `cae-datepicker` | `MatDatepicker` + `mat-date-range-input` | Compose | 09 |
| — (time-of-day) | `cae-time-picker` | `matInput` mask (no first-party time picker — R2 scar) | Build-S | 08 |
| `p-inputnumber` | `cae-input-number` | `matInput` + format/parse directive | Build-S | 08 |
| `p-inputmask` | `cae-input-mask` | directive on `matInput` (no foreign mask lib) | Build-S | 08 |
| `p-inputotp` | `cae-input-otp` | segmented `matInput`s | Build-S | 08 |
| `p-password` | `cae-password` | `matInput[type=password]` + strength directive | Build-S | 08 |
| `pKeyFilter` (directive) | `cae-key-filter` | directive on `matInput` | Build-S | 08 |
| `p-rating` | `cae-rating` | icon row + Aria | Build-S | 11 |
| `p-colorpicker` | `cae-color-picker` | native `<input type=color>` / CDK overlay | Build-S | 08 |
| `p-knob` | `cae-knob` | SVG + CDK pointer | Build-M | 08 |
| `p-cascadeselect` | `cae-cascade-select` | nested `MatMenu` / CDK Menu | Build-M | 09 |
| `p-treeselect` | `cae-tree-select` | `MatTree` in CDK overlay | Build-M | 09 |
| `p-mention` | `cae-mention` | CDK overlay + `matAutocomplete` | Build-M | 09 |
| `p-floatlabel`, `p-iconfield`, `p-iftalabel`, `p-inputgroup` | `cae-input-group` + `mat-form-field` features | `mat-form-field` label + prefix/suffix | Direct / Compose | 07 |

## Buttons

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-button` (`pButton`) | `cae-button` | `MatButton` variants | Direct | 04 |
| `p-splitbutton` | `cae-split-button` | `MatButton` + `MatMenu` (via `cae-menu`; v1 #148 = required label + shared variant + optional-submit primary + data-driven dropdown; primary icon/per-half-appearance/`(dropdownClick)` → #149, rich menu items → #150) | Compose | 09 |
| `p-speeddial` | `cae-speed-dial` | CDK overlay + animation | Build-M | 09 |

## Data

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-table` (basic→mid) | `cae-table` | `MatTable` + `MatSort` + `MatPaginator` (+ sticky/expandable staged: v1 #141 = text columns + sort + paginate; sticky/expandable/selection → #144, custom cell templates → #143) | Compose | 10 |
| `p-table` (advanced) | `cae-data-grid` | **TanStack Table** (headless) behind `CaeGridAdapter` | **Adapter** | 13 |
| `p-tree` | `cae-tree` | `MatTree` | Direct | 10 |
| `p-treetable` | `cae-tree-table` | `MatTable` + tree data source (`role=treegrid`) | Build-M | 10 |
| `p-paginator` | `cae-paginator` | `MatPaginator` | Direct | 10 |
| `p-virtualscroller` (a.k.a. `p-scroller`) | `cae-virtual-scroll` | `cdk-virtual-scroll-viewport` | Direct | 10 |
| `p-dataview` | `cae-data-view` | layout + `MatPaginator` | Compose | 10 |
| `p-orderlist` | `cae-order-list` | CDK drag-drop list | Build-M | 11 |
| `p-picklist` | `cae-pick-list` | two connected CDK drop-lists | Build-M | 11 |
| `p-timeline` | `cae-timeline` | CSS/flex + CDK | Build-S | 11 |
| `p-organizationchart` | `cae-org-chart` | SVG/CDK or vetted US lib | Build-L | 11 |

## Panel / layout

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-accordion` | `cae-accordion` | `MatExpansionPanel` / `MatAccordion` | Direct | 11 |
| `p-card` | `cae-card` | `MatCard` | Direct | 11 |
| `p-tabs` (was `p-tabview`) | `cae-tabs` | `MatTabGroup` | Direct | 11 |
| `p-stepper` (`p-steps`) | `cae-stepper` | `MatStepper` | Direct | 11 |
| `p-toolbar` | `cae-toolbar` | `MatToolbar` (`caeToolbarStart`/`caeToolbarEnd` slots; no `role=toolbar` — needs roving tabindex; center group / rows → #127) | Direct | 11 |
| `p-divider` | `cae-divider` | `MatDivider` | Direct | 11 |
| `p-panel`, `p-fieldset` | `cae-panel` / `cae-fieldset` | `MatCard` / built legend | Compose | 11 |
| `p-scrollpanel` | `cae-scroll-panel` | CDK scrolling / native overflow | Build-S | 11 |
| `p-splitter` | `cae-splitter` | CDK drag + flex (no first-party splitter) | Build-M | 11 |

## Overlay

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-dialog`, DynamicDialog | `cae-dialog` (+ `CaeDialogService`) | `MatDialog` (component injection) | Direct | 09 |
| `p-confirmdialog` | `cae-confirm-dialog` (`CaeConfirmService`) | `MatDialog` + confirm wrapper (`role=alertdialog`) | Compose | 09 |
| `p-drawer` (was `p-sidebar`) | `cae-drawer` | `MatSidenav` / `MatDrawer` | Direct | 09 |
| `pTooltip` (directive) | `cae-tooltip` | `MatTooltip` | Direct | 09 |
| `p-popover` (was `p-overlaypanel`) | `cae-popover` | `CdkConnectedOverlay` | Build-S | 09 |
| `p-confirmpopup` | `cae-confirm-popup` | CDK overlay | Build-S | 09 |

## Menu

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-menu` | `cae-menu` | `MatMenu` | Direct | 09 |
| `p-menubar` | `cae-menubar` | `MatToolbar` + `MatMenu` | Compose | 09 |
| (TabMenu) | `cae-tab-menu` | `mat-tab-nav-bar` | Direct | 09 |
| `p-contextmenu` | `cae-context-menu` | CDK Menu (`cdkContextMenuTriggerFor`) | Compose | 09 |
| `p-tieredmenu` | `cae-tiered-menu` | CDK Menu (nested) | Compose | 09 |
| `p-breadcrumb` | `cae-breadcrumb` | semantic `nav` + `aria-current` | Build-S | 09 |
| `p-panelmenu` | `cae-panel-menu` | `MatExpansionPanel` + nav | Build-S | 09 |
| `p-megamenu`, `p-dock` | `cae-mega-menu` / `cae-dock` | CDK overlay / build (niche) | Build-M | 09 |

## Charts

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-chart` (Chart.js wrapper) | `cae-chart` | **D3** (framework-agnostic modules) behind `CaeChartAdapter` — Material has no charts | **Adapter** | 14 |

## Rich-text editor

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-editor` (Quill wrapper) | `cae-editor` | **Lexical** (framework-agnostic core) behind `CaeEditorAdapter` — no first-party editor; a CVA form control | **Adapter** | 15 |

## Messages / feedback

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-toast` | `cae-toast` | `MatSnackBar` (extend for stacked/rich) | Direct | 09 |
| `p-message` (inline) | `cae-alert` | alert component on `MatCard` (no first-party alert) | Build-S | 11 |
| `p-progressbar` | `cae-progress-bar` | `MatProgressBar` | Direct | 11 |
| `p-progressspinner` | `cae-progress-spinner` | `MatProgressSpinner` | Direct | 11 |
| `p-badge` (`pBadge`) | `cae-badge` | `MatBadge` (`[caeBadge]` directive form; forward `caeBadgeDescription` for a11y; no standalone component / severity colour → #129) | Direct | 11 |
| `p-metergroup` | `cae-meter-group` | stacked `MatProgressBar` | Build-S | 11 |
| `p-skeleton` | `cae-skeleton` | CSS shimmer | Build-S | 11 |

## File

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-fileupload` | `cae-file-upload` | CDK drag-drop + `HttpClient` (no first-party uploader — build US-clean) | Build-M | 11 |

## Media (a team priority)

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `p-carousel` | `cae-carousel` | CDK drag + stepper index | Build-M | 11 |
| `p-galleria` | `cae-galleria` | overlay shell (Book 09) + drag-drop | Build-M | 11 |
| `p-image` | `cae-image` | overlay preview / lightbox | Build-S | 11 |
| `p-imagecompare` | `cae-image-compare` | build on drag + overlay (niche) | Build-S | 11 |

## Misc / directives

| PrimeNG | Caelum | Material / CDK basis | Tier | Book |
|---|---|---|---|---|
| `pDraggable` / `pDroppable` | (CDK `DragDrop`) | `@angular/cdk/drag-drop` | Direct | 05 |
| `pFocusTrap` | `cdkTrapFocus` | `@angular/cdk/a11y` | Direct | 05 |
| `pAutoFocus` | `cdkFocusInitial` | `@angular/cdk/a11y` | Direct | 05 |
| `pRipple` | `matRipple` | Material ripple | Direct | 11 |
| `p-chip` | `cae-chip` | `MatChip` | Direct | 11 |
| `p-tag` | `cae-tag` | `MatChip` (static) | Compose | 11 |
| `p-avatar` (`p-avatargroup`) | `cae-avatar` | small component (no first-party avatar) | Build-S | 11 |
| `p-inplace`, `p-blockui`, `p-scrolltop`, `p-terminal`, `pAnimateOnScroll` | (build on demand) | CDK | Build-S | — |

## Niche / out-of-scope tail

The low-usage tail splits two ways — both kept explicit, never a silent map hole:

- **Conditional Build targets (mapped, but built only on demand).** `p-knob`→`cae-knob` (line above), `p-organizationchart`→`cae-org-chart`, `p-megamenu`+`p-dock`→`cae-mega-menu`+`cae-dock` **do** have `cae-*` Build rows in the tables above — but they are niche (the ROADMAP cut order), so treat those names as *planned-if-used*, not committed targets.
- **Out of scope (no Material/CDK path).** `p-terminal` and PrimeNG utility directives with no Caelum analogue (`pStyleClass`, `pBind`, `ClassNames`, `p-fluid`, `FilterService`) have no first-party path at all.

A migrating team that hits either kind makes an explicit **build-or-drop** decision (Book 20 §6) rather than assuming a target exists.

## How to use this map

1. **Inventory your app first.** Caelum ships the parity surface; *your* codebase decides priority (Book 20 §3.4 / R7). Grep the real `p-*` selector usage and worst-case data sizes, and enumerate the props each call site actually uses (not the PrimeNG docs — brief §6) — that ranking, not this table's order, drives the migration.
2. **Seed the capability ledger** from this map, sorted by that real usage. Drive each row through the Book-20 migration pre-states `untouched → mapped → renamed`, then into Book 16 §2.2's verification ledger (`scaffolded → implementer-passed → adversarial-passed`); a row is *migrated* only at **`adversarial-passed`**, never at a clean `renamed` (Book 20 §3.6 — the evidence-gated ledger idea is brief §7, the verification state names are Book 16 §2.2's).
3. **Run the codemods** (Book 20 §3.3) for the mechanical `p-*`→`cae-*` renames; resolve every `TODO(caelum-migrate)` marker the codemod leaves for a semantic prop/event remap by hand.
4. **Hold the line forward** with the erosion ratchet (Book 20 §3.5): no new `primeng/*` import, no new `<p-*>` tag; the falling count is the burndown to zero.

*Living document — correct effort tiers against actuals, and add rows as PrimeNG evolves. Source inventory: the PrimeNG showcase component list; targets from intake brief §3.*
