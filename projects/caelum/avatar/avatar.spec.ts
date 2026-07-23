import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeAvatar, CaeAvatarGroup } from './avatar';

describe('CaeAvatar', () => {
  let fixture: ComponentFixture<CaeAvatar>;
  let host: HTMLElement;

  const make = async (setup: () => void = () => {}): Promise<void> => {
    fixture = TestBed.createComponent(CaeAvatar);
    host = fixture.nativeElement as HTMLElement;
    setup();
    await fixture.whenStable();
  };
  const set = (name: string, value: unknown): void => fixture.componentRef.setInput(name, value);
  const img = (): HTMLImageElement | null => host.querySelector('img');

  it('renders the image variant with src + alt', async () => {
    await make(() => {
      set('image', 'a.png');
      set('alt', 'Ada');
    });
    expect(img()).not.toBeNull();
    expect(img()!.getAttribute('src')).toBe('a.png');
    expect(img()!.getAttribute('alt')).toBe('Ada');
  });

  it('falls back to the label variant when the image fails to load (no broken image)', async () => {
    await make(() => {
      set('image', 'dead.png');
      set('label', 'AL');
    });
    expect(img()).not.toBeNull();

    img()!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(img()).toBeNull();
    expect(host.querySelector('.cae-avatar__label')?.textContent?.trim()).toBe('AL');
  });

  it('re-arms the fallback when [image] changes (a new URL gets its own chance)', async () => {
    await make(() => {
      set('image', 'dead.png');
      set('label', 'AL');
    });
    img()!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(img()).toBeNull();

    set('image', 'fresh.png');
    await fixture.whenStable();
    expect(img()).not.toBeNull();
    expect(img()!.getAttribute('src')).toBe('fresh.png');
  });

  it('renders the icon variant when there is no image', async () => {
    await make(() => set('icon', 'user'));
    expect(host.querySelector('cae-icon')).not.toBeNull();
  });

  it('prefers the image over icon/label', async () => {
    await make(() => {
      set('image', 'a.png');
      set('icon', 'user');
      set('label', 'AL');
    });
    expect(img()).not.toBeNull();
    expect(host.querySelector('cae-icon')).toBeNull();
    expect(host.querySelector('.cae-avatar__label')).toBeNull();
  });

  it('reflects [shape] and [size]', async () => {
    await make(() => {
      set('shape', 'square');
      set('size', 'xlarge');
    });
    expect(host.classList.contains('cae-avatar--square')).toBe(true);
    expect(host.classList.contains('cae-avatar--xlarge')).toBe(true);
  });

  it('names a meaningful icon-only avatar via [ariaLabel] (role=img)', async () => {
    await make(() => {
      set('icon', 'user');
      set('ariaLabel', 'Current user');
    });
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Current user');
  });

  it('ships a :host([hidden]) display:none guard so overflow members actually hide', () => {
    // The group hides overflow via the [hidden] host binding, but a bare [hidden] only hides in the
    // UA stylesheet, which :host { display: inline-flex } beats — so the guard must be restated at
    // :host specificity. jsdom does no layout, so assert the rule SHIPS (visual hiding is the #240
    // browser pass). Without this the group's overflow feature is silently broken in a browser.
    // Emulated encapsulation rewrites `:host([hidden])` → `[_nghost-…][hidden]`, so match the
    // compiled attribute-selector form paired with display:none.
    const styles = (CaeAvatar as { ɵcmp?: { styles?: string[] } }).ɵcmp?.styles?.join('\n') ?? '';
    expect(styles).toMatch(/\[hidden\][^{]*\{\s*display:\s*none/);
  });
});

@Component({
  imports: [CaeAvatarGroup, CaeAvatar],
  template: `
    <cae-avatar-group [max]="max()">
      @for (a of items; track a) {
        <cae-avatar [label]="a" />
      }
    </cae-avatar-group>
  `,
})
class GroupHost {
  // A signal, not a plain field: in zoneless tests a plain-prop mutation + detectChanges does not
  // push to a child signal input (the initial value binds, later mutations are dropped).
  readonly max = signal<number | undefined>(undefined);
  items = ['A', 'B', 'C', 'D', 'E'];
}

describe('CaeAvatarGroup', () => {
  let fixture: ComponentFixture<GroupHost>;
  let root: HTMLElement;

  const make = async (setup: (h: GroupHost) => void = () => {}): Promise<void> => {
    fixture = TestBed.createComponent(GroupHost);
    setup(fixture.componentInstance);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  };
  // Projected members only (exclude the group's own "+N" overflow avatar).
  const members = (): HTMLElement[] =>
    Array.from(root.querySelectorAll('cae-avatar:not(.cae-avatar-group__overflow)'));
  const overflow = (): HTMLElement | null => root.querySelector('.cae-avatar-group__overflow');

  it('is a labelled group landmark', async () => {
    await make((h) => h.max.set(3));
    const group = root.querySelector('cae-avatar-group')!;
    expect(group.getAttribute('role')).toBe('group');
  });

  it('shows all members and no overflow indicator when no [max]', async () => {
    await make();
    expect(members().length).toBe(5);
    expect(members().every((m) => !m.hidden)).toBe(true);
    expect(overflow()).toBeNull();
  });

  it('hides members past [max] and shows a "+N" overflow indicator', async () => {
    await make((h) => h.max.set(2));
    const m = members();
    expect(m[0].hidden).toBe(false);
    expect(m[1].hidden).toBe(false);
    expect(m[2].hidden).toBe(true);
    expect(m[4].hidden).toBe(true);
    // 5 members, max 2 → "+3".
    expect(overflow()).not.toBeNull();
    expect(overflow()!.textContent).toContain('+3');
  });

  it('overlaps every member past the first (grouped class), not the first', async () => {
    await make((h) => h.max.set(5));
    const m = members();
    expect(m[0].classList.contains('cae-avatar--grouped')).toBe(false);
    expect(m[1].classList.contains('cae-avatar--grouped')).toBe(true);
    expect(m[4].classList.contains('cae-avatar--grouped')).toBe(true);
  });

  it('reacts to a [max] change', async () => {
    await make((h) => h.max.set(4));
    expect(overflow()!.textContent).toContain('+1');

    fixture.componentInstance.max.set(undefined);
    await fixture.whenStable();
    expect(overflow()).toBeNull();
    expect(members().every((m) => !m.hidden)).toBe(true);
  });
});
