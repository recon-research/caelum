import { ChangeDetectionStrategy, Component } from '@angular/core';

import { CaeAvatar, CaeAvatarGroup } from 'caelum/avatar';
import { CaeCard } from 'caelum/card';

/**
 * The deferred "Avatar" `cae-avatar` demo (#662) — the user/entity avatar. It shows the three
 * variants (initials, icon, image), circle vs square, the three sizes, an image that falls back to
 * initials on a deliberately-dead URL (no broken image), and a `cae-avatar-group` that overlaps its
 * members and collapses the overflow past `[max]` into a "+N" indicator.
 *
 * `@defer`'d from App (#85): keeping the demo in its own lazy chunk holds those bytes off Forge's
 * initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-avatar-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeAvatar, CaeAvatarGroup],
  templateUrl: './avatar-demo.html',
  styleUrl: './avatar-demo.scss',
})
export class AvatarDemo {
  /** Initials for the group members — the "+N" indicator collapses everything past `[max]`. */
  protected readonly team: readonly string[] = ['AL', 'BR', 'CM', 'DK', 'EN', 'FP'];

  /** A URL that will never load, to demonstrate the image→initials fallback. */
  protected readonly deadImage = 'https://example.invalid/missing-avatar.png';
}
