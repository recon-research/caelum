/**
 * Secondary entry point `caelum/pick-list` (issue #337) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * The second member of the Book 11 §3.3 drag-drop cluster (OrderList / PickList / FileUpload): two
 * connected, keyboard-operable lists you move items between (`p-pickList` parity) built on
 * `@angular/cdk/drag-drop` + `@angular/cdk/a11y` only. Everything here is also re-exported from the
 * primary `caelum` barrel.
 */
export * from './pick-list';
