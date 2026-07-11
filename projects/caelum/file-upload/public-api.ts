/**
 * Secondary entry point `caelum/file-upload` (issue #338) — importable and tree-shakable on its own,
 * mirroring Angular Material's per-component entry points ("pay only for what you import", Book 18 §3.3).
 * The third and final member of the Book 11 §3.3 drag-drop cluster (OrderList / PickList / FileUpload):
 * a keyboard-reachable native `<input type=file>` + pointer dropzone that validates type/size at the
 * trust boundary and uploads via `HttpClient` with progress/cancel/retry (`p-fileUpload` parity), built
 * on Angular core + `@angular/common/http` + `@angular/cdk/a11y` only. Everything here is also
 * re-exported from the primary `caelum` barrel.
 */
export * from './file-upload';
