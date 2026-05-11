// Source for app.js. Recompile after edits:
//   npx esbuild app.jsx --loader:.jsx=jsx --jsx=transform --minify --target=es2020 --outfile=app.js
const { useState, useRef, useEffect } = React;

const DEFAULTS = { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 };
const STORAGE = {
  key: "dietTrackerApiKey",
  targets: "dietTrackerTargets",
  entries: "dietTrackerEntries",
  health: "dietTrackerHealth",       // { score, dead, goodDayStreak, lastProcessedDate }
};
const todayKey = () => new Date().toISOString().slice(0, 10);
const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// Health engine
const HEALTH_DEFAULTS = { score: 100, dead: false, goodDayStreak: 0, lastProcessedDate: null };

const getDayDelta = (pct, currentHealth) => {
  if (pct >= 0.85 && pct <= 1.05) return currentHealth < 40 ? 4 : 8;
  if (pct >= 0.70 && pct < 0.85)  return 3;
  if (pct >= 0.50 && pct < 0.70)  return 0;
  if (pct > 1.05 && pct <= 1.20)  return -10;
  if (pct > 1.20)                  return -20;
  if (pct < 0.50 && pct > 0)       return -5;
  return 0;
};

// Returns updated health state after processing any unprocessed past days
const processPastDays = (healthState, allEntries, targets) => {
  let { score, dead, goodDayStreak, lastProcessedDate } = healthState;
  const today = todayKey();

  const dates = [];
  const cursor = new Date(lastProcessedDate || today);
  if (lastProcessedDate) cursor.setDate(cursor.getDate() + 1);
  const todayDate = new Date(today);

  while (cursor < todayDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const date of dates) {
    const entries = allEntries[date] || [];
    const cal = entries.reduce((a, e) => a + (e.calories || 0), 0);
    const pct = cal / (targets.calories || 1);

    if (dead) {
      const isGood = pct >= 0.85 && pct <= 1.05;
      goodDayStreak = isGood ? goodDayStreak + 1 : 0;
      if (goodDayStreak >= 5) {
        dead = false;
        score = 30;
        goodDayStreak = 0;
      }
    } else {
      const delta = getDayDelta(pct, score);
      score = Math.max(0, Math.min(100, score + delta));
      if (score === 0) { dead = true; goodDayStreak = 0; }
      const isGood = pct >= 0.85 && pct <= 1.05;
      goodDayStreak = isGood ? goodDayStreak + 1 : 0;
    }
  }

  return { score, dead, goodDayStreak, lastProcessedDate: dates.length > 0 ? dates[dates.length - 1] : lastProcessedDate };
};

// Compute today's live (intra-day) delta without committing it
const getLiveHealth = (baseHealth, todayPct) => {
  if (baseHealth.dead) return baseHealth;
  const delta = getDayDelta(todayPct, baseHealth.score);
  const now = new Date();
  const dayFraction = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const partialDelta = delta * dayFraction;
  const liveScore = Math.max(0, Math.min(100, baseHealth.score + partialDelta));
  return { ...baseHealth, score: liveScore };
};

const getHealthState = (health, streak) => {
  if (health.dead) return "dead";
  const s = health.score;
  if (s >= 80) return streak >= 3 ? "celebrating" : "happy";
  if (s >= 55) return "neutral";
  if (s >= 30) return "sad";
  if (s >= 10) return "sick";
  return "verysick";
};

// Pixel sprites
const PIXELS = {
  happy: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,0,1,1,0,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,0,0,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,0,0,1,1,0],
  ],
  neutral: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,0,1,1,0,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,0,0,1,1,0],
  ],
  sad: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,0,1,1,0,1,1],
    [1,0,1,1,1,1,0,1],
    [0,1,0,1,1,0,1,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,0,0,1,1,0],
  ],
  sick: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,2,1,1,1,2,1,1],
    [1,1,2,1,1,2,1,1],
    [0,1,1,2,2,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  verysick: [
    [0,0,0,1,1,0,0,0],
    [2,0,1,0,0,1,0,2],
    [0,1,1,1,1,1,1,0],
    [1,2,1,1,1,2,1,1],
    [1,1,2,1,1,2,1,1],
    [0,1,0,2,2,0,1,0],
    [2,0,1,1,1,1,0,2],
    [0,0,0,1,1,0,0,0],
  ],
  celebrating: [
    [3,0,0,1,1,0,0,3],
    [0,3,1,0,0,1,3,0],
    [0,1,1,1,1,1,1,0],
    [1,1,0,1,1,0,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,0,0,1,1,0],
    [3,0,1,1,1,1,0,3],
    [0,3,1,0,0,1,3,0],
  ],
  dead: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,2,1,1,1,2,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
  ],
};

const PALETTES = {
  happy:       { 1: "#f0c070", 2: "#e07a5f", 3: "#ffe090" },
  neutral:     { 1: "#c8a882", 2: "#e07a5f", 3: "#f0e8df" },
  sad:         { 1: "#8fa8c8", 2: "#e07a5f", 3: "#f0e8df" },
  sick:        { 1: "#a8c896", 2: "#e07a5f", 3: "#f0e8df" },
  verysick:    { 1: "#7eb8a4", 2: "#c84040", 3: "#f0e8df" },
  celebrating: { 1: "#f0c070", 2: "#e07a5f", 3: "#ffe090" },
  dead:        { 1: "#6a6a6a", 2: "#c84040", 3: "#f0e8df" },
};

const PixelSprite = ({ state, px = 7 }) => {
  const grid = PIXELS[state] || PIXELS.neutral;
  const pal = PALETTES[state] || PALETTES.neutral;
  return (
    <div style={{ display: "inline-block" }}>
      {grid.map((row, ri) => (
        <div key={ri} style={{ display: "flex" }}>
          {row.map((cell, ci) => (
            <div key={ci} style={{ width: px, height: px, background: cell ? (pal[cell] || "transparent") : "transparent" }} />
          ))}
        </div>
      ))}
    </div>
  );
};

// Tamagotchi
const STATE_META = {
  happy:       { msg: "Feeling great!",              glow: "rgba(240,192,112,0.12)", screenBg: "#0b1a06" },
  celebrating: { msg: "On a streak! 🔥",             glow: "rgba(240,192,112,0.18)", screenBg: "#0b1a06" },
  neutral:     { msg: "Doing okay.",                 glow: "rgba(200,149,108,0.08)", screenBg: "#0b1208" },
  sad:         { msg: "Not feeling my best…",        glow: "rgba(143,168,200,0.10)", screenBg: "#080d14" },
  sick:        { msg: "I don't feel well…",          glow: "rgba(126,184,164,0.10)", screenBg: "#060f0b" },
  verysick:    { msg: "Please help me… 🤢",          glow: "rgba(200,64,64,0.12)",   screenBg: "#0f0606" },
  dead:        { msg: "I'm gone…",                   glow: "rgba(80,80,80,0.10)",    screenBg: "#080808" },
};

const Tamagotchi = ({ health, liveHealth, streak }) => {
  const state = getHealthState(liveHealth, streak);
  const meta = STATE_META[state] || STATE_META.neutral;
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 700); return () => clearInterval(t); }, []);

  const bobY = (state === "happy" || state === "celebrating") ? Math.sin(tick * 0.9) * 4 : 0;
  const shakeX = (state === "sick" || state === "verysick") ? (tick % 2 === 0 ? -2 : 2) : 0;
  const sway = state === "dead" ? Math.sin(tick * 0.3) * 1 : 0;
  const altFrame = tick % 4 < 2;
  const displayState = state === "celebrating" ? (altFrame ? "celebrating" : "happy") : state;

  const healthColor = liveHealth.score >= 80 ? "#f0c070" : liveHealth.score >= 55 ? "#c8956c" : liveHealth.score >= 30 ? "#8fa8c8" : "#e07a5f";
  const daysToRevive = health.dead ? Math.max(0, 5 - (health.goodDayStreak || 0)) : null;

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          background: meta.screenBg,
          border: "2px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          width: 88, height: 88,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          flexShrink: 0, position: "relative", overflow: "hidden",
          boxShadow: `inset 0 0 24px ${meta.glow}`,
        }}>
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.12) 3px,rgba(0,0,0,0.12) 4px)", pointerEvents: "none" }} />
          {state === "celebrating" && (
            <>
              <span style={{ position: "absolute", top: 4, left: 6,  fontSize: 8, color: "#f0c070", opacity: altFrame ? 1 : 0.2 }}>✦</span>
              <span style={{ position: "absolute", top: 4, right: 6, fontSize: 8, color: "#f0c070", opacity: altFrame ? 0.2 : 1 }}>✦</span>
            </>
          )}
          {state === "dead" && (
            <div style={{ position: "absolute", top: 6, right: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: "#444", letterSpacing: "0.05em" }}>
              {altFrame ? "- - -" : "· · ·"}
            </div>
          )}
          <div style={{ transform: `translateY(${bobY + sway}px) translateX(${shakeX}px)`, transition: "transform 0.12s ease" }}>
            <PixelSprite state={displayState} px={7} />
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#9a8f84", marginBottom: 10 }}>
            {meta.msg}
          </div>

          {!health.dead && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b6059" }}>Health</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: healthColor }}>{Math.round(liveHealth.score)}</span>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${liveHealth.score}%`, background: healthColor, borderRadius: 3, transition: "width 0.8s ease, background 0.5s ease" }} />
              </div>
            </div>
          )}

          {health.dead && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#6b6059", marginBottom: 6 }}>
                Eat well for <span style={{ color: "#e07a5f", fontWeight: 600 }}>{daysToRevive}</span> more day{daysToRevive !== 1 ? "s" : ""} to revive
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${((health.goodDayStreak || 0) / 5) * 100}%`, background: "#7eb8a4", borderRadius: 3, transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 3 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: "#6b6059" }}>{health.goodDayStreak || 0}/5 good days</span>
              </div>
            </div>
          )}

          {streak >= 2 && !health.dead && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#c8956c" }}>🔥 {streak}-day streak</div>
          )}
        </div>
      </div>
    </div>
  );
};

// Macro bar
const MacroBar = ({ label, value, target, color }) => {
  const pct = Math.min((value / (target || 1)) * 100, 100);
  const over = value > target;
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9a8f84" }}>{label}</span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: over ? "#e07a5f" : "#9a8f84" }}>{Math.round(value)}<span style={{ opacity: 0.4 }}>/{target}g</span></span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: over ? "#e07a5f" : color, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
};

// Calorie ring
const CalorieRing = ({ consumed, target }) => {
  const pct = Math.min(consumed / (target || 1), 1);
  const r = 44, circ = 2 * Math.PI * r;
  const over = consumed > target;
  return (
    <div style={{ position: "relative", width: 108, height: 108, flexShrink: 0 }}>
      <svg width="108" height="108" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="54" cy="54" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx="54" cy="54" r={r} fill="none" stroke={over ? "#e07a5f" : "#c8956c"} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: over ? "#e07a5f" : "#f0e8df", lineHeight: 1 }}>{Math.round(consumed)}</span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a8f84", marginTop: 3 }}>of {target}</span>
      </div>
    </div>
  );
};

// Log strip
const LogStrip = ({ entries }) => {
  if (!entries.length) return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#3d3530" }}>No entries yet today</span>
    </div>
  );
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b6059", marginBottom: 8 }}>Today's meals</div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {entries.map(e => (
          <div key={e.id} style={{ flexShrink: 0, textAlign: "center" }}>
            {e.image
              ? <img src={e.image} alt="" style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 8, display: "block" }} />
              : <div style={{ width: 50, height: 50, background: "rgba(255,255,255,0.05)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🍽</div>}
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 12, color: "#c8956c", marginTop: 3, lineHeight: 1 }}>{e.calories}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 8, color: "#6b6059" }}>kcal</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const portionLabel = (p) => {
  if (!p || Math.abs(p - 1) < 0.01) return null;
  const found = PORTION_OPTIONS.find(o => Math.abs(o.value - p) < 0.01);
  return found ? found.label : null;
};

// Entry card
const EntryCard = ({ entry, onDelete, onEdit }) => {
  const pLabel = portionLabel(entry.portion);
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px", display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
      {entry.image
        ? <img src={entry.image} alt="" style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
        : <div style={{ width: 50, height: 50, background: "rgba(255,255,255,0.05)", borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🍽</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 600, color: "#f0e8df" }}>
            {entry.calories}<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#9a8f84", marginLeft: 3 }}>kcal</span>
          </span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059" }}>{entry.time}</span>
        </div>
        {(entry.dish || pLabel) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, minWidth: 0 }}>
            {entry.dish && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#9a8f84", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.dish}</div>}
            {pLabel && <span style={{ flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: "0.05em", color: "#c8956c", background: "rgba(200,149,108,0.14)", padding: "2px 6px", borderRadius: 4 }}>{pLabel} portion</span>}
          </div>
        )}
        {expanded && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
              {[["P", entry.protein, "#7eb8a4"],["C", entry.carbs, "#c8956c"],["F", entry.fat, "#d4a0b5"],["Fi", entry.fiber, "#8fa8c8"]].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: c, fontWeight: 500 }}>{v}g</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: "#6b6059", letterSpacing: "0.1em", textTransform: "uppercase" }}>{l}</div>
                </div>
              ))}
            </div>
            {entry.notes && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#6b6059", fontStyle: "italic", marginBottom: 8 }}>{entry.notes}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={e => { e.stopPropagation(); onEdit(entry); }} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#9a8f84", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Edit</button>
              <button onClick={e => { e.stopPropagation(); onDelete(entry.id); }} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: "1px solid rgba(224,122,95,0.3)", color: "#e07a5f", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Calendar view
const CalendarView = ({ allEntries, targets }) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleDateString([], { month: "long", year: "numeric" });

  const getDayStatus = (day) => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const es = allEntries[key] || [];
    if (!es.length) return null;
    const total = es.reduce((a, e) => a + (e.calories || 0), 0);
    const pct = total / (targets.calories || 1);
    if (pct >= 0.85 && pct <= 1.05) return "hit";
    if (pct > 1.05) return "over";
    return "under";
  };

  const isToday = (day) => new Date(year, month, day).toDateString() === today.toDateString();
  const statusColors = { hit: "#7eb8a4", over: "#e07a5f", under: "#c8956c" };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 34, height: 34, color: "#9a8f84", cursor: "pointer", fontSize: 18 }}>‹</button>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "#f0e8df" }}>{monthName}</span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 34, height: 34, color: "#9a8f84", cursor: "pointer", fontSize: 18 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 8 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: "#4a413a", letterSpacing: "0.08em" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const status = getDayStatus(day);
          const todayFlag = isToday(day);
          return (
            <div key={day} style={{
              aspectRatio: "1", borderRadius: 8,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: todayFlag ? "rgba(200,149,108,0.18)" : status ? `${statusColors[status]}1a` : "rgba(255,255,255,0.02)",
              border: `1px solid ${todayFlag ? "rgba(200,149,108,0.5)" : "transparent"}`,
            }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: todayFlag ? "#c8956c" : "#6b6059" }}>{day}</span>
              {status && <div style={{ width: 5, height: 5, borderRadius: "50%", background: statusColors[status], marginTop: 2 }} />}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 20, justifyContent: "center" }}>
        {[["hit","#7eb8a4","On target"],["over","#e07a5f","Over"],["under","#c8956c","Under"]].map(([s, c, l]) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Edit modal
const EditModal = ({ entry, onSave, onClose }) => {
  const [vals, setVals] = useState({ ...entry });
  const set = (k, v) => setVals(p => ({ ...p, [k]: Number(v) }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#1e1a17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 }}>
        <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "#f0e8df", margin: "0 0 18px" }}>Edit Entry</h3>
        {[["Calories","calories","kcal"],["Protein","protein","g"],["Carbs","carbs","g"],["Fat","fat","g"],["Fiber","fiber","g"]].map(([label, key, unit]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a8f84", marginBottom: 5 }}>{label} ({unit})</label>
            <input type="number" value={vals[key]} onChange={e => set(key, e.target.value)}
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#f0e8df", fontFamily: "'DM Sans', sans-serif", fontSize: 14, boxSizing: "border-box" }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={() => onSave(vals)} style={{ flex: 1, background: "#c8956c", border: "none", borderRadius: 8, padding: "10px", color: "#1e1a17", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontWeight: 600 }}>Save</button>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px", color: "#9a8f84", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// Settings panel
const SettingsPanel = ({ apiKey, setApiKey, targets, setTargets, onClose }) => {
  const [localKey, setLocalKey] = useState(apiKey);
  const [lt, setLt] = useState({ ...targets });
  const setT = (k, v) => setLt(p => ({ ...p, [k]: Number(v) }));
  const handleSave = () => { setApiKey(localKey); setTargets(lt); save(STORAGE.key, localKey); save(STORAGE.targets, lt); onClose(); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#1e1a17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px 16px 0 0", padding: 28, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#f0e8df", margin: 0 }}>Settings</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9a8f84", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a8f84", marginBottom: 6 }}>Gemini API Key</label>
          <input type="password" value={localKey} onChange={e => setLocalKey(e.target.value)} placeholder="AIza…"
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#f0e8df", fontFamily: "'DM Sans', sans-serif", fontSize: 13, boxSizing: "border-box" }} />
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059", marginTop: 5 }}>Free at aistudio.google.com — 1500 requests/day</p>
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a8f84", marginBottom: 10 }}>Daily Targets</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["Calories","calories","kcal"],["Protein","protein","g"],["Carbs","carbs","g"],["Fat","fat","g"],["Fiber","fiber","g"]].map(([label, key, unit]) => (
              <div key={key}>
                <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059", marginBottom: 4 }}>{label} ({unit})</label>
                <input type="number" value={lt[key]} onChange={e => setT(key, e.target.value)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", color: "#f0e8df", fontFamily: "'DM Sans', sans-serif", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
        </div>
        <button onClick={handleSave} style={{ width: "100%", background: "#c8956c", border: "none", borderRadius: 10, padding: "13px", color: "#1e1a17", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }}>Save Settings</button>
      </div>
    </div>
  );
};

const PORTION_OPTIONS = [
  { label: "¼", value: 0.25 },
  { label: "⅓", value: 1/3 },
  { label: "½", value: 0.5 },
  { label: "⅔", value: 2/3 },
  { label: "¾", value: 0.75 },
  { label: "1×", value: 1 },
];
const MACRO_KEYS = ["calories", "protein", "carbs", "fat", "fiber"];
const scaleMacros = (base, p) => MACRO_KEYS.reduce((a, k) => (a[k] = Math.round((base[k] || 0) * p), a), {});

// Analyze modal
const AnalyzeModal = ({ image, apiKey, onLog, onClose }) => {
  const [status, setStatus] = useState("analyzing");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [edited, setEdited] = useState(null);
  const [portion, setPortion] = useState(1);

  const analyze = async () => {
    setStatus("analyzing"); setError("");
    if (!apiKey) { setError("No API key. Open ⚙ Settings to add your Gemini key."); setStatus("error"); return; }
    try {
      const base64 = image.split(",")[1];
      const mimeType = image.split(";")[0].split(":")[1];
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: 'Analyze this food image. Return ONLY a JSON object, no markdown, no backticks:\n{"dish":"name","description":"one sentence","confidence":"high|medium|low","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"notes":"caveats"}' },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ]}],
          generationConfig: { temperature: 0.1 }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      let text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/```json|```/g, "").trim();
      const p = JSON.parse(text);
      const r = { dish: p.dish || "Unknown", description: p.description || "", confidence: p.confidence || "medium", calories: Math.round(p.calories || 0), protein: Math.round(p.protein_g || 0), carbs: Math.round(p.carbs_g || 0), fat: Math.round(p.fat_g || 0), fiber: Math.round(p.fiber_g || 0), notes: p.notes || "" };
      setResult(r); setEdited(r); setPortion(1); setStatus("done");
    } catch (e) { setError(e.message || "Analysis failed."); setStatus("error"); }
  };

  useEffect(() => { analyze(); }, []);
  const setE = (k, v) => setEdited(p => ({ ...p, [k]: Number(v) }));
  const cc = { high: "#7eb8a4", medium: "#c8956c", low: "#e07a5f" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#1e1a17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px 16px 0 0", padding: 24, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 14, marginBottom: 20, alignItems: "flex-start" }}>
          <img src={image} alt="" style={{ width: 76, height: 76, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            {status === "analyzing" && (<>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#f0e8df", marginBottom: 6 }}>Analyzing…</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#6b6059", marginBottom: 12 }}>Estimating nutritional content</div>
              <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: "40%", background: "#c8956c", borderRadius: 2, animation: "shimmer 1.4s ease-in-out infinite" }} />
              </div>
            </>)}
            {status === "error" && (<>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#e07a5f", marginBottom: 6 }}>Error</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#9a8f84" }}>{error}</div>
            </>)}
            {status === "done" && result && (<>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#f0e8df", marginBottom: 2 }}>{result.dish}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#9a8f84", marginBottom: 8 }}>{result.description}</div>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: cc[result.confidence], background: `${cc[result.confidence]}22`, padding: "3px 8px", borderRadius: 4 }}>{result.confidence} confidence</span>
            </>)}
          </div>
        </div>
        {status === "done" && edited && (<>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a8f84", marginBottom: 10 }}>Portion eaten</div>
            <div style={{ display: "flex", gap: 6 }}>
              {PORTION_OPTIONS.map(({ label, value }) => {
                const active = Math.abs(portion - value) < 0.01;
                return (
                  <button key={label} onClick={() => { setPortion(value); setEdited({ ...edited, ...scaleMacros(result, value) }); }}
                    style={{
                      flex: 1,
                      background: active ? "rgba(200,149,108,0.18)" : "rgba(255,255,255,0.04)",
                      border: active ? "1px solid rgba(200,149,108,0.45)" : "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8, padding: "9px 0", cursor: "pointer",
                      color: active ? "#c8956c" : "#9a8f84",
                      fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: active ? 600 : 400,
                      transition: "all 0.15s",
                    }}>{label}</button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a8f84", marginBottom: 10 }}>Adjust if needed</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["Calories","calories","kcal"],["Protein","protein","g"],["Carbs","carbs","g"],["Fat","fat","g"],["Fiber","fiber","g"]].map(([label, key, unit]) => (
                <div key={key} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: "#6b6059", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                    <input type="number" value={edited[key]} onChange={e => setE(key, e.target.value)}
                      style={{ width: "100%", background: "transparent", border: "none", color: "#f0e8df", fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, padding: 0, outline: "none" }} />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059", flexShrink: 0 }}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {result.notes && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#6b6059", fontStyle: "italic", marginBottom: 14, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>{result.notes}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onLog({ ...edited, portion })} style={{ flex: 1, background: "#c8956c", border: "none", borderRadius: 10, padding: "13px", color: "#1e1a17", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }}>Log Entry</button>
            <button onClick={onClose} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "13px", color: "#9a8f84", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>Discard</button>
          </div>
        </>)}
        {status === "error" && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={analyze} style={{ flex: 1, background: "#c8956c", border: "none", borderRadius: 10, padding: "13px", color: "#1e1a17", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }}>Retry</button>
            <button onClick={onClose} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "13px", color: "#9a8f84", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
          </div>
        )}
      </div>
      <style>{`@keyframes shimmer{0%{transform:translateX(-200%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );
};

// App
function App() {
  const [apiKey, setApiKey] = useState(() => load(STORAGE.key, ""));
  const [targets, setTargets] = useState(() => load(STORAGE.targets, DEFAULTS));
  const [allEntries, setAllEntries] = useState(() => load(STORAGE.entries, {}));
  const [rawHealth, setRawHealth] = useState(() => load(STORAGE.health, HEALTH_DEFAULTS));
  const [tab, setTab] = useState("today");
  const [showSettings, setShowSettings] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const fileRef = useRef();

  const processedHealth = processPastDays(rawHealth, allEntries, targets);

  const entries = allEntries[todayKey()] || [];
  const totals = entries.reduce((acc, e) => ({
    calories: acc.calories + (e.calories || 0),
    protein:  acc.protein  + (e.protein  || 0),
    carbs:    acc.carbs    + (e.carbs    || 0),
    fat:      acc.fat      + (e.fat      || 0),
    fiber:    acc.fiber    + (e.fiber    || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

  const todayPct = totals.calories / (targets.calories || 1);
  const liveHealth = getLiveHealth(processedHealth, todayPct);

  useEffect(() => {
    if (JSON.stringify(processedHealth) !== JSON.stringify(rawHealth)) {
      setRawHealth(processedHealth);
      save(STORAGE.health, processedHealth);
    }
  }, [JSON.stringify(processedHealth)]);

  const streak = (() => {
    let s = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = d.toISOString().slice(0, 10);
      const es = allEntries[key] || [];
      const cal = es.reduce((a, e) => a + (e.calories || 0), 0);
      const pct = cal / (targets.calories || 1);
      if (pct >= 0.85 && pct <= 1.05) { s++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return s;
  })();

  const saveEntries = (updated) => {
    const next = { ...allEntries, [todayKey()]: updated };
    setAllEntries(next);
    save(STORAGE.entries, next);
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setPendingImage(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleLog = (data) => {
    const entry = { id: Date.now(), image: pendingImage, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), ...data };
    saveEntries([entry, ...entries]);
    setPendingImage(null);
  };

  const handleDelete = (id) => saveEntries(entries.filter(e => e.id !== id));
  const handleSaveEdit = (updated) => { saveEntries(entries.map(e => e.id === updated.id ? { ...e, ...updated } : e)); setEditingEntry(null); };
  const remaining = targets.calories - totals.calories;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#181411",
      color: "#f0e8df",
      maxWidth: 480,
      margin: "0 auto",
      paddingTop: "var(--safe-top)",
      paddingLeft: "var(--safe-left)",
      paddingRight: "var(--safe-right)",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@300;400;600&display=swap" rel="stylesheet" />

      <div style={{ padding: "22px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 600, color: "#f0e8df", lineHeight: 1 }}>{tab === "today" ? "Today" : "History"}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}>
            {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9a8f84", fontSize: 16 }}>⚙</button>
      </div>

      <div style={{ display: "flex", gap: 2, padding: "14px 20px 0" }}>
        {[["today","Today"],["calendar","Calendar"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: tab === id ? "rgba(200,149,108,0.18)" : "transparent",
            color: tab === id ? "#c8956c" : "#4a413a",
            transition: "all 0.2s"
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "14px 20px", paddingBottom: `calc(var(--safe-bottom) + 120px)` }}>
        {tab === "today" && (<>
          <Tamagotchi health={processedHealth} liveHealth={liveHealth} streak={streak} />
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
              <CalorieRing consumed={totals.calories} target={targets.calories} />
              <div style={{ flex: 1 }}>
                <MacroBar label="Protein" value={totals.protein} target={targets.protein} color="#7eb8a4" />
                <MacroBar label="Carbs"   value={totals.carbs}   target={targets.carbs}   color="#c8956c" />
                <MacroBar label="Fat"     value={totals.fat}     target={targets.fat}     color="#d4a0b5" />
                <MacroBar label="Fiber"   value={totals.fiber}   target={targets.fiber}   color="#8fa8c8" />
              </div>
            </div>
            <div style={{ textAlign: "center", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: remaining >= 0 ? "#9a8f84" : "#e07a5f" }}>
                {remaining >= 0 ? `${remaining} kcal remaining` : `${Math.abs(remaining)} kcal over target`}
              </span>
            </div>
          </div>
          <LogStrip entries={entries} />
          {entries.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entries.map(entry => <EntryCard key={entry.id} entry={entry} onDelete={handleDelete} onEdit={setEditingEntry} />)}
            </div>
          )}
        </>)}
        {tab === "calendar" && <CalendarView allEntries={allEntries} targets={targets} />}
      </div>

      {tab === "today" && (
        <div style={{ position: "fixed", bottom: `calc(var(--safe-bottom) + 24px)`, left: "50%", transform: "translateX(-50%)", zIndex: 100 }}>
          <button onClick={() => fileRef.current?.click()} style={{
            width: 58, height: 58, borderRadius: "50%",
            background: "linear-gradient(135deg, #c8956c, #a8703a)",
            border: "none", cursor: "pointer",
            boxShadow: "0 4px 24px rgba(200,149,108,0.5)",
            color: "#1e1a17", fontSize: 30, fontWeight: 300, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>+</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      )}

      {pendingImage  && <AnalyzeModal image={pendingImage} apiKey={apiKey} onLog={handleLog} onClose={() => setPendingImage(null)} />}
      {editingEntry  && <EditModal entry={editingEntry} onSave={handleSaveEdit} onClose={() => setEditingEntry(null)} />}
      {showSettings  && <SettingsPanel apiKey={apiKey} setApiKey={setApiKey} targets={targets} setTargets={setTargets} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
