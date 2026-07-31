import { useState, useEffect, useRef } from "react";
import { T } from "./tokens.js";
import { GlobalStyle, Panel, Eyebrow, Readout, Sparkline, GaugeArc, TrackRow, CmdButton, mulberry32 } from "./primitives.jsx";

/* ============================================================
   PASS 1 — DESIGN PLAN
   Subject: orbital operations console for the KRN-4 theater.
   Audience: an ops crew mid-shift.
   Single job: commit or abort the burn with confidence.
   Tokens: ORRERY register (see tokens.js).
   Signature: the live orbital plot with the radar sweep.
   Copy: domain vernacular (tracks, Δv, burn window) — no lorem
   ipsum.

   Canonicalized from the 2026-07 Fable draft — ledger in README.md.
   ============================================================ */

/* ---------- 3. THE SIGNATURE — live orbital plot ---------- */

function OrbitalPlot({ theta, waypoints, selectedTrack }) {
  const cx = 210, cy = 210;
  const pos = (a, b, ang, rot = 0) => {
    const x = a * Math.cos(ang), y = b * Math.sin(ang);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    return { x: cx + x * cr - y * sr, y: cy + x * sr + y * cr };
  };
  const own = pos(150, 120, theta, -0.35);
  const tgt = pos(95, 78, -theta * 1.7 + 1.2, 0.4);
  const trail = [];
  for (let i = 1; i <= 14; i++) {
    trail.push(pos(150, 120, theta - i * 0.05, -0.35));
  }
  return (
    <svg viewBox="0 0 420 420" style={{ width: "100%", height: "100%", display: "block" }} role="img" aria-label="Orbital tactical plot">
      {/* range rings + graticule */}
      {[60, 105, 150, 195].map((r) => (
        <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={T.lineSoft} strokeWidth="1" />
      ))}
      <line x1={cx} y1={10} x2={cx} y2={410} stroke={T.lineSoft} strokeWidth="0.5" />
      <line x1={10} y1={cy} x2={410} y2={cy} stroke={T.lineSoft} strokeWidth="0.5" />
      {[0, 45, 90, 135].map((d) => (
        <text key={d} x={cx + 199 * Math.cos((d * Math.PI) / 180)} y={cy - 199 * Math.sin((d * Math.PI) / 180)}
          fill={T.faint} fontFamily={T.mono} fontSize="8" textAnchor="middle">{d}°</text>
      ))}

      {/* radar sweep */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: "sweep 7s linear infinite" }}>
        <line x1={cx} y1={cy} x2={cx + 195} y2={cy} stroke={T.cyan} strokeWidth="1" opacity="0.5" />
        <path d={`M ${cx} ${cy} L ${cx + 195} ${cy} A 195 195 0 0 0 ${cx + 195 * Math.cos(-0.5)} ${cy + 195 * Math.sin(-0.5)} Z`}
          fill={T.cyan} opacity="0.05" />
      </g>

      {/* primary body */}
      <circle cx={cx} cy={cy} r={26} fill={T.surface2} stroke={T.line} />
      <circle cx={cx} cy={cy} r={26} fill="none" stroke={T.cyan} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.6" />
      <text x={cx} y={cy + 3} textAnchor="middle" fill={T.muted} fontFamily={T.mono} fontSize="9">KRN-4</text>

      {/* orbits */}
      <ellipse cx={cx} cy={cy} rx={150} ry={120} fill="none" stroke={T.line} strokeWidth="1" transform={`rotate(${(-0.35 * 180) / Math.PI} ${cx} ${cy})`} />
      <ellipse cx={cx} cy={cy} rx={95} ry={78} fill="none" stroke={T.red} strokeWidth="0.8" opacity="0.5" transform={`rotate(${(0.4 * 180) / Math.PI} ${cx} ${cy})`} />

      {/* planned transfer */}
      <path d={`M ${own.x} ${own.y} Q ${cx} ${cy - 30} ${tgt.x} ${tgt.y}`} fill="none" stroke={T.amber} strokeWidth="1.2" strokeDasharray="4 4" />
      {waypoints.map((w, i) => {
        const t = (i + 1) / (waypoints.length + 1);
        const qx = (1 - t) * (1 - t) * own.x + 2 * (1 - t) * t * cx + t * t * tgt.x;
        const qy = (1 - t) * (1 - t) * own.y + 2 * (1 - t) * t * (cy - 30) + t * t * tgt.y;
        return (
          <g key={w}>
            <rect x={qx - 3} y={qy - 3} width="6" height="6" transform={`rotate(45 ${qx} ${qy})`} fill={T.bg} stroke={T.amber} strokeWidth="1" />
            <text x={qx + 8} y={qy - 6} fill={T.amber} fontFamily={T.mono} fontSize="8">{w}</text>
          </g>
        );
      })}

      {/* own-ship trail */}
      {trail.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.4} fill={T.cyan} opacity={(1 - i / 15) * 0.5} />
      ))}

      {/* own ship */}
      <g>
        <circle cx={own.x} cy={own.y} fill="none" stroke={T.cyan} strokeWidth="1" style={{ animation: "pulse-ring 2.4s ease-out infinite" }} />
        <polygon points={`${own.x},${own.y - 6} ${own.x + 5},${own.y + 5} ${own.x - 5},${own.y + 5}`} fill={T.cyan} />
        <text x={own.x + 10} y={own.y + 3} fill={T.cyan} fontFamily={T.mono} fontSize="9">VIGIL-1</text>
      </g>

      {/* target */}
      <g>
        <rect x={tgt.x - 5} y={tgt.y - 5} width="10" height="10" fill="none" stroke={selectedTrack === "TRK-09" ? T.amber : T.red} strokeWidth="1.2" />
        <text x={tgt.x + 10} y={tgt.y + 3} fill={T.red} fontFamily={T.mono} fontSize="9">TRK-09</text>
      </g>
    </svg>
  );
}

/* ---------- 4. APPLICATION ---------- */

const LOG_POOL = [
  ["SENS", "Correlation on TRK-09 refreshed · conf 0.94"],
  ["NAV", "Transfer solution recomputed · Δv 41.2 m/s"],
  ["COMM", "Relay KRN-4A handshake nominal"],
  ["AI", "Advisor: burn window quality improving"],
  ["SENS", "New contact discarded · debris class"],
  ["PWR", "Array output 96.2% · trim complete"],
  ["NAV", "Waypoint WP-2 tolerance tightened to 120 m"],
];

export default function OrreryConsole() {
  const [theta, setTheta] = useState(0);
  const [clock, setClock] = useState("");
  const [vel, setVel] = useState(7.612);
  const [alt, setAlt] = useState(412.4);
  const [sig, setSig] = useState(Array.from({ length: 36 }, (_, i) => 60 + Math.sin(i / 3) * 12));
  const [thermal, setThermal] = useState(Array.from({ length: 36 }, (_, i) => 40 + Math.cos(i / 4) * 8));
  const [fuel, setFuel] = useState(73);
  const [logs, setLogs] = useState([["NAV", "Transfer plan ORRERY-7 loaded", "14:02:11"]]);
  const [track, setTrack] = useState("TRK-09");
  const [countdown, setCountdown] = useState(252);
  const logIdx = useRef(0);
  const rng = useRef(mulberry32(0x5eed));
  const phase = useRef(0);

  useEffect(() => {
    const anim = setInterval(() => setTheta((t) => t + 0.004), 40);
    const tick = setInterval(() => {
      // real clock — the alive element; generated data is seeded (ledger #4)
      const now = new Date();
      setClock(now.toUTCString().slice(17, 25));
      phase.current += 1;
      setVel((v) => +(v + (rng.current() - 0.5) * 0.004).toFixed(3));
      setAlt((a) => +(a + (rng.current() - 0.5) * 0.12).toFixed(1));
      setSig((s) => [...s.slice(1), 60 + Math.sin(phase.current / 2.2) * 12 + (rng.current() - 0.5) * 6]);
      setThermal((s) => [...s.slice(1), 40 + Math.cos(phase.current / 3.1) * 8 + (rng.current() - 0.5) * 3]);
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    const logTimer = setInterval(() => {
      const entry = LOG_POOL[logIdx.current % LOG_POOL.length];
      logIdx.current += 1;
      const t = new Date().toUTCString().slice(17, 25);
      setLogs((l) => [[entry[0], entry[1], t], ...l].slice(0, 9));
      setFuel((f) => Math.max(20, f - 0.15));
    }, 4200);
    return () => { clearInterval(anim); clearInterval(tick); clearInterval(logTimer); };
  }, []);

  const cd = `T-${String(Math.floor(countdown / 60)).padStart(2, "0")}:${String(countdown % 60).padStart(2, "0")}`;

  return (
    <div className="ops-root" style={{ background: T.bg, color: T.ink, fontFamily: T.body, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalStyle />
      <style>{`
        .ops-main { flex: 1; display: grid; grid-template-columns: 250px minmax(320px, 1fr) 270px; gap: 10px; padding: 10px; min-height: 0; }
        .ops-main > * { min-height: 0; }
        /* a console fits its viewport — the burn commands and the log may never
           fall below the fold (the screen's single job lives in that bar) */
        @media (min-width: 901px) { .ops-root { height: 100vh; overflow: hidden; } }
        @media (max-width: 900px) { .ops-main { grid-template-columns: 1fr; } }
      `}</style>

      {/* command bar */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${T.line}`, gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 18, letterSpacing: "0.22em", color: T.ink }}>ORRERY</span>
          <Eyebrow>Orbital Ops · KRN-4 Theater</Eyebrow>
        </div>
        <nav style={{ display: "flex", gap: 2 }} aria-label="Console modes">
          {["Tactical", "Planning", "Telemetry", "Archive"].map((m, i) => (
            <button key={m} className="navtab" aria-current={i === 0 ? "page" : undefined} style={{ fontFamily: T.display, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", padding: "6px 12px", color: i === 0 ? T.amber : T.muted, borderBottom: `2px solid ${i === 0 ? T.amber : "transparent"}` }}>{m}</button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: T.mono, fontSize: 13, color: T.cyan, fontVariantNumeric: "tabular-nums" }}>{clock} UTC</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 11, color: T.green }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, animation: "blink 2.5s infinite" }} />NOMINAL
          </span>
        </div>
      </header>

      {/* main grid */}
      <main className="ops-main">
        {/* left: contact tracks */}
        <Panel title="Contact Tracks" tag="6 ACTIVE" pad={4}>
          <div role="listbox" aria-label="Tracked contacts">
            {[
              ["TRK-09", "Interceptor · maneuvering", "1,204 km", "HOSTILE"],
              ["TRK-11", "Uncorrelated burn plume", "3,880 km", "UNKNOWN"],
              ["CIV-30", "Cargo lighter Meridian", "740 km", "FRIENDLY"],
              ["TRK-14", "Derelict tug", "5,102 km", "UNKNOWN"],
              ["CIV-27", "Relay KRN-4A", "212 km", "FRIENDLY"],
              ["CIV-31", "Survey drone flight", "988 km", "FRIENDLY"],
            ].map(([id, kind, range, threat]) => (
              <TrackRow key={id} id={id} kind={kind} range={range} threat={threat} selected={track === id} onClick={() => setTrack(id)} />
            ))}
          </div>
          <div style={{ marginTop: "auto", paddingTop: 10, borderTop: `1px solid ${T.lineSoft}` }}>
            <Eyebrow color={T.faint}>Selected</Eyebrow>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.amber, marginTop: 4 }}>{track} · intercept geometry favorable</div>
          </div>
        </Panel>

        {/* center: orbital plot */}
        <Panel title="Tactical Plot" tag="SWEEP 7.0s" tagColor={T.cyan} pad={6} style={{ minHeight: 380 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <OrbitalPlot theta={theta} waypoints={["WP-1", "WP-2", "WP-3"]} selectedTrack={track} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: `1px solid ${T.lineSoft}`, gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 18 }}>
              <Readout label="BURN WINDOW" value={cd} color={T.amber} />
              <Readout label="Δv BUDGET" value="41.2" unit="m/s" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <CmdButton variant="primary" onClick={() => {}}>Commit Burn</CmdButton>
              <CmdButton variant="quiet" onClick={() => {}}>Replan</CmdButton>
              <CmdButton variant="danger" onClick={() => {}}>Abort</CmdButton>
            </div>
          </div>
        </Panel>

        {/* right: telemetry + advisor */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <Panel title="Ship Telemetry" tag="VIGIL-1" tagColor={T.cyan}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Readout label="VELOCITY" value={vel.toFixed(3)} unit="km/s" color={T.cyan} />
              <Readout label="ALTITUDE" value={alt.toFixed(1)} unit="km" color={T.cyan} />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 3 }}>
                <span>SIGNAL dBm</span><span>{sig[sig.length - 1].toFixed(1)}</span>
              </div>
              <Sparkline data={sig} w={220} />
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.mono, fontSize: 10, color: T.muted, margin: "10px 0 3px" }}>
                <span>THERMAL °C</span><span>{thermal[thermal.length - 1].toFixed(1)}</span>
              </div>
              <Sparkline data={thermal} w={220} color={T.amber} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", marginTop: 14 }}>
              <GaugeArc label="FUEL" value={fuel} color={fuel < 30 ? T.red : T.cyan} />
              <GaugeArc label="POWER" value={96} color={T.green} />
              <GaugeArc label="COMMS" value={82} />
            </div>
          </Panel>

          <Panel title="Advisor" tag="MODEL K-7" tagColor={T.amber} style={{ flex: 1 }}>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: T.ink, margin: 0 }}>
              Hold current track. TRK-09 closure rate favors a WP-2 intercept; committing inside the next window preserves 11 m/s of margin.
            </p>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: 4 }}>
                <span>CONFIDENCE</span><span>0.91</span>
              </div>
              <div style={{ height: 4, background: T.line }}>
                <div style={{ width: "91%", height: "100%", background: T.amber }} />
              </div>
            </div>
          </Panel>
        </div>
      </main>

      {/* event log */}
      <footer style={{ borderTop: `1px solid ${T.line}`, padding: "8px 16px", height: 118, flexShrink: 0, overflowY: "auto", background: T.surface }}>
        <Eyebrow color={T.faint}>Event Log</Eyebrow>
        <div style={{ marginTop: 6 }}>
          {logs.map(([sys, msg, t], i) => (
            <div key={t + i} style={{ display: "grid", gridTemplateColumns: "70px 52px 1fr", gap: 10, fontFamily: T.mono, fontSize: 11, padding: "2px 0", color: i === 0 ? T.ink : T.muted, animation: i === 0 ? "riseIn 0.3s ease-out" : "none" }}>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{t}</span>
              <span style={{ color: sys === "AI" ? T.amber : T.cyan }}>{sys}</span>
              <span>{msg}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
