/**
 * Form-field surface treatment, shared by the form-field-based Caelum controls
 * (`cae-input`, `cae-select`, `cae-textarea`). 1:1 with the subset of Material's
 * `MatFormFieldAppearance` that Caelum surfaces — a Caelum-owned alias, not Material's
 * type, and deliberately package-neutral so it survives the per-component entry-point
 * split (#28) without any component importing another's module for it.
 */
export type CaeFormFieldAppearance = 'fill' | 'outline';
