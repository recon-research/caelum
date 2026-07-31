/* ORRERY house tokens — the portable taste layer.
   Single source of truth: every color and type decision in the exemplars
   derives from T (house-style.md § ORRERY; design-craft.md § Craft rules).
   Font stacks carry fallbacks so the register degrades gracefully offline. */
export const T = {
  bg: "#070B12",        // deep blue-black, never pure black
  surface: "#0D1420",
  surface2: "#121B2B",
  line: "#22304A",
  lineSoft: "#182338",
  ink: "#DCE6F2",
  muted: "#5F7189",
  faint: "#3A4A63",
  amber: "#FFB454",     // command / attention / AI-originated
  cyan: "#57D4DD",      // telemetry / live data
  red: "#FF5C5C",       // threat / abort / untrustworthy
  green: "#7BD88F",     // nominal / healthy / recommended
  display: "'Chakra Petch', 'Segoe UI', sans-serif",   // wordmarks, eyebrows, buttons
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace", // all data
  body: "'IBM Plex Sans', 'Segoe UI', sans-serif",     // prose, help text
};
