# COMPARISON — The Living PrimeNG → Caelum Component Map

> **This is the canonical, living migration map** for a team leaving PrimeNG for Caelum: every PrimeNG `p-*` component to its Caelum `cae-*` equivalent, **the import path**, **whether it ships today**, the Angular Material / CDK primitive underneath, and the effort tier. It is the artifact [Book 20 — Migration & Adoption](../books/20_migration-and-adoption.md) drives (`§2.2`, `§3.1`), the behavior source the pre-committed parity scenarios of [Book 16](../books/16_accessibility-and-parity-verification.md) derive from, and the map the mechanical `p-*`→`cae-*` codemods (Book 20 §3.3) read.
>
> **It is a *starting allocation*, not a contract.** Effort tiers are predictions — log actuals and correct them (intake brief §3). A **mapped row is not a migrated component**: it names a target, and the Status column says whether that target is *built*. Even a ☑ shipped row is "migrated" only at `adversarial-passed` on the capability ledger (Book 16 §2.2), never because it renders (Book 20 §2.2). Adapter rows (grid/charts/editor) are isolated third-party engines behind a neutral interface (Book 12); everything else is first-party Material/CDK.
>
> **⚠ PrimeNG-side names are unverified.** `primeng` is not a dependency of this repo, so every `p-*` prop/event name quoted here comes from the tracker or the PrimeNG docs, never from a real installed package — **#253** tracks closing that gap and gates the codemod's input side. The `cae-*` side is read off shipped source.

## Legend — status, import, effort tier

**Status** — does the `cae-*` target exist in `projects/caelum/` today? Verified against the shipped entry-point list, not against this map's own rows (last swept 2026-07-24, `main` @ `24e7bc5`).

- **☑ shipped** — the entry point exists; the Import column names it.
- **◐ partial** — no dedicated `cae-*`, but an existing Material/CDK path covers the case; the row says which.
- **☐ planned** — mapped target, no code. Every ☐ row names its tracking issue, so a migrating team always has something to point at — **enforced by `scripts/audit_comparison.py`** (a preflight/CI gate since #810, which found four rows that had gone untracked through a milestone exit). Hitting one means an explicit **build-or-drop** decision (Book 20 §6).

**Import** — the **secondary entry point** to import from. Prefer it over the primary `caelum` barrel, which pulls the whole set. `—` on a ☐ row.

**Tier** (from brief §3):

- **Direct** — ~1:1 drop-in on a Material component.
- **Compose** — assembled from existing Material/CDK pieces.
- **Build-S / M / L** — a custom `cae-*` component on CDK/Aria; Small / Medium / Large.
- **Adapter** — a genuine gap needing a vetted, US-origin, MIT third-party engine, isolated behind a neutral adapter (Book 12; the brief calls this tier **Vet-lib**).

The **Book** column points at the Caelum book that covers that component family (plain reference, no section — the book resolves the detail).

### ⚠ Two entry points the `caelum` barrel deliberately cannot provide

`caelum/breadcrumb-router` (**D-595**, needs `@angular/router`) and `caelum/grid-tanstack` (**D-652**, needs `@tanstack/table-core`) import **optional** peer dependencies, so they are never re-exported from the barrel. A bundler resolves the static import graph *before* tree-shaking, so a single barrel re-export would make the "optional" peer mandatory for every consumer — measured in #652, where `import { CaeButton } from 'caelum'` failed to build with `@tanstack/table-core` absent. Import both by their own path; `import { provideTanStackGrid } from 'caelum'` is a resolution failure **by design**.

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

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `pInputText` (directive), `pTextarea` | `cae-input` / `cae-textarea` | `caelum/input` · `caelum/textarea` | ☑ | `matInput` + `mat-form-field` | Direct | 07 |
| `p-select` (was `p-dropdown`) | `cae-select` | `caelum/select` | ☑ | `MatSelect` | Direct | 09 |
| `p-multiselect` | `cae-multi-select` | `caelum/multi-select` | ☑ | `MatSelect[multiple]` + filter + chip summary | Compose | 09 |
| `p-autocomplete` | `cae-autocomplete` | `caelum/autocomplete` | ☑ | `matAutocomplete` (v1 force-selection default, unlike `p-autocomplete`; free text → #120) | Direct | 09 |
| `p-chips` **(REMOVED upstream in PrimeNG v20-rc)** | `cae-chip-set [textEntry]` for display; the **form/CVA** case → `cae-autocomplete [multiple]` free text (#120) | `caelum/chip-set` | ☑ display · ☐ **#120** form | `MatChipGrid` + `matChipInputFor` | Compose | 09 |
| `p-checkbox` | `cae-checkbox` | `caelum/checkbox` | ☑ | `MatCheckbox` | Direct | 07 |
| `p-radiobutton` | `cae-radio` | `caelum/radio` | ☑ | `MatRadioButton` | Direct | 07 |
| `p-toggleswitch` (was `p-inputswitch`) | `cae-switch` | `caelum/switch` | ☑ | `MatSlideToggle` | Direct | 07 |
| `p-togglebutton`, `p-selectbutton` | `cae-toggle-button` / `cae-select-button` | `caelum/toggle-button` · `caelum/select-button` | ☑ | `MatButtonToggle` (group) | Direct | 11 |
| `p-slider` | `cae-slider` | `caelum/slider` | ☑ | `MatSlider` | Direct | 07 |
| `p-listbox` | `cae-listbox` | `caelum/listbox` | ☑ | `mat-selection-list` (or `cdkListbox`) | Direct | 06 |
| `p-datepicker` (was `p-calendar`) | `cae-datepicker` | `caelum/datepicker` | ☑ | `MatDatepicker` + `mat-date-range-input` + `MatTimepicker` (time/datetime) + a custom multi-date `MatDateSelectionModel` (the one build) | Compose | 09 |
| — (time-of-day) | `cae-datepicker [timeOnly]` / `[showTime]` | `caelum/datepicker` | ☑ | `MatTimepicker` — **first-party since Material 22**, so the "no time picker" R2 scar is closed (#666); no `matInput` mask, no standalone `cae-time-picker` needed | Compose | 09 |
| `p-inputnumber` | `cae-input-number` | `caelum/input-number` | ☑ | `matInput` format/parse; `number\|null` CVA component | Build-S | 08 |
| `p-inputmask` | `cae-input-mask` | `caelum/input-mask` | ☑ | fixed-template mask **component** (extends `CaeFormFieldControlBase`); **unmasked**-string CVA, live re-mask + caret discipline + paste-spread, no foreign mask lib | Build-S | 08 |
| `p-inputotp` | `cae-input-otp` | `caelum/input-otp` | ☑ | N segmented native inputs; one `string` CVA (NG_VALUE_ACCESSOR), roving tabindex | Build-S | 08 |
| `p-password` | `cae-password` | `caelum/password` | ☑ | `matInput[type=password]` component (extends `CaeFormFieldControlBase`) + inline-SVG visibility toggle + advisory token-styled strength meter (enforced policy stays a form `ValidatorFn`) | Build-S | 08 |
| `pKeyFilter` (directive) | `cae-key-filter` | — | ☐ **#712** | directive on `matInput` | Build-S | 08 |
| `p-rating` | `cae-rating` | `caelum/rating` | ☑ | icon row + Aria | Build-S | 11 |
| `p-colorpicker` | `cae-color-picker` | — | ☐ **#712** | native `<input type=color>` / CDK overlay | Build-S | 08 |
| `p-knob` | `cae-knob` | — | ☐ **#667** | SVG + CDK pointer | Build-M | 08 |
| `p-cascadeselect` | `cae-cascade-select` | — | ☐ **#712** | nested `MatMenu` / CDK Menu | Build-M | 09 |
| `p-treeselect` | `cae-tree-select` | `caelum/tree-select` | ☑ | `MatTree` in CDK overlay | Build-M | 09 |
| `p-mention` | `cae-mention` | — | ☐ **#712** | CDK overlay + `matAutocomplete` | Build-M | 09 |
| `p-floatlabel`, `p-iconfield`, `p-iftalabel`, `p-inputgroup` | `mat-form-field`'s own label + `matPrefix` / `matSuffix` — **no `cae-input-group` ships**, and none is planned: every Caelum form control already wraps `mat-form-field` | (each control's own entry point) | ◐ | `mat-form-field` label + prefix/suffix | Direct / Compose | 07 |

**Infra entry points a form migration also touches:** `caelum/shared` (type-only — `CaeFormFieldAppearance`, `CaeErrorMessages`, `CaeSortDirection`, `CaeTooltipPosition`, `CaeMenuPanelHost`) and `caelum/form-field` (`CaeFormFieldControlBase`, the shared CVA base — **experimental** for external subclassing, #54).

## Buttons

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-button` (`pButton`) | `cae-button` | `caelum/button` | ☑ | `MatButton` variants | Direct | 04 |
| `p-splitbutton` | `cae-split-button` | `caelum/split-button` | ☑ | `MatButton` + `MatMenu` (via `cae-menu`; v1 #148 = required label + shared variant + optional-submit primary + data-driven dropdown; the primary `[icon]` shipped with D-596/#644; per-half-appearance + `(dropdownClick)` → #149, rich menu items → #150) | Compose | 09 |
| `p-speeddial` | `cae-speed-dial` | — | ☐ **#712** | CDK overlay + animation | Build-M | 09 |

## Data

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-table` (basic→mid) | `cae-table` | `caelum/table` | ☑ | `MatTable` + `MatSort` + `MatPaginator` (staged: v1 #141 = text columns + sort + paginate; selection + expandable rows → #144, custom cell templates → #143; expandable rows = project `<ng-template caeRowDetailDef>` for p-table `rowexpansion` parity, an accessible disclosure toggle + `[(expanded)]` model, #144; single-select is a native radio group — *not* deselectable by default per ARIA, opt into `[allowDeselect]` for p-table-style click/Space re-activation to clear #224; sticky header via `stickyHeader` + sticky columns via `CaeTableColumn.sticky`/`.stickyEnd`, covering p-table's frozen-header / frozen-column capability (exact p-table API names unverified — `primeng` is not installed; #253) — purely visual, needs a scrolling ancestor **and** a table wider than it, positioning verified in the M4 real-browser pass #240, #144; sticky **footer** awaits a footer content model → #251) | Compose | 10 |
| `p-table` (advanced) | `cae-data-grid` | `caelum/grid` | ☑ | **TanStack Table** (headless) behind `CaeGridAdapter` | **Adapter** | 13 |
| ↳ the TanStack engine itself | `provideTanStackGrid()` / `TanStackGridAdapter` | ⚠ `caelum/grid-tanstack` — **not in the barrel** (D-652) | ☑ | optional peer `@tanstack/table-core`; `caelum/grid` alone ships the client default + server adapter with **no** engine dependency | **Adapter** | 13 |
| `p-tree` | `cae-tree` | `caelum/tree` | ☑ | `MatTree` | Direct | 10 |
| `p-treetable` | `cae-tree-table` | `caelum/tree-table` | ☑ | `MatTable` + tree data source (`role=treegrid`) | Build-M | 10 |
| `p-paginator` (standalone) | `cae-paginator` | — | ☐ **#712** | `MatPaginator`. Pagination already ships **inside** `cae-table` / `cae-data-grid` (`[paginated]`, `[pageSize]`, `[pageSizeOptions]`) — only the detached case is missing | Direct | 10 |
| `p-virtualscroller` (a.k.a. `p-scroller`) | `cdk-virtual-scroll-viewport` — **use the CDK directly**; no `cae-*` wrapper is planned (it would add a name over an already-ergonomic primitive, the same call as `pDraggable`→`cdkDrag`) | `@angular/cdk/scrolling` | ◐ | `cdk-virtual-scroll-viewport` | Direct | 10 |
| `p-dataview` | `cae-data-view` | — | ☐ **#712** | layout + `MatPaginator` | Compose | 10 |
| `p-orderlist` | `cae-order-list` | `caelum/order-list` | ☑ | keyboard-operable drag-reorderable multi-selectable `role=listbox` over `cdkDropList`; **multi-select** (`[(selection)]`; click/Ctrl/Shift-click, Space/Shift+Arrow/Ctrl+A) with block move up/top/down/bottom + roving tabindex (focus separate from selection), every move + selection announced via `LiveAnnouncer`; content-agnostic `caeOrderListItem` template (item/index/active/selected); **in-list filter** (`[filter]` + type-safe `[filterMatch]` predicate, labelled `type=search` box, empty-state + announced count, reorder disabled while filtering); **per-item disabling** via `[disabledMatch]` and **stable identity** via `[trackBy]` (p-orderList's `dataKey`); `[(value)]` model + `(reorder)`; no foreign drag lib; remaining deferred #341 (RTL) | Build-M | 11 |
| `p-picklist` | `cae-pick-list` | `caelum/pick-list` | ☑ | two connected keyboard-operable multi-selectable `role=listbox` lists over `cdkDropList` + `cdkDropListConnectedTo`; **per-list multi-select** (`[(sourceSelection)]`/`[(targetSelection)]`; click/Ctrl/Shift-click, Space/Shift+Arrow/Ctrl+A/Escape) with block transfer of the selected set both directions + per-list roving tabindex (focus separate from selection), every transfer + selection announced via `LiveAnnouncer`; **per-list within-list reorder** (drag-sort + an outer up/top/down/bottom control column per pane acting on the selected block; emits `(reorder)` with the `side`); content-agnostic `caePickListItem` template (item/index/active/selected); **projected per-side header slots** (`caePickListSourceHeader`/`caePickListTargetHeader`, each becoming its listbox's `aria-labelledby` name; explicit `[…AriaLabelledby]` still wins); **per-side in-list filter** (`[filter]` + shared type-safe `[filterMatch]` predicate, a labelled `type=search` box per list, empty-state + announced count; reorder disabled on a filtering list while transfer stays live); `[(source)]`/`[(target)]` models + `(transfer)`; remaining deferred #342 (RTL); no foreign drag lib | Build-M | 11 |
| `p-timeline` | `cae-timeline` | `caelum/timeline` | ☑ | CSS/flex + CDK | Build-S | 11 |
| `p-organizationchart` | `cae-org-chart` | — | ☐ **#667** | SVG/CDK or vetted US lib | Build-L | 11 |

## Panel / layout

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-accordion` | `cae-accordion` + `cae-expansion-panel` | `caelum/accordion` | ☑ | `MatExpansionPanel` / `MatAccordion` | Direct | 11 |
| `p-card` | `cae-card` | `caelum/card` | ☑ | `MatCard` | Direct | 11 |
| `p-tabs` (was `p-tabview`) | `cae-tabs` + `cae-tab` | `caelum/tabs` | ☑ | `MatTabGroup` | Direct | 11 |
| `p-stepper` (`p-steps`) | `cae-stepper` + `cae-step` | `caelum/stepper` | ☑ | `MatStepper` | Direct | 11 |
| `p-toolbar` | `cae-toolbar` | `caelum/toolbar` | ☑ | `MatToolbar` (`caeToolbarStart`/`caeToolbarEnd` slots; no `role=toolbar` — needs roving tabindex; center group / rows → #127) | Direct | 11 |
| `p-divider` | `cae-divider` | `caelum/divider` | ☑ | `MatDivider` | Direct | 11 |
| `p-panel`, `p-fieldset` | `cae-panel` / `cae-fieldset` | — | ☐ **#711** | `MatCard` / built legend. Nearest shipped: `cae-card` (no header/collapse contract) and `cae-expansion-panel` (carries accordion semantics) | Compose | 11 |
| `p-scrollpanel` | `cae-scroll-panel` | `caelum/scroll-panel` | ☑ | native `overflow` + token-styled scrollbars over `CdkScrollable`; keyboard-focusable `role=region` only while content overflows; no custom-scrollbar engine | Build-S | 11 |
| `p-splitter` | `cae-splitter` + `cae-splitter-panel` | `caelum/splitter` | ☑ | multi-panel flex splitter; keyboard-resizable APG window-splitter dividers (`role=separator`), native pointer resize, RTL via `Directionality`, no foreign drag lib | Build-M | 11 |

## Overlay

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-dialog`, DynamicDialog | **`CaeDialog` service** — `open()` → `CaeDialogRef`; body directives `caeDialogTitle`/`caeDialogContent`/`caeDialogActions`/`caeDialogClose`. **Not** a `[(visible)]`-bound component (D-15) | `caelum/dialog` | ☑ | `MatDialog` (component injection) | Direct | 09 |
| `p-confirmdialog` | **`CaeConfirmService.confirm()`** (centered modal) | `caelum/confirm` | ☑ | `MatDialog` + confirm wrapper (`role=alertdialog`) | Compose | 09 |
| `p-confirmpopup` | **`CaeConfirmService.confirmAt(origin, …)`** — the *same service*, anchored presentation. There is **no `<cae-confirm-popup>` selector**: the `CaeConfirmPopup` body is internal, reachable only through the service | `caelum/confirm` | ☑ | CDK overlay | Build-S | 09 |
| `p-drawer` (was `p-sidebar`) | `cae-drawer` | — | ☐ **#709** | `MatSidenav` / `MatDrawer` | Direct | 09 |
| `pTooltip` (directive) | `[caeTooltip]` | `caelum/tooltip` | ☑ | `MatTooltip` | Direct | 09 |
| `p-popover` (was `p-overlaypanel`) | `cae-popover` + `[caePopoverTriggerFor]` | `caelum/popover` | ☑ | CDK Overlay (imperative) | Build-S | 09 |

## Menu

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-menu` | `cae-menu` + `[caeMenuTriggerFor]` | `caelum/menu` | ☑ | `MatMenu` | Direct | 09 |
| `p-menubar` | `cae-menubar` | `caelum/menubar` | ☑ | `MatToolbar` + `MatMenu` (via `cae-menu`; v1 #153 = one-level dropdowns + CDK `FocusKeyManager` roving + Down/Up-opens + skip-disabled + empty-items guard; submenus/rich items/responsive collapse/RTL/disabled-interactive → #155) | Compose | 09 |
| (TabMenu) | `cae-tab-menu` | `caelum/tab-menu` | ☑ | `mat-tab-nav-bar` + `mat-tab-link` (v1 #164 = manual-`active` mode; selection is VALUE-based — assign each item a `value` and bind `[(activeValue)]`, *not* p-tabMenu's reference-based `activeItem`; the wrapper owns the `mat-tab-nav-panel` internally for the ARIA tabs pattern; router-linked mode/icons/rich items/responsive/RTL/closable → #165) | Direct | 09 |
| `p-contextmenu` | `cae-context-menu` | `caelum/context-menu` | ☑ | CDK Menu (`cdkContextMenuTriggerFor`; v1 #157 = flat `CaeMenuItem[]` right-click menu, token-styled overlay panel via `ViewEncapsulation.None`, empty-items disables trigger, a11y free from the CDK primitives; submenus/rich items/groups/global-open/per-target data → #158) | Compose | 09 |
| `p-tieredmenu` | nested `items` on `cae-menu` — **no dedicated `cae-tiered-menu` is planned** | — | ☐ **#150** | `MatMenu` nesting. `CaeMenuItem.items` is already the self-referential model, but a flat menu renders only the top level and ignores nested items (`menu.ts`); **#150** adds the submenu rendering to `cae-menu` itself. The menubar and context-menu arms of the same gap are **#155** / **#158** — they enrich *those* components, so they do not own this row. | Compose | 09 |
| `p-breadcrumb` | `cae-breadcrumb` | `caelum/breadcrumb` | ☑ | semantic `nav` + `<ol>` with `aria-current="page"` on the current page (non-link); silent `aria-hidden` token separators; data-driven `[items]`/`[home]`; no overlay | Build-S | 09 |
| ↳ router-linked crumbs | `[caeBreadcrumbRouterLink]` | ⚠ `caelum/breadcrumb-router` — **not in the barrel** (D-595) | ☑ | optional peer `@angular/router`; without it, intercept via `(itemSelect)` | Build-S | 09 |
| `p-panelmenu` | `cae-panel-menu` | `caelum/panel-menu` | ☑ | `MatExpansionPanel` + nav | Build-S | 09 |
| `p-megamenu`, `p-dock` | `cae-mega-menu` / `cae-dock` | — | ☐ **#667** | CDK overlay / build (niche) | Build-M | 09 |

## Charts

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-chart` (Chart.js wrapper) | `cae-chart` | — | ☐ **#233** (on-demand per D-18) | **D3** (framework-agnostic modules) behind `CaeChartAdapter` — Material has no charts | **Adapter** | 14 |

## Rich-text editor

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-editor` (Quill wrapper) | `cae-editor` | — | ☐ **#232** (on-demand per D-18) | **Lexical** (framework-agnostic core) behind `CaeEditorAdapter` — no first-party editor; a CVA form control | **Adapter** | 15 |

## Messages / feedback

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-toast` | **`CaeToast` service** — `open(message, action?, config?)` → `CaeToastRef` | `caelum/toast` | ☑ | `MatSnackBar` (extend for stacked/rich) | Direct | 09 |
| `p-message` (inline) | `cae-alert` | — | ☐ **#710** | alert component on `MatCard` (no first-party alert). **No substitute ships** — `cae-toast` is transient and overlay-positioned, a different pattern with a different a11y contract | Build-S | 11 |
| `p-progressbar` | `cae-progress-bar` | `caelum/progress-bar` | ☑ | `MatProgressBar` | Direct | 11 |
| `p-progressspinner` | `cae-progress-spinner` | `caelum/progress-spinner` | ☑ | `MatProgressSpinner` | Direct | 11 |
| `p-badge` (`pBadge`) | `[caeBadge]` **directive only** | `caelum/badge` | ☑ | `MatBadge` (forward `caeBadgeDescription` for a11y; no standalone component / severity colour → #129) | Direct | 11 |
| `p-metergroup` | `cae-meter-group` | — | ☐ **#712** | stacked `MatProgressBar` | Build-S | 11 |
| `p-skeleton` | `cae-skeleton` | `caelum/skeleton` | ☑ | CSS shimmer | Build-S | 11 |

## File

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-fileupload` | `cae-file-upload` | `caelum/file-upload` | ☑ | keyboard-reachable native `input[type=file]` + native `DataTransfer` dropzone (not `cdkDropList` — that transfers `cdkDrag` items, never OS file drops); trust-boundary type/size validation *before* upload; `HttpClient` `reportProgress` per-file progress + cancel/retry; request config (`withCredentials` / `headers` / `params`, Content-Type guarded); controlled CVA (value = accepted `File[]`), `LiveAnnouncer` announcements; no first-party uploader — built US-clean (Book 03) | Build-M | 11 |

## Media (a team priority)

| PrimeNG (`p-*`) | Caelum (`cae-*`) | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `p-carousel` | `cae-carousel` | `caelum/carousel` | ☑ | CDK drag + stepper index | Build-M | 11 |
| `p-galleria` | `cae-galleria` | `caelum/galleria` | ☑ | overlay shell (Book 09) + drag-drop | Build-M | 11 |
| `p-image` | `cae-image` | `caelum/image` | ☑ | overlay preview / lightbox | Build-S | 11 |
| `p-imagecompare` | `cae-image-compare` | `caelum/image-compare` | ☑ | before/after reveal slider; APG window-splitter divider (`role=separator`, keyboard-resizable), RTL via `Directionality`, no foreign drag lib (niche) | Build-S | 11 |

## Misc / directives

| PrimeNG | Caelum | Import | Status | Material / CDK basis | Tier | Book |
|---|---|---|---|---|---|---|
| `pDraggable` / `pDroppable` | `cdkDrag` / `cdkDropList` — no `cae-*` wrapper | `@angular/cdk/drag-drop` | ◐ | `@angular/cdk/drag-drop` | Direct | 05 |
| `pFocusTrap` | `cdkTrapFocus` | `@angular/cdk/a11y` | ◐ | `@angular/cdk/a11y` | Direct | 05 |
| `pAutoFocus` | `cdkFocusInitial` | `@angular/cdk/a11y` | ◐ | `@angular/cdk/a11y` | Direct | 05 |
| `pRipple` | `matRipple` | `@angular/material/core` | ◐ | Material ripple | Direct | 11 |
| `p-chip` | `cae-chip` | `caelum/chip` | ☑ | `MatChip` | Direct | 11 |
| — (a set of chips) | `cae-chip-set` (`role=grid`, generic `T` + accessor inputs) | `caelum/chip-set` | ☑ | `MatChipGrid` | Compose | 11 |
| `p-tag` | `cae-tag` | `caelum/tag` | ☑ | `MatChip` (static, non-focusable) | Compose | 11 |
| `p-avatar` (`p-avatargroup`) | `cae-avatar` / `cae-avatar-group` | `caelum/avatar` | ☑ | small component (no first-party avatar) | Build-S | 11 |
| — (D-596 glyphs) | `cae-icon [name]` + `CAE_ICON_GLYPHS` / `CaeIconName` | `caelum/icon` | ☑ | inline SVG, a closed library-owned registry (no icon font, no `iconUrl`) | Build-S | 11 |
| `p-inplace`, `p-blockui`, `p-scrolltop`, `pAnimateOnScroll` | (build on demand) | — | ☐ **#712** | CDK | Build-S | — |

## Niche / out-of-scope tail

The low-usage tail splits three ways — all kept explicit, never a silent map hole:

- **Conditional Build targets (mapped, ☐, built only on demand).** Two standing lists: **#667** — `p-knob`, `p-organizationchart`, `p-megamenu`, `p-dock` (the D-18 four) — and **#712** — `p-paginator` (standalone), `p-dataview`, `p-metergroup`, `p-cascadeselect`, `p-mention`, `p-colorpicker`, `p-speeddial`, `pKeyFilter`, `p-inplace`, `p-blockui`, `p-scrolltop`, `pAnimateOnScroll`. A real consumer need promotes a row out of either list into its own slice ticket.
- **Real gaps with their own tickets.** `p-drawer`→`cae-drawer` (**#709**), `p-message`→`cae-alert` (**#710**), `p-panel`/`p-fieldset`→`cae-panel`/`cae-fieldset` (**#711**) are common enough that they are tracked as buildable slices rather than on-demand deferrals.
- **Out of scope (no Material/CDK path).** `p-terminal` and PrimeNG utility directives with no Caelum analogue (`pStyleClass`, `pBind`, `ClassNames`, `p-fluid`, `FilterService`) have no first-party path at all.

A migrating team that hits any of these makes an explicit **build-or-drop** decision (Book 20 §6) rather than assuming a target exists.

## How to use this map

1. **Inventory your app first.** Caelum ships the parity surface; *your* codebase decides priority (Book 20 §3.4 / R7). Grep the real `p-*` selector usage and worst-case data sizes, and enumerate the props each call site actually uses (not the PrimeNG docs — brief §6) — that ranking, not this table's order, drives the migration.
2. **Check the Status column before planning a wave.** Every ☐ is a build-or-drop decision you must make *before* you schedule the work, not one you discover mid-migration. Sort your inventory by status first, frequency second.
3. **Seed the capability ledger** from this map, sorted by that real usage. Drive each row through the Book-20 migration pre-states `untouched → mapped → renamed`, then into Book 16 §2.2's verification ledger (`scaffolded → implementer-passed → adversarial-passed`); a row is *migrated* only at **`adversarial-passed`**, never at a clean `renamed` (Book 20 §3.6 — the evidence-gated ledger idea is brief §7, the verification state names are Book 16 §2.2's).
4. **Run the codemods** (Book 20 §3.3) for the mechanical `p-*`→`cae-*` renames; resolve every `TODO(caelum-migrate)` marker the codemod leaves for a semantic prop/event remap by hand. Import from the per-component entry point in the Import column, not the `caelum` barrel.
5. **Hold the line forward** with the erosion ratchet (Book 20 §3.5): no new `primeng/*` import, no new `<p-*>` tag; the falling count is the burndown to zero.

*Living document — correct effort tiers against actuals, re-sweep the Status column when entry points land, and add rows as PrimeNG evolves. Source inventory: the PrimeNG showcase component list; targets from intake brief §3.*
