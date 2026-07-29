import { Component, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeFieldset } from './fieldset';
import { CaePanel, CaePanelHeader } from './panel';
import { expectNoA11yViolations } from '../testing/a11y';

/** A component's compiled style sheet — the only place jsdom can see a CSS claim (it paints nothing). */
const compiledStyles = (cmp: Type<unknown>): string =>
  (cmp as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('\n');

/**
 * Match a rule body for `selector`, tolerating the `[_ngcontent-%COMP%]` attribute that emulated
 * encapsulation stamps between the selector and its brace. A plain `/\.foo\s*\{/` silently matches
 * NOTHING against compiled styles — which quietly turns every `not.toMatch` built on it into a
 * vacuous pass, so this helper is what gives the negative assertions below their teeth (#710).
 */
const ruleFor = (selector: string, body: string): RegExp =>
  new RegExp(`${selector.replace(/[.]/g, '\\.')}(\\[[^\\]]*\\])?\\s*\\{[^}]*${body}`);

/** The surface every disclosure host exposes, so one contract suite can drive both components. */
interface DisclosureHost {
  readonly toggleable: ReturnType<typeof signal<boolean>>;
  readonly collapsed: ReturnType<typeof signal<boolean>>;
  readonly changes: boolean[];
}

@Component({
  imports: [CaePanel],
  template: `
    <cae-panel
      [header]="header()"
      [toggleable]="toggleable()"
      [toggleAriaLabel]="toggleAriaLabel()"
      [(collapsed)]="collapsed"
      (collapsedChange)="changes.push($event)"
    >
      <input class="projected" aria-label="Card number" />
    </cae-panel>
  `,
})
class PanelHost implements DisclosureHost {
  readonly header = signal('Billing details');
  readonly toggleable = signal(false);
  readonly toggleAriaLabel = signal('');
  readonly collapsed = signal(false);
  readonly changes: boolean[] = [];
}

@Component({
  imports: [CaeFieldset],
  template: `
    <cae-fieldset
      [legend]="legend()"
      [toggleable]="toggleable()"
      [(collapsed)]="collapsed"
      (collapsedChange)="changes.push($event)"
    >
      <input class="projected" aria-label="Card number" />
    </cae-fieldset>
  `,
})
class FieldsetHost implements DisclosureHost {
  readonly legend = signal('Billing details');
  readonly toggleable = signal(false);
  readonly collapsed = signal(false);
  readonly changes: boolean[] = [];
}

/**
 * The disclosure contract, asserted against BOTH components.
 *
 * `cae-panel` and `cae-fieldset` deliberately share no base class — the shared surface is four
 * members, and an abstract `@Directive()` to hold them would cost more than it saves. What the two
 * genuinely must share is *semantics*: a migrator moving a group from one to the other should not
 * find the collapse behaving differently. That guarantee belongs in a test, which is this suite —
 * it is the thing a base class would have bought, without the indirection.
 */
const CONTRACT: { name: string; host: Type<DisclosureHost>; tag: string; content: string }[] = [
  { name: 'cae-panel', host: PanelHost, tag: 'cae-panel', content: '.cae-panel__content' },
  {
    name: 'cae-fieldset',
    host: FieldsetHost,
    tag: 'cae-fieldset',
    content: '.cae-fieldset__content',
  },
];

describe.each(CONTRACT)(
  '$name — the shared disclosure contract',
  ({ host: HostType, tag, content }) => {
    let fixture: ComponentFixture<DisclosureHost>;
    let host: DisclosureHost;

    const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(selector: string): T | null =>
      root().querySelector<T>(selector);
    const toggle = (): HTMLButtonElement | null => el<HTMLButtonElement>(`${tag} button`);
    const contentEl = (): HTMLElement | null => el<HTMLElement>(content);

    const set = async (mutate: () => void): Promise<void> => {
      mutate();
      fixture.detectChanges();
      await fixture.whenStable();
    };

    beforeEach(async () => {
      await TestBed.configureTestingModule({ imports: [HostType] }).compileComponents();
      fixture = TestBed.createComponent(HostType);
      host = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('renders no toggle until [toggleable]', async () => {
      expect(toggle()).toBeNull();
      expect(contentEl()).not.toBeNull();
      expect(contentEl()!.hasAttribute('hidden')).toBe(false);

      await set(() => host.toggleable.set(true));
      expect(toggle()).not.toBeNull();
    });

    it('honours [collapsed] with NO toggle, so an external control can drive it', async () => {
      // Deliberate, and the opposite of what an earlier comment here claimed: `collapsed` is not
      // gated on `toggleable`, so a "collapse all" button outside the component still works. The
      // corollary — the content is then unreachable from the panel itself — is the consumer's to
      // own, and is documented on the input.
      await set(() => host.collapsed.set(true));

      expect(toggle()).toBeNull();
      expect(contentEl()!.hasAttribute('hidden')).toBe(true);

      await set(() => host.collapsed.set(false));
      expect(contentEl()!.hasAttribute('hidden')).toBe(false);
    });

    it('is a real <button type="button">, so Enter/Space work with no key handler', async () => {
      await set(() => host.toggleable.set(true));
      expect(toggle()!.tagName).toBe('BUTTON');
      // Without type=button a button inside a <form> submits it on click.
      expect(toggle()!.getAttribute('type')).toBe('button');
    });

    it('points aria-controls at the content region, which EXISTS while collapsed', async () => {
      await set(() => host.toggleable.set(true));
      const controls = toggle()!.getAttribute('aria-controls');
      expect(controls).toBeTruthy();

      const target = root().querySelector(`[id="${controls}"]`);
      expect(target).toBe(contentEl());

      // aria-controls dangling is the failure mode of collapsing with @if: the id would name nothing.
      await set(() => host.collapsed.set(true));
      expect(root().querySelector(`[id="${controls}"]`)).toBe(target);
    });

    it('hides the content rather than removing it, keeping projected DOM alive', async () => {
      await set(() => host.toggleable.set(true));
      const projected = el<HTMLInputElement>('.projected')!;
      projected.value = 'typed by the user';

      await set(() => toggle()!.click());
      expect(host.collapsed()).toBe(true);
      expect(contentEl()!.hasAttribute('hidden')).toBe(true);
      // The load-bearing structural claim of a disclosure: you can always get back. jsdom happily
      // dispatches click() on a display:none node, so re-expanding below would pass even with the
      // toggle sealed inside the region it just hid.
      expect(contentEl()!.contains(toggle())).toBe(false);
      // Still in the document — `@if` would have detached it, losing scroll position and any
      // uncommitted DOM state the consumer's content holds.
      expect(root().contains(projected)).toBe(true);

      await set(() => toggle()!.click());
      expect(contentEl()!.hasAttribute('hidden')).toBe(false);
      expect(el<HTMLInputElement>('.projected')).toBe(projected);
      expect(projected.value).toBe('typed by the user');
    });

    it('keeps the chevron out of the accessibility tree', async () => {
      await set(() => host.toggleable.set(true));
      // Parameterised deliberately: asserting this only in the fieldset's own describe left the
      // panel's chevron ungraded, which is exactly where a describe.each hides an asymmetry.
      const chevron = el(`${tag} cae-icon`)!;
      expect(chevron).not.toBeNull();
      expect(chevron.getAttribute('aria-hidden')).toBe('true');
    });

    it('points the chevron DOWN when collapsed, matching Material and p-panel', async () => {
      await set(() => host.toggleable.set(true));
      // The rotation is keyed on the TOGGLE's --expanded class (the chevron is its descendant).
      // Collapsed shows the "expand" affordance unrotated; expanded is the rotated state. Getting
      // this backwards puts a cae-panel and a cae-expansion-panel on one page pointing opposite
      // ways in the same state (WCAG 3.2.4) — which is what shipped until a lens measured it.
      await set(() => host.collapsed.set(true));
      expect(toggle()!.className).not.toContain('--expanded');

      await set(() => host.collapsed.set(false));
      expect(toggle()!.className).toContain('--expanded');
    });

    it('reflects state in aria-expanded, both directions', async () => {
      await set(() => host.toggleable.set(true));
      expect(toggle()!.getAttribute('aria-expanded')).toBe('true');

      await set(() => toggle()!.click());
      expect(toggle()!.getAttribute('aria-expanded')).toBe('false');

      await set(() => toggle()!.click());
      expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
    });

    it('honours an initial [collapsed]="true" without a click', async () => {
      await set(() => {
        host.toggleable.set(true);
        host.collapsed.set(true);
      });
      expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
      expect(contentEl()!.hasAttribute('hidden')).toBe(true);
    });

    it('writes back through [(collapsed)] and emits collapsedChange once per toggle', async () => {
      await set(() => host.toggleable.set(true));
      host.changes.length = 0;

      await set(() => toggle()!.click());
      expect(host.collapsed()).toBe(true);
      expect(host.changes).toEqual([true]);

      await set(() => toggle()!.click());
      expect(host.collapsed()).toBe(false);
      expect(host.changes).toEqual([true, false]);
    });

    it('follows a programmatic collapse from the parent', async () => {
      await set(() => host.toggleable.set(true));
      await set(() => host.collapsed.set(true));

      expect(contentEl()!.hasAttribute('hidden')).toBe(true);
      expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
      // A parent push is not a component-originated change, so it must NOT echo back as an event.
      expect(host.changes).toEqual([]);
    });

    it('has no axe violations expanded OR collapsed', async () => {
      await set(() => host.toggleable.set(true));
      await expectNoA11yViolations(root());

      // Sweeping only the pristine state is how a state-dependent violation ships (#773).
      await set(() => host.collapsed.set(true));
      await expectNoA11yViolations(root());
    });
  },
);

describe('CaePanel', () => {
  let fixture: ComponentFixture<PanelHost>;
  let host: PanelHost;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const el = <T extends HTMLElement>(selector: string): T | null =>
    root().querySelector<T>(selector);
  const toggle = (): HTMLButtonElement | null => el<HTMLButtonElement>('.cae-panel__toggle');

  const set = async (mutate: () => void): Promise<void> => {
    mutate();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PanelHost] }).compileComponents();
    fixture = TestBed.createComponent(PanelHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders the [header] string and sits on a mat-card surface', () => {
    expect(el('.cae-panel__title')!.textContent!.trim()).toBe('Billing details');
    expect(el('mat-card')).not.toBeNull();
  });

  it('drops the header row entirely when there is nothing to put in it', async () => {
    await set(() => host.header.set(''));
    expect(el('.cae-panel__header')).toBeNull();

    // …but a toggle still needs somewhere to live.
    await set(() => host.toggleable.set(true));
    expect(el('.cae-panel__header')).not.toBeNull();
  });

  it('labels the toggle BY the header, so AT announces what is being expanded', async () => {
    await set(() => host.toggleable.set(true));

    expect(toggle()!.getAttribute('aria-label')).toBeNull();
    const labelledBy = toggle()!.getAttribute('aria-labelledby');
    expect(labelledBy).toBe(el('.cae-panel__title')!.id);
    expect(document.getElementById(labelledBy!)?.textContent?.trim()).toBe('Billing details');
  });

  it('falls back to a literal label only when there is no header to point at', async () => {
    await set(() => {
      host.toggleable.set(true);
      host.header.set('');
    });
    // An aria-labelledby pointing at an empty element would leave the button unnamed.
    expect(toggle()!.getAttribute('aria-labelledby')).toBeNull();
    expect(toggle()!.getAttribute('aria-label')).toBe('Toggle');

    // Whitespace is the same defect wearing a truthy string: `!!'   '` is true, so without a
    // trim() the panel would label the toggle by a title cell holding nothing readable.
    await set(() => host.header.set('   '));
    expect(toggle()!.getAttribute('aria-labelledby')).toBeNull();
    expect(toggle()!.getAttribute('aria-label')).toBe('Toggle');
  });

  it('lets [toggleAriaLabel] override the header labelling', async () => {
    await set(() => {
      host.toggleable.set(true);
      host.toggleAriaLabel.set('Show billing details');
    });
    expect(toggle()!.getAttribute('aria-label')).toBe('Show billing details');
    expect(toggle()!.getAttribute('aria-labelledby')).toBeNull();
  });

  it('gives ids unique per instance, so two panels never cross-wire aria-controls', async () => {
    @Component({
      imports: [CaePanel],
      template: `
        <cae-panel header="One" toggleable>1</cae-panel>
        <cae-panel header="Two" toggleable>2</cae-panel>
      `,
    })
    class TwoPanels {}

    const two = TestBed.createComponent(TwoPanels);
    two.detectChanges();
    await two.whenStable();

    const [a, b] = Array.from(
      (two.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.cae-panel__toggle'),
    );
    expect(a.getAttribute('aria-controls')).not.toBe(b.getAttribute('aria-controls'));
    expect(a.getAttribute('aria-labelledby')).not.toBe(b.getAttribute('aria-labelledby'));
  });

  describe('projected header', () => {
    @Component({
      imports: [CaePanel, CaePanelHeader],
      template: `
        <cae-panel [toggleable]="true">
          <h2 caePanelHeader>Shipping</h2>
          <p>body</p>
        </cae-panel>
      `,
    })
    class ProjectedHeaderHost {}

    it('renders a real heading and labels the toggle by it', async () => {
      const f = TestBed.createComponent(ProjectedHeaderHost);
      f.detectChanges();
      await f.whenStable();

      const fRoot = f.nativeElement as HTMLElement;
      const heading = fRoot.querySelector('h2[caePanelHeader]');
      expect(heading).not.toBeNull();

      const btn = fRoot.querySelector<HTMLButtonElement>('.cae-panel__toggle')!;
      const title = fRoot.querySelector('.cae-panel__title')!;
      expect(btn.getAttribute('aria-labelledby')).toBe(title.id);
      expect(title.contains(heading)).toBe(true);
      expect(btn.getAttribute('aria-label')).toBeNull();
    });

    it('ignores a marker that is not a direct child, rather than half-registering it', async () => {
      @Component({
        imports: [CaePanel, CaePanelHeader],
        template: `
          <cae-panel [toggleable]="true">
            <div class="wrapper"><h2 caePanelHeader>Shipping</h2></div>
            <p>body</p>
          </cae-panel>
        `,
      })
      class NestedHeaderHost {}

      const f = TestBed.createComponent(NestedHeaderHost);
      f.detectChanges();
      await f.whenStable();
      const fRoot = f.nativeElement as HTMLElement;

      // `<ng-content select>` matches only top-level projected nodes, so this <h2> is NOT
      // projected into the header cell. With contentChild left at its default descendants: true
      // the query would still see it, and the panel would claim a header it never rendered —
      // pointing aria-labelledby at an empty element and leaving the toggle unnamed (WCAG 4.1.2).
      const btn = fRoot.querySelector<HTMLButtonElement>('.cae-panel__toggle')!;
      expect(btn.getAttribute('aria-labelledby')).toBeNull();
      expect(btn.getAttribute('aria-label')).toBe('Toggle');
      expect(fRoot.querySelector('.wrapper h2')).not.toBeNull();
    });

    it('warns when a projected header renders no text, leaving the toggle unnamed', async () => {
      @Component({
        imports: [CaePanel, CaePanelHeader],
        template: `<cae-panel [toggleable]="true"><span caePanelHeader></span></cae-panel>`,
      })
      class EmptyProjectedHeaderHost {}

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const f = TestBed.createComponent(EmptyProjectedHeaderHost);
        f.detectChanges();
        await f.whenStable();

        // The marker IS present, so `hasHeaderContent()` is true and aria-labelledby is emitted —
        // but it resolves to an element with no text, so the button's accessible name computes to
        // empty (WCAG 4.1.2). This is the route `trim()` on [header] cannot close.
        const btn = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
          '.cae-panel__toggle',
        )!;
        expect(btn.getAttribute('aria-labelledby')).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('no accessible name');
      } finally {
        warn.mockRestore();
      }
    });

    it('stays silent when the projected header does render text', async () => {
      @Component({
        imports: [CaePanel, CaePanelHeader],
        template: `<cae-panel [toggleable]="true"><h2 caePanelHeader>Shipping</h2></cae-panel>`,
      })
      class NamedProjectedHeaderHost {}

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const f = TestBed.createComponent(NamedProjectedHeaderHost);
        f.detectChanges();
        await f.whenStable();

        // The positive control for the test above: same code path, same effect run — the guard's
        // INPUT is present this time, so silence here means the guard discriminated rather than
        // never having executed.
        const title = (f.nativeElement as HTMLElement).querySelector('.cae-panel__title')!;
        expect(title.textContent!.trim()).toBe('Shipping');
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it('renders the header row for a projected header with no [header] string', async () => {
      const f = TestBed.createComponent(ProjectedHeaderHost);
      f.detectChanges();
      await f.whenStable();
      expect((f.nativeElement as HTMLElement).querySelector('.cae-panel__header')).not.toBeNull();
    });
  });

  describe('styles', () => {
    it('floors the toggle hit target on the density-INVARIANT token (WCAG 2.5.8)', () => {
      const css = compiledStyles(CaePanel);
      expect(css).toMatch(
        ruleFor('.cae-panel__toggle', 'min-inline-size:\\s*var\\(--cae-target-min\\)'),
      );
      expect(css).toMatch(
        ruleFor('.cae-panel__toggle', 'min-block-size:\\s*var\\(--cae-target-min\\)'),
      );
      // --cae-space-* tightens under [data-density=compact] and drops the target below 24px.
      expect(css).not.toMatch(
        ruleFor('.cae-panel__toggle', 'min-inline-size:\\s*var\\(--cae-space'),
      );
    });

    it('re-asserts display:none for the hidden content region', () => {
      // Any author `display` on the content would otherwise beat the UA [hidden] rule and leave
      // collapsed content on screen while AT still treats it as hidden.
      expect(compiledStyles(CaePanel)).toMatch(
        /\.cae-panel__content\[hidden\][^{]*\{[^}]*display:\s*none/,
      );
    });
  });
});

describe('CaeFieldset', () => {
  let fixture: ComponentFixture<FieldsetHost>;
  let host: FieldsetHost;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const el = <T extends HTMLElement>(selector: string): T | null =>
    root().querySelector<T>(selector);

  const set = async (mutate: () => void): Promise<void> => {
    mutate();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FieldsetHost] }).compileComponents();
    fixture = TestBed.createComponent(FieldsetHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders a NATIVE fieldset+legend — the whole reason it is not a cae-panel', () => {
    const fieldset = el<HTMLFieldSetElement>('fieldset')!;
    expect(fieldset).not.toBeNull();

    // The legend must be the fieldset's FIRST element child, or the browser does not treat it as
    // the group's label at all.
    const legend = fieldset.firstElementChild!;
    expect(legend.tagName).toBe('LEGEND');
    expect(legend.textContent!.trim()).toBe('Billing details');
  });

  it('keeps the legend text as the accessible name when toggleable', async () => {
    await set(() => host.toggleable.set(true));

    const legend = el('legend')!;
    const btn = el<HTMLButtonElement>('.cae-fieldset__toggle')!;
    expect(legend.contains(btn)).toBe(true);
    // The chevron is aria-hidden, so both the group name and the button name read as the legend.
    expect(legend.textContent!.trim()).toBe('Billing details');
    expect(btn.textContent!.trim()).toBe('Billing details');
    expect(el('.cae-fieldset__chevron')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('tracks a changed [legend] in both the group name and the toggle name', async () => {
    await set(() => {
      host.toggleable.set(true);
      host.legend.set('Delivery options');
    });
    expect(el('legend')!.textContent!.trim()).toBe('Delivery options');
    expect(el<HTMLButtonElement>('.cae-fieldset__toggle')!.textContent!.trim()).toBe(
      'Delivery options',
    );
  });

  describe('the empty-legend dev warning', () => {
    it('warns when the legend is dynamically empty, and stays silent when it is not', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // Step 1 must be a DIFFERENT non-empty value. Writing back the value the signal already
        // holds ('Billing details', set in the host and rendered in beforeEach) changes nothing:
        // signal equality suppresses the notification, the effect never re-runs, and the assertion
        // below would hold no matter what the guard body did — vacuous in the exact way this
        // suite's own comments warn about (#710).
        await set(() => host.legend.set('Shipping options'));
        expect(warn).not.toHaveBeenCalled();

        // Step 2: empty — warns, proving the effect re-runs on a legend change at all.
        await set(() => host.legend.set('   '));
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('[legend] is empty');

        // Step 3 is the real silent-path oracle: a genuine value change back to a good legend,
        // which DOES re-run the effect and must still not warn.
        await set(() => host.legend.set('Billing details'));
        expect(warn).toHaveBeenCalledTimes(1);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('styles', () => {
    it('resets the UA min-inline-size, which otherwise pins the group to its widest control', () => {
      expect(compiledStyles(CaeFieldset)).toMatch(
        ruleFor('.cae-fieldset', 'min-inline-size:\\s*0'),
      );
    });

    it('floors the toggle hit target on the density-INVARIANT token (WCAG 2.5.8)', () => {
      const css = compiledStyles(CaeFieldset);
      expect(css).toMatch(
        ruleFor('.cae-fieldset__toggle', 'min-block-size:\\s*var\\(--cae-target-min\\)'),
      );
      expect(css).not.toMatch(
        ruleFor('.cae-fieldset__toggle', 'min-block-size:\\s*var\\(--cae-space'),
      );
    });

    it('re-asserts display:none for the hidden content region', () => {
      expect(compiledStyles(CaeFieldset)).toMatch(
        /\.cae-fieldset__content\[hidden\][^{]*\{[^}]*display:\s*none/,
      );
    });
  });
});
