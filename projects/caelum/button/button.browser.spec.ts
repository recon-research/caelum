/**
 * Real-browser verification for `cae-button`'s always-attached menu trigger (#992, via the #240
 * harness).
 *
 * **Why this file has to exist.** #992 collapsed the two-branch template, so `MatMenuTrigger` — and
 * its `click`/`mousedown`/`keydown` host listeners — now ride **every** `cae-button` in the library,
 * not only the ones with a menu bound. The claim that licenses that is "the listeners swallow
 * nothing on the null-menu path". `button.spec.ts` grades the flag (`defaultPrevented === false`)
 * and that is worth having, but the flag is not the property anyone cares about: the property is
 * that a plain button is still **focusable by pointer**, and jsdom is structurally unable to observe
 * it — `HTMLElement.click()` there does not focus at all, so a jsdom arm asserting focus-after-click
 * passes or fails for reasons unrelated to the code under test.
 *
 * The concrete regression this guards: `preventDefault()` on `mousedown` suppresses the browser's
 * focus-on-click. Every `cae-button` would become clickable-but-never-pointer-focusable — WCAG
 * 2.4.7, and the mirror image of the 2.4.3 strand #992 removed. Material only `preventDefault`s
 * `mousedown` when `triggersSubmenu()` is true (`menu.mjs` `_handleMousedown`), which needs a
 * self-injected `MatMenuItem` that `cae-button`'s inner `<button>` never carries — so the shipped
 * code is correct and this file is the oracle that keeps it that way.
 *
 * The ARIA half of the contract (all three attributes absent without a menu, `aria-expanded` on the
 * bound-and-closed resting state, `aria-controls` resolving to a rendered panel) is behavioural and
 * stays in `button.spec.ts`, where it runs on every push.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';

import { CaeButton } from './button';
import { CaeMenu, CaeMenuItem } from '../menu/menu';
import { loadCaelumTheme } from '../testing/theme';

@Component({
  imports: [CaeButton, CaeMenu],
  template: `
    <cae-menu #m [items]="items" />
    <cae-button>Plain</cae-button>
    <cae-button [menuTriggerFor]="hasMenu() ? m : undefined">Actions</cae-button>
  `,
})
class ButtonBrowserHost {
  items: CaeMenuItem[] = [{ value: 'a', label: 'Alpha' }];
  readonly hasMenu = signal(true);
}

describe('CaeButton — always-attached trigger (real browser, #992)', () => {
  let fixture: ComponentFixture<ButtonBrowserHost>;

  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('cae-button button'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ButtonBrowserHost] }).compileComponents();
    // AFTER configureTestingModule — it creates a probe component, which instantiates the module
    // (the same ordering popover.browser.spec.ts records).
    await loadCaelumTheme();
    // Attached to the document: a detached fixture cannot take focus at all, which would make
    // every assertion below pass for the wrong reason.
    fixture = TestBed.createComponent(ButtonBrowserHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('keeps a menu-less button pointer-focusable — the attached trigger does not eat mousedown', async () => {
    const [plain] = buttons();
    // Guard the claim's input twice over: the trigger must really be attached (else this is
    // vacuous), and focus must start somewhere else (else `activeElement` was already right).
    expect(plain.classList.contains('mat-mdc-menu-trigger')).toBe(true);
    expect(plain.hasAttribute('aria-haspopup')).toBe(false);
    expect(document.activeElement).not.toBe(plain);

    // A TRUSTED click, not a synthetic MouseEvent — an untrusted event runs no default action, so
    // `dispatchEvent` + `.focus()` would grade nothing. Chromium focuses a <button> as the default
    // action of `mousedown`, so this passes only while nothing preventDefaults it.
    await userEvent.click(plain);
    expect(document.activeElement).toBe(plain);
  });

  it('keeps the bound button pointer-focusable too, and focus survives losing the menu', async () => {
    const [, bound] = buttons();
    expect(bound.getAttribute('aria-haspopup')).toBe('menu');
    bound.focus();
    expect(document.activeElement).toBe(bound);

    // The live→unbound flip, in a browser: one element, so focus cannot be stranded by an element
    // swap. jsdom pins the same claim; here it is graded against a real focus implementation.
    fixture.componentInstance.hasMenu.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(buttons()[1]).toBe(bound);
    expect(bound.isConnected).toBe(true);
    expect(document.activeElement).toBe(bound);
    expect(bound.hasAttribute('aria-haspopup')).toBe(false);
  });
});
