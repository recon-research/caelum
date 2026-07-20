import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  ElementRef,
  inject,
  input,
  output,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { AbstractControl } from '@angular/forms';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';

/**
 * Clamp a consumer step index into `[0, last]` (same shape as carousel's `clampPage` / galleria's
 * `clampIndex`). Truncate FIRST, collapse only `NaN` — an up-front `Number.isFinite` gate would
 * send `Infinity` to step 0 while a merely huge `1e21` landed on the last. Why it must exist at
 * all: #592 + stepper.spec.ts.
 */
const clampStepIndex = (v: number, last: number): number => {
  const n = Math.trunc(v);
  return Math.max(0, Math.min(Number.isNaN(n) ? 0 : n, last));
};

/**
 * `cae-step` — a single step inside a `cae-stepper`. Like `cae-tab`, its projected content
 * is captured as a `TemplateRef` (via an internal `<ng-template>`) so `cae-stepper` can
 * stamp it into a Material `mat-step`. Content-projection + a plain-text `label`; no logic.
 * Used exclusively as a child of `cae-stepper`.
 */
@Component({
  selector: 'cae-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template #content><ng-content /></ng-template>`,
})
export class CaeStep {
  /** Plain-text step label shown in the header. */
  readonly label = input('');
  /** Marks the step optional (Material renders an "Optional" caption). */
  readonly optional = input(false, { transform: booleanAttribute });
  /** Whether the user may return to this step after leaving it. Matches Material's default. */
  readonly editable = input(true, { transform: booleanAttribute });
  /**
   * The form control (or group) whose validity gates advancing PAST this step when the parent
   * `cae-stepper` is `[linear]` (Book 05 §3.5). Point it at the step's `FormGroup` for a
   * multi-field step. Omit for a step with no form — Material then completes it once visited
   * (an explicit `completed`/`hasError` override for a form-less gated step is TODO(#61)).
   */
  readonly stepControl = input<AbstractControl>();
  /** The step body, captured for `cae-stepper` to project into its `mat-step`. */
  readonly content = viewChild.required<TemplateRef<unknown>>('content');
}

/**
 * `cae-stepper` — the Direct (1:1) wrapper over Material's `mat-stepper`
 * (`reference/COMPARISON.md`: `p-stepper`/`p-steps` → `cae-stepper`). Steps are declared as
 * projected `cae-step` children (label + content), mirroring the `p-step` authoring model,
 * and rendered through `mat-stepper`. `selectedIndex` is two-way bindable
 * (`[(selectedIndex)]`), so drive navigation from a signal and/or let users click headers.
 * Theme comes free through the token bridge. Zoneless-compatible: `OnPush` + signal state
 * (provisional on #9; Book 01 §3.2).
 *
 * NOTE: unlike `cae-tabs`, Material stamps every step body eagerly (they are all in the DOM,
 * shown/hidden by selection) — a lazy step body is a later enhancement if needed.
 *
 * **Linear (validity-gated) stepping (#40).** Set `[linear]` and give each `cae-step` a
 * `stepControl` (Book 05 §3.5): Material refuses to advance PAST a step until its `stepControl` is
 * valid, disabling the unreachable headers. With `linear` off, moves are gated only by each step's
 * `editable` flag. Either way a refused move leaves Material's index put and emits NOTHING, so the
 * wrapper drives it imperatively and reads the actual index back — see `selectedIndexChange` for
 * what that reports and `selectedIndex` for the full binding contract.
 */
@Component({
  selector: 'cae-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusin)': 'rememberFocus($event)' },
  imports: [MatStepperModule, NgTemplateOutlet],
  template: `
    <mat-stepper
      [linear]="linear()"
      [orientation]="orientation()"
      [aria-label]="ariaLabel() || null"
      (selectedIndexChange)="report($event)"
    >
      @for (step of steps(); track step) {
        <mat-step
          [label]="step.label()"
          [optional]="step.optional()"
          [editable]="step.editable()"
          [stepControl]="$any(step.stepControl() || null)"
        >
          <ng-container [ngTemplateOutlet]="step.content()" />
        </mat-step>
      }
    </mat-stepper>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class CaeStepper {
  /** The declared steps, collected from projected `cae-step` children. */
  protected readonly steps = contentChildren(CaeStep);
  /**
   * Active step index. Two-way bindable via `[(selectedIndex)]`.
   *
   * Out-of-contract values are absorbed rather than thrown (CDK's own setter throws on all of
   * them): out-of-range clamps to the last step, negative and `NaN` collapse to 0, a fraction
   * truncates. A request the list is too SHORT to satisfy — including when there are no steps at
   * all — is held pending and applied once the steps arrive, so an async list still lands on the
   * requested step. Navigating in the meantime cancels the pending request: an explicit move is a
   * later intent than a declared index the list could not honour.
   *
   * When the step LIST changes structurally, the stepper re-clamps **where the user currently is**
   * rather than re-asserting this value — so a shrink that orphans the index repairs itself
   * without throwing a user off a step they navigated to. That repair is reported through
   * `selectedIndexChange`, so a two-way binding stays in step with what is rendered.
   */
  readonly selectedIndex = input(0);
  /**
   * Emits the active step index. Fires on a genuine change (header click or accepted move); for
   * `[(selectedIndex)]` correctness it also re-emits the UNCHANGED current index when a linear
   * move is refused, and reports the new index when a structural step-list change forced an
   * automatic repair — neither of which the consumer initiated. So a pure `(selectedIndexChange)`
   * listener (e.g. analytics) may observe an event nobody asked for; treat every emission as
   * "this is the live index", not "the user changed step".
   *
   * **Bind a signal.** The snap-back above can only answer a request the component actually
   * RECEIVES. Re-requesting a refused step from a plain mutable property does not reach it: the
   * first refusal reports back and drives the property to the live index, and the identical second
   * write leaves nothing for Angular to observe — no signal, no dirty view, so the binding is never
   * re-evaluated and the reconciler never runs. The consumer's property then sits on a step that is
   * not shown. Measured, and unfixable from inside a component that is never invoked (#607).
   */
  readonly selectedIndexChange = output<number>();
  /** Require each step's `stepControl` to be valid before advancing past it. */
  readonly linear = input(false, { transform: booleanAttribute });
  /** Layout axis. */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  /** Accessible name for the stepper. */
  readonly ariaLabel = input('');

  private readonly matStepper = viewChild(MatStepper);
  private readonly matStepperEl = viewChild(MatStepper, { read: ElementRef });

  /** Last index reflected into CDK — distinguishes a new consumer request from a mere step-list
   *  change. `null` re-arms. `Object.is` so a bound `NaN` counts as unchanged (#598). */
  private lastRequested: number | null = null;
  /** Last index the CONSUMER was told about, by either route — CDK's own output or the
   *  reconciler's. Must count both, or a repair re-announces an index CDK already reported. */
  private lastEmitted: number | null = null;
  /** The STEP the user is on, not its index. An index only identifies a step while nothing is
   *  removed ahead of it (#608); the template tracks by step, so identity survives a shift and the
   *  reconciler can re-derive the index. `null` until a selection settles, and again if that step
   *  is removed — which is the ordinary shrink the positional clamp already repairs. */
  private selectedStep: CaeStep | null = null;
  /** A request the step list was too SHORT to satisfy, held with the step the clamp landed on
   *  instead. `lastRequested` records what was ASKED, not whether it was met, so without this a
   *  clamped index is never re-applied once it becomes valid (#606). Re-applying it
   *  unconditionally is not the fix — that re-asserts the declared index on every later structural
   *  change, the yank #598 locked out. The landing step is what tells "never satisfied" apart from
   *  "the user has moved on": while the selection still sits where the clamp put it nobody has
   *  overridden the request, and the moment anything re-keys `selectedStep` it is stale. Only a
   *  finite OVERSHOOT latches — negative, `NaN` and `Infinity` cannot become valid by growing. */
  private pending: { index: number; landedOn: CaeStep | null } | null = null;

  /** Single exit for `selectedIndexChange`, so `lastEmitted` sees every emission. */
  protected report(index: number): void {
    this.lastEmitted = index;
    // Every route into here — a user click on a header, CDK's own output, a reconciler repair —
    // is a point where the selection is settled and the step list is current, which is the only
    // safe moment to re-key the identity. The effect does NOT re-run on a user click (neither
    // `selectedIndex` nor the step count moves), so without this the identity would go stale
    // exactly when the user navigates by hand — the case #608 is about.
    this.selectedStep = this.steps()[index] ?? null;
    this.selectedIndexChange.emit(index);
  }

  private readonly el: ElementRef<HTMLElement> = inject(ElementRef);

  /** ANY focused descendant (a step-body input as much as a header), captured on `focusin` rather
   *  than read at reconcile time: by then a destroyed element has already lost focus, so
   *  `activeElement` can no longer tell removal from a deliberate park (#604). The restore always
   *  targets a header, so a user in a destroyed step's field is moved to the step header. */
  private focusedEl: HTMLElement | null = null;

  protected rememberFocus(event: FocusEvent): void {
    this.focusedEl = event.target as HTMLElement | null;
  }

  /**
   * WCAG 2.4.3: destroying the element the user was on parks focus on `<body>` and CDK won't move
   * it. `isConnected` separates DESTROYED from a deliberate park; the `<body>` check means we never
   * take focus from whatever holds it.
   *
   * Targets the header CDK nominates as its tab stop, never an index of our own choosing — handing
   * focus to a header the key manager disagrees with makes Enter re-throw CDK's out-of-bounds error
   * (measured). `tabStop` is that index, read straight from the key manager and already re-synced by
   * `resyncKeyManager`, so it is in range by construction.
   *
   * `null` means the key manager was unreachable (the D-623 feature-detect declined), and this falls
   * back to the pre-#611 behaviour: look for a rendered `tabindex="0"` and decline when there is
   * none. Reading the index rather than the DOM is what makes the fix land in the same pass — the
   * `[tabIndex]` binding does not re-render until the next one, so a DOM lookup here would still
   * find nothing and strand the user (measured).
   *
   * Scoped to our own mat-stepper — a nested cae-stepper's headers are in this subtree too, which
   * a vertical layout's interleaved header/body order would otherwise expose. Recipe: PATTERNS.
   */
  private restoreFocusIfDestroyed(tabStop: number | null): void {
    const lost = this.focusedEl;
    if (!lost || lost.isConnected) return;
    this.focusedEl = null; // single-slot marker: a detached one is spent, armed or not
    const doc = this.el.nativeElement.ownerDocument;
    const active = doc.activeElement;
    if (active && active !== doc.body) return;
    const own = this.matStepperEl()?.nativeElement;
    const ownHeaders = Array.from(
      this.el.nativeElement.querySelectorAll<HTMLElement>('mat-step-header'),
    ).filter((h) => h.closest('mat-stepper') === own);
    const target =
      tabStop === null
        ? ownHeaders.find((h) => h.getAttribute('tabindex') === '0')
        : ownHeaders[tabStop];
    target?.focus();
  }

  /**
   * Re-point CDK's `FocusKeyManager` when a structural change has left it dangling (#611).
   *
   * `ListKeyManager._itemsChanged` only re-maps `_activeItemIndex` when the active item SURVIVES,
   * so arrowing to a header (which moves the key manager without changing selection) and then
   * shrinking the list past it leaves the index stale. Material binds
   * `[tabIndex]="_getFocusIndex() === step.index() ? 0 : -1"` and `_getFocusIndex()` returns
   * `_keyManager.activeItemIndex` — so nothing matches, EVERY header renders `tabindex="-1"`, and
   * the stepper drops out of the Tab order (WCAG 2.1.1, measured). It also arms a crash:
   * `_onKeydown` assigns `selectedIndex = activeItemIndex` on Enter/Space, which throws CDK's
   * out-of-bounds error against the shorter list.
   *
   * `updateActiveItem`, never `setActiveItem`: this repairs a TAB STOP, it does not navigate, so it
   * must not move focus. CDK itself picks between the two on `_containsFocus()` inside
   * `_updateSelectedItemIndex` — that branch belongs to a real selection change, not to this. Focus
   * is then handled where it belongs, by `restoreFocusIfDestroyed` below, which can finally find a
   * `tabindex="0"` header instead of declining.
   *
   * D-623 guard 1 of 3: feature-detected, so a CDK rename degrades to the pre-fix behaviour rather
   * than throwing. Guard 2 (a test pinning the private's shape, so a bump fails in CI and not in a
   * user's keyboard) lives in `stepper.spec.ts`; guard 3 is the upstream report, drafted on #639.
   */
  private resyncKeyManager(stepper: MatStepper, last: number, selected: number): number | null {
    const mgr = (
      stepper as unknown as {
        _keyManager?: { activeItemIndex: number | null; updateActiveItem?: (i: number) => void };
      }
    )._keyManager;
    if (typeof mgr?.updateActiveItem !== 'function') return null;
    const active = mgr.activeItemIndex;
    // Only repair a DANGLING index. An in-range one is the user's own arrow position and moving it
    // would silently relocate their tab stop.
    if (active !== null && active >= 0 && active <= last) return active;
    mgr.updateActiveItem(selected);
    return selected;
  }

  /**
   * Force a repair CDK refused, but ONLY when the repair is a re-index rather than a move (#605).
   *
   * CDK gates every assignment on
   * `!_anyControlsInvalidOrPending(index) && (index >= selectedIndex || steps[index].editable)`
   * — and that clause is NOT limited to linear steppers. An identity repair is by nature a BACKWARD
   * assignment, so a user sitting on an `[editable]="false"` step is refused in silence and left
   * looking at a step they never chose (confirmed repro, #605).
   *
   * Bypassing that gate is sound here precisely because nothing moved: the step under the user is
   * the same `CaeStep` object, only its INDEX shifted when the list changed ahead of it. CDK is
   * being asked "may the user return to this step?" when they never left it — a question the gate
   * exists to answer for navigation, and a category error for re-indexing. A genuine consumer
   * request to move backward is NOT forced: the caller gates this on an unchanged input plus a
   * resolved identity, so the `[linear]` refusal contract (#40) is untouched.
   *
   * `_updateSelectedItemIndex` is the right seam: it emits `selectionChange` + `selectedIndexChange`
   * and updates the key manager exactly as an accepted assignment would, so the repair is reported
   * through the normal path rather than mutating state behind the consumer's back. It skips
   * `_isValidIndex`, so the caller must pass an already-clamped index — it does.
   *
   * Returns whether the force was applied, so the caller can re-read the index. Same D-623 guards.
   */
  private forceSelectedIndex(stepper: MatStepper, index: number): boolean {
    const update = (stepper as unknown as { _updateSelectedItemIndex?: (i: number) => void })
      ._updateSelectedItemIndex;
    if (typeof update !== 'function') return false;
    update.call(stepper, index);
    return true;
  }

  constructor() {
    // Reflects `selectedIndex` into Material and reconciles back: on a REFUSED linear move Material
    // stays put and emits nothing, which would leave `[(selectedIndex)]` ahead of the rendered step.
    //
    // Runs after render because a plain `effect` sees CDK's PREVIOUS step list (measured on a 3->1
    // shrink: our count 1, CDK's still 3), so assigning against our count throws out of change
    // detection when the list grows and the index moves in one tick (#598). Render hooks don't run
    // on the server, which this accepts for now — #602 carries that trade-off.
    afterRenderEffect(() => {
      const requested = this.selectedIndex();
      const stepper = this.matStepper();
      // Tracked: a structural change is exactly when an index falls out of range. `changed` guards it.
      const count = this.steps().length;
      if (!stepper) return;
      untracked(() => {
        const last = count - 1;
        // Zero steps: `_isValidIndex` rejects EVERY index including 0, so nothing is safe to
        // assign. Skip and re-arm so a late-arriving list still gets the pending index (#597).
        if (last < 0) {
          // No header to move to, so a destroyed marker is dropped rather than acted on — leaving
          // it armed lets an unrelated later change yank focus into the stepper (#611).
          this.lastRequested = null;
          this.focusedEl = null;
          return;
        }
        const changed = !Object.is(requested, this.lastRequested);
        this.lastRequested = requested;
        const before = stepper.selectedIndex;
        // CDK focuses the newly-selected header whenever focus is inside the stepper. On a REPAIR
        // that is a focus steal — the consumer's data changed, not the user's intent (WCAG 3.2.5) —
        // so remember where they were and put them back below if that element survived.
        const doc = this.el.nativeElement.ownerDocument;
        const held = doc.activeElement as HTMLElement | null;
        // When only the list moved, follow where the user ACTUALLY is rather than re-asserting the
        // declared index — that is what stops a repair doubling as a yank back to the declared step.
        // "Where they are" is the STEP, not its number: `before` names the right step only while
        // nothing was removed ahead of it, and a leading removal shifts every later index down
        // without ever putting one out of range, so neither CDK's decrement handler nor the clamp
        // fires and the content silently changes underneath the user (#608). Re-deriving the index
        // from the step itself covers both shapes at once. `-1` means that step was the one removed,
        // which is the ordinary shrink the positional clamp repairs (CDK decrements by exactly one
        // regardless of the new length — #598). A valid index re-clamps to itself, so CDK no-ops.
        // An UNMET request outranks identity: the consumer asked for a step that did not exist yet,
        // and nothing has since moved the selection off where the clamp put it, so the ask still
        // stands and the list just grew into it (#606). Once anything re-keys `selectedStep` — a
        // header click, an accepted move, an earlier repair — the ask is stale and identity wins.
        const armed = this.pending;
        const unmet = armed && armed.landedOn === this.selectedStep ? armed.index : null;
        const byIdentity = this.selectedStep ? this.steps().indexOf(this.selectedStep) : -1;
        const settled = byIdentity >= 0 ? byIdentity : before;
        const target = changed ? requested : (unmet ?? settled);
        const aimed = clampStepIndex(target, last);
        stepper.selectedIndex = aimed;
        let actual = stepper.selectedIndex;
        // CDK REFUSED the assignment. Force it only when this was a re-index rather than a move:
        // the input has not changed and the aim came from the step the user is already on, so the
        // gate is being asked "may they return here?" about a step they never left (#605). A real
        // consumer request that CDK refuses stays refused — that is the `[linear]` contract (#40).
        if (actual !== aimed && !changed && byIdentity >= 0 && unmet === null) {
          if (this.forceSelectedIndex(stepper, aimed)) actual = stepper.selectedIndex;
        }
        if (!changed && held?.isConnected && doc.activeElement !== held) held.focus();
        // Repair CDK's key manager BEFORE the focus restore below, which looks for the tab stop
        // this may have just put back (#611).
        const tabStop = this.resyncKeyManager(stepper, last, actual);
        // Compare against the CONSUMER's value, not the clamped one. `actual === before` matters:
        // when CDK DID move it already emitted through the template forward, so emitting again
        // double-fires (measured: [2, 2]). A repair must still report itself — CDK's shrink handler
        // writes its index signal DIRECTLY and emits nothing, so without this a shrink-by-one
        // leaves `[(selectedIndex)]` silently ahead of the rendered step. Deduped on the repair
        // path only, so one repair reports once; a new consumer request always re-reports.
        // `changed ||` matters on its own: a consumer re-requesting an index CDK keeps refusing
        // (linear, invalid prerequisite) must be told every time, even though the reported value
        // hasn't moved — otherwise their signal sits on the refused step. The dedupe applies only
        // to the repair path, where nothing new was asked for.
        if (actual !== requested && actual === before && (changed || actual !== this.lastEmitted))
          this.report(actual);
        // Re-arm AFTER the reports above, so `landedOn` reads the identity the selection actually
        // settled on rather than one this run is about to overwrite. Only an aim taken from the
        // consumer's request can latch: re-arming from a request we did NOT aim at would revive a
        // stale declared index and reintroduce the #598 yank. `Number.isFinite` keeps the
        // never-satisfiable values out — they clamp identically forever, so latching them would
        // only pin the user to a bound instead of following their step.
        this.pending =
          (changed || unmet !== null) && Number.isFinite(target) && Math.trunc(target) > last
            ? { index: target, landedOn: this.selectedStep }
            : null;
        // Deliberately NOT re-keying identity here. Every route that SETTLES a selection emits and
        // so goes through `report`; the only silent one is CDK's shrink handler, and a stale step
        // from it can never match again (a removed CaeStep is destroyed, and a re-added label is a
        // new instance), so `indexOf` returns -1 and the positional clamp below takes over — the
        // pre-#608 behaviour, which is correct for that case. Seeding identity from the initial
        // render instead would silently extend this repair to INSERTION before an un-navigated
        // selection, i.e. prepending a step would move a consumer off their declared index. That
        // is a real question but not this one — #624.
        this.restoreFocusIfDestroyed(tabStop);
      });
    });
  }
}
