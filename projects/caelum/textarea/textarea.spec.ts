import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaeTextarea } from './textarea';

describe('CaeTextarea', () => {
  let component: CaeTextarea;
  let fixture: ComponentFixture<CaeTextarea>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeTextarea] }).compileComponents();
    fixture = TestBed.createComponent(CaeTextarea);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const nativeArea = (): HTMLTextAreaElement => fixture.nativeElement.querySelector('textarea');

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reflects a value written by the form model (writeValue)', () => {
    component.writeValue('multi\nline');
    fixture.detectChanges();
    expect(nativeArea().value).toBe('multi\nline');
  });

  it('propagates typing back to the form (registerOnChange)', () => {
    let latest: string | undefined;
    component.registerOnChange((v) => (latest = v));
    const el = nativeArea();
    el.value = 'typed';
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(latest).toBe('typed');
  });

  it('forwards rows to the inner textarea', () => {
    fixture.componentRef.setInput('rows', 6);
    fixture.detectChanges();
    expect(nativeArea().rows).toBe(6);
  });

  it('renders the floating label when provided', () => {
    fixture.componentRef.setInput('label', 'Notes');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-label')?.textContent).toContain('Notes');
  });

  it('disables via the template input (merged with setDisabledState)', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(nativeArea().disabled).toBe(true);
  });
});
