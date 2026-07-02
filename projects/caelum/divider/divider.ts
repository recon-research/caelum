import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatDivider } from '@angular/material/divider';

/**
 * `cae-divider` — the Direct (1:1) wrapper over Material's `mat-divider`
 * (`reference/COMPARISON.md`: `p-divider` → `cae-divider`; Book 11). A thin rule that separates
 * content. The inner host is `role="separator"` with `aria-orientation` set automatically from
 * `vertical`.
 *
 * The wrapper host uses `display: contents` so it adds no box of its own — the inner
 * `<mat-divider>` participates directly in the parent's layout, so a `vertical` divider stretches
 * inside a flex row exactly as a bare `mat-divider` would (a wrapping block would collapse to zero
 * height). The wrapper carries no ARIA, so the separator's semantics remain solely on the inner
 * element.
 *
 * Parity note: PrimeNG's `p-divider` also supports a centered text label, a line `type`
 * (solid/dashed/dotted), and `align`; `MatDivider` does none of these — tracked as a parity-extras
 * followup (issue #88). Theming is through the token bridge. Zoneless-compatible: `OnPush` + signal
 * inputs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-divider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDivider],
  template: `<mat-divider [vertical]="vertical()" [inset]="inset()" />`,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class CaeDivider {
  /** Render vertically (for use inside a flex/inline row) instead of horizontally. */
  readonly vertical = input(false, { transform: booleanAttribute });
  /** Inset the divider (indented from the leading edge), e.g. to align with list text. */
  readonly inset = input(false, { transform: booleanAttribute });
}
