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
  CaeRadio,
  CaeRadioOption,
  CaeSelect,
  CaeSelectOption,
  CaeTab,
  CaeTabs,
  CaeTextarea,
  CaeTooltip,
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
    CaeRadio,
    CaeSelect,
    CaeTab,
    CaeTabs,
    CaeTextarea,
    CaeTooltip,
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

  /** The batch-2 PrimeNG→Caelum map, shown in the second reference tab. */
  protected readonly batch2: ReadonlyArray<{ prime: string; cae: string }> = [
    { prime: 'p-radiobutton', cae: 'cae-radio' },
    { prime: 'p-select', cae: 'cae-select' },
    { prime: 'pTextarea', cae: 'cae-textarea' },
    { prime: 'p-tabs', cae: 'cae-tabs' },
    { prime: 'pTooltip', cae: 'caeTooltip' },
  ];

  /**
   * A real reactive form wired ONLY to `cae-*` components — the end-to-end proof that
   * each wrapper is a genuine `ControlValueAccessor`, not a decorative shell. `formGroup`
   * / `formControlName` bind straight through the Caelum surface, exactly as they bound
   * to `p-*` before the migration. Batch 2 adds the radio (`plan`), select (`region`),
   * and textarea (`description`) controls alongside batch 1's inputs and checkbox.
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

  /** Active demo tab — drives cae-tabs through its `selectedIndex`/`selectedIndexChange`
   * two-way seam (proof that API round-trips), and keeps the selection sticky. */
  protected readonly selectedTab = signal(0);

  /** The persistent (always-rendered) polite live region + focus target for the result. */
  private readonly statusRegion = viewChild<ElementRef<HTMLElement>>('statusRegion');

  constructor() {
    // On success, move focus to the confirmation so keyboard / screen-reader users land
    // on the result instead of being dropped to <body> when the form is swapped out.
    effect(() => {
      if (this.created()) {
        const el = this.statusRegion()?.nativeElement;
        if (el) queueMicrotask(() => el.focus());
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.created.set(this.form.getRawValue().name);
  }

  protected reset(): void {
    this.form.reset();
    this.created.set(null);
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
