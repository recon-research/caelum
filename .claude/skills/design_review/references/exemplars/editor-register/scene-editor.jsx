import { useState, useEffect, useRef, useMemo } from "react";
import { T, alpha } from "./tokens.js";

/* ============================================================
   PASS 1 — DESIGN PLAN
   Subject: CAPSTAN 1.8 — scene editor + sequencer of a fictional
   game engine. Project "Thaw" (a cozy alpine-restoration game).
   Scene Sorrel_Midstation: the mid-station of the Kettlehorn
   ropeway at first light. A designer is polishing the gondola
   docking move — SEQ_Dock_Arrival.vseq, 240 f @ 30 fps = 8.000 s,
   playhead parked at F132 = 4.400 s, mid-deceleration.
   Audience: a level designer judging dock-in motion and timing.
   Single job: read the docking move against the scene and the
   sequence at once, and trust every number.
   Tokens: HALCYON register (see tokens.js) — warm graphite chrome,
   ONE selection amber, fixed-meaning functional hue families
   (RGB axes, object types, judgment states).
   Signature: the sequencer-driven catenary. One key dataset feeds
   the timeline diamonds, the gondola's position on the cable in
   the viewport, the inspector floats and the status-bar coords —
   they cannot disagree. The viewport is a pale dawn scene inside
   dark tool furniture: bright world, quiet chrome.
   Copy: all counts derived (24 keys · 2 events summed from track
   arrays; 37 objects counted from the tree; F132 ↔ 4.400 s;
   6.1 ms ↔ 164 fps; the status strip mirrors a real cook warning
   about CC_Gondola_03, which really exists in the tree).

   Canonicalized from the #149 banked collection — ledger in README.md.
   ============================================================ */

/* Deterministic stream for generated data (frameworks.md § React). */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─────────── sequence data — the single source every surface reads ─────────── */
const FPS = 30;
const LEN = 240;                      // frames; seconds derive from this
const WORK = [96, 168];               // loop / work range
const FRAME = 132;                    // parked playhead
const secs = (f) => (f / FPS).toFixed(3);
const pct = (f) => (f / LEN) * 100;

const XKEYS = [[0, -24], [96, -6], [168, 8.2], [240, 8.2]];   // gondola travel, m
const YKEYF = [0, 48, 96, 132, 168, 200, 240];                // baked from the cable constraint
const ZKEYS = [[0, 0], [120, 0.06], [240, 0]];                // lateral sway, m

const smooth = (t) => t * t * (3 - 2 * t);
const evalKeys = (keys, f) => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0] = keys[i], [f1, v1] = keys[i + 1];
    if (f <= f1) return v0 + (v1 - v0) * smooth((f - f0) / (f1 - f0));
  }
  return keys[keys.length - 1][1];
};

/* ropeway constraint: the cable is a catenary (parabolic approx); the cabin
   hangs from it. y keys are BAKED samples of this same function, so timeline,
   viewport, inspector and status bar agree by construction. */
const CAB = { ax: -26, ay: 13.4, bx: 10, by: 6.6, sag: 2.6, hang: 0.5, halfH: 0.95 };
const cableY = (x) => {
  const u = (x - CAB.ax) / (CAB.bx - CAB.ax);
  return CAB.ay + (CAB.by - CAB.ay) * u - CAB.sag * 4 * u * (1 - u);
};
const xAt = (f) => evalKeys(XKEYS, f);
const yAt = (f) => cableY(xAt(f)) - CAB.hang - CAB.halfH;   // cabin center
const zAt = (f) => evalKeys(ZKEYS, f);
const posAt = (f) => [xAt(f), yAt(f), zAt(f)]; // one source: inspector, status bar, viewport all evaluate this
const fmt3 = (n) => n.toFixed(3);

const TRACKS = [
  { group: "CC_Gondola_02", rows: [
    { id: "translate.x", axis: "x", keys: XKEYS.map((k) => k[0]) },
    { id: "translate.y", axis: "y", keys: YKEYF },
    { id: "translate.z", axis: "z", keys: ZKEYS.map((k) => k[0]) },
    { id: "door_L.rotate", keys: [168, 180, 196] },
    { id: "door_R.rotate", keys: [168, 182, 198] },
  ]},
  { group: "CAM_Dock_Cut", rows: [
    { id: "cut", keys: [0, 72, 132, 204] },
  ]},
];
const EVENTS = [
  { f: 24, label: "sfx.cable_thrum" },
  { f: 164, label: "sfx.dock_clunk" },
];
const groupKeys = (g) => g.rows.reduce((a, r) => a + r.keys.length, 0);
const TOTAL_KEYS = TRACKS.reduce((a, g) => a + groupKeys(g), 0);           // 24
const ACTOR_KEYS = groupKeys(TRACKS[0]);                                   // 20

/* ─────────── scene tree — object count derives from this ─────────── */
const TREE = {
  id: "root", name: "Sorrel_Midstation", type: "scene",
  children: [
    { id: "terrain", name: "Terrain", type: "group", childCount: 14 },
    { id: "station", name: "Station", type: "group", childCount: 3 },
    { id: "ropeway", name: "Ropeway", type: "group", children: [
      { id: "pyl07", name: "PYL_Tower_07", type: "mesh" },
      { id: "pyl08", name: "PYL_Tower_08", type: "mesh" },
      { id: "cable", name: "CBL_Main_Span", type: "mesh" },
      { id: "gon02", name: "CC_Gondola_02", type: "mesh" },
      { id: "gon03", name: "CC_Gondola_03", type: "mesh" },
    ]},
    { id: "lighting", name: "Lighting", type: "group", children: [
      { id: "sun", name: "DL_Morning_Key", type: "light" },
      { id: "floods", name: "SP_Deck_Floods", type: "light" },
    ]},
    { id: "gameplay", name: "Gameplay", type: "group", children: [
      { id: "spawn", name: "PlayerStart_Dock", type: "spawn" },
      { id: "trg", name: "TRG_Boarding_Gate", type: "volume" },
    ]},
    { id: "seqs", name: "Sequences", type: "group", children: [
      { id: "seq", name: "SEQ_Dock_Arrival", type: "seq" },
    ]},
    { id: "cams", name: "Cameras", type: "group", childCount: 2 },
  ],
};
const countTree = (n) => (n.children ? 1 + n.children.reduce((s, c) => s + countTree(c), 0) : 1 + (n.childCount || 0));
const TOTAL_OBJECTS = countTree(TREE); // 37

const MIRROR_LOG = { tag: "Cook", cls: "warn", msg: "CC_Gondola_03: LOD1 missing — LOD0 forced" };

const BADGE = {
  scene: { ch: "S", c: T.amber }, group: { ch: "G", c: T.tGroup }, mesh: { ch: "M", c: T.tMesh },
  light: { ch: "L", c: T.tLight }, camera: { ch: "C", c: T.tCamera }, volume: { ch: "V", c: T.tVolume },
  spawn: { ch: "P", c: T.tSpawn }, seq: { ch: "Q", c: T.tSeq },
};

/* ─────────── icons (currentColor, aria-hidden) ─────────── */
function Ic({ p, f, s = 14, sw = 1.6, style }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={f ? "currentColor" : "none"} stroke={f ? "none" : "currentColor"}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {Array.isArray(p) ? p.map((d, i) => <path key={i} d={d} />) : <path d={p} />}
    </svg>
  );
}
const IC = {
  select: "M6 3v16l4.2-3.6 2.3 5.6 3-1.2-2.3-5.6 5.4-.6z",
  move: "M12 3v18M3 12h18M12 3l-2.6 3M12 3l2.6 3M12 21l-2.6-3M12 21l2.6-3M3 12l3-2.6M3 12l3 2.6M21 12l-3-2.6M21 12l-3 2.6",
  rotate: "M19.5 12a7.5 7.5 0 1 1-2.3-5.4M19.5 3.6v3.6h-3.6",
  scale: "M4 20h6M4 20v-6M4 20l7-7M14 4h6M20 4v6M20 4l-7 7",
  magnet: "M7 3v8a5 5 0 0 0 10 0V3M4.8 3h4.4M14.8 3h4.4",
  angle: "M5 19h14M5 19V5M5 19L17 7M11 19a8 8 0 0 0-2.3-5.7",
  play: "M8 5.2l11 6.8-11 6.8z",
  pause: "M9 5v14M15.5 5v14",
  stepB: "M15.5 6l-6 6 6 6",
  stepF: "M8.5 6l6 6-6 6",
  toStart: ["M7 5v14", "M18 6l-7 6 7 6z"],
  toEnd: ["M17 5v14", "M6 6l7 6-7 6z"],
  prevKey: ["M9 6l-5 6 5 6", "M13 9.2l2.8 2.8-2.8 2.8-2.8-2.8z"],
  nextKey: ["M15 6l5 6-5 6", "M11 9.2l2.8 2.8-2.8 2.8L8.2 12z"],
  loop: "M17.5 8H8a4 4 0 1 0 0 8h1.5M15 5l3 3-3 3",
  fit: "M8.5 3.5h-5v5M15.5 3.5h5v5M3.5 15.5v5h5M20.5 15.5v5h-5",
  search: ["M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12z", "M15.6 15.6L21 21"],
  eye: ["M2.4 12S6 5.8 12 5.8 21.6 12 21.6 12 18 18.2 12 18.2 2.4 12 2.4 12z", "M12 14.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z"],
  eyeOff: ["M4 4.5l16 15M9.9 6.2A9.9 9.9 0 0 1 12 5.8c6 0 9.6 6.2 9.6 6.2a17 17 0 0 1-3.2 3.6M6 7.6A16 16 0 0 0 2.4 12S6 18.2 12 18.2a9.4 9.4 0 0 0 3.4-.7"],
  lock: ["M6.5 11h11v9h-11z", "M9 11V8a3 3 0 0 1 6 0v3"],
  chev: "M6.5 9.5l5.5 5.5 5.5-5.5",
  dots: "M12 6.2v.1M12 12v.1M12 17.8v.1",
  plus: "M12 5v14M5 12h14",
  save: "M5 4h11.5L20 7.5V20H5zM8.5 4v5.5h7V4M8 14h8M8 17h5",
  minus: "M5.5 12.5h13",
  square: "M6.5 6.5h11v11h-11z",
  x: "M6 6l12 12M18 6L6 18",
  link: "M10.2 13.8a3.6 3.6 0 0 1 0-5.1l2.2-2.2a3.6 3.6 0 1 1 5.1 5.1l-1.1 1.1M13.8 10.2a3.6 3.6 0 0 1 0 5.1l-2.2 2.2a3.6 3.6 0 1 1-5.1-5.1l1.1-1.1",
  warn: ["M12 4L2.8 19.6h18.4z", "M12 10v4M12 16.8v.1"],
  cube: "M12 2.8l8 4.4v9.6l-8 4.4-8-4.4V7.2zM4 7.2l8 4.4 8-4.4M12 11.6V21.2",
  grid: "M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16",
  clap: ["M3.5 9h17v11h-17z", "M3.5 9l2-4.5 15 2.2-1.4 2.3M8 5.6l-2 4M13 6.4l-2 4M18 7.2l-2 4"],
};

/* the CAPSTAN mark: a winch drum seen from above */
const Mark = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={{ color: T.amber }}>
    <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <path d="M12 3.4v5M12 15.6v5M3.4 12h5M15.6 12h5" stroke="currentColor" strokeWidth="2" />
  </svg>
);

/* ═══════════════ 3D viewport — one camera over the sequenced world ═══════════════ */
const VB_W = 1000, VB_H = 620, FOCAL = 620, ZNEAR = 1.5;
const EYE = [9, 8, 20], TGT = [-3, 6, -1];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const F = norm3(sub3(TGT, EYE));
const R = norm3(cross3(F, [0, 1, 0]));
const U = cross3(R, F);
const proj = (p) => {
  const d = sub3(p, EYE);
  const z = dot3(d, F);
  return { x: VB_W / 2 + (dot3(d, R) / z) * FOCAL, y: VB_H / 2 - (dot3(d, U) / z) * FOCAL, z };
};
const camZ = (p) => dot3(sub3(p, EYE), F);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function seg(a, b) {
  const za = camZ(a), zb = camZ(b);
  if (za < ZNEAR && zb < ZNEAR) return null;
  let A = a, B = b;
  if (za < ZNEAR) A = lerp3(a, b, (ZNEAR - za) / (zb - za));
  else if (zb < ZNEAR) B = lerp3(a, b, (ZNEAR - za) / (zb - za));
  const p = proj(A), q = proj(B);
  return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
}
const poly = (pts) => "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L") + "Z";
const open = (pts) => "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L");

const SUN = norm3([0.7, 0.55, 0.4]);
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (hex, n, lift = 0) => {
  const k = 0.62 + 0.38 * Math.max(0, dot3(n, SUN)) + lift;
  const c = hexRGB(hex).map((v) => Math.min(255, Math.round(v * k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
/* axis-aligned box → visible shaded faces + silhouette for selection */
function box(cx, cy, cz, w, h, d, base, lift = 0) {
  const W = w / 2, D = d / 2;
  const v = [
    [cx - W, cy, cz - D], [cx + W, cy, cz - D], [cx + W, cy, cz + D], [cx - W, cy, cz + D],
    [cx - W, cy + h, cz - D], [cx + W, cy + h, cz - D], [cx + W, cy + h, cz + D], [cx - W, cy + h, cz + D],
  ];
  const faces = [
    { i: [4, 5, 6, 7], n: [0, 1, 0] }, { i: [0, 1, 5, 4], n: [0, 0, -1] }, { i: [2, 3, 7, 6], n: [0, 0, 1] },
    { i: [1, 2, 6, 5], n: [1, 0, 0] }, { i: [3, 0, 4, 7], n: [-1, 0, 0] },
  ];
  const out = [];
  for (const f of faces) {
    const pts = f.i.map((k) => v[k]);
    const c = pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
    if (dot3(f.n, sub3(EYE, c)) <= 0) continue;
    out.push({ d: poly(pts.map(proj)), fill: shade(base, f.n, lift) });
  }
  return out;
}
const ell = (cx, y, cz, rx, rz, n = 22) => {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; pts.push(proj([cx + Math.cos(t) * rx, y, cz + Math.sin(t) * rz])); }
  return poly(pts);
};
const catenary = (x0, x1, dz = 0, lower = 0, n = 26) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; pts.push(proj([x, cableY(x) - lower, dz])); }
  return open(pts);
};

/* ridge silhouettes, seeded — same mountains every render */
function ridgePath(rnd, hz, base, amp, step = 90) {
  let d = `M-20 ${hz + 220}L-20 ${(hz - base - rnd() * amp).toFixed(0)}`;
  for (let x = 0; x <= VB_W + step; x += step) {
    d += `L${x + rnd() * 40 - 20} ${(hz - base - rnd() * amp).toFixed(0)}`;
  }
  return d + `L${VB_W + 20} ${hz + 220}Z`;
}

function Viewport({ frame }) {
  const S = useMemo(() => {
    const rnd = mulberry32(0x50e77);
    const hz = proj([EYE[0] + F[0] * 900, EYE[1], EYE[2] + F[2] * 900]).y;
    /* editor grid on the snow */
    let minor = "", major = "";
    for (let x = -34; x <= 16; x += 2) {
      const d = seg([x, 0, -10], [x, 0, 14]); if (d) { if (x % 10 === 0) major += d; else minor += d; }
    }
    for (let z = -10; z <= 14; z += 2) {
      const d = seg([-34, 0, z], [16, 0, z]); if (d) { if (z % 10 === 0) major += d; else minor += d; }
    }
    /* gondola (sequence-driven) + world furniture */
    const gx = xAt(frame), gy = yAt(frame), gz = zAt(frame);
    const cabin = box(gx, gy - CAB.halfH, gz, 1.6, 1.9, 1.3, T.scene.cabin, 0.04);
    const roofCap = box(gx, gy + CAB.halfH, gz, 1.7, 0.14, 1.4, T.scene.cabinRoof);
    const truck = box(gx, cableY(gx) - 0.16, gz, 0.55, 0.3, 0.3, T.scene.steelDark);
    const hanger = seg([gx, gy + CAB.halfH, gz], [gx, cableY(gx), gz]);
    const glassL = box(gx, gy - 0.35, gz, 1.64, 0.75, 1.1, T.scene.glass, 0.05).slice(1, 3);
    /* second cabin far up the return line (0.35 m lower than the main span) */
    const g3x = -17, g3z = 1.6, g3y = cableY(g3x) - 0.35 - CAB.hang - CAB.halfH;
    const cabin3 = box(g3x, g3y - CAB.halfH, g3z, 1.6, 1.9, 1.3, T.scene.cabin, -0.12);
    const hanger3 = seg([g3x, g3y + CAB.halfH, g3z], [g3x, cableY(g3x) - 0.35, g3z]);
    /* pylon 07: two legs + crossarm */
    const legs = [
      ...box(-26.6, 0, 0.8, 0.5, 13.0, 0.5, T.scene.steel),
      ...box(-25.4, 0, -0.8, 0.5, 13.0, 0.5, T.scene.steel),
      ...box(-26, 13.0, 0, 3.4, 0.5, 2.6, T.scene.steelDark),
    ];
    const braces = [seg([-26.6, 3, 0.8], [-25.4, 6, -0.8]), seg([-25.4, 3, -0.8], [-26.6, 6, 0.8]),
      seg([-26.6, 7, 0.8], [-25.4, 10, -0.8]), seg([-25.4, 7, -0.8], [-26.6, 10, 0.8])].filter(Boolean);
    /* station: deck slab, posts, roof, drive wheel */
    const deckTop = yAt(168) - CAB.halfH - 0.12;   // boarding sill sits just under the docked cabin
    const deck = box(9.5, deckTop - 0.55, 2.9, 9, 0.55, 4.4, T.scene.snowShade, 0.06);
    const posts = [
      ...box(6.2, 0, 1.2, 0.4, deckTop - 0.55, 0.4, T.scene.steel),
      ...box(6.2, 0, 4.4, 0.4, deckTop - 0.55, 0.4, T.scene.steel),
      ...box(6.2, deckTop, 1.2, 0.34, 6.9 - deckTop, 0.34, T.scene.steel),
      ...box(6.2, deckTop, 4.4, 0.34, 6.9 - deckTop, 0.34, T.scene.steel),
    ];
    const roof = box(9.8, 6.9, 2.8, 8.6, 0.3, 5.0, T.scene.steelDark);
    const wheelC = [10, cableY(10) + 0.05, 0];
    const wheelPts = [];
    for (let i = 0; i <= 24; i++) { const t = (i / 24) * Math.PI * 2; wheelPts.push(proj([wheelC[0], wheelC[1] + Math.cos(t) * 0.85, wheelC[2] + 0.0001 + Math.sin(t) * 0.1])); }
    /* gameplay markers */
    const trg = (() => {
      const [x0, x1, y0, y1, z0, z1] = [6.6, 9.4, deckTop, deckTop + 2.3, 0.9, 2.5];
      const E8 = [
        [[x0, y0, z0], [x1, y0, z0]], [[x1, y0, z0], [x1, y0, z1]], [[x1, y0, z1], [x0, y0, z1]], [[x0, y0, z1], [x0, y0, z0]],
        [[x0, y1, z0], [x1, y1, z0]], [[x1, y1, z0], [x1, y1, z1]], [[x1, y1, z1], [x0, y1, z1]], [[x0, y1, z1], [x0, y1, z0]],
        [[x0, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0]], [[x1, y0, z1], [x1, y1, z1]], [[x0, y0, z1], [x0, y1, z1]],
      ];
      return E8.map(([a, b]) => seg(a, b)).filter(Boolean).join("");
    })();
    const spawnAt = [10.4, deckTop, 3.6];
    /* terrain texture: snow drifts + flecks (seeded — part of the Terrain group) */
    const drifts = [ell(-9, 0.03, 8, 4.2, 2.2), ell(-17, 0.03, 3.5, 3.2, 1.7), ell(-2, 0.03, 11, 3.4, 1.9)];
    const flecks = [];
    for (let i = 0; i < 26; i++) {
      const p = proj([-30 + rnd() * 44, 0.01, -6 + rnd() * 18]);
      if (p.z > ZNEAR) flecks.push(p);
    }
    /* selection: cabin silhouette */
    const outline = [...cabin, ...roofCap].map((f) => f.d);
    /* gizmo at cabin center */
    const O = [gx, gy, gz];
    const arrow = (dir, col) => {
      const tip = [O[0] + dir[0] * 2.2, O[1] + dir[1] * 2.2, O[2] + dir[2] * 2.2];
      const p0 = proj(O), p1 = proj(tip);
      let dx = p1.x - p0.x, dy = p1.y - p0.y;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const bx = p1.x - dx * 14, by = p1.y - dy * 14, nx = -dy * 5.2, ny = dx * 5.2;
      return { line: `M${(p0.x + dx * 10).toFixed(1)} ${(p0.y + dy * 10).toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`,
        head: `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)}L${(bx + nx).toFixed(1)} ${(by + ny).toFixed(1)}L${(bx - nx).toFixed(1)} ${(by - ny).toFixed(1)}Z`, col };
    };
    const giz = { arrows: [arrow([1, 0, 0], T.axisX), arrow([0, 1, 0], T.axisY), arrow([0, 0, 1], T.axisZ)], origin: proj(O) };
    const cabTop = proj([gx, gy + CAB.halfH + 0.35, gz]);
    return {
      hz, minor, major, drifts, flecks,
      ridgeFar: ridgePath(rnd, hz, 24, 66), ridgeNear: ridgePath(rnd, hz, 6, 38, 70),
      shadows: [ell(gx, 0.02, gz, 1.5, 1.1), ell(-26, 0.02, 0, 2.2, 1.5), ell(g3x, 0.02, g3z, 1.4, 1.0)],
      cabin, roofCap, truck, hanger, glassL, cabin3, hanger3, legs, braces, deck, posts, roof,
      wheel: poly(wheelPts), trg, spawnAt, outline, giz, cabTop,
      cableMain: catenary(CAB.ax, CAB.bx, 0), cableRet: catenary(CAB.ax, CAB.bx, 1.6, 0.35),
    };
  }, [frame]);

  const sp = proj([S.spawnAt[0], S.spawnAt[1] + 0.02, S.spawnAt[2]]);
  const spTop = proj([S.spawnAt[0], S.spawnAt[1] + 1.0, S.spawnAt[2]]);
  const flood = proj([6.2, 7.15, 4.4]);

  return (
    <div className="cp-view">
      <svg className="cp-viewsvg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice" role="img"
        aria-label="Perspective viewport of Sorrel_Midstation: CC_Gondola_02 selected mid-span on the main cable, station deck to the right, tower 07 to the left">
        <defs>
          <linearGradient id="cpSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={T.scene.skyTop} />
            <stop offset="1" stopColor={T.scene.skyLow} />
          </linearGradient>
          <linearGradient id="cpSnow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={T.scene.skyLow} />
            <stop offset="0.35" stopColor={T.scene.snow} />
            <stop offset="1" stopColor={T.scene.snowShade} />
          </linearGradient>
          <radialGradient id="cpGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={alpha(T.scene.glow, 0.85)} />
            <stop offset="1" stopColor={alpha(T.scene.glow, 0)} />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={VB_W} height={S.hz} fill="url(#cpSky)" />
        <circle cx="820" cy={S.hz - 26} r="150" fill="url(#cpGlow)" />
        <path d={S.ridgeFar} fill={T.scene.ridgeFar} opacity="0.55" />
        <path d={S.ridgeNear} fill={T.scene.ridgeNear} opacity="0.5" />
        <rect x="0" y={S.hz} width={VB_W} height={VB_H - S.hz} fill="url(#cpSnow)" />
        {S.drifts.map((d, i) => <path key={i} d={d} fill={T.scene.snowShade} opacity="0.55" />)}
        {S.flecks.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.1" fill={T.scene.grid} opacity="0.4" />)}
        <path d={S.minor} stroke={T.scene.grid} strokeWidth="1" opacity="0.34" fill="none" vectorEffect="non-scaling-stroke" />
        <path d={S.major} stroke={T.scene.grid} strokeWidth="1" opacity="0.6" fill="none" vectorEffect="non-scaling-stroke" />
        <g opacity="0.5">{S.shadows.map((d, i) => <path key={i} d={d} fill={T.scene.shadow} opacity="0.45" />)}</g>

        {/* tower 07 */}
        {S.legs.map((f, i) => <path key={i} d={f.d} fill={f.fill} stroke={alpha(T.scene.steelDark, 0.6)} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {S.braces.map((d, i) => <path key={i} d={d} stroke={T.scene.steel} strokeWidth="1.4" fill="none" vectorEffect="non-scaling-stroke" />)}

        {/* cables */}
        <path d={S.cableRet} stroke={T.scene.cable} strokeWidth="1.2" fill="none" opacity="0.55" vectorEffect="non-scaling-stroke" />
        <path d={S.cableMain} stroke={T.scene.cable} strokeWidth="1.8" fill="none" vectorEffect="non-scaling-stroke" />

        {/* far cabin on the return line */}
        {S.hanger3 && <path d={S.hanger3} stroke={T.scene.steelDark} strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" opacity="0.8" />}
        {S.cabin3.map((f, i) => <path key={i} d={f.d} fill={f.fill} opacity="0.82" stroke={alpha(T.scene.cabinRoof, 0.5)} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}

        {/* station */}
        {S.deck.map((f, i) => <path key={i} d={f.d} fill={f.fill} stroke={alpha(T.scene.steelDark, 0.35)} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {S.posts.map((f, i) => <path key={i} d={f.d} fill={f.fill} />)}
        {S.roof.map((f, i) => <path key={i} d={f.d} fill={f.fill} stroke={alpha(T.scene.cabinRoof, 0.4)} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={S.wheel} fill="none" stroke={T.scene.steelDark} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />

        {/* gameplay markers */}
        <path d={S.trg} stroke={T.tVolume} strokeWidth="1.2" strokeDasharray="4 4" fill="none" opacity="0.85" vectorEffect="non-scaling-stroke" />
        <g>
          <path d={ell(S.spawnAt[0], S.spawnAt[1] + 0.02, S.spawnAt[2], 0.32, 0.32, 16)} fill={alpha(T.tSpawn, 0.3)} stroke={T.tSpawn} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          <path d={`M${sp.x.toFixed(1)} ${sp.y.toFixed(1)}L${spTop.x.toFixed(1)} ${spTop.y.toFixed(1)}`} stroke={T.tSpawn} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <circle cx={spTop.x} cy={spTop.y} r="3" fill={T.tSpawn} />
        </g>
        <g>
          <rect x={flood.x - 3.4} y={flood.y - 3.4} width="6.8" height="6.8" transform={`rotate(45 ${flood.x} ${flood.y})`} fill="none" stroke={T.tLight} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <circle cx={flood.x} cy={flood.y} r="1.4" fill={T.tLight} />
        </g>

        {/* the selected, sequence-driven gondola */}
        {S.hanger && <path d={S.hanger} stroke={T.scene.steelDark} strokeWidth="2.4" fill="none" vectorEffect="non-scaling-stroke" />}
        {S.truck.map((f, i) => <path key={i} d={f.d} fill={f.fill} />)}
        {S.cabin.map((f, i) => <path key={i} d={f.d} fill={f.fill} stroke={alpha(T.scene.cabinRoof, 0.55)} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
        {S.glassL.map((f, i) => <path key={i} d={f.d} fill={f.fill} opacity="0.9" />)}
        {S.roofCap.map((f, i) => <path key={i} d={f.d} fill={f.fill} />)}
        <g opacity="0.9">{S.outline.map((d, i) => <path key={i} d={d} fill="none" stroke={T.scene.cabinRoof} strokeWidth="3.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}</g>
        {S.outline.map((d, i) => <path key={i} d={d} fill="none" stroke={T.amber} strokeWidth="1.7" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}

        {/* move gizmo — axis semantics sacred */}
        <g>
          {S.giz.arrows.map((a, i) => (
            <g key={i}>
              <path d={a.line} stroke={T.scene.cabinRoof} strokeWidth="4.6" opacity="0.55" fill="none" vectorEffect="non-scaling-stroke" />
              <path d={a.line} stroke={a.col} strokeWidth="2.6" fill="none" vectorEffect="non-scaling-stroke" />
              <path d={a.head} fill={a.col} stroke={T.scene.cabinRoof} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          <circle cx={S.giz.origin.x} cy={S.giz.origin.y} r="4" fill={T.ink} stroke={T.scene.cabinRoof} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        </g>
        {/* selection label — same name as tree, inspector, status */}
        <g>
          <rect x={S.cabTop.x - 58} y={S.cabTop.y - 22} width="116" height="17" rx="3" fill={alpha(T.bg0, 0.78)} />
          <text x={S.cabTop.x} y={S.cabTop.y - 10} textAnchor="middle" fill={T.ink} fontFamily={T.mono} fontSize="10.5">CC_Gondola_02</text>
        </g>
      </svg>

      {/* overlays live OUTSIDE the role="img" SVG so they stay real, reachable buttons */}
      <div className="cp-ovl cp-ovl-tl">
        <button className="cp-chipd" type="button">Perspective <Ic p={IC.chev} s={10} /></button>
        <button className="cp-chipd" type="button">Lit <Ic p={IC.chev} s={10} /></button>
        <button className="cp-chipd cp-chipd-ic on" type="button" aria-pressed="true" aria-label="Toggle grid"><Ic p={IC.grid} s={11} /></button>
      </div>
      <div className="cp-ovl cp-ovl-tc">
        <span className="cp-seqpill"><Ic p={IC.clap} s={11} /> SEQ_Dock_Arrival · F{FRAME} — transforms driven</span>
      </div>
      <AxisWidget />
      <div className="cp-ovl cp-ovl-bl"><span className="cp-fov">FOV 58° · Near 0.10 · Far 400</span></div>
    </div>
  );
}

function AxisWidget() {
  const cx = 30, cy = 30, RR = 21;
  const axes = [
    { d: [1, 0, 0], c: T.axisX, l: "X" }, { d: [0, 1, 0], c: T.axisY, l: "Y" }, { d: [0, 0, 1], c: T.axisZ, l: "Z" },
  ].map((a) => {
    const sx = dot3(a.d, R) * RR, sy = -dot3(a.d, U) * RR;
    return { ...a, x: cx + sx, y: cy + sy, nx: cx - sx, ny: cy - sy, depth: dot3(a.d, F) };
  }).sort((a, b) => a.depth - b.depth);
  return (
    <div className="cp-ovl cp-ovl-tr">
      <svg width="60" height="60" viewBox="0 0 60 60" role="img" aria-label="Orientation gizmo, perspective view">
        <circle cx={cx} cy={cy} r="26" fill={alpha(T.bg0, 0.62)} stroke={alpha(T.ink, 0.14)} />
        {axes.map((a) => (
          <g key={a.l}>
            <circle cx={a.nx} cy={a.ny} r="3" fill="none" stroke={a.c} strokeWidth="1.2" opacity="0.55" />
            <line x1={cx} y1={cy} x2={a.x} y2={a.y} stroke={a.c} strokeWidth="1.5" />
            <circle cx={a.x} cy={a.y} r="6" fill={a.c} />
            <text x={a.x} y={a.y + 2.8} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={T.bg0} fontFamily={T.mono}>{a.l}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ═══════════════ outliner ═══════════════ */
function TreeRows({ node, depth, ui }) {
  const { selId, setSelId, expanded, setExpanded, hidden, setHidden } = ui;
  const hasKids = !!node.children || !!node.childCount;
  const isOpen = !!node.children && expanded[node.id] !== false;
  const b = BADGE[node.type];
  const isHid = hidden[node.id];
  return (
    <>
      <div className={"cp-row" + (selId === node.id ? " sel" : "") + (isHid ? " hid" : "")}
        role="treeitem" aria-level={depth + 1} aria-selected={selId === node.id}
        aria-expanded={node.children ? isOpen : undefined}
        tabIndex={0} style={{ paddingLeft: 6 + depth * 13 }}
        onClick={() => setSelId(node.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(node.id); } }}>
        {hasKids ? (
          <button className={"cp-caret" + (isOpen ? " open" : "")} type="button" tabIndex={-1}
            aria-label={(isOpen ? "Collapse " : "Expand ") + node.name}
            onClick={(e) => { e.stopPropagation(); if (node.children) setExpanded({ ...expanded, [node.id]: !isOpen }); }}>
            <Ic p="M9 5.5l7 6.5-7 6.5" s={9} sw={2.6} />
          </button>
        ) : <span className="cp-caretsp" />}
        <span className="cp-badge" style={{ color: b.c, borderColor: alpha(b.c, 0.4) }}>{b.ch}</span>
        <span className="cp-rowname">{node.name}</span>
        {node.childCount && !node.children && <span className="cp-rowcount">{node.childCount}</span>}
        <button type="button" className={"cp-mini" + (isHid ? " off" : "")} aria-pressed={!isHid}
          aria-label={(isHid ? "Show " : "Hide ") + node.name}
          onClick={(e) => { e.stopPropagation(); setHidden({ ...hidden, [node.id]: !isHid }); }}>
          <Ic p={isHid ? IC.eyeOff : IC.eye} s={11} />
        </button>
      </div>
      {isOpen && node.children.map((c) => <TreeRows key={c.id} node={c} depth={depth + 1} ui={ui} />)}
    </>
  );
}

function Outliner({ ui }) {
  const hiddenCount = Object.values(ui.hidden).filter(Boolean).length;
  return (
    <section className="cp-panel cp-outliner" aria-label="Outliner">
      <div className="cp-tabs" role="tablist">
        <button className="cp-tab on" role="tab" aria-selected="true" type="button">Outliner</button>
        <button className="cp-tab" role="tab" aria-selected="false" type="button">Layers</button>
        <span className="cp-sp" />
        <button className="cp-iconbtn" type="button" aria-label="Outliner options"><Ic p={IC.dots} s={12} sw={2.6} /></button>
      </div>
      <div className="cp-search">
        <Ic p={IC.search} s={11} style={{ opacity: 0.55 }} />
        <input value={ui.filter} onChange={(e) => ui.setFilter(e.target.value)} placeholder="Filter scene · Ctrl+F" aria-label="Filter scene objects" />
      </div>
      <div className="cp-tree" role="tree" aria-label="Sorrel_Midstation scene tree">
        <TreeRows node={TREE} depth={0} ui={ui} />
      </div>
      <div className="cp-panelfoot">
        <span>{TOTAL_OBJECTS} objects · 1 selected</span>
        <span className="dim">{hiddenCount} hidden</span>
      </div>
    </section>
  );
}

/* ═══════════════ inspector ═══════════════ */
function Sec({ title, right, children }) {
  return (
    <div className="cp-sec">
      <div className="cp-sechead">
        <Ic p={IC.chev} s={10} style={{ opacity: 0.55 }} />
        <span className="cp-sectitle">{title}</span>
        <span className="cp-sp" />
        {right}
      </div>
      <div className="cp-secbody">{children}</div>
    </div>
  );
}
function Row({ label, children }) {
  return <div className="cp-irow"><span className="cp-ilabel">{label}</span><div className="cp-ifields">{children}</div></div>;
}
function Num({ ax, v, aria, driven }) {
  return (
    <span className={"cp-num ax-" + ax + (driven ? " driven" : "")}>
      {/* driven fields are controlled — the sequence owns the value, so it must track the frame */}
      {driven ? <input value={v} readOnly aria-label={aria} inputMode="decimal" />
              : <input defaultValue={v} aria-label={aria} inputMode="decimal" />}
    </span>
  );
}
function Chk({ on, label }) {
  const [v, setV] = useState(on);
  return (
    <button type="button" className={"cp-chk" + (v ? " on" : "")} role="checkbox" aria-checked={v} onClick={() => setV(!v)}>
      <span className="cp-chkbox">{v && <Ic p="M5 12.5l4.5 4.5L19 7" s={9} sw={3.2} />}</span>{label}
    </button>
  );
}

const MAPS = [
  ["T_Cabin_BC", "2048² · BC7", "5.3 MB"],
  ["T_Cabin_N", "2048² · BC5", "5.3 MB"],
  ["T_Cabin_ORM", "1024² · BC7", "1.3 MB"],
];

function Inspector({ frame }) {
  const pos = posAt(frame); // live — scrubbing moves these floats with the viewport and status bar
  return (
    <section className="cp-panel cp-insp" aria-label="Inspector">
      <div className="cp-tabs" role="tablist">
        <button className="cp-tab on" role="tab" aria-selected="true" type="button">Inspector</button>
        <button className="cp-tab" role="tab" aria-selected="false" type="button">History</button>
        <span className="cp-sp" />
        <button className="cp-iconbtn" type="button" aria-label="Lock inspector to selection"><Ic p={IC.lock} s={11} /></button>
      </div>
      <div className="cp-inspscroll">
        <div className="cp-ihead">
          <div className="cp-iheadtop">
            <span className="cp-badge lg" style={{ color: BADGE.mesh.c, borderColor: alpha(BADGE.mesh.c, 0.4) }}>M</span>
            <input className="cp-iname" defaultValue="CC_Gondola_02" aria-label="Object name" />
            <Chk on label="Active" />
          </div>
          <div className="cp-icrumb">Sorrel_Midstation ▸ Ropeway</div>
          <div className="cp-iheadchips">
            <Chk on={false} label="Static" />
            <span className="cp-kv">Tag <b>Ropeway</b></span>
            <span className="cp-kv">Layer <b>Default</b></span>
          </div>
        </div>

        <Sec title="Transform" right={<span className="cp-driventag">◈ driven</span>}>
          <Row label="Position">
            {["x", "y", "z"].map((ax, i) => (
              <Num key={ax} ax={ax} v={fmt3(pos[i])} aria={"Position " + ax.toUpperCase() + " (driven by sequence)"} driven />
            ))}
          </Row>
          <div className="cp-drivennote">Keys own Position while SEQ_Dock_Arrival is open</div>
          <Row label="Rotation">
            {["x", "y", "z"].map((ax, i) => (
              <Num key={ax} ax={ax} v={[0, 90, 0][i].toFixed(3)} aria={"Rotation " + ax.toUpperCase()} />
            ))}
          </Row>
          <Row label="Scale">
            {["x", "y", "z"].map((ax) => (
              <Num key={ax} ax={ax} v="1.000" aria={"Scale " + ax.toUpperCase()} />
            ))}
            <button className="cp-iconbtn" type="button" aria-label="Uniform scale linked" aria-pressed="true"><Ic p={IC.link} s={11} /></button>
          </Row>
        </Sec>

        <Sec title="Sequence Binding" right={<span className="cp-secmeta">{TRACKS[0].rows.length} tracks</span>}>
          <div className="cp-bindrow">
            <span className="cp-badge" style={{ color: BADGE.seq.c, borderColor: alpha(BADGE.seq.c, 0.4) }}>Q</span>
            <span className="cp-bindname">SEQ_Dock_Arrival</span>
            <span className="cp-bindmeta">{ACTOR_KEYS} keys on this actor</span>
          </div>
          <div className="cp-bindtracks">
            {TRACKS[0].rows.map((r) => (
              <div className="cp-bindtrack" key={r.id}>
                {r.axis && <span className="cp-chdot" style={{ background: { x: T.axisX, y: T.axisY, z: T.axisZ }[r.axis] }} />}
                <span className="cp-bindid">{r.id}</span>
                <span className="cp-bindkeys">{r.keys.length} keys</span>
              </div>
            ))}
          </div>
        </Sec>

        <Sec title="Static Mesh">
          <Row label="Mesh">
            <span className="cp-slot"><Ic p={IC.cube} s={11} style={{ color: T.tMesh }} /><span className="cp-slottext">gondola_cabin_B.cmesh</span><Ic p={IC.search} s={10} style={{ opacity: 0.5 }} /></span>
          </Row>
          <div className="cp-meshinfo">2,403 verts · 4,806 tris · 2 LODs · UV0 · UV1</div>
          <Row label="Shadows"><Chk on label="Cast" /><Chk on label="Contribute GI" /></Row>
        </Sec>

        <Sec title="Materials" right={<span className="cp-secmeta">1 slot</span>}>
          <div className="cp-matcard">
            <span className="cp-matball" aria-hidden="true" />
            <div className="cp-matmeta">
              <span className="cp-matname">M_Cabin_Enamel</span>
              <span className="cp-matshader">CPS/Lit · Deferred</span>
            </div>
            <button className="cp-iconbtn" type="button" aria-label="Browse material for slot 0"><Ic p={IC.chev} s={11} /></button>
          </div>
          {MAPS.map(([n, r, s]) => (
            <div className="cp-texrow" key={n}><span className="cp-texname">{n}</span><span className="cp-texmeta">{r}</span><span className="cp-texmeta dim">{s}</span></div>
          ))}
        </Sec>

        <button className="cp-addcomp" type="button"><Ic p={IC.plus} s={11} sw={2.2} /> Add Component</button>
      </div>
    </section>
  );
}

/* ═══════════════ sequencer ═══════════════ */
const RAIL = 208, PAD = 12;
const F_LABELS = Array.from({ length: LEN / 24 + 1 }, (_, i) => i * 24);
const S_LABELS = Array.from({ length: LEN / FPS + 1 }, (_, i) => i);
const anchor = (f) => (f <= 0 ? "translateX(0)" : f >= LEN ? "translateX(-100%)" : "translateX(-50%)");

const Diamonds = ({ frames, color, hollow, at }) =>
  frames.map((f) => (
    <span key={f} className={"cp-key" + (hollow ? " gp" : "") + (at === f ? " at" : "")}
      style={{ left: pct(f) + "%", ...(color ? { background: color, borderColor: color } : {}) }} />
  ));

function Sequencer({ frame, setFrame, playing, setPlaying }) {
  const laneRef = useRef(null);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const scrub = {
    onPointerDown: (e) => { e.currentTarget.setPointerCapture(e.pointerId); fromEvent(e); },
    onPointerMove: (e) => { if (e.buttons & 1) fromEvent(e); },
    onKeyDown: (e) => {
      const big = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") { e.preventDefault(); setFrame((f) => clamp(f - big, 0, LEN)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setFrame((f) => clamp(f + big, 0, LEN)); }
      else if (e.key === "Home") { e.preventDefault(); setFrame(0); }
      else if (e.key === "End") { e.preventDefault(); setFrame(LEN); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    },
    role: "slider", tabIndex: 0, "aria-valuemin": 0, "aria-valuemax": LEN, "aria-valuenow": frame,
    "aria-valuetext": `frame ${frame} of ${LEN}, ${secs(frame)} seconds`, "aria-label": "sequence scrubber",
  };
  const fromEvent = (e) => {
    const el = laneRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setFrame(clamp(Math.round(((e.clientX - r.left) / r.width) * LEN), 0, LEN));
  };
  const frac = frame / LEN;
  const laneW = `(100% - var(--rail) - ${2 * PAD}px)`;

  return (
    <section className="cp-panel cp-seq" aria-label="Sequencer" style={{ "--rail": RAIL + "px" }}>
      <div className="cp-seqhead">
        <span className="cp-eyebrow">Sequencer</span>
        <span className="cp-chip"><b>SEQ_Dock_Arrival</b> · {LEN} f · {secs(LEN)} s · {FPS} fps</span>
        <span className="cp-chip">{TOTAL_KEYS} keys · {EVENTS.length} ev</span>
        <span className="cp-chip">loop {WORK[0]}–{WORK[1]} · {WORK[1] - WORK[0]} f · {secs(WORK[1] - WORK[0])} s</span>
        <span className="cp-sp" />
        <span className="cp-transport" role="toolbar" aria-label="Transport">
          <button type="button" className="cp-tbtn" aria-label="Go to start" onClick={() => setFrame(0)}><Ic p={IC.toStart} s={12} /></button>
          <button type="button" className="cp-tbtn" aria-label="Previous key" onClick={() => setFrame((f) => {
            const all = TRACKS.flatMap((g) => g.rows.flatMap((r) => r.keys)).filter((k) => k < f).sort((a, b) => a - b);
            return all.length ? all[all.length - 1] : f;
          })}><Ic p={IC.prevKey} s={12} /></button>
          <button type="button" className="cp-tbtn" aria-label="Step back one frame" onClick={() => setFrame((f) => Math.max(0, f - 1))}><Ic p={IC.stepB} s={12} /></button>
          <button type="button" className={"cp-tbtn play" + (playing ? " on" : "")} aria-label={playing ? "Pause" : "Play"} aria-pressed={playing}
            onClick={() => setPlaying((p) => !p)}><Ic p={playing ? IC.pause : IC.play} f={!playing} s={12} /></button>
          <button type="button" className="cp-tbtn" aria-label="Step forward one frame" onClick={() => setFrame((f) => Math.min(LEN, f + 1))}><Ic p={IC.stepF} s={12} /></button>
          <button type="button" className="cp-tbtn" aria-label="Next key" onClick={() => setFrame((f) => {
            const all = TRACKS.flatMap((g) => g.rows.flatMap((r) => r.keys)).filter((k) => k > f).sort((a, b) => a - b);
            return all.length ? all[0] : f;
          })}><Ic p={IC.nextKey} s={12} /></button>
          <button type="button" className="cp-tbtn" aria-label="Go to end" onClick={() => setFrame(LEN)}><Ic p={IC.toEnd} s={12} /></button>
        </span>
        <span className="cp-frbox" aria-label={`current frame ${frame}, ${secs(frame)} seconds`}>
          <span className="cap">Frame</span>
          <span className="big">{frame}</span>
          <span className="col"><span className="s1">{secs(frame)} s</span><span className="s2">of {LEN} f · {secs(LEN)} s</span></span>
        </span>
      </div>

      <div className="cp-seqbody">
        {/* ruler */}
        <div className="cp-seqrow">
          <div className="cp-railcell corner"><span>RIG · CC_Gondola_02 + CAM</span></div>
          <div className="cp-lanecell ruler" {...scrub}>
            <div className="cp-in" ref={laneRef}>
              {F_LABELS.map((f) => (
                <span key={f} className={"cp-lblf" + (f % 48 !== 0 ? " minor" : "")} style={{ left: pct(f) + "%", transform: anchor(f) }}>{f}</span>
              ))}
              {F_LABELS.map((f) => <span key={f} className="cp-tkf" style={{ left: pct(f) + "%" }} />)}
              {S_LABELS.map((s) => (
                <span key={s} className={"cp-lbls" + (s % 2 !== 0 ? " minor" : "")} style={{ left: pct(s * FPS) + "%", transform: anchor(s * FPS) }}>{s === 0 ? "0 s" : s + ""}</span>
              ))}
              <span className="cp-workbar" style={{ left: pct(WORK[0]) + "%", width: pct(WORK[1] - WORK[0]) + "%" }} />
            </div>
          </div>
        </div>
        {/* events */}
        <div className="cp-seqrow">
          <div className="cp-railcell evcap"><span>events · {EVENTS.length}</span></div>
          <div className="cp-lanecell events">
            <div className="cp-in">
              {EVENTS.map((ev) => (
                <span key={ev.f} className="cp-ev" style={{ left: pct(ev.f) + "%" }}>
                  <i /><span>{ev.label} <em>F{ev.f}</em></span>
                </span>
              ))}
            </div>
          </div>
        </div>
        {/* tracks */}
        {TRACKS.map((g) => (
          <div key={g.group} style={{ display: "contents" }}>
            <div className={"cp-seqrow grp" + (g.group === "CC_Gondola_02" ? " selgrp" : "")}>
              <div className="cp-railcell grp"><span className="gname">{g.group}</span><span className="kct">{g.rows.length} track{g.rows.length === 1 ? "" : "s"} · {groupKeys(g)} keys</span></div>
              <div className="cp-lanecell grp"><div className="cp-in"><Diamonds frames={[...new Set(g.rows.flatMap((r) => r.keys))].sort((a, b) => a - b)} hollow /></div></div>
            </div>
            {g.rows.map((r) => (
              <div key={r.id} className="cp-seqrow">
                <div className="cp-railcell trk">
                  {r.axis && <span className="cp-chdot" style={{ background: { x: T.axisX, y: T.axisY, z: T.axisZ }[r.axis] }} />}
                  {!r.axis && <span className="cp-chdot none" />}
                  <span className="tname">{r.id}</span>
                  <span className="kct">{r.keys.length}</span>
                </div>
                <div className="cp-lanecell">
                  <div className="cp-in">
                    <Diamonds frames={r.keys} color={r.axis ? alpha({ x: T.axisX, y: T.axisY, z: T.axisZ }[r.axis], 0.9) : undefined} at={frame} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {/* overlays: work-range dim + one playhead spine */}
        <div className="cp-seqovl" aria-hidden="true">
          <span className="cp-dimpane" style={{ left: `calc(var(--rail) + ${PAD}px)`, width: `calc(${laneW} * ${WORK[0] / LEN})` }} />
          <span className="cp-dimpane" style={{ left: `calc(var(--rail) + ${PAD}px + ${laneW} * ${WORK[1] / LEN})`, width: `calc(${laneW} * ${(LEN - WORK[1]) / LEN})` }} />
          <span className="cp-ph" style={{ left: `calc(var(--rail) + ${PAD}px + ${laneW} * ${frac})` }}>
            <span className="cp-phflag"><b>{frame}</b><span>{secs(frame)} s</span></span>
          </span>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ chrome ═══════════════ */
function MenuBar({ dirty, onSave }) {
  const items = ["File", "Edit", "View", "Actor", "Sequence", "Build", "Help"];
  return (
    <header className="cp-menu">
      <span className="cp-brand"><Mark /><span className="cp-wordmark">CAPSTAN</span><em>1.8.2</em></span>
      <span className="cp-mscene">Sorrel_Midstation</span>
      <nav className="cp-menuitems" aria-label="Main menu">
        {items.map((m) => <button key={m} type="button" className="cp-menuitem">{m}</button>)}
      </nav>
      <span className="cp-projtitle" aria-hidden="true">Thaw.cproj</span>
      <span className="cp-sp" />
      <button type="button" className="cp-searchchip"><Ic p={IC.search} s={11} /> Search<kbd>Ctrl K</kbd></button>
      <button type="button" className="cp-msave" onClick={onSave} aria-label="Save scene">
        <Ic p={IC.save} s={13} />{dirty && <span className="cp-dirtydot m" />}
      </button>
      <span className="cp-winbtns">
        <button type="button" aria-label="Minimize window"><Ic p={IC.minus} s={11} /></button>
        <button type="button" aria-label="Maximize window"><Ic p={IC.square} s={10} /></button>
        <button type="button" className="cl" aria-label="Close window"><Ic p={IC.x} s={11} /></button>
      </span>
    </header>
  );
}

function ToolBar({ tool, setTool, dirty, onSave }) {
  const tools = [
    { id: "select", ic: IC.select, l: "Select", k: "Q", f: true },
    { id: "move", ic: IC.move, l: "Move", k: "W" },
    { id: "rotate", ic: IC.rotate, l: "Rotate", k: "E" },
    { id: "scale", ic: IC.scale, l: "Scale", k: "R" },
  ];
  return (
    <div className="cp-toolbar" role="toolbar" aria-label="Editor toolbar">
      <span className="cp-toolgrp">
        {tools.map((t) => (
          <button key={t.id} type="button" className={"cp-tool" + (tool === t.id ? " on" : "")}
            aria-pressed={tool === t.id} title={`${t.l} (${t.k})`} aria-label={t.l} onClick={() => setTool(t.id)}>
            <Ic p={t.ic} f={t.f} s={15} />
          </button>
        ))}
      </span>
      <span className="cp-tooldiv" />
      <span className="cp-toolgrp">
        <button type="button" className="cp-tool wide" aria-pressed="true">Local <Ic p={IC.chev} s={9} /></button>
        <button type="button" className="cp-tool wide on" aria-pressed="true" title="Grid snap 0.5 m"><Ic p={IC.magnet} s={13} /><span>0.5 m</span></button>
        <button type="button" className="cp-tool wide on" aria-pressed="true" title="Angle snap 10 degrees"><Ic p={IC.angle} s={13} /><span>10°</span></button>
      </span>
      <span className="cp-pie">
        <button type="button" className="cp-piebtn" aria-label="Play in editor"><Ic p={IC.play} f s={13} /><span>Play</span></button>
      </span>
      <span className="cp-sp" />
      <button type="button" className="cp-tool wide cp-layout" aria-label="Editor layout">Layout: Ropeway Polish <Ic p={IC.chev} s={9} /></button>
      <span className="cp-tooldiv" />
      <span className={"cp-savecue" + (dirty ? " on" : "")}>
        {dirty ? <><span className="cp-dirtydot" />Unsaved</> : "All changes saved"}
      </span>
      <button type="button" className="cp-savebtn" disabled={!dirty} onClick={onSave}>Save<kbd>Ctrl S</kbd></button>
    </div>
  );
}

function StatusBar({ frame, ms }) {
  const fps = Math.round(1000 / ms);
  return (
    <footer className="cp-status" aria-label="Editor status">
      <span className="cp-stlog warn" title={MIRROR_LOG.msg}><Ic p={IC.warn} s={11} sw={1.8} />[{MIRROR_LOG.tag}] {MIRROR_LOG.msg}</span>
      <span className="cp-stsel">CC_Gondola_02 · ({fmt3(xAt(frame))}, {fmt3(yAt(frame))}, {fmt3(zAt(frame))})</span>
      <span className="cp-stseg">F {frame} · {secs(frame)} s</span>
      <span className="cp-stseg"><em>{ms.toFixed(1)} ms</em> · {fps} fps</span>
      <span className="cp-stseg">48.2k tris</span>
      <span className="cp-stseg">71 draws</span>
      <span className="cp-stseg">VRAM 1.2 / 6.0 GB</span>
      <span className="cp-stseg dim">VK 1.3</span>
    </footer>
  );
}

/* ═══════════════ root ═══════════════ */
export default function SceneEditor() {
  const [tool, setTool] = useState("move");
  const [dirty, setDirty] = useState(true);
  const [frame, setFrame] = useState(FRAME);
  const [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState("");
  const [selId, setSelId] = useState("gon02");
  const [expanded, setExpanded] = useState({ gameplay: false });
  const [hidden, setHidden] = useState({ pyl08: true });
  const [ms, setMs] = useState(6.1);
  const ui = { selId, setSelId, expanded, setExpanded, hidden, setHidden, filter, setFilter };

  /* the alive element: the frame-time readout breathes (seeded — no Math.random) */
  useEffect(() => {
    const rnd = mulberry32(0xa11ce);
    const id = setInterval(() => setMs(+(5.9 + rnd() * 0.5).toFixed(1)), 900);
    return () => clearInterval(id);
  }, []);
  /* transport playback */
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setFrame((f) => (f + 1 > WORK[1] ? WORK[0] : f + 1)), 1000 / FPS);
    return () => clearInterval(id);
  }, [playing]);

  return (
    <div className="cp-root">
      <style>{CSS}</style>
      <MenuBar dirty={dirty} onSave={() => setDirty(false)} />
      <ToolBar tool={tool} setTool={setTool} dirty={dirty} onSave={() => setDirty(false)} />
      <div className="cp-mid">
        <Outliner ui={ui} />
        <section className="cp-panel cp-viewwrap" aria-label="Scene viewport">
          <div className="cp-tabs" role="tablist">
            <button className="cp-tab on scene" role="tab" aria-selected="true" type="button">
              Sorrel_Midstation{dirty && <span className="cp-dirtydot t" aria-label="Unsaved changes" />}
            </button>
            <button className="cp-tab" role="tab" aria-selected="false" type="button">Game</button>
            <span className="cp-sp" />
            <button className="cp-iconbtn" type="button" aria-label="Maximize viewport"><Ic p={IC.fit} s={11} /></button>
          </div>
          <Viewport frame={frame} />
        </section>
        <Inspector frame={frame} />
      </div>
      <Sequencer frame={frame} setFrame={setFrame} playing={playing} setPlaying={setPlaying} />
      <StatusBar frame={frame} ms={ms} />
    </div>
  );
}

/* ═══════════════ styles ═══════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap');

.cp-root{
  font-family:${T.ui}; font-size:11.5px; color:${T.mut};
  background:${T.bg1}; height:100vh; min-height:640px;
  display:grid; grid-template-rows:32px 40px minmax(0,1fr) 254px 26px; overflow:hidden;
  font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased;
}
.cp-root *{box-sizing:border-box; margin:0}
.cp-root button{font:inherit; color:inherit; background:none; border:none; cursor:pointer}
.cp-root input{font:inherit; color:${T.ink}; background:none; border:none; min-width:0; width:100%}
.cp-root input::placeholder{color:${T.dim}}
.cp-root :focus{outline:none}
.cp-root :focus-visible{outline:2px solid ${T.amber}; outline-offset:-1px; border-radius:4px}
.cp-root ::selection{background:${alpha(T.amber, 0.3)}}
.cp-root ::-webkit-scrollbar{width:8px;height:8px}
.cp-root ::-webkit-scrollbar-thumb{background:${T.line2};border-radius:4px;border:2px solid ${T.panel}}
.cp-root ::-webkit-scrollbar-track{background:transparent}
kbd{font-family:${T.mono};font-size:8.5px;color:${T.dim};border:1px solid ${T.line2};border-radius:3px;padding:1px 4px;background:${T.inset}}
.cp-sp{flex:1}
.cp-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${T.mut}}

/* ── menu bar ── */
.cp-menu{display:flex;align-items:center;gap:2px;background:${T.bg0};border-bottom:1px solid ${T.line};padding:0 8px 0 10px;user-select:none;position:relative}
.cp-brand{display:flex;align-items:center;gap:7px;margin-right:10px}
.cp-wordmark{font-family:${T.mono};font-weight:600;font-size:12px;letter-spacing:0.3em;color:${T.ink}}
.cp-brand em{font-style:normal;font-family:${T.mono};font-size:9px;color:${T.dim}}
.cp-mscene{display:none;font-family:${T.mono};font-size:10px;color:${T.mut}}
.cp-menuitems{display:flex}
.cp-menuitem{padding:0 9px;height:22px;border-radius:4px;color:${T.mut};font-size:11.5px}
.cp-menuitem:hover{background:${T.raised};color:${T.ink}}
.cp-projtitle{position:absolute;left:50%;transform:translateX(-50%);font-family:${T.mono};font-size:9.5px;color:${T.dim}}
.cp-searchchip{display:flex;align-items:center;gap:6px;height:21px;padding:0 8px;border:1px solid ${T.line};border-radius:5px;color:${T.dim};background:${T.panel};font-size:10.5px}
.cp-searchchip:hover{border-color:${T.line2};color:${T.mut}}
.cp-msave{display:none;position:relative;width:28px;height:24px;padding:0;align-items:center;justify-content:center;color:${T.mut}}
.cp-dirtydot{width:7px;height:7px;border-radius:50%;background:${T.amber};display:inline-block}
.cp-dirtydot.m{position:absolute;top:2px;right:2px;width:6px;height:6px}
.cp-dirtydot.t{margin-left:6px;width:6px;height:6px}
.cp-winbtns{display:flex;margin-left:8px}
.cp-winbtns button{width:28px;height:22px;padding:0;display:flex;align-items:center;justify-content:center;color:${T.dim};border-radius:4px}
.cp-winbtns button:hover{background:${T.raised};color:${T.ink}}
.cp-winbtns button.cl:hover{background:${T.err};color:${T.bg0}}

/* ── toolbar ── */
.cp-toolbar{display:flex;align-items:center;gap:8px;background:${T.panel};border-bottom:1px solid ${T.line};padding:0 10px;user-select:none}
.cp-toolgrp{display:flex;align-items:center;gap:2px;background:${T.inset};border:1px solid ${T.line};border-radius:6px;padding:2px}
.cp-tool{width:27px;height:25px;padding:0;display:flex;align-items:center;justify-content:center;gap:5px;border-radius:4px;color:${T.mut}}
.cp-tool:hover{background:${T.raised};color:${T.ink}}
.cp-tool.on{background:${T.raised};color:${T.amber};box-shadow:inset 0 -2px 0 ${T.amber}}
.cp-tool.wide{width:auto;padding:0 8px;font-family:${T.mono};font-size:10px;white-space:nowrap}
.cp-tool.wide.on{color:${T.ink};box-shadow:inset 0 -2px 0 ${T.line2}}
.cp-tool.wide.on svg{color:${T.amber}}
.cp-layout{border:1px solid ${T.line};border-radius:5px;height:25px;color:${T.mut};font-family:${T.ui};font-size:10.5px}
.cp-tooldiv{width:1px;height:18px;background:${T.line}}
.cp-pie{display:flex;margin-left:8px}
.cp-piebtn{display:flex;align-items:center;gap:6px;height:25px;padding:0 12px;border:1px solid ${alpha(T.ok, 0.45)};border-radius:5px;color:${T.ok};font-size:10.5px;font-weight:600}
.cp-piebtn:hover{background:${alpha(T.ok, 0.12)}}
.cp-savecue{display:flex;align-items:center;gap:6px;font-size:10.5px;color:${T.dim}}
.cp-savecue.on{color:${T.amber}}
.cp-savebtn{display:flex;align-items:center;gap:6px;height:25px;padding:0 10px;border-radius:5px;border:1px solid ${alpha(T.amber, 0.45)};color:${T.amber};font-weight:600;font-size:11px;background:${alpha(T.amber, 0.1)}}
.cp-savebtn:hover:not(:disabled){background:${alpha(T.amber, 0.2)}}
.cp-savebtn:disabled{border-color:${T.line};color:${T.dim};background:none;cursor:default}

/* ── panels + tabs ── */
.cp-mid{display:grid;grid-template-columns:238px minmax(0,1fr) 296px;min-height:0;gap:1px;background:${T.line}}
.cp-panel{background:${T.panel};display:flex;flex-direction:column;min-height:0;min-width:0}
.cp-tabs{display:flex;align-items:center;height:28px;background:${T.bg0};border-bottom:1px solid ${T.line};padding-right:4px;flex:none;user-select:none}
.cp-tab{height:28px;padding:0 12px;font-size:11px;color:${T.dim};border-right:1px solid ${T.line};display:flex;align-items:center;white-space:nowrap}
.cp-tab:hover{color:${T.mut}}
.cp-tab.on{background:${T.panel};color:${T.ink};box-shadow:inset 0 2px 0 ${T.line2}}
.cp-tab.on.scene{font-family:${T.mono};font-size:10.5px}
.cp-iconbtn{width:24px;height:22px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;color:${T.dim}}
.cp-iconbtn:hover{background:${T.raised};color:${T.ink}}

/* ── outliner ── */
.cp-search{display:flex;align-items:center;gap:6px;margin:8px 8px 4px;height:25px;padding:0 8px;background:${T.inset};border:1px solid ${T.line};border-radius:5px;flex:none}
.cp-search input{font-size:11px}
.cp-tree{overflow-y:auto;overflow-x:hidden;flex:1;padding:2px 4px}
.cp-row{display:flex;align-items:center;gap:5px;height:22px;border-radius:4px;padding-right:4px;cursor:default;position:relative;color:${T.mut}}
.cp-row:hover{background:${T.raised}}
.cp-row.sel{background:${alpha(T.amber, 0.13)};color:${T.ink}}
.cp-row.sel::before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:2.5px;border-radius:2px;background:${T.amber}}
.cp-row.hid .cp-rowname,.cp-row.hid .cp-badge{opacity:0.4}
.cp-caret{width:14px;height:14px;padding:0;display:flex;align-items:center;justify-content:center;color:${T.dim};flex:none;transition:transform 0.12s}
.cp-caret.open{transform:rotate(90deg)}
.cp-caretsp{width:14px;flex:none}
.cp-badge{width:15px;height:15px;border:1px solid;border-radius:3px;font-family:${T.mono};font-size:8px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:none;background:${T.inset}}
.cp-badge.lg{width:21px;height:21px;font-size:10px}
.cp-rowname{font-family:${T.mono};font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-rowcount{font-family:${T.mono};font-size:8.5px;color:${T.dim};background:${T.inset};border:1px solid ${T.line};border-radius:7px;padding:0 6px;line-height:13px}
.cp-mini{width:20px;height:20px;padding:0;margin-left:auto;display:flex;align-items:center;justify-content:center;border-radius:4px;color:${T.dim};opacity:0;flex:none}
.cp-row:hover .cp-mini,.cp-mini.off,.cp-mini:focus-visible{opacity:1}
.cp-mini:hover{background:${T.line};color:${T.ink}}
.cp-panelfoot{flex:none;display:flex;justify-content:space-between;align-items:center;height:23px;padding:0 10px;border-top:1px solid ${T.line};font-family:${T.mono};font-size:9.5px;color:${T.mut}}
.cp-panelfoot .dim{color:${T.dim}}

/* ── viewport ── */
.cp-viewwrap{background:${T.bg0}}
.cp-view{position:relative;flex:1;min-height:0;overflow:hidden}
.cp-viewsvg{position:absolute;inset:0;width:100%;height:100%;display:block}
.cp-ovl{position:absolute;z-index:2;display:flex;gap:6px;align-items:center}
.cp-ovl-tl{top:10px;left:10px}
.cp-ovl-tr{top:8px;right:10px}
.cp-ovl-bl{bottom:10px;left:10px}
.cp-ovl-tc{top:10px;left:50%;transform:translateX(-50%)}
.cp-chipd{display:flex;align-items:center;gap:5px;height:23px;padding:0 9px;border-radius:5px;background:${alpha(T.bg0, 0.78)};border:1px solid ${alpha(T.ink, 0.14)};color:${T.ink};font-size:10.5px}
.cp-chipd:hover{border-color:${alpha(T.ink, 0.3)}}
.cp-chipd.cp-chipd-ic{width:23px;padding:0;justify-content:center}
.cp-fov{font-family:${T.mono};font-size:9.5px;color:${T.ink};background:${alpha(T.bg0, 0.66)};border-radius:4px;padding:3px 7px}
.cp-seqpill{display:flex;align-items:center;gap:6px;font-family:${T.mono};font-size:9.5px;color:${T.amber};background:${alpha(T.bg0, 0.8)};border:1px solid ${alpha(T.amber, 0.45)};border-radius:5px;padding:4px 9px;white-space:nowrap}

/* ── inspector ── */
.cp-inspscroll{overflow-y:auto;flex:1;padding-bottom:10px}
.cp-ihead{padding:10px 12px 8px;border-bottom:1px solid ${T.line}}
.cp-iheadtop{display:flex;align-items:center;gap:8px}
.cp-iname{font-family:${T.mono};font-size:12px;font-weight:600;color:${T.ink};background:${T.inset};border:1px solid ${T.line};border-radius:4px;height:25px;padding:0 8px;flex:1}
.cp-iname:hover{border-color:${T.line2}}
.cp-icrumb{font-size:9.5px;color:${T.dim};margin:7px 0 0 2px;font-family:${T.mono}}
.cp-iheadchips{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
.cp-kv{font-size:10.5px;color:${T.dim}}
.cp-kv b{color:${T.mut};font-weight:600}
.cp-sec{border-bottom:1px solid ${T.line}}
.cp-sechead{display:flex;align-items:center;gap:6px;height:28px;padding:0 10px;user-select:none}
.cp-sechead:hover{background:${T.raised}}
.cp-sectitle{font-size:9.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${T.mut}}
.cp-secmeta{font-family:${T.mono};font-size:9px;color:${T.dim}}
.cp-secbody{padding:2px 12px 10px}
.cp-irow{display:flex;align-items:center;gap:6px;min-height:25px;margin-top:2px}
.cp-ilabel{width:56px;flex:none;font-size:10.5px;color:${T.dim}}
.cp-ifields{display:flex;align-items:center;gap:5px;flex:1;min-width:0}
.cp-num{display:flex;align-items:center;flex:1;min-width:0;height:23px;background:${T.inset};border:1px solid ${T.line};border-radius:4px;overflow:hidden}
.cp-num:hover{border-color:${T.line2}}
.cp-num:focus-within{border-color:${T.amber}}
.cp-num input{font-family:${T.mono};font-size:10.5px;text-align:right;padding:0 6px 0 4px;height:100%}
.cp-num::before{content:"";width:3px;height:100%;flex:none}
.cp-num.ax-x::before{background:${T.axisX}}
.cp-num.ax-y::before{background:${T.axisY}}
.cp-num.ax-z::before{background:${T.axisZ}}
.cp-num.driven{border-style:dashed}
.cp-num.driven input{color:${T.mut}}
.cp-driventag{font-family:${T.mono};font-size:9px;color:${T.amber};border:1px solid ${alpha(T.amber, 0.4)};border-radius:3px;padding:1px 6px}
.cp-drivennote{font-size:10px;line-height:1.5;color:${T.dim};padding:5px 0 3px 2px}
.cp-chk{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:${T.mut};height:21px;border-radius:4px;padding:0 2px}
.cp-chk:hover{color:${T.ink}}
.cp-chkbox{width:13px;height:13px;border:1px solid ${T.line2};border-radius:3px;background:${T.inset};display:inline-flex;align-items:center;justify-content:center;color:${T.bg0}}
.cp-chk.on .cp-chkbox{background:${T.amber};border-color:${T.amber}}
.cp-slot{display:flex;align-items:center;gap:6px;flex:1;min-width:0;height:23px;padding:0 8px;background:${T.inset};border:1px solid ${T.line};border-radius:4px}
.cp-slot:hover{border-color:${T.line2}}
.cp-slottext{font-family:${T.mono};font-size:10px;color:${T.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.cp-meshinfo{font-family:${T.mono};font-size:9.5px;color:${T.mut};padding:6px 0 2px 2px}
.cp-matcard{display:flex;align-items:center;gap:9px;background:${T.inset};border:1px solid ${T.line};border-radius:5px;padding:7px 8px;margin-top:4px}
.cp-matball{width:28px;height:28px;border-radius:50%;flex:none;background:radial-gradient(circle at 34% 28%, ${T.scene.glass} 0%, ${T.scene.cabin} 40%, ${T.scene.cabinDark} 74%, ${T.scene.cabinRoof} 100%)}
.cp-matmeta{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.cp-matname{font-family:${T.mono};font-size:10.5px;font-weight:600;color:${T.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-matshader{font-size:9.5px;color:${T.dim}}
.cp-texrow{display:flex;align-items:center;gap:8px;height:21px;padding:0 2px;font-family:${T.mono};font-size:9.5px}
.cp-texname{color:${T.mut};flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-texmeta{color:${T.dim};flex:none}
.cp-texmeta.dim{width:48px;text-align:right}
.cp-bindrow{display:flex;align-items:center;gap:7px;padding:4px 0 6px}
.cp-bindname{font-family:${T.mono};font-size:10.5px;font-weight:600;color:${T.ink}}
.cp-bindmeta{font-family:${T.mono};font-size:9px;color:${T.dim};margin-left:auto}
.cp-bindtracks{border:1px solid ${T.line};border-radius:5px;background:${T.inset};padding:2px 0}
.cp-bindtrack{display:flex;align-items:center;gap:7px;height:20px;padding:0 9px;font-family:${T.mono};font-size:9.5px;color:${T.mut}}
.cp-bindid{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-bindkeys{color:${T.dim}}
.cp-chdot{width:7px;height:7px;border-radius:2px;flex:none}
.cp-chdot.none{background:${T.line2}}
.cp-addcomp{display:flex;align-items:center;justify-content:center;gap:6px;height:27px;margin:12px 12px 4px;width:calc(100% - 24px);border:1px dashed ${T.line2};border-radius:5px;color:${T.dim};font-size:11px}
.cp-addcomp:hover{color:${T.ink};border-color:${T.dim};background:${T.raised}}

/* ── sequencer ── */
.cp-seq{border-top:1px solid ${T.line}}
.cp-seqhead{display:flex;align-items:center;gap:8px;height:34px;padding:0 10px;background:${T.bg0};border-bottom:1px solid ${T.line};flex:none}
.cp-chip{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border:1px solid ${T.line2};border-radius:10px;font-family:${T.mono};font-size:9.5px;color:${T.mut};white-space:nowrap}
.cp-chip b{color:${T.ink};font-weight:600}
.cp-transport{display:flex;gap:2px;background:${T.inset};border:1px solid ${T.line};border-radius:6px;padding:2px}
.cp-tbtn{width:26px;height:22px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:4px;color:${T.mut}}
.cp-tbtn:hover{background:${T.raised};color:${T.ink}}
.cp-tbtn.play{color:${T.ok}}
.cp-tbtn.play.on{background:${alpha(T.ok, 0.15)}}
.cp-frbox{display:flex;align-items:center;gap:9px;height:27px;padding:0 10px;border:1px solid ${T.line2};border-radius:6px;background:${T.inset}}
.cp-frbox .cap{font-size:7.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${T.dim}}
.cp-frbox .big{font-family:${T.mono};font-size:17px;font-weight:600;line-height:1;color:${T.ink};min-width:30px;text-align:right}
.cp-frbox .col{display:flex;flex-direction:column;gap:1px;font-family:${T.mono}}
.cp-frbox .s1{font-size:10px;color:${T.amber};font-weight:600}
.cp-frbox .s2{font-size:8px;color:${T.dim}}
.cp-seqbody{flex:1;min-height:0;position:relative;overflow-y:auto;background:${T.panel}}
.cp-seqrow{display:grid;grid-template-columns:var(--rail) minmax(0,1fr);border-bottom:1px solid ${alpha(T.line, 0.55)}}
.cp-seqrow.grp{background:${alpha(T.ink, 0.025)}}
.cp-seqrow.selgrp{background:${alpha(T.amber, 0.05)};box-shadow:inset 2px 0 0 ${T.amber}}
.cp-railcell{display:flex;align-items:center;gap:6px;height:19px;padding:0 8px;border-right:1px solid ${T.line};font-family:${T.mono};overflow:hidden}
.cp-railcell.corner{height:30px;font-size:8.5px;letter-spacing:0.1em;color:${T.dim};text-transform:uppercase;font-weight:600}
.cp-railcell.evcap{height:17px;font-size:8.5px;color:${T.dim}}
.cp-railcell.grp{height:21px}
.cp-railcell .gname{font-family:${T.ui};font-size:9.5px;font-weight:700;letter-spacing:0.07em;color:${T.ink};text-transform:uppercase;white-space:nowrap}
.cp-railcell .tname{font-size:10px;color:${T.mut};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-railcell .kct{font-size:8.5px;color:${T.dim};margin-left:auto;white-space:nowrap}
.cp-lanecell{position:relative;height:19px}
.cp-lanecell.ruler{height:30px;background:${T.bg0};cursor:ew-resize;touch-action:none;user-select:none}
.cp-lanecell.events{height:17px;background:${alpha(T.bg0, 0.5)}}
.cp-lanecell.grp{height:21px}
.cp-in{position:absolute;top:0;bottom:0;left:${PAD}px;right:${PAD}px}
.cp-tkf{position:absolute;bottom:0;width:1px;height:7px;background:${T.line2}}
.cp-lblf{position:absolute;top:2px;font-family:${T.mono};font-size:9px;color:${T.mut}}
.cp-lbls{position:absolute;bottom:8px;font-family:${T.mono};font-size:8px;color:${T.dim}}
.cp-lbls.minor{color:${alpha(T.dim, 0.75)}}
.cp-workbar{position:absolute;bottom:0;height:2.5px;background:${T.amber};opacity:0.85}
.cp-ev{position:absolute;top:0;bottom:0;width:1px;background:${alpha(T.mut, 0.4)}}
.cp-ev i{position:absolute;top:3px;left:0;border-left:6px solid ${T.mut};border-top:4px solid transparent;border-bottom:4px solid transparent}
.cp-ev>span{position:absolute;top:2px;left:9px;font-family:${T.mono};font-size:8.5px;color:${T.mut};white-space:nowrap}
.cp-ev em{font-style:normal;color:${T.dim}}
.cp-key{position:absolute;top:50%;width:7px;height:7px;transform:translate(-50%,-50%) rotate(45deg);background:${T.mut};border:1px solid ${T.mut};border-radius:1px}
.cp-key.gp{width:5px;height:5px;background:transparent;border-color:${T.dim}}
.cp-key.at{width:9px;height:9px;background:${T.amber};border-color:${T.amber};box-shadow:0 0 0 2px ${alpha(T.amber, 0.3)};z-index:2}
.cp-seqovl{position:absolute;inset:0;pointer-events:none;z-index:3}
.cp-dimpane{position:absolute;top:30px;bottom:0;background:${alpha(T.bg0, 0.4)}}
.cp-ph{position:absolute;top:0;bottom:0;width:1.5px;margin-left:-0.75px;background:${T.ink}}
.cp-phflag{position:absolute;top:1px;left:50%;transform:translateX(-50%);background:${T.amber};color:${T.bg0};border-radius:3px;padding:1px 6px 2px;text-align:center;font-family:${T.mono};line-height:1.15;white-space:nowrap}
.cp-phflag b{display:block;font-size:11px;font-weight:700}
.cp-phflag span{display:block;font-size:7.5px;font-weight:600;opacity:0.85}

/* ── status bar ── */
.cp-status{display:flex;align-items:center;background:${T.bg0};border-top:1px solid ${T.line};padding:0 10px;font-family:${T.mono};font-size:9.5px;color:${T.mut};user-select:none}
.cp-stlog{display:flex;align-items:center;gap:6px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-stlog.warn{color:${T.warn}}
.cp-stsel{color:${T.amber};padding:0 11px;border-left:1px solid ${T.line};white-space:nowrap}
.cp-stseg{padding:0 11px;border-left:1px solid ${T.line};white-space:nowrap}
.cp-stseg em{font-style:normal;color:${T.ink};font-weight:600}
.cp-stseg.dim{color:${T.dim}}

/* ── reduced motion ── */
@media (prefers-reduced-motion: reduce){
  .cp-root *{animation-duration:0.001s !important;animation-iteration-count:1 !important;transition:none !important}
}

/* ── 375px: the review deck — viewport, scrub, tree, inspect ── */
@media (max-width:760px){
  .cp-root{height:auto;min-height:100vh;display:flex;flex-direction:column;overflow:visible}
  .cp-menuitems,.cp-projtitle,.cp-searchchip,.cp-winbtns{display:none}
  .cp-mscene{display:inline}
  .cp-menu{order:0;height:38px;flex:none}
  .cp-msave{display:inline-flex;margin-left:auto}
  .cp-toolbar{order:1;height:42px;flex:none;overflow-x:auto;scrollbar-width:none}
  .cp-toolbar::-webkit-scrollbar{display:none}
  .cp-savecue{display:none}
  .cp-savebtn kbd{display:none}
  .cp-layout{display:none}
  /* the review deck: viewport → scrub → tree → inspect → status */
  .cp-mid{display:contents}
  .cp-viewwrap{order:2}
  .cp-seq{order:3;--rail:104px}
  .cp-outliner{order:4;border-top:1px solid ${T.line}}
  .cp-insp{order:5;border-top:1px solid ${T.line}}
  .cp-status{order:6}
  .cp-view{height:238px;flex:none}
  .cp-ovl-tl{display:none}
  .cp-seqpill{font-size:8.5px;padding:3px 7px}
  .cp-tree{max-height:none;overflow:visible}
  .cp-inspscroll{overflow:visible}
  .cp-seqhead{flex-wrap:wrap;height:auto;padding:8px 10px;gap:6px}
  .cp-seqbody{overflow:visible}
  .cp-lblf.minor,.cp-lbls.minor{display:none}
  .cp-railcell .kct{display:none}
  .cp-railcell.corner span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cp-ev>span{display:none}
  .cp-status{height:auto;flex-wrap:wrap;padding:6px 10px;gap:4px 0}
  .cp-stlog{flex-basis:100%;order:5;border-top:1px solid ${T.line};padding-top:5px;margin-top:2px}
  .cp-stsel{border-left:none;padding-left:0}
}
`;
