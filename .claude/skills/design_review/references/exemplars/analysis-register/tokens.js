/* ORDINATE register tokens — the analysis-register taste layer.
   Single source of truth: every color and type decision in the analysis
   exemplar derives from T (house-style.md § ORDINATE; design-craft.md
   § Craft rules). Sibling of the ORRERY tokens, deliberately calmer:
   the register's job is READING data, so contrast floors are higher
   (muted is a reading tone here, ≥4.5:1 on surfaces — only `faint` is
   chrome-only) and the palette adds a series ramp, because comparing
   runs needs identity colors that never collide with judgment colors.
   Font stacks carry fallbacks so the register degrades gracefully offline. */
export const T = {
  bg: "#0C0F16",         // graphite blue-black — dark-dashboard native, never pure black
  surface: "#121722",
  surface2: "#19202E",
  line: "#29334A",
  lineSoft: "#1E2637",
  ink: "#E6EBF4",
  muted: "#94A0B3",      // secondary READING tone — holds ≥4.5:1 on surface
  faint: "#5B6880",      // chrome/de-emphasis only — never the sole carrier of text users must read
  amber: "#F0B25B",      // attention / AI-originated / focus ring (house semantic)
  green: "#5ECF95",      // pass / healthy / recommended (house semantic)
  red: "#FF6B65",        // fail / regression / untrustworthy (house semantic)
  /* Series ramp: run IDENTITY only — never judgment. Judgment stays
     green/red/amber above. Three steps because more than ~4 overlaid
     curves stops being a comparison and starts being spaghetti. */
  series: ["#5FA9FF", "#B78AF7", "#3FD0C9"],
  /* Alpha variants live here so screens never compose raw color values. */
  greenBand: "rgba(94,207,149,0.08)",   // healthy-zone fill drawn ON charts
  greenSoftLine: "rgba(94,207,149,0.45)",
  amberFlash: "rgba(240,178,91,0.20)",
  seriesBand: [                          // seed-spread fills, one per series step
    "rgba(95,169,255,0.14)",
    "rgba(183,138,247,0.14)",
    "rgba(63,208,201,0.14)",
  ],
  display: "'Space Grotesk', 'Segoe UI', sans-serif", // wordmark + screen title only
  body: "'IBM Plex Sans', 'Segoe UI', sans-serif",    // labels, prose, legends — mixed case
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace", // tabular data + axes
  r: 4,                  // one quiet radius — chips and buttons; panels stay hairline
};
