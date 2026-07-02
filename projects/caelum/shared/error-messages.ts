/**
 * Maps a validator error key to the message a `cae-*` form field shows when that error is
 * active. The key is the `ValidationErrors` key the bound control reports (`required`,
 * `email`, `minlength`, …); the value is either a static string or a function of that
 * error's detail (`control.getError(key)`) for interpolated messages — e.g.
 * `{ minlength: (e) => \`At least ${(e as { requiredLength: number }).requiredLength} characters\` }`.
 *
 * A control renders a `<mat-error>` only for keys present here, so an unmapped validation
 * failure still flips the field's invalid styling but shows no text — matching Material's
 * "you supply the message" model. Note Material sets `aria-invalid` from the error state
 * EXCEPT on an empty *required* field, where it suppresses it by design (`aria-required`
 * conveys the requirement); so leaving `required` unmapped ships a field that is invalid to
 * sighted users yet silent to a screen reader (Book 07 §3.3). Prefer mapping every validated
 * key. Shared by the form-field controls (`cae-input`, `cae-textarea`), so it lives in the
 * type-only `caelum/shared` (mirrors `CaeFormFieldAppearance`); it survives the per-component
 * entry-point split (#28) without either control importing the other's module.
 */
export type CaeErrorMessages = Record<string, string | ((error: unknown) => string)>;
