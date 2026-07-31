import { useState, useMemo, useRef } from "react";
import { T } from "./tokens.js";
import { GlobalStyle, Eyebrow, VerdictChip, Field, BandSlider, ChoiceCards, CmdButton } from "./primitives.jsx";

/* ============================================================
   PASS 1 — DESIGN PLAN
   Subject: scenario-builder configuration UI for the ORRERY simulator.
   Audience: an analyst who has never read the manual.
   Single job: configure a trustworthy run and know why it's trustworthy.
   Signature: the config sentence + the self-judging solver plot.
   Demonstrates self-teaching patterns 1–9 (design-craft.md § Self-teaching
   UI patterns).

   Canonicalized from the 2026-07 Fable draft — ledger in README.md.
   ============================================================ */

/* ---------- APP ---------- */

const REC = { tick: 20, contacts: 120, hours: 6, sensor: "physical" };

const SENSORS = [
  { id: "cone", name: "Simple cones", desc: "Fast and forgiving. Fine for layout and timing questions.", speed: 1 },
  { id: "physical", name: "Physical model", desc: "Real occlusion and noise. Use when detection ranges matter.", speed: 2.6 },
  { id: "replay", name: "Recorded data", desc: "Replays real sensor logs. Slow, but ground truth.", speed: 4.5 },
];

const PRESETS = [
  { name: "Quick look", desc: "answers in seconds", v: { tick: 8, contacts: 40, hours: 2, sensor: "cone" } },
  { name: "Standard run", desc: "the recommended baseline", v: { ...REC } },
  { name: "High fidelity", desc: "overnight-quality results", v: { tick: 45, contacts: 300, hours: 12, sensor: "replay" } },
];

// Which plain-language words reach which field (the search map).
const KEYWORDS = {
  tick: ["tick", "rate", "speed", "faster", "slower", "accuracy", "time step", "step"],
  contacts: ["contact", "units", "ships", "density", "how many", "crowd"],
  hours: ["duration", "hours", "long", "length", "time"],
  sensor: ["sensor", "detection", "radar", "realism", "fidelity", "see"],
};

export default function ScenarioBuilder() {
  const [cfg, setCfg] = useState(REC);
  const { tick, contacts, hours, sensor } = cfg;
  const [query, setQuery] = useState("");
  const [flashed, setFlashed] = useState({});
  const flashTimer = useRef(null);

  const set = (k) => (v) => setCfg((c) => ({ ...c, [k]: v }));

  const applyPreset = (p) => {
    const changed = Object.fromEntries(Object.keys(p.v).filter((k) => p.v[k] !== cfg[k]).map((k) => [k, true]));
    setCfg({ ...p.v });
    setFlashed(changed);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashed({}), 1500);
  };

  const sensorObj = SENSORS.find((s) => s.id === sensor);
  const runMin = Math.max(0.2, (tick * contacts * hours * sensorObj.speed) / 3600);
  const runLabel = runMin < 1 ? `${Math.round(runMin * 60)} sec` : runMin < 90 ? `${runMin.toFixed(0)} min` : `${(runMin / 60).toFixed(1)} hr`;

  // Stability series: coarse ticks oscillate, fine ticks converge.
  const series = useMemo(() => {
    const pts = [];
    const stability = Math.min(1, tick / 14); // <14 tps → under-resolved
    for (let i = 0; i < 48; i++) {
      const decay = Math.exp(-i / (14 + stability * 20));
      const osc = Math.sin(i * (1.6 - stability)) * (1 - stability) * 34;
      const noise = Math.sin(i * 7.3) * 1.6;
      pts.push(50 - decay * 30 + osc * decay * 1.6 + noise);
    }
    return pts;
  }, [tick]);

  const verdict =
    tick < 12 ? { tone: "bad", text: "OSCILLATING — time step too coarse, contacts can skip past each other" }
    : tick <= 30 ? { tone: "good", text: "STABLE — solver error inside the noise floor, results trustworthy" }
    : { tone: "warn", text: "STABLE BUT OVERKILL — no accuracy gain past ~30, just slower runs" };

  const consequences = {
    tick:
      tick < 12 ? `${tick}/sec: fast, but fast movers may teleport through each other`
      : tick <= 30 ? `${tick}/sec: motion resolves cleanly; run cost is moderate`
      : `${tick}/sec: ~${(tick / REC.tick).toFixed(1)}× the compute of the recommendation for the same answer`,
    contacts: contacts <= 150 ? `${contacts} contacts: every unit gets full-detail behavior` : `${contacts} contacts: beyond ~150, distant units drop to simplified behavior automatically`,
    hours: `${hours}h of scenario time ≈ ${runLabel} of real time at these settings`,
    sensor: sensorObj.id === "cone" ? "detection is generous — expect ~10% more sightings than reality" : sensorObj.id === "physical" ? "detections will match field trials within ±4%" : "exact ground truth, but limited to logged geometries",
  };

  const match = (id) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return KEYWORDS[id].some((k) => q.includes(k) || k.includes(q));
  };
  const anyMatch = ["tick", "contacts", "hours", "sensor"].some(match);

  const w = 300, h = 110;
  const plotPts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - (v / 100) * h}`).join(" ");

  const S = (txt, color) => <span style={{ color: color || T.amber, borderBottom: `1px dotted ${color || T.amber}` }}>{txt}</span>;

  return (
    <div style={{ background: T.bg, color: T.ink, fontFamily: T.body, minHeight: "100vh" }}>
      <GlobalStyle />
      <style>{`
        .builder-main { display: grid; grid-template-columns: minmax(320px, 1fr) 340px; gap: 0; align-items: start; }
        @media (max-width: 760px) { .builder-main { grid-template-columns: 1fr; } .builder-aside { position: static !important; } }
      `}</style>

      {/* header + the sentence */}
      <header style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 16, letterSpacing: "0.22em" }}>ORRERY</span>
          <Eyebrow>Scenario Builder</Eyebrow>
        </div>
        <p style={{ fontFamily: T.body, fontSize: 16, lineHeight: 1.6, margin: 0, maxWidth: 720 }}>
          Simulate a {S(`${hours}-hour`)} engagement with {S(`${contacts} contacts`)} at{" "}
          {S(`${tick} ticks/sec`)} using {S(sensorObj.name.toLowerCase(), T.cyan)} — about{" "}
          {S(runLabel, runMin > 60 ? T.red : T.green)} to run.
        </p>
      </header>

      <main className="builder-main">
        {/* left: settings */}
        <section style={{ borderRight: `1px solid ${T.line}` }}>
          {/* search + presets */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.lineSoft}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Find a setting… try "make it faster"'
              aria-label="Search settings in plain language"
              style={{ flex: 1, minWidth: 200, fontFamily: T.mono, fontSize: 12, padding: "8px 10px", background: T.surface, border: `1px solid ${T.line}`, color: T.ink, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {PRESETS.map((p) => (
                <button key={p.name} onClick={() => applyPreset(p)} title={p.desc} style={{ fontFamily: T.display, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 10px", background: "transparent", border: `1px solid ${T.line}`, color: T.muted, cursor: "pointer" }}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          {!anyMatch && (
            <div style={{ padding: 16, fontFamily: T.mono, fontSize: 12, color: T.muted }}>
              Nothing matches "{query}". Try words like speed, sensors, duration, contacts — or clear the search.
            </div>
          )}

          {match("tick") && (
            <Field id="f-tick" label="Simulation tick rate" impact="perf" flashed={flashed.tick}
              help="How many times per second the world updates. Higher catches fast events; lower runs quicker. Most scenarios are accurate anywhere in the green band."
              consequence={consequences.tick}
              changed={tick !== REC.tick} onReset={() => set("tick")(REC.tick)}>
              <BandSlider value={tick} min={1} max={60} bandLo={12} bandHi={30} rec={REC.tick} unit="" onChange={set("tick")} ariaLabel="Tick rate, ticks per second" />
            </Field>
          )}

          {match("sensor") && (
            <Field id="f-sensor" label="Sensor realism" impact="results" flashed={flashed.sensor}
              help="How detection is modeled. This changes your results, not just speed — pick based on the question you're asking."
              consequence={consequences.sensor}
              changed={sensor !== REC.sensor} onReset={() => set("sensor")(REC.sensor)}>
              <ChoiceCards options={SENSORS} value={sensor} onChange={set("sensor")} />
            </Field>
          )}

          {match("contacts") && (
            <Field id="f-contacts" label="Contact count" impact="results" flashed={flashed.contacts}
              help="How many ships, drones, and objects populate the theater. 120 matches a typical patrol picture."
              consequence={consequences.contacts}
              changed={contacts !== REC.contacts} onReset={() => set("contacts")(REC.contacts)}>
              <BandSlider value={contacts} min={10} max={500} bandLo={60} bandHi={200} rec={REC.contacts} unit="" onChange={set("contacts")} ariaLabel="Contact count" />
            </Field>
          )}

          {match("hours") && (
            <Field id="f-hours" label="Scenario duration" impact="perf" flashed={flashed.hours}
              help="How much in-world time to simulate. Longer runs don't improve accuracy — they answer longer questions."
              consequence={consequences.hours}
              changed={hours !== REC.hours} onReset={() => set("hours")(REC.hours)}>
              <BandSlider value={hours} min={1} max={24} bandLo={4} bandHi={12} rec={REC.hours} unit="h" onChange={set("hours")} ariaLabel="Scenario duration, hours" />
            </Field>
          )}
        </section>

        {/* right: live judgment */}
        <aside className="builder-aside" style={{ padding: 16, position: "sticky", top: 0 }}>
          <Eyebrow>What you'll get</Eyebrow>

          <div style={{ marginTop: 10, background: T.surface, border: `1px solid ${T.lineSoft}`, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", color: T.muted }}>SOLVER ENERGY — PREVIEW</span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", display: "block" }} role="img" aria-label="Solver stability preview">
              {/* healthy zone, drawn ON the plot so the plot teaches itself */}
              <rect x="0" y={h - 0.62 * h} width={w} height={0.34 * h} fill="rgba(123,216,143,0.10)" />
              <text x="6" y={h - 0.62 * h + 12} fontFamily={T.mono} fontSize="9" fill={T.green}>healthy: settles into this band</text>
              <line x1="0" y1={h - 0.28 * h} x2={w} y2={h - 0.28 * h} stroke={T.green} strokeWidth="0.5" strokeDasharray="3 3" opacity="0.5" />
              <polyline points={plotPts} fill="none" stroke={verdict.tone === "bad" ? T.red : T.cyan} strokeWidth="1.6" />
            </svg>
            <div style={{ marginTop: 10 }}>
              <VerdictChip tone={verdict.tone}>{verdict.tone === "good" ? "LOOKS RIGHT" : verdict.tone === "warn" ? "WASTEFUL" : "NOT TRUSTWORTHY"}</VerdictChip>
              <p style={{ fontFamily: T.body, fontSize: 12, lineHeight: 1.5, color: T.muted, margin: "8px 0 0" }}>{verdict.text}.</p>
            </div>
          </div>

          <div style={{ marginTop: 12, background: T.surface, border: `1px solid ${T.lineSoft}`, padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, letterSpacing: "0.1em" }}>EST. RUN TIME</div>
                <div style={{ fontFamily: T.mono, fontSize: 20, color: runMin > 60 ? T.red : T.ink, fontVariantNumeric: "tabular-nums" }}>{runLabel}</div>
              </div>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, letterSpacing: "0.1em" }}>RESULT QUALITY</div>
                <div style={{ fontFamily: T.mono, fontSize: 20, color: verdict.tone === "bad" ? T.red : T.green }}>{verdict.tone === "bad" ? "LOW" : sensor === "cone" ? "FAIR" : "HIGH"}</div>
              </div>
            </div>
            <p style={{ fontFamily: T.body, fontSize: 11.5, lineHeight: 1.5, color: T.muted, margin: "10px 0 0" }}>
              {verdict.tone === "bad"
                ? "Fix the red verdict before running — a fast wrong answer is still wrong."
                : runMin > 60
                ? "This is an overnight run. If you only need rough timing, try the Quick look preset."
                : "These settings will answer most questions on the first try."}
            </p>
          </div>

          <div style={{ marginTop: 12, display: "grid" }}>
            <CmdButton variant="primary" size="lg" disabledReason={verdict.tone === "bad" ? "Resolve warning to run" : undefined} onClick={() => {}}>
              Run scenario · {runLabel}
            </CmdButton>
          </div>
        </aside>
      </main>
    </div>
  );
}
