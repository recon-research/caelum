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
 * element. One consequence to know: `margin`/`padding`/`border`/`background` set on `<cae-divider>`
 * itself have NO effect (display:contents removes its box) — space it via the surrounding layout
 * (e.g. a flex/grid `gap`) instead. The vertical full-height rendering + separator-in-a11y-tree
 * behaviour under `display:contents` is asserted structurally in the spec and verified in a real
 * browser at M4 (#91).
 *
 * Parity note: PrimeNG's `p-divider` also supports a centered text label, a line `type`
 * (solid/dashed/dotted), and `align`; `MatDivider` does none of these — tracked as a parity-extras
 * followup (#90). Theming is through the token bridge. Zoneless-compatible: `OnPush` + signal
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
