/**
 * Loads Caelum's **real** theme into a test document (#724, completed by #736).
 *
 * **Dev/test ONLY** — like `a11y.ts`, this file lives outside every secondary entry point
 * (no `ng-package.json`) and is excluded from the library build.
 *
 * **Why this exists.** The `caelum:test-browser` target has no `styles` option (the
 * `@angular/build:unit-test` builder doesn't take one), so a browser test page carries no
 * theme at all. Everything that reads a token then goes *invalid at computed-value time*
 * and falls back to the property's initial value — measurably: before this helper,
 * `.cae-data-grid` computed `border: 0px` / `border-radius: 0px` from
 * `1px solid var(--cae-color-border)` / `var(--cae-radius-md)`.
 *
 * That silently hollows out the single biggest reason to run axe in a real browser
 * (`a11y.ts` header, #240): **`color-contrast`** was being evaluated against unstyled
 * defaults (near-black on white), so it passed trivially and tested no colour Caelum
 * actually ships. Note the failure mode precisely — axe does **not** report the rule as
 * `incomplete` in a browser; it judges the wrong colours and passes. "The rule ran" is
 * therefore not evidence of anything (`theme.browser.spec.ts` pins this).
 *
 * **Load the whole bridge, not the token layer.** #724 originally loaded `_tokens.scss`,
 * which emits the `--cae-*` properties and **zero** `--mat-sys-*`. Since Caelum is a library
 * of Direct wrappers, that left nearly every shipped component resolving its colour and font
 * against an undefined property: `cae-button` rendered as bare serif text with no container
 * on four of five variants (found via the visual-regression suite, #732). `_theme.scss` is
 * where `mat.theme()` emits Material's seam, and it `@use`s `tokens`, so it is a strict
 * superset — hence this loads it and no caller needs both.
 *
 * **How.** Same mechanism `theming/density.spec.ts` established for jsdom: a host component
 * with {@link ViewEncapsulation.None} whose `styleUrl` compiles the real bridge. Angular
 * compiles the Sass and, unscoped, its `:root`/`html` rules land on the document element. The
 * values are therefore the *compiled* ones, never a hand-copied guess.
 *
 * **Why a fixture rather than `_theme.scss` directly (#413, D-757).** The bridge is now
 * mixin-only, so compiling `_theme.scss` on its own emits the token layer and **zero
 * `--mat-sys-*`** — the #724 failure above, silently restored. `_theme-probe.scss` is the real
 * adoption line (`@use … as caelum; @include caelum.theme();`), so this helper both loads the
 * whole bridge and pins the contract D-757 committed to.
 *
 * **Read the *used* value, not the custom property.** A custom property computes as a token
 * stream, so `themeToken('--cae-color-on-surface')` returns the literal
 * `light-dark(#1a1c1e, #e6e7ea)` — in Chromium exactly as in jsdom. `light-dark()` resolves
 * only where the token is *consumed* in a colour context, so the real check is
 * `getComputedStyle(el).color` — which is also precisely what axe reads for `color-contrast`.
 * Use {@link themeToken} for presence; use a used-value read for the colour itself.
 *
 * ```ts
 * loadCaelumTheme();                                     // before creating the component
 * expect(themeToken('--cae-color-border')).not.toBe(''); // the liveness guard
 * expect(themeToken('--mat-sys-primary')).not.toBe('');  // ...and Material's half (#736)
 * expect(getComputedStyle(el).color).toMatch(/^rgb/);    // the resolved colour
 * ```
 */
import { Component, ViewEncapsulation } from '@angular/core';
import { TestBed } from '@angular/core/testing';

@Component({
  selector: 'cae-theme-probe-host',
  template: '',
  styleUrl: './_theme-probe.scss',
  encapsulation: ViewEncapsulation.None,
})
class CaeThemeProbeHost {}

/**
 * Stands the token layer up in the current test document by creating a host whose global
 * stylesheet is the compiled `_tokens.scss`. Call it **after** `TestBed.configureTestingModule`
 * and **before** creating the component under test, so the tokens are already resolvable on
 * first render (a stylesheet arriving later would leave the first paint untokened).
 *
 * Idempotent per TestBed instance — Angular injects a given component's styles once.
 */
export function loadCaelumTheme(): void {
  TestBed.createComponent(CaeThemeProbeHost);
}

/**
 * Reads a resolved custom property off `:root`. Returns `''` when the token is absent, which
 * is exactly the failure {@link loadCaelumTheme} exists to prevent — assert against it so a
 * config change that silently un-loads the theme fails a test instead of quietly making every
 * colour assertion vacuous again.
 */
export function themeToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
