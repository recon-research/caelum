import { ChangeDetectionStrategy, Component, input, numberAttribute } from '@angular/core';
import { MatProgressBar } from '@angular/material/progress-bar';

/** The mode of {@link CaeProgressBar} — mirrors Material's `ProgressBarMode`. */
export type CaeProgressBarMode = 'determinate' | 'indeterminate' | 'buffer' | 'query';

/**
 * `cae-progress-bar` — the Direct (1:1) wrapper over Material's `mat-progress-bar`
 * (`reference/COMPARISON.md`: `p-progressbar` → `cae-progress-bar`; Book 11). A linear
 * progress indicator. Not a form control — no CVA.
 *
 * The inner `<mat-progress-bar>` hosts `role="progressbar"` with `aria-valuemin="0"`,
 * `aria-valuemax="100"`, and `aria-valuenow` (bound in `determinate`/`buffer` modes, absent
 * while `indeterminate`/`query`). Material provides **no accessible name**, so name the bar via
 * `ariaLabel` (a `role=progressbar` needs one — WCAG 4.1.2); it's forwarded to the inner host as
 * `aria-label` (empty → attribute absent).
 *
 * No `color` input: theming comes through the `--cae-*`/`--mat-sys-*` token bridge, not Material's
 * palette input (the library's token-only discipline). Zoneless-compatible: `OnPush` + signal
 * inputs (provisional on #9; Book 01 §3.2).
 */
@Component({
  selector: 'cae-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressBar],
  template: `
    <mat-progress-bar
      [mode]="mode()"
      [value]="value()"
      [bufferValue]="bufferValue()"
      [attr.aria-label]="ariaLabel() || null"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeProgressBar {
  /** Progress value, 0–100. Used in `determinate` and `buffer` modes. */
  readonly value = input(0, { transform: numberAttribute });
  /** Secondary (buffer) value, 0–100. Only shown in `buffer` mode. */
  readonly bufferValue = input(0, { transform: numberAttribute });
  /** `determinate` (default) · `indeterminate` · `buffer` · `query`. */
  readonly mode = input<CaeProgressBarMode>('determinate');
  /** Accessible name for the bar (`role=progressbar` needs one — Material provides none). */
  readonly ariaLabel = input('');
}
