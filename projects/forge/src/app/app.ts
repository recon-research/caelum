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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CaeButton,
  CaeCard,
  CaeCheckbox,
  CaeInput,
  CaeMenu,
  CaeMenuItem,
  CaeMenuTrigger,
  CaeRadio,
  CaeRadioOption,
  CaeSelect,
  CaeSelectOption,
  CaeStep,
  CaeStepper,
  CaeTab,
  CaeTabs,
  CaeTextarea,
  CaeTooltip,
  CaeTree,
  CaeTreeNode,
} from 'caelum';

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

  protected readonly created = signal<string | null>(null);
  /** A form-level error announced on invalid submit (per-field error display is #29). */
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

  /** The persistent (always-rendered) polite live region + focus target for the result. */
  private readonly statusRegion = viewChild<ElementRef<HTMLElement>>('statusRegion');

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
    this.form.reset();
    this.created.set(null);
    this.formError.set(null);
    this.step.set(0);
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
