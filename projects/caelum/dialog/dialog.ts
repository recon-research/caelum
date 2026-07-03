import { Directive, Injectable, inject } from '@angular/core';
import type { TemplateRef, Type } from '@angular/core';
import {
  MatDialog,
  MatDialogRef,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import type { MatDialogConfig } from '@angular/material/dialog';
import type { Observable } from 'rxjs';

/** ARIA role of the dialog surface — `'alertdialog'` for a confirm/interruption (Book 09 §3.3). */
export type CaeDialogRole = 'dialog' | 'alertdialog';

/**
 * Where initial focus lands when the dialog opens. `'first-tabbable'` is Material's default;
 * `'dialog'` focuses the container, `'first-heading'` the title. A CSS selector or an explicit
 * `true`/`false` are also accepted (`string & {}` keeps the named hints in autocomplete).
 */
export type CaeDialogAutoFocus =
  'dialog' | 'first-tabbable' | 'first-heading' | boolean | (string & {});

/**
 * Caelum-stable configuration for {@link CaeDialog.open} (D-15). Deliberately a structural subset
 * of Material's `MatDialogConfig` — every field is a valid `MatDialogConfig` field with the same
 * name and type, so it passes straight through — but naming it here keeps Material's config class
 * out of Caelum's public API, giving a migrating team a stable seam (Book 20 §2.1). Material fields
 * left off (`viewContainerRef`, `injector`, `scrollStrategy`, `bindings`, animation durations…) are
 * internal/advanced escape hatches, out of the Direct surface.
 */
export interface CaeDialogConfig<D = unknown> {
  /** Explicit id — pass to later reach the ref via {@link CaeDialog.getById}. */
  id?: string;
  /** Payload injected into the opened component under {@link CAE_DIALOG_DATA}. */
  data?: D | null;
  /** ARIA role; default `'dialog'`. Use `'alertdialog'` for confirms/interruptions. */
  role?: CaeDialogRole;
  /** Custom class(es) on the dialog surface — the token-bridge styling hook. */
  panelClass?: string | string[];
  /** Whether a backdrop is shown (default `true`). */
  hasBackdrop?: boolean;
  /** Block Escape / backdrop-click dismissal (default `false`). */
  disableClose?: boolean;
  width?: string;
  height?: string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  /** aria-label on the surface when it has no visible {@link CaeDialogTitle}. */
  ariaLabel?: string | null;
  ariaLabelledBy?: string | null;
  ariaDescribedBy?: string | null;
  /** Where initial focus lands (default `'first-tabbable'`). */
  autoFocus?: CaeDialogAutoFocus;
  /** Restore focus to the previously-focused element on close (default `true`). */
  restoreFocus?: boolean | string;
  /** Close the dialog on a navigation change (default `true`). */
  closeOnNavigation?: boolean;
}

/**
 * A Caelum-stable handle to an open dialog (D-15) — the stable seam over Material's `MatDialogRef`,
 * which structurally satisfies it, so {@link CaeDialog.open} returns the live Material ref typed
 * down to this surface (no wrapper object). `R` is the result type delivered to
 * {@link CaeDialogRef.afterClosed}. Maps from PrimeNG's `DynamicDialogRef`.
 */
export interface CaeDialogRef<R = unknown> {
  /** The dialog's unique id (auto-generated unless set via {@link CaeDialogConfig.id}). */
  readonly id: string;
  /** Block/allow Escape + backdrop-click dismissal after opening. */
  disableClose: boolean | undefined;
  /** Close the dialog, optionally delivering a `result` to {@link afterClosed}. */
  close(result?: R): void;
  /** Emits once when the dialog has finished opening, then completes. */
  afterOpened(): Observable<void>;
  /** Emits the result once the dialog has closed, then completes. */
  afterClosed(): Observable<R | undefined>;
  /** Emits the result just before the dialog starts closing, then completes. */
  beforeClosed(): Observable<R | undefined>;
  /** Emits on each backdrop click. */
  backdropClick(): Observable<MouseEvent>;
  /** Emits on each keydown while the dialog is focused. */
  keydownEvents(): Observable<KeyboardEvent>;
}

/**
 * `CaeDialog` — the Direct service passthrough over Material's `MatDialog`
 * (`reference/COMPARISON.md` row 103: `p-dialog` / DynamicDialog → `cae-dialog`; D-15, Book 09 §3.3).
 * Inject it and call `open()` to render any component (or template) in a modal dialog; it maps from
 * PrimeNG's `DialogService.open(...)`. The opened component reads its payload via
 * {@link CAE_DIALOG_DATA}, closes itself via {@link injectCaeDialogRef} or the `caeDialogClose`
 * directive, and lays out its body with `caeDialogTitle` / `caeDialogContent` / `caeDialogActions`.
 *
 * ```ts
 * private readonly dialog = inject(CaeDialog);
 * const ref = this.dialog.open<RenameDialog, string, { name: string }>(RenameDialog, {
 *   data: { name: this.workspace() },
 * });
 * ref.afterClosed().subscribe((name) => name && this.workspace.set(name));
 * ```
 *
 * Provided in root, like `MatDialog` itself, so consumers need no module import. The `role=alertdialog`
 * confirm wrapper (`CaeConfirmService`, COMPARISON row 104) builds ON this — see #101.
 */
@Injectable({ providedIn: 'root' })
export class CaeDialog {
  private readonly dialog = inject(MatDialog);

  /**
   * Open `componentOrTemplate` in a modal dialog. `T` = the opened component, `R` = its result type
   * (delivered to {@link CaeDialogRef.afterClosed}), `D` = the {@link CaeDialogConfig.data} payload.
   */
  open<T, R = unknown, D = unknown>(
    componentOrTemplate: Type<T> | TemplateRef<T>,
    config?: CaeDialogConfig<D>,
  ): CaeDialogRef<R> {
    // `Type<T>` (from @angular/core) is used instead of CDK's `ComponentType<T>` to keep the public
    // signature on Angular-core primitives only — it's structurally assignable to what `MatDialog.open`
    // expects. CaeDialogConfig<D> is a structural subset of MatDialogConfig<D> — every field matches by
    // name and type — so it passes straight through with only a cast (no coercion).
    return this.dialog.open<T, D, R>(componentOrTemplate, config as MatDialogConfig<D>);
  }

  /** Close every open dialog. */
  closeAll(): void {
    this.dialog.closeAll();
  }

  /** The open dialog with the given {@link CaeDialogConfig.id}, or `undefined`. */
  getById(id: string): CaeDialogRef | undefined {
    return this.dialog.getDialogById(id);
  }
}

/**
 * Injection token for the {@link CaeDialogConfig.data} payload — inject it inside the opened
 * component to read what `open()` passed. Re-exports the same token instance `MatDialog` provides
 * (`MAT_DIALOG_DATA`) under a Caelum name, so a consumer's dialog component needs no
 * `@angular/material` import (keeps Forge a pure `cae-*` consumer).
 *
 * ```ts
 * readonly data = inject(CAE_DIALOG_DATA) as { name: string };
 * ```
 */
export const CAE_DIALOG_DATA = MAT_DIALOG_DATA;

/**
 * Inject the {@link CaeDialogRef} for the dialog the current component was opened in — the seam for
 * closing programmatically (e.g. after an async save) without importing `MatDialogRef`. Call it in
 * an injection context (a field initializer / constructor), like any `inject()`.
 */
export function injectCaeDialogRef<R = unknown>(): CaeDialogRef<R> {
  return inject(MatDialogRef);
}

/**
 * `caeDialogTitle` — the dialog's title. Composes Material's `MatDialogTitle` (which wires the
 * surface's `aria-labelledby` to this element) under a Caelum selector, so a consumer writes
 * `<h2 caeDialogTitle>` with no `@angular/material` import.
 */
@Directive({
  selector: '[caeDialogTitle]',
  hostDirectives: [{ directive: MatDialogTitle, inputs: ['id'] }],
})
export class CaeDialogTitle {}

/** `caeDialogContent` — the dialog's scrollable body region (composes `MatDialogContent`). */
@Directive({
  selector: '[caeDialogContent]',
  hostDirectives: [MatDialogContent],
})
export class CaeDialogContent {}

/**
 * `caeDialogActions` — the dialog's action-button row (composes `MatDialogActions`). `align` controls
 * horizontal placement (`'start' | 'center' | 'end'`).
 */
@Directive({
  selector: '[caeDialogActions]',
  hostDirectives: [{ directive: MatDialogActions, inputs: ['align'] }],
})
export class CaeDialogActions {}

/**
 * `caeDialogClose` — closes the enclosing dialog on click, delivering the bound value as the result
 * (composes `MatDialogClose`). `<button [caeDialogClose]="value">` delivers `value` to
 * {@link CaeDialogRef.afterClosed}; a **bare** `<button caeDialogClose>` delivers an empty string
 * `''` (Material's behavior — a static attribute binds the input to `''`, not `undefined`), which is
 * falsy so a `result ? … : …` guard still reads it as "dismissed". `caeDialogCloseAriaLabel` sets the
 * button's screen-reader label; `type` its button type (defaults to `'button'` to avoid accidental
 * form submits).
 */
@Directive({
  selector: '[caeDialogClose]',
  hostDirectives: [
    {
      directive: MatDialogClose,
      inputs: ['matDialogClose: caeDialogClose', 'aria-label: caeDialogCloseAriaLabel', 'type'],
    },
  ],
})
export class CaeDialogClose {}
