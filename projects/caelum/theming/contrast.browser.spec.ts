/**
 * Token-layer contrast contract (#425, decided by #744) — the teeth for #734's theming polish.
 *
 * **What it pins.** Every semantic colour Caelum offers as a text foreground must clear WCAG 1.4.3's
 * 4.5:1 against *every* surface token it can legally sit on, in *both* schemes. That is a property
 * of the token layer alone, so it is checked here once rather than re-derived per component — axe
 * (#690/#691) only ever judges the combinations a component happens to render, and the visual-
 * regression suite (#732) sees a colour change but has no opinion about whether it is *readable*.
 *
 * **Why a browser spec and not jsdom.** A custom property computes as a token stream: reading
 * `--cae-color-warn` off `:root` returns the literal `light-dark(#985a00, #ffb74d)` in Chromium
 * exactly as in jsdom (`testing/theme.ts` documents this). `light-dark()` resolves only where the
 * token is *consumed* in a colour context, so the only honest read is a **used** value —
 * `getComputedStyle(probe).color` — which is also precisely what axe reads. Doing this in jsdom
 * would mean re-implementing the cascade and transcribing the hexes, i.e. testing a copy of
 * `_tokens.scss` instead of `_tokens.scss`.
 *
 * **The vacuity trap this spec is built around.** An undefined or misspelled custom property makes
 * its declaration *invalid at computed-value time*: `color` then falls back to **inherited** and
 * `background-color` to its initial `transparent`. A probe whose tokens all silently failed would
 * therefore read as near-black on white — **21:1, the most comfortable pass in the suite**. That is
 * the exact shape of #724/#736 (a contrast check that passed hardest when it was measuring nothing),
 * so every read here goes through {@link resolved}, which paints the probe's ancestor a sentinel
 * magenta and treats "still magenta" / "still transparent" as a failure rather than a data point.
 */
import { Component, ViewEncapsulation } from '@angular/core';
import { TestBed } from '@angular/core/testing';

/** Emits the real compiled `_tokens.scss` globally — `:root` rules land on `document.documentElement`. */
@Component({
  selector: 'cae-contrast-probe-host',
  template: '',
  styleUrl: '../styles/_tokens.scss',
  encapsulation: ViewEncapsulation.None,
})
class ContrastProbeHost {}

/**
 * Foregrounds Caelum offers for **text**. `--cae-color-warn` and `--cae-color-success` are in this
 * list as a direct consequence of #744: before it they were fill-only in practice (light amber sat
 * at 3.65:1 on the sunken surface), and the decision was to make the family uniform rather than
 * document a per-token exception nobody would read.
 */
const TEXT_FOREGROUNDS = [
  '--cae-color-primary',
  '--cae-color-error',
  '--cae-color-success',
  '--cae-color-warn',
  '--cae-color-on-surface',
  '--cae-color-on-surface-variant',
] as const;

/** Every surface a component may legally paint behind that text. */
const SURFACES = ['--cae-surface-base', '--cae-surface-raised', '--cae-surface-sunken'] as const;

const SCHEMES = ['light', 'dark'] as const;

/** WCAG 1.4.3 (normal text). Large text and graphics owe 3:1; nothing here claims that exemption. */
const TEXT_MIN = 4.5;

const SENTINEL = 'rgb(255, 0, 255)';
const root = document.documentElement;
let sentinelBox: HTMLElement;

/**
 * Parses an **opaque** `rgb(r, g, b)` / `rgba(r, g, b, 1)`. Returns null for anything else.
 *
 * The alpha check is not defensive boilerplate — it is the background half of the vacuity guard.
 * `transparent` serializes as `rgba(0, 0, 0, 0)`, which matches an rgb-shaped regex and reads as
 * **opaque black**; a dead surface token would therefore have been silently measured against black
 * instead of rejected. Any partial alpha is refused for a second reason: contrast against a
 * translucent backdrop depends on what is behind it, so the ratio would be fiction either way.
 */
function parseRgb(value: string): [number, number, number] | null {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(value.trim());
  if (!m || (m[4] !== undefined && Number(m[4]) !== 1)) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Resolves `token` as a **used** colour value in the current scheme, failing loudly if it did not
 * resolve at all.
 *
 * `prop` matters: `color` inherits (so a dead token yields the sentinel magenta from the ancestor)
 * while `background-color` does not (so a dead token yields `transparent`). Both are rejected —
 * without this, a typo'd token name would silently become the highest-contrast pair in the suite.
 */
function resolved(token: string, prop: 'color' | 'backgroundColor'): [number, number, number] {
  const probe = document.createElement('span');
  probe.style[prop] = `var(${token})`;
  sentinelBox.appendChild(probe);
  const used = getComputedStyle(probe)[prop];
  probe.remove();

  const rgb = parseRgb(used);
  if (!rgb) throw new Error(`${token} did not resolve as a colour (${prop} = "${used}")`);
  if (used === SENTINEL) throw new Error(`${token} is undefined — ${prop} inherited the sentinel`);
  return rgb;
}

describe('theming: semantic colour contrast contract (#425, #744)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ContrastProbeHost] }).compileComponents();
    // Creating the host injects the compiled token stylesheet into the document.
    TestBed.createComponent(ContrastProbeHost);
    sentinelBox = document.createElement('div');
    // Inherited by every probe: a token that fails to resolve reads magenta instead of a
    // plausible-looking near-black, which is what makes `resolved()` able to tell them apart.
    sentinelBox.style.color = SENTINEL;
    document.body.appendChild(sentinelBox);
  });

  afterEach(() => {
    sentinelBox.remove();
    root.removeAttribute('data-theme');
  });

  it('resolves light-dark() to genuinely different arms per scheme (the liveness guard)', () => {
    // Everything below is vacuous if `data-theme` does not actually flip the resolved colour:
    // the two schemes would be the same measurement run twice. Assert the mechanism first.
    root.setAttribute('data-theme', 'light');
    const lightFg = resolved('--cae-color-on-surface', 'color');
    const lightBg = resolved('--cae-surface-base', 'backgroundColor');
    root.setAttribute('data-theme', 'dark');
    const darkFg = resolved('--cae-color-on-surface', 'color');
    const darkBg = resolved('--cae-surface-base', 'backgroundColor');

    expect(lightFg).not.toEqual(darkFg);
    expect(lightBg).not.toEqual(darkBg);
    // ...and in the direction that names which arm is which, so a swapped light-dark() is caught.
    expect(luminance(lightBg)).toBeGreaterThan(luminance(darkBg));
    expect(luminance(lightFg)).toBeLessThan(luminance(darkFg));
  });

  for (const scheme of SCHEMES) {
    describe(`${scheme} scheme`, () => {
      beforeEach(() => root.setAttribute('data-theme', scheme));

      for (const token of TEXT_FOREGROUNDS) {
        it(`${token} clears 4.5:1 as text on every surface`, () => {
          const fg = resolved(token, 'color');
          // Reported per surface so a failure names the binding one rather than just "it failed".
          const ratios = SURFACES.map((surface) => ({
            surface,
            ratio: contrast(fg, resolved(surface, 'backgroundColor')),
          }));
          const failing = ratios.filter((r) => r.ratio < TEXT_MIN);
          expect(
            failing.map((r) => `${r.surface} = ${r.ratio.toFixed(2)}:1`),
            `${token} is offered as a text foreground but fails WCAG 1.4.3 (4.5:1). ` +
              `Measured: ${ratios.map((r) => `${r.surface} ${r.ratio.toFixed(2)}`).join(', ')}. ` +
              `Darken the light arm (or lighten the dark arm) in _tokens.scss — do not widen this bound.`,
          ).toEqual([]);
        });
      }

      it('--cae-color-on-primary clears 4.5:1 on --cae-color-primary (the filled-control pair)', () => {
        // The one on-<role> pairing that is not "foreground on a surface": a filled button paints
        // its own container, so neither half of this pair appears in the loops above.
        const ratio = contrast(
          resolved('--cae-color-on-primary', 'color'),
          resolved('--cae-color-primary', 'backgroundColor'),
        );
        expect(ratio).toBeGreaterThanOrEqual(TEXT_MIN);
      });
    });
  }

  it('keeps the status colours in one deliberate band on the binding surface', () => {
    // `--cae-surface-sunken` is the darkest light surface and therefore the constraint that decides
    // every light arm (#744 — #425 had assumed `-base`, which is why its fix looked smaller than it
    // was). Pinning the *spread* catches a well-meaning tweak that fixes one colour into compliance
    // while leaving its siblings visually mismatched.
    root.setAttribute('data-theme', 'light');
    const sunken = resolved('--cae-surface-sunken', 'backgroundColor');
    const band = (['--cae-color-error', '--cae-color-success', '--cae-color-warn'] as const).map(
      (t) => contrast(resolved(t, 'color'), sunken),
    );

    for (const ratio of band) expect(ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(Math.max(...band) - Math.min(...band)).toBeLessThan(0.5);
  });
});
