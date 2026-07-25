/**
 * Liveness guard for {@link loadCaelumTheme} (#736, the unfinished half of #724).
 *
 * **Why this spec exists at all.** #724 fixed a real vacuity — a browser page with no stylesheet
 * made axe's `color-contrast` judge *unstyled defaults*, so it passed trivially and tested no
 * colour Caelum ships. The fix loaded `_tokens.scss` and asserted `themeToken('--cae-color-border')`
 * is non-empty. That assertion passes with **only** the token layer loaded, which is exactly what
 * made the remaining gap invisible: `_tokens.scss` emits zero `--mat-sys-*`, and Caelum is a
 * library of *Direct wrappers over Material*, so nearly every shipped component takes its colour
 * from the seam that was still missing.
 *
 * Material ships each component's CSS with the component, so the rules were always present — they
 * just resolved every colour and font against an undefined custom property and fell back to the
 * initial value. Found while building the visual-regression suite (#732): `cae-button` screenshot
 * as bare serif text with no container on four of five variants.
 *
 * **The mechanism is NOT "axe declined to check"** — an appealing guess that measurement refuted.
 * In a real browser `color-contrast` lands in `passes` either way; what changed is *which colours
 * it judged*. So the guards below assert the rendered result (a painted container, themed
 * foreground) rather than the rule's own status, which is inert here.
 *
 * That is also why a token being non-empty is only a proxy: the thing that has to be true before
 * any contrast assertion elsewhere means anything is that a Material control actually paints.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as axe from 'axe-core';

import { CaeButton } from '../button/button';
import { loadCaelumTheme, themeToken } from './theme';

@Component({
  imports: [CaeButton],
  template: `<cae-button variant="filled">Save</cae-button>`,
})
class ThemeProbeHost {}

/** `rgb(…)`/`rgba(…)` with any non-zero alpha — i.e. the element actually paints something. */
function isOpaquePaint(color: string): boolean {
  if (color === 'transparent') return false;
  const alpha = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(color);
  return alpha ? Number(alpha[1]) > 0 : /^rgb\(/.test(color);
}

/** Rough perceptual lightness of an `rgb(…)` string — only ever compared, never asserted raw. */
function luminance(color: string): number {
  const [r, g, b] = (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color) ?? ['', '0', '0', '0']).slice(1);
  return 0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b);
}

describe('loadCaelumTheme (real browser)', () => {
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ThemeProbeHost] });
    loadCaelumTheme();
    const fixture = TestBed.createComponent(ThemeProbeHost);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
  });

  afterEach(() => el?.parentNode?.removeChild(el));

  it('stands up the Caelum token layer (the #724 guard)', () => {
    expect(themeToken('--cae-color-border')).not.toBe('');
    expect(themeToken('--cae-space-4')).not.toBe('');
  });

  it('stands up MATERIAL’s system seam too, not just the --cae-* half', () => {
    // The half #724 missed. `_tokens.scss` defines none of these; only `_theme.scss`'s
    // `mat.theme()` emits them, so this fails outright when the helper loads the token
    // layer alone — which is the state that made every contrast check below vacuous.
    expect(themeToken('--mat-sys-primary')).not.toBe('');
    expect(themeToken('--mat-sys-on-surface')).not.toBe('');
  });

  it('lets axe judge the SHIPPED colours, not a fallback that trivially passes', async () => {
    // Precision about the failure mode, because the obvious guess is wrong: axe did NOT report
    // `color-contrast` as `incomplete` here. It evaluated the rule all along — against the
    // *fallback* rendering (default near-black text, no painted container), which passes
    // comfortably and tests nothing Caelum ships. Asserting "the rule was evaluated" is
    // therefore an inert guard: measured, it holds identically with and without the fix.
    //
    // What actually distinguishes the two states is *which colours* were judged. So pin that:
    // the button's foreground must be the theme's on-primary, sitting on a painted container.
    const button = el.querySelector('button') as HTMLElement;
    const { color, backgroundColor } = getComputedStyle(button);
    const results = await axe.run(el);

    expect(results.passes.some((r) => r.id === 'color-contrast')).toBe(true);
    expect(isOpaquePaint(backgroundColor)).toBe(true);
    // A filled button is light-on-dark in the light scheme — the inverse of the unthemed
    // default, which is what makes this a real discriminator rather than a restatement.
    expect(luminance(color)).toBeGreaterThan(luminance(backgroundColor));
  });

  it('gives a Material-backed control a real painted container', () => {
    // The consequence-level assertion, and the one a future regression cannot argue with:
    // a filled button whose tokens are missing renders with a transparent background and
    // the browser's default serif, which is precisely what it did before #736.
    const button = el.querySelector('button') as HTMLElement;
    const style = getComputedStyle(button);
    expect(isOpaquePaint(style.backgroundColor)).toBe(true);
    expect(style.fontFamily).not.toMatch(/^(serif|Times)/i);
    expect(button.getBoundingClientRect().height).toBeGreaterThan(20);
  });
});
