import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { CaeCard } from 'caelum/card';
import { CaeRating } from 'caelum/rating';

/**
 * The deferred "Rating" `cae-rating` demo (#663) — the keyboard-operable star rating as a form
 * control. It shows the CVA round-trip through a reactive `FormControl` (with the required-error
 * mirrored onto `aria-invalid` via `[invalid]`), the `[allowCancel]` clear-on-re-select, the
 * `[readonly]` and `[disabled]` honest states, and a custom `[iconTemplate]` (the D-596 escape
 * hatch) that swaps the star for a filled/hollow dot driven by the per-star `active` flag.
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-rating-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeRating, FormsModule, ReactiveFormsModule],
  templateUrl: './rating-demo.html',
  styleUrl: './rating-demo.scss',
})
export class RatingDemo {
  /** The bound rating — required, so the demo can show the invalid → `aria-invalid` mirror. */
  protected readonly rating = new FormControl<number | null>(null, {
    validators: [Validators.required],
  });
}
