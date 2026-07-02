import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatSelect } from '@angular/material/select';

import { CaeSelect, CaeSelectOption } from './select';

const OPTIONS: CaeSelectOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('CaeSelect', () => {
  let component: CaeSelect;
  let fixture: ComponentFixture<CaeSelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeSelect] }).compileComponents();
    fixture = TestBed.createComponent(CaeSelect);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  const matSelect = (): MatSelect =>
    fixture.debugElement.query(By.directive(MatSelect)).componentInstance;

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue('b');
    fixture.detectChanges();
    expect(matSelect().value).toBe('b');
  });

  it('propagates a user choice back to the form (registerOnChange)', async () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    matSelect().open();
    fixture.detectChanges();
    await fixture.whenStable();
    // Options live in the CDK overlay (document body) only while the panel is open.
    const options = document.querySelectorAll<HTMLElement>('mat-option');
    expect(options.length).toBe(OPTIONS.length);
    options[1].click();
    fixture.detectChanges();
    expect(latest).toBe('b');
  });

  it('renders the floating label when provided', () => {
    fixture.componentRef.setInput('label', 'Region');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent).toContain('Region');
  });

  it('disables the control when the form model disables it (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(matSelect().disabled).toBe(true);
  });

  it('marks touched on focusout even if the panel never opened (registerOnTouched)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    const el = fixture.nativeElement.querySelector('mat-select') as HTMLElement;
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
    fixture.detectChanges();
    expect(touched).toBe(true);
  });
});
