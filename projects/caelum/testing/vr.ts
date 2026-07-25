/**
 * Visual-regression arm harness (#732).
 *
 * **Dev/test ONLY** — like {@link ../testing/a11y.ts} and {@link ../testing/theme.ts}, this file
 * lives outside every secondary entry point (no `ng-package.json`) and never reaches the published
 * package.
 *
 * **What this exists to catch.** Caelum's theming is token-only (D-04) and the density work (#411)
 * re-scales a whole component set under one `[data-density]` selector. Nothing else in the suite
 * can see that a token change broke a component's *appearance* in one arm: axe (#690/#691) checks
 * contrast, and the `*.browser.spec.ts` layer (#405) checks named behaviours. Pixels are the only
 * instrument for "the compact arm silently stopped applying".
 *
 * **The four arms** are the cross product the tokens actually branch on — `_tokens.scss` declares
 * `:root[data-theme='light'|'dark']` (which flips `color-scheme`, hence every `light-dark()`) and
 * `:root[data-density='compact']`. Comfortable is the unattributed default, so it is expressed
 * here as `density: null` rather than a third value that does not exist in the stylesheet.
 */
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';

import { loadCaelumTheme } from './theme';

/** One point in the scheme x density cross product. `density: null` is the unattributed default. */
export interface VrArm {
  /** Stable, filesystem-safe arm name — it becomes part of the golden's filename. */
  readonly name: string;
  readonly theme: 'light' | 'dark';
  readonly density: 'compact' | null;
}

/** The arms every visual-regression spec sweeps. Order is fixed so golden names are stable. */
export const VR_ARMS: readonly VrArm[] = [
  { name: 'light-comfortable', theme: 'light', density: null },
  { name: 'light-compact', theme: 'light', density: 'compact' },
  { name: 'dark-comfortable', theme: 'dark', density: null },
  { name: 'dark-compact', theme: 'dark', density: 'compact' },
];

const STILL_ID = 'cae-vr-still';

/**
 * The typeface every golden is rasterized in.
 *
 * **Not** the shipped stack. `_tokens.scss` asks for `Roboto, system-ui, -apple-system, 'Segoe UI',
 * sans-serif`, and *none of those is guaranteed installed* — so the generic tail decides, and
 * fontconfig answers differently on every machine. Measured (#735): this dev box resolves
 * `sans-serif` to **Noto Sans**, the `mcr.microsoft.com/playwright` image resolves it to
 * **WenQuanYi Zen Hei** (a CJK face). Not a hinting difference — an entirely different typeface,
 * which no pixel tolerance could ever absorb.
 *
 * So VR pins a face both environments actually have rather than trusting the cascade. This makes
 * goldens portable at the cost of not rasterizing the *shipped* font — an acceptable trade,
 * because this suite exists to catch **token** regressions (colour, spacing, elevation, density),
 * and pinning the text away from the cascade is what keeps those signals from drowning in font
 * noise. Font-stack changes are a `_tokens.scss` concern, not a per-component one.
 */
const VR_FONT = "'Liberation Sans', sans-serif";
const VR_FONT_MONO = "'Liberation Mono', monospace";

/**
 * Kills everything that makes a capture depend on *when* it was taken.
 *
 * Vitest retries until two consecutive captures agree, which handles a one-shot transition but
 * never converges on a looping animation (a progress spinner) and cannot help with a blinking
 * caret. Rather than special-case those per spec, the whole document is frozen: no animation, no
 * transition, no caret, and Material's ripples suppressed at the source.
 *
 * `!important` and the `*` reach are deliberate — this stylesheet must beat component styles, and
 * it only ever exists inside a VR test document.
 *
 * **It must be re-appended on every arm, not created once.** The font pin is a plain `:root`
 * custom-property declaration, so it wins only by document order — and Angular re-injects the theme
 * stylesheet on each `TestBed` reset, landing it *after* this one. An early `return` when the
 * element already existed therefore surrendered the cascade from the second test onward. Measured:
 * `--cae-font-body` read `'Liberation Sans'` in the first arm and reverted to the shipped
 * `Roboto, system-ui, …` stack in the other three, so **three of every four goldens were rasterized
 * in an unpinned font** — the exact failure #735 exists to prevent, and invisible on one machine
 * because it takes a *second* environment to turn an unpinned stack into different pixels.
 * `appendChild` on an existing child moves it, so this stays one element.
 */
function freezeMotion(): void {
  const existing = document.getElementById(STILL_ID);
  if (existing) {
    document.head.appendChild(existing);
    return;
  }
  const style = document.createElement('style');
  style.id = STILL_ID;
  style.textContent = `
    :root {
      --cae-font-body: ${VR_FONT};
      --cae-font-heading: ${VR_FONT};
      --cae-font-mono: ${VR_FONT_MONO};
      --mat-sys-body-large-font: ${VR_FONT};
      --mat-sys-body-medium-font: ${VR_FONT};
      --mat-sys-body-small-font: ${VR_FONT};
      --mat-sys-label-large-font: ${VR_FONT};
      --mat-sys-label-medium-font: ${VR_FONT};
      --mat-sys-label-small-font: ${VR_FONT};
      --mat-sys-title-large-font: ${VR_FONT};
      --mat-sys-title-medium-font: ${VR_FONT};
      --mat-sys-title-small-font: ${VR_FONT};
      --mat-sys-headline-large-font: ${VR_FONT};
      --mat-sys-headline-medium-font: ${VR_FONT};
      --mat-sys-headline-small-font: ${VR_FONT};
      --mat-sys-display-large-font: ${VR_FONT};
      --mat-sys-display-medium-font: ${VR_FONT};
      --mat-sys-display-small-font: ${VR_FONT};
    }
    *, *::before, *::after {
      animation-delay: 0s !important;
      animation-duration: 0s !important;
      transition-delay: 0s !important;
      transition-duration: 0s !important;
      caret-color: transparent !important;
    }
    .mat-ripple, .mat-mdc-focus-indicator { display: none !important; }
  `;
  document.head.appendChild(style);
}

/**
 * Puts the document into `arm` and stands the real token layer up.
 *
 * Call **before** creating the component, so the first paint is already in the right arm — an
 * attribute flipped afterwards would be captured mid-restyle. Pair with {@link resetArm} in
 * `afterEach`: the attributes live on `document.documentElement`, which outlives the fixture.
 */
export function applyArm(arm: VrArm): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', arm.theme);
  if (arm.density) root.setAttribute('data-density', arm.density);
  else root.removeAttribute('data-density');
  // `loadCaelumTheme()` stands up the whole bridge — tokens AND Material's `--mat-sys-*` seam.
  // It loaded only the token layer until #736, which is why this file briefly carried its own
  // full-theme host; that duplicate is gone.
  loadCaelumTheme();
  freezeMotion();
}

/** Clears the arm attributes. The frozen-motion stylesheet is left in place — it is inert. */
export function resetArm(): void {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-density');
}

/**
 * Retry budget for the *outer* `expect.element()` poll — deliberately tiny.
 *
 * `expect.element()` is `expect.poll()` underneath: it re-runs the whole matcher until it passes.
 * For this suite that is redundant and actively harmful. Settling is already handled one layer
 * down by `toMatchScreenshot`'s own `timeout` (which polls for a *stable frame*), and `freezeMotion`
 * guarantees a stable frame on the first capture — so an outer retry can only re-take a screenshot
 * that differs in exactly the same way, then do it again.
 *
 * **Measured**, with a genuine one-unit token regression (`--cae-blue-40` `#1565c0`→`#1565c1`):
 * at the inherited default a mismatch took **15093ms** and reported as `Test timed out in 15000ms`
 * — a real regression wearing the costume of a hung test. Capped, the same mismatch reports in
 * **~400ms** as `Screenshot does not match the stored reference.` Across a suite this is the
 * difference between minutes of silence and an immediate answer that names the problem.
 *
 * This cannot cause a false failure: the first attempt always runs to completion, and the budget
 * only decides whether to run a *second* one. It belongs here rather than in `vitest-vr.config.ts`
 * because `test.expect.poll.timeout` was measured to have no effect through the Angular builder.
 */
const VR_POLL = { timeout: 250 } as const;

/**
 * Captures `el` and compares it against the golden named `name`.
 *
 * Every `*.vr.spec.ts` goes through here rather than calling `expect.element(…)` directly, so the
 * poll budget above is applied once instead of being restated (or forgotten) per spec.
 */
export async function matchArm(el: HTMLElement, name: string): Promise<void> {
  await expect.element(el, VR_POLL).toMatchScreenshot(name);
}

/**
 * Mounts `host` in `arm` and returns its root element, sized to `width` so the golden's dimensions
 * come from the harness rather than from whatever the viewport happened to be.
 *
 * The fixture is attached to the document (Vitest screenshots a real element, so a detached
 * fixture would capture nothing) and painted with Caelum's own base surface.
 *
 * **That background must be a real token.** It first read `var(--cae-color-surface)` — a name
 * `_tokens.scss` has never defined (the surface ramp is `--cae-surface-base|raised|sunken`). An
 * undefined custom property is invalid at computed-value time, so the declaration dropped and the
 * element was transparent; the goldens looked opaque only because `color-scheme: dark` makes
 * Chromium paint its *UA canvas* `#121212` behind them. Every dark golden therefore pictured the
 * library against a surface the library does not ship (`--cae-surface-base` dark is `#121316`),
 * and no assertion could have noticed — the same shape as #736. The foreground is pinned from the
 * token for the same reason: any text a host stamps outside a Material component would otherwise
 * take the UA's scheme-derived default rather than Caelum's `--cae-color-on-surface`.
 */
export function renderArm<T>(host: Type<T>, arm: VrArm, width = 480): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [host] });
  applyArm(arm);

  const fixture = TestBed.createComponent(host);
  const el = fixture.nativeElement as HTMLElement;
  el.style.width = `${width}px`;
  el.style.padding = '16px';
  // The app-shell text contract, mirroring Forge's `body` rule. Caelum deliberately does not style
  // a consumer's `body`, and Material only fonts the text it owns (a card's title and subtitle have
  // tokens; its *content* has none and simply inherits). With no shell, inherited text fell through
  // to the UA default — measured: `cae-card` body copy rasterized in **serif** while its title was
  // sans. That is not a library defect, but it made the goldens picture text no consumer will see,
  // and it quietly escaped #735's portability guarantee: the UA serif is Liberation Serif here and
  // something else in the Playwright image, so those pixels were never actually pinned.
  el.style.background = 'var(--cae-surface-base)';
  el.style.color = 'var(--cae-color-on-surface)';
  el.style.fontFamily = 'var(--cae-font-body)';
  el.style.fontSize = 'var(--cae-text-md)';
  el.style.lineHeight = 'var(--cae-line-body)';
  document.body.appendChild(el);
  fixture.detectChanges();
  return el;
}
