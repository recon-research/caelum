import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeAlert, CaeAlertPoliteness, CaeAlertSeverity } from './alert';
import { expectNoA11yViolations } from '../testing/a11y';

/** The component's compiled style sheet — the only place jsdom can see a CSS claim (it paints nothing). */
const compiledStyles = (): string =>
  (CaeAlert as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('\n');

/**
 * Match a rule body for `selector`, tolerating the `[_ngcontent-%COMP%]` attribute that emulated
 * encapsulation stamps between the selector and its brace. A plain `/\.foo\s*\{/` silently matches
 * NOTHING against compiled styles — which quietly turns every `not.toMatch` built on it into a
 * vacuous pass, so this helper is what gives the negative assertions below their teeth.
 */
const ruleFor = (selector: string, body: string): RegExp =>
  new RegExp(`${selector.replace(/[.]/g, '\\.')}(\\[[^\\]]*\\])?\\s*\\{[^}]*${body}`);

/**
 * Which shape of focus target to bind — the input documents three, so all three are exercised, plus
 * `'signal'`: the one shape the input does NOT document and cannot type-check (#865).
 */
type TargetMode = 'element' | 'elementRef' | 'signal' | 'none';

@Component({
  imports: [CaeAlert],
  template: `
    <h2 #landing [attr.tabindex]="targetFocusable() ? -1 : null">Settings</h2>
    <cae-alert
      [severity]="severity()"
      [politeness]="politeness()"
      [severityLabel]="severityLabel()"
      [dismissible]="dismissible()"
      [closeAriaLabel]="closeAriaLabel()"
      [(visible)]="visible"
      [dismissFocusTarget]="target()"
      (visibleChange)="onVisibleChange()"
    >
      {{ message() }}
    </cae-alert>
  `,
})
class AlertHost {
  readonly landingQuery = viewChild<ElementRef<HTMLElement>>('landing');
  readonly severity = signal<CaeAlertSeverity | (string & {})>('info');
  readonly politeness = signal<CaeAlertPoliteness | undefined>(undefined);
  readonly severityLabel = signal<string | null | undefined>(undefined);
  readonly dismissible = signal(false);
  readonly closeAriaLabel = signal('Close');
  readonly visible = signal(true);
  readonly targetMode = signal<TargetMode>('element');
  /** Drops `tabindex="-1"` from the landing element, making it an unfocusable target. */
  readonly targetFocusable = signal(true);
  readonly message = signal('Something happened.');
  /** What `visible()` read at the moment `(visibleChange)` fired — the model-coherence oracle. */
  visibleAtEmit: boolean | null = null;
  changeCount = 0;

  /** The landing element in whichever shape the test asked for. */
  protected target(): HTMLElement | ElementRef<HTMLElement> | null {
    const ref = this.landingQuery();
    if (!ref || this.targetMode() === 'none') return null;
    if (this.targetMode() === 'elementRef') return ref;
    if (this.targetMode() === 'signal') {
      // The un-typechecked shape (#865): a consumer binding the viewChild SIGNAL rather than its
      // result. The cast is load-bearing, not laziness — Caelum compiles with strictTemplates since
      // #858, so this binding CANNOT be written honestly in this repo. What it stands in for is a
      // consumer app with strictTemplates off, or a JavaScript consumer with no checking at all,
      // which is the only population the runtime guard exists to protect.
      return this.landingQuery as unknown as HTMLElement;
    }
    return ref.nativeElement;
  }

  onVisibleChange(): void {
    this.changeCount++;
    this.visibleAtEmit = this.visible();
  }
}

/** No projected content — the WCAG 1.4.1 "colour is the only channel" arrangement. */
@Component({
  imports: [CaeAlert],
  template: `<cae-alert severity="danger" />`,
})
class EmptyAlertHost {}

/**
 * Bare attribute form — the shape that reaches an uncoerced input as the string `''`. This is how
 * Forge's own demo writes it, so a missing `booleanAttribute` transform would silently delete the
 * close button from the card that exists to demonstrate dismissal.
 */
@Component({
  imports: [CaeAlert],
  template: `<cae-alert severity="info" dismissible>Bare attribute</cae-alert>`,
})
class BareDismissibleHost {}

/**
 * The alert unmounts *itself* in response to its own dismissal — the shape the class doc documents
 * (`@if (error()) { <cae-alert (visibleChange)="error.set(null)"> }`) and the one that breaks a
 * post-render focus redirect: `afterNextRender` bound to this component's injector is unregistered
 * when its own view is destroyed, so the redirect would silently never run.
 */
@Component({
  imports: [CaeAlert],
  template: `
    <h2 #landing tabindex="-1">Landing</h2>
    @if (present()) {
      <cae-alert
        severity="danger"
        dismissible
        [dismissFocusTarget]="landing"
        (visibleChange)="present.set(false)"
      >
        Payment failed.
      </cae-alert>
    }
  `,
})
class UnmountOnDismissHost {
  readonly present = signal(true);
}

describe('CaeAlert', () => {
  let fixture: ComponentFixture<AlertHost>;
  let host: AlertHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AlertHost] }).compileComponents();
    fixture = TestBed.createComponent(AlertHost);
    host = fixture.componentInstance;
    // Attached: document.activeElement only tracks elements that are actually in the document.
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    // Unconditional: every spy below restores on its last line, which a mid-test failure would skip,
    // leaking a mocked console.warn into the rest of the file.
    vi.restoreAllMocks();
  });

  const el = (sel: string): HTMLElement | null => fixture.nativeElement.querySelector(sel);
  const body = (): HTMLElement => el('.cae-alert__body')!;
  const closeBtn = (): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector('.cae-alert__close');
  const landing = (): HTMLElement => host.landingQuery()!.nativeElement;

  const set = async (fn: () => void): Promise<void> => {
    fn();
    await fixture.whenStable();
  };

  describe('severity — the visual channel', () => {
    it('puts the severity on a modifier class', async () => {
      for (const severity of ['info', 'success', 'warn', 'danger'] as const) {
        await set(() => host.severity.set(severity));
        expect(el('.cae-alert')!.classList.contains(`cae-alert--${severity}`)).toBe(true);
      }
    });

    it('renders a DISTINCT, WELL-FORMED glyph per severity', async () => {
      const seen: string[] = [];
      for (const severity of ['info', 'success', 'warn', 'danger'] as const) {
        await set(() => host.severity.set(severity));
        seen.push(el('.cae-alert__glyph path')!.getAttribute('d')!);
      }
      // Distinctness alone is NOT enough: {'Z','ZZ','ZZZ','ZZZZ'} is four distinct non-empty strings
      // that render nothing at all, collapsing the non-colour channel back to colour while this
      // test stays green. So also assert each is real path data — starts with an absolute moveto,
      // and carries at least three drawing commands.
      expect(new Set(seen).size).toBe(4);
      for (const d of seen) {
        expect(d).toMatch(/^M[\d.]/);
        expect(d.match(/[A-Z]/g)!.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('marks the glyph decorative, so it contributes nothing to the announcement', () => {
      const glyph = el('.cae-alert__glyph')!;
      expect(glyph.getAttribute('aria-hidden')).toBe('true');
      expect(glyph.getAttribute('focusable')).toBe('false');
    });

    it('marks the CLOSE glyph decorative too — the button carries the name', async () => {
      await set(() => host.dismissible.set(true));
      const glyph = el('.cae-alert__close-glyph')!;
      expect(glyph.getAttribute('aria-hidden')).toBe('true');
      expect(glyph.getAttribute('focusable')).toBe('false');
    });

    it('never colours the message text with the severity hue (WCAG 1.4.3, the #662 finding)', () => {
      const styles = compiledStyles();
      // The text colour is set once, neutral, on the container.
      expect(styles).toMatch(/color:\s*var\(--cae-color-on-surface\)/);
      // ...and no severity rule may re-colour the content or the container's text. (The
      // `.cae-alert--x .cae-alert__glyph` rules are correctly excluded: a descendant selector
      // follows the modifier, so it never reaches the brace this pattern requires.)
      expect(styles).not.toMatch(ruleFor('.cae-alert__content', 'color:'));
      for (const token of ['primary', 'success', 'warn', 'error']) {
        expect(styles).not.toMatch(
          ruleFor('.cae-alert--\\w+', `[^-]color:\\s*var\\(--cae-color-${token}\\)`),
        );
      }
    });
  });

  describe('severity reaches assistive tech (WCAG 1.3.1)', () => {
    it('renders the severity name visually-hidden inside the live region', async () => {
      for (const [severity, label] of [
        ['info', 'Note'],
        ['success', 'Success'],
        ['warn', 'Warning'],
        ['danger', 'Error'],
      ] as const) {
        await set(() => host.severity.set(severity));
        const sr = body().querySelector('.cae-visually-hidden')!;
        // Inside the region (so it is announced with the message) and carrying the severity — the
        // tint and glyph are both visual, so without this AT receives no severity at all.
        expect(sr.textContent!.trim()).toBe(`${label}:`);
      }
    });

    it('is hidden from sight but not from the a11y tree', () => {
      const styles = compiledStyles();
      // The sr-only recipe: clipped to 1px, NOT display:none / visibility:hidden (which would
      // remove it from the accessibility tree and make the whole thing pointless).
      expect(styles).toMatch(ruleFor('.cae-visually-hidden', 'position:\\s*absolute'));
      expect(styles).toMatch(ruleFor('.cae-visually-hidden', 'clip:\\s*rect'));
      expect(styles).not.toMatch(ruleFor('.cae-visually-hidden', 'display:\\s*none'));
      expect(styles).not.toMatch(ruleFor('.cae-visually-hidden', 'visibility:\\s*hidden'));
    });

    it('lets [severityLabel] override the name for i18n', async () => {
      await set(() => {
        host.severity.set('danger');
        host.severityLabel.set('Fehler');
      });
      expect(body().querySelector('.cae-visually-hidden')!.textContent!.trim()).toBe('Fehler:');
    });

    it('suppresses the name entirely at [severityLabel]="null"', async () => {
      await set(() => host.severityLabel.set(null));
      expect(body().querySelector('.cae-visually-hidden')).toBeNull();
    });
  });

  describe('unknown severity — every channel fails at once', () => {
    it('renders NO glyph rather than an empty box or garbage path data', async () => {
      // 'error' is p-message's own vocabulary, so it is what a migrating consumer types first.
      await set(() => host.severity.set('error'));
      expect(el('.cae-alert__glyph')).toBeNull();
      expect(body().querySelector('.cae-visually-hidden')).toBeNull();
    });

    it('resolves registry lookups on OWN keys, so a prototype name renders nothing', async () => {
      // A bare index would return Object.prototype.toString — a truthy FUNCTION — and stamp
      // `d="function toString() { [native code] }"`. Realistic: severity often comes from a row.
      await set(() => host.severity.set('toString'));
      expect(el('.cae-alert__glyph')).toBeNull();
      expect(body().querySelector('.cae-visually-hidden')).toBeNull();
    });

    it('warns in dev mode, naming the PrimeNG spelling that lands here', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await set(() => host.severity.set('error'));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cae-alert: unknown [severity='));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('danger'));
      // The empty-message guard cannot see this: the text is present and fine.
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('WCAG 1.4.1'));
    });
  });

  describe('live region — the politeness contract', () => {
    it('defaults danger to role=alert (assertive) and every other severity to role=status', async () => {
      await set(() => host.severity.set('danger'));
      expect(body().getAttribute('role')).toBe('alert');

      for (const severity of ['info', 'success', 'warn'] as const) {
        await set(() => host.severity.set(severity));
        expect(body().getAttribute('role')).toBe('status');
      }
    });

    it('lets [politeness] override the severity default in both directions', async () => {
      await set(() => {
        host.severity.set('info');
        host.politeness.set('assertive');
      });
      expect(body().getAttribute('role')).toBe('alert');

      await set(() => {
        host.severity.set('danger');
        host.politeness.set('polite');
      });
      expect(body().getAttribute('role')).toBe('status');
    });

    it('drops the role entirely at politeness="off" — static furniture, never announced', async () => {
      await set(() => host.politeness.set('off'));
      expect(body().hasAttribute('role')).toBe(false);
    });

    it('FAILS SAFE: an unrecognised politeness still announces, politely', async () => {
      // Only an explicit 'off' may silence the alert. A stringly-typed or misspelled value
      // degrading to "no live region" would be the worst outcome this component can produce —
      // a danger alert nobody hears — so the fallback points toward announcement, not away.
      await set(() => host.politeness.set('Assertive' as CaeAlertPoliteness));
      expect(body().getAttribute('role')).toBe('status');

      await set(() => host.politeness.set('' as CaeAlertPoliteness));
      expect(body().getAttribute('role')).toBe('status');
    });

    it('keeps the dismiss button OUT of the live region', async () => {
      await set(() => host.dismissible.set(true));
      const region = body();
      // All three legs matter: the role is on the body (not the host), the body is a live region,
      // and the button — whose name an aria-atomic region would re-speak on every change — is
      // outside it.
      expect(region.getAttribute('role')).toBe('status');
      expect(fixture.nativeElement.querySelector('cae-alert')!.hasAttribute('role')).toBe(false);
      expect(region.contains(closeBtn())).toBe(false);
      expect(el('.cae-alert')!.contains(closeBtn())).toBe(true);
    });
  });

  describe('dismissal', () => {
    it('renders no close button unless [dismissible]', async () => {
      expect(closeBtn()).toBeNull();
      await set(() => host.dismissible.set(true));
      expect(closeBtn()).not.toBeNull();
      expect(closeBtn()!.getAttribute('type')).toBe('button');
    });

    it('coerces the BARE attribute form (booleanAttribute), as Forge writes it', async () => {
      const bare = TestBed.createComponent(BareDismissibleHost);
      await bare.whenStable();
      // Without the transform this is the string '' -> falsy -> no button at all.
      expect(bare.nativeElement.querySelector('.cae-alert__close')).not.toBeNull();
      bare.destroy();
    });

    it('names the close button, and honours a [closeAriaLabel] override', async () => {
      await set(() => host.dismissible.set(true));
      expect(closeBtn()!.getAttribute('aria-label')).toBe('Close');

      await set(() => host.closeAriaLabel.set('Dismiss the payment warning'));
      expect(closeBtn()!.getAttribute('aria-label')).toBe('Dismiss the payment warning');
    });

    it('hides the content but keeps the host element, so [(visible)] can re-show it', async () => {
      await set(() => host.dismissible.set(true));
      closeBtn()!.click();
      await fixture.whenStable();

      expect(host.visible()).toBe(false);
      expect(el('.cae-alert')).toBeNull();
      expect(fixture.nativeElement.querySelector('cae-alert')).not.toBeNull();

      await set(() => host.visible.set(true));
      expect(el('.cae-alert')).not.toBeNull();
    });

    it('has written visible=false by the time (visibleChange) fires', async () => {
      await set(() => host.dismissible.set(true));
      host.changeCount = 0;
      closeBtn()!.click();
      await fixture.whenStable();

      expect(host.changeCount).toBe(1);
      // A handler reading visible() must not see the pre-dismissal value.
      expect(host.visibleAtEmit).toBe(false);
    });

    it('floors the close button to --cae-target-min, never a --cae-space-* value (WCAG 2.5.8)', () => {
      const styles = compiledStyles();
      expect(styles).toMatch(/min-inline-size:\s*var\(--cae-target-min\)/);
      expect(styles).toMatch(/min-block-size:\s*var\(--cae-target-min\)/);
      // A spacing token shrinks to 16px at [data-density=compact] and would fail the floor.
      expect(styles).not.toMatch(/min-(?:inline|block)-size:\s*var\(--cae-space/);
      // The rule must actually select the rendered button — a renamed selector keeps both regexes
      // above matching while the button ends up with no floor at all. The computed-style oracle
      // lives in alert.browser.spec.ts; this is the source-level half.
      expect(styles).toMatch(ruleFor('.cae-alert__close', 'min-inline-size'));
    });
  });

  describe('focus after dismissal (WCAG 2.4.3)', () => {
    it('lands focus on a [dismissFocusTarget] bound as a raw element', async () => {
      await set(() => host.dismissible.set(true));
      const btn = closeBtn()!;
      // jsdom's .click() does not focus, so put focus where a real activation would have it —
      // without this the capture reads "focus was never ours" and the assertion below is vacuous.
      btn.focus();
      expect(document.activeElement).toBe(btn);

      btn.click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(landing());
    });

    it('lands focus on a [dismissFocusTarget] bound as an ElementRef', async () => {
      // The input's docs advertise "an ElementRef, or a viewChild() result (bind it directly)".
      // Every other binding in the repo passes a raw element, so without this arm the unwrap's
      // true branch is dead code everywhere — and deleting it would break the documented shape.
      await set(() => {
        host.dismissible.set(true);
        host.targetMode.set('elementRef');
      });
      const btn = closeBtn()!;
      btn.focus();
      btn.click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(landing());
    });

    it('lets the browser scroll a consumer-named target into view (#944)', async () => {
      // The inverse of what this test asserted before decision #944. `preventScroll` is right only
      // where the COMPONENT chose the target and therefore knows it was on screen — cae-chip-set
      // restoring to an adjacent chip, cae-grid to the neighbouring pager, both of which keep it.
      // [dismissFocusTarget] is by definition an element the consumer named, which may sit far
      // above the fold; suppressing the scroll there lands focus with no perceivable focus
      // indicator anywhere on screen (WCAG 2.4.7). jsdom cannot scroll, so the ARGUMENT is the
      // only observable: `focus()` with no options lets the platform do its default thing.
      await set(() => host.dismissible.set(true));
      const spy = vi.spyOn(landing(), 'focus');
      const btn = closeBtn()!;
      btn.focus();
      btn.click();
      await fixture.whenStable();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith();
      // Teeth against a partial revert that passes an empty options object instead of removing the
      // argument: `toHaveBeenCalledWith()` alone would still fail on `{}`, but this names the value
      // that must not come back.
      expect(spy).not.toHaveBeenCalledWith({ preventScroll: true });
    });

    it('does not throw when the consumer binds the viewChild SIGNAL instead of its result (#865)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await set(() => {
        host.dismissible.set(true);
        host.targetMode.set('signal');
      });
      const btn = closeBtn()!;
      btn.focus();
      btn.click();
      // The claim is that the dismissal completes. Before the guard, `el.focus()` threw TypeError
      // from inside placeFocus — which runs BEFORE `visible.set(false)` — so the alert stayed open
      // and the user's click did nothing at all. Asserting the model write is what proves the
      // dismissal survived; asserting only "no throw" would pass against a swallowed exception.
      await fixture.whenStable();

      expect(host.visible()).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('cae-alert: [dismissFocusTarget] is not an element'),
      );
      // Exactly one warning: the focusability nudge must NOT also fire, or the developer is told
      // to add tabindex="-1" to fix a binding that was never an element.
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('still lands focus when the consumer UNMOUNTS the alert on dismissal', async () => {
      // The documented shape, and the one a post-render redirect cannot survive: Angular ties an
      // afterNextRender sequence to the registering injector's DestroyRef, so destroying this
      // component's own view during change detection unregisters the callback before the
      // after-render phase ever reaches it. Focus would land on <body> — the exact WCAG 2.4.3
      // failure this machinery exists to prevent — and the dev warning would be stranded inside
      // the cancelled callback too, so nothing would even say so. Moving focus synchronously,
      // before the model write, is what makes this arrangement work.
      const unmount = TestBed.createComponent(UnmountOnDismissHost);
      document.body.appendChild(unmount.nativeElement);
      await unmount.whenStable();

      const btn = unmount.nativeElement.querySelector('.cae-alert__close') as HTMLButtonElement;
      btn.focus();
      btn.click();
      await unmount.whenStable();

      expect(unmount.componentInstance.present()).toBe(false); // it really did unmount...
      expect(unmount.nativeElement.querySelector('cae-alert')).toBeNull();
      expect(document.activeElement).toBe(unmount.nativeElement.querySelector('h2')); // ...and focus survived
      unmount.nativeElement.remove();
      unmount.destroy();
    });

    it('leaves focus alone when the dismissal never held focus in the first place', async () => {
      await set(() => host.dismissible.set(true));
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      outside.focus();

      // Activating the close button without focus ever entering the alert is a real arrangement,
      // not a contrived one: Safari does not focus a button on mouse-down, so a click there leaves
      // the caret wherever it was. Redirecting here would STEAL focus out of the field the user is
      // typing in (WCAG 3.2.5). jsdom's .click() reproduces it exactly — it dispatches without
      // focusing — so this is the same code path, not a simulation of it.
      closeBtn()!.click();
      await fixture.whenStable();

      expect(host.visible()).toBe(false); // the dismissal really happened...
      expect(document.activeElement).toBe(outside); // ...and it did not touch focus.
      outside.remove();
    });

    it('leaves focus on <body> alone — and stays silent about it', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await set(() => {
        host.dismissible.set(true);
        // No target bound: the ONLY arrangement in which the "stays silent" claim below can fail.
        // With a target bound the missing-target branch is unreachable regardless of the code, and
        // the assertion would prove nothing.
        host.targetMode.set('none');
      });
      // Nothing focused: a screen-reader user activating the button from the virtual cursor, or any
      // Safari mouse click on a page whose focus is still at <body>. This is the one arrangement no
      // post-hoc check could catch — `activeElement === body` reads as "ours to move" — so the
      // capture taken before the dismissal is what keeps focus, and the warning, put.
      expect(document.activeElement).toBe(document.body);

      closeBtn()!.click();
      await fixture.whenStable();

      expect(host.visible()).toBe(false);
      expect(document.activeElement).toBe(document.body);
      // No focus was lost, so the missing-target warning would be pure noise (#525/#642).
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('dev-mode guards', () => {
    it('warns when a dismissible alert has no [dismissFocusTarget]', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await set(() => {
        host.dismissible.set(true);
        host.targetMode.set('none');
      });
      const btn = closeBtn()!;
      btn.focus();
      btn.click();
      await fixture.whenStable();

      // Match the phrase unique to THIS warning, plus the component prefix. Both dev warnings name
      // [dismissFocusTarget], so a looser assertion passes on the wrong one: with the no-target
      // branch deleted, execution falls through to the "did not receive focus" branch, which fires
      // and satisfies the loose match.
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('cae-alert: [dismissible] with no [dismissFocusTarget]'),
      );
    });

    it('warns when a bound [dismissFocusTarget] is not actually focusable', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // A non-interactive target without tabindex="-1" makes .focus() a silent no-op — the same
      // outcome as no redirect at all, but hidden. The other branch of the same guard.
      await set(() => {
        host.dismissible.set(true);
        host.targetFocusable.set(false);
      });
      const btn = closeBtn()!;
      btn.focus();
      btn.click();
      await fixture.whenStable();

      expect(document.activeElement).not.toBe(landing());
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('cae-alert: [dismissFocusTarget] did not receive focus'),
      );
    });

    it('warns on a severity alert with no message (colour would be the only channel)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const empty = TestBed.createComponent(EmptyAlertHost);
      await empty.whenStable();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cae-alert:'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('WCAG 1.4.1'));
      empty.destroy();
    });

    it('warns when the message empties at runtime with the alert still mounted (#863)', async () => {
      // The shape the class doc RECOMMENDS — `<cae-alert>{{ errorText() }}</cae-alert>`, kept
      // mounted while its content changes. Projected content is not a signal, so the guard's own
      // effect (deps: visible, severity) cannot see this; a MutationObserver is what does.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Start non-empty and assert the silence: without this the test could pass on a guard that
      // warns unconditionally at first render, which is the opposite of the fix.
      expect(host.message()).toBe('Something happened.');
      expect(warn).not.toHaveBeenCalled();

      await set(() => host.message.set(''));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('WCAG 1.4.1'));
    });

    it('re-arms after the message comes back, and does not repeat while it stays empty (#863)', async () => {
      // Two claims in one arrangement because they are the same latch seen from both sides. The
      // observer fires per mutation BATCH, not per empty-transition, so an unlatched guard would
      // re-warn on any unrelated projected change while the message stayed empty — a console that
      // repeats itself is one a developer learns to scroll past. A latch that never cleared would
      // be the opposite defect: the second real emptying would go unreported.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await set(() => host.message.set(''));
      expect(warn).toHaveBeenCalledTimes(1);

      // A mutation that does not change emptiness must not re-warn.
      await set(() => host.message.set('   '));
      expect(warn).toHaveBeenCalledTimes(1);

      await set(() => host.message.set('Back.'));
      await set(() => host.message.set(''));
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('still sees a runtime emptying after the alert was hidden and re-shown (#863)', async () => {
      // `.cae-alert__content` lives inside @if (visible()), so hiding and re-showing DESTROYS the
      // node the observer was watching and renders a fresh one. An observer attached once at first
      // render would be left watching a detached node and silently never fire again — and `visible`
      // toggling is the alert's normal life, not an edge case.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await set(() => host.visible.set(false));
      await set(() => host.visible.set(true));
      expect(warn).not.toHaveBeenCalled(); // the message is still 'Something happened.'

      await set(() => host.message.set(''));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('WCAG 1.4.1'));
    });

    it('stops observing the message once the alert is destroyed (#863)', async () => {
      // The observer outlives the component unless something disconnects it: MutationObserver holds
      // a strong reference to its callback, which closes over the component. Asserting on a warning
      // AFTER destroy is what makes the DestroyRef teardown falsifiable — deleting it leaves this
      // green only if the observer really stopped.
      const own = TestBed.createComponent(AlertHost);
      document.body.appendChild(own.nativeElement);
      await own.whenStable();
      const content = own.nativeElement.querySelector('.cae-alert__content') as HTMLElement;

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      own.destroy();

      // Mutate the detached content directly — after destroy there is no change detection left to
      // route a signal write through, so poking the DOM is the only way to ask the question.
      content.textContent = '';
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(warn).not.toHaveBeenCalled();
      own.nativeElement.remove();
    });

    it('does NOT warn when a message is projected — with the guard actually running', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Toggling visible() is what makes the effect RE-RUN. Merely changing severity would not:
      // if severity were read only inside the warn branch it would not be a dependency on the
      // clean path, and this test would pass because the guard body never executed at all.
      await set(() => host.visible.set(false));
      await set(() => host.visible.set(true));
      expect(el('.cae-alert__content')!.textContent!.trim()).not.toBe(''); // the guard had input

      expect(warn).not.toHaveBeenCalled();
    });

    it('re-checks the empty-message guard each time the alert is shown, not just on first render', async () => {
      // An alert is overwhelmingly rendered conditionally; a first-render-only guard would read an
      // absent element and pass vacuously on exactly that shape.
      await set(() => host.visible.set(false));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await set(() => host.message.set('   '));
      await set(() => host.visible.set(true));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('WCAG 1.4.1'));
    });
  });

  describe('a11y', () => {
    it('has no axe violations across severities, dismissible and not', async () => {
      for (const severity of ['info', 'success', 'warn', 'danger'] as const) {
        await set(() => {
          host.severity.set(severity);
          host.dismissible.set(false);
        });
        await expectNoA11yViolations(fixture.nativeElement);

        await set(() => host.dismissible.set(true));
        await expectNoA11yViolations(fixture.nativeElement);
      }
    });

    it('has no axe violations at politeness="off"', async () => {
      await set(() => host.politeness.set('off'));
      await expectNoA11yViolations(fixture.nativeElement);
    });
  });
});
