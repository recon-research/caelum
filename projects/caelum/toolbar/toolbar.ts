import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatToolbar } from '@angular/material/toolbar';

/**
 * `cae-toolbar` — the Direct (1:1) wrapper over Material's `mat-toolbar`
 * (`reference/COMPARISON.md`: `p-toolbar` → `cae-toolbar`; Book 11). A horizontal surface for
 * grouping actions/branding, themed through the token bridge (no `color` input — surface and
 * text resolve to `--cae-*` via `--mat-sys-*`).
 *
 * **Layout / content projection (p-toolbar parity).** Place content in two groups, arranged
 * with a flex spacer between them so the first sits at the start (inline-start) and the second
 * at the end:
 *
 * ```html
 * <cae-toolbar>
 *   <div caeToolbarStart>…brand…</div>
 *   <div caeToolbarEnd>…actions…</div>
 * </cae-toolbar>
 * ```
 *
 * `caeToolbarStart` / `caeToolbarEnd` mirror PrimeNG's `start` / `end` toolbar groups. Any
 * **un-grouped** projected content renders start-side too (a forgiving default — nothing is
 * silently dropped, unlike a strict named-only projection). The start/end placement depends on
 * `mat-toolbar` staying a single-row flex container for the spacer to grow inside; the unit spec
 * can only assert DOM order (jsdom computes no flex), so the visual placement is verified in a
 * real browser at M4 (#128). A centered group and multiple rows are PrimeNG extras not covered
 * here → #127.
 *
 * **a11y — deliberately NOT `role="toolbar"`.** PrimeNG's `p-toolbar` renders `role="toolbar"`
 * on its root; `cae-toolbar` (like `mat-toolbar`) does not — so a migrating reader should know
 * this role is dropped by design. The WAI-ARIA toolbar role requires the widget to manage
 * **roving tabindex** over its controls; a visual bar doesn't, and an unmanaged `role="toolbar"`
 * mis-announces the group, so it is omitted and the projected controls keep their own native
 * semantics. When the bar is the page banner, keep it inside a `<header>` landmark (as Forge
 * does) — the wrapper adds no landmark of its own.
 *
 * Zoneless-compatible: `OnPush`, no signal inputs needed (zero logic — the projection + spacer
 * is the whole wrapper; Book 01 §3.2).
 */
@Component({
  selector: 'cae-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbar],
  template: `
    <mat-toolbar>
      <ng-content select="[caeToolbarStart]"></ng-content>
      <ng-content></ng-content>
      <span class="cae-toolbar__spacer"></span>
      <ng-content select="[caeToolbarEnd]"></ng-content>
    </mat-toolbar>
  `,
  styles: `
    :host {
      display: block;
    }
    /* Structural, not a design value: pushes the end group to the inline-end edge (the
       Material toolbar idiom). Uses flex-grow, so no spacing token is involved. */
    .cae-toolbar__spacer {
      flex: 1 1 auto;
    }
  `,
})
export class CaeToolbar {}
