/**
 * Secondary entry point `caelum/popover` (issue #664, M3-exit set) — the anchored, trigger-relative
 * content overlay (`reference/COMPARISON.md` row 108: `p-popover`, formerly `p-overlaypanel`, →
 * `cae-popover`; Book 09 §3.2, the command-overlay family). A `CdkConnectedOverlay`/CDK-`Overlay`
 * panel positioned next to its trigger — the OTHER overlay family from the centered-modal `cae-dialog`
 * (Book 09 §2.1's command-vs-value split). Imports no optional peer, so it rides the primary `caelum`
 * barrel per D-652.
 */
export * from './popover';
