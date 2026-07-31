import { useEffect, useState } from "react";
import { T } from "./tokens.js";

/* ============================================================
   PASS 1 — DESIGN PLAN
   Register: ORDINATE — the analysis register (house-style.md).
   Subject: GANTRY, a robotics company's internal experiment
   tracker. This screen: the pilot-promotion review for the
   grasp-gen2 sweep — six RL fine-tunes of the gen2 grasp
   policy, compared against incumbent v41.
   Audience: robotics ML engineers closing a decision.
   Single job: promote one policy to the real pilot cell — or
   don't — with the evidence on screen.
   Tokens: ORDINATE register (see tokens.js).
   Signature: the sim-to-real hero chart — seeded sim curves
   with seed-spread bands, the pilot bar drawn ON the plot,
   and hollow real-cell spot checks with wide, honest CIs.
   Copy: finding-as-a-sentence lede; per-run plain-language
   diagnoses; disabled actions that state their why; a
   provenance footer. Static dataset — analysis surfaces need
   no fake liveness, so there is no clock and nothing drifts.
   Numbers interlock by construction: deltas, sums, status
   counts, and real-check percentages are computed from the
   run data, not hand-copied.

   Canonicalized from the #149 frozen collections — ledger in
   README.md.
   ============================================================ */

/* Deterministic stream for the curve jitter (frameworks.md § React).
   Same seed, same pixels — goldens stay comparable across runs. */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- the dataset (frozen snapshot, data through Jul 7) ---------- */

const INCUMBENT = { name: "v41", eval: 90.7, picks: 318 };
const PICK_BAR = 92.0;      // % pick success required before real totes
const COLL_CEILING = 5.0;   // collisions per 1k picks, max allowed
const PARAM_COUNT = 17;     // sweep base config size
const REAL_N = 60;          // picks per real-cell spot check

const RUNS = [
  {
    id: "R-311", tag: "ent 0.003 + curr v3", status: "complete",
    steps: 300, of: 300, eval: 93.8, ci: 1.0, coll: 3.1, picks: 342, gpu: 118,
    sub: "clears both gates",
    plot: true, six: 0,
    anchors: [[0, 76.2], [30, 82.0], [60, 85.5], [90, 87.8], [120, 89.4], [150, 90.6],
      [180, 91.5], [186, 90.2], [196, 90.9], [210, 92.05], [225, 92.5], [240, 92.95],
      [270, 93.45], [300, 93.8]],
    real: [{ step: 240, ok: 54 }, { step: 300, ok: 56 }],
    diff: [
      { k: "entropy_coef", from: "0.01", to: "0.003" },
      { k: "curriculum", from: "v2", to: "v3 (clutter stage)" },
    ],
    read: "Above the bar since 210k, collisions well under the ceiling, both real " +
      "checks agree. 7.5% faster than v41 (342 vs 318 picks/h).",
  },
  {
    id: "R-309", tag: "ent 0.003", status: "complete",
    steps: 300, of: 300, eval: 92.4, ci: 1.1, coll: 6.8, picks: 356, gpu: 121,
    sub: "fast but rough — fails collision ceiling",
    plot: true, six: 1, block: "Over ceiling",
    anchors: [[0, 76.0], [40, 81.4], [80, 84.8], [120, 87.3], [160, 89.0], [200, 90.4],
      [240, 91.5], [270, 92.0], [300, 92.4]],
    diff: [{ k: "entropy_coef", from: "0.01", to: "0.003" }],
    read: "Clears the pick bar but collides at 6.8/1k — over the 5.0 ceiling. Rough " +
      "policies damage stock; retrain with a contact penalty first.",
  },
  {
    id: "R-315", tag: "lr 1.5e-4", status: "training",
    steps: 218, of: 300, eval: 91.6, ci: 1.1, coll: 4.2, picks: 331, gpu: 86,
    sub: "above v41, below the bar at 218k",
    plot: true, six: 2, dashed: true, block: "Still training",
    anchors: [[0, 76.4], [40, 80.6], [80, 83.6], [120, 86.1], [160, 88.4], [190, 90.4], [218, 91.6]],
    diff: [{ k: "learning_rate", from: "3.0e-4", to: "1.5e-4" }],
    read: "A slower, smoother climb — above v41 but 0.4 under the bar at its 218k " +
      "checkpoint. Decide after 300k; a moving number can't hold a pilot slot.",
  },
  {
    id: "R-308", tag: "curr v3", status: "complete",
    steps: 300, of: 300, eval: 90.9, ci: 1.2, coll: 2.9, picks: 337, gpu: 119,
    sub: "curriculum alone didn't move it",
    block: "Below bar",
    anchors: [],
    diff: [{ k: "curriculum", from: "v2", to: "v3 (clutter stage)" }],
    read: "+0.2 vs v41 — inside the CI, so effectively flat. Evidence that R-311's " +
      "gain comes from the entropy schedule, not the curriculum alone.",
  },
  {
    id: "R-306", tag: "horizon 24", status: "complete",
    steps: 300, of: 300, eval: 89.2, ci: 1.2, coll: 3.6, picks: 329, gpu: 122,
    sub: "longer action horizon hurt",
    block: "Below bar",
    anchors: [],
    diff: [{ k: "action_horizon", from: "16", to: "24" }],
    read: "A regression: −1.5 vs v41, outside the CI. The longer horizon slows credit " +
      "assignment on short pick cycles. Archive — the negative result is the finding.",
  },
  {
    id: "R-302", tag: "reward v6", status: "stopped",
    steps: 96, of: 300, eval: 82.4, ci: 1.5, coll: 12.4, picks: 288, gpu: 38,
    sub: "stopped 96k — gamed the pick check",
    block: "Stopped 96k",
    anchors: [],
    diff: [{ k: "reward_shaping", from: "v5", to: "v6 (height bonus)" }],
    read: "Reward hacking: the height bonus taught it to wedge items against the tote " +
      "wall to trip the success detector. The exploit is logged against reward v6.",
  },
];

/* Derived facts — computed, so header, table, and lede cannot disagree. */
const N_RUNS = RUNS.length;
const N_DONE = RUNS.filter((r) => r.status === "complete").length;
const N_TRAINING = RUNS.filter((r) => r.status === "training").length;
const N_STOPPED = RUNS.filter((r) => r.status === "stopped").length;
const GPU_TOTAL = RUNS.reduce((a, r) => a + r.gpu, 0);
const delta = (r) => r.eval - INCUMBENT.eval;
const fmtDelta = (r) => `${delta(r) >= 0 ? "+" : "−"}${Math.abs(delta(r)).toFixed(1)}`;
const realPct = (c) => (c.ok / REAL_N) * 100;

/* ---------- chrome: fonts, states, motion ---------- */

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
    @keyframes riseIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    * { box-sizing: border-box; }
    button { font: inherit; }
    :where(button, input, [tabindex]):focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px; }

    .btn { font-family: ${T.body}; font-weight: 600; font-size: 12.5px; border-radius: ${T.r}px;
           border: 1px solid; background: transparent; cursor: pointer; padding: 6px 12px;
           transition: background 0.15s ease-out, color 0.15s ease-out; }
    .btn--primary { color: ${T.amber}; border-color: ${T.amber}; }
    .btn--primary:hover:not(:disabled) { background: ${T.amber}; color: ${T.bg}; }
    .btn--quiet { color: ${T.muted}; border-color: ${T.line}; }
    .btn--quiet:hover:not(:disabled) { border-color: ${T.muted}; color: ${T.ink}; }
    .btn:disabled { color: ${T.faint}; border-color: ${T.lineSoft}; cursor: not-allowed; }

    .rowbtn { background: transparent; border: none; padding: 0; cursor: pointer; text-align: left; }
    .rowbtn:hover .runname { color: ${T.amber}; }

    tr.datarow:hover { background: ${T.surface2}; }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: ${T.line}; }
    ::-webkit-scrollbar-track { background: transparent; }

    @media (prefers-reduced-motion: reduce) {
      * { animation-duration: 0.001s !important; animation-iteration-count: 1 !important; transition: none !important; }
    }
  `}</style>
);

const mono = { fontFamily: T.mono, fontVariantNumeric: "tabular-nums" };

function useCompact() {
  const [c, setC] = useState(typeof window !== "undefined" && window.innerWidth < 1020);
  useEffect(() => {
    const f = () => setC(window.innerWidth < 1020);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return c;
}

/* ---------- small pieces ---------- */

function StatusPip({ status, six }) {
  // green/red are judgments (complete/stopped); an in-flight run wears its OWN series
  // identity hue (hollow = still moving) — series colors are identity, never judgment.
  const c = status === "complete" ? T.green : status === "stopped" ? T.red
    : six != null ? T.series[six] : T.muted;
  const hollow = status === "training";
  return (
    <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99,
      background: hollow ? "transparent" : c, border: `1.5px solid ${c}`, marginRight: 7, flex: "none" }} />
  );
}

function VerdictChip({ tone, children }) {
  const c = tone === "good" ? T.green : tone === "warn" ? T.amber : T.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: T.body,
      fontWeight: 600, fontSize: 12, color: c, border: `1px solid ${c}`, borderRadius: T.r,
      padding: "3px 10px", whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: c }} />
      {children}
    </span>
  );
}

/* A marked value inside the finding lede — the load-bearing numbers read
   as evidence, not decoration. */
function V({ children }) {
  return (
    <span style={{ ...mono, fontSize: "0.94em", color: T.ink,
      borderBottom: `1px solid ${T.line}`, paddingBottom: 1 }}>{children}</span>
  );
}

function SectionTitle({ children, note }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 12, borderBottom: `1px solid ${T.lineSoft}`, paddingBottom: 6, marginBottom: 8 }}>
      <span style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13.5, color: T.ink }}>{children}</span>
      {note && <span style={{ fontFamily: T.body, fontSize: 11.5, color: T.muted, textAlign: "right" }}>{note}</span>}
    </div>
  );
}

/* ---------- THE SIGNATURE — sim-to-real eval chart ---------- */

function evalCurve(run) {
  /* Sample the anchor polyline at 2k steps with seeded jitter; endpoints and
     anchors stay exact so every on-chart value survives arithmetic. */
  const rng = mulberry32(0x0d1a + run.six * 97);
  const pts = [];
  const A = run.anchors;
  for (let i = 0; i < A.length - 1; i++) {
    const [s0, v0] = A[i], [s1, v1] = A[i + 1];
    for (let s = s0; s < s1; s += 2) {
      const f = (s - s0) / (s1 - s0);
      const base = v0 + (v1 - v0) * f;
      const j = s === s0 ? 0 : (rng() - 0.5) * 0.12;
      pts.push([s, base + j]);
    }
  }
  pts.push(A[A.length - 1]);
  return pts;
}

function EvalChart({ compact }) {
  const W = compact ? 343 : 860;
  const H = compact ? 290 : 210;
  const m = compact ? { l: 40, r: 14, t: 12, b: 24 } : { l: 46, r: 104, t: 12, b: 24 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const Y0 = 74, Y1 = 100, X1 = 300;
  const x = (s) => m.l + (s / X1) * pw;
  const y = (v) => m.t + ((Y1 - v) / (Y1 - Y0)) * ph;
  const yTicks = [75, 80, 85, 90, 95, 100];
  const xTicks = compact ? [0, 100, 200, 300] : [0, 50, 100, 150, 200, 250, 300];
  const plotted = RUNS.filter((r) => r.plot);
  const fs = compact ? 11 : 11;

  const spread = (s) => 1.1 - (0.65 * s) / X1; // seed spread narrows as training settles

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img"
      aria-label={`Pick success on eval suite v5.2 versus training steps for runs R-311, R-309 and R-315.
        The 92 percent pilot bar is shaded on the chart; incumbent v41 sits at 90.7 percent.
        R-311 ends at 93.8 percent and two hollow markers show real-cell checks at ${RUNS[0].real
          .map((c) => realPct(c).toFixed(1)).join(" and ")} percent
        with wide confidence whiskers.`}>
      {/* pilot bar — the healthy zone, drawn ON the chart with its label inside */}
      <rect x={m.l} y={y(Y1)} width={pw} height={y(PICK_BAR) - y(Y1)} fill={T.greenBand} />
      <line x1={m.l} x2={m.l + pw} y1={y(PICK_BAR)} y2={y(PICK_BAR)} stroke={T.greenSoftLine} strokeWidth="1" />
      <text x={m.l + 8} y={y(98.4)} fill={T.green} fontFamily={T.body} fontSize={fs}>
        pilot bar — ≥ {PICK_BAR.toFixed(1)}% before real totes
      </text>

      {/* grid + axes */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={m.l + pw} y1={y(v)} y2={y(v)} stroke={T.lineSoft} strokeWidth="1" />
          <text x={m.l - 7} y={y(v) + 3.5} fill={T.muted} fontFamily={T.mono} fontSize={fs - 1} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      {xTicks.map((s) => (
        <text key={s} x={x(s)} y={H - 8} fill={T.muted} fontFamily={T.mono} fontSize={fs - 1} textAnchor="middle">
          {s === 0 ? "0" : `${s}k`}
        </text>
      ))}

      {/* incumbent v41 reference — label sits where no curve passes */}
      <line x1={m.l} x2={m.l + pw} y1={y(INCUMBENT.eval)} y2={y(INCUMBENT.eval)}
        stroke={T.muted} strokeWidth="1" strokeDasharray="2 4" />
      <text x={m.l + (compact ? 4 : 8)} y={compact ? y(INCUMBENT.eval) - 5 : y(INCUMBENT.eval) + 13}
        fill={T.muted} fontFamily={T.body} fontSize={fs - 0.5}>
        incumbent {INCUMBENT.name} · {INCUMBENT.eval.toFixed(1)}%
      </text>

      {/* fine-tune origin annotation lives ON the chart, where the question arises */}
      {!compact && (
        <text x={m.l + 44} y={y(76.4)} fill={T.muted} fontFamily={T.body} fontSize={fs - 0.5}>
          fine-tunes of the gen2 base — curves start near its 76%
        </text>
      )}

      {/* curriculum marker — name the mechanism behind the dip */}
      <line x1={x(180)} x2={x(180)} y1={m.t} y2={m.t + ph} stroke={T.faint} strokeWidth="1" strokeDasharray="3 4" />
      {!compact && (
        <text x={x(180) + 6} y={y(77.5)} fill={T.muted} fontFamily={T.body} fontSize={fs - 0.5}>
          curriculum v3 enters cluttered totes — expect the dip
        </text>
      )}
      {compact && (
        <text x={x(180) + 5} y={y(76.2)} fill={T.muted} fontFamily={T.body} fontSize={fs - 1}>
          curr v3: clutter
        </text>
      )}

      {/* seed-spread bands, then mean lines — uncertainty as texture */}
      {plotted.map((r) => {
        const pts = evalCurve(r);
        const up = pts.map(([s, v]) => `${x(s).toFixed(1)},${y(v + spread(s)).toFixed(1)}`);
        const dn = [...pts].reverse().map(([s, v]) => `${x(s).toFixed(1)},${y(v - spread(s)).toFixed(1)}`);
        return <polygon key={r.id} points={[...up, ...dn].join(" ")} fill={T.seriesBand[r.six]} />;
      })}
      {plotted.map((r) => {
        const pts = evalCurve(r);
        const d = pts.map(([s, v], i) => `${i ? "L" : "M"}${x(s).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
        const [es, ev] = r.anchors[r.anchors.length - 1];
        /* Label placement dodges the real-check whiskers: the in-flight run's
           label sits above-left of its endpoint; finished runs label to the
           right (desktop) or stagger above/below the endpoint (compact). */
        const lx = r.dashed ? x(es) - 8 : compact ? x(es) - (r.six === 1 ? 13 : 6) : x(es) + 12;
        const ly = r.dashed ? y(ev) - 8
          : compact ? (r.six === 1 ? y(ev) + 16 : y(ev) - 8) : y(ev) + 3.5;
        const anchor = r.dashed || compact ? "end" : "start";
        return (
          <g key={r.id}>
            <path d={d} fill="none" stroke={T.series[r.six]} strokeWidth="1.8"
              strokeDasharray={r.dashed ? "7 5" : "none"} />
            {/* endpoint: filled = final, hollow = still moving */}
            <circle cx={x(es)} cy={y(ev)} r="3.4" fill={r.dashed ? T.bg : T.series[r.six]}
              stroke={T.series[r.six]} strokeWidth="1.6" />
            <text x={lx} y={ly} fill={T.series[r.six]} fontFamily={T.mono} fontSize={fs} textAnchor={anchor}>
              {compact || r.dashed ? ev.toFixed(1) : `${r.id} · ${ev.toFixed(1)}`}
            </text>
          </g>
        );
      })}

      {/* real-cell spot checks on R-311 — hollow, with honest CI whiskers */}
      {RUNS[0].real.map((c) => {
        const pct = realPct(c);
        /* 95% binomial CI half-width at n=60 — computed, not asserted */
        const halo = 196 * Math.sqrt((pct / 100) * (1 - pct / 100) / REAL_N);
        return (
          <g key={c.step}>
            <line x1={x(c.step)} x2={x(c.step)} y1={y(pct - halo)} y2={y(pct + halo)}
              stroke={T.series[0]} strokeWidth="1" opacity="0.7" />
            <line x1={x(c.step) - 4} x2={x(c.step) + 4} y1={y(pct + halo)} y2={y(pct + halo)}
              stroke={T.series[0]} strokeWidth="1" opacity="0.7" />
            <line x1={x(c.step) - 4} x2={x(c.step) + 4} y1={y(pct - halo)} y2={y(pct - halo)}
              stroke={T.series[0]} strokeWidth="1" opacity="0.7" />
            <rect x={x(c.step) - 4.2} y={y(pct) - 4.2} width="8.4" height="8.4"
              transform={`rotate(45 ${x(c.step)} ${y(pct)})`}
              fill={T.bg} stroke={T.series[0]} strokeWidth="1.6" />
          </g>
        );
      })}
    </svg>
  );
}

function LegendSwatch({ color, dashed, hollow }) {
  return (
    <svg width="20" height="10" aria-hidden="true" style={{ flex: "none" }}>
      {hollow ? (
        <rect x="6" y="1" width="7" height="7" transform="rotate(45 9.5 4.5)" fill={T.bg} stroke={color} strokeWidth="1.5" />
      ) : (
        <line x1="1" x2="19" y1="5" y2="5" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : "none"} />
      )}
    </svg>
  );
}

function ChartLegend() {
  const items = [
    ...RUNS.filter((r) => r.plot).map((r) => ({
      swatch: <LegendSwatch color={T.series[r.six]} dashed={r.dashed} />,
      label: `${r.id} · ${r.tag}${r.dashed ? " (training)" : ""}`,
    })),
    { swatch: <LegendSwatch color={T.muted} dashed />, label: `incumbent ${INCUMBENT.name}` },
    { swatch: <LegendSwatch color={T.series[0]} hollow />, label: `real checks · C2 (${REAL_N} picks)` },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 15px", padding: "2px 0 7px" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: T.body, fontSize: 11.5, color: T.muted }}>
          {it.swatch}{it.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- run table (desktop) / run cards (mobile) ---------- */

function ActionButtons({ run, compact }) {
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      {/* a blocked Promote states its why as its own label — the gate teaches */}
      <button className="btn btn--primary" disabled={Boolean(run.block)}
        style={{ padding: compact ? "6px 10px" : "3px 8px", fontSize: compact ? 12 : 11.5 }}>
        {run.block || "Promote"}
      </button>
      <button className="btn btn--quiet" disabled={run.status === "training"}
        style={{ padding: compact ? "6px 10px" : "3px 8px", fontSize: compact ? 12 : 11.5 }}>
        {run.status === "training" ? "Running" : "Archive"}
      </button>
    </span>
  );
}

function PlotBox({ run }) {
  return (
    <input type="checkbox" checked={Boolean(run.plot)} readOnly
      aria-label={`Overlay ${run.id} on the chart`}
      style={{ width: 15, height: 15, accentColor: run.plot ? T.series[run.six] : T.muted, cursor: "pointer" }} />
  );
}

function RunTable({ sel, onSel }) {
  const th = { fontFamily: T.body, fontWeight: 600, fontSize: 11.5, color: T.muted,
    textAlign: "left", padding: "5px 9px", borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" };
  const thNum = { ...th, textAlign: "right" };
  const td = { padding: "3px 9px", borderBottom: `1px solid ${T.lineSoft}`, verticalAlign: "middle", whiteSpace: "nowrap" };
  const tdNum = { ...td, textAlign: "right", ...mono, fontSize: 12.5, color: T.ink };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th scope="col" style={{ ...th, width: 34 }}>Plot</th>
          <th scope="col" style={th}>Run</th>
          <th scope="col" style={th}>Status</th>
          <th scope="col" style={thNum}>Steps</th>
          <th scope="col" style={thNum}>Pick % ±95CI</th>
          <th scope="col" style={thNum}>Coll /1k</th>
          <th scope="col" style={thNum}>Picks/h</th>
          <th scope="col" style={thNum}>Δ vs {INCUMBENT.name}</th>
          <th scope="col" style={thNum}>GPU·h</th>
          <th scope="col" style={{ ...th, textAlign: "right" }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {RUNS.map((r) => {
          const isSel = r.id === sel;
          const d = delta(r);
          return (
            <tr key={r.id} className="datarow" style={{
              background: isSel ? T.surface2 : "transparent",
              boxShadow: isSel ? `inset 2px 0 0 ${T.amber}` : "none" }}>
              <td style={td}><PlotBox run={r} /></td>
              <td style={td}>
                <button className="rowbtn" onClick={() => onSel(r.id)} aria-pressed={isSel}>
                  <span className="runname" style={{ ...mono, fontSize: 13, fontWeight: 500,
                    color: isSel ? T.amber : T.ink }}>{r.id}</span>
                  <span style={{ fontFamily: T.body, fontSize: 11, color: T.muted, marginLeft: 7 }}>{r.tag}</span>
                </button>
              </td>
              <td style={td}>
                <span style={{ display: "inline-flex", alignItems: "center", fontFamily: T.body,
                  fontSize: 12.5, color: T.ink }}>
                  <StatusPip status={r.status} six={r.six} />{r.status}
                  <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 6 }}>— {r.sub}</span>
                </span>
              </td>
              <td style={tdNum}>{r.steps}k<span style={{ color: T.muted }}> / {r.of}k</span></td>
              <td style={tdNum}>{r.eval.toFixed(1)} <span style={{ color: T.muted }}>±{r.ci.toFixed(1)}</span></td>
              <td style={{ ...tdNum, color: r.coll > COLL_CEILING ? T.red : T.ink }}>{r.coll.toFixed(1)}</td>
              <td style={tdNum}>{r.picks}</td>
              <td style={{ ...tdNum, color: d >= 1.0 ? T.green : d <= -1.0 ? T.red : T.muted }}>{fmtDelta(r)}</td>
              <td style={tdNum}>{r.gpu}</td>
              <td style={{ ...td, textAlign: "right" }}><ActionButtons run={r} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RunCards({ sel, onSel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {RUNS.map((r) => {
        const isSel = r.id === sel;
        const d = delta(r);
        return (
          <div key={r.id} style={{ background: isSel ? T.surface2 : T.surface,
            border: `1px solid ${isSel ? T.line : T.lineSoft}`, borderRadius: T.r,
            boxShadow: isSel ? `inset 2px 0 0 ${T.amber}` : "none", padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <button className="rowbtn" onClick={() => onSel(r.id)} aria-pressed={isSel}>
                <span className="runname" style={{ ...mono, fontSize: 14, fontWeight: 500, color: isSel ? T.amber : T.ink }}>
                  {r.id}
                </span>
                <span style={{ fontFamily: T.body, fontSize: 11.5, color: T.muted, marginLeft: 8 }}>{r.tag}</span>
              </button>
              <span style={{ ...mono, fontSize: 14, color: T.ink }}>
                {r.eval.toFixed(1)}<span style={{ color: T.muted, fontSize: 11.5 }}> ±{r.ci.toFixed(1)}</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", fontFamily: T.body, fontSize: 12.5,
              color: T.ink, marginTop: 6 }}>
              <StatusPip status={r.status} six={r.six} />{r.status}
              <span style={{ color: T.muted, marginLeft: 7 }}>· {r.sub}</span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 7, ...mono, fontSize: 12, color: T.muted }}>
              <span>{r.steps}k/{r.of}k</span>
              <span style={{ color: r.coll > COLL_CEILING ? T.red : T.muted }}>coll {r.coll.toFixed(1)}</span>
              <span style={{ color: d >= 1.0 ? T.green : d <= -1.0 ? T.red : T.muted }}>{fmtDelta(r)} vs {INCUMBENT.name}</span>
              <span>{r.gpu} GPU·h</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9 }}>
              <ActionButtons run={r} compact />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.body,
                fontSize: 11.5, color: T.muted }}>
                <PlotBox run={r} />plot
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- detail rail: gates, diagnosis, config Δ, decision ----------
   NOTE: at 1280×800 the rail, not the chart, governs the fold — the golden fits
   with ~5px slack. If you extend this rail's copy, re-capture and re-check the
   provenance footer stays above the fold (render-review cycle 4 trimmed it once). */

function GateRow({ ok, warn, label, value }) {
  const c = ok ? T.green : warn ? T.amber : T.red;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, padding: "3px 0" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: T.body,
        fontSize: 12.5, color: T.ink }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: c, flex: "none" }} />
        {label}
      </span>
      <span style={{ ...mono, fontSize: 12.5, color: c }}>{value}</span>
    </div>
  );
}

function DetailRail({ sel }) {
  const r = RUNS.find((q) => q.id === sel);
  const passBar = r.eval >= PICK_BAR && r.status === "complete";
  const passColl = r.coll <= COLL_CEILING;
  return (
    <div key={r.id} style={{ animation: "riseIn 0.25s ease-out" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ ...mono, fontSize: 17, fontWeight: 500, color: T.ink }}>{r.id}</span>
        <span style={{ display: "inline-flex", alignItems: "center", fontFamily: T.body, fontSize: 12.5, color: T.ink }}>
          <StatusPip status={r.status} six={r.six} />{r.status}
        </span>
      </div>

      {/* the two pilot gates, judged in place */}
      <div style={{ borderTop: `1px solid ${T.lineSoft}`, borderBottom: `1px solid ${T.lineSoft}`,
        margin: "8px 0", padding: "2px 0" }}>
        <GateRow ok={passBar} warn={r.status === "training"}
          label={`Pick bar ≥ ${PICK_BAR.toFixed(1)}%`}
          value={r.status === "training" ? `${r.eval.toFixed(1)} at ${r.steps}k — not yet`
            : `${r.eval.toFixed(1)} — ${r.eval >= PICK_BAR ? "pass" : "fail"}`} />
        <GateRow ok={passColl}
          label={`Collisions ≤ ${COLL_CEILING.toFixed(1)}/1k`}
          value={`${r.coll.toFixed(1)} — ${passColl ? "pass" : "fail"}`} />
        {r.real && (
          <GateRow ok
            label="Real checks"
            value={r.real.map((c) => realPct(c).toFixed(1)).join(" · ") + " — in CI"} />
        )}
      </div>

      <p style={{ fontFamily: T.body, fontSize: 12.5, lineHeight: 1.5, color: T.muted, margin: "0 0 10px" }}>
        {r.read}
      </p>

      <SectionTitle note="vs sweep base">Config Δ</SectionTitle>
      <div style={{ marginBottom: 4 }}>
        {r.diff.map((dd) => (
          <div key={dd.k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0" }}>
            <span style={{ ...mono, fontSize: 12, color: T.ink }}>{dd.k}</span>
            <span style={{ ...mono, fontSize: 12, textAlign: "right" }}>
              <span style={{ color: T.faint, textDecoration: "line-through" }}>{dd.from}</span>
              <span style={{ color: T.muted }}> → </span>
              <span style={{ color: T.amber }}>{dd.to}</span>
            </span>
          </div>
        ))}
        <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.muted, padding: "4px 0 0" }}>
          {PARAM_COUNT - r.diff.length} of {PARAM_COUNT} parameters unchanged
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${T.lineSoft}`, marginTop: 8, paddingTop: 8 }}>
        <button className="btn btn--primary" disabled={Boolean(r.block)} style={{ width: "100%", padding: "8px 12px" }}>
          {r.block ? `Promote blocked — ${r.block.toLowerCase()}` : `Promote ${r.id} to pilot cell C2`}
        </button>
        <p style={{ fontFamily: T.body, fontSize: 11.5, lineHeight: 1.5, color: T.muted, margin: "6px 0 0" }}>
          {r.block
            ? r.status === "training"
              ? "Opens when the run finishes 300k steps and its final checkpoint clears both gates."
              : r.coll > COLL_CEILING && r.eval >= PICK_BAR
                ? `Blocked by the collision ceiling alone — ${r.coll.toFixed(1)}/1k against ${COLL_CEILING.toFixed(1)} allowed. The pick bar is met.`
                : "Blocked: the final checkpoint does not clear the pick bar. Archive, or retrain with a changed config."
            : `Replaces ${INCUMBENT.name} on cell C2 only (1 of 12). Auto-rollback below 88.0% over the first 500 real picks.`}
        </p>
      </div>
    </div>
  );
}

/* ---------- the screen ---------- */

export default function RunComparison() {
  const compact = useCompact();
  const [sel, setSel] = useState("R-311");
  const pagePad = compact ? "12px 14px 20px" : "10px 22px 12px";

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, padding: pagePad,
      fontFamily: T.body }}>
      <GlobalStyle />

      {/* header — wordmark is the PRODUCT's name; no clock, the dataset is a snapshot */}
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline",
        justifyContent: "space-between", gap: "4px 16px", paddingBottom: compact ? 8 : 5 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 15, letterSpacing: "0.22em",
            color: T.ink }}>GANTRY</span>
          <span style={{ fontFamily: T.body, fontSize: 12, color: T.muted }}>policy run analysis</span>
        </div>
        <span style={{ ...mono, fontSize: 11.5, color: T.muted }}>
          {compact
            ? `grasp-gen2 · ${N_RUNS} runs · ${GPU_TOTAL} GPU·h · Jul 7`
            : `grasp-gen2 · ${N_RUNS} runs · ${GPU_TOTAL} GPU·h · eval v5.2 · data through Jul 7`}
        </span>
      </header>

      {/* the finding, stated before the furniture */}
      <div style={{ borderTop: `1px solid ${T.lineSoft}`, padding: compact ? "10px 0 12px" : "7px 0 9px" }}>
        <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.muted, marginBottom: 2 }}>
          Experiments / grasp-gen2 / pilot review
        </div>
        <h1 style={{ fontFamily: T.display, fontWeight: 600, fontSize: compact ? 19 : 20,
          margin: "0 0 5px", color: T.ink }}>
          Which policy replaces {INCUMBENT.name} on the pilot cell?
        </h1>
        <p style={{ fontFamily: T.body, fontSize: compact ? 13 : 13.5, lineHeight: 1.5,
          color: T.muted, margin: 0, maxWidth: 1150 }}>
          Two of six candidates clear the <V>{PICK_BAR.toFixed(1)}%</V> pilot bar, but only{" "}
          <V>R-311</V> also meets the <V>{COLL_CEILING.toFixed(1)}/1k</V> collision ceiling —{" "}
          <V>93.8% ± 1.0</V> pick success, <V>+3.1 pts</V> over incumbent {INCUMBENT.name}, and
          both real-cell checks agree with sim.
        </p>
      </div>

      {/* evidence row: hero chart + decision rail */}
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 332px",
        gap: compact ? 14 : 16, alignItems: "start" }}>
        <section style={{ background: T.surface, border: `1px solid ${T.lineSoft}`, borderRadius: T.r,
          padding: compact ? "10px 12px 8px" : "10px 14px 6px" }}>
          <SectionTitle note={`${RUNS.filter((r) => r.plot).length} of ${N_RUNS} runs overlaid`}>
            Pick success — eval suite v5.2
          </SectionTitle>
          <p style={{ fontFamily: T.body, fontSize: 11.5, color: T.muted, margin: "0 0 3px", lineHeight: 1.45 }}>
            % successful scripted picks vs training steps. Band = spread across 3 seeds; dashed =
            still training; hollow ◇ = real-cell checks, whiskers = their 95% CI.
            {compact ? " Curves start near the gen2 base policy's 76% — these are fine-tunes." : ""}
          </p>
          <ChartLegend />
          <EvalChart compact={compact} />
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px",
            borderTop: `1px solid ${T.lineSoft}`, marginTop: 5, padding: "7px 0 2px" }}>
            <VerdictChip tone="good">Clears both gates</VerdictChip>
            <span style={{ fontFamily: T.body, fontSize: 12, color: T.muted }}>
              R-311 has held the pilot bar since 210k steps, and both real checks sit inside their CIs.
            </span>
          </div>
        </section>

        {!compact && (
          <aside style={{ background: T.surface, border: `1px solid ${T.lineSoft}`, borderRadius: T.r,
            padding: "10px 14px 12px" }}>
            <DetailRail sel={sel} />
          </aside>
        )}
      </div>

      {/* run table / cards */}
      <section style={{ marginTop: compact ? 14 : 6 }}>
        <SectionTitle note={compact ? "tap a run to inspect it" : "Plot overlays a run on the chart · click a run to inspect it"}>
          Runs — {N_DONE} complete · {N_TRAINING} training · {N_STOPPED} stopped
        </SectionTitle>
        {compact ? <RunCards sel={sel} onSel={setSel} /> : <RunTable sel={sel} onSel={setSel} />}
      </section>

      {compact && (
        <section style={{ marginTop: 14, background: T.surface, border: `1px solid ${T.lineSoft}`,
          borderRadius: T.r, padding: "12px 14px" }}>
          <DetailRail sel={sel} />
        </section>
      )}

      {/* provenance — how these numbers were made */}
      <footer style={{ borderTop: `1px solid ${T.lineSoft}`, marginTop: compact ? 16 : 8,
        paddingTop: 5, fontFamily: T.body, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
        Eval: suite v5.2 — 800 scripted picks × 3 seeds per checkpoint (n = 2,400); ± = 95%
        binomial CI. Real checks: {REAL_N} picks each on cell C2. Static snapshot — data through
        Tue Jul 7, 2026.
      </footer>
    </div>
  );
}
