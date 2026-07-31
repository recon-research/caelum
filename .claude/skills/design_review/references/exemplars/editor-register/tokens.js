/* HALCYON register tokens — the portable taste layer for editor-chrome surfaces.
   Single source of truth: every color and type decision in the editor-register
   exemplars derives from T (house-style.md § HALCYON; design-craft.md § Craft rules).
   Chrome is a two-tone deal — warm graphite + ONE selection amber. Every other
   hue below is a fixed-meaning FUNCTIONAL family (axes, object types, port
   types, judgment states): never decorative, never re-mapped per screen.
   Font stacks carry fallbacks so the register degrades gracefully offline. */
export const T = {
  /* warm graphite ramp — chrome only, never data */
  bg0: "#141110",       // deepest: menu, tab strips, status bar
  bg1: "#191513",       // workspace background
  panel: "#1E1A16",     // panel body
  raised: "#27221C",    // hover / active surfaces
  inset: "#100D0B",     // wells: inputs, lanes, search
  line: "#2E2822",      // hairline strokes
  line2: "#3D352B",     // emphasized strokes
  /* ink ramp */
  ink: "#EFE9DE",
  mut: "#A89E8F",
  dim: "#6E6659",
  /* THE accent — selection, current frame, unsaved, primary action */
  amber: "#F2A64B",
  /* judgment states (never layout, never decoration) */
  ok: "#7FBE79",
  warn: "#D9AE4F",
  err: "#E05B4E",
  /* gizmo / channel axes — X is always this red, Y this green, Z this blue */
  axisX: "#DE5F49",
  axisY: "#7FB851",
  axisZ: "#5C8CDB",
  /* object-type badges (scene tree, asset tiles) */
  tMesh: "#6FA3DC",
  tLight: "#D9BE66",
  tCamera: "#B78FDB",
  tVolume: "#54B7A6",
  tSpawn: "#7CC286",
  tSeq: "#DD8FB1",
  tGroup: "#93887A",
  /* typed port/wire hues (node canvases) — type is readable with no legend */
  pFloat: "#7FCB9B",
  pVector: "#A98FE8",
  pColor: "#E3BE5C",
  pTexture: "#E88BA4",
  /* exemplar scene-content palette (the world in the viewport, not chrome) */
  scene: {
    skyTop: "#AFBFCF",
    skyLow: "#E6EBEF",
    glow: "#F2DFC4",
    ridgeFar: "#97A8B8",
    ridgeNear: "#71818F",
    snow: "#DDE3E8",
    snowShade: "#C3CCD5",
    grid: "#A7B2BD",
    steel: "#5A636D",
    steelDark: "#3C444D",
    cable: "#333E48",
    cabin: "#2F6B58",
    cabinDark: "#224E40",
    cabinRoof: "#1B3B31",
    glass: "#9FB6C4",
    shadow: "#8E9AA6",
  },
  /* type */
  ui: "'Public Sans', 'Segoe UI', system-ui, sans-serif",   // chrome, labels, prose
  mono: "'Spline Sans Mono', 'Cascadia Mono', Consolas, monospace", // every number, path, log
};

/* All translucency traces to a token too — no rgba() literals in screens. */
export const alpha = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
