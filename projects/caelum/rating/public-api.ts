/**
 * Secondary entry point `caelum/rating` (issue #663, M3-exit set) — the keyboard-operable star
 * rating as a real form control (`reference/COMPARISON.md`: `p-rating` → `cae-rating`; Book 07
 * §3.1). A `NG_VALUE_ACCESSOR` selection control (the `cae-radio` family, #47), not a
 * `mat-form-field` wrapper. It depends on `caelum/icon` for the D-596 glyph slot, exactly as the
 * other icon-bearing components do — a first-party entry point, NOT an optional peer, so it rides
 * the primary `caelum` barrel per D-652.
 */
export * from './rating';
