import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { CaeButton, type CaeButtonVariant } from 'caelum/button';
import {
  CAE_DIALOG_DATA,
  CaeDialog,
  CaeDialogActions,
  CaeDialogContent,
  CaeDialogTitle,
  injectCaeDialogRef,
} from 'caelum/dialog';

/**
 * Which action receives initial focus when a confirm opens. Defaults to `'reject'` — the
 * non-destructive choice — so an accidental `Enter` on the alertdialog cannot fire the destructive
 * accept (the WAI-ARIA safe default for a confirm; Book 09 §3.3, Book 16 a11y).
 */
export type CaeConfirmDefaultFocus = 'accept' | 'reject';

/**
 * Options for {@link CaeConfirmService.confirm}. Maps from PrimeNG's `ConfirmationService.confirm({…})`
 * / `p-confirmDialog` (`reference/COMPARISON.md` row 104). Only `message` is required; every other
 * field has a safe default.
 */
export interface CaeConfirmOptions {
  /** The prompt. Becomes the dialog's accessible description (or its name when there's no `header`). */
  message: string;
  /** Optional heading above the message; when set, it becomes the dialog's `aria-labelledby` name. */
  header?: string;
  /** Accept-button text. Default `'Confirm'`. */
  acceptLabel?: string;
  /** Reject-button text. Default `'Cancel'`. */
  rejectLabel?: string;
  /**
   * Accept-button {@link CaeButtonVariant}. Default `'filled'` (the prominent action). Note: cae-button
   * carries no danger *colour* — a destructive accept signals danger through the header/message wording,
   * not a red button (a severity→colour seam for cae-button is a separate concern, tracked as #105).
   */
  acceptAppearance?: CaeButtonVariant;
  /** Reject-button {@link CaeButtonVariant}. Default `'text'` (the quiet, safe choice). */
  rejectAppearance?: CaeButtonVariant;
  /** Which button gets initial focus. Default `'reject'` (safe). */
  defaultFocus?: CaeConfirmDefaultFocus;
}

/** The resolved payload handed to {@link CaeConfirmDialog} — every default already applied. */
interface CaeConfirmData {
  message: string;
  header?: string;
  acceptLabel: string;
  rejectLabel: string;
  acceptAppearance: CaeButtonVariant;
  rejectAppearance: CaeButtonVariant;
  /** Unique id stamped on the message element so an alertdialog with a header can `aria-describedby` it. */
  describedById: string;
}

/** Monotonic counter for unique message-element ids (no `Math.random` — it's blocked and non-hermetic). */
let confirmUid = 0;

/**
 * The internal alertdialog body {@link CaeConfirmService} opens — a pure `cae-*` component built from
 * the #100 content directives and two `cae-button`s, so it carries no `@angular/material` import. Not
 * exported: reach a confirm only through {@link CaeConfirmService.confirm}.
 */
@Component({
  selector: 'cae-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeButton, CaeDialogTitle, CaeDialogContent, CaeDialogActions],
  template: `
    @if (data.header) {
      <h2 caeDialogTitle>{{ data.header }}</h2>
    }
    <div caeDialogContent>
      <p class="cae-confirm__message" [id]="data.describedById">{{ data.message }}</p>
    </div>
    <div caeDialogActions align="end">
      <cae-button
        class="cae-confirm__reject"
        [variant]="data.rejectAppearance"
        (click)="reject()"
        >{{ data.rejectLabel }}</cae-button
      >
      <cae-button
        class="cae-confirm__accept"
        [variant]="data.acceptAppearance"
        (click)="accept()"
        >{{ data.acceptLabel }}</cae-button
      >
    </div>
  `,
})
class CaeConfirmDialog {
  /** The resolved confirm payload (labels/variants defaulted by the service). */
  protected readonly data = inject(CAE_DIALOG_DATA) as CaeConfirmData;
  private readonly ref = injectCaeDialogRef<boolean>();

  /** Close, resolving the confirm to `true`. */
  protected accept(): void {
    this.ref.close(true);
  }

  /** Close, resolving the confirm to `false`. */
  protected reject(): void {
    this.ref.close(false);
  }
}

/**
 * `CaeConfirmService` — the build-once confirm wrapper over {@link CaeDialog} (D-15, the confirm half
 * of the dialog slice; `reference/COMPARISON.md` row 104: `p-confirmDialog` → `cae-confirm-dialog`;
 * Book 09 §3.3). Inject it and `await confirm(…)` instead of re-wiring a dialog at every call site;
 * maps from PrimeNG's `ConfirmationService.confirm({…})`. It dogfoods `cae-dialog` end to end.
 *
 * The dialog opens with **`role="alertdialog"`** (assistive tech announces it as an interruption),
 * the message wired as its accessible description, and initial focus on the **non-destructive** action
 * (reject) by default — so an accidental keypress can't fire a destructive accept. `Escape` and a
 * backdrop click dismiss as a rejection (`disableClose` stays off).
 *
 * ```ts
 * private readonly confirm = inject(CaeConfirmService);
 * if (await this.confirm.confirm({ header: 'Delete workspace?', message: '…', acceptLabel: 'Delete' })) {
 *   this.remove();
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class CaeConfirmService {
  private readonly dialog = inject(CaeDialog);

  /** Open a confirm alertdialog. Resolves `true` on accept, `false` on reject / Escape / backdrop. */
  confirm(options: CaeConfirmOptions): Promise<boolean> {
    const data: CaeConfirmData = {
      message: options.message,
      header: options.header,
      acceptLabel: options.acceptLabel ?? 'Confirm',
      rejectLabel: options.rejectLabel ?? 'Cancel',
      acceptAppearance: options.acceptAppearance ?? 'filled',
      rejectAppearance: options.rejectAppearance ?? 'text',
      describedById: `cae-confirm-desc-${confirmUid++}`,
    };
    // Target the CHOSEN action's inner native <button> (cae-button renders exactly one). A CSS selector
    // is Material's documented `autoFocus` hook; `'reject'` (default) parks focus on the safe choice.
    const autoFocus =
      (options.defaultFocus ?? 'reject') === 'accept'
        ? '.cae-confirm__accept button'
        : '.cae-confirm__reject button';
    const ref = this.dialog.open<CaeConfirmDialog, boolean, CaeConfirmData>(CaeConfirmDialog, {
      role: 'alertdialog',
      data,
      autoFocus,
      // With a header the title supplies aria-labelledby, so the message is the description; with no
      // header the message IS the accessible name (Book 09 §3.3). Escape / backdrop → afterClosed emits
      // undefined → resolves `false`.
      ...(options.header
        ? { ariaDescribedBy: data.describedById }
        : { ariaLabel: options.message }),
    });
    // Promise via `.subscribe` (not `firstValueFrom`) to avoid a top-level `rxjs` runtime import;
    // afterClosed emits exactly once then completes, so `resolve` fires once.
    return new Promise<boolean>((resolve) => {
      ref.afterClosed().subscribe((result) => resolve(result === true));
    });
  }
}
