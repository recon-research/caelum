import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { CaeCard } from 'caelum/card';
import { CaeFileUpload, CaeFileUploadError } from 'caelum/file-upload';

/**
 * The deferred "File upload" `cae-file-upload` demo (#338) — the third and final drag-drop-cluster
 * component. It exercises the **live, self-contained** path end-to-end: choose files with the keyboard
 * (the native `<input type=file>`) or drop them on the zone, oversize/wrong-type files are **rejected at
 * the trust boundary** (announced + shown), and the accepted set echoes below — no backend needed (DoD
 * liveness). This demo runs **selection-only** (no `[url]`), so it needs no `HttpClient`; wiring `[url]`
 * turns on the `HttpClient` progress/cancel/retry upload path (verified in the spec via
 * `HttpTestingController`) and would add `provideHttpClient()` to `app.config`.
 *
 * `@defer`'d from App (#85): keeps the demo off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-file-upload-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeFileUpload],
  templateUrl: './file-upload-demo.html',
  styleUrl: './file-upload-demo.scss',
})
export class FileUploadDemo {
  /** The accepted (validated) file set, echoed so a selection is visibly reflected. */
  protected readonly accepted = signal<readonly File[]>([]);

  /** Human-readable summary of the accepted files. */
  protected readonly acceptedText = computed(
    () =>
      this.accepted()
        .map((f) => f.name)
        .join(' · ') || '(none)',
  );

  /** The last trust-boundary rejection (visual only — cae-file-upload already announces it). */
  protected readonly lastRejection = signal<string | null>(null);

  /** 512 KB cap for the demo, so a large image visibly trips the trust boundary. */
  protected readonly maxSize = 512 * 1024;

  protected onSelect(files: readonly File[]): void {
    this.accepted.set(files);
  }

  protected onError(event: CaeFileUploadError): void {
    if (event.kind === 'validation') {
      this.lastRejection.set(`${event.file.name} — ${event.reason}`);
    }
  }
}
