/**
 * Secondary entry point `caelum/skeleton` (issue #662, M3 display cluster) — the loading
 * placeholder (`reference/COMPARISON.md`: `p-skeleton` → `cae-skeleton`, "CSS shimmer"; Book 11
 * §3.1). A token-skinned, purely-decorative box that stands in for content while it loads. No
 * Material, no CDK — Angular core only. Re-exported by the primary `caelum` barrel (it imports no
 * optional peer, so it rides the barrel per D-652).
 */
export * from './skeleton';
