import { LiveAnnouncer } from '@angular/cdk/a11y';
import { BACKSPACE, COMMA, DOWN_ARROW, ENTER, ESCAPE } from '@angular/cdk/keycodes';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatChipInput, MatChipRow } from '@angular/material/chips';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { CaeAutocomplete, CaeAutocompleteOption } from './autocomplete';
import { expectAnnouncedErrorState, expectNoA11yViolations } from '../testing/a11y';

/**
 * Two kinds of test live here, and the distinction is the whole lesson of #900.
 *
 * **Real dispatched events** — the "#897 regression", "#899 a11y" and "template wiring" blocks — go
 * through the DOM, so the full Material seam and the template's own bindings run. The panel DOES
 * attach in jsdom; this file's original header claimed the opposite ("needs real focus/layout to
 * attach"), and that false claim is what justified a suite of handler calls, which is what let #897
 * and #898 ship green. Use `realEvents(() => fixture)` for anything whose wiring is at risk.
 *
 * **Direct handler calls** — most of the CVA and filter tests — are kept where the *handler body* is
 * the subject and its binding is pinned elsewhere, plus two deliberate cases (the ours-first Enter
 * ordering, which a dispatched event cannot produce). They are cheap and readable; what they must
 * never be is the ONLY cover for a binding. Measured before this slice: 49 tests, 0 dispatched
 * events, and deleting `(optionSelected)`, `(input)`, `(focusout)`, `[matAutocomplete]` or
 * `[matChipInputSeparatorKeyCodes]` left every one of them passing.
 *
 * Layout and contrast claims live in `autocomplete.browser.spec.ts` (#240) — jsdom lays nothing out,
 * so the chip ×'s WCAG 2.5.8 target box can only be measured against a real engine.
 */
const OPTIONS: CaeAutocompleteOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'de', label: 'Germany', disabled: true },
];

/**
 * The real-event helper set (#900). Three near-identical copies accumulated as the real-event blocks
 * landed one slice at a time (#897, #899, #901); this is the single set they collapse into.
 *
 * These dispatch through the DOM rather than calling the component's protected handlers, so the whole
 * Material seam runs — `MatChipInput._keydown`, `MatAutocompleteTrigger._handleKeydown`, `MatOption`'s
 * click handling, and the CDK overlay panel, which attaches fine in jsdom. A handler call proves the
 * handler body and says nothing about the binding that reaches it, which is exactly how #897 and #898
 * shipped under a green suite.
 *
 * Takes a thunk, not a fixture: most blocks assign theirs in `beforeEach`, so a value captured when
 * the describe body runs would be `undefined`.
 */
function realEvents(getFixture: () => ComponentFixture<unknown>) {
  const inputEl = (): HTMLInputElement => getFixture().nativeElement.querySelector('input');

  const settle = async (): Promise<void> => {
    const fixture = getFixture();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** Dispatch a real cancelable keydown; returns false iff something `preventDefault()`ed it. */
  const keydownOn = (target: EventTarget, keyCode: number, key: string): boolean => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { get: () => keyCode });
    return target.dispatchEvent(event);
  };

  /** The same, aimed at the text input — the common case. */
  const keydown = (keyCode: number, key: string): boolean => keydownOn(inputEl(), keyCode, key);

  /** Real focus + focusin + input — the path that opens the panel and feeds the filter. */
  const type = async (text: string): Promise<void> => {
    const el = inputEl();
    el.focus();
    el.dispatchEvent(new Event('focusin', { bubbles: true }));
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };

  /** The options of THIS input's open panel, resolved via aria-controls (a closed panel lingers). */
  const panelOptions = (): NodeListOf<HTMLElement> => {
    const panelId = inputEl().getAttribute('aria-controls');
    expect(panelId).toBeTruthy(); // vacuity guard: no panel id means the panel never opened
    return document.getElementById(panelId!)!.querySelectorAll('mat-option');
  };

  return { inputEl, settle, keydown, keydownOn, type, panelOptions };
}

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

  it('filters case-insensitively and ignores surrounding whitespace', () => {
    // '  KING  ', not 'king': the query is normalised by `query().trim().toLowerCase()`, and a
    // lower-case probe with no padding exercises neither call — it matched incidentally and left
    // both normalisations unpinned. Upper case kills the toLowerCase, the padding kills the trim.
    component['onType']('  KING  '); // matches "United Kingdom"
    expect(component['filtered']().map((o) => o.value)).toEqual(['uk']);
  });

  it('shows all suggestions when nothing is typed, and filters as soon as something is', () => {
    expect(component['filtered']().length).toBe(3); // empty query → all
    component.writeValue('us');
    fixture.detectChanges();
    // Typing the chosen label back IS typing: it filters (#901). "Nothing typed since a selection"
    // is no longer inferred from the query matching the chosen label — the commit sites clear the
    // query outright, which is what the pick/blur tests below assert.
    component['onType']('United States');
    expect(component['filtered']().map((o) => o.value)).toEqual(['us']);
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

  it('clears whitespace-only text on blur without committing over an already-empty model', () => {
    // Two claims, and the second used to live only in a comment. The `singleValue() !== ''` guard
    // is what stops a pristine field from emitting onChange('') on a mere tab-through — which marks
    // the control dirty and trips a consumer's unsaved-changes prompt over an untouched form.
    let calls = 0;
    component.registerOnChange(() => calls++);
    const el = inputEl();
    el.value = '   ';
    component['onBlur'](el);
    expect(el.value).toBe(''); // onBlur clears directly, since no commit re-renders it
    expect(calls).toBe(0);
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
    // Blur is a commit site in BOTH modes, so it clears the filter query here too (#901) — without
    // this the strict half of that contract is pinned by nothing and a freeText-only clear passes.
    expect(component['query']()).toBe('');
    expect(component['filtered']().length).toBe(3);
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

  it('renders a list-valued model by its FIRST entry rather than as nonsense (#900)', async () => {
    // singleValue()'s list coercion had no test. It exists for a mid-life [multiple] flip and for a
    // model that was always an array; without it `selectedOption()` compares an option key against
    // an ARRAY, matches nothing, and a freeText field would display '[object Object]'-grade text.
    component.writeValue(['uk', 'us']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['selectedOption']()?.label).toBe('United Kingdom');
    expect(inputEl().value).toBe('United Kingdom');
  });

  it('renders BLANK for a value with no matching option in strict mode (#900)', async () => {
    // The documented orphaned-value gap (#120), and the freeText test's exact counterpart: strict
    // mode must not display an uncommittable string as though it were a chosen suggestion.
    component.writeValue('Freedonia');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['selectedOption']()).toBeUndefined(); // vacuity guard: it really is an orphan
    expect(inputEl().value).toBe('');
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
  const { inputEl, keydownOn } = realEvents(() => fixture);

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
    // Both halves of the panel contract at once: the taken option drops out AND the typed text
    // still filters. (Before #901 this also defended filtered()'s coupling to selectedOption() —
    // the first chip's option could answer it and trip a "shows the chosen label" early-return.
    // That proxy is gone; selectedOption() keeps its chip-mode guard because the value seam has no
    // single pick in this mode, which the second assertion pins.)
    component['onSelected']('us');
    component['onType']('United States');
    expect(component['filtered']()).toEqual([]);
    expect(component['selectedOption']()).toBeUndefined();
  });

  it('removes a chip and commits the shortened array, and no-ops on an absent one', () => {
    component.writeValue(['us', 'uk']);
    let latest: unknown;
    let calls = 0;
    component.registerOnChange((v) => {
      latest = v;
      calls++;
    });
    component['removeChip']('us');
    expect(latest).toEqual(['uk']);
    expect(calls).toBe(1);
    // The absent-value guard needs the COUNT: `filter` returns a content-equal new array, so a
    // redundant commit would leave `latest` deep-equal to ['uk'] and the value assertion alone
    // passes with `if (next.length === current.length) return;` deleted. (Project lesson:
    // self-heal launders mutation — assert the emission, not the settled state.)
    component['removeChip']('nope');
    expect(calls).toBe(1);
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

  it('disables the whole chip surface, including KEYBOARD removal (#900)', async () => {
    component.writeValue(['us', 'uk']);
    component.setDisabledState(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(inputEl().disabled).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('button[matChipRemove]').length).toBe(0);
    // Hiding the × is only half of it. `[removable]="!isDisabled()"` is the ONLY guard on keyboard
    // removal: MatChip._handleKeydown routes BACKSPACE/DELETE to remove() gated on `removable`,
    // never on `disabled` — so a chip arm that merely dropped the button would still let a disabled
    // control's chips be deleted from the keyboard.
    const rows = fixture.debugElement.queryAll(By.directive(MatChipRow));
    expect(rows.length).toBe(2); // vacuity guard: there are chips to refuse
    for (const row of rows) expect(row.injector.get(MatChipRow).removable).toBe(false);
    // ...and the real keystroke is refused, not merely the flag set. Via keydownOn, which defines
    // `keyCode`: MatChip._handleKeydown branches on `event.keyCode === BACKSPACE`, and a
    // KeyboardEvent built from `key` alone reports keyCode 0 — so a hand-rolled event walks
    // straight past the handler and the assertion below passes against ANY removable value. (That
    // draft was written, caught by neutralising the loop above, and fixed rather than kept.)
    keydownOn(rows[1].nativeElement, BACKSPACE, 'Backspace');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['us', 'uk']);
  });

  it('removes the LAST chip: commits [], drops the grid role, stays axe-clean (#900)', async () => {
    fixture.componentRef.setInput('ariaLabel', 'Countries');
    component.writeValue(['us']);
    fixture.detectChanges();
    await fixture.whenStable();
    const grid = fixture.nativeElement.querySelector('mat-chip-grid') as HTMLElement;
    expect(grid.getAttribute('role')).toBe('grid'); // vacuity guard: the role is on to begin with
    let latest: unknown = 'unset';
    component.registerOnChange((v) => (latest = v));
    component['removeChip']('us');
    fixture.detectChanges();
    await fixture.whenStable();
    // The emptied chip model commits `[]`, NOT the shared `''` empty value — a required validator
    // rejects both, but a consumer reading `.length` or spreading the value sees the difference.
    expect(latest).toEqual([]);
    expect(Array.isArray(latest)).toBe(true);
    expect(chipEls().length).toBe(0);
    // Emptying flips MatChipGrid's role back to null, so the #899 name gate must let go with it —
    // a name on a role-less element is an ARIA violation (axe aria-prohibited-attr).
    expect(grid.getAttribute('role')).toBeNull();
    expect(grid.hasAttribute('aria-label')).toBe(false);
    await expectNoA11yViolations(fixture.nativeElement);
  });

  it('honours a custom chipRemoveAriaLabel (#900)', async () => {
    // The asymmetry the review named: filterWith's custom path is tested, this one was not — only
    // the default "Remove <label>" was ever asserted.
    fixture.componentRef.setInput('chipRemoveAriaLabel', (label: string) => `Drop ${label} tag`);
    component.writeValue(['us']);
    fixture.detectChanges();
    await fixture.whenStable();
    const remove = fixture.nativeElement.querySelector('button[matChipRemove]');
    expect(remove.getAttribute('aria-label')).toBe('Drop United States tag');
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

  it('unfilters the panel after a REAL token commit — the 4th commit site (#900)', async () => {
    // #901 pinned the query reset on the pick and blur sites; the two TOKEN sites (COMMA via
    // onTokenEnd, Enter via onEnterKey) had none. This asserts the OUTCOME rather than the line, so
    // it holds whichever of clearInput's explicit `query.set('')` or the re-entrant `(input)`
    // binding actually does the work — and it fails if a future edit drops both.
    const { inputEl, keydown, type, settle } = realEvents(() => fixture);
    await type('Ger'); // narrow to one suggestion first — an unfiltered panel proves nothing
    expect(component['filtered']().map((o) => o.value)).toEqual(['de']); // setup guard
    keydown(COMMA, ',');
    await settle();
    expect(component['chipValues']()).toEqual(['Ger']); // vacuity guard: the token committed
    expect(inputEl().value).toBe('');
    expect(component['query']()).toBe('');
    // 'de' is now taken by nothing (the chip is the raw text 'Ger'), so all three remain on offer.
    expect(component['filtered']().length).toBe(3);
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

  const { inputEl, keydown, type, panelOptions } = realEvents(() => fixture);

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

describe('CaeAutocomplete — #899 a11y (real events, multiple mode)', () => {
  let component: CaeAutocomplete;
  let fixture: ComponentFixture<CaeAutocomplete>;
  let announce: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
    fixture = TestBed.createComponent(CaeAutocomplete);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('multiple', true);
    fixture.componentRef.setInput('freeText', true);
    fixture.componentRef.setInput('label', 'Countries');
    announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce').mockResolvedValue(undefined);
    await fixture.whenStable();
  });

  const { inputEl, keydownOn, type, panelOptions } = realEvents(() => fixture);

  it('announces a real panel pick with the resolved label and the running count', async () => {
    await type('Unit');
    panelOptions()[0].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['us']);
    // The LABEL, not the key — 'us added' is meaningless to a listener.
    expect(announce).toHaveBeenCalledWith('United States added, 1 selected');
  });

  it('announces a free-text Enter commit — the path where focus never moves', async () => {
    await type('etna');
    keydownOn(inputEl(), ENTER, 'Enter');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['etna']);
    expect(announce).toHaveBeenCalledWith('etna added, 1 selected');
  });

  it('does not announce a rejected duplicate — nothing was added', async () => {
    component.writeValue(['us']);
    await fixture.whenStable();
    announce.mockClear();
    await type('us'); // the raw key: free-text commits typed text verbatim, so 'us' collides
    keydownOn(inputEl(), ENTER, 'Enter');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['us']); // vacuity guard: the add really was rejected
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces a removal from the real two-Backspace path, with the remaining count', async () => {
    component.writeValue(['us', 'uk']);
    fixture.detectChanges();
    await fixture.whenStable();
    announce.mockClear();
    const el = inputEl();
    el.focus();
    keydownOn(el, BACKSPACE, 'Backspace');
    fixture.detectChanges();
    await fixture.whenStable();
    // Vacuity guards on the documented model: the FIRST Backspace (empty input) only moves focus —
    // into the LAST chip row — and removes nothing.
    expect(component['chipValues']()).toEqual(['us', 'uk']);
    const rows = fixture.nativeElement.querySelectorAll('mat-chip-row');
    expect((document.activeElement as HTMLElement).closest('mat-chip-row')).toBe(rows[1]);
    keydownOn(document.activeElement!, BACKSPACE, 'Backspace');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual(['us']);
    expect(announce).toHaveBeenCalledWith('United Kingdom removed, 1 selected');
  });

  it('names the chip grid from the floating label — aria-labelledby resolves to it', async () => {
    // While empty the grid's role is null, and a name on a role-less element is an ARIA violation
    // (axe aria-prohibited-attr — the aria-label arm was caught live by the error-state axe scan).
    const grid = fixture.nativeElement.querySelector('mat-chip-grid') as HTMLElement;
    expect(grid.getAttribute('role')).toBeNull(); // vacuity guard for the absence claim
    expect(grid.hasAttribute('aria-labelledby')).toBe(false);
    component.writeValue(['us']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(grid.getAttribute('role')).toBe('grid'); // vacuity guard
    const labelId = grid.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    // The id must RESOLVE to the visible label — an attr pointing at nothing names nothing.
    expect(document.getElementById(labelId!)?.textContent).toContain('Countries');
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

  it('prefers an explicit ariaLabel for the grid name over the label id (#899)', async () => {
    fixture.componentInstance.ctrl.setValue(['us']);
    fixture.detectChanges();
    await fixture.whenStable();
    const grid = fixture.nativeElement.querySelector('mat-chip-grid') as HTMLElement;
    expect(grid.getAttribute('aria-label')).toBe('Tags');
    // Not both: a lingering aria-labelledby would OVERRIDE the explicit aria-label (ARIA precedence).
    expect(grid.hasAttribute('aria-labelledby')).toBe(false);
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

// --- #901: the batched small findings from the #889 independent review ---

@Component({
  imports: [CaeAutocomplete, ReactiveFormsModule],
  template: `
    <cae-autocomplete
      [formControl]="ctrl"
      [multiple]="multi()"
      [options]="opts"
      [errorMessages]="{ required: 'Pick at least one' }"
      label="Modes"
      ariaLabel="Modes"
    />
  `,
})
class ModeFlipHostCmp {
  readonly ctrl = new FormControl<string | string[]>('', { validators: [Validators.required] });
  readonly opts = OPTIONS;
  // A signal, not a plain field: under zoneless a plain host property is not guaranteed to push
  // into a child signal input on a bare detectChanges().
  readonly multi = signal(false);
}

describe('CaeAutocomplete — #901 review batch', () => {
  const makeBare = async (
    inputs: Record<string, unknown>,
  ): Promise<ComponentFixture<CaeAutocomplete>> => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
    const fixture = TestBed.createComponent(CaeAutocomplete);
    fixture.componentRef.setInput('options', OPTIONS);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture;
  };

  it('coerces a non-string, non-array form value at the trust boundary (#901)', async () => {
    // A number or object reaching writeValue from a form model passed straight through: the base
    // accepts anything non-nullish, chipValues() returns it verbatim, and `@for (chip of
    // chipValues())` throws NG02200 "not iterable" — a crashed view, not a rejected value.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = await makeBare({ multiple: true });
    const component = fixture.componentInstance;
    component.writeValue(42 as unknown as string);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual([]);
    expect(fixture.nativeElement.querySelectorAll('mat-chip-row').length).toBe(0);
    // The warn names the offending type — a guard narrowed to `typeof === 'number'` would pass a
    // one-probe test, so the object case is exercised too: it is the likelier mis-mapped model.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"number"'));
    component.writeValue({ tags: ['us'] } as unknown as string);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['chipValues']()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"object"'));
    warn.mockRestore();
  });

  it('recomputes the bridged error state when [multiple] flips mid-life (#901)', async () => {
    const fixture = TestBed.createComponent(ModeFlipHostCmp);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const field = (): HTMLElement => fixture.nativeElement.querySelector('.mat-mdc-form-field');
    host.ctrl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(field().classList.contains('mat-form-field-invalid')).toBe(true); // single arm bridged
    // The base recomputes from ngDoCheck, a hook of the PARENT view: on the flip pass it runs
    // BEFORE the @if stamps the chip arm, so the incoming chipGrid() is still undefined. Nothing
    // repairs it afterwards — MatChipGrid.ngDoCheck self-updates only when it owns an NgControl,
    // which by design it never does here (#46) — so the field renders valid over an invalid model
    // until some unrelated CD pass, which zoneless may never schedule.
    host.multi.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('mat-chip-grid')).not.toBeNull(); // vacuity guard
    expect(field().classList.contains('mat-form-field-invalid')).toBe(true);
    // And back again: MatInput.ngDoCheck gates its self-update on owning an NgControl exactly as
    // MatChipGrid does, so the freshly-stamped input latches valid the same way. A recompute
    // restricted to the chip arm would pass the leg above and fail here.
    host.ctrl.setValue('');
    host.multi.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('mat-chip-grid')).toBeNull(); // vacuity guard
    expect(field().classList.contains('mat-form-field-invalid')).toBe(true);
  });

  it('re-syncs the trigger after a token commit so the same token can be re-entered (#901)', async () => {
    // MatChipInput.clear() assigns inputElement.value = '' with no `input` event, so the trigger's
    // _previousValue keeps the committed token. Re-entering that identical token in ONE shot — a
    // paste, an autofill — then trips _handleInput's no-change early-return and the panel never
    // reopens. Typing it back character by character self-heals, which is why this hid.
    const fixture = await makeBare({ multiple: true, freeText: true });
    const component = fixture.componentInstance;
    const { inputEl, keydown, type, settle } = realEvents(() => fixture);
    await type('United States');
    keydown(COMMA, ',');
    await settle();
    expect(component['chipValues']()).toEqual(['United States']); // vacuity guard: it committed
    expect(inputEl().value).toBe('');
    // Close the panel WITHOUT leaving the field — a refocus would resync _previousValue by itself.
    keydown(ESCAPE, 'Escape');
    await settle();
    expect(component['autocompleteTrigger']()!.panelOpen).toBe(false); // vacuity guard
    // The one-shot re-entry: assign + a single input event, as a paste or autofill produces.
    inputEl().value = 'United States';
    inputEl().dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(component['autocompleteTrigger']()!.panelOpen).toBe(true);
  });

  it('clears the filter query when a suggestion is picked, rather than proxying it (#901)', async () => {
    const fixture = await makeBare({});
    const component = fixture.componentInstance;
    // Type FIRST. On a fresh fixture `query` is already '', so a test that picks straight away
    // passes even with the clear deleted — the set would be writing the value it already holds.
    component['onType']('States'); // 'Unit' would match United Kingdom too — no narrowing proved
    expect(component['filtered']().map((o) => o.value)).toEqual(['us']); // setup guard
    component['onSelected']('us');
    expect(component['query']()).toBe('');
    expect(component['filtered']().length).toBe(3);
  });

  it('unfilters the panel after committing an ORPHAN free-text value (#901)', async () => {
    // The replaced proxy compared the query against the chosen option's label, which a value with
    // no matching option can never satisfy (selectedOption() is undefined). Committing free text
    // therefore left the panel filtered by that same text — in practice, filtered to nothing.
    const fixture = await makeBare({ freeText: true });
    const component = fixture.componentInstance;
    const el: HTMLInputElement = fixture.nativeElement.querySelector('input');
    el.value = 'Freedonia';
    component['query'].set('Freedonia');
    component['onBlur'](el);
    expect(component['value']()).toBe('Freedonia'); // vacuity guard: the commit happened
    expect(component['query']()).toBe('');
    expect(component['filtered']().length).toBe(3);
  });

  it('shows every suggestion when nothing is typed, without consulting filterWith (#901)', async () => {
    // The empty-query early return is a contract, not an optimization: a consumer predicate is free
    // to demand a minimum length, and without the guard the panel would come up EMPTY on focus.
    // (Found by a surviving mutation — the default substring predicate accepts '' and matches
    // everything, so deleting the guard is invisible to every test that uses the default.)
    const fixture = await makeBare({});
    const asked: string[] = [];
    fixture.componentRef.setInput('filterWith', (o: CaeAutocompleteOption, q: string) => {
      asked.push(q);
      return q.length >= 2 && o.label.toLowerCase().includes(q);
    });
    fixture.detectChanges();
    expect(fixture.componentInstance['filtered']().length).toBe(3);
    expect(asked).toEqual([]); // never consulted for an empty query
  });

  it('forwards autoActiveFirstOption to the panel — a public input with no other cover (#901)', async () => {
    const fixture = await makeBare({});
    const auto = fixture.componentInstance['autocompleteTrigger']()!.autocomplete;
    expect(auto.autoActiveFirstOption).toBe(false); // the documented default: Enter cannot commit
    fixture.componentRef.setInput('autoActiveFirstOption', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(auto.autoActiveFirstOption).toBe(true);
  });

  it('de-duplicates the rendered chips without echoing a correction to the model (#901)', async () => {
    // The documented asymmetry: writeValue sanitizes what it RENDERS (a repeat throws NG0955 out
    // of the @for) but must not write back — echoing on writeValue would break the CVA no-echo
    // invariant this suite pins. So a duplicate-bearing model stays 3 long under 2 visible chips,
    // and a length validator grades the model, not the chips. MIGRATION §4.7 carries the caveat.
    const fixture = TestBed.createComponent(ModeFlipHostCmp);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    host.multi.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    host.ctrl.setValue(['us', 'uk', 'us']);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('mat-chip-row').length).toBe(2);
    expect(host.ctrl.value).toEqual(['us', 'uk', 'us']);
  });
});

// --- Template wiring: the half the handler-call suite could not see (#900) ---
// A test that CALLS a protected handler proves the handler body and says nothing about the binding
// that reaches it. Measured on the pre-#897 suite: 49 tests, 0 dispatched events, and deleting
// `(optionSelected)`, `(input)`, `(focusout)`, `[matAutocomplete]` or
// `[matChipInputSeparatorKeyCodes]` left every one of them green with the component fundamentally
// dead — deleting `[matAutocomplete]` alone means the shipped single-select combobox has no
// suggestion panel at all, and axe still passes. Each test here resolves the REAL directive or
// drives a REAL event, one per load-bearing binding.
describe('CaeAutocomplete — template wiring (#900)', () => {
  let component: CaeAutocomplete;
  let fixture: ComponentFixture<CaeAutocomplete>;
  const { inputEl, settle, type, panelOptions } = realEvents(() => fixture);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CaeAutocomplete] }).compileComponents();
  });

  /** A fresh fixture in the given mode. Callable twice in one test — the module is configured above. */
  const make = async (inputs: Record<string, unknown> = {}): Promise<void> => {
    fixture = TestBed.createComponent(CaeAutocomplete);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('options', OPTIONS);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  };

  it('feeds the filter from a REAL keystroke in single mode, not just from onType()', async () => {
    // `(input)="onType(input.value)"` on the single arm is bound by nothing else in this file: every
    // other filter test calls onType directly, so deleting the binding leaves typing inert — the
    // panel would show all three suggestions forever — while the suite stays green.
    await make();
    expect(component['filtered']().length).toBe(3); // setup guard: unfiltered before the keystroke
    await type('king');
    expect(component['filtered']().map((o) => o.value)).toEqual(['uk']);
    // ...and the PANEL reflects it, which is what the user actually sees.
    const options = panelOptions();
    expect(options.length).toBe(1);
    expect(options[0].textContent).toContain('United Kingdom');
  });

  it('reconciles the display on a REAL focusout in single mode, not just an onBlur() call', async () => {
    // `(focusout)="onBlur(input)"` likewise: every strict-revert test calls onBlur directly, so
    // deleting the binding would leave un-picked text sitting in the field over a different model.
    await make();
    component.writeValue('us');
    await settle();
    const el = inputEl();
    el.value = 'typed but never picked';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(el.value).toBe('typed but never picked'); // setup guard: the field really diverged
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await settle();
    expect(el.value).toBe('United States'); // reverted by the real event path
    expect(component['value']()).toBe('us');
  });

  it('commits a REAL mouse pick in single mode and renders its label', async () => {
    // `(optionSelected)` is one attribute on the shared <mat-autocomplete>, so the chip-mode pick
    // test covers its deletion — but only chip mode drove it for real. This pins the single arm's
    // full round trip: panel click → commit → the afterRenderEffect writing the label back.
    await make();
    let latest: unknown;
    component.registerOnChange((v) => (latest = v));
    await type('king');
    panelOptions()[0].click();
    await settle();
    expect(latest).toBe('uk');
    expect(component['value']()).toBe('uk');
    expect(inputEl().value).toBe('United Kingdom');
  });

  it('binds the separator list onto the real MatChipInput — whose own default is ENTER', async () => {
    // The existing assertion reads the component's `separatorKeyCodes()` computed, which survives
    // deleting the [matChipInputSeparatorKeyCodes] binding entirely. What makes that deletion
    // dangerous rather than merely untested is Material's DEFAULT: `separatorKeyCodes: [ENTER]`
    // (chips.mjs:27). An unbound chip input therefore lands on exactly the key-agnostic ENTER
    // separator #897 was fixed to avoid — the panel and the token commit fighting over one key.
    await make({ multiple: true, freeText: true });
    const chipInput = fixture.debugElement
      .query(By.directive(MatChipInput))
      .injector.get(MatChipInput);
    expect(chipInput.separatorKeyCodes).toEqual([COMMA]);
    fixture.componentRef.setInput('freeText', false);
    await settle();
    expect(chipInput.separatorKeyCodes).toEqual([]);
  });

  // No test for `[matChipInputFor]="grid"`: it is COMPILER-enforced, not test-enforced. Deleting it
  // unmatches the `input[matChipInputFor]` selector, so the sibling
  // `[matChipInputSeparatorKeyCodes]` and `(matChipInputTokenEnd)` stop resolving and the build
  // fails NG8002 before any test runs. A drafted `chipInput.chipGrid === chipGrid()` assertion was
  // written, mutation-tested, and DELETED as inert — its only "kill" was that compile error, and
  // with a single grid in the template no reachable mutation can misroute the registration.
  it('stamps a MatAutocompleteTrigger on BOTH mode arms', async () => {
    // Each arm carries its own [matAutocomplete]; the single arm's had no direct cover.
    await make();
    expect(fixture.debugElement.query(By.directive(MatAutocompleteTrigger))).not.toBeNull();
    await make({ multiple: true });
    expect(fixture.debugElement.query(By.directive(MatAutocompleteTrigger))).not.toBeNull();
  });
});
