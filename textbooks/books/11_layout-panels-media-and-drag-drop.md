# Book 11 — Layout, Panels, Media & Drag-Drop

> Volume II — Building on Primitives (**the book that completes it**). The structural-and-visual remainder: accordion, card, tabs, stepper, toolbar, divider (overwhelmingly **Direct** Material ports), the honest gaps Splitter and ScrollPanel, the drag-drop cluster OrderList/PickList/FileUpload, and the **media family Carousel/Galleria/Image-preview — a team priority** (ROADMAP). The trap here isn't a single dramatic scar; it's that this whole family *looks* trivial because Material hands you 80%, so the parity details — density, RTL drag axes, the a11y of tabs/stepper/accordion, and keyboard-operable drag-drop — get skipped and surface later as the R4 "Material doesn't quite look or behave like PrimeNG" gap.

## 1. TL;DR

Most of this book is the **laziest sufficient code** rung made literal: accordion (`MatExpansionPanel`/`MatAccordion`), card (`MatCard`), tabs (`MatTabGroup`), stepper (`MatStepper`), toolbar (`MatToolbar`), and divider (`MatDivider`) are **Direct** Material ports — Caelum's job is to *token-skin them for density and parity* (Book 04 §3.6), not rebuild what Material already ships accessibly (brief §3 panel rows). The genuine *builds* cluster around **one engine**: `@angular/cdk/drag-drop` (Book 05 §3.4) backs OrderList, PickList, FileUpload, Carousel, and Splitter — built once on the CDK, never a foreign drag library (provenance, Book 03). The **media family** (Carousel/Galleria/Image-preview) adds the overlay shell (Book 09 §3.1) for lightboxes on top of drag-drop, all token-styled. The two honest gaps with no first-party equivalent are **Splitter** (Build-M: CDK drag on a divider + flex, keyboard-resizable) and **ScrollPanel** (Build-S: usually just CDK scrolling / native overflow with token-styled scrollbars). The discipline that keeps the "easy" family honest: every drag has a **keyboard path** (no mouse-only reordering), RTL axes resolve through `Directionality`, drag state lives in **signals** under a zoneless host (Book 01 §3.2), and large lists/galleries **virtualize** (Book 10 §3.3). Finish this book and **Volume II is complete** — primitives, controls, overlays, data, and now layout/media — and the next move is Volume III's adapter layer.

## 2. Conceptual Foundations

### 2.1 The laziness ladder, lived — Direct-and-skin vs build

This family is the clearest case in the library of *climbing the laziness ladder and stopping at the first rung that holds* (CLAUDE.md working style). For layout and panels, that rung is almost always **Direct Material + a token skin**:

- **Don't rebuild what Material ships.** `MatTabGroup`, `MatStepper`, `MatExpansionPanel`, `MatCard`, `MatToolbar`, `MatDivider` are complete, accessible, and already overlay/CDK-backed. Re-implementing them is exactly the over-engineering the project warns against. Caelum *configures and token-skins* them (Book 04 §3.6) for PrimeNG density/aesthetic parity (R4) and verifies the a11y Material already provides — full stop.
- **Climb to "build" only for the honest gaps and the drag-drop cluster.** Splitter and ScrollPanel have no first-party equivalent; OrderList/PickList/FileUpload/Carousel are genuine assemblies. Those earn a `cae-*` build (§3.2–§3.4); the Direct ports do not.

The "Misc / directives" tail is the same lesson in miniature: `pDraggable`/`pDroppable` → CDK `DragDrop`, `FocusTrap` → `cdkTrapFocus`, `Ripple` → `matRipple` (brief §3) — all **Direct**, a one-line reach, nothing to build.

### 2.2 One engine, a column of components

The single most leveraged fact in this book: **`@angular/cdk/drag-drop` (Book 05 §3.4) backs an entire column of the migration map** — OrderList (sort within a list), PickList (transfer between two lists), FileUpload (a drop target), Carousel (drag to advance), and Splitter (drag a divider). Building all five on the one CDK primitive rather than five different approaches (or a foreign drag library) buys three things at once: consistent behavior, a clean provenance surface (Book 03 — no third-party drag dependency), and one place to get the hard parts right. The shared hard parts (§3.5): keyboard accessibility, RTL drag axes, move announcements, and signal-backed state under zoneless.

### 2.3 What v22 changed (and what didn't)

The Material panels/tabs/stepper and the CDK drag-drop/scrolling primitives are **stable, pre-cutoff** — asserted directly (Book 05 grounds the CDK). What v22 sharpens:

- **Zoneless drag-drop performance.** Drag runs high-frequency pointer math; it's legitimate to run that via `NgZone.runOutsideAngular` (Book 01 §3.2 marks this as *the* one safe `NgZone` use), but any state the template reads back — drop order, split size, carousel index — must land in a **signal** or change detection won't fire under a zoneless host.
- **Aria patterns overlap some panels.** Angular Aria ships **Accordion** and **Tabs** patterns (Book 06 §2.2); the reach-for ladder (Book 06 §3.1) decides Direct-Material vs Aria-headless per component — for these, Material's complete version usually wins, with Aria the option when a radically custom DOM is needed.

Version-specific behavior is grounded in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted from memory.

## 3. Architecture & Design

### 3.1 Layout & panels — Direct ports, token-skinned

The bulk of the family, and the bulk is **Direct** (brief §3 panel rows):

| PrimeNG | Caelum | Material target |
|---|---|---|
| Accordion | Direct | `MatExpansionPanel` / `MatAccordion` |
| Card | Direct | `MatCard` |
| Tabs / TabView | Direct | `MatTabGroup` |
| Stepper / Steps | Direct | `MatStepper` |
| Toolbar | Direct | `MatToolbar` |
| Divider | Direct | `MatDivider` |
| Panel / Fieldset | Compose | `MatCard` / build a `<fieldset>`+legend |

Caelum's work on these is **theming, not construction**: bind them to the `--cae-*` tokens and density scale (Book 04 §3.6) so a Material tab strip reads at PrimeNG density, and confirm the a11y Material already ships (tab roving focus, stepper `aria-current`, accordion `aria-expanded`) survives the skin. PanelMenu (Book 09 §3.4) is the inline-navigation cousin built on `MatExpansionPanel` — same panel mechanics, a menu's job. Resist adding component code here; a token override is the whole deliverable.

### 3.2 The honest gaps — Splitter & ScrollPanel

Two layout widgets have **no first-party Material equivalent** (brief §3) and must be built:

- **Splitter (Build-M).** A draggable divider between two (or more) flex panes. Build on `@angular/cdk/drag-drop` (Book 05 §3.4) for the divider drag + flex-basis math, but the parity work is **accessibility**: the divider gets `role="separator"`, `aria-orientation`, and `aria-valuenow`/`aria-valuemin`/`aria-valuemax`, and is **keyboard-resizable** (arrow keys nudge the split, Home/End snap) — a mouse-only splitter fails parity. Persist sizes, resolve drag axis through `Directionality` for RTL (§3.5).
- **ScrollPanel (Build-S).** A styled, cross-browser scroll container. The laziest sufficient version is **native `overflow` with token-styled scrollbars** plus `@angular/cdk/scrolling` (Book 05 §3.3) where a unified scroll stream or custom thumb is genuinely needed — don't reach for a custom-scrollbar engine when CSS + a CDK scrollable does it. Climb only as far as the requirement forces.

### 3.3 The drag-drop cluster — OrderList, PickList, FileUpload

Three list-manipulation builds, all on `@angular/cdk/drag-drop` (Book 05 §3.4), all **keyboard-operable, not drag-only**:

- **OrderList (Build-M).** One `cdkDropList`; reorder within. Provide non-drag controls (move up/down/top/bottom buttons) and announce moves via the CDK `LiveAnnouncer` (Book 05 §3.2) so a screen-reader user can reorder without a pointer.
- **PickList (Build-M).** Two connected `cdkDropList`s (transfer between source and target) with `cdkDropListConnectedTo`. Add move-selected / move-all buttons so the transfer is reachable by keyboard, not only by dragging across.
- **FileUpload (Build-M).** A `cdkDropList` drop target paired with a native `<input type=file>`, uploading via `HttpClient` with progress events. There is **no first-party uploader, so build it to keep the tree US-clean** (brief note, Book 03). Validate type and size **at the trust boundary** (reject before upload — a non-negotiable per the working style), render progress/cancel/error states, and keep the drop target operable by the keyboard-reachable file input. It may expose its value as a `ControlValueAccessor` (Book 07) when it lives in a form (the value is the selected/uploaded file set).

### 3.4 Media — Carousel, Galleria, Image-preview (a team priority)

The media family (brief §3 Media rows) layers the overlay shell onto drag-drop and is **pulled forward by the team usage signal** (ROADMAP):

- **Carousel (Build-M).** CDK drag-to-advance over a `CdkStepper`-style index (Book 05 §3.4/§3.5), with autoplay that **pauses on hover and focus**, `aria-roledescription="carousel"`, slide `aria-label`s, and arrow-key navigation. Keep the active index in a signal (zoneless, §2.3). The brief's hedge — *"or vetted US lib if heavy"* — is a real fork (§3.6): a small build is correct, but if it grows heavy, the Book 03 admit/reject gate decides a **vetted US-origin** carousel lib vs continuing to build.
- **Galleria (Build-M).** A thumbnail strip plus a **lightbox built on the overlay shell** (Book 09 §3.1): a focus-trapped modal with `Escape`, focus restoration to the thumbnail, and token-styled surface. The shell already gives positioning/dismissal/focus; Galleria supplies the thumbnail navigation and the large-image view.
- **Image zoom/preview (Build-S).** Click a thumbnail → open a token-styled overlay lightbox (Book 09 §3.1) with zoom; the smallest member of the family, almost entirely the overlay shell plus an `<img>`.

Large galleries **virtualize** their thumbnail strip (Book 10 §3.3) so a 500-image gallery doesn't mount 500 nodes — the R1 lesson applies to media lists too.

### 3.5 Drag-drop done right — the cluster's parity leg

The non-negotiables every drag-drop component in §3.3–§3.4 shares — the analogue of the control checklist (Book 07 §3.6) and the overlay checklist (Book 09 §3.6):

1. **A keyboard path for every drag.** Reorder/transfer/resize must be doable without a pointer (buttons, arrow keys) — drag-only is a parity *and* accessibility failure.
2. **`LiveAnnouncer` for moves** (Book 05 §3.2) — "moved to position 3 of 8" — so non-visual users track the change.
3. **RTL drag axes via `Directionality`** (Book 05 §3.4/§3.3) — horizontal drag and split direction honor `dir`; the visual half is logical properties in the token layer (Book 04).
4. **State in signals under zoneless** (Book 01 §3.2) — pointer math may run `runOutsideAngular`, but drop order / split size / carousel index land in signals or the view won't repaint.
5. **Drop validation + virtualization** — validate where a drop is allowed; virtualize long lists (Book 10 §3.3).
6. **No foreign drag library** (Book 03) — the one CDK engine keeps the provenance surface clean.

### 3.6 The component checklist for this family

Across the whole book, "done" splits by tier:

- **Direct ports (§3.1):** token-skinned to density/parity (Book 04 §3.6); the a11y Material ships is *verified to survive the skin*, not re-implemented; no bespoke component code added.
- **Gaps & cluster (§3.2–§3.4):** built on the CDK (drag-drop/scrolling/overlay), keyboard-operable, RTL-correct, `LiveAnnouncer`-announced, token-styled, signal-backed, and — for the media build-vs-vet fork — run through the Book 03 gate if a library is proposed. Verified with axe + manual keyboard + SR (Book 16) at realistic scale (Book 18).

The rule of thumb: if Material ships it, your job is *parity verification of a token skin*; if it's a gap or a cluster member, your job is *an honest CDK build with the keyboard path included from the start*.

## 4. Implementation

Illustrative, not necessarily compileable.

**A Splitter — draggable, keyboard-resizable divider** (the honest gap; a11y is the parity work):

```ts
// projects/caelum/src/lib/splitter/splitter.ts  →  cae-splitter
@Component({
  selector: 'cae-splitter',
  // template: [pane A] <div role="separator" cdkDrag ...> [pane B]; flex-basis driven by size().
  host: { 'class': 'cae-splitter' },
})
export class CaeSplitter {
  readonly size = signal(50);                                   // % — drag OR keyboard updates this signal
  protected onDrag(deltaPct: number) { this.size.update(s => clamp(s + deltaPct, 10, 90)); }
  protected onKey(e: KeyboardEvent) {                           // keyboard-resizable = parity (§3.2)
    if (e.key === 'ArrowRight') this.size.update(s => clamp(s + 2, 10, 90));
    if (e.key === 'ArrowLeft')  this.size.update(s => clamp(s - 2, 10, 90));
    // Home/End snap; RTL flips the arrows via Directionality (Book 05 §3.4)
  }
  // separator a11y: [attr.aria-valuenow]="size()" aria-valuemin="10" aria-valuemax="90" aria-orientation="vertical"
}
```

**A PickList — two connected CDK drop lists** (transfer with a keyboard path):

```html
<!-- drag between, AND move-buttons so it's operable without a pointer (§3.5 gate 1) -->
<div cdkDropList #src="cdkDropList" [cdkDropListData]="source()" [cdkDropListConnectedTo]="[tgt]"
     (cdkDropListDropped)="drop($event)"> … items … </div>
<button (click)="moveSelected()">▶</button>   <!-- non-drag transfer -->
<div cdkDropList #tgt="cdkDropList" [cdkDropListData]="target()" [cdkDropListConnectedTo]="[src]"
     (cdkDropListDropped)="drop($event)"> … items … </div>
<!-- moves announced via LiveAnnouncer (Book 05 §3.2); lists virtualize when large (Book 10 §3.3) -->
```

**A Carousel — index signal + drag + autoplay** (state in a signal for zoneless CD):

```ts
readonly index = signal(0);                                    // active slide — a signal (§2.3)
protected next() { this.index.update(i => (i + 1) % this.slides().length); }
// CDK drag-to-advance maps a horizontal drag past a threshold to next()/prev() (Book 05 §3.4);
// autoplay = effect timer that pauses on hover/focus; host aria-roledescription="carousel".
```

**An image lightbox — straight onto the overlay shell** (Book 09 §3.1 does the heavy lifting):

```ts
// open a focus-trapped, Escape-dismissable, token-styled overlay holding the full image.
// Galleria adds a thumbnail strip around this; Image-preview IS basically this. (Book 09 §3.1)
protected open(img: ImageRef) { this.overlay.open(LightboxComponent, { data: img, role: 'dialog' }); }
```

## 5. Bleeding Edge

Version-specific points live in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted from memory:

- **CSS scroll-snap & container queries.** Native CSS scroll-snap can carry much of a carousel's slide-snapping, and container queries make panels truly responsive to their container, not the viewport — both can shrink the JS in Carousel/Splitter/responsive panels. Promising; adopt where the support baseline holds.
- **Native `<dialog>` / Popover API for lightboxes.** The same future path noted for Book 09's overlays applies to Galleria/Image-preview — top-layer, light-dismiss — gated on the baseline and a focus-trap story; stay on the overlay shell until then.
- **Signal-native `CdkStepper`/drag-drop ergonomics.** As the CDK leans further into signals, the carousel index and drop state get cleaner; watch the platform note.

## 6. Gaps & Opportunities

- **No first-party Splitter, Carousel, or uploader** — all Build (brief §3); expected, but it means Caelum owns their keyboard/a11y tests, the place this "easy" family quietly fails parity.
- **Drag-drop keyboard accessibility is the under-tested seam** — the mouse path is obvious and the keyboard path is forgotten; a shared keyboard-reorder utility + a dedicated a11y fixture beats per-component reinvention.
- **The Carousel build-vs-vet line** (brief: "or vetted US lib if heavy") is a live Book 03 decision — ship the small build, and if it grows heavy, run a US-origin candidate through the admit/reject gate rather than letting the component balloon.
- **Volume II is complete with this book** — primitives (05–06), controls (07–08), overlays/menus (09), data (10), layout/media (11). The open curriculum is now **Volume III (the adapter layer, Books 12–15)** and Volumes IV–V; see `MANIFEST.json` `coverage_gaps` for the authoritative status.

## 7. AI & Claude Code Integration

High-multiplier on the scaffolding: the Direct-port token skins, the `cdkDropList` wiring, the splitter flex math, the carousel index logic, and the lightbox-on-the-shell are pattern-stable and fast to generate. The ~1× judgment that must stay human-verified is exactly where this family hides its difficulty — **the keyboard path for every drag (the single most-skipped requirement), RTL drag axes, carousel/lightbox focus management and autoplay-pause-on-focus, and the build-vs-vet fork for a heavy carousel**. These are silent at demo time: an agent will generate a beautiful mouse-draggable PickList that a keyboard user cannot operate at all, and it will pass every pointer-based test. The correct division: let the agent build the component and the *keyboard + screen-reader* fixtures (Book 16), then drive the whole family with the keyboard only and confirm every drag has a non-pointer path. "You can drag it" is the trap that looks done while half the users can't.

## 8. Exercises & Further Reading

**Exercises**

1. Token-skin `MatTabGroup` and `MatStepper` to a PrimeNG-like density using only `--cae-*` tokens (Book 04 §3.6); prove you wrote no component logic and that tab roving focus + stepper `aria-current` still work.
2. Build a `cae-splitter` on `@angular/cdk/drag-drop` that is resizable by **both** drag and arrow keys, exposes `role="separator"` with `aria-valuenow/min/max`, and flips its drag axis under `dir="rtl"`.
3. Build a PickList from two connected `cdkDropList`s with move-selected/move-all buttons; demonstrate a full transfer using **only** the keyboard, with each move announced via `LiveAnnouncer`.
4. Build a FileUpload with a `cdkDropList` drop target and an `<input type=file>` that validates type and size **before** upload, shows progress via `HttpClient` events, and is fully operable without dragging.
5. Build a Carousel whose active slide is a signal, that advances on drag and arrow keys, auto-plays but **pauses on hover and focus**, and announces slide changes; then open a Galleria lightbox on the Book 09 §3.1 overlay shell and confirm focus is trapped and restored.

**Further reading**

- Angular Material — [Expansion Panel](https://material.angular.io/components/expansion/overview) · [Tabs](https://material.angular.io/components/tabs/overview) · [Stepper](https://material.angular.io/components/stepper/overview) · [Card](https://material.angular.io/components/card/overview) · [Toolbar](https://material.angular.io/components/toolbar/overview)
- Angular CDK — [Drag and Drop](https://material.angular.io/cdk/drag-drop/overview) · [Scrolling](https://material.angular.io/cdk/scrolling/overview)
- MDN — [CSS scroll snap](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap) · [ARIA: `separator` role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/separator_role) · [carousel `aria-roledescription`](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/)
- In-library: Book 05 §3.4 (the CDK drag-drop engine behind OrderList/PickList/FileUpload/Carousel/Splitter), §3.3 (CDK scrolling for ScrollPanel + the virtualization lever), §3.2 (`LiveAnnouncer` for move announcements); Book 09 §3.1 (the overlay shell behind Galleria/Image-preview lightboxes) & §3.4 (PanelMenu, the `MatExpansionPanel` cousin); Book 10 §3.3 (virtualize large lists/galleries); Book 04 §3.6 (token-only styling + density for the Direct ports); Book 01 §3.2 (signal-backed drag state + the one safe `NgZone.runOutsideAngular`); Book 06 §2.2 (the Aria Accordion/Tabs patterns) & §3.1 (the reach-for ladder); Book 07 (the CVA a form-bound FileUpload may wear); Book 03 (why the drag-drop engine is CDK and the build-vs-vet gate for a heavy carousel); Book 16 (a11y/parity verification); Book 18 (performance for large lists/media).
