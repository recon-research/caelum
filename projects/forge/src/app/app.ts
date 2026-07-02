import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
// Forge imports each control from its own secondary entry point (#28) — the real
// "pay only for what you import" adoption pattern (Book 18 §3.3). The `caelum` barrel
// still works unchanged (the split is additive; scripts/check-lib-exports.mjs gates that
// every entry point is also re-exported by the barrel), but app code should prefer these paths.
import { CaeButton } from 'caelum/button';
import { CaeCard } from 'caelum/card';
import { CaeCheckbox } from 'caelum/checkbox';
import { CaeInput, type CaeErrorMessages } from 'caelum/input';
import { CaeMenu, CaeMenuItem, CaeMenuTrigger } from 'caelum/menu';
import { CaeRadio, CaeRadioOption } from 'caelum/radio';
import { CaeSelect, CaeSelectOption } from 'caelum/select';
import { CaeStep, CaeStepper } from 'caelum/stepper';
import { CaeTab, CaeTabs } from 'caelum/tabs';
import { CaeTextarea } from 'caelum/textarea';
import { CaeTooltip } from 'caelum/tooltip';
import { CaeTree, CaeTreeNode } from 'caelum/tree';

type ThemeMode = 'auto' | 'light' | 'dark';

/** The semantic tokens the demo surfaces as swatches — proof the bridge is live. */
const SWATCHES: ReadonlyArray<{ token: string; label: string }> = [
  { token: '--cae-color-primary', label: 'primary' },
  { token: '--cae-surface-base', label: 'surface' },
  { token: '--cae-surface-raised', label: 'raised' },
  { token: '--cae-color-on-surface', label: 'on-surface' },
  { token: '--cae-color-border', label: 'border' },
  { token: '--cae-color-error', label: 'error' },
  { token: '--cae-color-success', label: 'success' },
  { token: '--cae-color-warn', label: 'warn' },
];

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CaeButton,
    CaeCard,
    CaeCheckbox,
    CaeInput,
    CaeMenu,
    CaeMenuTrigger,
    CaeRadio,
    CaeSelect,
    CaeStep,
    CaeStepper,
    CaeTab,
    CaeTabs,
    CaeTextarea,
    CaeTooltip,
    CaeTree,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly document = inject(DOCUMENT);

  protected readonly title = signal('Forge');
  protected readonly swatches = SWATCHES;

  /** Radio + select options as data — proof both render option lists from a model. */
  protected readonly plans: readonly CaeRadioOption[] = [
    { value: 'free', label: 'Free — a single project' },
    { value: 'pro', label: 'Pro — unlimited projects' },
    { value: 'enterprise', label: 'Enterprise — SSO & audit log' },
  ];
  protected readonly regions: readonly CaeSelectOption[] = [
    { value: 'us-east', label: 'US East (Virginia)' },
    { value: 'us-west', label: 'US West (Oregon)' },
    { value: 'eu-central', label: 'EU Central (Frankfurt)' },
  ];

  /** Header `cae-menu` items — functional: they drive the wizard end-to-end. */
  protected readonly actions: readonly CaeMenuItem[] = [
    { value: 'sample', label: 'Fill with sample data' },
    { value: 'reset', label: 'Reset form' },
    { value: 'duplicate', label: 'Duplicate workspace', disabled: true },
  ];

  /** A `cae-tree` model — the workspace structure, expandable + selectable. */
  protected readonly structure: readonly CaeTreeNode[] = [
    {
      value: 'ws',
      label: 'Acme Console',
      children: [
        {
          value: 'projects',
          label: 'Projects',
          children: [
            { value: 'web', label: 'web-app' },
            { value: 'api', label: 'api-service' },
          ],
        },
        {
          value: 'members',
          label: 'Members',
          children: [
            { value: 'owner', label: 'owner@acme.dev' },
            { value: 'dev', label: 'dev@acme.dev' },
          ],
        },
        { value: 'settings', label: 'Settings' },
      ],
    },
  ];

  /** The batch-3 PrimeNG→Caelum map, shown in the second reference tab. */
  protected readonly batch3: ReadonlyArray<{ prime: string; cae: string }> = [
    { prime: 'p-menu', cae: 'cae-menu' },
    { prime: 'p-stepper', cae: 'cae-stepper' },
    { prime: 'p-tree', cae: 'cae-tree' },
  ];

  /**
   * A real reactive form wired ONLY to `cae-*` components — the end-to-end proof that each
   * wrapper is a genuine `ControlValueAccessor`. Batch 3 lays the form out across a
   * `cae-stepper` wizard: the controls live inside projected `cae-step` bodies yet still bind
   * to this one `FormGroup` (the ControlContainer resolves through projection).
   */
  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    plan: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    region: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    agree: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  /**
   * Per-field validator-key → message maps (#29). A failed submit marks the form touched, so
   * the cae-input controls render these inline as `<mat-error>` (with `aria-invalid` +
   * describedby wired by Material); the minlength message interpolates the required length.
   */
  protected readonly nameErrors: CaeErrorMessages = { required: 'A workspace name is required' };
  protected readonly emailErrors: CaeErrorMessages = {
    required: 'An owner email is required',
    email: 'Enter a valid email address',
  };
  protected readonly passwordErrors: CaeErrorMessages = {
    required: 'A password is required',
    minlength: (e) => `Use at least ${(e as { requiredLength: number }).requiredLength} characters`,
  };
  /** cae-select forwards errors into its mat-form-field like cae-input (#47) — so map its key. */
  protected readonly regionErrors: CaeErrorMessages = { required: 'A region is required' };

  protected readonly created = signal<string | null>(null);
  /** A form-level error announced on invalid submit; per-field messages now render inline (#29). */
  protected readonly formError = signal<string | null>(null);

  /** Active wizard step — drives cae-stepper through its two-way `selectedIndex` seam. */
  protected readonly step = signal(0);
  /** Index of the last step (Submit replaces Next here). */
  protected readonly lastStep = 2;

  /** Which wizard step each control lives on — used to jump to the first invalid one. */
  private readonly stepOfControl: ReadonlyArray<readonly [string, number]> = [
    ['name', 0],
    ['email', 0],
    ['plan', 1],
    ['region', 1],
    ['description', 2],
    ['password', 2],
    ['agree', 2],
  ];

  /** Active reference tab — drives cae-tabs' two-way `selectedIndex`. */
  protected readonly selectedTab = signal(0);

  /** The node last selected in the structure tree. */
  protected readonly selectedNode = signal<string | null>(null);

  // --- Linear (validity-gated) stepper demo (#40) ---
  // A second, deliberately small cae-stepper set to `[linear]`: Material gates advancing until
  // each step's `stepControl` is valid (you can't reach "Access" until "Contact" is), and
  // cae-stepper reconciles the two-way `selectedIndex` if a refused move would otherwise leave
  // the signal ahead of the rendered step. Kept separate from the create-workspace wizard above
  // (intentionally free-navigation) so both stepper modes are on display.
  protected readonly inviteContact = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
  });
  protected readonly inviteAccess = new FormGroup({
    role: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly invite = new FormGroup({
    contact: this.inviteContact,
    access: this.inviteAccess,
  });
  protected readonly roles: readonly CaeSelectOption[] = [
    { value: 'admin', label: 'Admin — full access' },
    { value: 'member', label: 'Member — can edit' },
    { value: 'viewer', label: 'Viewer — read only' },
  ];
  protected readonly inviteEmailErrors: CaeErrorMessages = {
    required: 'A teammate email is required',
    email: 'Enter a valid email address',
  };
  protected readonly inviteRoleErrors: CaeErrorMessages = { required: 'Choose a role' };
  /** Active step of the linear invite stepper — two-way bound to its cae-stepper. */
  protected readonly inviteStep = signal(0);
  /** The email an invitation was sent to (success state). */
  protected readonly inviteSent = signal<string | null>(null);
  /** A message for the invite live region — a refused-advance prompt, cleared on progress. */
  protected readonly inviteError = signal<string | null>(null);
  private readonly inviteGroups = [this.inviteContact, this.inviteAccess];

  /** The persistent (always-rendered) polite live region + focus target for the result. */
  private readonly statusRegion = viewChild<ElementRef<HTMLElement>>('statusRegion');
  /**
   * The create-workspace form's directive — reset through it so `submitted` clears (see reset()).
   * Queried by the template ref (not `viewChild(FormGroupDirective)`), which would be ambiguous
   * now that a SECOND `[formGroup]` (the invite demo) lives in this view: a bare directive query
   * flips to the invite form once the wizard's form is swapped out for "Create another".
   */
  private readonly formDir = viewChild<FormGroupDirective>('createFormDir');
  /** The invite demo's persistent live region + focus target — mirrors `statusRegion`. */
  private readonly inviteStatusRegion = viewChild<ElementRef<HTMLElement>>('inviteStatus');

  constructor() {
    // Move focus to the status region whenever it gains a message (success OR error), so a
    // keyboard / screen-reader user lands on the announcement instead of being dropped to
    // <body> when the form or the submit button re-renders.
    effect(() => {
      if (this.created() || this.formError()) {
        const el = this.statusRegion()?.nativeElement;
        if (el) queueMicrotask(() => el.focus());
      }
    });
    // Same pattern for the invite demo: on a sent invitation or a refused-advance prompt, move
    // focus to its persistent region so the message is announced and focus isn't stranded when
    // the invite form is swapped for "Invite another".
    effect(() => {
      if (this.inviteSent() || this.inviteError()) {
        const el = this.inviteStatusRegion()?.nativeElement;
        if (el) queueMicrotask(() => el.focus());
      }
    });
  }

  /** Run a header menu action — real behaviour, not a decorative menu. */
  protected runAction(item: CaeMenuItem): void {
    if (item.value === 'sample') this.fillSample();
    else if (item.value === 'reset') this.reset();
  }

  /** Populate the wizard with valid sample data and return to step one. */
  protected fillSample(): void {
    this.created.set(null);
    this.formError.set(null);
    this.form.setValue({
      name: 'Acme Console',
      email: 'owner@acme.dev',
      plan: 'pro',
      region: 'us-east',
      description: 'Internal admin tools for the Acme team.',
      password: 'sample-pass-8',
      agree: true,
    });
    this.step.set(0);
  }

  /** Move the wizard by one step, clamped to the valid range. */
  protected goToStep(index: number): void {
    this.formError.set(null);
    this.step.set(Math.min(Math.max(index, 0), this.lastStep));
  }

  /**
   * Whether a required NON-form-field control (`plan` radio, `agree` checkbox) should show its
   * error — the SAME trigger the mat-error fields use (invalid && (touched || submitted)).
   * These aren't `mat-form-field`s, so per #47 Forge renders the message itself and links it via
   * the control's `ariaDescribedby` (forwarded onto the focusable input, announced on focus like
   * `<mat-error>`; the form-level status region covers submit-time announcement). Together with
   * `regionErrors` on the select, this closes the plan/region/agree asymmetry #47 named.
   */
  protected fieldErrorShown(name: 'plan' | 'agree'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || (this.formDir()?.submitted ?? false));
  }

  /** The first wizard step that holds an invalid control (0 if none). */
  private firstInvalidStep(): number {
    for (const [control, stepIndex] of this.stepOfControl) {
      if (this.form.get(control)?.invalid) return stepIndex;
    }
    return 0;
  }

  /** Record the tree node the user selected. */
  protected pickNode(node: CaeTreeNode): void {
    this.selectedNode.set(node.label);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Jump to the step that actually holds the first invalid control, and announce the
      // failure in the live region (the effect moves focus there) — so a keyboard / SR user
      // isn't dropped on <body> with no feedback when the submit button re-renders.
      this.step.set(this.firstInvalidStep());
      this.formError.set(
        'Some required details are missing — jumped to the step that needs input.',
      );
      return;
    }
    this.formError.set(null);
    this.created.set(this.form.getRawValue().name);
  }

  protected reset(): void {
    // Reset through the DIRECTIVE, not just the model: a bare form.reset() clears values but
    // leaves FormGroupDirective.submitted true, so with #29's error forwarding the freshly
    // cleared required fields would immediately show errors on the pristine form. resetForm()
    // clears both. Fall back to the model reset when the form isn't rendered (success screen).
    const dir = this.formDir();
    if (dir) dir.resetForm();
    else this.form.reset();
    this.created.set(null);
    this.formError.set(null);
    this.step.set(0);
  }

  /**
   * Advance the linear invite stepper — a well-behaved consumer validates the current step
   * BEFORE requesting the move: if it's invalid, surface the field errors (markAllAsTouched)
   * and announce a prompt in the live region (the effect moves focus there), rather than firing
   * an optimistic move the `[linear]` stepper would refuse (which would flicker Next→Submit and
   * strand focus). The stepper's own selectedIndex reconciliation (#40) remains the safety net
   * for any consumer that DOES drive the index blindly — exercised in the library's own spec.
   */
  protected inviteNext(): void {
    const group = this.inviteGroups[this.inviteStep()];
    if (group.invalid) {
      group.markAllAsTouched();
      this.inviteError.set('Complete this step before continuing.');
      return;
    }
    this.inviteError.set(null);
    this.inviteStep.set(Math.min(this.inviteStep() + 1, this.inviteGroups.length - 1));
  }

  protected inviteBack(): void {
    this.inviteError.set(null);
    this.inviteStep.set(Math.max(this.inviteStep() - 1, 0));
  }

  protected sendInvite(): void {
    if (this.invite.invalid) {
      this.invite.markAllAsTouched();
      this.inviteError.set('Complete this step before sending the invitation.');
      return;
    }
    this.inviteError.set(null);
    this.inviteSent.set(this.inviteContact.getRawValue().email);
  }

  protected resetInvite(): void {
    this.invite.reset();
    this.inviteSent.set(null);
    this.inviteError.set(null);
    this.inviteStep.set(0);
  }

  /** `auto` follows the OS via `color-scheme: light dark`; light/dark force an arm. */
  protected readonly themeMode = signal<ThemeMode>('auto');
  protected readonly nextLabel = computed(
    () => ({ auto: 'light', light: 'dark', dark: 'auto' })[this.themeMode()],
  );

  /** Re-bind the token layer (Book 04 §3.3) — components stay unaware. */
  protected cycleTheme(): void {
    const next = { auto: 'light', light: 'dark', dark: 'auto' }[this.themeMode()] as ThemeMode;
    this.themeMode.set(next);
    const root = this.document.documentElement;
    if (next === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', next);
    }
  }
}
