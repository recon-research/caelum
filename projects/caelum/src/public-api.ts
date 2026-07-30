/*
 * Public API Surface of caelum — the convenience barrel.
 *
 * Direct (1:1) components over Angular Material — each a thin, standalone `cae-*` wrapper
 * that gives migrating teams a stable Caelum API seam over Material (D-01/D-02; Book 20
 * §2.1), themed through the token bridge.
 *
 * Since #28 (Book 19 §3.2) each component also ships as its own tree-shakable secondary
 * entry point (`caelum/button`, …, plus `caelum/shared` for cross-component types) so a
 * consumer can "pay only for what they import" (Book 18 §3.3). This barrel re-exports
 * every one of them by package name — importing `caelum` still works exactly as before
 * (the split is additive) — but a barrel import pulls the whole set, so prefer the
 * per-component path in app code. Re-exporting by name (not by re-declaring the source)
 * is also what keeps each source file owned by a single entry point, which ng-packagr
 * requires. Batch 1 = #5; batch 2 = #26; batch 3 = #27; batch 4 = #68, #73; accordion = #77;
 * chip = #83; display primitives (progress-bar/spinner/divider) = #88; toolbar/badge = #126.
 */

// --- Shared types ---
export * from '@recon-research/caelum/shared';

// --- Shared glyph registry + cae-icon renderer (D-596, #644) ---
export * from '@recon-research/caelum/icon';

// --- Shared base for the mat-form-field controls (input/textarea/select/autocomplete/multi-select) (#46) ---
export * from '@recon-research/caelum/form-field';

// --- Batch 1 (#5) ---
export * from '@recon-research/caelum/button';
export * from '@recon-research/caelum/card';
export * from '@recon-research/caelum/checkbox';
export * from '@recon-research/caelum/input';

// --- Batch 2 (#26) ---
export * from '@recon-research/caelum/radio';
export * from '@recon-research/caelum/select';
export * from '@recon-research/caelum/textarea';
export * from '@recon-research/caelum/tabs';
export * from '@recon-research/caelum/tooltip';

// --- Batch 3 (#27) ---
export * from '@recon-research/caelum/menu';
export * from '@recon-research/caelum/stepper';
export * from '@recon-research/caelum/tree';

// --- Batch 4 (#68, #73) ---
export * from '@recon-research/caelum/switch';
export * from '@recon-research/caelum/select-button';
export * from '@recon-research/caelum/toggle-button';

// --- Panel/layout: accordion (#77), toolbar (#126) ---
export * from '@recon-research/caelum/accordion';
export * from '@recon-research/caelum/toolbar';

// --- Data display: chip (#83), chip-set (#84), badge (#126) ---
export * from '@recon-research/caelum/chip';
export * from '@recon-research/caelum/chip-set';
export * from '@recon-research/caelum/badge';

// --- Display primitives: progress-bar, progress-spinner, divider (#88) ---
export * from '@recon-research/caelum/progress-bar';
export * from '@recon-research/caelum/progress-spinner';
export * from '@recon-research/caelum/divider';

// --- Form controls: slider (#109 — numeric CVA over MatSlider, single + range) ---
export * from '@recon-research/caelum/slider';

// --- Form controls: listbox (#114 — selection-list CVA over MatSelectionList, single + multiple) ---
export * from '@recon-research/caelum/listbox';

// --- Form controls: autocomplete (#119 — typeahead combobox CVA over matAutocomplete) ---
export * from '@recon-research/caelum/autocomplete';

// --- Composed (M1): multi-select (#135 — string[] CVA over mat-select[multiple] + filter + chips) ---
export * from '@recon-research/caelum/multi-select';

// --- Composed (M1): table (#141 — declarative data table over MatTable + MatSort + MatPaginator) ---
export * from '@recon-research/caelum/table';

// --- Composed (M3): tree-table (#262 — hierarchical treegrid over MatTable, flattened-tree + row-roving a11y) ---
export * from '@recon-research/caelum/tree-table';

// --- Media (M3): carousel (#273 — content-agnostic rotating carousel; signal index, autoplay+pause, APG a11y) ---
export * from '@recon-research/caelum/carousel';

// --- Media (M3): galleria (#274 — image gallery; thumbnail tablist + fullscreen lightbox over cae-dialog) ---
export * from '@recon-research/caelum/galleria';

// --- Media (M3): image (#275 — token-styled image + fullscreen zoom/rotate/pan preview over cae-dialog) ---
export * from '@recon-research/caelum/image';

// --- Media (M3): image-compare (#293 — before/after reveal slider; APG window-splitter divider, RTL-aware, p-imagecompare parity) ---
export * from '@recon-research/caelum/image-compare';

// --- Form controls (M3): tree-select (#279 — hierarchical node-select over a cdkConnectedOverlay + mat-tree panel; value = node keys) ---
export * from '@recon-research/caelum/tree-select';

// --- Form controls (M3): input-number (#301 — numeric text input; number|null CVA over Intl.NumberFormat, first of the input family #302–#304) ---
export * from '@recon-research/caelum/input-number';

// --- Form controls (M3): input-otp (#303 — one-time-code input, N cells / one string CVA, p-inputOtp parity) ---
export * from '@recon-research/caelum/input-otp';

// --- Form controls (M3): password (#304 — matInput[type=password] + visibility toggle + advisory strength meter, p-password parity) ---
export * from '@recon-research/caelum/password';

// --- Form controls (M3): input-mask (#302 — fixed-template masked input, unmasked-string CVA, p-inputMask parity; last input-family member) ---
export * from '@recon-research/caelum/input-mask';

// --- Layout (M3): splitter (#323 — keyboard-resizable multi-panel splitter, APG window-splitter dividers, p-splitter parity; opens the Splitter family) ---
export * from '@recon-research/caelum/splitter';

// --- Layout (M3): scroll-panel (#328 — token-styled cross-browser scroll container over native overflow + CdkScrollable, Splitter family sibling) ---
export * from '@recon-research/caelum/scroll-panel';

// --- Navigation (M3): breadcrumb (#332 — semantic nav + <ol> + aria-current, CSS token separators, no overlay; p-breadcrumb parity) ---
export * from '@recon-research/caelum/breadcrumb';

// --- Display cluster (M3, #662): skeleton, avatar (+ group), timeline, tag — token-skinned display
// primitives with no overlay/focus/form-control machinery (Book 11 §3.1). Each imports no optional
// peer, so all four ride the barrel (D-652). ---
export * from '@recon-research/caelum/skeleton';
export * from '@recon-research/caelum/avatar';
export * from '@recon-research/caelum/timeline';
export * from '@recon-research/caelum/tag';

// --- Rating (M3-exit, #663): keyboard-operable star rating as a NG_VALUE_ACCESSOR form control
// (the cae-radio selection-control family, #47). Depends on caelum/icon (first-party, not an
// optional peer), so it rides the barrel per D-652.
export * from '@recon-research/caelum/rating';

// --- Drag-drop cluster (M3): order-list (#336 — keyboard-operable drag-reorderable listbox over cdkDropList + LiveAnnouncer; p-orderList parity; first of OrderList/PickList/FileUpload) ---
export * from '@recon-research/caelum/order-list';

// --- Drag-drop cluster (M3): pick-list (#337 — two connected keyboard-operable cdkDropLists with move-selected/move-all buttons + LiveAnnouncer; p-pickList parity; second of OrderList/PickList/FileUpload) ---
export * from '@recon-research/caelum/pick-list';

// --- Drag-drop cluster (M3): file-upload (#338 — keyboard-reachable input[type=file] + native dropzone, trust-boundary type/size validation, HttpClient progress/cancel/retry, controlled CVA; p-fileUpload parity; third and final of OrderList/PickList/FileUpload) ---
export * from '@recon-research/caelum/file-upload';

// --- Composed (M1): split-button (#148 — primary command + secondary-action dropdown over MatButton + cae-menu) ---
export * from '@recon-research/caelum/split-button';

// --- Composed (M1): menubar (#153 — horizontal application menu bar over MatToolbar + cae-menu, roving keyboard) ---
export * from '@recon-research/caelum/menubar';

// --- Composed (M1): context-menu (#157 — right-click context menu over CDK Menu / cdkContextMenuTriggerFor) ---
export * from '@recon-research/caelum/context-menu';

// --- Composed (M1): tab-menu (#164 — horizontal tab-styled navigation/selection bar over mat-tab-nav-bar) ---
export * from '@recon-research/caelum/tab-menu';

// --- Composed (M3): panel-menu (#665 — accordion-composed nested navigation menu; p-panelmenu parity.
// Composes cae-accordion + the CaeMenuItem model, imports no optional peer, so it rides the barrel per D-652) ---
export * from '@recon-research/caelum/panel-menu';

// --- Form controls (M3): datepicker (#666 — p-datepicker parity, value-bearing overlay over Material's
// datepicker family; one CVA whose shape follows [selectionMode]. Imports only @angular/material +
// caelum/form-field (no optional peer), so it rides the barrel per D-652. Stage 1 = single/range/inline) ---
export * from '@recon-research/caelum/datepicker';

// --- Adapters (M2): grid (#170 — neutral engine-swappable data grid; client + server defaults are
// engine-free, so this rides the barrel). The TanStack engine (#171) lives in the barrel-EXEMPT
// entry point `caelum/grid-tanstack` (#652, D-652) and is imported directly — its optional @tanstack
// peer must not be dragged into a bare `import from '@recon-research/caelum'` (guard: check-lib-exports.mjs). ---
export * from '@recon-research/caelum/grid';

// --- Services: toast (#96, D-15 — the first service passthrough, over MatSnackBar) ---
export * from '@recon-research/caelum/toast';

// --- Services: dialog (#100, D-15 — service passthrough over MatDialog + content directives) ---
export * from '@recon-research/caelum/dialog';

// --- Services: confirm (#101, D-15 — the confirm half, role=alertdialog built ON cae-dialog;
// extended in #664 with confirmAt() — a second, anchored presentation of the SAME service) ---
export * from '@recon-research/caelum/confirm';

// --- Popover (M3-exit, #664): anchored, trigger-relative content overlay over CDK Overlay + cdkTrapFocus
// (p-popover, was p-overlaypanel; Book 09 §3.2 — the OTHER overlay family from centered cae-dialog).
// Imports no optional peer, so it rides the barrel per D-652. ---
export * from '@recon-research/caelum/popover';

// --- Drawer (M5 parity close, #709): off-canvas / nav drawer over MatDrawer + MatDrawerContainer
// (p-drawer, was p-sidebar; Book 11 §3.1 — a layout panel as a Direct, token-skinned port). Supplies
// the modal semantics Material omits (role=dialog + aria-modal, per D-826); start/end only (#854). ---
export * from '@recon-research/caelum/drawer';

// --- Alert (M5 parity close, #710): the INLINE status/validation message (p-message; tier Build-S —
// Material ships no first-party alert, and cae-toast is a different, transient, LiveAnnouncer-based
// contract). Owns its live region: role=alert/status per severity, dismiss button OUTSIDE it. ---
export * from '@recon-research/caelum/alert';

// --- Panel / fieldset (M5 parity close, #711): the titled-container family (p-panel, p-fieldset;
// Book 11 §3.1 rates the row Compose). Two components, not one flagged one: cae-fieldset is a real
// <fieldset>+<legend>, whose legend natively NAMES the enclosed group — no MatCard reproduces that. ---
export * from '@recon-research/caelum/panel';
