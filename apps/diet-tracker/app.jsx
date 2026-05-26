// Source for app.js. Recompile after edits:
//   npx esbuild app.jsx --loader:.jsx=jsx --jsx=transform --minify --target=es2020 --outfile=app.js
const { useState, useRef, useEffect } = React;

const DEFAULTS = { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 };
const STORAGE = {
  key: "dietTrackerApiKey",
  targets: "dietTrackerTargets",
  entries: "dietTrackerEntries",
  health: "dietTrackerHealth",       // { score, dead, goodDayStreak, lastProcessedDate }
  // Legacy localStorage keys for the sentinel + diag log. Sentinel/log writes
  // moved to IndexedDB because localStorage is the storage class iOS evicts
  // under pressure — keeping wipe-detection signals in the same place that
  // gets wiped defeated the point. These keys are only read once on startup
  // to migrate any pre-existing values into IDB, then removed.
  sentinel: "dietTrackerSentinel",
  diagLog: "dietTrackerDiagLog",
};
const DIAG_LOG_MAX = 20;
// Local-time YYYY-MM-DD. toISOString() returns UTC, which silently shifts the
// key past midnight UTC and parks today's entries on tomorrow's calendar cell
// for users in negative-UTC timezones.
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = () => dateKey(new Date());
const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// Entries, sentinel, and diag log all live in IndexedDB. iOS Safari aggressively
// evicts localStorage for installed PWAs under storage pressure, which wiped
// the entire history. IDB has a much larger quota and survives eviction much
// better. The tiny settings (API key, targets, health) stay in localStorage.
const IDB_NAME = "dietTracker";
const IDB_STORE = "kv";
const IDB_ENTRIES_KEY = "allEntries";
// Sentinel records the last successful save so we can detect a suspicious
// empty load (IDB came back empty even though we know we had data). Stored
// in the same IDB store as entries so it shares their durability.
const IDB_SENTINEL_KEY = "sentinel";       // { savedAt, dateCount, entryCount }
// Ring buffer of recent storage events for the diagnostics panel.
const IDB_DIAG_LOG_KEY = "diagLog";        // [{ at, kind, detail }]

const openIDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(IDB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbGet = (key) => openIDB().then(db => new Promise((resolve, reject) => {
  const tx = db.transaction(IDB_STORE, "readonly");
  const req = tx.objectStore(IDB_STORE).get(key);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
}));

const idbPut = (key, value) => openIDB().then(db => new Promise((resolve, reject) => {
  const tx = db.transaction(IDB_STORE, "readwrite");
  tx.objectStore(IDB_STORE).put(value, key);
  tx.oncomplete = () => resolve(true);
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
}));

const countEntries = (entries) => {
  if (!entries) return { dateCount: 0, entryCount: 0 };
  const dates = Object.keys(entries);
  let entryCount = 0;
  for (const d of dates) entryCount += (entries[d] || []).length;
  return { dateCount: dates.length, entryCount };
};

// Returns the sentinel that was written so callers can thread it into React
// state without a follow-up read. Persistence failures fall through silently —
// the in-memory copy is still correct, only durability across reloads is lost.
const updateSentinel = async (entries) => {
  const { dateCount, entryCount } = countEntries(entries);
  const s = { savedAt: Date.now(), dateCount, entryCount };
  try { await idbPut(IDB_SENTINEL_KEY, s); } catch { /* in-memory only */ }
  return s;
};

const appendDiag = async (kind, detail) => {
  let log = [];
  try { log = (await idbGet(IDB_DIAG_LOG_KEY)) || []; } catch { log = []; }
  log.unshift({ at: Date.now(), kind, detail: detail ? String(detail).slice(0, 200) : "" });
  const trimmed = log.slice(0, DIAG_LOG_MAX);
  try { await idbPut(IDB_DIAG_LOG_KEY, trimmed); } catch { /* in-memory only */ }
  return trimmed;
};

const formatBytes = (n) => {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const formatRelative = (ts) => {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

// Downscale a data URL to a small JPEG. Phone photos arrive as multi-MB
// base64 strings; even with IDB's roomier quota, dozens of full-size photos
// add up fast. Drop the image entirely on failure rather than falling back
// to the original — a single unresizable photo could otherwise bloat storage.
const resizeImage = (dataUrl, maxDim = 240, quality = 0.55) => new Promise(resolve => {
  if (!dataUrl) { resolve(null); return; }
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    try {
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    } catch { resolve(null); }
  };
  img.onerror = () => resolve(null);
  img.src = dataUrl;
});

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

  // First run: anchor the baseline to yesterday so today stays live
  // (uncommitted) while the first completed day still gets committed once the
  // date rolls over. Without this, a null baseline keeps the cursor pinned to
  // today, no day is ever processed, and the score is stuck at the default.
  if (!lastProcessedDate) {
    const prev = new Date(`${today}T00:00:00`);
    prev.setDate(prev.getDate() - 1);
    lastProcessedDate = dateKey(prev);
  }

  const dates = [];
  // Parse YYYY-MM-DD as local midnight; bare "YYYY-MM-DD" is UTC, which
  // throws cursor.getDate() into the wrong day in negative-UTC timezones.
  const cursor = new Date(`${lastProcessedDate}T00:00:00`);
  cursor.setDate(cursor.getDate() + 1);
  const todayDate = new Date(`${today}T00:00:00`);

  while (cursor < todayDate) {
    dates.push(dateKey(cursor));
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
const EntryCard = ({ entry, onDelete, onEdit, onMove, currentDateKey }) => {
  const pLabel = portionLabel(entry.portion);
  const [expanded, setExpanded] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState(currentDateKey || todayKey());
  const hasActions = onEdit || onDelete || onMove;
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
            {hasActions && !moving && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {onEdit && <button onClick={e => { e.stopPropagation(); onEdit(entry); }} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#9a8f84", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Edit</button>}
                {onMove && <button onClick={e => { e.stopPropagation(); setMoveDate(currentDateKey || todayKey()); setMoving(true); }} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#9a8f84", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Move</button>}
                {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(entry.id); }} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: "1px solid rgba(224,122,95,0.3)", color: "#e07a5f", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Delete</button>}
              </div>
            )}
            {onMove && moving && (
              <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} max={todayKey()}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 8px", color: "#f0e8df", fontFamily: "'DM Sans', sans-serif", fontSize: 12, colorScheme: "dark" }} />
                <button onClick={e => { e.stopPropagation(); if (moveDate && moveDate !== currentDateKey) onMove(entry, moveDate); setMoving(false); }}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "rgba(200,149,108,0.18)", border: "1px solid rgba(200,149,108,0.4)", color: "#c8956c", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 600 }}>Confirm</button>
                <button onClick={e => { e.stopPropagation(); setMoving(false); }}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#9a8f84", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Calendar view
const CalendarView = ({ allEntries, targets, onSelectDay }) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleDateString([], { month: "long", year: "numeric" });

  const dayKey = (day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const getDayStatus = (day) => {
    const es = allEntries[dayKey(day)] || [];
    const total = es.reduce((a, e) => a + (e.calories || 0), 0);
    if (total === 0) return null;
    const pct = total / (targets.calories || 1);
    if (pct >= 0.85 && pct <= 1.05) return "hit";
    if (pct > 1.05) return "over";
    return "under";
  };

  const isToday = (day) => new Date(year, month, day).toDateString() === today.toDateString();
  const isFuture = (day) => new Date(year, month, day) > today && !isToday(day);
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
          const futureFlag = isFuture(day);
          return (
            <button key={day}
              onClick={() => !futureFlag && onSelectDay?.(dayKey(day))}
              disabled={futureFlag}
              style={{
                aspectRatio: "1", borderRadius: 8,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: todayFlag ? "rgba(200,149,108,0.18)" : status ? `${statusColors[status]}1a` : "rgba(255,255,255,0.02)",
                border: `1px solid ${todayFlag ? "rgba(200,149,108,0.5)" : "transparent"}`,
                padding: 0, font: "inherit",
                cursor: futureFlag ? "default" : "pointer",
                opacity: futureFlag ? 0.35 : 1,
              }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: todayFlag ? "#c8956c" : "#6b6059" }}>{day}</span>
              {status && <div style={{ width: 5, height: 5, borderRadius: "50%", background: statusColors[status], marginTop: 2 }} />}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 20, justifyContent: "center", flexWrap: "wrap" }}>
        {[["hit","#7eb8a4","On target"],["over","#e07a5f","Over"],["under","#c8956c","Under"],["none","#3d3530","Not logged"]].map(([s, c, l]) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Day detail view for a past (or current) day, opened by tapping a calendar
// cell. Mirrors the Today summary layout so the eye can compare without
// re-learning. Edit/delete are still omitted — past-day macro edits are a
// separate feature — but each entry exposes a Move action so misdated entries
// can be reassigned to the correct day.
const DayDetailModal = ({ dateKey, entries, targets, onMoveEntry, onClose }) => {
  const totals = entries.reduce((acc, e) => ({
    calories: acc.calories + (e.calories || 0),
    protein:  acc.protein  + (e.protein  || 0),
    carbs:    acc.carbs    + (e.carbs    || 0),
    fat:      acc.fat      + (e.fat      || 0),
    fiber:    acc.fiber    + (e.fiber    || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  // Parse as local date by appending T00 — `new Date("2026-05-12")` would be
  // interpreted as UTC midnight and could show the previous day in negative
  // timezones.
  const date = new Date(dateKey + "T00:00:00");
  const dateLabel = date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const remaining = targets.calories - totals.calories;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#1e1a17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px 16px 0 0", padding: 24, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#f0e8df", margin: 0 }}>{dateLabel}</h3>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9a8f84", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        {entries.length > 0 ? (
          <>
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
                  {remaining >= 0 ? `${remaining} kcal under target` : `${Math.abs(remaining)} kcal over target`}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  currentDateKey={dateKey}
                  onMove={onMoveEntry ? (e, newKey) => onMoveEntry(e, dateKey, newKey) : undefined}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#6b6059" }}>
            No entries logged on this day.
          </div>
        )}
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
const SettingsPanel = ({ apiKey, setApiKey, targets, setTargets, diag, loadedCounts, onRefreshDiag, onClose }) => {
  const [localKey, setLocalKey] = useState(apiKey);
  const [lt, setLt] = useState({ ...targets });
  const setT = (k, v) => setLt(p => ({ ...p, [k]: Number(v) }));
  const handleSave = () => { setApiKey(localKey); setTargets(lt); save(STORAGE.key, localKey); save(STORAGE.targets, lt); onClose(); };
  useEffect(() => { onRefreshDiag?.(); }, []);
  const persistLabel = diag?.persisted === true ? "Granted" : diag?.persisted === false ? "Denied (evictable)" : "Unknown";
  const persistColor = diag?.persisted === true ? "#7eb8a4" : diag?.persisted === false ? "#e07a5f" : "#9a8f84";
  const loadColor = diag?.loadResult === "from-idb" || diag?.loadResult === "from-legacy" ? "#7eb8a4"
                  : diag?.loadResult === "suspected-wipe" || diag?.loadResult === "error" ? "#e07a5f"
                  : "#9a8f84";
  const row = (label, value, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#9a8f84" }}>{label}</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: color || "#f0e8df", textAlign: "right" }}>{value}</span>
    </div>
  );
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
        {diag && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a8f84", marginBottom: 10 }}>Storage Diagnostics</div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
              {row("Persistent storage", persistLabel, persistColor)}
              {row("Quota used", diag.quotaUsage != null ? `${formatBytes(diag.quotaUsage)}${diag.quota ? ` / ${formatBytes(diag.quota)}` : ""}` : "—")}
              {row("Last load", diag.loadResult || "—", loadColor)}
              {diag.loadError ? row("Load error", diag.loadError, "#e07a5f") : null}
              {row("Loaded now", `${loadedCounts?.entryCount ?? 0} entries / ${loadedCounts?.dateCount ?? 0} days`)}
              {row("Last known save", diag.sentinel
                ? `${diag.sentinel.entryCount} entries / ${diag.sentinel.dateCount} days · ${formatRelative(diag.sentinel.savedAt)}`
                : "never")}
              {diag.lastSaveError ? row("Last save error", diag.lastSaveError, "#e07a5f") : null}
            </div>
            {diag.log && diag.log.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>Recent storage events ({diag.log.length})</summary>
                <div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "8px 10px", fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#9a8f84", lineHeight: 1.5 }}>
                  {diag.log.map((e, i) => (
                    <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      <span style={{ color: "#6b6059" }}>{new Date(e.at).toLocaleString()} </span>
                      <span style={{ color: e.kind === "save-error" || e.kind === "load" && /error|wipe/.test(e.detail) ? "#e07a5f" : "#c8956c" }}>{e.kind}</span>
                      {e.detail ? ` ${e.detail}` : ""}
                    </div>
                  ))}
                </div>
              </details>
            )}
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059", marginTop: 8, lineHeight: 1.5 }}>
              "Persistent storage: Denied" means iOS may evict your data without warning. Install this app to your home screen via Safari Share → "Add to Home Screen" to improve persistence.
            </p>
          </div>
        )}
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
// Sum each macro across components (rounding per item) so the Adjust fields
// match the per-row values shown in the Breakdown. Falls back to scaling the
// pre-summed totals when no components are present.
const scaleMacros = (base, p) => {
  const cs = base.components;
  if (Array.isArray(cs) && cs.length) {
    const sum = k => cs.reduce((s, c) => s + Math.round((c[k] || 0) * p), 0);
    return { calories: sum("kcal"), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat"), fiber: sum("fiber") };
  }
  return MACRO_KEYS.reduce((a, k) => (a[k] = Math.round((base[k] || 0) * p), a), {});
};

// Text entry modal — quick textarea for describing a meal in words.
// On submit, hands the string to AnalyzeModal which runs the same Gemini
// pipeline as the photo path (just without the image part).
const TextEntryModal = ({ onSubmit, onClose }) => {
  const [text, setText] = useState("");
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = () => { const t = text.trim(); if (t) onSubmit(t); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#1e1a17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px 16px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#f0e8df", margin: 0 }}>Describe your meal</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9a8f84", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#6b6059", marginBottom: 12, lineHeight: 1.5 }}>
          e.g. <span style={{ color: "#9a8f84" }}>"12oz oat milk latte"</span> · <span style={{ color: "#9a8f84" }}>"two slices of pepperoni pizza"</span>
        </div>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="What did you eat?"
          rows={3}
          style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 14px", color: "#f0e8df", fontFamily: "'DM Sans', sans-serif", fontSize: 14, boxSizing: "border-box", resize: "vertical", outline: "none", lineHeight: 1.4 }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={submit} disabled={!text.trim()} style={{ flex: 1, background: text.trim() ? "#c8956c" : "rgba(200,149,108,0.3)", border: "none", borderRadius: 10, padding: "13px", color: "#1e1a17", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: text.trim() ? "pointer" : "not-allowed", fontWeight: 700 }}>Analyze</button>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "13px", color: "#9a8f84", fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

const IMAGE_PROMPT = 'Estimate nutrition for ALL food visible in this image combined — every item shown, summed together. This is NOT a per-serving estimate; do not divide by number of people.\n\nReason step-by-step:\n1. SCALE — identify a size anchor visible in the image (utensil, hand, chopsticks, plate edge, standard glass) and state it in scale_reference. Use it to gauge portions; do not assume a plate is standard-sized without evidence.\n2. COMPONENTS — list every distinct item. Include added cooking fat as its own component if the food looks fried, sautéed, glazed, or visibly oily — added oil/butter is the single biggest source of restaurant-meal calorie variance. For each component, estimate grams from the scale anchor, then compute kcal and macros from standard nutritional data.\n3. TOTALS — sum across components. Top-level calories/protein_g/carbs_g/fat_g/fiber_g must equal the component sums.\n4. UNCERTAINTY — name the single assumption most likely to be wrong (e.g., "sauce volume — could swing ±150 kcal", "amount of cooking oil") in biggest_uncertainty.\n\nSet serving_assumption to "entire_image" if you summed everything shown, "single_serving" if you returned per-person values, or "other" otherwise. The expected value is "entire_image" — if you find yourself doing otherwise, recompute before answering.\n\nReturn ONLY a JSON object, no markdown, no backticks:\n{"dish":"name","description":"one sentence","scale_reference":"e.g. fork (~20cm)","components":[{"name":"item","grams":0,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0}],"total_grams":0,"serving_assumption":"entire_image|single_serving|other","confidence":"high|medium|low","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"biggest_uncertainty":"what to verify","notes":"caveats"}';

const buildTextPrompt = (text) => `Estimate nutrition for the food described below.\n\nUser description: "${text.replace(/"/g, '\\"')}"\n\nReason step-by-step:\n1. INTERPRET — figure out what was eaten and how much. If the description specifies a size or count (e.g. "12oz latte", "two slices"), use that exactly. If it's ambiguous (e.g. just "a latte" with no size), assume the most common typical serving for that item.\n2. COMPONENTS — list every distinct sub-item. For a drink, include milk/syrup separately if relevant. For a sandwich, list bread, fillings, spreads. For each component, estimate grams, then compute kcal and macros from standard nutritional data.\n3. TOTALS — sum across components. Top-level calories/protein_g/carbs_g/fat_g/fiber_g must equal the component sums.\n4. UNCERTAINTY — name the single assumption most likely to be wrong (e.g. "assumed whole milk — could swing ±50 kcal if oat/skim", "portion size not specified") in biggest_uncertainty.\n\nSet serving_assumption to "as_described" if you used the exact amount the user stated, or "typical_serving" if you assumed a common portion because the description was vague. Set scale_reference to a short note on what you assumed (e.g. "typical 12oz latte", "as stated: 2 slices").\n\nReturn ONLY a JSON object, no markdown, no backticks:\n{"dish":"name","description":"one sentence","scale_reference":"what you assumed","components":[{"name":"item","grams":0,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0}],"total_grams":0,"serving_assumption":"as_described|typical_serving|other","confidence":"high|medium|low","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"biggest_uncertainty":"what to verify","notes":"caveats"}`;

// Analyze modal — handles both image and text-described meals. Pass either
// `image` (a data URL) or `text` (a user-typed description), not both.
const AnalyzeModal = ({ image, text, apiKey, onLog, onClose }) => {
  const [status, setStatus] = useState("analyzing");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [edited, setEdited] = useState(null);
  const [portion, setPortion] = useState(1);

  const analyze = async () => {
    setStatus("analyzing"); setError("");
    if (!apiKey) { setError("No API key. Open ⚙ Settings to add your Gemini key."); setStatus("error"); return; }
    try {
      const parts = image
        ? [
            { text: IMAGE_PROMPT },
            { inline_data: { mime_type: image.split(";")[0].split(":")[1], data: image.split(",")[1] } },
          ]
        : [{ text: buildTextPrompt(text) }];
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1 }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/```json|```/g, "").trim();
      const p = JSON.parse(raw);
      const components = Array.isArray(p.components) ? p.components.map(c => ({
        name: c.name || "item",
        grams: Math.round(c.grams || 0),
        kcal: Math.round(c.kcal || 0),
        protein: Math.round(c.protein_g || 0),
        carbs: Math.round(c.carbs_g || 0),
        fat: Math.round(c.fat_g || 0),
        fiber: Math.round(c.fiber_g || 0),
      })) : [];
      // Derive top-level totals from component sums so the breakdown and the
      // Calories/macro fields always agree. The model is asked to keep them
      // equal but frequently returns mismatched figures.
      const sum = k => components.reduce((a, c) => a + (c[k] || 0), 0);
      const hasComponents = components.length > 0;
      const r = { dish: p.dish || "Unknown", description: p.description || "", confidence: p.confidence || "medium", serving_assumption: p.serving_assumption || "unknown", scale_reference: p.scale_reference || "", components, biggest_uncertainty: p.biggest_uncertainty || "", total_grams: hasComponents ? sum("grams") : Math.round(p.total_grams || 0), calories: hasComponents ? sum("kcal") : Math.round(p.calories || 0), protein: hasComponents ? sum("protein") : Math.round(p.protein_g || 0), carbs: hasComponents ? sum("carbs") : Math.round(p.carbs_g || 0), fat: hasComponents ? sum("fat") : Math.round(p.fat_g || 0), fiber: hasComponents ? sum("fiber") : Math.round(p.fiber_g || 0), notes: p.notes || "" };
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
          {image
            ? <img src={image} alt="" style={{ width: 76, height: 76, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
            : <div style={{ width: 76, height: 76, borderRadius: 10, flexShrink: 0, background: "rgba(200,149,108,0.10)", border: "1px solid rgba(200,149,108,0.30)", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, overflow: "hidden" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#c8956c", textAlign: "center", lineHeight: 1.3, wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>"{text}"</span>
              </div>}
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: cc[result.confidence], background: `${cc[result.confidence]}22`, padding: "3px 8px", borderRadius: 4 }}>{result.confidence} confidence</span>
                {result.scale_reference && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059" }}>scale: {result.scale_reference}</span>}
              </div>
            </>)}
          </div>
        </div>
        {status === "done" && edited && (<>
          {image && result.serving_assumption && result.serving_assumption !== "entire_image" && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#e07a5f", marginBottom: 14, padding: "10px 12px", background: "rgba(224,122,95,0.08)", border: "1px solid rgba(224,122,95,0.25)", borderRadius: 8, lineHeight: 1.4 }}>
              ⚠ Estimate is for {result.serving_assumption === "single_serving" ? "a single serving" : "part of the image"}, not everything shown. Adjust below if you ate more.
            </div>
          )}
          {!image && result.serving_assumption === "typical_serving" && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#c8956c", marginBottom: 14, padding: "10px 12px", background: "rgba(200,149,108,0.08)", border: "1px solid rgba(200,149,108,0.25)", borderRadius: 8, lineHeight: 1.4 }}>
              Assumed a typical serving size since none was specified. Adjust below if needed.
            </div>
          )}
          {result.components && result.components.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a8f84", marginBottom: 8 }}>Breakdown</div>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "4px 12px" }}>
                {result.components.map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: i < result.components.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f0e8df", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#6b6059" }}>{Math.round(c.grams * portion)}g</div>
                    </div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: "#c8956c", flexShrink: 0 }}>
                      {Math.round(c.kcal * portion)}<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: "#6b6059", marginLeft: 3 }}>kcal</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.biggest_uncertainty && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#c8956c", marginBottom: 14, padding: "10px 12px", background: "rgba(200,149,108,0.08)", border: "1px solid rgba(200,149,108,0.25)", borderRadius: 8, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 600, letterSpacing: "0.05em" }}>Verify if unsure · </span>{result.biggest_uncertainty}
            </div>
          )}
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
  const [allEntries, setAllEntries] = useState({});
  const [rawHealth, setRawHealth] = useState(() => load(STORAGE.health, HEALTH_DEFAULTS));
  const [tab, setTab] = useState("today");
  const [showSettings, setShowSettings] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingText, setPendingText] = useState(null);
  const [showTextEntry, setShowTextEntry] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [storageError, setStorageError] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [diag, setDiag] = useState({
    persisted: null,           // result of navigator.storage.persisted()
    persistGranted: null,      // result of navigator.storage.persist()
    quotaUsage: null,
    quota: null,
    sentinel: null,            // populated from IDB in the init effect below
    loadResult: "loading",     // loading | from-idb | from-legacy | empty | suspected-wipe | error
    loadError: null,
    lastSaveAt: null,
    lastSaveError: null,
    log: [],                   // populated from IDB in the init effect below
  });
  const [suspectedWipe, setSuspectedWipe] = useState(false);
  const [wipeAcked, setWipeAcked] = useState(false);
  const entriesLoadedRef = useRef(false);
  const fileRef = useRef();

  const refreshQuota = async () => {
    try {
      const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
      const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
      const log = (await idbGet(IDB_DIAG_LOG_KEY).catch(() => null)) || [];
      setDiag(d => ({ ...d, persisted, quotaUsage: est?.usage ?? null, quota: est?.quota ?? null, log }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      // Ask WebKit to mark this origin's storage as persistent. Without this,
      // iOS treats both localStorage and IndexedDB as evictable and can wipe an
      // installed PWA's data under storage pressure or ITP heuristics — even
      // when usage is tiny. For installed home-screen PWAs this is typically
      // granted automatically; for plain Safari tabs it may be denied.
      let persistGranted = null;
      if (navigator.storage?.persist) {
        try { persistGranted = await navigator.storage.persist(); }
        catch { persistGranted = false; }
      }
      const persistedNow = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => null) : null;
      const est = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;

      // Read sentinel + diag log from IDB. If absent, one-time-migrate any
      // pre-existing values from the legacy localStorage keys so prior history
      // isn't lost on the upgrade, then remove the legacy keys.
      let sentinel = await idbGet(IDB_SENTINEL_KEY).catch(() => null);
      let diagLog = (await idbGet(IDB_DIAG_LOG_KEY).catch(() => null)) || [];
      if (!sentinel) {
        const legacySentinel = load(STORAGE.sentinel, null);
        if (legacySentinel) {
          sentinel = legacySentinel;
          try { await idbPut(IDB_SENTINEL_KEY, legacySentinel); } catch { /* keep going */ }
        }
      }
      if (!diagLog.length) {
        const legacyLog = load(STORAGE.diagLog, []);
        if (legacyLog.length) {
          diagLog = legacyLog;
          try { await idbPut(IDB_DIAG_LOG_KEY, legacyLog); } catch { /* keep going */ }
        }
      }
      try { localStorage.removeItem(STORAGE.sentinel); } catch { /* ignore */ }
      try { localStorage.removeItem(STORAGE.diagLog); } catch { /* ignore */ }

      let entries = null, loadError = null;
      try {
        entries = await idbGet(IDB_ENTRIES_KEY);
      } catch (e) {
        loadError = e?.message || String(e);
      }

      let loadResult, wipeSuspected = false;
      if (!entries || !Object.keys(entries).length) {
        const legacy = load(STORAGE.entries, null);
        if (legacy && Object.keys(legacy).length) {
          entries = legacy;
          loadResult = "from-legacy";
          try { await idbPut(IDB_ENTRIES_KEY, legacy); sentinel = await updateSentinel(legacy); }
          catch { /* keep going */ }
        } else if (loadError) {
          entries = {};
          loadResult = "error";
          wipeSuspected = !!(sentinel && sentinel.entryCount > 0);
        } else if (sentinel && sentinel.entryCount > 0) {
          // IDB read succeeded but came back empty even though we had data
          // before — almost certainly an eviction. Refuse to overwrite.
          entries = {};
          loadResult = "suspected-wipe";
          wipeSuspected = true;
        } else {
          entries = {};
          loadResult = "empty";
        }
      } else {
        loadResult = "from-idb";
      }

      const newLog = await appendDiag("load", `${loadResult}${loadError ? ` (${loadError})` : ""} sentinel=${sentinel ? sentinel.entryCount : 0} loaded=${countEntries(entries).entryCount}`);

      setAllEntries(entries);
      setSuspectedWipe(wipeSuspected);
      // When we suspect a wipe, hold off on writes until the user acknowledges
      // — otherwise the next save would commit `{}` and erase any chance of
      // recovery (e.g., reopening the PWA later when iOS hands back the data).
      entriesLoadedRef.current = !wipeSuspected;
      setDiag(d => ({
        ...d,
        persistGranted,
        persisted: persistedNow,
        quotaUsage: est?.usage ?? null,
        quota: est?.quota ?? null,
        sentinel,
        loadResult,
        loadError,
        log: newLog,
      }));
    })();
  }, []);

  const acknowledgeWipe = async () => {
    const newLog = await appendDiag("wipe-acked", `prior sentinel ${diag.sentinel?.entryCount ?? 0} entries`);
    // Reset sentinel so we don't keep nagging.
    const s = { savedAt: Date.now(), dateCount: 0, entryCount: 0 };
    try { await idbPut(IDB_SENTINEL_KEY, s); } catch { /* in-memory only */ }
    setSuspectedWipe(false);
    setWipeAcked(true);
    entriesLoadedRef.current = true;
    setDiag(d => ({ ...d, sentinel: s, log: newLog }));
  };

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
      const key = dateKey(d);
      const es = allEntries[key] || [];
      const cal = es.reduce((a, e) => a + (e.calories || 0), 0);
      const pct = cal / (targets.calories || 1);
      if (pct >= 0.85 && pct <= 1.05) { s++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return s;
  })();

  const persistAllEntries = (next) => {
    setAllEntries(next);
    idbPut(IDB_ENTRIES_KEY, next)
      .then(async () => {
        const s = await updateSentinel(next);
        setStorageError(false);
        setDiag(d => ({ ...d, sentinel: s, lastSaveAt: Date.now(), lastSaveError: null }));
      })
      .catch(async (e) => {
        const newLog = await appendDiag("save-error", e?.message || String(e));
        const lsOk = save(STORAGE.entries, next);
        const s = await updateSentinel(next);
        setStorageError(!lsOk);
        setDiag(d => ({ ...d, lastSaveError: e?.message || String(e), sentinel: s, log: newLog }));
      });
  };

  const saveEntries = (updated) => {
    if (!entriesLoadedRef.current) return;
    persistAllEntries({ ...allEntries, [todayKey()]: updated });
  };

  // Reassign an entry from one day to another. Drops the source day key once
  // it's empty so the calendar's "not logged" styling returns instead of an
  // empty-but-present array.
  const handleMoveEntry = (entry, fromDateKey, newDateKey) => {
    if (!entriesLoadedRef.current || !newDateKey || fromDateKey === newDateKey) return;
    const fromList = (allEntries[fromDateKey] || []).filter(e => e.id !== entry.id);
    const toList = [entry, ...(allEntries[newDateKey] || [])];
    const next = { ...allEntries, [newDateKey]: toList };
    if (fromList.length === 0) delete next[fromDateKey];
    else next[fromDateKey] = fromList;
    persistAllEntries(next);
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setPendingImage(e.target.result);
    reader.readAsDataURL(file);
  };

  // Persist only the fields the rest of the app reads back. The analyzer
  // returns extra context (components breakdown, scale reference, notes about
  // uncertainty) that's useful inside the modal but never displayed once the
  // entry is logged, so dropping it keeps each saved entry small.
  const handleLog = async (data) => {
    const image = pendingImage ? await resizeImage(pendingImage) : null;
    const entry = {
      id: Date.now(),
      image,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      dish: data.dish || "",
      calories: Math.round(data.calories || 0),
      protein: Math.round(data.protein || 0),
      carbs: Math.round(data.carbs || 0),
      fat: Math.round(data.fat || 0),
      fiber: Math.round(data.fiber || 0),
      notes: data.notes || "",
      portion: data.portion ?? 1,
    };
    saveEntries([entry, ...entries]);
    setPendingImage(null);
    setPendingText(null);
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
        {storageError && (
          <div style={{ background: "rgba(224,122,95,0.10)", border: "1px solid rgba(224,122,95,0.35)", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#e07a5f", lineHeight: 1.4 }}>
            Couldn't save — local storage is full. Delete some older entries to free space.
          </div>
        )}
        {suspectedWipe && (
          <div style={{ background: "rgba(224,122,95,0.12)", border: "1px solid rgba(224,122,95,0.45)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#f0e8df", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, color: "#e07a5f", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 10 }}>Storage Wiped</div>
            <div style={{ marginBottom: 10 }}>
              Your stored data couldn't be loaded. Last known save: <b>{diag.sentinel?.entryCount ?? 0}</b> entries across <b>{diag.sentinel?.dateCount ?? 0}</b> days
              {diag.sentinel?.savedAt ? <> ({formatRelative(diag.sentinel.savedAt)})</> : null}.
              <br />New entries are blocked until you confirm — saving now would commit an empty store and erase any chance of recovery.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => window.location.reload()} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 12px", color: "#f0e8df", fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>Try Reloading</button>
              <button onClick={acknowledgeWipe} style={{ background: "#e07a5f", border: "none", borderRadius: 8, padding: "8px 12px", color: "#1e1a17", fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }}>Start Fresh</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "#9a8f84" }}>Open ⚙ Settings → Storage diagnostics for details.</div>
          </div>
        )}
        {wipeAcked && (
          <div style={{ background: "rgba(200,149,108,0.08)", border: "1px solid rgba(200,149,108,0.25)", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#c8956c", lineHeight: 1.4 }}>
            Started fresh. New entries will be saved normally.
          </div>
        )}
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
              {entries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  currentDateKey={todayKey()}
                  onDelete={handleDelete}
                  onEdit={setEditingEntry}
                  onMove={(e, newKey) => handleMoveEntry(e, todayKey(), newKey)}
                />
              ))}
            </div>
          )}
        </>)}
        {tab === "calendar" && <CalendarView allEntries={allEntries} targets={targets} onSelectDay={setSelectedDay} />}
      </div>

      {tab === "today" && (<>
        {fabOpen && <div onClick={() => setFabOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,0.35)" }} />}
        <div style={{ position: "fixed", bottom: `calc(var(--safe-bottom) + 24px)`, left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {fabOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
              <button onClick={() => { setFabOpen(false); setShowTextEntry(true); }} style={{
                background: "#1e1a17", border: "1px solid rgba(200,149,108,0.4)", borderRadius: 24,
                padding: "10px 18px", cursor: "pointer", color: "#c8956c",
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600,
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              }}>
                <span style={{ fontSize: 16 }}>✎</span> Describe
              </button>
              <button onClick={() => { setFabOpen(false); fileRef.current?.click(); }} style={{
                background: "#1e1a17", border: "1px solid rgba(200,149,108,0.4)", borderRadius: 24,
                padding: "10px 18px", cursor: "pointer", color: "#c8956c",
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600,
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              }}>
                <span style={{ fontSize: 16 }}>📷</span> Photo
              </button>
            </div>
          )}
          <button onClick={() => setFabOpen(o => !o)} style={{
            width: 58, height: 58, borderRadius: "50%",
            background: "linear-gradient(135deg, #c8956c, #a8703a)",
            border: "none", cursor: "pointer",
            boxShadow: "0 4px 24px rgba(200,149,108,0.5)",
            color: "#1e1a17", fontSize: 30, fontWeight: 300, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}>+</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </>)}

      {pendingImage  && <AnalyzeModal image={pendingImage} apiKey={apiKey} onLog={handleLog} onClose={() => setPendingImage(null)} />}
      {pendingText   && <AnalyzeModal text={pendingText} apiKey={apiKey} onLog={handleLog} onClose={() => setPendingText(null)} />}
      {showTextEntry && <TextEntryModal onSubmit={t => { setShowTextEntry(false); setPendingText(t); }} onClose={() => setShowTextEntry(false)} />}
      {editingEntry  && <EditModal entry={editingEntry} onSave={handleSaveEdit} onClose={() => setEditingEntry(null)} />}
      {selectedDay   && <DayDetailModal dateKey={selectedDay} entries={allEntries[selectedDay] || []} targets={targets} onMoveEntry={handleMoveEntry} onClose={() => setSelectedDay(null)} />}
      {showSettings  && <SettingsPanel apiKey={apiKey} setApiKey={setApiKey} targets={targets} setTargets={setTargets} diag={diag} loadedCounts={countEntries(allEntries)} onRefreshDiag={refreshQuota} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
