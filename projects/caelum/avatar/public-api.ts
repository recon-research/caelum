/**
 * Secondary entry point `caelum/avatar` (issue #662, M3 display cluster) — the user/entity avatar
 * (`reference/COMPARISON.md`: `p-avatar`/`p-avatargroup` → `cae-avatar`/`cae-avatar-group`; Book 11
 * §3.1). Image / initials / icon variants, circle or square, with a `cae-avatar-group` that overlaps
 * members and shows a "+N" overflow indicator. Uses `caelum/icon` for the icon variant; no Material,
 * no CDK. Re-exported by the primary `caelum` barrel (imports no optional peer — D-652).
 */
export * from './avatar';
