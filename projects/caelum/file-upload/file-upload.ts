import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  numberAttribute,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  HttpClient,
  HttpErrorResponse,
  HttpEventType,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import type { Subscription } from 'rxjs';

/** Per-instance id source for the file input (SSR/hydration-stable, unlike random). */
let nextComponentId = 0;
/** Monotonic id source for queue entries (identity for `@for` track + the active-request map). */
let nextFileId = 0;

/** The lifecycle status of one file in a {@link CaeFileUpload} queue. */
export type CaeFileStatus =
  /** Passed validation, not yet uploaded (or `url` is unset → selection-only). */
  | 'pending'
  /** An `HttpClient` request is in flight; `progress` is live. */
  | 'uploading'
  /** The server accepted the upload (2xx response). */
  | 'success'
  /** The upload request failed (network / non-2xx) — retryable. */
  | 'error'
  /** The user canceled an in-flight upload — retryable. */
  | 'canceled'
  /** Rejected at the trust boundary (type/size) — never uploaded, not retryable. */
  | 'invalid';

/** One file tracked by {@link CaeFileUpload} — the unit the row template renders. */
export interface CaeUploadFile {
  /** Stable identity for `@for` tracking and cancel routing. */
  readonly id: number;
  /** The underlying browser {@link File}. */
  readonly file: File;
  /** Where this file is in its lifecycle. */
  readonly status: CaeFileStatus;
  /** Upload progress, `0`–`100` (meaningful while `uploading`/`success`). */
  readonly progress: number;
  /** Validation or upload error message, or `null` when there is none. */
  readonly error: string | null;
}

/** Payload of {@link CaeFileUpload.uploaded} — a file the server accepted, with the parsed response body. */
export interface CaeFileUploadEvent {
  /** The file that finished uploading. */
  readonly file: File;
  /** The server's response body (shape is the consumer's concern). */
  readonly response: unknown;
}

/** Payload of {@link CaeFileUpload.uploadProgress} — a progress tick for one in-flight file. */
export interface CaeFileUploadProgress {
  /** The file being uploaded. */
  readonly file: File;
  /** Percent complete, `0`–`100`. */
  readonly progress: number;
}

/** Payload of {@link CaeFileUpload.uploadError} — a rejected or failed file, with why and at which boundary. */
export interface CaeFileUploadError {
  /** The offending file. */
  readonly file: File;
  /** Human-readable reason. */
  readonly reason: string;
  /** `'validation'` = rejected at the trust boundary (never uploaded); `'upload'` = the request failed. */
  readonly kind: 'validation' | 'upload';
}

/**
 * `cae-file-upload` — the third and final member of the Book 11 §3.3 drag-drop cluster
 * (`reference/COMPARISON.md`: `p-fileUpload` → `cae-file-upload`). A **keyboard-reachable native
 * `<input type=file>`** paired with a **pointer drop affordance**, uploading each file via
 * `HttpClient` with real progress events and cancel/retry, and **validating type and size at the
 * trust boundary — rejecting before upload**.
 *
 * **Why native drop, not `cdkDropList`.** The rest of the cluster (OrderList/PickList) is built on
 * `@angular/cdk/drag-drop`, but that engine transfers **`cdkDrag` elements between lists** — it never
 * sees an *OS file drop*, which arrives as a native `DataTransfer` on the `drop` event. So this
 * dropzone uses native `dragover`/`drop` (reading `event.dataTransfer.files`); wiring an inert
 * `cdkDropList` that can never fire would be cargo-cult, not parity. The parity leg (Book 11 §3.5)
 * still holds: the **keyboard path** is the native input (drop is a pointer *enhancement*, never the
 * only way in — §3.5 #1); **drop validation** is the trust-boundary check (§3.5 #5); moves are
 * announced via `LiveAnnouncer` (§3.5 #2); queue/status live in **signals** under zoneless (§3.5 #4);
 * and no foreign drag library is used — native `DataTransfer` is a platform feature (§3.5 #6).
 *
 * **Trust boundary (non-negotiable).** `accept` (MIME/extension) and `maxFileSize` (bytes) are
 * validated **before** a file is queued for upload; a rejected file lands as `status: 'invalid'` with
 * an error message, emits `(uploadError)` with `kind: 'validation'`, and is **never** sent. Client-side
 * validation is UX, not security — the server must re-validate; documented, not implied.
 *
 * **Upload.** With `url` set, `POST`s a `multipart/form-data` body (field `name`, default `file`) via
 * `HttpClient` with `reportProgress`, driving a per-file progress bar. `cancel()` unsubscribes the
 * request (aborting the underlying XHR); `retry()` re-sends a failed/canceled file. `auto` uploads on
 * add; otherwise call `upload()`. With `url` unset it is a **selection-only** control (value exposed,
 * no network) — `HttpClient` is injected `optional`, so the component works without `provideHttpClient`.
 *
 * **Forms.** A non-`MatFormFieldControl` **controlled `ControlValueAccessor`** (Book 07 §3.1;
 * PATTERNS §2b) whose value is the **accepted file set** (`readonly File[]`, excluding rejected
 * files). `[(ngModel)]`/`[formControl]` read it; `writeValue([])` clears. Validation feedback is
 * consumer-owned (no `<mat-error>`): point `ariaDescribedby` at your message (#47), forwarded onto the
 * focusable input.
 *
 * Token-only theming (`--cae-*`/`--mat-sys-*`), `OnPush` + signal state (zoneless), Angular core +
 * `@angular/common/http` + `@angular/cdk/a11y` only — no foreign uploader (Book 03 provenance clean).
 */
@Component({
  selector: 'cae-file-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cae-file-upload' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CaeFileUpload), multi: true },
  ],
  template: `
    <div
      class="cae-file-upload__dropzone"
      [class.cae-file-upload__dropzone--dragover]="dragOver()"
      [class.cae-file-upload__dropzone--disabled]="isDisabled()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <!-- The native input is the keyboard path: sr-only (NOT hidden/display:none, which would drop it
           from the tab order); the styled <label for> opens the picker and shows the focus ring via
           :focus-within. -->
      <input
        type="file"
        class="cae-file-upload__input"
        [id]="inputId"
        [multiple]="multiple()"
        [attr.accept]="accept() || null"
        [disabled]="isDisabled()"
        [attr.aria-label]="ariaLabel() || null"
        [attr.aria-labelledby]="ariaLabelledby() || null"
        [attr.aria-describedby]="ariaDescribedby() || null"
        (change)="onInputChange($event)"
        (blur)="onTouched()"
      />
      <label class="cae-file-upload__button" [attr.for]="inputId">{{ chooseLabel() }}</label>
      <span class="cae-file-upload__hint" aria-hidden="true">{{ dropLabel() }}</span>
    </div>

    @if (files().length) {
      <ul class="cae-file-upload__list">
        @for (f of files(); track f.id) {
          <li class="cae-file-upload__item" [attr.data-status]="f.status">
            <span class="cae-file-upload__name">{{ f.file.name }}</span>
            <span class="cae-file-upload__size">{{ formatSize(f.file.size) }}</span>

            @if (f.status === 'uploading' || f.status === 'success') {
              <progress
                class="cae-file-upload__progress"
                max="100"
                [value]="f.progress"
                [attr.aria-label]="'Upload progress for ' + f.file.name"
              ></progress>
              <span class="cae-file-upload__percent">{{ f.progress }}%</span>
            }

            <!-- A persistent TEXT status for success (not color alone — WCAG 1.4.1); other terminal
                 states render their reason in the error span above. -->
            @if (f.status === 'success') {
              <span class="cae-file-upload__done">Uploaded</span>
            }
            @if (f.status === 'error' || f.status === 'invalid' || f.status === 'canceled') {
              <span class="cae-file-upload__error">{{ f.error }}</span>
            }

            <!-- Cancel and Retry share the same logical action slot (mutually exclusive) and carry the
                 same data-action-id, so focus management can land on "the row's action button" whichever
                 one is currently rendered — this is what stops focus stranding to <body> when they swap. -->
            @if (f.status === 'uploading') {
              <button
                type="button"
                class="cae-file-upload__action"
                [attr.data-action-id]="f.id"
                [attr.aria-label]="'Cancel upload of ' + f.file.name"
                (click)="cancel(f.id)"
              >
                Cancel
              </button>
            }
            @if (f.status === 'error' || f.status === 'canceled') {
              <button
                type="button"
                class="cae-file-upload__action"
                [attr.data-action-id]="f.id"
                [attr.aria-label]="'Retry upload of ' + f.file.name"
                (click)="retry(f.id)"
              >
                Retry
              </button>
            }
            <button
              type="button"
              class="cae-file-upload__action"
              [attr.data-remove-id]="f.id"
              [attr.aria-label]="'Remove ' + f.file.name"
              (click)="removeFile(f.id)"
            >
              Remove
            </button>
          </li>
        }
      </ul>
    }

    @if (!auto() && url()) {
      <!-- aria-disabled + guarded handler (never native [disabled]): the button disables the instant
           the last pending file starts uploading; a native-disabled focused button would blur focus to
           <body> (WCAG 2.4.3). See the aria-disabled-at-bounds house pattern. -->
      <button
        type="button"
        class="cae-file-upload__upload"
        [attr.aria-disabled]="hasPending() ? null : 'true'"
        (click)="upload()"
      >
        {{ uploadLabel() }}
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .cae-file-upload__dropzone {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--mat-sys-title-small-size, 0.75rem);
      padding: 1rem;
      border: 2px dashed var(--mat-sys-outline, rgba(0, 0, 0, 0.38));
      border-radius: var(--mat-sys-corner-medium, 0.75rem);
      background: var(--mat-sys-surface-container-low, transparent);
      color: var(--mat-sys-on-surface, inherit);
      transition:
        border-color 150ms ease,
        background 150ms ease;
    }

    /* Highlight while a file is dragged over — the pointer-drop affordance. */
    .cae-file-upload__dropzone--dragover {
      border-color: var(--mat-sys-primary, #6750a4);
      background: var(--mat-sys-primary-container, rgba(103, 80, 164, 0.08));
    }

    .cae-file-upload__dropzone--disabled {
      opacity: 0.5;
    }

    /* Show a visible focus ring on the dropzone when the sr-only input is focused (WCAG 2.4.7). */
    .cae-file-upload__dropzone:focus-within {
      outline: 2px solid var(--mat-sys-primary, #6750a4);
      outline-offset: 2px;
    }

    /* Visually hidden, but kept in the tab order and accessibility tree. */
    .cae-file-upload__input {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .cae-file-upload__button {
      display: inline-flex;
      align-items: center;
      padding: 0.5rem 1rem;
      border-radius: var(--mat-sys-corner-full, 1.25rem);
      background: var(--mat-sys-primary, #6750a4);
      color: var(--mat-sys-on-primary, #fff);
      cursor: pointer;
      font: inherit;
    }

    .cae-file-upload__dropzone--disabled .cae-file-upload__button {
      cursor: default;
    }

    .cae-file-upload__hint {
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
    }

    .cae-file-upload__list {
      list-style: none;
      margin: 0.75rem 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .cae-file-upload__item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-radius: var(--mat-sys-corner-small, 0.5rem);
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }

    .cae-file-upload__name {
      font-weight: 500;
    }

    .cae-file-upload__size,
    .cae-file-upload__percent {
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
      font-size: 0.875em;
    }

    .cae-file-upload__progress {
      flex: 1 1 6rem;
      min-inline-size: 4rem;
      block-size: 0.5rem;
      accent-color: var(--mat-sys-primary, #6750a4);
    }

    .cae-file-upload__error {
      color: var(--mat-sys-error, #b3261e);
      font-size: 0.875em;
    }

    .cae-file-upload__done {
      color: var(--mat-sys-primary, #6750a4);
      font-size: 0.875em;
      font-weight: 500;
    }

    .cae-file-upload__item[data-status='success'] {
      background: var(--mat-sys-primary-container, rgba(103, 80, 164, 0.08));
    }

    .cae-file-upload__action,
    .cae-file-upload__upload {
      font: inherit;
      cursor: pointer;
      border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.38));
      border-radius: var(--mat-sys-corner-full, 1.25rem);
      padding: 0.25rem 0.75rem;
      background: transparent;
      color: inherit;
    }

    .cae-file-upload__upload {
      margin-top: 0.75rem;
      background: var(--mat-sys-primary, #6750a4);
      color: var(--mat-sys-on-primary, #fff);
      border-color: transparent;
      padding: 0.5rem 1rem;
    }

    .cae-file-upload__upload[aria-disabled='true'] {
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class CaeFileUpload implements ControlValueAccessor {
  private readonly announcer = inject(LiveAnnouncer);
  // Optional so a selection-only usage works without provideHttpClient; guarded at upload time.
  private readonly http = inject(HttpClient, { optional: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Stable id linking the styled `<label for>` to the native input. */
  protected readonly inputId = `cae-file-upload-${nextComponentId++}`;

  /**
   * The endpoint each file is `POST`ed to. Empty → **selection-only** (validate + expose the value,
   * never hit the network). The full request-config surface (`withCredentials`, headers) is a
   * follow-on (#338 deferred list).
   */
  readonly url = input('');
  /** The `multipart/form-data` field name each file is sent under. */
  readonly name = input('file');
  /** Allow selecting/dropping more than one file (append); off = single-file, each pick replaces. */
  readonly multiple = input(false, { transform: booleanAttribute });
  /**
   * Allowed types as a comma list of extensions (`.png`), exact MIME types (`image/png`), or type
   * groups (`image/*`) — passed to the input's `accept` **and** enforced at the trust boundary.
   */
  readonly accept = input('');
  /** Max size in **bytes**; a larger file is rejected before upload. `null` = no limit. */
  readonly maxFileSize = input<number | null>(null, { transform: nullableNumber });
  /** Upload each accepted file immediately on add (else wait for {@link upload}). */
  readonly auto = input(false, { transform: booleanAttribute });
  /** Template-driven disable; merged with reactive-forms `setDisabledState`. */
  readonly disabled = input(false, { transform: booleanAttribute });

  /** Text of the choose-files button (localizable). */
  readonly chooseLabel = input('Choose files');
  /** Hint beside the button (localizable; `aria-hidden` — the input already carries the a11y name). */
  readonly dropLabel = input('or drop files here');
  /** Text of the manual upload button (shown only when `!auto` and `url` is set). */
  readonly uploadLabel = input('Upload');

  /** Accessible name for the file input when no visible label wraps it. */
  readonly ariaLabel = input('');
  /** `id` of a visible element labelling the input. */
  readonly ariaLabelledby = input('');
  /** `id`(s) describing the input — the consumer-owned error/hint hook (#47); forwarded onto the input. */
  readonly ariaDescribedby = input('');

  // Output names avoid the native DOM-event names `select`/`error` (@angular-eslint/no-output-native):
  // a `(select)`/`(error)` host binding would be ambiguous with the native events.
  /** The accepted file set changed (selection or removal); payload is the current valid files. */
  readonly filesSelected = output<readonly File[]>();
  /** A file finished uploading (2xx). (Event is past-tense; {@link upload} is the imperative trigger.) */
  readonly uploaded = output<CaeFileUploadEvent>();
  /** A progress tick for an in-flight file. */
  readonly uploadProgress = output<CaeFileUploadProgress>();
  /** A file was rejected at the trust boundary (`kind: 'validation'`) or failed to upload (`'upload'`). */
  readonly uploadError = output<CaeFileUploadError>();
  /** A file was removed from the queue. */
  readonly remove = output<File>();

  /** The upload queue — the single source of truth the template renders (zoneless: a signal). */
  protected readonly files = signal<readonly CaeUploadFile[]>([]);
  protected readonly dragOver = signal(false);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly hasPending = computed(() => this.files().some((f) => f.status === 'pending'));

  // Active HttpClient subscriptions keyed by file id (non-reactive: cancel/cleanup only).
  private readonly subs = new Map<number, Subscription>();

  private onChangeFn: (value: readonly File[]) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // Abort any in-flight uploads if the component is torn down, so a pending XHR can't leak.
    inject(DestroyRef).onDestroy(() => {
      this.subs.forEach((s) => s.unsubscribe());
      this.subs.clear();
    });
  }

  // --- Intake -------------------------------------------------------------------------------------

  protected onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ingest(Array.from(input.files ?? []));
    // Reset so re-picking the same file fires `change` again.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (this.isDisabled()) return;
    // Preventing default on dragover is what lets the drop event fire at all.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (this.isDisabled()) return;
    this.ingest(Array.from(event.dataTransfer?.files ?? []));
  }

  /**
   * The single intake path for both the input and the dropzone: validate at the trust boundary, queue
   * the valid files (and the rejected ones as `invalid`, so they surface), then announce/emit/auto-upload.
   */
  protected ingest(incoming: readonly File[]): void {
    if (this.isDisabled()) return;
    const list = this.multiple() ? incoming : incoming.slice(0, 1);
    if (!list.length) return;

    const added: CaeUploadFile[] = list.map((file) => {
      const reason = this.validate(file);
      return {
        id: nextFileId++,
        file,
        status: reason ? ('invalid' as const) : ('pending' as const),
        progress: 0,
        error: reason,
      };
    });

    if (this.multiple()) {
      this.files.update((cur) => [...cur, ...added]);
    } else {
      // Single mode replaces the queue — cancel whatever it displaces first.
      this.cancelAll();
      this.files.set(added);
    }

    const rejected = added.filter((a) => a.status === 'invalid');
    for (const r of rejected) {
      this.uploadError.emit({ file: r.file, reason: r.error!, kind: 'validation' });
    }
    this.announceIntake(added.length - rejected.length, rejected.length);
    this.emitValue();

    if (this.auto()) this.uploadPending();
  }

  /** The trust-boundary check: returns an error message, or `null` when the file is allowed. */
  private validate(file: File): string | null {
    if (!this.accepts(file)) return 'File type not allowed';
    const max = this.maxFileSize();
    if (max != null && file.size > max) {
      return `File exceeds the ${this.formatSize(max)} limit`;
    }
    return null;
  }

  /** Match a file against `accept` (extension `.ext`, exact MIME `type/sub`, or group `type/*`). */
  private accepts(file: File): boolean {
    const spec = this.accept().trim();
    if (!spec) return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return spec
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .some((token) => {
        if (token.startsWith('.')) return name.endsWith(token);
        if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
        return type === token;
      });
  }

  // --- Upload -------------------------------------------------------------------------------------

  /** Upload every `pending` file (the manual-mode `(click)` target and the `auto` driver). */
  upload(): void {
    if (!this.hasPending()) return;
    this.uploadPending();
  }

  private uploadPending(): void {
    for (const f of this.files()) {
      if (f.status === 'pending') this.uploadOne(f.id);
    }
  }

  /** Re-send a file that failed or was canceled (never a validation-`invalid` one — permanently bad). */
  retry(id: number): void {
    const entry = this.files().find((f) => f.id === id);
    if (!entry || (entry.status !== 'error' && entry.status !== 'canceled')) return;
    this.patch(id, { status: 'pending', progress: 0, error: null });
    this.uploadOne(id);
    // The Retry button just unmounted; land focus on the row's now-current action button (Cancel, or
    // Retry again if the retry immediately errored) so a keyboard user isn't dropped to <body>.
    this.focusRowAction(id);
  }

  private uploadOne(id: number): void {
    const entry = this.files().find((f) => f.id === id);
    if (!entry) return;

    const url = this.url().trim();
    if (!url || !this.http) {
      const reason = 'Upload endpoint is not configured';
      this.patch(id, { status: 'error', error: reason });
      this.uploadError.emit({ file: entry.file, reason, kind: 'upload' });
      this.announcer.announce(`${entry.file.name} failed to upload`);
      return;
    }

    this.patch(id, { status: 'uploading', progress: 0, error: null });

    const body = new FormData();
    body.append(this.name(), entry.file, entry.file.name);
    const request = new HttpRequest('POST', url, body, { reportProgress: true });

    const sub = this.http.request(request).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const progress = event.total ? Math.round((100 * event.loaded) / event.total) : 0;
          this.patch(id, { progress });
          this.uploadProgress.emit({ file: entry.file, progress });
        } else if (event.type === HttpEventType.Response) {
          // Cancel is about to unmount (success shows no action button); if the user was focused on it,
          // move focus to this row's Remove so an async completion can't strand focus on <body>.
          const rescue = this.actionHasFocus(id);
          this.subs.delete(id);
          this.patch(id, { status: 'success', progress: 100 });
          this.uploaded.emit({ file: entry.file, response: (event as HttpResponse<unknown>).body });
          this.announcer.announce(`${entry.file.name} uploaded`);
          if (rescue) this.focusAfterRender(`[data-remove-id="${id}"]`);
        }
      },
      error: (err: unknown) => {
        // Cancel unmounts and Retry takes the slot; keep focus there if it was on the action button.
        const rescue = this.actionHasFocus(id);
        this.subs.delete(id);
        const reason = err instanceof HttpErrorResponse ? err.message : 'Upload failed';
        this.patch(id, { status: 'error', error: reason });
        this.uploadError.emit({ file: entry.file, reason, kind: 'upload' });
        this.announcer.announce(`${entry.file.name} failed to upload`);
        if (rescue) this.focusRowAction(id);
      },
    });
    // Store only if still open: a synchronously-emitting interceptor may have already run the handlers
    // (and their subs.delete no-op'd) before subscribe() returned, leaving `sub` closed.
    if (!sub.closed) this.subs.set(id, sub);
  }

  /** Abort an in-flight upload (unsubscribing aborts the underlying request). */
  cancel(id: number): void {
    const sub = this.subs.get(id);
    if (!sub) return;
    sub.unsubscribe();
    this.subs.delete(id);
    this.patch(id, { status: 'canceled', error: 'Upload canceled' });
    const entry = this.files().find((f) => f.id === id);
    if (entry) this.announcer.announce(`Upload of ${entry.file.name} canceled`);
    // Cancel unmounted; Retry now holds the row's action slot — land focus there.
    this.focusRowAction(id);
  }

  /** Remove a file from the queue entirely (canceling it first if it is uploading). */
  removeFile(id: number): void {
    const cur = this.files();
    const idx = cur.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const entry = cur[idx];
    this.subs.get(id)?.unsubscribe();
    this.subs.delete(id);
    // Pick the focus target (next row's Remove, else previous) BEFORE the row is filtered out.
    const neighbor = cur[idx + 1] ?? cur[idx - 1];
    this.files.update((c) => c.filter((f) => f.id !== id));
    this.remove.emit(entry.file);
    this.announcer.announce(`Removed ${entry.file.name}`);
    this.emitValue();
    this.focusAfterRender(
      neighbor ? `[data-remove-id="${neighbor.id}"]` : '.cae-file-upload__input',
    );
  }

  // --- Helpers ------------------------------------------------------------------------------------

  // Focus management (WCAG 2.4.3): a per-row control the user activated may unmount or swap on the
  // resulting re-render (Cancel↔Retry, or a removed row). Without this, focus would fall to <body>.
  // Cancel and Retry share `data-action-id` (one logical slot), so `focusRowAction` lands on whichever
  // is current. All focus moves are one-shot post-render (afterNextRender) so the new element exists.

  /** Whether this row's action button (Cancel/Retry) currently holds focus — the async-rescue guard. */
  private actionHasFocus(id: number): boolean {
    return (
      this.host.nativeElement.querySelector(`[data-action-id="${id}"]`) === document.activeElement
    );
  }

  /** After render, focus this row's current action button (Cancel or Retry). */
  private focusRowAction(id: number): void {
    this.focusAfterRender(`[data-action-id="${id}"]`);
  }

  /** After the next render, focus `selector` within the host (or the file input as a stable fallback). */
  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => {
        const host = this.host.nativeElement;
        const target =
          host.querySelector<HTMLElement>(selector) ??
          host.querySelector<HTMLElement>('.cae-file-upload__input');
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  /** Immutably update one entry by id. */
  private patch(id: number, changes: Partial<CaeUploadFile>): void {
    this.files.update((cur) => cur.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }

  private cancelAll(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.subs.clear();
  }

  /** The CVA value = accepted files (everything not rejected at the trust boundary). */
  private acceptedFiles(): readonly File[] {
    return this.files()
      .filter((f) => f.status !== 'invalid')
      .map((f) => f.file);
  }

  private emitValue(): void {
    const value = this.acceptedFiles();
    this.filesSelected.emit(value);
    this.onChangeFn(value);
  }

  private announceIntake(accepted: number, rejected: number): void {
    const parts: string[] = [];
    if (accepted) parts.push(`Added ${accepted} file${accepted === 1 ? '' : 's'}`);
    if (rejected) parts.push(`${rejected} file${rejected === 1 ? '' : 's'} rejected`);
    if (parts.length) this.announcer.announce(parts.join(', '));
  }

  /** Deterministic, locale-free size formatting (B / KB / MB). */
  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  }

  // --- ControlValueAccessor -----------------------------------------------------------------------

  /**
   * Seed the queue from a file set (renders; never re-emits). Clears on `null`/`[]`. Files written via
   * the form model go through the **same trust-boundary `validate()`** as user-picked files — a
   * programmatically-set oversize/wrong-type file lands `invalid` and can never be uploaded (closing the
   * reject-before-upload hole on the form path, not just the input/drop paths).
   */
  writeValue(value: readonly File[] | null | undefined): void {
    this.cancelAll();
    if (!value || !value.length) {
      this.files.set([]);
      return;
    }
    const list = this.multiple() ? value : value.slice(0, 1);
    this.files.set(
      list.map((file) => {
        const reason = this.validate(file);
        return {
          id: nextFileId++,
          file,
          status: reason ? ('invalid' as const) : ('pending' as const),
          progress: 0,
          error: reason,
        };
      }),
    );
  }
  registerOnChange(fn: (value: readonly File[]) => void): void {
    this.onChangeFn = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}

/**
 * `numberAttribute` that maps `null`/empty/`NaN`/**negative** to `null` (no limit). A negative "maximum"
 * is nonsensical config; treating it as no-limit avoids the fail-closed footgun of silently rejecting
 * every file (rather than a positive cap actually being applied).
 */
function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = numberAttribute(value, NaN);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
