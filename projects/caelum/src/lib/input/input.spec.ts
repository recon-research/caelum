import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeInput } from './input';

describe('CaeInput', () => {
  let component: CaeInput;
  let fixture: ComponentFixture<CaeInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeInput] }).compileComponents();
    fixture = TestBed.createComponent(CaeInput);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const nativeInput = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue('hello');
    fixture.detectChanges();
    expect(nativeInput().value).toBe('hello');
  });

  it('propagates typing back to the form (registerOnChange)', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const el = nativeInput();
    el.value = 'typed';
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(latest).toBe('typed');
  });

  it('renders the floating label when provided', () => {
    fixture.componentRef.setInput('label', 'Email');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent).toContain('Email');
  });

  it('forwards native attributes to the inner input (autocomplete)', () => {
    fixture.componentRef.setInput('autocomplete', 'email');
    fixture.detectChanges();
    expect(nativeInput().getAttribute('autocomplete')).toBe('email');
  });

  it('disables via the template input (merged with setDisabledState)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(nativeInput().disabled).toBe(true);
  });
});
