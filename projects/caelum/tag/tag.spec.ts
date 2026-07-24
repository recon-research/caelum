import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatChip } from '@angular/material/chips';
import { By } from '@angular/platform-browser';

import { CaeTag } from './tag';
import { expectNoA11yViolations } from '../testing/a11y';

describe('CaeTag', () => {
  let fixture: ComponentFixture<CaeTag>;
  let host: HTMLElement;

  const make = async (setup: () => void = () => {}): Promise<void> => {
    fixture = TestBed.createComponent(CaeTag);
    host = fixture.nativeElement as HTMLElement;
    setup();
    await fixture.whenStable();
  };
  const set = (name: string, value: unknown): void => fixture.componentRef.setInput(name, value);
  const chip = (): HTMLElement | null => host.querySelector('mat-chip');

  it('has no axe violations (labelled, iconed tag)', async () => {
    await make(() => {
      set('value', 'Active');
      set('icon', 'user');
    });
    await expectNoA11yViolations(host);
  });

  it('composes a mat-chip and renders [value] as the label', async () => {
    await make(() => set('value', 'Active'));
    expect(chip()).not.toBeNull();
    expect(host.querySelector('.cae-tag__label')?.textContent?.trim()).toBe('Active');
  });

  it('is static — the standalone chip is not interactive (no option/listitem role, not tabbable)', async () => {
    await make(() => set('value', 'Active'));
    const c = chip()!;
    // A standalone mat-chip defaults role to null (presentational) and joins no set, so it must not
    // present as an interactive listitem/option, and it must not be a tab stop.
    expect(['listitem', 'option', 'button']).not.toContain(c.getAttribute('role'));
    expect(c.getAttribute('tabindex')).not.toBe('0');
  });

  it('disables the chip ripple (the "static, no interactive affordance" contract)', async () => {
    // The static claim rests partly on disableRipple; assert it directly, else removing it regresses
    // silently (the role/tabindex checks alone would still pass).
    await make(() => set('value', 'Active'));
    const chipCmp = fixture.debugElement.query(By.directive(MatChip)).componentInstance as MatChip;
    expect(chipCmp.disableRipple).toBe(true);
  });

  it('applies the severity class', async () => {
    await make(() => set('severity', 'success'));
    expect(chip()!.classList.contains('cae-tag--success')).toBe(true);

    await make(() => set('severity', 'danger'));
    expect(chip()!.classList.contains('cae-tag--danger')).toBe(true);
  });

  it('has no severity class when severity is unset (neutral)', async () => {
    await make(() => set('value', 'Neutral'));
    const c = chip()!;
    for (const s of ['success', 'info', 'warn', 'danger']) {
      expect(c.classList.contains(`cae-tag--${s}`)).toBe(false);
    }
  });

  it('reflects [rounded]', async () => {
    await make(() => set('rounded', true));
    expect(chip()!.classList.contains('cae-tag--rounded')).toBe(true);
  });

  it('renders a registry glyph via [icon]', async () => {
    await make(() => {
      set('value', 'Verified');
      set('icon', 'user');
    });
    expect(host.querySelector('cae-icon')).not.toBeNull();
  });

  it('maps info severity to the primary token (no --cae-color-info exists)', async () => {
    // Documents the #662 decision: info is a real severity, colour-mapped to primary. The class must
    // apply so the stylesheet's primary-token mapping takes effect.
    await make(() => set('severity', 'info'));
    expect(chip()!.classList.contains('cae-tag--info')).toBe(true);
  });
});

@Component({
  imports: [CaeTag],
  template: `
    <cae-tag [value]="value" icon="user" [iconTemplate]="custom">
      <ng-template #custom let-v>glyph:{{ v }}</ng-template>
    </cae-tag>
    <cae-tag>{{ projected }}</cae-tag>
  `,
})
class TagHost {
  value = 'Live';
  projected = 'Projected';
}

describe('CaeTag (templates & projection)', () => {
  let fixture: ComponentFixture<TagHost>;
  let root: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(TagHost);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders the custom iconTemplate with the value as its $implicit context (D-596)', () => {
    const first = root.querySelectorAll('cae-tag')[0];
    // The custom glyph escape hatch receives { $implicit: value } — `let-v` binds the tag's value.
    expect(first.textContent).toContain('glyph:Live');
    // iconTemplate wins over [icon]: the @if/@else-if is mutually exclusive, so the registry glyph
    // must NOT also render (this tag sets BOTH icon="user" and the template).
    expect(first.querySelector('cae-icon')).toBeNull();
  });

  it('renders projected <ng-content> when no [value] is given', () => {
    const second = root.querySelectorAll('cae-tag')[1];
    expect(second.querySelector('.cae-tag__label')?.textContent?.trim()).toBe('Projected');
  });
});
