# Book 09 — Overlay & Menu Components

> Volume II — Building on Primitives. The floating-UI tier: OverlayPanel/Popover, ConfirmPopup, ConfirmDialog, the menu family (context/tiered/panel/menubar), Breadcrumb, and the value-bearing pickers CascadeSelect, TreeSelect, and Mention. None of these re-invent floating UI — they all stand on the CDK overlay substrate (Book 05 §3.1), which exists precisely so this book can build *components* and not *positioning math*. The trap this book exists to defeat: an overlay that demos perfectly and then strands focus, refuses to dismiss, or renders under a sticky header the first time a real user scrolls, resizes, or tabs.

## 1. TL;DR

Every component here is a piece of UI that **opens, positions itself against a trigger or the viewport, manages focus, and dismisses** — and Caelum builds them all on one shared overlay shell (Book 05 §3.1's `OverlayRef` + position/scroll strategies) rather than hand-positioning `position: absolute` divs. The single most important distinction in the book is the **trust-model split**: a **command overlay** (OverlayPanel, ConfirmPopup, ConfirmDialog, any menu, Breadcrumb) shows transient content or triggers an action and **returns nothing to a form**; a **value-bearing overlay** (CascadeSelect, TreeSelect, Mention) is a *form control whose option UI happens to float*, so it wears the full Book 07 control contract (CVA + `MatFormFieldControl` + the library `ErrorStateMatcher`) on top of the overlay. Confuse the two and you either bolt form plumbing onto a context menu or — worse — let a TreeSelect's value leak as display text instead of the model. For menus, climb the reach-for ladder (Book 06 §3.1): `MatMenu` for the simple case, the Angular Aria menu (which itself opens through `cdkConnectedOverlay`, Book 06 §3.2) for net-new pattern work, CDK Menu (`cdkMenuTriggerFor` / `cdkContextMenuTriggerFor`, Book 05 §3.5) as the battle-tested fallback. The cross-cutting parity gate (§3.6) is the same five disciplines for every component: **dismissal, focus, positioning/flip, ARIA roles, token-only surface** — the things a single happy-path demo never exercises.

## 2. Conceptual Foundations

### 2.1 Two families: command overlays vs value-bearing overlays

The components in this book look alike — they all float — but they divide cleanly by **what crosses the boundary when they close**:

- **Command overlays** return *an action or nothing*. OverlayPanel/Popover shows transient content; ConfirmPopup/ConfirmDialog asks a yes/no and resolves a promise; a context/tiered/panel menu invokes a command; Breadcrumb navigates. Their contract is about *behavior* — open, trap or rove focus, dismiss on the right signals, restore focus to the trigger — and **never** about a form value. They do not implement CVA.
- **Value-bearing overlays** return *a model value*. CascadeSelect resolves a leaf selection; TreeSelect resolves one or more nodes; Mention inserts a resolved entity reference into text. The floating panel is merely the *picker UI* for a value that must reach a form with full fidelity. These are **form controls first** (Book 07 §3.1's CVA, §3.4's `MatFormFieldControl`) that *use* an overlay second.

This is the spine of the book. Get the family right and everything else follows: a value-bearing overlay inherits the entire Book 07 discipline (value fidelity, error state, `mat-form-field` integration); a command overlay must *not* drag that plumbing along — a ConfirmDialog with a `writeValue` is a category error.

### 2.2 The overlay lifecycle every floating component shares

Independent of family, every floating component runs the same five-beat lifecycle, and each beat is a place parity quietly breaks:

1. **Open** — create an `OverlayRef` (or let `MatMenu`/`MatDialog` create one) with the right strategies. *Trap:* opening a second overlay without a shared z-order policy → stacking surprises.
2. **Position** — `FlexibleConnectedPositionStrategy` anchored to the trigger with an ordered fallback list (flip above when there's no room below), or `GlobalPositionStrategy` centered for a modal dialog (Book 05 §3.1). *Trap:* one preferred position, no fallbacks → the panel clips off-viewport on small screens.
3. **Focus** — modal surfaces **trap** focus (`cdkTrapFocus`) and move it inside; menus **rove** focus across items via `FocusKeyManager` with typeahead (Book 05 §3.2); non-modal popovers may leave focus in place. *Trap:* forgetting to move focus in (screen-reader users never reach the content) or to restore it out (focus jumps to `<body>` on close).
4. **Dismiss** — backdrop click, `Escape`, scroll (`close` vs `reposition` strategy), trigger re-click, or a programmatic resolve. *Trap:* a popover that dismisses on outside-click but not `Escape` is a keyboard-accessibility failure.
5. **Restore** — return focus to the triggering element and emit the closed/selected result. *Trap:* losing the trigger reference, so focus restoration silently no-ops.

A component that nails all five for the mouse and the keyboard and the screen reader is parity-done; one that nails beat 1–2 only is the demo that breaks on first real use.

### 2.3 What v22 changed, and the reach-for ladder for overlays

The CDK overlay/portal infrastructure is **stable and pre-cutoff** — `OverlayRef`, the position/scroll strategies, `CdkConnectedOverlay`, and `cdkTrapFocus` are the same APIs that have anchored Angular floating UI for years, so this book asserts them directly (the substrate is Book 05's responsibility to ground). What v22 *adds* sits at the **pattern** layer, and it changes how you build menus and pickers, not how they float:

- **Angular Aria menus/listbox/tree** (Book 06) ship signal-era headless patterns that open through `cdkConnectedOverlay` — so an Aria menu is Aria's pattern logic on the CDK's overlay (Book 06 §3.2). For *net-new* signal-driven menus, Aria is the forward-looking reach (Book 06 §3.1's ladder).
- **The reach-for ladder, applied to this book:** `MatMenu`/`MatDialog`/`MatTooltip` (Direct) for the common case → **Angular Aria** menu/listbox/tree for net-new pattern work → **raw CDK** (`@angular/cdk/menu`, `@angular/cdk/overlay` by hand) when neither fits → bespoke last. The *infrastructure* underneath (overlay, portal, focus trap) is **always CDK** regardless of which rung the pattern came from — you never "avoid the CDK" by using Aria (Book 06 §3.2).

Version-specific Aria/Material API details are grounded in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted from memory.

## 3. Architecture & Design

### 3.1 The shared overlay shell — one substrate, library defaults via DI

Caelum does not let each component reach into `@angular/cdk/overlay` independently. It exposes a thin shared shell over Book 05 §3.1's substrate so that flip behavior, scroll handling, backdrop, and elevation are *consistent across every floating component* and tunable in one place:

- **Position presets.** A small shared set (`below-start`, `below-end`, `above-start`, …) of `connectedPosition` lists, each with its flip fallback, so every Caelum overlay flips the same way. A component asks for a preset, not a hand-built position array.
- **Scroll & backdrop policy.** Library defaults — e.g. `reposition` for anchored popovers/menus, `block` for modal dialogs, a transparent backdrop that captures the outside-click dismissal — are provided as **behavioral DI config** through a `provideCaelum…()` token, not baked per component. This is the DI-carries-behavior / CSS-carries-design split (Book 01 §3.3): *behavior* (which scroll strategy) is DI, *design* (the panel's surface) is tokens. Book 05 §3.1 already establishes these defaults as the substrate's contract; this book consumes them.
- **Token-only surface.** Every overlay pane reads `--cae-*` surface/elevation/radius tokens (Book 04 §3.6) so floating UI matches inline UI in light and dark — never a hardcoded `box-shadow` or `#fff`.

The payoff: a new overlay component is "pick a preset + a scroll policy + a token-styled template," not "re-derive positioning." The shell is where the overlay-lifecycle disciplines (§2.2) are enforced once.

### 3.2 Command overlays — OverlayPanel/Popover & ConfirmPopup

The simplest family: anchored, transient, **non-form** surfaces.

- **OverlayPanel / Popover (Build-S).** A trigger opens a token-styled pane anchored below-start with flip (`CdkConnectedOverlay` or the shared shell). It is typically **non-modal** — focus may stay on the trigger or move in if the panel holds interactive content — and dismisses on outside-click, `Escape`, and scroll-`close`-or-`reposition` per the consumer's choice. The trigger carries `aria-haspopup` and `aria-expanded` bound to the open signal; the panel gets `role="dialog"` only when it's genuinely modal, otherwise a labeled region. *Don't* trap focus in a non-modal popover — trapping a transient hovercard is a worse bug than not.
- **ConfirmPopup (Build-S).** A confirm prompt **anchored to the element that triggered it** (delete button → popup pointing at the button), as opposed to ConfirmDialog's centered modal. It is small and modal-ish: it traps focus while open, `Escape` cancels, the default-focused control is the safe action (Cancel), and it resolves accept/reject. Anchoring + flip come from the shared shell; the accept/reject result is a promise/observable the caller awaits — **no CVA**.

Both are command surfaces: they invoke a callback or resolve a result. Nothing about them touches `mat-form-field`.

### 3.3 ConfirmDialog & the dialog family — `MatDialog` Direct, one confirm service

PrimeNG's Dialog/DynamicDialog map **Direct** to `MatDialog` (component injection into a modal overlay), so Caelum adds almost nothing for the base case — `MatDialog` already gives the centered `GlobalPositionStrategy`, the focus trap, the `block` scroll strategy, `role="dialog"`, and `Escape`/backdrop dismissal. What Caelum *does* own is the **ConfirmDialog parity wrapper**, built once and reused (brief §3 Overlay rows):

- **A `CaeConfirmService`** with `confirm({ message, accept, reject, … }): Promise<boolean>` that opens a standard `MatDialog`-hosted confirm component — so the team writes `await confirm(...)` instead of re-wiring a dialog at every call site. This is the "build once, reuse" item from the migration map.
- **`role="alertdialog"`** (not plain `dialog`) for a confirm, so assistive tech announces it as an interruption; the message is the accessible name; initial focus lands on the **non-destructive** default (Cancel), and `Escape` rejects.
- **Token-styled, not Material-default-styled** — the dialog surface reads `--cae-*` like every other overlay (Book 04 §3.6), so a confirm matches the rest of the library rather than looking like raw Material.

DynamicDialog's "open an arbitrary component with data and get a result" is exactly `MatDialogRef` + injected data + `afterClosed()`; the wrapper just standardizes the confirm shape on top.

### 3.4 Menus — context, tiered, panel, menubar, and the ladder applied

Menus are where the reach-for ladder (Book 06 §3.1) earns its keep, because Caelum has three real options and the right one depends on the case:

- **Direct `MatMenu`** for a plain trigger→menu and for **Menubar** (`MatToolbar` + `MatMenu`, Compose) — the common case, already accessible, already overlay-backed.
- **CDK Menu** (`@angular/cdk/menu`, Book 05 §3.5) for **ContextMenu** (`cdkContextMenuTriggerFor` on right-click) and **TieredMenu** (nested `cdkMenuTriggerFor` submenus) — it ships focus, typeahead, submenu open/close timing, and overlay wiring headlessly, so Caelum supplies only the token-styled template.
- **Angular Aria menu** (Book 06 §3.2) for net-new signal-era menus — the forward-looking rung; it opens through `cdkConnectedOverlay` and exposes `expanded()` as a signal, styled by ARIA-attribute selectors over tokens (Book 06 §3.6 maps the menu/menubar patterns).
- **PanelMenu (Build-S)** is the odd one out: an *inline, expand/collapse* navigation tree, not a floating overlay at all — `MatExpansionPanel` + nav links (Book 11's accordion/panel mechanics). It lands in this book because it's a *menu* by PrimeNG taxonomy, but it shares the menu's a11y semantics (`role` tree/group, `aria-expanded` per node), not the overlay lifecycle.

Whichever rung, the menu invariants are fixed: roving focus + typeahead via `FocusKeyManager` (Book 05 §3.2), `role="menu"`/`menuitem`, `aria-haspopup`/`aria-expanded` on triggers, `Escape` closes the current level and returns focus to its trigger, and arrow keys traverse (right opens a submenu, left closes it). **Breadcrumb (Build-S)** rounds out the navigation set: a `<nav aria-label="Breadcrumb">` with an ordered list and token-styled separators, `aria-current="page"` on the last crumb — no overlay, just honest navigation markup.

### 3.5 Value-bearing overlays — the overlay is the picker, CVA is the contract

CascadeSelect, TreeSelect, and Mention are **form controls** (Book 07) that render their options in an overlay. The overlay is incidental; the value boundary is the point:

- **CascadeSelect (Build-M).** Nested categories resolving to a **leaf** value. Built on nested `MatMenu` / CDK Menu (Book 05 §3.5) for the cascade UI, but the component implements CVA: `writeValue(leaf)` shows the resolved path as display text; choosing a leaf emits the *leaf model value*, never the display string. Intermediate nodes are navigational, not selectable — selecting one is a no-op on the value.
- **TreeSelect (Build-M).** A `MatTree` / `@angular/cdk/tree` (Book 05 §3.5) inside an overlay, single or multi-select. The CVA value is the selected node id(s) — the model — while the trigger shows labels; expansion state is view-only and must not leak into the value. Multi-select adds chip-summary display (a parity detail) but the model stays a clean id array. TreeTable (the *data*-table cousin) is Book 10; TreeSelect is the *form control* cousin here.
- **Mention (Build-M).** An in-text `@`-trigger that opens a CDK-overlay autocomplete of entities; resolving one inserts a structured reference into the text model. The control's value is the text-with-resolved-references, and the async entity lookup is an `AsyncValidatorFn`/`resource()` at the edge, not a blocking call in the keystroke path (Book 07 §3.2).

All three obey the Book 07 non-negotiables: value fidelity (the model is the id/leaf/reference, never the display text — Book 07 §2.2), `MatFormFieldControl` so they live inside `mat-form-field` with label/error/`aria-describedby` wiring (Book 07 §3.4), the library `ErrorStateMatcher` so error timing matches every other control (R4 parity), and the control-authoring checklist (Book 07 §3.6). The overlay just renders the options; the **CVA is the contract**.

### 3.6 The overlay-authoring checklist — this book's parity leg

Every component in this book passes the same five gates before it's "done" — the overlay analogue of Book 07 §3.6's control checklist:

1. **Dismissal** — closes on backdrop/outside-click **and** `Escape` **and** the right scroll strategy; a modal blocks page scroll, a popover repositions or closes. Keyboard and mouse both dismiss.
2. **Focus** — modal surfaces trap focus and move it in; menus rove with typeahead; **focus is restored to the trigger on close** in every case (Book 05 §3.2).
3. **Positioning/flip** — anchored via a shared preset with fallbacks, so it never clips off-viewport; modal dialogs center.
4. **ARIA roles** — `menu`/`menuitem`, `dialog`/`alertdialog`, `aria-haspopup`/`aria-expanded` on triggers, `aria-current` on the active crumb; the panel has an accessible name.
5. **Token-only surface** — every color/shadow/radius from `--cae-*` (Book 04 §3.6); none hardcoded.
6. **Value boundary (value-bearing only)** — the model is the value, never the display text; full Book 07 contract.

Gates 1–5 apply to every component; gate 6 is what separates §3.5's pickers from §3.2–§3.4's command surfaces. Verify with axe + manual keyboard + screen-reader walks (Book 16), not by eyeballing the happy path.

## 4. Implementation

Illustrative, not necessarily compileable.

**A popover/OverlayPanel via `CdkConnectedOverlay`** (anchored, non-modal, token-styled, dismiss on outside-click + `Escape`):

```ts
// projects/caelum/src/lib/popover/popover.ts  →  [caePopoverTrigger] + <ng-template caePopover>
import { Directive, signal, viewChild, TemplateRef } from '@angular/core';

@Directive({
  selector: '[caePopoverTrigger]',
  standalone: true,
  host: {
    '(click)': 'open.set(!open())',
    '[attr.aria-haspopup]': '"dialog"',
    '[attr.aria-expanded]': 'open()',          // trigger announces its state
  },
})
export class CaePopoverTrigger {
  readonly open = signal(false);
  // template uses cdkConnectedOverlay bound to `open()`, a shared position preset (below-start + flip),
  // [cdkConnectedOverlayHasBackdrop]="true" with a transparent backdrop, (backdropClick)/(overlayKeydown.escape)
  // both calling open.set(false); pane styled only via --cae-surface/--cae-elevation tokens (Book 04 §3.6).
  // Non-modal: focus is NOT trapped — interactive content is reachable, a hovercard is not jailed.
}
```

**A reusable confirm over `MatDialog`** (the "build once, reuse" wrapper; `role="alertdialog"`, safe default focus):

```ts
// projects/caelum/src/lib/confirm/confirm.service.ts
import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

@Injectable({ providedIn: 'root' })
export class CaeConfirmService {
  private readonly dialog = inject(MatDialog);
  confirm(opts: { message: string; acceptLabel?: string; rejectLabel?: string }): Promise<boolean> {
    const ref = this.dialog.open(CaeConfirmDialog, {
      data: opts,
      role: 'alertdialog',                       // announced as an interruption, not a plain dialog
      // MatDialog already supplies: GlobalPositionStrategy (centered), focus trap, block scroll, Escape/backdrop.
    });
    return firstValueFrom(ref.afterClosed()).then(Boolean);  // default focus = Cancel; Escape -> false
  }
}
// usage:  if (await confirm({ message: 'Delete this item?' })) remove();
```

**A TreeSelect sketch — overlay + `CdkTree` + CVA** (the value is node ids; the overlay is just the picker):

```ts
// the FORM sees node ids; the tree+overlay are view. CVA per Book 07 §3.1; MatFormFieldControl per §3.4.
@Component({
  selector: 'cae-tree-select',
  // template: a mat-form-field trigger showing label(s) for selected(); a cdkConnectedOverlay holding a
  //   <cdk-tree> (Book 05 §3.5) of options; expansion state lives in the tree, NOT in the value.
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeTreeSelect), multi: true }],
})
export class CaeTreeSelect implements ControlValueAccessor {
  private readonly selected = signal<string[]>([]);            // the MODEL: node ids
  writeValue(ids: string[] | null) { this.selected.set(ids ?? []); }   // ids -> highlight nodes (view)
  protected pick(id: string) { /* toggle in selected(); */ this.onChange(this.selected()); }  // emit ids, not labels
  // registerOnChange/registerOnTouched/setDisabledState as Book 07 §3.1; error timing via library ErrorStateMatcher.
}
```

## 5. Bleeding Edge

Version-specific points live in [`research/notes/angular-22-platform.md`](../../research/notes/angular-22-platform.md), not asserted from memory:

- **Angular Aria menu/listbox/tree maturity.** These signal-era patterns are the forward-looking rung for net-new menus and the TreeSelect/CascadeSelect option lists (Book 06), but they are young — keep the CDK Menu / `MatMenu` fallback live until a pattern is proven for your case (Book 06 §3.5's maturity caveat).
- **Native HTML Popover API + CSS anchor positioning.** The platform now ships a `popover` attribute (top-layer, light-dismiss, `::backdrop`) and CSS anchor positioning — a future path that could replace some `CdkConnectedOverlay` math with declarative markup. It's promising but uneven across the support baseline and doesn't yet cover focus-trap/typeahead, so Caelum stays on the CDK substrate and *watches* this; don't migrate the shell on a partial baseline.
- **`inert` for background content.** The `inert` attribute is now broadly available and is the clean way to make everything behind a modal non-interactive — complements (does not replace) the focus trap.

## 6. Gaps & Opportunities

- **No first-party CascadeSelect / TreeSelect / Mention.** Each is a Build-M assembly (overlay + menu/tree + CVA); that's expected, but it means Caelum owns the value-boundary tests for all three — the place a picker silently leaks display text as its value.
- **Cascade/tree provenance is internal.** Because these are built on CDK/Material primitives rather than a third-party picker library, there's no foreign dependency to vet (Book 03) — a deliberate win over reaching for a non-US picker lib "just for the tree."
- **Overlay z-order across nested surfaces** (a menu opened from inside a dialog, a popover over a sticky header) is the historically under-tested seam — a shared overlay shell (§3.1) with one stacking policy is the mitigation, plus a dedicated nested-overlay test fixture rather than per-component guessing.
- **Native Popover migration** is a real future simplification (§5) gated on the support baseline and a focus-trap story — tracked, not adopted.

## 7. AI & Claude Code Integration

High-multiplier on the scaffolding: the `CdkConnectedOverlay` wiring, the position-preset tables, the `MatDialog` confirm wrapper, the menu templates, and the CVA boilerplate for the pickers are pattern-stable and fast to generate consistently. The ~1× judgment that must stay human-verified is exactly the overlay-lifecycle surface (§2.2) — **dismissal completeness (does `Escape` work, not just outside-click?), focus restoration to the trigger, z-order under nested/sticky contexts, and the value-escape boundary** for §3.5's pickers. These are silent failures: an agent will generate a popover that opens beautifully and forget that closing it must return focus to the button, or let a TreeSelect emit labels instead of ids. The correct division: let the agent build the component and the axe/keyboard/screen-reader *test fixtures* (Book 16), then walk the keyboard-only and SR paths yourself — "the menu opens on click" is the trap that looks done while the keyboard user is stranded.

## 8. Exercises & Further Reading

**Exercises**

1. Build a `caePopover` on `CdkConnectedOverlay` using a shared below-start-with-flip preset; prove it dismisses on **both** outside-click and `Escape`, repositions on scroll, and (being non-modal) does *not* trap focus.
2. Implement `CaeConfirmService.confirm()` over `MatDialog` with `role="alertdialog"`; verify initial focus lands on Cancel, `Escape` resolves `false`, and the surface is styled only through `--cae-*` tokens.
3. Build a ContextMenu with `cdkContextMenuTriggerFor` and a tiered submenu; verify roving focus + typeahead, that right/left arrows open/close the submenu, and that `Escape` closes one level at a time and restores focus to the trigger.
4. Implement `cae-tree-select` whose CVA value is an **array of node ids**; prove that expanding/collapsing nodes never changes the value, that the model never contains display labels, and that it shows errors on the same timing as a plain `CaeInput` (the library `ErrorStateMatcher`).
5. Build a Breadcrumb as semantic `<nav aria-label="Breadcrumb">` markup with `aria-current="page"` on the last crumb, and confirm it needs no overlay and announces correctly in a screen reader.
6. Take any one overlay from this book and run it through the §3.6 checklist with axe + keyboard + SR (Book 16); list every gate it fails on first build — the list is the parity work.

**Further reading**

- Angular CDK — [Overlay](https://material.angular.io/cdk/overlay/overview) · [Portal](https://material.angular.io/cdk/portal/overview) · [Menu (`@angular/cdk/menu`)](https://material.angular.io/cdk/menu/overview) · [a11y (FocusTrap, FocusKeyManager)](https://material.angular.io/cdk/a11y/overview)
- Angular Material — [Dialog (`MatDialog`)](https://material.angular.io/components/dialog/overview) · [Menu (`MatMenu`)](https://material.angular.io/components/menu/overview)
- MDN — [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) · [`inert`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inert) · [ARIA: `menu` role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/menu_role) · [`aria-current`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-current)
- In-library: Book 05 §3.1 (the overlay/portal substrate this book builds on), §3.2 (focus trap & key manager), §3.5 (CDK menu/tree primitives); Book 06 §3.1 (the reach-for ladder), §3.2 (Aria menus open via the CDK overlay), §3.6 (mapping the menu patterns); Book 07 §3.1 (CVA contract), §3.4 (`mat-form-field`), §2.2 (value fidelity), §3.6 (control checklist) for the value-bearing pickers; Book 04 §3.6 (token-only overlay surfaces); Book 01 §3.3 (DI carries overlay behavior); Book 03 (provenance — why no foreign picker lib); Book 10 (TreeTable, the data cousin of TreeSelect); Book 11 (`MatExpansionPanel` behind PanelMenu); Book 16 (a11y/parity verification).
