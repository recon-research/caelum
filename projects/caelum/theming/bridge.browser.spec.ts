/**
 * The token bridge is *bound* — `--mat-sys-*` ← `--cae-*` (D-04, Book 04 §3.2); teeth for #510.
 *
 * **The invariant.** `_theme.scss` declares one direction of authority: Caelum's semantic tokens are
 * the source, and Material's system seam is re-pointed at them through `mat.theme-overrides()`. The
 * promise that buys is *"a Material component resolving `var(--mat-sys-surface)` and a built `cae-*`
 * component resolving `var(--cae-surface-base)` land on the SAME computed value"* — which is what
 * lets one edit to a `--cae-*` token move Material's controls and Caelum's own styles together.
 *
 * **Why it needed teeth.** That mixin ignores unknown keys silently — the override block's own
 * comment calls this out as the reason the list is "safe to evolve". It cuts the other way too: a
 * renamed or dropped key fails *silently*, and the seam reverts to Material's built-in default. The
 * result is not a crash or a blank control but a subtle two-tone theme, where Material's own menus
 * and overlays drift a shade away from the components Caelum builds beside them. Nothing else in the
 * suite can see it: `theme.browser.spec.ts` asserts only that `--mat-sys-primary` is *non-empty*
 * (true of Material's default too), axe judges contrast rather than provenance, and the VR goldens
 * cover neither of the two components #510 migrated.
 *
 * **Why a browser spec.** Same reason as `contrast.browser.spec.ts`: a custom property computes as a
 * token stream, so reading `--mat-sys-on-surface` off `:root` returns the literal
 * `var(--cae-color-on-surface)` and comparing it to `--cae-color-on-surface`'s own literal
 * (`light-dark(#1a1c1e, #e6e7ea)`) compares two *unresolved strings* — a test that fails while the
 * bridge is perfectly healthy. Only a **used** value answers the question, and `light-dark()`
 * resolves only where a token is consumed in a colour context.
 *
 * **The vacuity trap, again (#724/#736/#425).** If the theme fails to load at all, *both* halves of
 * every pair below become undefined — and undefined-equals-undefined passes, hardest, forever. So
 * each read goes through a resolver that rejects the property's fallback state rather than scoring
 * it: `color` inherits (a dead token reads as the ancestor's sentinel magenta) and `border-radius`
 * does not (a dead token reads as its initial `0px`). Both are thrown on, never compared.
 */
import { TestBed } from '@angular/core/testing';

import { loadCaelumTheme } from '../testing/theme';

/** One `mat.theme-overrides()` entry, as a pair of tokens that must resolve to the same value. */
interface BridgePair {
  /** Material's system-seam property, as its components read it. */
  readonly mat: string;
  /** The Caelum token it is re-pointed at. */
  readonly cae: string;
}

/**
 * Every colour key in `_theme.scss`'s override block, transcribed one-for-one.
 *
 * Two Material roles deliberately collapse onto a single Caelum token (`surface-container` and
 * `-container-high` both → `--cae-surface-raised`; `outline` and `outline-variant` both →
 * `--cae-color-border`) — Caelum ships a three-step surface ramp and one border colour, so this is
 * the intended narrowing, not an oversight. Listing both arms keeps that explicit: if one of them is
 * ever given its own token, this file is where the decision surfaces.
 */
const COLOR_PAIRS: readonly BridgePair[] = [
  { mat: '--mat-sys-primary', cae: '--cae-color-primary' },
  { mat: '--mat-sys-on-primary', cae: '--cae-color-on-primary' },
  { mat: '--mat-sys-surface', cae: '--cae-surface-base' },
  { mat: '--mat-sys-surface-container', cae: '--cae-surface-raised' },
  { mat: '--mat-sys-surface-container-high', cae: '--cae-surface-raised' },
  { mat: '--mat-sys-on-surface', cae: '--cae-color-on-surface' },
  { mat: '--mat-sys-on-surface-variant', cae: '--cae-color-on-surface-variant' },
  { mat: '--mat-sys-outline', cae: '--cae-color-border' },
  { mat: '--mat-sys-outline-variant', cae: '--cae-color-border' },
  { mat: '--mat-sys-error', cae: '--cae-color-error' },
];

/**
 * The one non-colour key in the map. It is checked through `border-radius` rather than `color`
 * because a length in a colour context is invalid at computed-value time — which the resolver would
 * (correctly) report as a dead token.
 *
 * `--mat-sys-corner-extra-small` is pointedly **not** here: it is absent from the override block, so
 * it still carries Material's own default. #510 measured that default at `4px`, identical to
 * `--cae-radius-sm`, which is what made migrating `cae-context-menu`'s panel radius a pixel-exact
 * rename rather than a restyling. Asserting that coincidence *here* would pin an upstream constant
 * Caelum no longer reads — a test that fails on a Material release without a Caelum defect. The
 * measurement belongs to the migration; only bound keys belong to this file.
 */
const LENGTH_PAIRS: readonly BridgePair[] = [
  { mat: '--mat-sys-corner-medium', cae: '--cae-radius-md' },
];

const SCHEMES = ['light', 'dark'] as const;

const SENTINEL = 'rgb(255, 0, 255)';
const root = document.documentElement;
let sentinelBox: HTMLElement;

/**
 * Resolves `token` as a **used** colour.
 *
 * The probe inherits `sentinelBox`'s magenta, so a token that does not resolve leaves the
 * declaration invalid at computed-value time and `color` falls back to that inherited sentinel —
 * distinguishable from any real value. Without it, an unloaded theme makes every pair below
 * trivially equal.
 */
function usedColor(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  sentinelBox.appendChild(probe);
  const used = getComputedStyle(probe).color;
  probe.remove();

  if (used === SENTINEL) throw new Error(`${token} is undefined — color inherited the sentinel`);
  if (!/^rgba?\(/.test(used)) throw new Error(`${token} did not resolve as a colour ("${used}")`);
  return used;
}

/**
 * Resolves `token` as a **used** length, via a property that actually takes one.
 *
 * `border-radius` does not inherit, so the sentinel trick above is unavailable: a dead token here
 * falls back to the property's initial `0px`. That *is* the guard — no radius token Caelum ships is
 * zero, so `0px` can only mean the token failed to resolve.
 */
function usedRadius(token: string): string {
  const probe = document.createElement('span');
  probe.style.borderRadius = `var(${token})`;
  sentinelBox.appendChild(probe);
  const used = getComputedStyle(probe).borderTopLeftRadius;
  probe.remove();

  if (used === '0px') throw new Error(`${token} is undefined — border-radius fell back to 0px`);
  return used;
}

describe('theming: the --mat-sys-* ← --cae-* bridge is bound (#510)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    // Stands up `_theme.scss` — both halves: the `--cae-*` tokens AND Material's `--mat-sys-*` seam.
    loadCaelumTheme();
    sentinelBox = document.createElement('div');
    sentinelBox.style.color = SENTINEL;
    document.body.appendChild(sentinelBox);
  });

  afterEach(() => {
    sentinelBox.remove();
    root.removeAttribute('data-theme');
  });

  it('resolves the seam to real, scheme-dependent values (the liveness guard)', () => {
    // Everything below compares two reads of the same document, so it would pass if the theme were
    // absent *and* the resolvers were toothless. Assert the mechanism itself first: the seam must
    // carry a colour that actually changes when the scheme flips.
    root.setAttribute('data-theme', 'light');
    const light = usedColor('--mat-sys-surface');
    root.setAttribute('data-theme', 'dark');
    const dark = usedColor('--mat-sys-surface');

    expect(light).not.toEqual(dark);
  });

  for (const scheme of SCHEMES) {
    describe(`${scheme} scheme`, () => {
      beforeEach(() => root.setAttribute('data-theme', scheme));

      for (const { mat, cae } of COLOR_PAIRS) {
        it(`${mat} resolves to ${cae}`, () => {
          expect(
            usedColor(mat),
            `The bridge no longer binds ${mat} to ${cae}, so Material's own components and ` +
              `Caelum's built components will render different colours for the same role. ` +
              `Check the mat.theme-overrides() block in styles/_theme.scss — it ignores unknown ` +
              `keys silently, so a rename upstream removes a binding without any error.`,
          ).toEqual(usedColor(cae));
        });
      }

      for (const { mat, cae } of LENGTH_PAIRS) {
        it(`${mat} resolves to ${cae}`, () => {
          expect(usedRadius(mat)).toEqual(usedRadius(cae));
        });
      }
    });
  }
});
