import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  effect,
  input,
  linkedSignal,
  numberAttribute,
  signal,
} from '@angular/core';
import { CaeIcon, type CaeIconName } from 'caelum/icon';

/** Avatar outline. */
export type CaeAvatarShape = 'circle' | 'square';
/** Avatar size step. Drives `--cae-avatar-size`, which a consumer can also override directly. */
export type CaeAvatarSize = 'normal' | 'large' | 'xlarge';

/**
 * `cae-avatar` — a user/entity avatar (`reference/COMPARISON.md`: `p-avatar` → `cae-avatar`; Book 11
 * §3.1). Renders exactly one of three variants, in priority order: an `[image]` (falls back to the
 * other variants if it fails to load — see below), an `[icon]` glyph (from the `caelum/icon`
 * registry, D-596), or an `[label]` (initials/short text). Circle or square, in three sizes; no
 * Material, no CDK.
 *
 * **Image fallback, not a broken image.** The image variant swaps to the icon/label variant on the
 * `<img>`'s `error` event, so a dead URL never renders a broken-image glyph. The fallback is
 * re-armed whenever `[image]` changes (a new URL gets its own chance to load).
 *
 * **Accessibility.** With an `[image]`, the `<img>` carries `[alt]` (default empty — decorative).
 * The `[label]` variant renders real text, which AT reads. An icon-only avatar is decorative
 * (`cae-icon` is `aria-hidden`), so if it *means* something, give it `[ariaLabel]` — that puts
 * `role="img"` + the name on the host. Prefer letting a neighbouring name label the avatar instead.
 *
 * **Sizing** reads from `--cae-avatar-size` (a `[size]` step sets it; a consumer can override it in
 * CSS for a custom size); the glyph/initials scale with it. Colours and radii come from the `--cae-*`
 * token bridge (D-04). In a `cae-avatar-group` the group overlaps and (past `[max]`) hides members —
 * see {@link CaeAvatarGroup}. Zoneless-compatible: `OnPush` + signals (provisional on #9; Book 01
 * §3.2).
 */
@Component({
  selector: 'cae-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeIcon],
  host: {
    class: 'cae-avatar',
    '[class.cae-avatar--square]': "shape() === 'square'",
    '[class.cae-avatar--large]': "size() === 'large'",
    '[class.cae-avatar--xlarge]': "size() === 'xlarge'",
    // Group overlap: every member past the first overlaps its predecessor (a group sets the index).
    '[class.cae-avatar--grouped]': '(groupIndex() ?? 0) > 0',
    '[hidden]': 'hiddenInGroup()',
    '[attr.role]': 'ariaLabel() ? "img" : null',
    '[attr.aria-label]': 'ariaLabel() || null',
  },
  template: `
    @if (image() && !imageError()) {
      <img
        class="cae-avatar__image"
        [src]="image()"
        [attr.alt]="alt() ?? ''"
        (error)="imageError.set(true)"
      />
    } @else if (icon(); as ic) {
      <cae-icon [name]="ic" />
    } @else if (label(); as l) {
      <span class="cae-avatar__label">{{ l }}</span>
    }
  `,
  styles: `
    :host {
      --cae-avatar-size: 2.5rem;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--cae-avatar-size);
      block-size: var(--cae-avatar-size);
      /* Initials/icon scale with the box (a dimensionless ratio, not a themeable value). */
      font-size: calc(var(--cae-avatar-size) * 0.4);
      font-weight: var(--cae-weight-medium);
      line-height: 1;
      overflow: hidden;
      user-select: none;
      background-color: var(--cae-surface-sunken);
      color: var(--cae-color-on-surface-variant);
      border-radius: var(--cae-radius-full);
    }
    :host(.cae-avatar--square) {
      border-radius: var(--cae-radius-md);
    }
    /* [hidden] must win over the base display: the group hides overflow members via the host
       [hidden] binding, but a bare [hidden] only sets display:none in the UA stylesheet, which the
       author-origin :host display beats — so restate it here at :host specificity (#662 review). */
    :host([hidden]) {
      display: none;
    }
    :host(.cae-avatar--large) {
      --cae-avatar-size: 3.5rem;
    }
    :host(.cae-avatar--xlarge) {
      --cae-avatar-size: 4.5rem;
    }
    /* Overlap the predecessor and separate the stack with a surface-coloured ring. */
    :host(.cae-avatar--grouped) {
      margin-inline-start: calc(-1 * var(--cae-space-3));
      box-shadow: 0 0 0 2px var(--cae-surface-base);
    }
    .cae-avatar__image {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
    }
  `,
})
export class CaeAvatar {
  /** Image URL. Wins over icon/label; falls back to them if it fails to load. */
  readonly image = input<string>();
  /** `alt` for the image variant (default empty — decorative). */
  readonly alt = input<string>();
  /** Glyph name (from the `caelum/icon` registry, D-596). Shown when there is no loaded image. */
  readonly icon = input<CaeIconName | (string & {})>();
  /** Initials / short text. Shown when there is no loaded image and no icon. */
  readonly label = input<string>();
  /** Outline (default `circle`). */
  readonly shape = input<CaeAvatarShape>('circle');
  /** Size step, driving `--cae-avatar-size` (default `normal`). */
  readonly size = input<CaeAvatarSize>('normal');
  /** Accessible name for a meaningful icon-only avatar (adds `role="img"`). */
  readonly ariaLabel = input<string>();

  /** True once the image failed to load; re-armed to `false` whenever `[image]` changes. */
  protected readonly imageError = linkedSignal<string | undefined, boolean>({
    source: this.image,
    computation: () => false,
  });

  /**
   * @internal Group-managed state — {@link CaeAvatarGroup} sets the member's index (drives the
   * overlap on every member past the first) and hides members beyond `[max]`. `null` = ungrouped.
   */
  readonly groupIndex = signal<number | null>(null);
  /** @internal Group-managed — hides this member when it is beyond the group's `[max]`. */
  readonly hiddenInGroup = signal(false);
}

/**
 * `cae-avatar-group` — overlaps its projected `cae-avatar` children and, past `[max]`, hides the
 * overflow and appends a "+N" indicator (`reference/COMPARISON.md`: `p-avatargroup`; Book 11 §3.1).
 * The group manages its members directly (it sets each child's overlap index and hidden state),
 * mirroring how a chip set manages its chips. `role="group"`; pass `[ariaLabel]` to name it.
 */
@Component({
  selector: 'cae-avatar-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeAvatar],
  host: {
    class: 'cae-avatar-group',
    role: 'group',
    '[attr.aria-label]': 'ariaLabel() || null',
  },
  template: `
    <ng-content select="cae-avatar" />
    @if (overflow() > 0) {
      <cae-avatar
        class="cae-avatar-group__overflow"
        [label]="'+' + overflow()"
        [shape]="shape()"
        [size]="size()"
        [ariaLabel]="overflow() + ' more'"
      />
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
    /* The "+N" avatar is a view child, so its own [class.cae-avatar--grouped] host binding is false
       (it has no groupIndex) and would strip a static grouped class — so give it the overlap + ring
       here instead of relying on that class (#662 review). */
    .cae-avatar-group__overflow {
      margin-inline-start: calc(-1 * var(--cae-space-3));
      box-shadow: 0 0 0 2px var(--cae-surface-base);
    }
  `,
})
export class CaeAvatarGroup {
  /** Max members to show before collapsing the rest into a "+N" indicator (default: show all). */
  readonly max = input(undefined, {
    transform: (v: unknown) => {
      if (v == null || v === '') return undefined;
      const n = numberAttribute(v);
      // A garbage value → no limit; a negative → clamp to 0 (else "+N" over-counts and every member
      // hides, since index >= negative is always true) (#662 review).
      return Number.isNaN(n) ? undefined : Math.max(0, n);
    },
  });
  /** Shape applied to the "+N" indicator so it matches the members (default `circle`). */
  readonly shape = input<CaeAvatarShape>('circle');
  /** Size applied to the "+N" indicator so it matches the members (default `normal`). */
  readonly size = input<CaeAvatarSize>('normal');
  /** Accessible name for the group. */
  readonly ariaLabel = input<string>();

  private readonly avatars = contentChildren(CaeAvatar);

  /** How many members are hidden past `[max]` (0 = none / no max). */
  protected readonly overflow = computed(() => {
    const max = this.max();
    const count = this.avatars().length;
    return max != null && count > max ? count - max : 0;
  });

  constructor() {
    // Push overlap index + hidden state onto each member. Writing child signals from here is safe:
    // this effect never reads them back, so there is no glitch loop.
    effect(() => {
      const max = this.max();
      this.avatars().forEach((avatar, index) => {
        avatar.groupIndex.set(index);
        avatar.hiddenInGroup.set(max != null && index >= max);
      });
    });
  }
}
