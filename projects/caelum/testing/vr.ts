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
import { Component, Type, ViewEncapsulation } from '@angular/core';
import { TestBed } from '@angular/core/testing';

/**
 * Stands up the **whole** bridge, not just the token layer.
 *
 * `loadCaelumTheme()` (#724) loads `_tokens.scss`, which emits the `--cae-*` custom properties —
 * enough for a Caelum-authored style that reads one directly. It is **not** enough to render a
 * Material-backed component: `_tokens.scss` defines zero `--mat-sys-*`, and it is `_theme.scss`'s
 * `mat.theme()` call that emits Material's system seam. Material ships each component's CSS with
 * the component, so those rules are present either way — they just resolve every colour and font
 * against a missing custom property and fall back to the initial value.
 *
 * Measured, not assumed: with only `_tokens.scss` loaded, `cae-button`'s filled/tonal/elevated
 * variants screenshot as bare serif text on a transparent background, and only `outlined` shows
 * anything at all. That is the whole component set rendering unstyled.
 *
 * `_theme.scss` `@use`s `tokens`, so this is a superset — there is no need to load both.
 */
@Component({
  selector: 'cae-vr-theme-host',
  template: '',
  styleUrl: '../styles/_theme.scss',
  encapsulation: ViewEncapsulation.None,
})
class CaeVrThemeHost {}

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
 */
function freezeMotion(): void {
  if (document.getElementById(STILL_ID)) return;
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
  TestBed.createComponent(CaeVrThemeHost);
  freezeMotion();
}

/** Clears the arm attributes. The frozen-motion stylesheet is left in place — it is inert. */
export function resetArm(): void {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-density');
}

/**
 * Mounts `host` in `arm` and returns its root element, sized to `width` so the golden's dimensions
 * come from the harness rather than from whatever the viewport happened to be.
 *
 * The fixture is attached to the document (Vitest screenshots a real element, so a detached
 * fixture would capture nothing) and given an opaque background — a transparent PNG would compare
 * equal in light and dark, making the scheme arms vacuous.
 */
export function renderArm<T>(host: Type<T>, arm: VrArm, width = 480): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [host] });
  applyArm(arm);

  const fixture = TestBed.createComponent(host);
  const el = fixture.nativeElement as HTMLElement;
  el.style.width = `${width}px`;
  el.style.padding = '16px';
  el.style.background = 'var(--cae-color-surface)';
  document.body.appendChild(el);
  fixture.detectChanges();
  return el;
}
