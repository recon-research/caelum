/**
 * Real-browser verification for `cae-listbox` (#405).
 *
 * **The claim under test.** The component's doc block leans the whole a11y story on Material:
 * *"`mat-selection-list` is `role="listbox"` with the WAI-ARIA roving-tabindex + arrow-key
 * navigation built in (verify real-browser at M4, like #41/#79)"* — and then builds a second,
 * Caelum-specific decision on top of it:
 *
 * > *"Because the list navigates by roving tabindex — focus moves onto the OPTION, never the
 * > listbox host — the description is forwarded onto each focusable option … where a screen
 * > reader reads it on focus."*
 *
 * That is the part worth a browser. `ariaDescribedby` is forwarded per-option **because** focus
 * lands on options; if the rove ever moved focus to the host instead, the forwarding would be both
 * pointless and wrong (the description would never be announced). The two are asserted together
 * here so the premise cannot quietly stop being true while the code that depends on it remains.
 *
 * **Why jsdom couldn't.** `listbox.spec.ts` says so itself: *"The one thing jsdom can't exercise
 * is the WAI-ARIA roving-tabindex arrow-key navigation between options (that needs a real
 * focus/keyboard environment)"*. Keys here are delivered by Playwright to the real focused
 * element, and `document.activeElement` is the browser's own.
 *
 * Run it: `npm run test:browser`.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';

import { CaeListbox, type CaeListboxOption } from './listbox';
import { expectNoA11yViolations } from '../testing/a11y';
import { loadCaelumTheme, themeToken } from '../testing/theme';

/**
 * A disabled option sits in the *middle* on purpose: it is the only arrangement that can tell
 * "the rove skips disabled options" apart from "the rove happens to stop early".
 */
const OPTIONS: readonly CaeListboxOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie', disabled: true },
  { value: 'd', label: 'Delta' },
];

@Component({
  imports: [CaeListbox],
  template: `
    <p id="hint">Pick one flight</p>
    <cae-listbox [options]="options" ariaLabel="Flights" ariaDescribedby="hint" />
  `,
})
class ListboxHost {
  readonly options = OPTIONS;
}

describe('CaeListbox (real browser)', () => {
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ListboxHost] });
    loadCaelumTheme();
    const fixture = TestBed.createComponent(ListboxHost);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  const listbox = () => el.querySelector<HTMLElement>('[role="listbox"]')!;
  const options = () => Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
  const labelOf = (n: Element | null) => n?.textContent?.trim();
  const active = () => document.activeElement?.closest('[role="option"]') ?? null;
  const byLabel = (label: string) => options().find((o) => labelOf(o) === label)!;

  it('resolves the real token layer, so the rendered list is the one Caelum ships', () => {
    expect(themeToken('--cae-focus-ring')).not.toBe('');
    expect(options()).toHaveLength(OPTIONS.length);
  });

  it('is a listbox of options with an accessible name', () => {
    expect(listbox().getAttribute('aria-label')).toBe('Flights');
    expect(options().map(labelOf)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('exposes a single roving tab stop across the options', () => {
    const tabbable = options().filter((o) => o.getAttribute('tabindex') === '0');
    const roved = options().filter((o) => o.getAttribute('tabindex') === '-1');

    expect(tabbable).toHaveLength(1);
    expect(roved).toHaveLength(options().length - 1);
    // The host is not itself a tab stop — the rove owns the tabbing, and the host must not add a
    // second stop in front of it.
    expect(listbox().getAttribute('tabindex')).not.toBe('0');
  });

  it('moves real focus onto the OPTION, never the listbox host', async () => {
    byLabel('Alpha').focus();
    expect(active()).toBe(byLabel('Alpha'));

    await userEvent.keyboard('{ArrowDown}');

    // The premise the `ariaDescribedby` forwarding depends on: the focused element is an option.
    expect(labelOf(active())).toBe('Bravo');
    expect(document.activeElement).not.toBe(listbox());
    expect(document.activeElement?.getAttribute('role')).toBe('option');
  });

  it('forwards the description onto the element that actually receives focus', () => {
    // Paired with the test above deliberately: per-option forwarding is only correct while focus
    // lands on options. Assert the forwarding reaches every option, including the disabled one —
    // it is still announced when reached.
    for (const option of options()) {
      expect(option.getAttribute('aria-describedby')).toContain('hint');
    }
    // …and the description element it points at really exists, so this isn't a dangling id.
    expect(el.querySelector('#hint')).not.toBeNull();
  });

  it('wraps at both ends rather than dead-ending', async () => {
    // Measured, not assumed — this file first asserted the opposite. Material's list key manager
    // runs with wrapping ON, which the APG lists as an allowed listbox behaviour, so Up from the
    // first option lands on the last. Pinned here because it is a user-visible contract that a
    // Material upgrade could flip silently, and nothing else in the suite would notice.
    byLabel('Alpha').focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(labelOf(active())).toBe('Delta');

    await userEvent.keyboard('{ArrowDown}');
    expect(labelOf(active())).toBe('Alpha');
  });

  it('still roves onto a disabled option, so it is announced rather than skipped', async () => {
    // The aria-disabled-focusable pattern Caelum states for the sibling tree model: a disabled
    // entry "stays focusable, so roving keyboard still reaches it and a screen reader announces
    // it". Charlie sits between Bravo and Delta precisely so a skip would be visible here.
    byLabel('Bravo').focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(labelOf(active())).toBe('Charlie');
    expect(byLabel('Charlie').getAttribute('aria-disabled')).toBe('true');
  });

  it('jumps to the ends with Home/End', async () => {
    byLabel('Bravo').focus();
    await userEvent.keyboard('{End}');
    expect(labelOf(active())).toBe('Delta');

    await userEvent.keyboard('{Home}');
    expect(labelOf(active())).toBe('Alpha');
  });

  it('has no axe violations, no rules disabled', async () => {
    await expectNoA11yViolations(el);
  });
});
