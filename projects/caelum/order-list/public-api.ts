/**
 * Secondary entry point `caelum/order-list` (issue #336) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * The first member of the Book 11 §3.3 drag-drop cluster (OrderList / PickList / FileUpload): a
 * keyboard-operable, drag-reorderable list (`p-orderList` parity) built on `@angular/cdk/drag-drop` +
 * `@angular/cdk/a11y` only. Everything here is also re-exported from the primary `caelum` barrel.
 */
export * from './order-list';
