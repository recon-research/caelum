/**
 * Real-browser verification for `CaeDialog`'s **focus containment at open** (#765).
 *
 * **The claim under test.** A modal must contain focus from the moment it attaches. Material's
 * default does not: it defers `_trapFocus()` until the open *animation* finishes
 * (`MatDialogConfig.delayFocusTrap`, default `true`), so for ~100-200ms the dialog is on screen and
 * modal in appearance while a Tab still walks into the page behind it. The CDK focus-trap anchors
 * exist that whole time — they just cannot help, because anchors only redirect focus that *leaves*
 * the overlay, and focus that starts outside never reaches them. `CaeDialog` therefore passes
 * `delayFocusTrap: false` (see `dialog.ts`; the fork is #791).
 *
 * **Why a browser.** Every assertion reads `document.activeElement` after a real overlay attach, and
 * the defect is a property of the real animation timeline — the two things jsdom cannot answer. In
 * jsdom `_trapFocus` finds nothing to focus and the gap has no meaning at all.
 *
 * **Why this is not the flake #765 predicted.** The issue deliberately left this unpinned, reasoning
 * that catching a ~100-200ms window needs a ~10ms sample — a CI flake generator. That is true of the
 * *broken* behaviour and false of the *fixed* one: with the trap installed at content-attach,
 * containment holds **synchronously**, so the assertion needs no sample, no timer, and no tolerance.
 * Measured before the fix: `sync=BODY | +10=BODY | +50=BODY | +100=BODY | +200=DIALOG`. After:
 * `sync=DIALOG` at every sample. A test that must race the animation is the symptom; this one
 * asserts the state that makes the race impossible.
 *
 * Run it: `npm run test:browser`.
 */
import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { userEvent } from 'vitest/browser';

import { CaeDialog, CaeDialogContent, CaeDialogTitle } from './dialog';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  imports: [CaeDialogTitle, CaeDialogContent],
  template: `
    <h2 caeDialogTitle>Rename workspace</h2>
    <div caeDialogContent><button type="button" id="inside">Inside</button></div>
  `,
})
class DialogBody {}

@Component({
  template: `
    <button type="button" id="behind1">Behind one</button>
    <button type="button" id="behind2">Behind two</button>
  `,
})
class DialogHost {
  readonly dialog = inject(CaeDialog);
}

describe('CaeDialog — focus containment at open (real browser)', () => {
  let fixture: ComponentFixture<DialogHost>;
  let dialog: CaeDialog;
  let containerEl: HTMLElement;

  const behind = (id: string): HTMLButtonElement =>
    (fixture.nativeElement as HTMLElement).querySelector(`#${id}`)!;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [DialogHost] }).compileComponents();
    loadCaelumTheme();
    fixture = TestBed.createComponent(DialogHost);
    dialog = fixture.componentInstance.dialog;
    containerEl = TestBed.inject(OverlayContainer).getContainerElement();
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  it('owns focus as soon as the dialog attaches, with no wait for the open animation', () => {
    behind('behind1').focus();
    expect(containerEl.contains(document.activeElement)).toBe(false);

    const ref = dialog.open(DialogBody);
    fixture.detectChanges();

    // Synchronously after attach — deliberately no waitFor, no timer. Material's default fails this
    // line (focus is still on the page behind); that is the whole point of the assertion.
    expect(containerEl.contains(document.activeElement)).toBe(true);

    ref.close();
  });

  it('holds a Tab pressed during the old animation gap inside the dialog', async () => {
    behind('behind1').focus();
    const ref = dialog.open(DialogBody);
    fixture.detectChanges();

    await userEvent.keyboard('{Tab}');

    // Measured pre-fix, this landed on #behind2 — a keyboard user tabbing straight after opening a
    // modal reached the content it was meant to block, then had focus yanked away mid-interaction
    // when the animation completed.
    expect(document.activeElement).not.toBe(behind('behind2'));
    expect(containerEl.contains(document.activeElement)).toBe(true);

    ref.close();
  });
});
