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
export * from 'caelum/shared';

// --- Shared base for the mat-form-field controls (input/textarea/select/autocomplete/multi-select) (#46) ---
export * from 'caelum/form-field';

// --- Batch 1 (#5) ---
export * from 'caelum/button';
export * from 'caelum/card';
export * from 'caelum/checkbox';
export * from 'caelum/input';

// --- Batch 2 (#26) ---
export * from 'caelum/radio';
export * from 'caelum/select';
export * from 'caelum/textarea';
export * from 'caelum/tabs';
export * from 'caelum/tooltip';

// --- Batch 3 (#27) ---
export * from 'caelum/menu';
export * from 'caelum/stepper';
export * from 'caelum/tree';

// --- Batch 4 (#68, #73) ---
export * from 'caelum/switch';
export * from 'caelum/select-button';
export * from 'caelum/toggle-button';

// --- Panel/layout: accordion (#77), toolbar (#126) ---
export * from 'caelum/accordion';
export * from 'caelum/toolbar';

// --- Data display: chip (#83), chip-set (#84), badge (#126) ---
export * from 'caelum/chip';
export * from 'caelum/chip-set';
export * from 'caelum/badge';

// --- Display primitives: progress-bar, progress-spinner, divider (#88) ---
export * from 'caelum/progress-bar';
export * from 'caelum/progress-spinner';
export * from 'caelum/divider';

// --- Form controls: slider (#109 — numeric CVA over MatSlider, single + range) ---
export * from 'caelum/slider';

// --- Form controls: listbox (#114 — selection-list CVA over MatSelectionList, single + multiple) ---
export * from 'caelum/listbox';

// --- Form controls: autocomplete (#119 — typeahead combobox CVA over matAutocomplete) ---
export * from 'caelum/autocomplete';

// --- Composed (M1): multi-select (#135 — string[] CVA over mat-select[multiple] + filter + chips) ---
export * from 'caelum/multi-select';

// --- Composed (M1): table (#141 — declarative data table over MatTable + MatSort + MatPaginator) ---
export * from 'caelum/table';

// --- Composed (M3): tree-table (#262 — hierarchical treegrid over MatTable, flattened-tree + row-roving a11y) ---
export * from 'caelum/tree-table';

// --- Media (M3): carousel (#273 — content-agnostic rotating carousel; signal index, autoplay+pause, APG a11y) ---
export * from 'caelum/carousel';

// --- Media (M3): galleria (#274 — image gallery; thumbnail tablist + fullscreen lightbox over cae-dialog) ---
export * from 'caelum/galleria';

// --- Media (M3): image (#275 — token-styled image + fullscreen zoom/rotate/pan preview over cae-dialog) ---
export * from 'caelum/image';

// --- Media (M3): image-compare (#293 — before/after reveal slider; APG window-splitter divider, RTL-aware, p-imagecompare parity) ---
export * from 'caelum/image-compare';

// --- Form controls (M3): tree-select (#279 — hierarchical node-select over a cdkConnectedOverlay + mat-tree panel; value = node keys) ---
export * from 'caelum/tree-select';

// --- Form controls (M3): input-number (#301 — numeric text input; number|null CVA over Intl.NumberFormat, first of the input family #302–#304) ---
export * from 'caelum/input-number';

// --- Form controls (M3): input-otp (#303 — one-time-code input, N cells / one string CVA, p-inputOtp parity) ---
export * from 'caelum/input-otp';

// --- Form controls (M3): password (#304 — matInput[type=password] + visibility toggle + advisory strength meter, p-password parity) ---
export * from 'caelum/password';

// --- Form controls (M3): input-mask (#302 — fixed-template masked input, unmasked-string CVA, p-inputMask parity; last input-family member) ---
export * from 'caelum/input-mask';

// --- Layout (M3): splitter (#323 — keyboard-resizable multi-panel splitter, APG window-splitter dividers, p-splitter parity; opens the Splitter family) ---
export * from 'caelum/splitter';

// --- Layout (M3): scroll-panel (#328 — token-styled cross-browser scroll container over native overflow + CdkScrollable, Splitter family sibling) ---
export * from 'caelum/scroll-panel';

// --- Navigation (M3): breadcrumb (#332 — semantic nav + <ol> + aria-current, CSS token separators, no overlay; p-breadcrumb parity) ---
export * from 'caelum/breadcrumb';

// --- Drag-drop cluster (M3): order-list (#336 — keyboard-operable drag-reorderable listbox over cdkDropList + LiveAnnouncer; p-orderList parity; first of OrderList/PickList/FileUpload) ---
export * from 'caelum/order-list';

// --- Composed (M1): split-button (#148 — primary command + secondary-action dropdown over MatButton + cae-menu) ---
export * from 'caelum/split-button';

// --- Composed (M1): menubar (#153 — horizontal application menu bar over MatToolbar + cae-menu, roving keyboard) ---
export * from 'caelum/menubar';

// --- Composed (M1): context-menu (#157 — right-click context menu over CDK Menu / cdkContextMenuTriggerFor) ---
export * from 'caelum/context-menu';

// --- Composed (M1): tab-menu (#164 — horizontal tab-styled navigation/selection bar over mat-tab-nav-bar) ---
export * from 'caelum/tab-menu';

// --- Adapters (M2): grid (#170 — neutral engine-swappable data grid; client default here, TanStack behind the same port in #171) ---
export * from 'caelum/grid';

// --- Services: toast (#96, D-15 — the first service passthrough, over MatSnackBar) ---
export * from 'caelum/toast';

// --- Services: dialog (#100, D-15 — service passthrough over MatDialog + content directives) ---
export * from 'caelum/dialog';

// --- Services: confirm (#101, D-15 — the confirm half, role=alertdialog built ON cae-dialog) ---
export * from 'caelum/confirm';
