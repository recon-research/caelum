/**
 * Secondary entry point `caelum/timeline` (issue #662, M3 display cluster) — the event timeline
 * (`reference/COMPARISON.md`: `p-timeline` → `cae-timeline`, "CSS/flex + CDK"; Book 11 §3.1). A
 * data-driven ordered list of events with a marker/connector rail, `left`/`right`/`alternate`
 * alignment and `vertical`/`horizontal` layout, plus projected `caeTimelineContent` /
 * `caeTimelineOpposite` / `caeTimelineMarker` templates. Angular core only (NgTemplateOutlet). Re-
 * exported by the primary `caelum` barrel (imports no optional peer — D-652).
 */
export * from './timeline';
