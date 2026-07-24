import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeChip } from './chip';
import { expectNoA11yViolations } from '../testing/a11y';

@Component({
  imports: [CaeChip],
  template: `
    <cae-chip
      [removable]="removable"
      [disabled]="disabled"
      [removeAriaLabel]="removeLabel"
      (removed)="removedCount = removedCount + 1"
      >{{ label }}</cae-chip
    >
  `,
})
class ChipHost {
  label = 'alpha';
  removable = false;
  disabled = false;
  removeLabel = 'Remove';
  removedCount = 0;
}

describe('CaeChip', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChipHost] }).compileComponents();
  });

  const make = async (
    setup: (h: ChipHost) => void = () => {},
  ): Promise<ComponentFixture<ChipHost>> => {
    const f = TestBed.createComponent(ChipHost);
    setup(f.componentInstance);
    await f.whenStable();
    return f;
  };
  const chip = (f: ComponentFixture<ChipHost>): HTMLElement =>
    f.nativeElement.querySelector('mat-chip');
  const removeBtn = (f: ComponentFixture<ChipHost>): HTMLButtonElement | null =>
    chip(f).querySelector('button');

  it('has no axe violations (removable chip with a named remove button)', async () => {
    const f = await make((h) => (h.removable = true));
    await expectNoA11yViolations(f.nativeElement);
  });

  it('renders the projected label', async () => {
    const f = await make();
    expect(chip(f)).not.toBeNull();
    expect(chip(f).textContent).toContain('alpha');
  });

  it('shows no remove affordance by default (removable defaults false, p-chip parity)', async () => {
    const f = await make();
    expect(removeBtn(f)).toBeNull();
  });

  it('shows a named remove button when removable', async () => {
    const f = await make((h) => (h.removable = true));
    expect(removeBtn(f)).not.toBeNull();
    expect(removeBtn(f)!.getAttribute('aria-label')).toBe('Remove');
    expect(removeBtn(f)!.type).toBe('button');
  });

  it('emits (removed) when the remove button is clicked', async () => {
    const f = await make((h) => (h.removable = true));
    removeBtn(f)!.click();
    await f.whenStable();
    expect(f.componentInstance.removedCount).toBe(1);
  });

  it('lets the consumer name the remove button', async () => {
    const f = await make((h) => {
      h.removable = true;
      h.removeLabel = 'Remove alpha';
    });
    expect(removeBtn(f)!.getAttribute('aria-label')).toBe('Remove alpha');
  });

  it('reflects the disabled state on the chip', async () => {
    const f = await make((h) => (h.disabled = true));
    expect(chip(f).classList).toContain('mat-mdc-chip-disabled');
  });

  it('makes the remove button keyboard-reachable (tabindex 0, overriding Material’s default -1)', async () => {
    // Regression for the #83 review BLOCKER: a standalone mat-chip has no MatChipSet focus
    // manager, so Material's chip actions stay tabindex="-1" (mouse-only) unless we promote them.
    const f = await make((h) => (h.removable = true));
    expect(removeBtn(f)!.getAttribute('tabindex')).toBe('0');
  });

  it('removes on Enter (keyboard operability, not only mouse)', async () => {
    const f = await make((h) => (h.removable = true));
    const ev = new KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(ev, 'keyCode', { get: () => 13 }); // ENTER — Material reads keyCode
    removeBtn(f)!.dispatchEvent(ev);
    await f.whenStable();
    expect(f.componentInstance.removedCount).toBe(1);
  });

  it('does not remove while disabled', async () => {
    const f = await make((h) => {
      h.removable = true;
      h.disabled = true;
    });
    removeBtn(f)!.click();
    await f.whenStable();
    expect(f.componentInstance.removedCount).toBe(0);
  });
});
