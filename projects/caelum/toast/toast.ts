import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { MatSnackBarConfig } from '@angular/material/snack-bar';
import type { Observable } from 'rxjs';

/**
 * Politeness of the toast's aria-live announcement — maps 1:1 to Material's `AriaLivePoliteness`:
 * `'assertive'` interrupts, `'polite'` waits its turn, `'off'` is silent.
 */
export type CaeToastPoliteness = 'assertive' | 'polite' | 'off';

/** Horizontal placement of the toast on screen. */
export type CaeToastHorizontalPosition = 'start' | 'center' | 'end' | 'left' | 'right';

/** Vertical placement of the toast on screen. */
export type CaeToastVerticalPosition = 'top' | 'bottom';

/**
 * Caelum-stable configuration for {@link CaeToast.open} (D-15). Deliberately a structural subset
 * of Material's `MatSnackBarConfig` — every field is a valid `MatSnackBarConfig` field with the
 * same name and type, so it passes straight through — but naming it here keeps Material's config
 * class out of Caelum's public API, giving a migrating team a stable seam to bind to (Book 20
 * §2.1). Material fields left off (`data`, `viewContainerRef`, `direction`) belong to the
 * rich / component-toast escape hatch, deferred to a follow-up ("extend for stacked/rich").
 */
export interface CaeToastConfig {
  /**
   * Auto-dismiss delay in milliseconds. Defaults to {@link CaeToast}'s 5000 ms — a deliberate
   * flip from `MatSnackBar`'s "stays until dismissed" so a text toast never sticks silently
   * (p-toast parity). Pass `0` for a persistent toast; pair that with an `action` so it stays
   * dismissible.
   */
  duration?: number;
  horizontalPosition?: CaeToastHorizontalPosition;
  verticalPosition?: CaeToastVerticalPosition;
  /**
   * aria-live politeness of the announcement (Material default `'polite'`). Pass `'assertive'`
   * only for urgent/error toasts that should interrupt the screen reader.
   */
  politeness?: CaeToastPoliteness;
  /** An explicit message announced to assistive tech (defaults to the visible `message`). */
  announcementMessage?: string;
  /** Custom class(es) on the toast container — the token-bridge styling hook. */
  panelClass?: string | string[];
}

/** The dismissal result delivered to {@link CaeToastRef.afterDismissed}. */
export interface CaeToastDismiss {
  /** `true` when the toast closed because its action button was clicked. */
  dismissedByAction: boolean;
}

/**
 * A Caelum-stable handle to an open toast (D-15) — the stable seam over Material's
 * `MatSnackBarRef`, which structurally satisfies it, so {@link CaeToast.open} returns the live
 * Material ref typed down to this surface (no wrapper object). Maps from PrimeNG's
 * `MessageService` return.
 */
export interface CaeToastRef {
  /** Dismiss the toast programmatically. */
  dismiss(): void;
  /** Dismiss it as though its action button was clicked (also fires {@link onAction}). */
  dismissWithAction(): void;
  /** Emits once when the action button is clicked, then completes. */
  onAction(): Observable<void>;
  /** Emits once when the toast has finished opening, then completes. */
  afterOpened(): Observable<void>;
  /** Emits the dismissal result once the toast has closed, then completes. */
  afterDismissed(): Observable<CaeToastDismiss>;
}

/** Default auto-dismiss delay (ms) — see {@link CaeToastConfig.duration}. */
const DEFAULT_DURATION_MS = 5000;

/**
 * `CaeToast` — the Direct service passthrough over Material's `MatSnackBar`
 * (`reference/COMPARISON.md`: `p-toast` → `cae-toast`; D-15). Inject it and call `open()` to show
 * a transient, screen-reader-announced message; it maps from PrimeNG's `MessageService.add(...)`.
 * Least code over Material's already-hardened aria-live / auto-dismissal surface (Book 09),
 * exposing a Caelum-stable API a migrating team binds to instead of Material directly.
 *
 * ```ts
 * private readonly toast = inject(CaeToast);
 * this.toast.open('Workspace saved');                       // auto-dismisses after 5 s
 * const ref = this.toast.open('Project archived', 'Undo');  // trailing action button
 * ref.onAction().subscribe(() => this.restore());
 * ```
 *
 * Rich / stacked / severity toasts (`openFromComponent`, severity → panelClass) are a follow-up —
 * COMPARISON row 139 notes "extend for stacked/rich". Provided in root, like `MatSnackBar` itself,
 * so consumers need no module import.
 */
@Injectable({ providedIn: 'root' })
export class CaeToast {
  private readonly snackBar = inject(MatSnackBar);

  /**
   * Show a text toast. `action` (optional) renders a trailing button whose click fires
   * {@link CaeToastRef.onAction} and dismisses the toast. Returns a {@link CaeToastRef}.
   */
  open(message: string, action?: string, config?: CaeToastConfig): CaeToastRef {
    // Nullish-coalesce the duration rather than spread-seed it. A `{ duration: DEFAULT, ...config }`
    // spread lets an explicit `duration: undefined` (a type-valid input — `duration?: number`) clobber
    // the seed and silently produce a sticky toast. `?? DEFAULT` makes BOTH an omitted and an
    // explicit-undefined duration fall back, while a real `0` is preserved (`0 ?? 5000 === 0`), so the
    // sticky opt-in still works.
    const merged: MatSnackBarConfig = {
      ...config,
      duration: config?.duration ?? DEFAULT_DURATION_MS,
    };
    return this.snackBar.open(message, action, merged);
  }

  /** Dismiss the currently-open toast, if any. */
  dismiss(): void {
    this.snackBar.dismiss();
  }
}
