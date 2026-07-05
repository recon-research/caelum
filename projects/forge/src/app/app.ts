import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
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
import { CaeAccordion, CaeExpansionPanel } from 'caelum/accordion';
import { CaeBadge } from 'caelum/badge';
import { CaeButton } from 'caelum/button';
import { CaeCard } from 'caelum/card';
import { CaeChip } from 'caelum/chip';
import { CaeCheckbox } from 'caelum/checkbox';
import { CaeAutocomplete, type CaeAutocompleteOption } from 'caelum/autocomplete';
import { CaeInput, type CaeErrorMessages } from 'caelum/input';
import { CaeListbox, type CaeListboxOption } from 'caelum/listbox';
import { CaeMenu, CaeMenuItem } from 'caelum/menu';
import { CaeMultiSelect, type CaeMultiSelectOption } from 'caelum/multi-select';
import { CaeRadio, CaeRadioOption } from 'caelum/radio';
import { CaeSelect, CaeSelectOption } from 'caelum/select';
import { CaeSelectButton, CaeSelectButtonOption } from 'caelum/select-button';
import { CaeSlider } from 'caelum/slider';
import { CaeStep, CaeStepper } from 'caelum/stepper';
import { CaeSwitch } from 'caelum/switch';
import { CaeTab, CaeTabs } from 'caelum/tabs';
import { CaeTable, type CaeTableColumn } from 'caelum/table';
import { CaeTextarea } from 'caelum/textarea';
import { CaeToggleButton } from 'caelum/toggle-button';
import { CaeToolbar } from 'caelum/toolbar';
import { CaeTooltip } from 'caelum/tooltip';
// `CaeTreeNode` is inline-`type` so the runtime import of `caelum/tree` is CaeTree alone, used
// only inside the deferred structure card (#85) — a value+type share on one import declaration
// counts as an eager use and would keep cae-tree (MatTree) in the initial bundle.
import { CaeTree, type CaeTreeNode } from 'caelum/tree';
// Display primitives (#88) — non-interactive Direct wrappers, no CVA.
import { CaeDivider } from 'caelum/divider';
import { CaeProgressBar } from 'caelum/progress-bar';
import { CaeProgressSpinner } from 'caelum/progress-spinner';
// The first SERVICE passthrough (#96, D-15) — injected, not listed in `imports` (it's not a
// component/directive). Its toasts carry their own aria-live region.
import { CaeToast } from 'caelum/toast';
// The second SERVICE passthrough (#100, D-15) — CaeDialog over MatDialog. Loaded LAZILY: the service
// (and MatDialog + the dialog-container machinery with it) plus the dialog body are dynamic-import()ed
// on first open, so their ~40 kB stay OFF Forge's initial bundle (the #85 defer-before-raise policy —
// a dialog is the canonical open-on-interaction lazy load). These imports are `type`-only (erased),
// so they add no eager code; the runtime values come from the `import()` calls in renameWorkspace()
// (CaeDialog) and deleteWorkspace() (CaeConfirmService, #101 — likewise lazy since it pulls MatDialog).
// NOTE (regression guard): unlike #85's `@defer` blocks (asserted by getDeferBlocks() in app.spec), an
// `import()` split is NOT introspectable from a unit test, so there's no boundary test here — a future
// edit that makes MatDialog eager would push the initial bundle to ~852 kB (over the 850 kB angular.json
// WARN but under the 1 mb ERROR → CI stays green). Risk is low (these are type-only), and a durable
// dist-stats guard is filed as a followup (#102). Keep both imports `type`-only; never add
// RenameWorkspaceDialog to `imports[]` or reference it as a value outside renameWorkspace()'s import().
import type { RenameWorkspaceDialog, RenameWorkspaceData } from './rename-workspace-dialog';

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
    CaeAccordion,
    CaeExpansionPanel,
    CaeBadge,
    CaeButton,
    CaeCard,
    CaeChip,
    CaeToolbar,
    CaeCheckbox,
    CaeAutocomplete,
    CaeInput,
    CaeListbox,
    CaeMenu,
    CaeMultiSelect,
    CaeRadio,
    CaeSelect,
    CaeSelectButton,
    CaeSlider,
    CaeStep,
    CaeStepper,
    CaeSwitch,
    CaeTab,
    CaeTabs,
    CaeTable,
    CaeTextarea,
    CaeToggleButton,
    CaeTooltip,
    CaeTree,
    CaeDivider,
    CaeProgressBar,
    CaeProgressSpinner,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly document = inject(DOCUMENT);
  /** The injectable cae-toast service (#96) — a transient, self-announcing notification. */
  private readonly toast = inject(CaeToast);
  /** Resolves the lazily-imported CaeDialog singleton on demand (see renameWorkspace). */
  private readonly injector = inject(Injector);

  protected readonly title = signal('Forge');

  /** Header notification count — drives the cae-badge on the toolbar's notifications button. */
  protected readonly unread = signal(3);
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
  /** cae-select-button options (#73) — a single-select button bar (p-selectButton parity). */
  protected readonly visibilities: readonly CaeSelectButtonOption[] = [
    { value: 'private', label: 'Private' },
    { value: 'team', label: 'Team' },
    { value: 'public', label: 'Public' },
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

  /** The recent PrimeNG→Caelum map (batches 3–4), shown in the second reference tab. */
  protected readonly recentComponents: ReadonlyArray<{ prime: string; cae: string }> = [
    { prime: 'p-menu', cae: 'cae-menu' },
    { prime: 'p-stepper', cae: 'cae-stepper' },
    { prime: 'p-tree', cae: 'cae-tree' },
    { prime: 'p-toggleSwitch', cae: 'cae-switch' },
    { prime: 'p-selectButton', cae: 'cae-select-button' },
    { prime: 'p-toggleButton', cae: 'cae-toggle-button' },
    { prime: 'p-accordion', cae: 'cae-accordion' },
    { prime: 'p-chip', cae: 'cae-chip' },
    { prime: 'p-progressbar', cae: 'cae-progress-bar' },
    { prime: 'p-progressspinner', cae: 'cae-progress-spinner' },
    { prime: 'p-divider', cae: 'cae-divider' },
  ];

  /**
   * Removable `cae-chip`s backed by a signal list — the liveness proof for #83. Clicking a chip's
   * × fires `(removed)`; the consumer owns the removal, so we drop the tag from the signal and the
   * chip unrenders.
   */
  protected readonly tags = signal<readonly string[]>(['design', 'frontend', 'a11y']);
  /** Announcement for a removed tag — read by a persistent polite live region (a11y, #83). */
  protected readonly tagMessage = signal('');
  protected removeTag(tag: string): void {
    this.tags.update((list) => list.filter((t) => t !== tag));
    const n = this.tags().length;
    this.tagMessage.set(`Removed ${tag}. ${n} ${n === 1 ? 'tag' : 'tags'} remaining.`);
  }

  /**
   * A small standalone reactive form for the deferred "Workspace capacity" card (#109) — a single
   * cae-slider (seats) + a RANGE cae-slider (budget, a [min, max] pair, the mode-dependent value
   * seam). Kept OUT of the eager create-workspace wizard and rendered in an `@defer (on idle)` block
   * below the fold, so MatSlider (a heavy Material module) splits into its own lazy chunk and stays
   * off Forge's initial bundle — the #85 defer-before-raise policy, the same reason MatTree /
   * MatTabs / MatChips are deferred. Each slider round-trips through this form's `getRawValue()`.
   */
  protected readonly capacity = new FormGroup({
    seats: new FormControl(10, { nonNullable: true }),
    budget: new FormControl<[number, number]>([100, 500], { nonNullable: true }),
  });
  /** Formats the budget slider's thumb bubble + aria-valuetext with a `$` unit (cae-slider displayWith). */
  protected readonly formatDollars = (value: number): string => `$${value}`;

  /**
   * A standalone reactive control for the deferred "Workspace modules" listbox (#114) — a
   * cae-listbox in `multiple` mode round-trips a `string[]` selection through a reactive control,
   * exactly as `p-listbox` did. Kept out of the eager wizard and rendered in an `@defer (on idle)`
   * block below the fold, so MatSelectionList splits into its own lazy chunk off Forge's initial
   * bundle (the #85 defer-before-raise policy).
   */
  protected readonly modules = new FormControl<string[]>(['analytics', 'billing'], {
    nonNullable: true,
  });
  /** The modules listbox options, as data (the `CaeListboxOption[]` seam). */
  protected readonly moduleOptions: readonly CaeListboxOption[] = [
    { value: 'analytics', label: 'Analytics' },
    { value: 'billing', label: 'Billing' },
    { value: 'audit-log', label: 'Audit log' },
    { value: 'sso', label: 'Single sign-on' },
  ];

  /**
   * A standalone required control for the deferred "Default timezone" cae-autocomplete demo (#119) —
   * a typeahead combobox round-trips the chosen timezone's key through a reactive control, with an
   * inline `<mat-error>` on the required validator. Deferred (#85): matAutocomplete's overlay module
   * is heavy, so it's `@defer (on idle)`'d off the initial bundle.
   */
  protected readonly timezone = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  /** The timezone autocomplete suggestions, as data (the `CaeAutocompleteOption[]` seam). */
  protected readonly timezoneOptions: readonly CaeAutocompleteOption[] = [
    { value: 'utc', label: 'UTC' },
    { value: 'america/new_york', label: 'America / New York' },
    { value: 'america/los_angeles', label: 'America / Los Angeles' },
    { value: 'europe/london', label: 'Europe / London' },
    { value: 'europe/berlin', label: 'Europe / Berlin' },
    { value: 'asia/tokyo', label: 'Asia / Tokyo' },
  ];

  /**
   * A standalone required control for the deferred "Required skills" cae-multi-select demo (#135) —
   * a multi-value select round-trips the chosen `string[]` through a reactive control, with an
   * in-panel filter, a chip summary in the collapsed field, and an inline `<mat-error>` on the
   * required validator (an empty array is invalid). Deferred (#85): mat-select + mat-chips overlay
   * modules are heavy, so it's `@defer (on idle)`'d off the initial bundle.
   */
  protected readonly skills = new FormControl<string[]>([], {
    nonNullable: true,
    validators: [Validators.required],
  });
  /** The skill options, as data (the `CaeMultiSelectOption[]` seam). */
  protected readonly skillOptions: readonly CaeMultiSelectOption[] = [
    { value: 'angular', label: 'Angular' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'rxjs', label: 'RxJS' },
    { value: 'a11y', label: 'Accessibility' },
    { value: 'testing', label: 'Testing' },
    { value: 'design-systems', label: 'Design systems' },
  ];

  /**
   * The deferred "Workspace members" table demo (#141) — the first M1 *composed* table. A
   * declarative `cae-table` renders a sortable, client-side-paginated member roster from a
   * `columns` config + a `data` array, with no `matColumnDef` boilerplate (p-table parity for
   * the common text-column case). Deferred (#85): MatTable + MatSort + MatPaginator are heavy
   * Material modules, so it's `@defer (on idle)`'d into its own lazy chunk off the initial bundle.
   */
  protected readonly memberColumns: readonly CaeTableColumn[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', sortable: true },
    { key: 'joined', header: 'Joined', sortable: true },
  ];
  protected readonly members: readonly Record<string, unknown>[] = [
    { name: 'Ada Lovelace', email: 'ada@acme.dev', role: 'Owner', joined: '2024-01-12' },
    { name: 'Grace Hopper', email: 'grace@acme.dev', role: 'Admin', joined: '2024-03-04' },
    { name: 'Alan Turing', email: 'alan@acme.dev', role: 'Member', joined: '2024-05-21' },
    { name: 'Katherine Johnson', email: 'kate@acme.dev', role: 'Member', joined: '2024-06-30' },
    { name: 'Edsger Dijkstra', email: 'edsger@acme.dev', role: 'Viewer', joined: '2024-08-15' },
    { name: 'Barbara Liskov', email: 'barbara@acme.dev', role: 'Admin', joined: '2024-09-02' },
    { name: 'Donald Knuth', email: 'don@acme.dev', role: 'Member', joined: '2024-11-19' },
  ];

  /**
   * A short FAQ rendered as a `cae-accordion` — the liveness proof for #77. It's single-expand
   * by default (opening one section closes the others, coordinated by the accordion), showing the
   * projected `cae-expansion-panel` children behave as one group without any wiring on our side.
   */
  protected readonly faqs: ReadonlyArray<{ q: string; hint: string; a: string }> = [
    {
      q: 'How do I adopt Caelum?',
      hint: 'component by component',
      a: 'Swap one PrimeNG component at a time — each cae-* wrapper is a 1:1 drop-in, so a migration is a series of small, independently shippable changes rather than a rewrite.',
    },
    {
      q: 'Will it match my brand?',
      hint: 'one token set',
      a: 'Every component reads the same --cae-* design tokens. Set them once and the fields, cards, and this accordion all move together — no per-component theming.',
    },
    {
      q: 'What about accessibility?',
      hint: 'built in',
      a: 'Each header is a real focusable control with aria-expanded and Enter/Space toggling, inherited from Material and verified in the library’s parity suite.',
    },
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
    // A required single-select bound to cae-select-button (#73). Like radio/checkbox it isn't a
    // mat-form-field, so it uses the consumer-owned error pattern (fieldErrorShown + ariaDescribedby).
    visibility: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    agree: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
    // A plain boolean preference bound to cae-switch (#68) — no validator; proves the switch
    // round-trips through the same reactive FormGroup / getRawValue payload as every other control.
    notify: new FormControl(true, { nonNullable: true }),
    // A plain boolean bound to cae-toggle-button (#73) — the button-rendered twin of the switch.
    pinned: new FormControl(false, { nonNullable: true }),
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
  /**
   * Wizard completion %, derived from the `step` signal — feeds the `cae-progress-bar` and the
   * decorative `cae-progress-spinner` ring (#88). Signal-driven, so both meters fill live as the
   * user advances (steps 0/1/2 → 33/67/100%).
   */
  protected readonly stepProgress = computed(() =>
    Math.round(((this.step() + 1) / (this.lastStep + 1)) * 100),
  );

  /** Which wizard step each control lives on — used to jump to the first invalid one. */
  private readonly stepOfControl: ReadonlyArray<readonly [string, number]> = [
    ['name', 0],
    ['email', 0],
    ['plan', 1],
    ['region', 1],
    ['visibility', 1],
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
  private readonly tagsStatusRegion = viewChild<ElementRef<HTMLElement>>('tagsStatus');

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
    // A standalone cae-chip doesn't redirect focus on removal (no MatChipSet), so on a tag removal
    // move focus to the tag status region and announce it — the same guard the form/invite use (#83).
    effect(() => {
      if (this.tagMessage()) {
        const el = this.tagsStatusRegion()?.nativeElement;
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
      visibility: 'team',
      description: 'Internal admin tools for the Acme team.',
      password: 'sample-pass-8',
      agree: true,
      notify: true,
      pinned: true,
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
  protected fieldErrorShown(name: 'plan' | 'agree' | 'visibility'): boolean {
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

  // --- cae-toast demo (#96) ---
  // A visible echo of the last toast action, proving the CaeToastRef round-trips. It's kept
  // separate from the form/invite status regions: a toast carries its OWN aria-live region, so
  // wiring it to those would double-announce.
  protected readonly toastAction = signal<string | null>(null);

  /** Clear the header notification count — the cae-badge hides itself (caeBadgeHidden) at 0. */
  protected markRead(): void {
    this.unread.set(0);
  }

  /** Fire-and-forget toast — the common p-toast case (auto-dismisses, no ref needed). */
  protected notify(): void {
    this.toastAction.set(null);
    this.toast.open('Workspace settings saved', undefined, { politeness: 'polite' });
  }

  /** Toast with an action button — exercises the returned CaeToastRef's onAction() seam. */
  protected archive(): void {
    this.toastAction.set(null);
    // An ACTIONABLE toast is opened sticky (duration 0): MatSnackBar doesn't move focus into the
    // toast, so a timed auto-dismiss could remove the Undo button before a keyboard / screen-reader
    // user tabs to it (WCAG 2.2.1). It closes when Undo is clicked, so it never lingers unusably.
    const ref = this.toast.open('Project archived', 'Undo', { duration: 0, politeness: 'polite' });
    // onAction() completes when the toast dismisses, so this subscription self-cleans (no leak).
    ref.onAction().subscribe(() => this.toastAction.set('Archive undone.'));
  }

  // --- cae-dialog demo (#100) ---
  /** The current workspace name, edited through the rename dialog. */
  protected readonly workspaceName = signal('Acme Console');
  /** A persistent polite live region announcing a completed rename. */
  protected readonly renameMessage = signal('');

  /**
   * Open the rename dialog (a pure `cae-*` body) with the current name as data, and apply the
   * result. The dialog service + body are dynamic-`import()`ed here so MatDialog stays off the
   * initial bundle (#85 defer-before-raise). NOTE: unlike the toast demo, this does NOT move focus
   * to the live region — MatDialog restores focus to the trigger button on close (correct dialog
   * UX), so a focus-move here would fight that; the persistent polite region announces the change
   * without stealing focus.
   */
  protected async renameWorkspace(): Promise<void> {
    this.renameMessage.set('');
    const [{ CaeDialog }, { RenameWorkspaceDialog: dialogBody }] = await Promise.all([
      import('caelum/dialog'),
      import('./rename-workspace-dialog'),
    ]);
    const dialog = this.injector.get(CaeDialog);
    const ref = dialog.open<RenameWorkspaceDialog, string, RenameWorkspaceData>(dialogBody, {
      data: { name: this.workspaceName() },
      autoFocus: 'first-tabbable',
    });
    ref.afterClosed().subscribe((name) => {
      // afterClosed delivers the Save result, or undefined/'' on Cancel/Escape/backdrop (all falsy).
      if (name && name !== this.workspaceName()) {
        this.workspaceName.set(name);
        this.renameMessage.set(`Workspace renamed to “${name}”.`);
      }
    });
  }

  /** A persistent polite live region announcing a completed (confirmed) delete. */
  protected readonly deleteMessage = signal('');

  /**
   * Guard a destructive "delete" behind a confirm (#101). `CaeConfirmService` is dynamic-`import()`ed
   * on first use — like the rename dialog it pulls MatDialog, so it stays off the initial bundle (#85).
   * The confirm opens as a `role="alertdialog"` with initial focus on **Cancel** (the safe default), so
   * an accidental keypress can't delete; `confirm()` resolves `true` only on Delete, `false` on
   * Cancel / Escape / backdrop. We announce only on accept (a real destructive app would remove here).
   */
  protected async deleteWorkspace(): Promise<void> {
    this.deleteMessage.set('');
    const { CaeConfirmService } = await import('caelum/confirm');
    const name = this.workspaceName();
    const confirmed = await this.injector.get(CaeConfirmService).confirm({
      header: 'Delete workspace?',
      message: `This permanently deletes “${name}”. This can't be undone.`,
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
    });
    if (confirmed) {
      this.deleteMessage.set(`Workspace “${name}” deleted.`);
    }
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
