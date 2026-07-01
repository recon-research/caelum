import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeRadio, CaeRadioOption } from './radio';

const OPTIONS: CaeRadioOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
];

describe('CaeRadio', () => {
  let component: CaeRadio;
  let fixture: ComponentFixture<CaeRadio>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeRadio] }).compileComponents();
    fixture = TestBed.createComponent(CaeRadio);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  const radios = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input[type="radio"]'));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders one radio per option', () => {
    expect(radios().length).toBe(OPTIONS.length);
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue('b');
    fixture.detectChanges();
    expect(radios()[1].checked).toBe(true);
  });

  it('propagates a user selection back to the form (registerOnChange)', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    radios()[1].click();
    fixture.detectChanges();
    expect(latest).toBe('b');
  });

  it('disables an individual option', () => {
    expect(radios()[2].disabled).toBe(true);
  });

  it('disables the whole group when the form model disables it (setDisabledState)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(radios().every((r) => r.disabled)).toBe(true);
  });

  it('gives an unnamed group a unique fallback name (avoids cross-group collision)', () => {
    const firstName = radios()[0].getAttribute('name');
    expect(firstName).toMatch(/^cae-radio-/);
    // A second unnamed group must not share the name, or Material's global dispatcher
    // would treat the two independent groups as one.
    const other = TestBed.createComponent(CaeRadio);
    other.componentRef.setInput('options', OPTIONS);
    other.detectChanges();
    const otherName = other.nativeElement.querySelector('input[type="radio"]').getAttribute('name');
    expect(otherName).not.toBe(firstName);
  });
});
