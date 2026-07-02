import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

/**
 * `cae-chip` — the Direct (1:1) wrapper over Material's `mat-chip`
 * (`reference/COMPARISON.md`: `p-chip` → `cae-chip`; Book 11). A labeled, optionally-removable
 * display chip: the label (and any leading icon/avatar) is projected through `<ng-content>`,
 * matching the `<p-chip>` authoring model. Not a form control — no CVA.
 *
 * A standalone chip is valid here: `MatChip` defaults its `role` to `null` (presentational) and
 * injects no chip-set, so it renders on its own for the `p-chip` case. A chip *set/grid* for tag
 * entry (`p-chips`) is a separate future slice.
 *
 * When `removable` is set, a remove affordance is shown and `(removed)` fires on click, Enter/Space,
 * or Backspace/Delete — the consumer owns the actual list removal (it removes the item from its
 * data, which unrenders the chip). The remove control is a real `<button>` made Tab-reachable with an
 * explicit `[tabIndex]="0"`: a standalone chip has no `MatChipSet` focus key-manager, which is what
 * otherwise promotes Material's default `tabindex="-1"` on chip actions — without it the × would be
 * mouse-only. It's named by `removeAriaLabel`, since the visible label is projected and can't be read
 * here; give each chip in a list a distinct name (e.g. `'Remove ' + label`) so the buttons aren't all
 * "Remove".
 *
 * A standalone chip does NOT manage focus after removal (there's no set to redirect focus to a
 * sibling), so for a *list* of removable chips the consumer should move focus + announce the removal
 * (Forge's tag row does, via a live region + focus-move effect) — this mirrors PrimeNG's standalone
 * `p-chip`. A managed collection with built-in focus redirect + roving keyboard nav is a future
 * `cae-chip-set` slice (#84).
 *
 * The remove glyph is a self-authored inline SVG "×" (stroked `currentColor`), deliberately NOT
 * `mat-icon`: Material Icons ships as a Google-CDN font, which Caelum avoids (US-origin / no-CDN
 * discipline, M0-2). Theme comes free through the token bridge. Zoneless-compatible: `OnPush` +
 * signal state (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule],
  template: `
    <mat-chip [disabled]="disabled()" [removable]="removable()" (removed)="removed.emit()">
      <ng-content />
      @if (removable()) {
        <button matChipRemove type="button" [tabIndex]="0" [attr.aria-label]="removeAriaLabel()">
          <svg
            class="cae-chip__remove-glyph"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 6 L18 18 M6 18 L18 6" />
          </svg>
        </button>
      }
    </mat-chip>
  `,
  styles: `
    .cae-chip__remove-glyph {
      inline-size: 1em;
      block-size: 1em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
    }
  `,
})
export class CaeChip {
  /** Disable the chip (and its remove button). */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Show a remove button and enable removal (click or Backspace/Delete). Defaults to `false`,
   * matching PrimeNG's `p-chip` (`removable` opt-in). The chip is not removed from the DOM by us —
   * handle `(removed)` and drop the item from your data.
   */
  readonly removable = input(false, { transform: booleanAttribute });
  /** Accessible name for the remove button (the visible label is projected). */
  readonly removeAriaLabel = input('Remove');
  /** Emits when the chip is removed (click on the remove button, or Backspace/Delete). */
  readonly removed = output<void>();
}
