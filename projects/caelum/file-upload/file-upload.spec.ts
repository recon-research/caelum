import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpEventType, HttpHeaders, HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CaeFileUpload,
  CaeFileUploadError,
  CaeFileUploadEvent,
  CaeFileUploadProgress,
} from './file-upload';

const URL = '/api/upload';

/** A `File` with a controllable `size` (jsdom's `new File(['x'], …)` is always 1 byte). */
function makeFile(name: string, size = 10, type = ''): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('CaeFileUpload', () => {
  let fixture: ComponentFixture<CaeFileUpload>;
  let cmp: CaeFileUpload;
  let http: HttpTestingController;
  let announce: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CaeFileUpload],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    announce = vi
      .spyOn(TestBed.inject(LiveAnnouncer), 'announce')
      .mockResolvedValue(undefined as unknown as void);
    fixture = TestBed.createComponent(CaeFileUpload);
    cmp = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      fixture.destroy();
      fixture.nativeElement.remove();
    }
  });

  // Intake funnels through the shared `ingest` path (protected — the boundary the input/dropzone call).
  function ingest(files: File[]): void {
    (cmp as unknown as { ingest(f: readonly File[]): void }).ingest(files);
    fixture.detectChanges();
  }
  function files() {
    return (
      cmp as unknown as {
        files(): readonly { id: number; status: string; progress: number; error: string | null }[];
      }
    ).files();
  }
  const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  it('renders a keyboard-reachable native file input labelled by the styled button', () => {
    const input = el('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    // The input is the keyboard path — it must NOT be removed from the tab order.
    expect(input.hasAttribute('hidden')).toBe(false);
    expect(input.disabled).toBe(false);
    const label = el('label.cae-file-upload__button') as HTMLLabelElement;
    expect(label.getAttribute('for')).toBe(input.id);
    expect(input.id).toContain('cae-file-upload-');
  });

  it('passes accept/multiple through to the native input', () => {
    fixture.componentRef.setInput('accept', 'image/*');
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();
    const input = el('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe('image/*');
    expect(input.multiple).toBe(true);
  });

  it('forwards ariaDescribedby onto the focusable input (#47 consumer-owned error hook)', () => {
    fixture.componentRef.setInput('ariaDescribedby', 'err-1');
    fixture.detectChanges();
    const input = el('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute('aria-describedby')).toBe('err-1');
  });

  // --- Trust boundary -----------------------------------------------------------------------------

  it('rejects an oversized file at the trust boundary — never uploads it', () => {
    const errors: CaeFileUploadError[] = [];
    cmp.uploadError.subscribe((e) => errors.push(e));
    fixture.componentRef.setInput('url', URL);
    fixture.componentRef.setInput('auto', true);
    fixture.componentRef.setInput('maxFileSize', 50);
    fixture.detectChanges();

    ingest([makeFile('big.png', 5000, 'image/png')]);

    expect(files()[0].status).toBe('invalid');
    expect(files()[0].error).toContain('limit');
    expect(errors[0]).toMatchObject({ kind: 'validation' });
    http.expectNone(URL); // the non-negotiable: rejected before upload
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('rejected'));
  });

  it('rejects a disallowed type before upload; accepts a matching type group', () => {
    fixture.componentRef.setInput('accept', 'image/*');
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();

    ingest([makeFile('doc.pdf', 10, 'application/pdf'), makeFile('pic.png', 10, 'image/png')]);

    expect(files()[0].status).toBe('invalid');
    expect(files()[1].status).toBe('pending');
  });

  it('matches accept by file extension when the MIME type is blank', () => {
    fixture.componentRef.setInput('accept', '.csv');
    fixture.detectChanges();
    ingest([makeFile('data.csv', 10, '')]);
    expect(files()[0].status).toBe('pending');
  });

  // --- Selection-only (no url) --------------------------------------------------------------------

  it('exposes accepted files as the value and emits (select), with no network when url is unset', () => {
    const selected: (readonly File[])[] = [];
    cmp.filesSelected.subscribe((v) => selected.push(v));
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();

    ingest([makeFile('a.txt', 10), makeFile('b.txt', 10)]);

    expect(files().map((f) => f.status)).toEqual(['pending', 'pending']);
    expect(selected.at(-1)!.length).toBe(2);
    http.expectNone(URL);
  });

  // --- Upload / progress / cancel / retry ---------------------------------------------------------

  it('auto-uploads with real HttpClient progress and a success response', () => {
    const progresses: CaeFileUploadProgress[] = [];
    const uploaded: CaeFileUploadEvent[] = [];
    cmp.uploadProgress.subscribe((p) => progresses.push(p));
    cmp.uploaded.subscribe((u) => uploaded.push(u));
    fixture.componentRef.setInput('url', URL);
    fixture.componentRef.setInput('auto', true);
    fixture.detectChanges();

    ingest([makeFile('a.txt', 10)]);

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect(req.request.reportProgress).toBe(true);

    req.event({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    fixture.detectChanges();
    expect(files()[0].status).toBe('uploading');
    expect(files()[0].progress).toBe(40);
    expect(progresses.at(-1)).toMatchObject({ progress: 40 });

    req.flush({ ok: true });
    fixture.detectChanges();
    expect(files()[0].status).toBe('success');
    expect(files()[0].progress).toBe(100);
    expect(uploaded.at(-1)).toMatchObject({ response: { ok: true } });
    // Success carries a persistent TEXT status, not color alone (WCAG 1.4.1).
    expect(el('.cae-file-upload__done')?.textContent).toContain('Uploaded');
  });

  describe('request configuration (#345)', () => {
    // Set url + the config under test first, then drive one auto-upload and grab the request.
    function uploadOne() {
      fixture.componentRef.setInput('url', URL);
      fixture.componentRef.setInput('auto', true);
      fixture.detectChanges();
      ingest([makeFile('a.txt', 10)]);
      return http.expectOne((r) => r.url === URL); // r.url excludes params, so this matches with params set
    }

    it('threads withCredentials and plain-object headers (incl. array-valued) onto the request', () => {
      fixture.componentRef.setInput('withCredentials', true);
      fixture.componentRef.setInput('headers', {
        Authorization: 'Bearer t0ken',
        'X-Multi': ['a', 'b'],
      });
      const req = uploadOne();
      expect(req.request.withCredentials).toBe(true);
      expect(req.request.headers.get('Authorization')).toBe('Bearer t0ken');
      expect(req.request.headers.getAll('X-Multi')).toEqual(['a', 'b']);
      req.flush({ ok: true });
    });

    it('strips a consumer-set Content-Type so the browser keeps the multipart boundary', () => {
      // A Content-Type without a boundary would silently corrupt every FormData upload; guard it.
      fixture.componentRef.setInput('headers', {
        'content-type': 'application/json',
        'X-Keep': '1',
      });
      const req = uploadOne();
      expect(req.request.headers.has('Content-Type')).toBe(false); // stripped (case-insensitive)
      expect(req.request.headers.get('X-Keep')).toBe('1'); // other headers survive
      req.flush({ ok: true });
    });

    it('accepts HttpHeaders / HttpParams instances directly', () => {
      fixture.componentRef.setInput('headers', new HttpHeaders({ 'X-Trace': 'abc' }));
      fixture.componentRef.setInput('params', new HttpParams().set('folder', 'avatars'));
      const req = uploadOne();
      expect(req.request.headers.get('X-Trace')).toBe('abc');
      expect(req.request.params.get('folder')).toBe('avatars');
      expect(req.request.urlWithParams).toBe(`${URL}?folder=avatars`);
      req.flush({ ok: true });
    });

    it('serializes plain-object params (string/number/boolean/array) into the query string', () => {
      fixture.componentRef.setInput('params', {
        folder: 'pics',
        overwrite: true,
        page: 2,
        tags: ['x', 'y'],
      });
      const req = uploadOne();
      expect(req.request.params.get('folder')).toBe('pics');
      expect(req.request.params.get('overwrite')).toBe('true');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.getAll('tags')).toEqual(['x', 'y']);
      req.flush({ ok: true });
    });

    it('sends no credentials, headers, or params by default (safe request)', () => {
      const req = uploadOne();
      expect(req.request.withCredentials).toBe(false);
      expect(req.request.headers.get('Authorization')).toBeNull();
      expect(req.request.params.keys()).toEqual([]);
      req.flush({ ok: true });
    });
  });

  it('waits for upload() in manual mode; the Upload button is aria-disabled (not native) with no pending', () => {
    fixture.componentRef.setInput('url', URL);
    fixture.detectChanges();

    // No files yet → button present, aria-disabled, but still focusable (not native-disabled).
    const btn = el('.cae-file-upload__upload') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.disabled).toBe(false);

    ingest([makeFile('a.txt', 10)]);
    expect(
      (el('.cae-file-upload__upload') as HTMLButtonElement).getAttribute('aria-disabled'),
    ).toBeNull();
    http.expectNone(URL); // not auto → nothing uploaded on add

    cmp.upload();
    const req = http.expectOne(URL);
    req.flush({ ok: true });
    fixture.detectChanges();
    expect(files()[0].status).toBe('success');
  });

  it('cancel() aborts the in-flight request', () => {
    fixture.componentRef.setInput('url', URL);
    fixture.componentRef.setInput('auto', true);
    fixture.detectChanges();

    ingest([makeFile('a.txt', 10)]);
    const req = http.expectOne(URL);
    cmp.cancel(files()[0].id);
    fixture.detectChanges();

    expect(req.cancelled).toBe(true);
    expect(files()[0].status).toBe('canceled');
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('canceled'));
  });

  it('surfaces an upload error, then retry() re-sends and can succeed', () => {
    const errors: CaeFileUploadError[] = [];
    cmp.uploadError.subscribe((e) => errors.push(e));
    fixture.componentRef.setInput('url', URL);
    fixture.componentRef.setInput('auto', true);
    fixture.detectChanges();

    ingest([makeFile('a.txt', 10)]);
    http.expectOne(URL).flush('nope', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(files()[0].status).toBe('error');
    expect(errors.at(-1)).toMatchObject({ kind: 'upload' });

    cmp.retry(files()[0].id);
    const retryReq = http.expectOne(URL);
    retryReq.flush({ ok: true });
    fixture.detectChanges();
    expect(files()[0].status).toBe('success');
  });

  it('errors a pending file that is uploaded with no url configured', () => {
    const errors: CaeFileUploadError[] = [];
    cmp.uploadError.subscribe((e) => errors.push(e));
    // url unset → selection-only; forcing upload() surfaces a configuration error, not a silent no-op.
    ingest([makeFile('a.txt', 10)]);
    cmp.upload();
    fixture.detectChanges();
    // hasPending() was true, so upload() ran; each pending file errors as not-configured.
    expect(files()[0].status).toBe('error');
    expect(errors.at(-1)).toMatchObject({ kind: 'upload' });
    // The error state is announced (parity with the network-failure path — no silent SR gap).
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('failed to upload'));
    http.expectNone(URL);
  });

  it('treats a negative maxFileSize as no limit (ignores the invalid config, no fail-closed footgun)', () => {
    fixture.componentRef.setInput('maxFileSize', -1);
    fixture.detectChanges();
    ingest([makeFile('big.txt', 99999)]);
    expect(files()[0].status).toBe('pending');
  });

  // --- Trust boundary on the form path (writeValue) -----------------------------------------------

  it('validates files written via the form model — an oversize one is invalid and never uploaded', () => {
    fixture.componentRef.setInput('url', URL);
    fixture.componentRef.setInput('maxFileSize', 50);
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();

    cmp.writeValue([makeFile('big.png', 5000, 'image/png'), makeFile('ok.png', 10, 'image/png')]);
    fixture.detectChanges();
    expect(files()[0].status).toBe('invalid');
    expect(files()[1].status).toBe('pending');

    cmp.upload();
    const reqs = http.match(URL);
    expect(reqs.length).toBe(1); // only the valid file reaches the network
    reqs[0].flush({ ok: true });
  });

  // --- Focus management (WCAG 2.4.3 — no stranding to <body>) --------------------------------------

  it('moves focus to a neighbor row when a focused row is removed', async () => {
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();
    ingest([makeFile('a.txt', 10), makeFile('b.txt', 10), makeFile('c.txt', 10)]);
    const ids = files().map((f) => f.id);

    const midRemove = fixture.nativeElement.querySelector(
      `[data-remove-id="${ids[1]}"]`,
    ) as HTMLButtonElement;
    midRemove.focus();
    expect(document.activeElement).toBe(midRemove);

    cmp.removeFile(ids[1]);
    fixture.detectChanges();
    await fixture.whenStable();

    const nextRemove = fixture.nativeElement.querySelector(`[data-remove-id="${ids[2]}"]`);
    expect(document.activeElement).toBe(nextRemove);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('keeps focus in the row when Cancel swaps to Retry', async () => {
    fixture.componentRef.setInput('url', URL);
    fixture.componentRef.setInput('auto', true);
    fixture.detectChanges();
    ingest([makeFile('a.txt', 10)]);
    const id = files()[0].id;
    http.expectOne(URL); // in-flight (canceled below; a cancelled request passes verify)

    const cancelBtn = fixture.nativeElement.querySelector(
      `[data-action-id="${id}"]`,
    ) as HTMLButtonElement;
    cancelBtn.focus();
    cmp.cancel(id);
    fixture.detectChanges();
    await fixture.whenStable();

    const retryBtn = fixture.nativeElement.querySelector(`[data-action-id="${id}"]`);
    expect(retryBtn?.textContent?.trim()).toBe('Retry');
    expect(document.activeElement).toBe(retryBtn);
  });

  // --- Queue mechanics ----------------------------------------------------------------------------

  it('removes a file, emits (remove), and updates the value', () => {
    const removed: File[] = [];
    const selected: (readonly File[])[] = [];
    cmp.remove.subscribe((f) => removed.push(f));
    cmp.filesSelected.subscribe((v) => selected.push(v));
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();

    ingest([makeFile('a.txt', 10), makeFile('b.txt', 10)]);
    cmp.removeFile(files()[0].id);
    fixture.detectChanges();

    expect(files().length).toBe(1);
    expect(removed.length).toBe(1);
    expect(selected.at(-1)!.length).toBe(1);
  });

  it('single mode keeps only the latest pick (replaces the queue)', () => {
    ingest([makeFile('a.txt', 10)]);
    ingest([makeFile('b.txt', 10)]);
    expect(files().length).toBe(1);
    expect(files()[0].error).toBeNull();
  });

  it('a disabled control ignores intake', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    ingest([makeFile('a.txt', 10)]);
    expect(files().length).toBe(0);
  });

  it('destroys cleanly, aborting an in-flight upload', () => {
    fixture.componentRef.setInput('url', URL);
    fixture.componentRef.setInput('auto', true);
    fixture.detectChanges();
    ingest([makeFile('a.txt', 10)]);
    const req = http.expectOne(URL);
    fixture.destroy();
    expect(req.cancelled).toBe(true);
  });

  // Object-URL image previews (#345). jsdom doesn't implement createObjectURL/revokeObjectURL, so mock
  // both — which also lets us assert the revoke lifecycle (a leaked blob URL never surfaces in a spec,
  // so the revoke SYMMETRY is the only thing that catches a leak). The component guards on `typeof`, so
  // these mocks satisfy that guard too.
  describe('image thumbnails / preview (#345)', () => {
    // NB: this spec shadows the global `URL` with a string const (the endpoint), so reach the real
    // constructor via `globalThis.URL` to stub the object-URL factory/revoker.
    const G = globalThis.URL;
    let createSpy: ReturnType<typeof vi.fn>;
    let revokeSpy: ReturnType<typeof vi.fn>;
    let origCreate: typeof G.createObjectURL | undefined;
    let origRevoke: typeof G.revokeObjectURL | undefined;
    let n: number;

    beforeEach(() => {
      n = 0;
      origCreate = G.createObjectURL;
      origRevoke = G.revokeObjectURL;
      createSpy = vi.fn(() => `blob:mock-${n++}`);
      revokeSpy = vi.fn();
      G.createObjectURL = createSpy as unknown as typeof G.createObjectURL;
      G.revokeObjectURL = revokeSpy as unknown as typeof G.revokeObjectURL;
    });

    afterEach(() => {
      G.createObjectURL = origCreate!;
      G.revokeObjectURL = origRevoke!;
    });

    const thumbs = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll('img.cae-file-upload__thumb'),
      ) as HTMLImageElement[];

    it('renders a decorative object-URL thumbnail for an image file when previewImages is on', () => {
      fixture.componentRef.setInput('previewImages', true);
      fixture.componentRef.setInput('multiple', true);
      fixture.detectChanges();
      ingest([makeFile('photo.png', 10, 'image/png')]);
      const imgs = thumbs();
      expect(imgs.length).toBe(1);
      expect(imgs[0].getAttribute('src')).toBe('blob:mock-0');
      // Decorative: an empty alt keeps it out of the a11y tree (the filename already names the row).
      expect(imgs[0].getAttribute('alt')).toBe('');
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('does not thumbnail a non-image file', () => {
      fixture.componentRef.setInput('previewImages', true);
      fixture.detectChanges();
      ingest([makeFile('notes.txt', 10, 'text/plain')]);
      expect(thumbs().length).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('does not thumbnail when previewImages is off (default) — behavior byte-for-byte unchanged', () => {
      ingest([makeFile('photo.png', 10, 'image/png')]);
      expect(thumbs().length).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('does not thumbnail an invalid (rejected) image', () => {
      fixture.componentRef.setInput('previewImages', true);
      fixture.componentRef.setInput('maxFileSize', 5);
      fixture.detectChanges();
      ingest([makeFile('huge.png', 999, 'image/png')]);
      expect(files()[0].status).toBe('invalid');
      expect(thumbs().length).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('previews a file added later — the effect covers late additions', () => {
      fixture.componentRef.setInput('previewImages', true);
      fixture.componentRef.setInput('multiple', true);
      fixture.detectChanges();
      ingest([makeFile('a.png', 10, 'image/png')]);
      expect(thumbs().length).toBe(1);
      ingest([makeFile('b.png', 10, 'image/png')]);
      expect(thumbs().length).toBe(2);
      expect(createSpy).toHaveBeenCalledTimes(2);
    });

    it('revokes the object URL when its file is removed', () => {
      fixture.componentRef.setInput('previewImages', true);
      fixture.componentRef.setInput('multiple', true);
      fixture.detectChanges();
      ingest([makeFile('a.png', 10, 'image/png'), makeFile('b.png', 10, 'image/png')]);
      expect(createSpy).toHaveBeenCalledTimes(2);
      const firstId = files()[0].id;
      cmp.removeFile(firstId);
      fixture.detectChanges();
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-0');
      expect(revokeSpy).toHaveBeenCalledTimes(1);
      // Only the removed file's thumbnail is gone; the survivor keeps its own URL.
      expect(thumbs().length).toBe(1);
    });

    it('revokes the displaced URL and mints a new one on a single-mode replace', () => {
      fixture.componentRef.setInput('previewImages', true); // multiple defaults false → each pick replaces
      fixture.detectChanges();
      ingest([makeFile('first.png', 10, 'image/png')]);
      expect(createSpy).toHaveBeenCalledTimes(1);
      ingest([makeFile('second.png', 10, 'image/png')]);
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-0');
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(thumbs()[0].getAttribute('src')).toBe('blob:mock-1');
    });

    it('revokes every preview URL on destroy — no blob-URL leak', () => {
      fixture.componentRef.setInput('previewImages', true);
      fixture.componentRef.setInput('multiple', true);
      fixture.detectChanges();
      ingest([makeFile('a.png', 10, 'image/png'), makeFile('b.png', 10, 'image/png')]);
      expect(createSpy).toHaveBeenCalledTimes(2);
      fixture.destroy();
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-0');
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-1');
      expect(revokeSpy).toHaveBeenCalledTimes(2);
    });

    it('revokes previews when the form model is cleared via writeValue([])', () => {
      fixture.componentRef.setInput('previewImages', true);
      fixture.componentRef.setInput('multiple', true);
      fixture.detectChanges();
      ingest([makeFile('a.png', 10, 'image/png'), makeFile('b.png', 10, 'image/png')]);
      expect(createSpy).toHaveBeenCalledTimes(2);
      cmp.writeValue([]);
      fixture.detectChanges();
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-0');
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-1');
      expect(revokeSpy).toHaveBeenCalledTimes(2);
      expect(thumbs().length).toBe(0);
    });

    it('revokes the old preview and mints a fresh one when writeValue seeds a new list', () => {
      fixture.componentRef.setInput('previewImages', true);
      fixture.componentRef.setInput('multiple', true);
      fixture.detectChanges();
      ingest([makeFile('old.png', 10, 'image/png')]);
      expect(createSpy).toHaveBeenCalledTimes(1);
      cmp.writeValue([makeFile('new.png', 10, 'image/png')]);
      fixture.detectChanges();
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-0');
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(thumbs()[0].getAttribute('src')).toBe('blob:mock-1');
    });
  });
});

// --- Forms integration (controlled CVA) -----------------------------------------------------------

@Component({
  template: `<cae-file-upload [formControl]="ctrl" [multiple]="true" />`,
  imports: [CaeFileUpload, ReactiveFormsModule],
})
class FormHost {
  readonly ctrl = new FormControl<readonly File[]>([], { nonNullable: true });
}

describe('CaeFileUpload — forms (CVA)', () => {
  let fixture: ComponentFixture<FormHost>;
  let host: FormHost;
  let cmp: CaeFileUpload;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormHost],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(FormHost);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    cmp = fixture.debugElement.query(By.directive(CaeFileUpload)).componentInstance;
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  function ingest(files: File[]): void {
    (cmp as unknown as { ingest(f: readonly File[]): void }).ingest(files);
    fixture.detectChanges();
  }

  it('round-trips the accepted file set through the FormControl', () => {
    ingest([makeFile('a.txt', 10), makeFile('b.txt', 10)]);
    expect(host.ctrl.value.length).toBe(2);
    expect(host.ctrl.value[0].name).toBe('a.txt');
  });

  it('writeValue([]) via reset clears the queue without re-emitting', () => {
    ingest([makeFile('a.txt', 10)]);
    host.ctrl.reset([]);
    fixture.detectChanges();
    const files = (cmp as unknown as { files(): readonly unknown[] }).files();
    expect(files.length).toBe(0);
  });

  it('marks the control touched on input blur', () => {
    expect(host.ctrl.touched).toBe(false);
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(host.ctrl.touched).toBe(true);
  });

  it('setDisabledState reflects into the native input', () => {
    host.ctrl.disable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
