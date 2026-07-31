import { COMMA, DOWN_ARROW, ENTER } from '@angular/cdk/keycodes';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { CaeAutocomplete, CaeAutocompleteOption } from './autocomplete';
import { expectAnnouncedErrorState, expectNoA11yViolations } from '../testing/a11y';

/**
 * Most tests here drive the CVA + the client-side filter at the component boundary: `writeValue` →
 * the rendered input display, the `(optionSelected)` handler → the committed value, `(input)` → the
 * filtered list, and the strict blur reconciliation. The error-forwarding bridge is exercised
 * through a host with a real `[formControl]`.
 *
 * The panel DOES attach in jsdom — the "#897 regression (real events)" block below opens it with
 * real focusin/input/keydown dispatches; this file's original header claimed the opposite ("needs
 * real focus/layout to attach") and that claim was what let #897 ship. Migrating the remaining
 * handler-call tests to real dispatched events is #900.
 */
const OPTIONS: CaeAutocompleteOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'de', label: 'Germany', disabled: true },
];

describe('CaeAutocomplete', () => {
  let component: CaeAutocomplete;
  let fixture: ComponentFixture<CaeAutocomplete>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
    fixture = TestBed.createComponent(CaeAutocomplete);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    await fixture.whenStable();
  });

  const inputEl = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
  // The (optionSelected) template binding passes $event.option.value straight to the handler.
  const pick = (value: string): void => component['onSelected'](value);

  it('creates and renders a matInput wired to a mat-autocomplete', () => {
    expect(component).toBeTruthy();
    expect(inputEl()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('mat-autocomplete')).not.toBeNull();
  });

  it('has no axe violations (named via ariaLabel; the open panel is an axe gap ticketed in #899)', async () => {
    // Named via ariaLabel, not the visible [label] — mat-form-field's MDC floating label is
    // CSS-positioned and axe judges it "hidden" in jsdom (same fix as input.spec.ts). The panel
    // CAN attach in jsdom (see the #897 real-event block) — scanning the open-panel state is part
    // of the #899/#900 test-debt work, not this closed-state scan.
    fixture.componentRef.setInput('ariaLabel', 'Country');
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('renders the chosen label in the input when the form writes a value (writeValue)', async () => {
    component.writeValue('uk');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['selectedOption']()?.label).toBe('United Kingdom');
    expect(inputEl().value).toBe('United Kingdom');
  });

  it('commits the chosen suggestion key when an option is selected (registerOnChange)', () => {
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    pick('us');
    expect(latest).toBe('us');
    expect(component['value']()).toBe('us');
  });

  it('does not echo onChange when the form writes a value (the CVA no-echo invariant)', () => {
    let calls = 0;
    component.registerOnChange(() => calls++);
    component.writeValue('uk');
    fixture.detectChanges();
    expect(calls).toBe(0);
  });

  it('filters the suggestions by the typed text (case-insensitive label match)', () => {
    component['onType']('king'); // matches "United Kingdom"
    expect(component['filtered']().map((o) => o.value)).toEqual(['uk']);
  });

  it('shows all suggestions when nothing is typed, or when the input still shows the chosen label', () => {
    expect(component['filtered']().length).toBe(3); // empty query → all
    component.writeValue('us');
    fixture.detectChanges();
    component['onType']('United States'); // equals the chosen label → not a filter, show all
    expect(component['filtered']().length).toBe(3);
  });

  it('resets the filter query on a programmatic write so the panel is not stale-filtered (#121 review)', () => {
    // Regression for the CONFIRMED MAJOR: a prior filter left `query` stale, then a form patch/reset
    // (writeValue) must not leave the panel filtered by the old text.
    component['onType']('king'); // query='king' → filters to only United Kingdom
    expect(component['filtered']().length).toBe(1);
    component.writeValue('us'); // a programmatic write (form patch / reset)
    fixture.detectChanges();
    expect(component['filtered']().length).toBe(3); // full list again, not the stale [uk]
  });

  it('clears whitespace-only text on blur even when the model is already empty', () => {
    const el = inputEl();
    el.value = '   ';
    component['onBlur'](el); // model already '' → no commit fires, so onBlur must clear directly
    expect(el.value).toBe('');
  });

  it('honours a custom filterWith predicate', () => {
    fixture.componentRef.setInput('filterWith', (o: CaeAutocompleteOption, q: string) =>
      o.value.startsWith(q),
    );
    component['onType']('u'); // both us + uk start with "u"
    expect(
      component['filtered']()
        .map((o) => o.value)
        .sort(),
    ).toEqual(['uk', 'us']);
  });

  it('reverts un-selected typed text to the chosen label on blur (strict combobox)', () => {
    let calls = 0;
    component.writeValue('us');
    fixture.detectChanges();
    component.registerOnChange(() => calls++);
    const el = inputEl();
    el.value = 'typed but never picked';
    component['query'].set(el.value);
    component['onBlur'](el);
    expect(el.value).toBe('United States'); // reverted to the committed label
    expect(calls).toBe(0); // model unchanged — no spurious commit
  });

  it('commits the empty selection when the input is cleared then blurred', () => {
    let latest: unknown = 'unset';
    component.writeValue('us');
    fixture.detectChanges();
    component.registerOnChange((v) => (latest = v));
    const el = inputEl();
    el.value = '';
    component['onBlur'](el);
    expect(latest).toBe('');
    expect(component['value']()).toBe('');
  });

  it('marks touched on blur (registerOnTouched)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    component['onBlur'](inputEl());
    expect(touched).toBe(true);
  });

  it('disables the input via the form model and the template input (merged)', () => {
    component.setDisabledState(true);
    fixture.detectChanges();
    expect(inputEl().disabled).toBe(true);
    component.setDisabledState(false);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(inputEl().disabled).toBe(true);
  });

  it('coerces a bare disabled attribute (booleanAttribute, from the base)', () => {
    fixture.componentRef.setInput('disabled', '');
    fixture.detectChanges();
    expect(component.disabled()).toBe(true);
  });

  it('marks the input required when required is set', () => {
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(inputEl().required).toBe(true);
  });
});

// --- freeText: the value may be what was typed (#120, p-autocomplete forceSelection=false) ---
describe('CaeAutocomplete — freeText', () => {
  let component: CaeAutocomplete;
  let fixture: ComponentFixture<CaeAutocomplete>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
    fixture = TestBed.createComponent(CaeAutocomplete);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('freeText', true);
    await fixture.whenStable();
  });

  const inputEl = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

  it('commits un-selected typed text on blur instead of reverting it', () => {
    let latest: unknown = 'unset';
    component.registerOnChange((v) => (latest = v));
    const el = inputEl();
    el.value = 'Freedonia';
    component['query'].set(el.value);
    component['onBlur'](el);
    expect(latest).toBe('Freedonia');
    expect(component['value']()).toBe('Freedonia');
  });

  it('displays a free-text value rather than blanking it (no matching option)', async () => {
    component.writeValue('Freedonia');
    fixture.detectChanges();
    await fixture.whenStable();
    // Strict mode renders '' here (selectedOption is undefined); freeText must show the value itself,
    // or the afterRenderEffect would erase what the user just committed.
    expect(component['selectedOption']()).toBeUndefined();
    expect(inputEl().value).toBe('Freedonia');
  });

  it('does NOT clobber a picked suggestion key when its label is blurred untouched', () => {
    // The regression this guards: blur compares the field against the DISPLAYED text, not the model.
    // Comparing against the model ('us') would see 'United States' as new free text and commit the
    // label over the key — silently corrupting a correctly-picked value on a mere focus change.
    component['onSelected']('us');
    fixture.detectChanges();
    let calls = 0;
    component.registerOnChange(() => calls++);
    const el = inputEl();
    el.value = 'United States';
    component['onBlur'](el);
    expect(component['value']()).toBe('us');
    expect(calls).toBe(0);
  });

  it('commits the empty value when cleared, and normalizes whitespace-only text', () => {
    component.writeValue('Freedonia');
    fixture.detectChanges();
    const el = inputEl();
    el.value = '   ';
    component['onBlur'](el);
    expect(component['value']()).toBe('');
    expect(el.value).toBe('');
  });

  it('resolves typed text that matches an option key to that option label', () => {
    const el = inputEl();
    el.value = 'us';
    component['onBlur'](el);
    expect(component['value']()).toBe('us');
    expect(el.value).toBe('United States'); // displayText() re-read after the commit
  });
});

// --- multiple: the tag-entry form control (#120 / D-549, p-chips' replacement) ---
describe('CaeAutocomplete — multiple (chips)', () => {
  let component: CaeAutocomplete;
  let fixture: ComponentFixture<CaeAutocomplete>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
    fixture = TestBed.createComponent(CaeAutocomplete);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('multiple', true);
    await fixture.whenStable();
  });

  const chipEls = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('mat-chip-row'));
  const chipText = (): string[] => chipEls().map((c) => c.textContent!.trim());
  const inputEl = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

  it('stamps the chip-grid arm and no bare matInput', () => {
    expect(fixture.nativeElement.querySelector('mat-chip-grid')).not.toBeNull();
    expect(component['chipGrid']()).toBeTruthy();
    expect(component['matInput']()).toBeUndefined();
  });

  it('renders a chip per committed key, labelled from the options', async () => {
    component.writeValue(['us', 'uk']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chipText()).toEqual(['United States', 'United Kingdom']);
  });

  it('appends the chosen suggestion as a chip and commits an array', () => {
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    component['onSelected']('us');
    expect(latest).toEqual(['us']);
    component['onSelected']('uk');
    expect(latest).toEqual(['us', 'uk']);
  });

  it('rejects a duplicate pick rather than throwing NG0955 out of the @for', async () => {
    component['onSelected']('us');
    let calls = 0;
    component.registerOnChange(() => calls++);
    component['onSelected']('us');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['us']);
    expect(calls).toBe(0); // no commit at all — not merely a de-duplicated one
    expect(chipEls().length).toBe(1);
  });

  it('de-duplicates an incoming form value at the trust boundary', async () => {
    // The form model is external data; a repeat would throw NG0955 when the @for renders it.
    component.writeValue(['us', 'uk', 'us']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['us', 'uk']);
    expect(chipEls().length).toBe(2);
  });

  it('drops already-taken options from the panel (a dead click otherwise)', () => {
    expect(component['filtered']().length).toBe(3);
    component['onSelected']('us');
    expect(component['filtered']().map((o) => o.value)).toEqual(['uk', 'de']);
  });

  it('keeps filtering when the query equals an existing chip label', () => {
    // selectedOption() must read as "no single pick" in chip mode. Otherwise the first chip's option
    // answers it, the query trips filtered()'s "the input still shows the chosen label" early-return,
    // and the panel silently stops filtering for that one query.
    component['onSelected']('us');
    component['onType']('United States');
    expect(component['filtered']()).toEqual([]);
    expect(component['selectedOption']()).toBeUndefined();
  });

  it('removes a chip and commits the shortened array', () => {
    component.writeValue(['us', 'uk']);
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    component['removeChip']('us');
    expect(latest).toEqual(['uk']);
    component['removeChip']('nope'); // absent → no commit
    expect(latest).toEqual(['uk']);
  });

  it('reads the shared empty value as no chips, and a stray string as one chip', () => {
    expect(component['value']()).toBe(''); // emptyValue() cannot see [multiple] — it is a field init
    expect(component['chipValues']()).toEqual([]);
    component.writeValue('us'); // a mode flip, or a single-valued model
    expect(component['chipValues']()).toEqual(['us']);
  });

  it('returns an empty chip-mode display — the DOM clear itself lives in onSelected (#897)', () => {
    // The trigger routes this '' to MatChipGrid.value (inert), never the DOM input; asserting ''
    // here only pins the _previousValue bookkeeping. The real clear is asserted by the #897
    // real-event regression block.
    expect(component['displayFn']('us')).toBe('');
  });

  it('labels a chip with no matching option by its raw value (free-text tags)', () => {
    expect(component['chipLabel']('us')).toBe('United States');
    expect(component['chipLabel']('Freedonia')).toBe('Freedonia');
  });

  it('keeps the panel filtered by an in-progress token across a form write', () => {
    // Single mode resets the query on writeValue because the effect also rewrites the field. Chip mode
    // has no such rewrite, so resetting it alone would leave the panel unfiltered under visible text.
    component['onType']('king');
    expect(component['filtered']().map((o) => o.value)).toEqual(['uk']);
    component.writeValue(['de']);
    expect(component['query']()).toBe('king');
    expect(component['filtered']().map((o) => o.value)).toEqual(['uk']);
  });

  it('leaves a partly-typed token alone when focus leaves the widget, but marks touched (#898)', () => {
    let touched = false;
    component.registerOnTouched(() => (touched = true));
    const el = inputEl();
    el.value = 'Free';
    // A real focusout with no relatedTarget (focus went to nothing focusable) = leaving the widget.
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(el.value).toBe('Free'); // visibly uncommitted; the chip arm must never blur-reconcile
    expect(touched).toBe(true);
  });
});

// --- multiple + freeText: arbitrary tag entry (the shape p-chips served) ---
describe('CaeAutocomplete — multiple + freeText', () => {
  let component: CaeAutocomplete;
  let fixture: ComponentFixture<CaeAutocomplete>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
    fixture = TestBed.createComponent(CaeAutocomplete);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('multiple', true);
    fixture.componentRef.setInput('freeText', true);
    await fixture.whenStable();
  });

  const inputEl = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
  const tokenEvent = (value: string) => {
    const input = inputEl();
    input.value = value;
    return {
      input,
      value,
      chipInput: { clear: () => (input.value = '') },
    } as unknown as Parameters<CaeAutocomplete['onTokenEnd']>[0];
  };

  it('commits a typed token as a chip and clears the field', () => {
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    component['onTokenEnd'](tokenEvent('urgent'));
    expect(latest).toEqual(['urgent']);
    expect(inputEl().value).toBe('');
  });

  it('does not stuff a committed chip back into the token field', async () => {
    // The display-reconciling afterRenderEffect must skip chip mode. Without that guard displayText()
    // resolves to the first chip's value under freeText, and the next render writes it into the field
    // the user is still typing into. Asserting before a render pass would never see it.
    component['onTokenEnd'](tokenEvent('urgent'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['urgent']);
    expect(inputEl().value).toBe('');
  });

  it('swallows a blank or whitespace-only token but still clears', () => {
    let calls = 0;
    component.registerOnChange(() => calls++);
    component['onTokenEnd'](tokenEvent('   '));
    expect(calls).toBe(0);
    expect(inputEl().value).toBe('');
  });

  it('rejects a token duplicating an existing chip', () => {
    component['onTokenEnd'](tokenEvent('urgent'));
    let calls = 0;
    component.registerOnChange(() => calls++);
    component['onTokenEnd'](tokenEvent('urgent'));
    expect(component['chipValues']()).toEqual(['urgent']);
    expect(calls).toBe(0);
  });

  it('lists COMMA as the only separator, only under freeText — never ENTER (#897)', () => {
    // Material's separator path is key-agnostic and preventDefault()s unconditionally, so a listed
    // ENTER cannot be told apart from a COMMA when deciding whether the panel owns the keystroke
    // (that ambiguity dead-keyed COMMA whenever a suggestion was highlighted). Enter goes through
    // the component's own (keydown.enter) handler instead. In strict mode a listed ENTER would
    // also swallow the Enter submitting the surrounding form.
    expect(component['separatorKeyCodes']()).toEqual([COMMA]);
    fixture.componentRef.setInput('freeText', false);
    expect(component['separatorKeyCodes']()).toEqual([]);
  });

  it('pins the trigger accessors onEnterKey arbitrates with (panelOpen / activeOption)', () => {
    // A silent upstream rename would make onEnterKey's optional-chained reads yield undefined and
    // the guard mis-arbitrate; 'in' walks the prototype chain, where Material's accessors live.
    // The behaviour itself is asserted by the #897 real-event block.
    const trigger = component['autocompleteTrigger']()!;
    expect(trigger).toBeTruthy();
    expect('panelOpen' in trigger).toBe(true);
    expect('activeOption' in trigger).toBe(true);
  });
});

// --- #897 regression: REAL dispatched events, not handler calls ---
// Every event here goes through the DOM, so the full Material seam runs — MatChipInput._keydown,
// MatAutocompleteTrigger._handleKeydown, MatOption's click handling, and the CDK overlay panel,
// which attaches fine in jsdom. Fabricated-event handler calls were exactly what let #897 ship
// (#900): the old suite asserted a test-owned `chipInput.clear()` stub instead of Material.
describe('CaeAutocomplete — #897 regression (real events, multiple mode)', () => {
  let component: CaeAutocomplete;
  let fixture: ComponentFixture<CaeAutocomplete>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
    fixture = TestBed.createComponent(CaeAutocomplete);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('multiple', true);
    fixture.componentRef.setInput('freeText', true);
    await fixture.whenStable();
  });

  const inputEl = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

  /** Dispatch a real cancelable keydown; returns false iff something preventDefault()ed it. */
  const keydown = (keyCode: number, key: string): boolean => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { get: () => keyCode });
    return inputEl().dispatchEvent(event);
  };

  /** Real focusin + input events — the path that opens the panel and feeds the filter. */
  const type = async (text: string): Promise<void> => {
    const el = inputEl();
    el.focus();
    el.dispatchEvent(new Event('focusin', { bubbles: true }));
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** The options of THIS input's open panel, resolved via aria-controls (a closed panel lingers). */
  const panelOptions = (): NodeListOf<HTMLElement> => {
    const panelId = inputEl().getAttribute('aria-controls');
    expect(panelId).toBeTruthy(); // vacuity guard: no panel id means the panel never opened
    return document.getElementById(panelId!)!.querySelectorAll('mat-option');
  };

  it('clears the field on a mouse pick, so a later separator cannot commit the stale text', async () => {
    await type('Unit');
    const options = panelOptions();
    expect(options[0].textContent).toContain('United States');
    options[0].click(); // a real mouse pick — no assumption about directive ordering
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['us']);
    expect(inputEl().value).toBe(''); // the shipped bug: 'Unit' stayed in the field
    keydown(COMMA, ','); // the second half of the data defect: stale text became a second chip
    expect(component['chipValues']()).toEqual(['us']);
  });

  it('adds exactly one chip when Enter picks the highlighted suggestion', async () => {
    await type('Unit');
    keydown(DOWN_ARROW, 'ArrowDown');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['autocompleteTrigger']()!.activeOption).toBeTruthy(); // vacuity guard
    keydown(ENTER, 'Enter');
    fixture.detectChanges();
    await fixture.whenStable();
    // The shipped bug committed ['us', 'Unit'] — the typed prefix alongside the pick.
    expect(component['chipValues']()).toEqual(['us']);
    expect(inputEl().value).toBe('');
  });

  it('commits the token on COMMA even while a suggestion is highlighted (the dead-key half)', async () => {
    fixture.componentRef.setInput('autoActiveFirstOption', true);
    await type('unit');
    expect(component['autocompleteTrigger']()!.activeOption).toBeTruthy(); // vacuity guard
    keydown(COMMA, ',');
    fixture.detectChanges();
    await fixture.whenStable();
    // The shipped key-agnostic guard swallowed this COMMA entirely: no chip, no comma, no change.
    expect(component['chipValues']()).toEqual(['unit']);
    expect(inputEl().value).toBe('');
  });

  it('commits the token on Enter when the highlighted suggestion is disabled', async () => {
    // Only ArrowDown can land here: autoActiveFirstOption skips disabled options at the source
    // (_resetActiveItem walks to the first ENABLED one), but the key manager's arrow navigation
    // does not (MatAutocomplete._skipPredicate returns false).
    await type('germ'); // matches only the disabled 'Germany'
    keydown(DOWN_ARROW, 'ArrowDown');
    fixture.detectChanges();
    await fixture.whenStable();
    const active = component['autocompleteTrigger']()!.activeOption;
    expect(active?.disabled).toBe(true); // vacuity guard: the precondition is a DISABLED highlight
    keydown(ENTER, 'Enter');
    fixture.detectChanges();
    await fixture.whenStable();
    // Shipped: the trigger swallowed the Enter, its selection no-op'd, and the guard returned —
    // a dead key. The token is the only meaningful outcome left for that keystroke.
    expect(component['chipValues']()).toEqual(['germ']);
    expect(inputEl().value).toBe('');
  });

  // In the live listener ordering (host listeners register before template listeners) the trigger
  // always runs first, so onEnterKey's panel guard only ever fires in the OTHER ordering — which a
  // dispatched event cannot produce. These two drive the handler directly against REAL trigger
  // state (no mocks) so the ordering insurance stays tested rather than inert; the two-directives-
  // one-key lesson is that this ordering is observed, not contractual.
  it('yields to the panel when a selectable suggestion is highlighted (ours-first ordering)', async () => {
    await type('Unit');
    keydown(DOWN_ARROW, 'ArrowDown');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['autocompleteTrigger']()!.activeOption).toBeTruthy(); // vacuity guard
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    component['onEnterKey'](event, inputEl());
    expect(component['chipValues']()).toEqual([]); // the trigger's selection owns this keystroke
    expect(inputEl().value).toBe('Unit'); // untouched — onSelected will clear it
    expect(event.defaultPrevented).toBe(false); // the trigger, not us, consumes it
  });

  it('does NOT yield to a disabled highlight even in ours-first ordering', async () => {
    await type('germ');
    keydown(DOWN_ARROW, 'ArrowDown');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['autocompleteTrigger']()!.activeOption?.disabled).toBe(true); // vacuity guard
    component['onEnterKey'](
      new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
      inputEl(),
    );
    expect(component['chipValues']()).toEqual(['germ']); // a no-op selection is nobody's keystroke
  });

  it('swallows a blank freeText Enter (separator parity), but leaves strict-mode Enter alone', async () => {
    inputEl().focus();
    expect(keydown(ENTER, 'Enter')).toBe(false); // preventDefault'd: mid-entry Enter ≠ form submit
    expect(component['chipValues']()).toEqual([]);
    fixture.componentRef.setInput('freeText', false);
    fixture.detectChanges();
    await fixture.whenStable();
    // Strict mode with nothing highlighted: Enter must stay live for the surrounding form.
    expect(keydown(ENTER, 'Enter')).toBe(true);
    expect(component['chipValues']()).toEqual([]);
  });
});

// --- Error-forwarding bridge (needs a real NgControl on the OUTER element) ---
@Component({
  imports: [CaeAutocomplete, ReactiveFormsModule],
  template: `
    <cae-autocomplete
      [formControl]="ctrl"
      [options]="opts"
      [errorMessages]="{ required: 'Pick a country' }"
      label="Country"
      ariaLabel="Country"
    />
  `,
})
class HostCmp {
  readonly ctrl = new FormControl('', { validators: [Validators.required] });
  readonly opts = OPTIONS;
}

@Component({
  imports: [CaeAutocomplete, ReactiveFormsModule],
  template: `
    <cae-autocomplete
      multiple
      freeText
      [formControl]="ctrl"
      [options]="opts"
      [errorMessages]="{ required: 'Add at least one tag' }"
      label="Tags"
      ariaLabel="Tags"
    />
  `,
})
class MultipleHostCmp {
  readonly ctrl = new FormControl<string[]>([], { validators: [Validators.required] });
  readonly opts = OPTIONS;
}

describe('CaeAutocomplete — multiple, inside a real form field', () => {
  let fixture: ComponentFixture<MultipleHostCmp>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(MultipleHostCmp);
    await fixture.whenStable();
  });

  it('resolves the chip grid as the form field control (a query across the @if arm)', () => {
    // mat-form-field finds its MatFormFieldControl by CONTENT QUERY, and both mode arms are declared
    // inside this component's template — the declaration site is what such a query resolves by. If the
    // @if arm put the grid out of scope, Material would throw getMatFormFieldMissingControlError() on
    // first render, so reaching this line at all is the assertion; the floating label proves it further
    // by having something to attach to.
    const field = fixture.nativeElement.querySelector('.mat-mdc-form-field');
    expect(field).not.toBeNull();
    expect(fixture.nativeElement.querySelector('mat-label')!.textContent).toContain('Tags');
    expect(fixture.nativeElement.querySelector('mat-chip-grid')).not.toBeNull();
  });

  it('round-trips the chip value through the bound form control', async () => {
    const host = fixture.componentInstance;
    host.ctrl.setValue(['us', 'uk']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('mat-chip-row').length).toBe(2);
    expect(host.ctrl.valid).toBe(true);
  });

  it('forwards the bound control validity into a <mat-error> once touched', async () => {
    const host = fixture.componentInstance;
    expect(host.ctrl.valid).toBe(false); // required rejects []
    expect(fixture.nativeElement.querySelector('mat-error')).toBeNull();
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement;
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('Add at least one tag');
  });

  it('announces the error state — message linked, subtree axe-clean', async () => {
    fixture.componentInstance.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await expectAnnouncedErrorState(fixture.nativeElement, 'Add at least one tag');
  });

  it('has no axe violations with chips rendered (not just the pristine empty state)', async () => {
    // A one-per-component sweep scans the empty field; the chips, their remove buttons, and the
    // grid/row/cell roles only exist once the control holds a value (#773).
    fixture.componentInstance.ctrl.setValue(['us', 'Freedonia']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('mat-chip-row').length).toBe(2);
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('names each remove button after its chip', async () => {
    fixture.componentInstance.ctrl.setValue(['us']);
    fixture.detectChanges();
    await fixture.whenStable();
    const remove = fixture.nativeElement.querySelector('[matChipRemove]') as HTMLElement;
    expect(remove.getAttribute('aria-label')).toBe('Remove United States');
  });

  // --- #898 regression: touched semantics via real dispatched focusout, never onBlur calls ---
  it('surfaces the required error after chip-only interaction, once focus leaves (#898 under-fire)', async () => {
    // The shipped bug: onTouched was reachable only from the input's focusout, chips are the
    // grid's children, and Material's own _markAsTouched is disconnected by design (#46) — so a
    // user emptying the field by clicking × alone was dirty-but-never-touched and <mat-error>
    // (trigger: invalid && touched) never rendered.
    const host = fixture.componentInstance;
    host.ctrl.setValue(['us', 'uk']);
    fixture.detectChanges();
    await fixture.whenStable();
    let remove: HTMLElement | null;
    while ((remove = fixture.nativeElement.querySelector('[matChipRemove]'))) {
      remove.click(); // the × alone — the input is never focused
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(host.ctrl.value).toEqual([]);
    expect(host.ctrl.valid).toBe(false); // required rejects []
    expect(host.ctrl.touched).toBe(false); // still inside the widget — not yet an error moment
    const grid = fixture.nativeElement.querySelector('mat-chip-grid') as HTMLElement;
    grid.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.ctrl.touched).toBe(true);
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement;
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('Add at least one tag');
  });

  it('does not mark touched on focus moves within the widget (#898 over-fire)', async () => {
    const host = fixture.componentInstance;
    host.ctrl.setValue(['us']);
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLElement;
    const chip = fixture.nativeElement.querySelector('mat-chip-row') as HTMLElement;
    // Backspace-into-chips / Shift+Tab: input → chip.
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: chip }));
    // chip → input: the input is a DOM SIBLING of <mat-chip-grid>, so a grid-scoped containment
    // check would wrongly fire here — the gate must test the component host.
    chip.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: input }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.ctrl.touched).toBe(false);
  });
});

describe('CaeAutocomplete — validation-error forwarding', () => {
  it('forwards the bound control validity into a <mat-error> once touched', async () => {
    const fixture = TestBed.createComponent(HostCmp);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    // Untouched required-empty: invalid but no error shown yet (library-wide timing).
    expect(fixture.nativeElement.querySelector('mat-error')).toBeNull();
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    const error = fixture.nativeElement.querySelector('mat-error') as HTMLElement;
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('Pick a country');
  });

  // The error state, not the pristine one (#785). The inner control is a matInput carrying
  // role="combobox" + the overlay's aria-expanded/-controls, so the error's describedby id lands
  // alongside the combobox wiring — the arrangement most likely to drop one of the two.
  it('announces the error state — message linked, subtree axe-clean', async () => {
    const fixture = TestBed.createComponent(HostCmp);
    await fixture.whenStable();
    fixture.componentInstance.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await expectAnnouncedErrorState(fixture.nativeElement, 'Pick a country');
  });
});
