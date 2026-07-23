import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  InjectionToken,
  Injector,
  inject,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { Overlay } from '@angular/cdk/overlay';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
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
 * Apply every {@link CaeConfirmOptions} default and stamp the unique message id — the single option→data
 * resolution shared by BOTH presentations ({@link CaeConfirmService.confirm} centered, and
 * {@link CaeConfirmService.confirmAt} anchored), so the two can never drift on labels, appearances, or
 * the describedby wiring. The one confirm contract, resolved once (Book 09 §3.3).
 */
function resolveConfirmData(options: CaeConfirmOptions): CaeConfirmData {
  return {
    message: options.message,
    header: options.header,
    acceptLabel: options.acceptLabel ?? 'Confirm',
    rejectLabel: options.rejectLabel ?? 'Cancel',
    acceptAppearance: options.acceptAppearance ?? 'filled',
    rejectAppearance: options.rejectAppearance ?? 'text',
    describedById: `cae-confirm-desc-${confirmUid++}`,
  };
}

/** The autoFocus selector for the safe (or chosen) action — the inner native button of the marked class. */
function confirmFocusSelector(defaultFocus: CaeConfirmDefaultFocus | undefined): string {
  return (defaultFocus ?? 'reject') === 'accept'
    ? `.${ACCEPT_CLASS} button`
    : `.${REJECT_CLASS} button`;
}

// The trigger↔popup gap, in px (the CDK position API takes a number, not a CSS token — a structural
// value, not a theme value; mirrors cae-tree-select's numeric offset). Below-start, flipping above.
const CONFIRM_POPUP_GAP = 8;
const CONFIRM_POPUP_POSITIONS: ConnectedPosition[] = [
  {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'top',
    offsetY: CONFIRM_POPUP_GAP,
  },
  {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
    offsetY: -CONFIRM_POPUP_GAP,
  },
];

// The action-button marker classes live in ONE place: the template binds them and the service builds
// its autoFocus selector from them, so the class and the selector can never desync. A desync would
// silently defeat the safe-default reject focus (Material's CSS-selector autoFocus no-ops on a miss,
// with no throw), which no jsdom test would catch — so the single source of truth IS the guard.
const REJECT_CLASS = 'cae-confirm__reject';
const ACCEPT_CLASS = 'cae-confirm__accept';

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
      <cae-button [class]="rejectClass" [variant]="data.rejectAppearance" (click)="reject()">{{
        data.rejectLabel
      }}</cae-button>
      <cae-button [class]="acceptClass" [variant]="data.acceptAppearance" (click)="accept()">{{
        data.acceptLabel
      }}</cae-button>
    </div>
  `,
})
class CaeConfirmDialog {
  /** The resolved confirm payload (labels/variants defaulted by the service). */
  protected readonly data = inject(CAE_DIALOG_DATA) as CaeConfirmData;
  private readonly ref = injectCaeDialogRef<boolean>();
  /** The action-button marker classes — the SAME constants the service's autoFocus selector uses. */
  protected readonly rejectClass = REJECT_CLASS;
  protected readonly acceptClass = ACCEPT_CLASS;

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
 * What {@link CaeConfirmService.confirmAt} accepts as the anchor: the trigger element (directly or via
 * an `ElementRef`), or the click `MouseEvent` that requested the confirm (`confirmAt($event, …)`, the
 * `p-confirmPopup` call shape). The panel positions against it AND focus restores to it on close.
 */
export type CaeConfirmOrigin = HTMLElement | ElementRef<HTMLElement> | MouseEvent;

/** Resolve any {@link CaeConfirmOrigin} to its element (a `MouseEvent`'s `currentTarget`, then `target`). */
function originElement(origin: CaeConfirmOrigin): HTMLElement {
  if (origin instanceof ElementRef) return origin.nativeElement;
  if (origin instanceof Event) return (origin.currentTarget ?? origin.target) as HTMLElement;
  return origin;
}

/** The payload {@link CaeConfirmService.confirmAt} injects into its {@link CaeConfirmPopup} panel. */
interface CaeConfirmPopupContext {
  data: CaeConfirmData;
  defaultFocus: CaeConfirmDefaultFocus;
  /** Close the popup, resolving the confirm. Idempotent (guarded by the service's `settled` latch). */
  respond: (result: boolean) => void;
}

const CAE_CONFIRM_POPUP = new InjectionToken<CaeConfirmPopupContext>('CAE_CONFIRM_POPUP');

/**
 * The anchored confirm body {@link CaeConfirmService.confirmAt} attaches into a CDK overlay next to its
 * trigger — the SECOND presentation of the one confirm contract (`reference/COMPARISON.md` row 109:
 * `p-confirmPopup` → `cae-confirm-popup`; Book 09 §3.2). Same `role="alertdialog"` a11y and same
 * safe-default reject focus as the centered {@link CaeConfirmDialog}, but drawn as a self-contained
 * popover panel (it owns its surface/elevation chrome; the centered variant inherits the dialog
 * container's). Not exported: reach it only through `confirmAt()`. The action-button marker classes are
 * the SAME {@link REJECT_CLASS}/{@link ACCEPT_CLASS} constants — used here for both the button class and
 * this panel's own initial-focus selector, so they can never desync (the centered dialog's invariant).
 */
@Component({
  selector: 'cae-confirm-popup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeButton, A11yModule],
  template: `
    <div
      class="cae-confirm-popup"
      role="alertdialog"
      cdkTrapFocus
      [attr.aria-label]="ctx.data.header ? null : ctx.data.message"
      [attr.aria-labelledby]="ctx.data.header ? headerId : null"
      [attr.aria-describedby]="ctx.data.header ? ctx.data.describedById : null"
    >
      @if (ctx.data.header) {
        <h2 class="cae-confirm-popup__header" [id]="headerId">{{ ctx.data.header }}</h2>
      }
      <p class="cae-confirm-popup__message" [id]="ctx.data.describedById">{{ ctx.data.message }}</p>
      <div class="cae-confirm-popup__actions">
        <cae-button
          [class]="rejectClass"
          [variant]="ctx.data.rejectAppearance"
          (click)="ctx.respond(false)"
          >{{ ctx.data.rejectLabel }}</cae-button
        >
        <cae-button
          [class]="acceptClass"
          [variant]="ctx.data.acceptAppearance"
          (click)="ctx.respond(true)"
          >{{ ctx.data.acceptLabel }}</cae-button
        >
      </div>
    </div>
  `,
  styles: `
    .cae-confirm-popup {
      box-sizing: border-box;
      max-inline-size: min(20rem, calc(100vw - var(--cae-space-6)));
      padding: var(--cae-space-4);
      border: 1px solid var(--cae-color-border);
      border-radius: var(--cae-radius-md);
      background: var(--cae-surface-raised);
      color: var(--cae-color-on-surface);
      box-shadow: var(--cae-elevation-3);
    }
    .cae-confirm-popup__header {
      margin: 0 0 var(--cae-space-2);
      font-size: var(--cae-font-size-3);
      font-weight: var(--cae-font-weight-medium);
      color: var(--cae-color-on-surface);
    }
    .cae-confirm-popup__message {
      margin: 0 0 var(--cae-space-4);
      color: var(--cae-color-on-surface-variant);
    }
    .cae-confirm-popup__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--cae-space-2);
    }
  `,
})
class CaeConfirmPopup {
  protected readonly ctx = inject(CAE_CONFIRM_POPUP);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The action-button marker classes — the SAME constants the focus selector uses (no desync). */
  protected readonly rejectClass = REJECT_CLASS;
  protected readonly acceptClass = ACCEPT_CLASS;
  /** Unique id for the header, wired as the alertdialog's `aria-labelledby` when a header is present. */
  protected readonly headerId = `cae-confirm-popup-title-${confirmUid++}`;

  constructor() {
    // Land initial focus on the safe (or chosen) action once the buttons have rendered — the anchored
    // analogue of the centered dialog's Material autoFocus. Owned by the panel (its own concern), via the
    // SAME class→selector constant, and — unlike the CSS-selector autoFocus, a jsdom no-op — a real
    // `.focus()` call, so this one IS unit-testable (attached fixture; [[testing-focus-management-deterministically]]).
    afterNextRender(() => {
      const selector = confirmFocusSelector(this.ctx.defaultFocus);
      const el =
        this.host.nativeElement.querySelector<HTMLElement>(selector) ??
        this.host.nativeElement.querySelector<HTMLElement>('[role="alertdialog"]');
      el?.focus();
    });
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
 * Two presentations, ONE contract (Book 09 §3.3, one confirm service): {@link confirm} centers a modal;
 * {@link confirmAt} anchors the same confirm as a popover next to its trigger (`p-confirmPopup` parity,
 * #664). Both take {@link CaeConfirmOptions} and resolve `Promise<boolean>` the same way.
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
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);

  /** Open a confirm alertdialog. Resolves `true` on accept, `false` on reject / Escape / backdrop. */
  confirm(options: CaeConfirmOptions): Promise<boolean> {
    const data = resolveConfirmData(options);
    // Target the CHOSEN action's inner native <button> (cae-button renders exactly one). A CSS selector
    // is Material's documented `autoFocus` hook; `'reject'` (default) parks focus on the safe choice.
    const autoFocus = confirmFocusSelector(options.defaultFocus);
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

  /**
   * Open a confirm **anchored to its trigger** — the same confirm contract as {@link confirm}, presented
   * as a popover next to `origin` instead of a centered modal (`reference/COMPARISON.md` row 109:
   * `p-confirmPopup`; Book 09 §3.2). This is NOT a second service: it reuses {@link CaeConfirmOptions},
   * the same defaults ({@link resolveConfirmData}), the same `role="alertdialog"` a11y, and the same
   * safe-default reject focus — only the presentation differs (§3.3, one confirm service).
   *
   * Resolves `true` on accept, `false` on reject / `Escape` / outside-click (dismiss = reject). Focus is
   * trapped in the panel while open and **restored to the trigger on every close path** — through the one
   * `respond` funnel, so the dismiss path can't diverge from accept/reject.
   *
   * ```ts
   * async onDelete(event: MouseEvent) {
   *   if (await this.confirm.confirmAt(event, { message: 'Delete this row?', acceptLabel: 'Delete' })) {
   *     this.remove();
   *   }
   * }
   * ```
   */
  confirmAt(origin: CaeConfirmOrigin, options: CaeConfirmOptions): Promise<boolean> {
    const data = resolveConfirmData(options);
    const triggerEl = originElement(origin);
    // Where focus goes on close. Prefer the element that HELD focus when the confirm opened (usually the
    // trigger's inner native control — e.g. a `cae-button` renders one, and `$event.currentTarget` is the
    // non-focusable component host) and fall back to the anchor element itself. Mirrors MatDialog's
    // restore-to-previously-focused, so a consumer's `confirmAt($event, …)` from any control restores right.
    const active = document.activeElement as HTMLElement | null;
    const restoreTarget = active && active !== document.body ? active : triggerEl;

    const overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(triggerEl)
        .withPositions(CONFIRM_POPUP_POSITIONS)
        .withPush(true)
        .withFlexibleDimensions(false),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      // Transparent backdrop → outside-click dismiss (= reject), matching the centered variant's contract.
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const respond = (result: boolean): void => {
        if (settled) return; // one resolution only — accept, reject, Escape, and backdrop all route here
        settled = true;
        overlayRef.dispose();
        restoreTarget.focus(); // restore focus to the trigger on EVERY close path (the dismiss path included)
        resolve(result);
      };

      const popupInjector = Injector.create({
        parent: this.injector,
        providers: [
          {
            provide: CAE_CONFIRM_POPUP,
            useValue: { data, defaultFocus: options.defaultFocus ?? 'reject', respond },
          },
        ],
      });
      overlayRef.attach(new ComponentPortal(CaeConfirmPopup, null, popupInjector));

      // Dismiss = reject (disableClose has no analogue here — outside-click/Escape always reject).
      overlayRef.backdropClick().subscribe(() => respond(false));
      overlayRef.keydownEvents().subscribe((event) => {
        if (
          event.key === 'Escape' &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          respond(false);
        }
      });
    });
  }
}
