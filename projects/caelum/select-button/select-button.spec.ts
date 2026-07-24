import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeSelectButton, CaeSelectButtonOption } from './select-button';
import { expectNoA11yViolations } from '../testing/a11y';

const OPTIONS: CaeSelectButtonOption[] = [
  { value: 'private', label: 'Private' },
  { value: 'team', label: 'Team' },
  { value: 'public', label: 'Public' },
];

describe('CaeSelectButton', () => {
  let component: CaeSelectButton;
  let fixture: ComponentFixture<CaeSelectButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeSelectButton] }).compileComponents();
    fixture = TestBed.createComponent(CaeSelectButton);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  const group = (): HTMLElement => fixture.nativeElement.querySelector('mat-button-toggle-group');
  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button'));

  it('should create and render one button per option', () => {
    expect(component).toBeTruthy();
    expect(buttons().length).toBe(3);
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Private', 'Team', 'Public']);
  });

  it('has no axe violations (named via ariaLabel, renders inline — no overlay)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Visibility');
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('is a radiogroup with radio children in single-select mode', () => {
    expect(group().getAttribute('role')).toBe('radiogroup');
    expect(buttons()[0].getAttribute('role')).toBe('radio');
  });

  it('reflects a single value written by the form model (writeValue)', () => {
    component.writeValue('team');
    fixture.detectChanges();
    expect(buttons()[1].getAttribute('aria-checked')).toBe('true');
    expect(buttons()[0].getAttribute('aria-checked')).toBe('false');
  });

  it('propagates a single selection back to the form (registerOnChange)', () => {
    let latest: string | string[] | undefined;
    component.registerOnChange((v) => (latest = v));
    buttons()[0].click();
    fixture.detectChanges();
    expect(latest).toBe('private');
  });

  it('is a group of pressable buttons and yields an array value in multiple mode', async () => {
    // Material's MatButtonToggleGroup builds its SelectionModel once at ngOnInit from `multiple`,
    // so it must be set before the group's first render — bind it up front, as a consumer would.
    const f = TestBed.createComponent(CaeSelectButton);
    f.componentRef.setInput('options', OPTIONS);
    f.componentRef.setInput('multiple', true);
    await f.whenStable();
    const grp = (): HTMLElement => f.nativeElement.querySelector('mat-button-toggle-group');
    const btns = (): HTMLButtonElement[] => Array.from(f.nativeElement.querySelectorAll('button'));
    expect(grp().getAttribute('role')).toBe('group');
    expect(btns()[0].getAttribute('role')).toBe('button');

    let latest: string | string[] | undefined;
    f.componentInstance.registerOnChange((v) => (latest = v));
    btns()[0].click();
    btns()[2].click();
    f.detectChanges();
    expect(Array.isArray(latest)).toBe(true);
    expect(latest).toContain('private');
    expect(latest).toContain('public');
    expect((latest as string[]).length).toBe(2);
    expect(btns()[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('marks touched on blur (registerOnTouched via focusout)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    group().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(touched).toBe(true);
  });

  it('disables every option when the form model disables it (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });

  it('disables via the template input too (merged with the form model)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });

  it('disables a single option via option.disabled', async () => {
    fixture.componentRef.setInput('options', [
      { value: 'private', label: 'Private' },
      { value: 'team', label: 'Team', disabled: true },
      { value: 'public', label: 'Public' },
    ] satisfies CaeSelectButtonOption[]);
    await fixture.whenStable();
    expect(buttons()[1].disabled).toBe(true);
    expect(buttons()[0].disabled).toBe(false);
  });

  it('names the group via ariaLabel', () => {
    fixture.componentRef.setInput('ariaLabel', 'Workspace visibility');
    fixture.detectChanges();
    expect(group().getAttribute('aria-label')).toBe('Workspace visibility');
  });

  it('forwards ariaDescribedby onto every option button (the consumer-error a11y hook, #47)', async () => {
    // Absent by default; applied directly to each inner <button> since mat-button-toggle has no
    // aria-describedby input.
    expect(buttons().some((b) => b.hasAttribute('aria-describedby'))).toBe(false);
    fixture.componentRef.setInput('ariaDescribedby', 'vis-hint');
    await fixture.whenStable();
    expect(buttons().every((b) => b.getAttribute('aria-describedby') === 'vis-hint')).toBe(true);
  });

  it('re-applies ariaDescribedby to buttons stamped after an options change (afterRenderEffect)', async () => {
    fixture.componentRef.setInput('ariaDescribedby', 'vis-hint');
    await fixture.whenStable();
    expect(buttons().every((b) => b.getAttribute('aria-describedby') === 'vis-hint')).toBe(true);
    // A fourth option is stamped later — the render effect must re-run and describe it too.
    fixture.componentRef.setInput('options', [...OPTIONS, { value: 'org', label: 'Org' }]);
    await fixture.whenStable();
    expect(buttons().length).toBe(4);
    expect(buttons().every((b) => b.getAttribute('aria-describedby') === 'vis-hint')).toBe(true);
  });

  it('reflects a multiple-mode array value written by the form model (writeValue form→UI)', async () => {
    const f = TestBed.createComponent(CaeSelectButton);
    f.componentRef.setInput('options', OPTIONS);
    f.componentRef.setInput('multiple', true);
    await f.whenStable();
    const btns = (): HTMLButtonElement[] => Array.from(f.nativeElement.querySelectorAll('button'));
    f.componentInstance.writeValue(['private', 'public']);
    f.detectChanges();
    expect(btns()[0].getAttribute('aria-pressed')).toBe('true');
    expect(btns()[1].getAttribute('aria-pressed')).toBe('false');
    expect(btns()[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('drives aria-required on the group when required (the cae-radio-parity a11y seam)', () => {
    expect(group().getAttribute('aria-required')).toBeNull();
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(group().getAttribute('aria-required')).toBe('true');
  });
});
