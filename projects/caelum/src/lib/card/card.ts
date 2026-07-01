import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

/** Card surfaces, 1:1 with Material's `mat-card`. */
export type CaeCardAppearance = 'outlined' | 'raised' | 'filled';

/**
 * `cae-card` — the Direct (1:1) wrapper over Material's `mat-card`
 * (`reference/COMPARISON.md`: `p-card` → `cae-card`). An optional `title`/`subtitle`
 * render into a `mat-card-header`; everything else projects into the card body. Surface,
 * text, and outline come from the token bridge (`--mat-sys-*` ← `--cae-*`) — nothing to
 * theme here. Zoneless-compatible: `OnPush` + signal inputs (provisional on #9).
 */
@Component({
  selector: 'cae-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule],
  template: `
    <mat-card [appearance]="appearance()">
      @if (title() || subtitle()) {
        <mat-card-header>
          @if (title()) {
            <mat-card-title>{{ title() }}</mat-card-title>
          }
          @if (subtitle()) {
            <mat-card-subtitle>{{ subtitle() }}</mat-card-subtitle>
          }
        </mat-card-header>
      }
      <mat-card-content>
        <ng-content />
      </mat-card-content>
    </mat-card>
  `,
})
export class CaeCard {
  /** Optional card title; omitted → no header row. */
  readonly title = input('');
  /** Optional card subtitle; omitted → no subtitle. */
  readonly subtitle = input('');
  /** Card surface treatment. Defaults to `outlined`. */
  readonly appearance = input<CaeCardAppearance>('outlined');
}
