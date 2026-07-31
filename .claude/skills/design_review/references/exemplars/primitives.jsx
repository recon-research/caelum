/* ORRERY primitives — the component library the exemplar screens compose from.
   Demonstrates ui-library-contract.md: states and a11y live INSIDE the
   primitives; screens cannot ship a stateless control because none exists.
   Canonicalization ledger (numbers = README § Canonicalization ledger):
   interactive states moved from React state / outline:none hacks into the
   stylesheet (#1 #2), variants replace boolean soup (#3), seeded PRNG
   replaces Math.random for generated data (#4). */
import { T } from "./tokens.js";

/* Deterministic stream for generated/live-feel data (frameworks.md § React).
   Same seed, same telemetry — goldens stay comparable across runs (#4). */
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* One stylesheet owns everything inline styles cannot express: keyframes,
   hover/focus-visible/active/disabled state, reduced motion. Inline styles
   stay token-derived and static (frameworks.md § Sandboxed preview note);
   state selectors are the exception that MUST live here (#1 #2).
   Focus convention: one visible amber ring everywhere — amber = attention
   (house-style.md § ORRERY); never remove an outline without replacing it. */
export const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap');
    @keyframes sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes pulse-ring { 0% { r: 4; opacity: 0.9; } 100% { r: 14; opacity: 0; } }
    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
    @keyframes riseIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @keyframes flash { 0% { background: rgba(255,180,84,0.22); } 100% { background: transparent; } }

    button { font: inherit; }
    :where(button, input, [tabindex]):focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px; }

    .cmd { font-family: ${T.display}; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
           background: transparent; border: 1px solid; cursor: pointer;
           transition: background 0.15s ease-out, color 0.15s ease-out; }
    .cmd--primary { color: ${T.amber}; border-color: ${T.amber}; }
    .cmd--quiet   { color: ${T.muted}; border-color: ${T.muted}; }
    .cmd--danger  { color: ${T.red};   border-color: ${T.red}; }
    .cmd--primary:hover:not(:disabled) { background: ${T.amber}; color: ${T.bg}; }
    .cmd--quiet:hover:not(:disabled)   { background: ${T.muted}; color: ${T.bg}; }
    .cmd--danger:hover:not(:disabled)  { background: ${T.red};   color: ${T.bg}; }
    .cmd:disabled { color: ${T.faint}; border-color: ${T.line}; background: transparent; cursor: not-allowed; }

    .trackrow { background: transparent; border: none; cursor: pointer; }
    .trackrow:hover { background: ${T.surface2}; }
    .trackrow:focus-visible { outline: none; box-shadow: inset 0 0 0 2px ${T.amber}; }

    .navtab { background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; }
    .navtab:hover { color: ${T.ink} !important; }

    .quietbtn { background: transparent; cursor: pointer; transition: border-color 0.15s ease-out, color 0.15s ease-out; }
    .quietbtn:hover { border-color: ${T.muted} !important; color: ${T.ink} !important; }

    input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; }
    input[type=range]::-webkit-slider-runnable-track { height: 3px; background: transparent; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: ${T.ink};
      border: 2px solid ${T.bg}; box-shadow: 0 0 0 1px ${T.cyan}; cursor: pointer; margin-top: -6px; }
    input[type=range]::-moz-range-track { height: 3px; background: transparent; }
    input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 0; background: ${T.ink};
      border: 2px solid ${T.bg}; box-shadow: 0 0 0 1px ${T.cyan}; cursor: pointer; }
    input[type=range]:focus-visible { outline: none; }
    input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 2px ${T.amber}; }
    input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 2px ${T.amber}; }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: ${T.line}; }
    ::-webkit-scrollbar-track { background: transparent; }

    @media (prefers-reduced-motion: reduce) {
      * { animation-duration: 0.001s !important; animation-iteration-count: 1 !important; transition: none !important; }
    }
  `}</style>
);

export function Eyebrow({ children, color }) {
  return (
    <span style={{ fontFamily: T.display, fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: color || T.muted }}>
      {children}
    </span>
  );
}

/* Corner-bracketed panel: the register's structural motif (house-style.md). */
export function Panel({ title, tag, tagColor, children, style, pad = 14 }) {
  const tick = (pos) => ({
    position: "absolute", width: 10, height: 10,
    borderColor: T.faint, borderStyle: "solid", borderWidth: 0, ...pos,
  });
  return (
    <div style={{ position: "relative", background: T.surface, border: `1px solid ${T.lineSoft}`, display: "flex", flexDirection: "column", minHeight: 0, ...style }}>
      <span style={tick({ top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 })} />
      <span style={tick({ top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 })} />
      <span style={tick({ bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 })} />
      <span style={tick({ bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 })} />
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${T.lineSoft}` }}>
          <Eyebrow>{title}</Eyebrow>
          {tag && <span style={{ fontFamily: T.mono, fontSize: 10, color: tagColor || T.muted, letterSpacing: "0.08em" }}>{tag}</span>}
        </div>
      )}
      <div style={{ padding: pad, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

export function Readout({ label, value, unit, color }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", color: T.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 500, color: color || T.ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: T.muted, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

/* Decorative trend line; the current value is always rendered as text
   beside it, so the SVG itself stays aria-hidden. */
export function Sparkline({ data, color = T.cyan, w = 110, h = 28 }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" opacity="0.9" />
    </svg>
  );
}

export function GaugeArc({ label, value, color = T.cyan }) {
  const r = 26;
  const c = Math.PI * r;
  const filled = (value / 100) * c;
  return (
    <div style={{ textAlign: "center" }} role="img" aria-label={`${label} ${Math.round(value)} percent`}>
      <svg width="72" height="44" aria-hidden="true">
        <path d={`M 8 40 A ${r} ${r} 0 0 1 64 40`} fill="none" stroke={T.line} strokeWidth="5" />
        <path d={`M 8 40 A ${r} ${r} 0 0 1 64 40`} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${filled} ${c}`} style={{ transition: "stroke-dasharray 0.6s ease-out" }} />
        <text x="36" y="38" textAnchor="middle" fill={T.ink} fontFamily={T.mono} fontSize="12">{Math.round(value)}</text>
      </svg>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", color: T.muted }}>{label}</div>
    </div>
  );
}

export function TrackRow({ id, kind, range, threat, selected, onClick }) {
  const threatColor = threat === "HOSTILE" ? T.red : threat === "UNKNOWN" ? T.amber : T.green;
  return (
    <button className="trackrow" onClick={onClick} aria-pressed={selected}
      style={{ display: "grid", gridTemplateColumns: "8px 1fr auto", gap: 10, alignItems: "center", width: "100%", textAlign: "left",
        padding: "8px 10px", background: selected ? T.surface2 : undefined,
        borderLeft: `2px solid ${selected ? T.amber : "transparent"}` }}>
      <span style={{ width: 6, height: 6, background: threatColor, transform: "rotate(45deg)" }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink, display: "block" }}>{id}</span>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>{kind}</span>
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, fontVariantNumeric: "tabular-nums" }}>{range}</span>
    </button>
  );
}

/* variant, not boolean soup (ui-library-contract.md § Component API contract);
   a disabled command states its why inline — disabledReason replaces the
   label while blocked, so the button teaches instead of dead-ending. */
export function CmdButton({ children, variant = "quiet", disabledReason, onClick, size = "md" }) {
  const disabled = Boolean(disabledReason);
  return (
    <button className={`cmd cmd--${variant}`} onClick={onClick} disabled={disabled}
      style={{ fontSize: size === "lg" ? 12 : 11, padding: size === "lg" ? "11px 16px" : "8px 14px" }}>
      {disabled ? disabledReason : children}
    </button>
  );
}

export function VerdictChip({ tone, children }) {
  const c = tone === "good" ? T.green : tone === "warn" ? T.amber : T.red;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 11, color: c, border: `1px solid ${c}`, padding: "3px 8px", background: T.bg }}>
      <span style={{ width: 6, height: 6, background: c, transform: "rotate(45deg)" }} />
      {children}
    </span>
  );
}

export function ImpactTag({ level }) {
  const map = { results: [T.amber, "AFFECTS RESULTS"], perf: [T.cyan, "AFFECTS SPEED"], cosmetic: [T.faint, "COSMETIC"] };
  const [c, label] = map[level];
  return <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.1em", color: c, border: `1px solid ${c}`, padding: "1px 6px", opacity: 0.9 }}>{label}</span>;
}

/* Field shell: label + plain-language teaching + control + consequence line
   + reset-to-recommended when off-default (design-craft.md § Self-teaching
   UI patterns 3/6; ui-library-contract.md § Self-teaching pattern components). */
export function Field({ id, label, help, impact, consequence, changed, flashed, onReset, children }) {
  return (
    <div id={id} style={{ padding: "14px 16px", borderBottom: `1px solid ${T.lineSoft}`, animation: flashed ? "flash 1.4s ease-out" : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.display, fontSize: 13, fontWeight: 600, color: T.ink }}>{label}</span>
        <ImpactTag level={impact} />
        {changed && (
          <button className="quietbtn" onClick={onReset}
            style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 10, color: T.muted, border: `1px solid ${T.line}`, padding: "2px 8px" }}>
            ↺ back to recommended
          </button>
        )}
      </div>
      <p style={{ fontFamily: T.body, fontSize: 12, lineHeight: 1.5, color: T.muted, margin: "0 0 10px" }}>{help}</p>
      {children}
      <div style={{ fontFamily: T.mono, fontSize: 11, color: T.cyan, marginTop: 8, animation: "riseIn .25s ease-out" }} key={consequence}>
        → {consequence}
      </div>
    </div>
  );
}

/* Slider with a shaded recommended band and a notch at the recommendation:
   out-of-band is a tradeoff, never an error (self-teaching pattern 2). */
export function BandSlider({ value, min, max, bandLo, bandHi, rec, unit, onChange, ariaLabel }) {
  const pct = (v) => ((v - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{ position: "relative", height: 22 }}>
        <div style={{ position: "absolute", top: 9, left: 0, right: 0, height: 3, background: T.line }} />
        <div style={{ position: "absolute", top: 7, left: `${pct(bandLo)}%`, width: `${pct(bandHi) - pct(bandLo)}%`, height: 7, background: "rgba(123,216,143,0.22)", border: `1px solid rgba(123,216,143,0.5)` }} />
        <div style={{ position: "absolute", top: 3, left: `${pct(rec)}%`, width: 1, height: 15, background: T.green }} />
        <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} aria-label={ariaLabel} style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.mono, fontSize: 10, color: T.faint, marginTop: 2 }}>
        <span>{min}{unit}</span>
        <span style={{ color: T.green }}>rec {rec}{unit} · green = safe band</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

/* Choice cards with layman when-to-use lines, not jargon labels
   (self-teaching pattern 8). */
export function ChoiceCards({ options, value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
      {options.map((o) => (
        <button key={o.id} className="quietbtn" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          style={{ textAlign: "left", padding: "9px 11px", background: value === o.id ? T.surface2 : "transparent", border: `1px solid ${value === o.id ? T.cyan : T.line}`, color: T.ink }}>
          <div style={{ fontFamily: T.display, fontSize: 12, fontWeight: 600, color: value === o.id ? T.cyan : T.ink }}>{o.name}</div>
          <div style={{ fontFamily: T.body, fontSize: 11, color: T.muted, marginTop: 3, lineHeight: 1.4 }}>{o.desc}</div>
        </button>
      ))}
    </div>
  );
}
