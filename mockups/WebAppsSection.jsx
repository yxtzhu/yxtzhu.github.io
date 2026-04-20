import React, { useState, useEffect, useRef } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Web Apps section — mockup variants
   Drop into any React sandbox (Vite, CodeSandbox, etc.)
   Renders all five ideas stacked so you can scroll and compare.
   Palette + typography mirror index.html.
   ────────────────────────────────────────────────────────────────────────── */

const palette = {
  ink: "#e8e5e0",
  inkSoft: "#b8b5b0",
  inkFaint: "#7a7a72",
  inkGhost: "#3a3a38",
  paper: "#1a1a18",
  accent: "#7a8b7a",
};

const serif = "'Cormorant Garamond', serif";
const sans = "'Inter', sans-serif";

const apps = [
  {
    id: "coin-flip",
    name: "Coin Flip",
    tagline: "a moment of chance",
    blurb: "When two options feel equal.",
    path: "/apps/coin-flip/",
    hue: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)",
  },
  {
    id: "goal-tracker",
    name: "Goal Tracker",
    tagline: "the long arc",
    blurb: "Small commitments, kept.",
    path: "/apps/goal-tracker/",
    hue: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  },
  {
    id: "life-perspective",
    name: "Life Perspective",
    tagline: "weeks in a grid",
    blurb: "A quiet memento mori.",
    path: "/apps/life-perspective/",
    hue: "linear-gradient(135deg, #232526 0%, #414345 100%)",
  },
  {
    id: "meeting-cost-calculator",
    name: "Meeting Cost",
    tagline: "time, priced honestly",
    blurb: "Seconds stacked into dollars.",
    path: "/apps/meeting-cost-calculator/",
    hue: "linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%)",
  },
  {
    id: "pottery-inspiration",
    name: "Pottery Inspiration",
    tagline: "form before the wheel",
    blurb: "Shapes to throw next.",
    path: "/apps/pottery-inspiration/",
    hue: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  },
];

/* ─── Shared scaffolding ─────────────────────────────────────────────── */

const SectionShell = ({ label, title, children }) => (
  <section
    style={{
      minHeight: "100vh",
      padding: "120px 48px",
      borderBottom: `1px solid ${palette.inkGhost}`,
      background: palette.paper,
      color: palette.ink,
      fontFamily: sans,
    }}
  >
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <p
        style={{
          fontSize: 11,
          letterSpacing: 4,
          color: palette.inkGhost,
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        {label}
      </p>
      <h2
        style={{
          fontFamily: serif,
          fontWeight: 300,
          fontSize: "clamp(36px, 5vw, 64px)",
          textAlign: "center",
          letterSpacing: -1,
          marginBottom: 80,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  </section>
);

/* ─── Variant 1 · Quiet serif list ───────────────────────────────────── */

const V1_QuietList = () => {
  const [hover, setHover] = useState(null);
  return (
    <SectionShell label="VARIANT · 01" title="Web Apps">
      <ul style={{ listStyle: "none", maxWidth: 620, margin: "0 auto" }}>
        {apps.map((a, i) => (
          <li
            key={a.id}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              padding: "28px 0",
              borderBottom: `1px solid ${palette.inkGhost}`,
              display: "flex",
              alignItems: "baseline",
              gap: 24,
              cursor: "pointer",
              transition: "color 0.5s",
              color: hover === i ? palette.accent : palette.ink,
            }}
          >
            <span style={{ fontSize: 11, color: palette.inkGhost, width: 32 }}>
              {String(i + 1).padStart(3, "0")}
            </span>
            <span
              style={{
                fontFamily: serif,
                fontSize: 32,
                fontWeight: 300,
                flex: 1,
              }}
            >
              {a.name}
            </span>
            <span
              style={{
                fontFamily: serif,
                fontStyle: "italic",
                fontSize: 15,
                color: palette.inkFaint,
              }}
            >
              — {a.tagline}
            </span>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
};

/* ─── Variant 2 · Numbered index (table of contents) ─────────────────── */

const V2_NumberedIndex = () => (
  <SectionShell label="VARIANT · 02" title="Web Apps">
    <div
      style={{
        maxWidth: 520,
        margin: "0 auto",
        textAlign: "center",
        fontFamily: serif,
      }}
    >
      {apps.map((a, i) => (
        <div
          key={a.id}
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr",
            alignItems: "baseline",
            gap: 32,
            padding: "18px 0",
          }}
        >
          <span
            style={{
              fontFamily: sans,
              fontSize: 11,
              letterSpacing: 3,
              color: palette.inkGhost,
              textAlign: "right",
            }}
          >
            {String(i + 1).padStart(3, "0")}
          </span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 28, fontWeight: 300, color: palette.ink }}>
              {a.name}
            </div>
            <div
              style={{
                fontFamily: sans,
                fontSize: 12,
                letterSpacing: 1,
                color: palette.inkFaint,
                marginTop: 4,
              }}
            >
              {a.tagline}
            </div>
          </div>
        </div>
      ))}
    </div>
  </SectionShell>
);

/* ─── Variant 3 · Kiln-mirror horizontal gallery ─────────────────────── */

const V3_HorizontalGallery = () => {
  const [idx, setIdx] = useState(0);
  const go = (n) => setIdx(Math.max(0, Math.min(apps.length - 1, n)));
  const a = apps[idx];
  return (
    <SectionShell label="VARIANT · 03" title="Web Apps">
      <div style={{ position: "relative" }}>
        <div
          style={{
            height: "58vh",
            minHeight: 380,
            borderRadius: 4,
            background: a.hue,
            display: "flex",
            alignItems: "flex-end",
            padding: 48,
            transition: "background 0.8s ease",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* faux screenshot frame */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -55%)",
              width: 220,
              height: 440,
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 32,
              boxShadow: "0 40px 80px rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.7)",
              fontFamily: serif,
              fontSize: 20,
            }}
          >
            {a.name}
          </div>
          <div
            style={{
              position: "relative",
              zIndex: 1,
              background:
                "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
              width: "100%",
              padding: "40px 0 0",
            }}
          >
            <div
              style={{
                fontFamily: serif,
                fontSize: 32,
                color: "#fff",
                fontWeight: 400,
              }}
            >
              {a.name}
            </div>
            <div
              style={{
                fontSize: 12,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.6)",
                marginTop: 4,
              }}
            >
              {a.tagline}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 20,
            color: palette.inkFaint,
            fontSize: 12,
            letterSpacing: 1.5,
          }}
        >
          <span>
            {String(idx + 1).padStart(2, "0")} / {String(apps.length).padStart(2, "0")}
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => go(idx - 1)} style={navBtn}>
              ←
            </button>
            <button onClick={() => go(idx + 1)} style={navBtn}>
              →
            </button>
          </div>
        </div>

        <div
          style={{
            height: 1,
            background: palette.inkGhost,
            marginTop: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${((idx + 1) / apps.length) * 100}%`,
              background: palette.accent,
              transition: "width 0.4s",
            }}
          />
        </div>
      </div>
    </SectionShell>
  );
};

const navBtn = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  border: `1px solid ${palette.inkGhost}`,
  background: "transparent",
  color: palette.inkSoft,
  cursor: "pointer",
  fontSize: 14,
};

/* ─── Variant 4 · Device mockup carousel ─────────────────────────────── */

const V4_DeviceCarousel = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % apps.length), 3200);
    return () => clearInterval(t);
  }, []);
  const a = apps[idx];
  return (
    <SectionShell label="VARIANT · 04" title="Web Apps">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 80,
          alignItems: "center",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        {/* iPhone silhouette */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: 240,
              height: 500,
              borderRadius: 42,
              border: `1px solid ${palette.inkGhost}`,
              background: "#111",
              padding: 10,
              boxShadow: "0 30px 60px rgba(0,0,0,0.6)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 18,
                left: "50%",
                transform: "translateX(-50%)",
                width: 80,
                height: 22,
                borderRadius: 20,
                background: "#000",
                zIndex: 2,
              }}
            />
            <div
              key={a.id}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 32,
                background: a.hue,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontFamily: serif,
                fontSize: 24,
                fontWeight: 400,
                animation: "fade 0.6s ease",
              }}
            >
              {a.name}
            </div>
          </div>
        </div>

        {/* Caption list */}
        <ul style={{ listStyle: "none" }}>
          {apps.map((app, i) => (
            <li
              key={app.id}
              onClick={() => setIdx(i)}
              style={{
                padding: "14px 0",
                cursor: "pointer",
                color: i === idx ? palette.ink : palette.inkFaint,
                borderLeft:
                  i === idx
                    ? `1px solid ${palette.accent}`
                    : "1px solid transparent",
                paddingLeft: 20,
                transition: "all 0.4s",
              }}
            >
              <div style={{ fontFamily: serif, fontSize: 22 }}>{app.name}</div>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: 1,
                  color: palette.inkFaint,
                  marginTop: 2,
                }}
              >
                {app.blurb}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
};

/* ─── Variant 5 · Terminal-style typed listing ───────────────────────── */

const V5_TerminalList = () => {
  const [typed, setTyped] = useState("");
  const full = "ls ~/web-apps";
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i++;
      setTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(t);
    }, 80);
    return () => clearInterval(t);
  }, []);
  return (
    <SectionShell label="VARIANT · 05" title="Web Apps">
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          fontFamily: "'SF Mono', ui-monospace, monospace",
          fontSize: 14,
          color: palette.inkSoft,
          background: "transparent",
          padding: 32,
          border: `1px solid ${palette.inkGhost}`,
          borderRadius: 2,
        }}
      >
        <div style={{ color: palette.inkFaint, marginBottom: 12 }}>
          <span style={{ color: palette.accent }}>tingting</span>
          <span> ~ </span>
          <span style={{ color: palette.ink }}>$ {typed}</span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 14,
              background: palette.inkSoft,
              marginLeft: 4,
              verticalAlign: "middle",
              animation: "blink 0.85s step-end infinite",
            }}
          />
        </div>
        {typed === full &&
          apps.map((a, i) => (
            <div
              key={a.id}
              style={{
                padding: "4px 0",
                opacity: 0,
                animation: `rowIn 0.5s ease ${i * 0.12}s forwards`,
              }}
            >
              <span style={{ color: palette.accent }}>{a.id.padEnd(28)}</span>
              <span style={{ color: palette.inkFaint }}>{a.tagline}</span>
            </div>
          ))}
      </div>
    </SectionShell>
  );
};

/* ─── Root ───────────────────────────────────────────────────────────── */

export default function WebAppsSection() {
  return (
    <div style={{ background: palette.paper }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Inter:wght@300;400&display=swap');
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes rowIn { to { opacity: 1; transform: translateY(0); } }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        button:hover { border-color: ${palette.accent} !important; color: ${palette.accent} !important; }
      `}</style>
      <V1_QuietList />
      <V2_NumberedIndex />
      <V3_HorizontalGallery />
      <V4_DeviceCarousel />
      <V5_TerminalList />
    </div>
  );
}
