const {
  useState,
  useMemo,
  useCallback
} = React;
const {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  AreaChart,
  ComposedChart,
  Bar
} = Recharts;
const VARIANTS = {
  lean: {
    label: "Lean FIRE",
    color: "#7EB8A4",
    spendMult: 0.6
  },
  regular: {
    label: "FIRE",
    color: "#C9A96E",
    spendMult: 1.0
  },
  fat: {
    label: "Fat FIRE",
    color: "#E07B6A",
    spendMult: 1.6
  }
};
const HC_PHASES = [{
  key: "aca",
  label: "ACA Marketplace",
  ageRange: "Pre-65",
  color: "#C9A96E",
  baseMonthly: 650,
  annualGrowth: 0.055,
  note: "Full private insurance on marketplace. Most expensive per-year phase. No employer subsidy."
}, {
  key: "medicare",
  label: "Medicare",
  ageRange: "65–74",
  color: "#7EB8A4",
  baseMonthly: 370,
  annualGrowth: 0.045,
  note: "Part B (~$175/mo) + Medigap supplement (~$150/mo) + Part D drug plan (~$45/mo). Cheaper than ACA."
}, {
  key: "ltc",
  label: "Medicare + LTC Risk",
  ageRange: "75+",
  color: "#E07B6A",
  baseMonthly: 650,
  annualGrowth: 0.05,
  note: "Medicare costs rise + long-term care risk emerges. Avg LTC costs $5k–$10k/mo; probability-weighted adds ~$280/mo."
}];
const MONTHLY_CATS = [{
  key: "housing",
  label: "Housing",
  hint: "rent or mortgage"
}, {
  key: "food",
  label: "Food",
  hint: "groceries + dining"
}, {
  key: "transport",
  label: "Transport",
  hint: "car, gas, transit"
}, {
  key: "utilities",
  label: "Utilities",
  hint: "electric, water, internet"
}, {
  key: "entertainment",
  label: "Entertainment",
  hint: "subscriptions, hobbies, going out"
}, {
  key: "clothing",
  label: "Clothing",
  hint: "apparel + personal care"
}, {
  key: "other",
  label: "Other",
  hint: "misc monthly"
}];
const ANNUAL_CATS = [{
  key: "travel",
  label: "Travel / Vacations",
  hint: "flights, hotels, trips per year"
}, {
  key: "gifts",
  label: "Gifts & Giving",
  hint: "holidays, birthdays, donations"
}, {
  key: "misc",
  label: "Annual Misc",
  hint: "memberships, irregular expenses"
}];
const FAT_CITIES = [{
  city: "Lisbon",
  country: "Portugal",
  region: "Europe",
  costIndex: 52,
  note: "Golden Visa access, warm climate, world-class food scene, expat-friendly"
}, {
  city: "Medellín",
  country: "Colombia",
  region: "Americas",
  costIndex: 38,
  note: "Eternal spring climate, modern infrastructure, thriving arts scene, cheap luxury"
}, {
  city: "Chiang Mai",
  country: "Thailand",
  region: "Asia",
  costIndex: 32,
  note: "Excellent private healthcare, vibrant food culture, easy visa options"
}, {
  city: "Porto",
  country: "Portugal",
  region: "Europe",
  costIndex: 48,
  note: "Underrated gem, stunning architecture, affordable luxury dining and wine"
}, {
  city: "Mexico City",
  country: "Mexico",
  region: "Americas",
  costIndex: 44,
  note: "World-class food, culture, art — luxury at fraction of US cost, no flight lag"
}, {
  city: "Tbilisi",
  country: "Georgia",
  region: "Europe",
  costIndex: 33,
  note: "Low taxes, visa-free for many nationalities, surprisingly sophisticated nightlife & food"
}, {
  city: "Penang",
  country: "Malaysia",
  region: "Asia",
  costIndex: 36,
  note: "MM2H visa, incredible food, English-speaking, private hospitals"
}, {
  city: "Buenos Aires",
  country: "Argentina",
  region: "Americas",
  costIndex: 30,
  note: "European character, world-class steak, tango — USD goes very far"
}, {
  city: "Valencia",
  country: "Spain",
  region: "Europe",
  costIndex: 55,
  note: "Beach city, excellent public transport, paella origin, slower pace than Madrid"
}, {
  city: "Bali (Seminyak)",
  country: "Indonesia",
  region: "Asia",
  costIndex: 35,
  note: "Luxury villas for $2–3k/mo, world food scene, growing digital nomad infrastructure"
}, {
  city: "Kuala Lumpur",
  country: "Malaysia",
  region: "Asia",
  costIndex: 38,
  note: "Affordable luxury high-rises, excellent malls, strong English, central Asia hub"
}, {
  city: "Kyoto",
  country: "Japan",
  region: "Asia",
  costIndex: 60,
  note: "Unmatched culture, superb safety, excellent healthcare — pricier but far below US/EU fat"
}, {
  city: "Prague",
  country: "Czech Rep.",
  region: "Europe",
  costIndex: 50,
  note: "Beautiful architecture, affordable luxury dining, EU access, high quality of life"
}, {
  city: "Cape Town",
  country: "South Africa",
  region: "Africa",
  costIndex: 35,
  note: "Dramatic scenery, wine country nearby, luxury property cheap, English-speaking"
}, {
  city: "Montevideo",
  country: "Uruguay",
  region: "Americas",
  costIndex: 48,
  note: "Safest in Latin America, stable democracy, excellent beef & wine, expat-welcoming"
}];
const fmt = n => {
  if (!isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
};
const fmtYrs = n => n >= 60 ? "60+ yrs" : n <= 0 ? "Now!" : n === 1 ? "1 yr" : `${Math.round(n)} yrs`;
const pct = (v, t) => !t ? "0.0" : Math.min(v / t * 100, 100).toFixed(1);
const REGIONS = ["All", "Europe", "Asia", "Americas", "Africa"];
function hcAtAge(targetAge, fireAge, currentHealthMonthly, hcGrowthOverride) {
  if (targetAge < fireAge) return currentHealthMonthly * 12;
  const yearsIntoRetirement = targetAge - fireAge;
  if (targetAge < 65) {
    const acaBase = Math.max(currentHealthMonthly, HC_PHASES[0].baseMonthly);
    return acaBase * 12 * Math.pow(1 + HC_PHASES[0].annualGrowth, yearsIntoRetirement);
  } else if (targetAge < 75) {
    const yrsOnACA = Math.max(65 - fireAge, 0);
    const acaBase = Math.max(currentHealthMonthly, HC_PHASES[0].baseMonthly);
    const acaAt65 = acaBase * Math.pow(1 + HC_PHASES[0].annualGrowth, yrsOnACA);
    const medicareBase = Math.min(acaAt65 * 0.57, HC_PHASES[1].baseMonthly * 12 * Math.pow(1 + HC_PHASES[1].annualGrowth, yrsOnACA));
    const yrsOnMedicare = targetAge - 65;
    return medicareBase * Math.pow(1 + HC_PHASES[1].annualGrowth, yrsOnMedicare);
  } else {
    const yrsOnACA = Math.max(65 - fireAge, 0);
    const acaBase = Math.max(currentHealthMonthly, HC_PHASES[0].baseMonthly);
    const acaAt65 = acaBase * Math.pow(1 + HC_PHASES[0].annualGrowth, yrsOnACA);
    const medicareBase = Math.min(acaAt65 * 0.57, HC_PHASES[1].baseMonthly * 12);
    const medicareAt75 = medicareBase * Math.pow(1 + HC_PHASES[1].annualGrowth, 10);
    const ltcBase = medicareAt75 + (HC_PHASES[2].baseMonthly - HC_PHASES[1].baseMonthly) * 12;
    const yrsOnLTC = targetAge - 75;
    return ltcBase * Math.pow(1 + HC_PHASES[2].annualGrowth, yrsOnLTC);
  }
}
function SpendRow({
  label,
  hint,
  value,
  onChange,
  isMonthly
}) {
  const [raw, setRaw] = useState(value === 0 ? "" : String(value));
  return React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      marginBottom: "0.5rem"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: "0.68rem",
      color: "var(--text)"
    }
  }, label), React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted2)"
    }
  }, hint, " \xB7 ", isMonthly ? "/mo" : "/yr")), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      background: "var(--input-bg)",
      border: "1px solid var(--border)",
      borderRadius: 3,
      padding: "0.2rem 0.4rem"
    }
  }, React.createElement("span", {
    style: {
      color: "var(--muted)",
      fontSize: "0.75rem",
      marginRight: "0.2rem"
    }
  }, "$"), React.createElement("input", {
    type: "number",
    value: raw,
    placeholder: "0",
    onChange: e => {
      setRaw(e.target.value);
      const n = parseFloat(e.target.value);
      onChange(isNaN(n) ? 0 : n);
    },
    onBlur: () => {
      if (raw === "" || raw === "0") setRaw("");
    },
    style: {
      background: "transparent",
      border: "none",
      outline: "none",
      color: "var(--text)",
      fontFamily: "var(--serif)",
      fontSize: "0.85rem",
      width: 72,
      textAlign: "right"
    }
  })));
}
function NumInput({
  label,
  value,
  onChange,
  sub,
  prefix = "$"
}) {
  const [raw, setRaw] = useState(value === 0 ? "" : String(value));
  return React.createElement("div", {
    style: {
      marginBottom: "1rem"
    }
  }, React.createElement("label", {
    style: {
      fontSize: "0.68rem",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "var(--muted)",
      display: "block",
      marginBottom: "0.25rem"
    }
  }, label), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      background: "var(--input-bg)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      padding: "0.4rem 0.6rem"
    }
  }, React.createElement("span", {
    style: {
      color: "var(--muted)",
      marginRight: "0.25rem",
      fontSize: "0.85rem"
    }
  }, prefix), React.createElement("input", {
    type: "number",
    value: raw,
    placeholder: "0",
    onChange: e => {
      setRaw(e.target.value);
      const n = parseFloat(e.target.value);
      onChange(isNaN(n) ? 0 : n);
    },
    onBlur: () => {
      if (raw === "") setRaw("");
    },
    style: {
      background: "transparent",
      border: "none",
      outline: "none",
      color: "var(--text)",
      fontFamily: "var(--serif)",
      fontSize: "0.95rem",
      width: "100%"
    }
  })), sub && React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted2)",
      marginTop: "0.2rem"
    }
  }, sub));
}
const Slider = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  sub
}) => React.createElement("div", {
  style: {
    marginBottom: "1.1rem"
  }
}, React.createElement("div", {
  style: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "0.2rem"
  }
}, React.createElement("span", {
  style: {
    fontSize: "0.68rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--muted)"
  }
}, label), React.createElement("span", {
  style: {
    fontSize: "0.95rem",
    fontFamily: "var(--serif)",
    color: "var(--gold)"
  }
}, format(value))), sub && React.createElement("div", {
  style: {
    fontSize: "0.6rem",
    color: "var(--muted2)",
    marginBottom: "0.25rem"
  }
}, sub), React.createElement("input", {
  type: "range",
  min: min,
  max: max,
  step: step,
  value: value,
  onChange: e => onChange(Number(e.target.value)),
  style: {
    width: "100%",
    accentColor: "var(--gold)"
  }
}), React.createElement("div", {
  style: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.58rem",
    color: "var(--muted2)"
  }
}, React.createElement("span", null, format(min)), React.createElement("span", null, format(max))));
const TABS = ["Inputs", "Projection", "Healthcare", "Scenarios", "Cities", "⚙"];
function CitiesTab({
  savings,
  swr,
  fatAnnualHere,
  fatTargetHere,
  yrsTo,
  filteredCities,
  cityRegion,
  setCityRegion,
  citySort,
  setCitySort,
  totalAnnual,
  age,
  income,
  sr,
  geminiKey
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [searchErr, setSearchErr] = useState("");
  const canSearch = !!geminiKey && query.trim().length > 2;
  const runSearch = async () => {
    if (!canSearch) return;
    setSearching(true);
    setResults(null);
    setSearchErr("");
    const prompt = `You are a FIRE retirement planning assistant with deep knowledge of global cost of living.

The user has:
- Current portfolio: $${savings.toLocaleString()}
- Annual spending (US baseline): $${Math.round(totalAnnual).toLocaleString()}
- Fat FIRE spend target (1.6× baseline): $${Math.round(fatAnnualHere).toLocaleString()}/yr
- Fat FIRE portfolio needed at home: $${Math.round(fatTargetHere).toLocaleString()}
- Safe withdrawal rate: ${swr}%

The user is asking about: "${query.trim()}"

Analyse this location (or up to 3 specific cities/areas if the query is a country or region) for Fat FIRE suitability.

For each city/area return ONLY a JSON array (no markdown, no explanation outside the JSON) with this exact structure:
[
  {
    "city": "City Name",
    "country": "Country",
    "costIndex": 45,
    "fatMonthly": 4200,
    "fatAnnual": 50400,
    "portfolioNeeded": 1260000,
    "canRetireNow": true,
    "shortfall": 0,
    "surplusYrs": 4,
    "verdict": "Ready now",
    "note": "2-3 sentence practical note covering lifestyle, visa options, healthcare, and any caveats for a Fat FIRE retiree",
    "pros": ["pro 1", "pro 2", "pro 3"],
    "cons": ["con 1", "con 2"]
  }
]

Rules:
- costIndex: cost of living relative to NYC=100 (be accurate)
- fatMonthly/fatAnnual: estimate Fat FIRE monthly and annual spend in USD for this city (luxury lifestyle equivalent)
- portfolioNeeded: fatAnnual / (${swr}/100)
- canRetireNow: true if $${savings.toLocaleString()} >= portfolioNeeded
- shortfall: max(0, portfolioNeeded - ${savings}) — how much more needed
- surplusYrs: if canRetireNow, how many years earlier than fatTargetHere=$${Math.round(fatTargetHere).toLocaleString()} (approximate, 0 if already past)
- verdict: one of "Ready now ✓", "Almost there", "Not yet", "Far off"
- Be honest and specific — don't oversell or undersell
Return ONLY the JSON array, no other text.`;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048
          }
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setResults(Array.isArray(parsed) ? parsed : [parsed]);
    } catch (e) {
      setSearchErr(e.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };
  const verdictColor = v => {
    if (!v) return "var(--muted)";
    if (v.includes("✓") || v.includes("Ready")) return "#7EB8A4";
    if (v.includes("Almost")) return "#C9A96E";
    if (v.includes("Far")) return "#E07B6A";
    return "var(--muted)";
  };
  return React.createElement("div", {
    className: "fu",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    }
  }, React.createElement("div", {
    className: "card",
    style: {
      borderLeft: "3px solid #E07B6A"
    }
  }, React.createElement("div", {
    className: "sl"
  }, "Fat FIRE Globally \u2014 Based on Your Portfolio"), React.createElement("div", {
    style: {
      display: "flex",
      gap: "0.5rem 1.5rem",
      flexWrap: "wrap",
      fontSize: "0.7rem"
    }
  }, [["Your Portfolio", fmt(savings), "var(--gold)"], ["Fat FIRE Needed", fmt(fatTargetHere), "#E07B6A"], ["Gap / Surplus", savings >= fatTargetHere ? `+${fmt(savings - fatTargetHere)}` : `-${fmt(fatTargetHere - savings)}`, savings >= fatTargetHere ? "#7EB8A4" : "#E07B6A"], ["Fat Spend/yr", fmt(fatAnnualHere), "var(--muted)"]].map(([l, v, c]) => React.createElement("div", {
    key: l
  }, React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    }
  }, l), React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "0.95rem",
      color: c
    }
  }, v)))), React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted2)",
      marginTop: "0.5rem"
    }
  }, "Cost index: NYC = 100. Cards show whether ", React.createElement("em", null, "current portfolio"), " is enough for Fat FIRE now.")), React.createElement("div", {
    className: "card",
    style: {
      borderColor: geminiKey ? "rgba(126,184,164,0.3)" : "var(--border)"
    }
  }, React.createElement("div", {
    className: "sl"
  }, "AI City Search", !geminiKey && React.createElement("span", {
    style: {
      color: "#E07B6A",
      marginLeft: "0.5rem",
      fontStyle: "normal"
    }
  }, "\u2014 add Gemini key in \u2699 Settings")), React.createElement("div", {
    style: {
      fontSize: "0.68rem",
      color: "var(--muted)",
      marginBottom: "0.65rem",
      lineHeight: 1.5
    }
  }, "Ask about any city, country, or region \u2014 Claude Gemini will estimate whether your portfolio is enough for Fat FIRE there."), React.createElement("div", {
    style: {
      display: "flex",
      gap: "0.5rem"
    }
  }, React.createElement("input", {
    type: "text",
    value: query,
    onChange: e => setQuery(e.target.value),
    onKeyDown: e => e.key === "Enter" && canSearch && !searching && runSearch(),
    placeholder: geminiKey ? "e.g. Tokyo, Southeast Asia, Portugal…" : "Add a Gemini API key in ⚙ Settings to enable",
    disabled: !geminiKey,
    style: {
      flex: 1,
      background: "var(--input-bg)",
      border: "1px solid var(--border)",
      borderRadius: 4,
      padding: "0.45rem 0.65rem",
      color: geminiKey ? "var(--text)" : "var(--muted2)",
      fontFamily: "var(--mono)",
      fontSize: "0.8rem",
      outline: "none"
    }
  }), React.createElement("button", {
    onClick: runSearch,
    disabled: !canSearch || searching,
    style: {
      background: canSearch && !searching ? "rgba(126,184,164,0.15)" : "var(--surface2)",
      border: `1px solid ${canSearch && !searching ? "#7EB8A4" : "var(--border)"}`,
      borderRadius: 4,
      padding: "0.45rem 0.9rem",
      cursor: canSearch && !searching ? "pointer" : "default",
      color: canSearch && !searching ? "#7EB8A4" : "var(--muted2)",
      fontFamily: "var(--mono)",
      fontSize: "0.72rem",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      transition: "all 0.15s",
      whiteSpace: "nowrap"
    }
  }, searching ? "…" : "Search")), searchErr && React.createElement("div", {
    style: {
      marginTop: "0.5rem",
      fontSize: "0.65rem",
      color: "#E07B6A",
      background: "rgba(224,123,106,0.07)",
      borderRadius: 3,
      padding: "0.4rem 0.5rem"
    }
  }, "Error: ", searchErr)), searching && React.createElement("div", {
    className: "card",
    style: {
      textAlign: "center",
      padding: "1.5rem",
      color: "var(--muted)",
      fontSize: "0.75rem"
    }
  }, React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      marginBottom: "0.4rem",
      fontSize: "1rem",
      color: "var(--text)"
    }
  }, "Researching\u2026"), "Analysing cost of living, visa options, and Fat FIRE feasibility"), results && results.map((r, i) => React.createElement("div", {
    key: i,
    className: "card",
    style: {
      borderLeft: `3px solid ${verdictColor(r.verdict)}`
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "0.6rem"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "1rem"
    }
  }, r.city), React.createElement("div", {
    style: {
      fontSize: "0.62rem",
      color: "var(--muted)"
    }
  }, r.country)), React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "0.85rem",
      color: verdictColor(r.verdict),
      marginBottom: "0.1rem"
    }
  }, r.verdict), React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "0.95rem"
    }
  }, fmt(r.portfolioNeeded)), React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted2)"
    }
  }, "needed"))), React.createElement("div", {
    style: {
      marginBottom: "0.6rem"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "0.62rem",
      marginBottom: "0.25rem"
    }
  }, React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, "Portfolio coverage"), React.createElement("span", {
    style: {
      color: verdictColor(r.verdict),
      fontFamily: "var(--serif)"
    }
  }, r.portfolioNeeded > 0 ? Math.min(Math.round(savings / r.portfolioNeeded * 100), 100) : 100, "%")), React.createElement("div", {
    className: "bar",
    style: {
      height: 5
    }
  }, React.createElement("div", {
    className: "bar-fill",
    style: {
      width: `${r.portfolioNeeded > 0 ? Math.min(savings / r.portfolioNeeded * 100, 100) : 100}%`,
      background: verdictColor(r.verdict)
    }
  })), r.canRetireNow ? React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "#7EB8A4",
      marginTop: "0.2rem"
    }
  }, "Current portfolio is sufficient", r.surplusYrs > 0 ? ` · ~${r.surplusYrs} yrs ahead of schedule vs. home Fat FIRE` : "") : React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "#E07B6A",
      marginTop: "0.2rem"
    }
  }, fmt(r.shortfall), " more needed \xB7 ", fmt(r.fatMonthly), "/mo Fat FIRE budget")), React.createElement("div", {
    className: "g3",
    style: {
      marginBottom: "0.6rem"
    }
  }, [["Cost Index", r.costIndex, r.costIndex < 45 ? "#7EB8A4" : r.costIndex < 55 ? "#C9A96E" : "var(--text)"], ["Fat FIRE/mo", fmt(r.fatMonthly), "var(--text)"], ["Fat FIRE/yr", fmt(r.fatAnnual), "var(--text)"]].map(([l, v, c]) => React.createElement("div", {
    key: l,
    style: {
      background: "var(--surface2)",
      borderRadius: 4,
      padding: "0.4rem",
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      fontSize: "0.57rem",
      color: "var(--muted)",
      textTransform: "uppercase"
    }
  }, l), React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "0.85rem",
      color: c
    }
  }, v)))), React.createElement("div", {
    style: {
      fontSize: "0.68rem",
      color: "var(--muted)",
      lineHeight: 1.5,
      marginBottom: "0.5rem"
    }
  }, r.note), (r.pros?.length > 0 || r.cons?.length > 0) && React.createElement("div", {
    className: "g2",
    style: {
      gap: "0.5rem"
    }
  }, r.pros?.length > 0 && React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "#7EB8A4",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      marginBottom: "0.25rem"
    }
  }, "Pros"), r.pros.map((p, j) => React.createElement("div", {
    key: j,
    style: {
      fontSize: "0.63rem",
      color: "var(--muted)",
      lineHeight: 1.4,
      marginBottom: "0.15rem"
    }
  }, "\xB7 ", p))), r.cons?.length > 0 && React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "#E07B6A",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      marginBottom: "0.25rem"
    }
  }, "Cons"), r.cons.map((c, j) => React.createElement("div", {
    key: j,
    style: {
      fontSize: "0.63rem",
      color: "var(--muted)",
      lineHeight: 1.4,
      marginBottom: "0.15rem"
    }
  }, "\xB7 ", c)))))), !searching && !results && React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      margin: "0.25rem 0"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      height: 1,
      background: "var(--border)"
    }
  }), React.createElement("span", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted2)",
      textTransform: "uppercase",
      letterSpacing: "0.1em"
    }
  }, "Curated list"), React.createElement("div", {
    style: {
      flex: 1,
      height: 1,
      background: "var(--border)"
    }
  })), !results && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      display: "flex",
      gap: "0.4rem",
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    }
  }, "Region:"), REGIONS.map(r => React.createElement("button", {
    key: r,
    className: "pill",
    onClick: () => setCityRegion(r),
    style: cityRegion === r ? {
      borderColor: "var(--gold)",
      color: "var(--gold)",
      background: "rgba(201,169,110,0.08)"
    } : {}
  }, r)), React.createElement("div", {
    style: {
      marginLeft: "auto",
      display: "flex",
      gap: "0.35rem"
    }
  }, [["cost", "By Cost"], ["alpha", "A–Z"], ["ready", "Ready Now"]].map(([s, l]) => React.createElement("button", {
    key: s,
    className: "pill",
    onClick: () => setCitySort(s),
    style: citySort === s ? {
      borderColor: "var(--muted)",
      color: "var(--text)"
    } : {}
  }, l)))), filteredCities.map(city => {
    const localAnnual = fatAnnualHere * (city.costIndex / 100);
    const localTarget = localAnnual / (swr / 100);
    const canNow = savings >= localTarget;
    const portfolioPct = Math.min(savings / localTarget * 100, 100);
    const shortfall = Math.max(localTarget - savings, 0);
    const surplus = Math.max(savings - localTarget, 0);
    const earlierYrs = canNow ? Math.max(0, Math.round(yrsTo(fatTargetHere) - yrsTo(localTarget))) : 0;
    return React.createElement("div", {
      key: city.city,
      className: "card",
      style: {
        borderLeft: `3px solid ${canNow ? "#7EB8A4" : shortfall < fatTargetHere * 0.2 ? "#C9A96E" : "var(--border)"}`
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "0.45rem"
      }
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontFamily: "var(--serif)",
        fontSize: "1rem"
      }
    }, city.city), React.createElement("div", {
      style: {
        fontSize: "0.62rem",
        color: "var(--muted)"
      }
    }, city.country, " \xB7 ", city.region)), React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, React.createElement("div", {
      style: {
        fontSize: "0.7rem",
        fontWeight: 500,
        color: canNow ? "#7EB8A4" : "#E07B6A",
        marginBottom: "0.1rem",
        fontFamily: "var(--mono)"
      }
    }, canNow ? "Ready now ✓" : "Not yet"), React.createElement("div", {
      style: {
        fontFamily: "var(--serif)",
        fontSize: "0.95rem"
      }
    }, fmt(localTarget)), React.createElement("div", {
      style: {
        fontSize: "0.58rem",
        color: "var(--muted2)"
      }
    }, "needed"))), React.createElement("div", {
      style: {
        marginBottom: "0.5rem"
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        fontSize: "0.6rem",
        marginBottom: "0.2rem"
      }
    }, React.createElement("span", {
      style: {
        color: "var(--muted)"
      }
    }, fmt(savings), " of ", fmt(localTarget)), React.createElement("span", {
      style: {
        color: canNow ? "#7EB8A4" : "var(--gold)",
        fontFamily: "var(--serif)"
      }
    }, portfolioPct.toFixed(0), "%")), React.createElement("div", {
      className: "bar",
      style: {
        height: 5
      }
    }, React.createElement("div", {
      className: "bar-fill",
      style: {
        width: `${portfolioPct}%`,
        background: canNow ? "#7EB8A4" : portfolioPct > 75 ? "#C9A96E" : "#E07B6A"
      }
    }))), React.createElement("div", {
      className: "g3",
      style: {
        marginBottom: "0.45rem"
      }
    }, [["Cost Index", city.costIndex, city.costIndex < 45 ? "#7EB8A4" : city.costIndex < 55 ? "#C9A96E" : "var(--text)"], ["Fat FIRE/mo", fmt(localAnnual / 12), "var(--text)"], [canNow ? "Surplus" : "Shortfall", canNow ? `+${fmt(surplus)}` : `-${fmt(shortfall)}`, canNow ? "#7EB8A4" : "#E07B6A"]].map(([l, v, c]) => React.createElement("div", {
      key: l,
      style: {
        background: "var(--surface2)",
        borderRadius: 4,
        padding: "0.35rem",
        textAlign: "center"
      }
    }, React.createElement("div", {
      style: {
        fontSize: "0.57rem",
        color: "var(--muted)",
        textTransform: "uppercase"
      }
    }, l), React.createElement("div", {
      style: {
        fontFamily: "var(--serif)",
        fontSize: "0.85rem",
        color: c
      }
    }, v)))), React.createElement("div", {
      style: {
        fontSize: "0.63rem",
        color: "var(--muted)",
        lineHeight: 1.5
      }
    }, city.note), canNow && earlierYrs > 0 && React.createElement("div", {
      style: {
        marginTop: "0.4rem",
        padding: "0.28rem 0.5rem",
        background: "rgba(126,184,164,0.07)",
        border: "1px solid rgba(126,184,164,0.15)",
        borderRadius: 3,
        fontSize: "0.61rem",
        color: "#7EB8A4"
      }
    }, "~", earlierYrs, " yrs ahead of your home Fat FIRE date"));
  })), results && React.createElement("button", {
    onClick: () => setResults(null),
    className: "pill",
    style: {
      alignSelf: "flex-start",
      color: "var(--muted)"
    }
  }, "\u2190 Back to curated list"));
}
function SettingsPanel({
  geminiKey,
  setGeminiKey
}) {
  const [draft, setDraft] = useState(geminiKey);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = () => {
    setGeminiKey(draft.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return React.createElement("div", {
    className: "fu",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    }
  }, React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "API Keys"), React.createElement("div", {
    style: {
      fontSize: "0.7rem",
      color: "var(--muted)",
      lineHeight: 1.6,
      marginBottom: "0.75rem"
    }
  }, "Your API key is stored only in this browser tab's memory and never sent anywhere except directly to Google's Gemini API. It is not persisted after you close the tab."), React.createElement("label", {
    style: {
      fontSize: "0.68rem",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "var(--muted)",
      display: "block",
      marginBottom: "0.4rem"
    }
  }, "Google Gemini API Key"), React.createElement("div", {
    style: {
      fontSize: "0.62rem",
      color: "var(--muted2)",
      marginBottom: "0.4rem"
    }
  }, "Used for AI city search on the Cities tab. Get a free key at", " ", React.createElement("span", {
    style: {
      color: "var(--gold)"
    }
  }, "aistudio.google.com"), " ", "\u2192 \"Get API key\". Gemini Flash 2.5 has a generous free tier."), React.createElement("div", {
    style: {
      display: "flex",
      gap: "0.5rem",
      marginBottom: "0.5rem"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      background: "var(--input-bg)",
      border: `1px solid ${geminiKey ? "rgba(126,184,164,0.4)" : "var(--border)"}`,
      borderRadius: 4,
      padding: "0.4rem 0.65rem"
    }
  }, React.createElement("input", {
    type: show ? "text" : "password",
    value: draft,
    onChange: e => setDraft(e.target.value),
    placeholder: "AIza\u2026",
    style: {
      flex: 1,
      background: "transparent",
      border: "none",
      outline: "none",
      color: "var(--text)",
      fontFamily: "var(--mono)",
      fontSize: "0.82rem"
    }
  }), React.createElement("button", {
    onClick: () => setShow(s => !s),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "var(--muted)",
      fontSize: "0.72rem",
      padding: "0 0.25rem"
    }
  }, show ? "hide" : "show")), React.createElement("button", {
    onClick: save,
    style: {
      background: saved ? "rgba(126,184,164,0.15)" : "rgba(201,169,110,0.12)",
      border: `1px solid ${saved ? "#7EB8A4" : "var(--gold)"}`,
      borderRadius: 4,
      padding: "0.4rem 0.9rem",
      cursor: "pointer",
      color: saved ? "#7EB8A4" : "var(--gold)",
      fontFamily: "var(--mono)",
      fontSize: "0.72rem",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      transition: "all 0.2s"
    }
  }, saved ? "Saved ✓" : "Save")), geminiKey && React.createElement("div", {
    style: {
      fontSize: "0.62rem",
      color: "#7EB8A4"
    }
  }, "\u2713 Key set \u2014 AI city search is active on the Cities tab")), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "About"), React.createElement("div", {
    style: {
      fontSize: "0.68rem",
      color: "var(--muted)",
      lineHeight: 1.7
    }
  }, React.createElement("div", {
    style: {
      marginBottom: "0.4rem"
    }
  }, "FIRE Calculator \u2014 built for Fat FIRE planning with healthcare cost modelling, global city comparison, and AI-powered location research."), React.createElement("div", {
    style: {
      color: "var(--muted2)"
    }
  }, "Healthcare projections use KFF and Fidelity Retiree Health Cost Estimate data. City cost indices are approximate and based on Numbeo/EIU data. All figures are estimates \u2014 consult a financial advisor for personalised advice."))));
}
function App() {
  const [tab, setTab] = useState("Inputs");
  const [age, setAge] = useState(32);
  const [savings, setSavings] = useState(0);
  const [income, setIncome] = useState(0);
  const [sr, setSr] = useState(0);
  const [partner, setPartner] = useState(0);
  const [psr, setPsr] = useState(0);
  const [ret, setRet] = useState(7);
  const [inf, setInf] = useState(3);
  const [swr, setSwr] = useState(4);
  const [tax, setTax] = useState(25);
  const [activeV, setActiveV] = useState("regular");
  const [cityRegion, setCityRegion] = useState("All");
  const [citySort, setCitySort] = useState("cost");
  const [geminiKey, setGeminiKey] = useState("");
  const [monthly, setMonthly] = useState({
    housing: 0,
    food: 0,
    transport: 0,
    utilities: 0,
    entertainment: 0,
    clothing: 0,
    other: 0
  });
  const [healthMonthly, setHealthMonthly] = useState(0);
  const [annual, setAnnual] = useState({
    travel: 0,
    gifts: 0,
    misc: 0
  });
  const nonHealthAnnual = useMemo(() => {
    const mo = Object.values(monthly).reduce((a, b) => a + b, 0) * 12;
    const yr = Object.values(annual).reduce((a, b) => a + b, 0);
    return mo + yr;
  }, [monthly, annual]);
  const currentHealthAnnual = healthMonthly * 12;
  const totalAnnual = nonHealthAnnual + currentHealthAnnual;
  const realRet = (ret - inf) / 100;
  const nomRet = ret / 100;
  const contrib = useMemo(() => {
    const mine = income * (sr / 100) * (1 - tax / 100);
    const theirs = partner * (psr / 100) * (1 - tax / 100);
    return mine + theirs;
  }, [income, sr, partner, psr, tax]);
  const fireTargetsBase = useMemo(() => ({
    lean: totalAnnual * VARIANTS.lean.spendMult / (swr / 100),
    regular: totalAnnual / (swr / 100),
    fat: totalAnnual * VARIANTS.fat.spendMult / (swr / 100)
  }), [totalAnnual, swr]);
  const yrsTo = useCallback(target => {
    if (target <= 0) return 0;
    let pv = savings;
    for (let y = 0; y <= 60; y++) {
      if (pv >= target) return y;
      pv = pv * (1 + realRet) + contrib;
    }
    return 61;
  }, [savings, contrib, realRet]);
  const projectedFireAge = age + Math.min(yrsTo(fireTargetsBase.regular), 60);
  const hcAdjustment = useMemo(() => {
    let npv = 0;
    for (let y = 0; y <= 30; y++) {
      const a = projectedFireAge + y;
      const extra = Math.max(hcAtAge(a, projectedFireAge, healthMonthly, null) - currentHealthAnnual, 0);
      npv += extra / Math.pow(1 + nomRet, y);
    }
    return npv;
  }, [projectedFireAge, healthMonthly, currentHealthAnnual, nomRet]);
  const fireTargets = useMemo(() => ({
    lean: fireTargetsBase.lean + hcAdjustment * VARIANTS.lean.spendMult,
    regular: fireTargetsBase.regular + hcAdjustment,
    fat: fireTargetsBase.fat + hcAdjustment * VARIANTS.fat.spendMult
  }), [fireTargetsBase, hcAdjustment]);
  const results = useMemo(() => ({
    lean: {
      years: yrsTo(fireTargets.lean),
      target: fireTargets.lean,
      annualSpend: totalAnnual * VARIANTS.lean.spendMult
    },
    regular: {
      years: yrsTo(fireTargets.regular),
      target: fireTargets.regular,
      annualSpend: totalAnnual
    },
    fat: {
      years: yrsTo(fireTargets.fat),
      target: fireTargets.fat,
      annualSpend: totalAnnual * VARIANTS.fat.spendMult
    }
  }), [yrsTo, fireTargets, totalAnnual]);
  const projData = useMemo(() => {
    const d = [];
    let pv = savings;
    for (let y = 0; y <= 40; y++) {
      d.push({
        age: age + y,
        portfolio: Math.round(pv),
        lean: Math.round(fireTargets.lean),
        regular: Math.round(fireTargets.regular),
        fat: Math.round(fireTargets.fat)
      });
      pv = pv * (1 + realRet) + contrib;
    }
    return d;
  }, [savings, contrib, realRet, fireTargets, age]);
  const filteredCities = useMemo(() => {
    let list = cityRegion === "All" ? FAT_CITIES : FAT_CITIES.filter(c => c.region === cityRegion);
    if (citySort === "cost") return [...list].sort((a, b) => a.costIndex - b.costIndex);
    if (citySort === "alpha") return [...list].sort((a, b) => a.city.localeCompare(b.city));
    if (citySort === "ready") {
      const fatAnnual = totalAnnual * VARIANTS.fat.spendMult;
      return [...list].sort((a, b) => {
        const tgtA = fatAnnual * a.costIndex / 100 / (swr / 100);
        const tgtB = fatAnnual * b.costIndex / 100 / (swr / 100);
        const readyA = savings >= tgtA,
          readyB = savings >= tgtB;
        if (readyA && !readyB) return -1;
        if (!readyA && readyB) return 1;
        return tgtA - tgtB;
      });
    }
    return list;
  }, [cityRegion, citySort, savings, totalAnnual, swr]);
  const fatAnnualHere = totalAnnual * VARIANTS.fat.spendMult;
  const fatTargetHere = fireTargets.fat;
  const Tip = ({
    active,
    payload,
    label
  }) => {
    if (!active || !payload?.length) return null;
    return React.createElement("div", {
      style: {
        background: "#161714",
        border: "1px solid #2C2D29",
        borderRadius: 6,
        padding: "0.6rem 0.8rem",
        fontSize: "0.72rem"
      }
    }, React.createElement("div", {
      style: {
        color: "#7A7B74",
        marginBottom: "0.3rem"
      }
    }, "Age ", label), payload.map(p => React.createElement("div", {
      key: p.dataKey,
      style: {
        color: p.color
      }
    }, p.name, ": ", fmt(p.value))));
  };
  const [targetAge, setTargetAge] = useState(Math.min(Math.max(projectedFireAge, age + 1), 70));
  const targetYears = Math.max(targetAge - age, 0);
  const fireAgeForSR = s => {
    const c = income * (s / 100) * (1 - tax / 100) + partner * (psr / 100) * (1 - tax / 100);
    let pv = savings;
    for (let y = 0; y <= 60; y++) {
      if (pv >= fireTargets.regular) return age + y;
      pv = pv * (1 + realRet) + c;
    }
    return null;
  };
  const fireAgeForRet = r => {
    const rr = (r - inf) / 100;
    let pv = savings;
    for (let y = 0; y <= 60; y++) {
      if (pv >= fireTargets.regular) return age + y;
      pv = pv * (1 + rr) + contrib;
    }
    return null;
  };
  const scTarget = fireTargets.regular;
  const scGrow = Math.pow(1 + realRet, targetYears);
  const scAnnuity = Math.abs(realRet) < 1e-9 ? targetYears : (scGrow - 1) / realRet;
  const partnerContrib = partner * (psr / 100) * (1 - tax / 100);
  const incomeNet = income * (1 - tax / 100);
  const needContribTotal = scAnnuity > 0 ? (scTarget - savings * scGrow) / scAnnuity : Infinity;
  const reqContribMine = Math.max(0, needContribTotal - partnerContrib);
  const reqSR = incomeNet > 0 ? needContribTotal <= 0 ? 0 : reqContribMine / incomeNet * 100 : null;
  const needSavingsNow = scGrow > 0 ? (scTarget - contrib * scAnnuity) / scGrow : Infinity;
  const extraNow = Math.max(0, needSavingsNow - savings);
  const reqReturn = (() => {
    if (savings <= 0 && contrib <= 0) return null;
    const fv = rNom => {
      const rr = rNom - inf / 100;
      const g = Math.pow(1 + rr, targetYears);
      const af = Math.abs(rr) < 1e-9 ? targetYears : (g - 1) / rr;
      return savings * g + contrib * af;
    };
    if (fv(0) >= scTarget) return 0;
    if (fv(50) < scTarget) return Infinity;
    let lo = 0,
      hi = 50;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2;
      if (fv(mid) >= scTarget) hi = mid;else lo = mid;
    }
    return hi * 100;
  })();
  return React.createElement("div", {
    style: {
      "--bg": "#0E0F0D",
      "--surface": "#161714",
      "--surface2": "#1E1F1C",
      "--border": "#2C2D29",
      "--text": "#E8E4D9",
      "--muted": "#7A7B74",
      "--muted2": "#52534E",
      "--gold": "#C9A96E",
      "--green": "#7EB8A4",
      "--input-bg": "#1A1B18",
      "--serif": "'Playfair Display', Georgia, serif",
      "--mono": "'DM Mono', 'Courier New', monospace",
      background: "var(--bg)",
      color: "var(--text)",
      fontFamily: "var(--mono)",
      minHeight: "100vh",
      fontSize: "0.82rem",
      lineHeight: 1.5,
      overflowX: "hidden"
    }
  }, React.createElement("style", null, `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=DM+Mono:wght@300;400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=range] { -webkit-appearance: none; width: 100%; height: 2px; background: #2C2D29; border-radius: 2px; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 3px rgba(201,169,110,0.15); }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #2C2D29; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
        .tab { background: none; border: none; border-bottom: 1.5px solid transparent; cursor: pointer; font-family: var(--mono); font-size: 0.61rem; letter-spacing: 0.09em; text-transform: uppercase; padding: 0.5rem 0.65rem; color: var(--muted); transition: color 0.15s; white-space: nowrap; }
        .tab:hover { color: var(--text); }
        .tab.on { color: var(--gold); border-bottom-color: var(--gold); }
        .pill { background: none; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-family: var(--mono); font-size: 0.61rem; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.25rem 0.55rem; color: var(--muted); transition: all 0.15s; }
        .pill:hover { color: var(--text); }
        .bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease; }
        @keyframes fu { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .fu { animation: fu 0.25s ease forwards; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; }
        .sl { font-size: 0.62rem; letter-spacing: 0.13em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.8rem; }
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 0.3rem 0.4rem; }
        th { font-weight: 400; }
        tr + tr td { border-top: 1px solid var(--border); }
      `), React.createElement("div", {
    style: {
      borderBottom: "1px solid var(--border)",
      padding: "0.9rem 1rem 0"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: "0.6rem",
      marginBottom: "0.45rem",
      flexWrap: "wrap"
    }
  }, React.createElement("h1", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "1.3rem",
      fontWeight: 400
    }
  }, "FIRE Calculator"), React.createElement("span", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted)",
      letterSpacing: "0.12em",
      textTransform: "uppercase"
    }
  }, "Financial Independence \xB7 Retire Early")), React.createElement("div", {
    style: {
      display: "flex",
      gap: "0.5rem 1rem",
      marginBottom: "0.55rem",
      flexWrap: "wrap"
    }
  }, Object.entries(VARIANTS).map(([k, v]) => React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "0.3rem"
    }
  }, React.createElement("div", {
    style: {
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: v.color,
      flexShrink: 0
    }
  }), React.createElement("span", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.06em"
    }
  }, v.label), React.createElement("span", {
    style: {
      fontSize: "0.76rem",
      fontFamily: "var(--serif)",
      color: v.color
    }
  }, results[k].years >= 60 ? "60+" : `Age ${age + Math.round(results[k].years)}`))), hcAdjustment > 0 && React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "0.3rem",
      borderLeft: "1px solid var(--border)",
      paddingLeft: "0.75rem"
    }
  }, React.createElement("span", {
    style: {
      fontSize: "0.58rem",
      color: "#E07B6A",
      letterSpacing: "0.06em"
    }
  }, "+", fmt(hcAdjustment), " HC adj."))), React.createElement("div", {
    style: {
      display: "flex",
      overflowX: "auto"
    }
  }, TABS.map(t => React.createElement("button", {
    key: t,
    className: `tab ${tab === t ? "on" : ""}`,
    onClick: () => setTab(t)
  }, t)))), React.createElement("div", {
    style: {
      padding: "1rem",
      overflowY: "auto"
    }
  }, tab === "Inputs" && React.createElement("div", {
    className: "fu",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    }
  }, React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "Profile"), React.createElement("div", {
    className: "g2"
  }, React.createElement("div", null, React.createElement(Slider, {
    label: "Current Age",
    value: age,
    onChange: setAge,
    min: 20,
    max: 60,
    step: 1,
    format: v => `${v}`
  }), React.createElement(NumInput, {
    label: "Current Portfolio",
    value: savings,
    onChange: setSavings,
    sub: "401k, IRA, brokerage combined"
  }), React.createElement(NumInput, {
    label: "Annual Gross Income",
    value: income,
    onChange: setIncome
  })), React.createElement("div", null, React.createElement(Slider, {
    label: "Savings Rate",
    value: sr,
    onChange: setSr,
    min: 0,
    max: 70,
    step: 1,
    format: v => `${v}%`,
    sub: `≈ ${fmt(income * sr / 100 * (1 - tax / 100))} after-tax/yr`
  }), React.createElement(NumInput, {
    label: "Partner Income (optional)",
    value: partner,
    onChange: setPartner
  }), partner > 0 && React.createElement(Slider, {
    label: "Partner Savings Rate",
    value: psr,
    onChange: setPsr,
    min: 0,
    max: 70,
    step: 1,
    format: v => `${v}%`
  })))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "Returns & Rates"), React.createElement("div", {
    className: "g2"
  }, React.createElement("div", null, React.createElement(Slider, {
    label: "Return (nominal)",
    value: ret,
    onChange: setRet,
    min: 3,
    max: 12,
    step: 0.5,
    format: v => `${v}%`,
    sub: "S&P 500 long-run avg ~10%"
  }), React.createElement(Slider, {
    label: "Inflation",
    value: inf,
    onChange: setInf,
    min: 1,
    max: 6,
    step: 0.25,
    format: v => `${v}%`
  }), React.createElement("div", {
    style: {
      background: "var(--surface2)",
      borderRadius: 4,
      padding: "0.45rem 0.6rem",
      marginBottom: "0.5rem",
      display: "flex",
      justifyContent: "space-between",
      fontSize: "0.7rem"
    }
  }, React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, "Real Return"), React.createElement("span", {
    style: {
      color: "var(--green)",
      fontFamily: "var(--serif)"
    }
  }, (ret - inf).toFixed(2), "%"))), React.createElement("div", null, React.createElement(Slider, {
    label: "Safe Withdrawal Rate",
    value: swr,
    onChange: setSwr,
    min: 3,
    max: 5,
    step: 0.1,
    format: v => `${v}%`,
    sub: "4% = Trinity Study"
  }), React.createElement(Slider, {
    label: "Effective Tax Rate",
    value: tax,
    onChange: setTax,
    min: 0,
    max: 45,
    step: 1,
    format: v => `${v}%`
  })))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: "0.8rem"
    }
  }, React.createElement("div", {
    className: "sl",
    style: {
      marginBottom: 0
    }
  }, "Monthly Expenses"), React.createElement("span", {
    style: {
      fontSize: "0.65rem",
      color: "var(--muted)"
    }
  }, fmt(Object.values(monthly).reduce((a, b) => a + b, 0) * 12), "/yr")), MONTHLY_CATS.map(c => React.createElement(SpendRow, {
    key: c.key,
    label: c.label,
    hint: c.hint,
    isMonthly: true,
    value: monthly[c.key] ?? 0,
    onChange: v => setMonthly(m => ({
      ...m,
      [c.key]: v
    }))
  })), React.createElement("div", {
    style: {
      borderTop: "1px solid rgba(224,123,106,0.25)",
      paddingTop: "0.5rem",
      marginTop: "0.25rem"
    }
  }, React.createElement(SpendRow, {
    label: "Health Insurance",
    hint: "premiums + out-of-pocket \u2014 projected by phase in Healthcare tab",
    isMonthly: true,
    value: healthMonthly,
    onChange: setHealthMonthly
  }), React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "#E07B6A",
      marginTop: "-0.25rem",
      marginBottom: "0.5rem",
      paddingLeft: "0.1rem"
    }
  }, "This amount is phase-projected: ACA pre-65 \u2192 Medicare 65\u201374 \u2192 Medicare + LTC 75+")), React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      paddingTop: "0.5rem",
      marginTop: "0.3rem",
      display: "flex",
      justifyContent: "space-between",
      fontSize: "0.7rem"
    }
  }, React.createElement("span", {
    style: {
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    }
  }, "Monthly total"), React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      color: "var(--gold)"
    }
  }, fmt(Object.values(monthly).reduce((a, b) => a + b, 0) + healthMonthly), "/mo"))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: "0.8rem"
    }
  }, React.createElement("div", {
    className: "sl",
    style: {
      marginBottom: 0
    }
  }, "Annual Expenses"), React.createElement("span", {
    style: {
      fontSize: "0.65rem",
      color: "var(--muted)"
    }
  }, "one-time or irregular")), ANNUAL_CATS.map(c => React.createElement(SpendRow, {
    key: c.key,
    label: c.label,
    hint: c.hint,
    isMonthly: false,
    value: annual[c.key] ?? 0,
    onChange: v => setAnnual(a => ({
      ...a,
      [c.key]: v
    }))
  })), React.createElement("div", {
    style: {
      borderTop: "1px solid var(--border)",
      paddingTop: "0.5rem",
      marginTop: "0.3rem",
      display: "flex",
      justifyContent: "space-between",
      fontSize: "0.7rem"
    }
  }, React.createElement("span", {
    style: {
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    }
  }, "Annual extras"), React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      color: "var(--gold)"
    }
  }, fmt(Object.values(annual).reduce((a, b) => a + b, 0)), "/yr"))), React.createElement("div", {
    className: "card",
    style: {
      borderColor: "rgba(201,169,110,0.3)"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "0.4rem"
    }
  }, React.createElement("span", {
    style: {
      fontSize: "0.65rem",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.1em"
    }
  }, "Total Annual Spend"), React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "1.4rem",
      color: "var(--gold)"
    }
  }, fmt(totalAnnual))), React.createElement("div", {
    style: {
      fontSize: "0.62rem",
      color: "var(--muted2)"
    }
  }, fmt(totalAnnual / 12), "/mo avg \xB7 feeds all FIRE targets \xB7 healthcare projected separately"))), tab === "Projection" && React.createElement("div", {
    className: "fu",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      gap: "0.4rem",
      flexWrap: "wrap"
    }
  }, Object.entries(VARIANTS).map(([k, v]) => React.createElement("button", {
    key: k,
    className: "pill",
    onClick: () => setActiveV(k),
    style: activeV === k ? {
      borderColor: v.color,
      color: v.color,
      background: `${v.color}12`
    } : {}
  }, v.label))), React.createElement("div", {
    className: "g2"
  }, [{
    label: "Target",
    value: fmt(results[activeV]?.target),
    sub: `at ${swr}% SWR`
  }, {
    label: "Years Away",
    value: fmtYrs(results[activeV]?.years),
    sub: `FIRE age ${age + Math.round(results[activeV]?.years ?? 0)}`
  }, {
    label: "Portfolio",
    value: fmt(savings),
    sub: `${pct(savings, results[activeV]?.target)}% of target`
  }, {
    label: "Annual Contrib",
    value: fmt(contrib),
    sub: `${sr}% SR · ${fmt(totalAnnual)}/yr spend`
  }].map(s => React.createElement("div", {
    key: s.label,
    className: "card",
    style: {
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      marginBottom: "0.25rem"
    }
  }, s.label), React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "1.2rem",
      color: "var(--gold)",
      marginBottom: "0.15rem"
    }
  }, s.value), React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted2)",
      lineHeight: 1.3
    }
  }, s.sub)))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "0.35rem",
      fontSize: "0.68rem"
    }
  }, React.createElement("span", {
    style: {
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    }
  }, "Progress to ", VARIANTS[activeV].label), React.createElement("span", {
    style: {
      color: "var(--gold)",
      fontFamily: "var(--serif)"
    }
  }, pct(savings, results[activeV]?.target), "%")), React.createElement("div", {
    style: {
      height: 6,
      background: "var(--border)",
      borderRadius: 3,
      overflow: "hidden"
    }
  }, React.createElement("div", {
    style: {
      height: "100%",
      width: `${pct(savings, results[activeV]?.target)}%`,
      background: `linear-gradient(90deg, ${VARIANTS[activeV]?.color}55, ${VARIANTS[activeV]?.color})`,
      borderRadius: 3,
      transition: "width 0.5s"
    }
  }))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "Portfolio Growth vs. FIRE Targets (HC-adjusted)"), React.createElement(ResponsiveContainer, {
    width: "100%",
    height: 250
  }, React.createElement(AreaChart, {
    data: projData,
    margin: {
      top: 8,
      right: 8,
      left: 0,
      bottom: 0
    }
  }, React.createElement("defs", null, React.createElement("linearGradient", {
    id: "pg",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, React.createElement("stop", {
    offset: "5%",
    stopColor: "#C9A96E",
    stopOpacity: 0.2
  }), React.createElement("stop", {
    offset: "95%",
    stopColor: "#C9A96E",
    stopOpacity: 0
  }))), React.createElement(CartesianGrid, {
    strokeDasharray: "3 3",
    stroke: "#2C2D29"
  }), React.createElement(XAxis, {
    dataKey: "age",
    stroke: "#52534E",
    tick: {
      fontSize: 9,
      fill: "#7A7B74"
    }
  }), React.createElement(YAxis, {
    stroke: "#52534E",
    tick: {
      fontSize: 9,
      fill: "#7A7B74"
    },
    tickFormatter: fmt,
    width: 52
  }), React.createElement(Tooltip, {
    content: React.createElement(Tip, null)
  }), React.createElement(Area, {
    type: "monotone",
    dataKey: "portfolio",
    name: "Portfolio",
    stroke: "#C9A96E",
    fill: "url(#pg)",
    strokeWidth: 2,
    dot: false
  }), React.createElement(Line, {
    type: "monotone",
    dataKey: "lean",
    name: "Lean FIRE",
    stroke: "#7EB8A4",
    strokeWidth: 1,
    strokeDasharray: "4 3",
    dot: false
  }), React.createElement(Line, {
    type: "monotone",
    dataKey: "regular",
    name: "FIRE",
    stroke: "#C9A96E",
    strokeWidth: 1,
    strokeDasharray: "4 3",
    dot: false
  }), React.createElement(Line, {
    type: "monotone",
    dataKey: "fat",
    name: "Fat FIRE",
    stroke: "#E07B6A",
    strokeWidth: 1,
    strokeDasharray: "4 3",
    dot: false
  }), results[activeV].years < 60 && React.createElement(ReferenceLine, {
    x: age + Math.round(results[activeV].years),
    stroke: VARIANTS[activeV].color,
    strokeDasharray: "5 3",
    label: {
      value: "FIRE",
      fill: VARIANTS[activeV].color,
      fontSize: 9
    }
  })))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "FIRE Targets (healthcare-adjusted)"), hcAdjustment > 0 && React.createElement("div", {
    style: {
      background: "rgba(224,123,106,0.07)",
      border: "1px solid rgba(224,123,106,0.2)",
      borderRadius: 4,
      padding: "0.5rem 0.65rem",
      marginBottom: "0.75rem",
      fontSize: "0.68rem"
    }
  }, React.createElement("span", {
    style: {
      color: "#E07B6A"
    }
  }, "+", fmt(hcAdjustment)), React.createElement("span", {
    style: {
      color: "var(--muted)"
    }
  }, " added to each target as NPV of projected excess healthcare costs over 30-yr retirement. "), React.createElement("span", {
    style: {
      color: "var(--muted2)"
    }
  }, "See Healthcare tab for detail.")), Object.entries(VARIANTS).map(([k, v]) => {
    const r = results[k];
    return React.createElement("div", {
      key: k,
      style: {
        marginBottom: "0.7rem",
        paddingBottom: "0.7rem",
        borderBottom: "1px solid var(--border)"
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: "0.2rem"
      }
    }, React.createElement("span", {
      style: {
        fontSize: "0.7rem",
        color: v.color,
        textTransform: "uppercase",
        letterSpacing: "0.08em"
      }
    }, v.label), React.createElement("span", {
      style: {
        fontFamily: "var(--serif)",
        fontSize: "1rem"
      }
    }, fmt(r.target))), React.createElement("div", {
      style: {
        fontSize: "0.6rem",
        color: "var(--muted2)",
        marginBottom: "0.25rem"
      }
    }, fmt(r.annualSpend), "/yr spend \xB7 ", swr, "% SWR"), React.createElement("div", {
      className: "bar"
    }, React.createElement("div", {
      className: "bar-fill",
      style: {
        width: `${pct(savings, r.target)}%`,
        background: v.color
      }
    })));
  })), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "Budget by FIRE Target"), React.createElement("div", {
    style: {
      overflowX: "auto"
    }
  }, React.createElement("table", null, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    style: {
      textAlign: "left",
      color: "var(--muted)",
      fontSize: "0.6rem",
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    }
  }, "Category"), React.createElement("th", {
    style: {
      textAlign: "right",
      color: "var(--muted)",
      fontSize: "0.6rem"
    }
  }, "Your Budget"), ["lean", "regular", "fat"].map(k => React.createElement("th", {
    key: k,
    style: {
      textAlign: "right",
      color: VARIANTS[k].color,
      fontSize: "0.6rem",
      textTransform: "uppercase"
    }
  }, VARIANTS[k].label)))), React.createElement("tbody", null, MONTHLY_CATS.map(c => {
    const v = (monthly[c.key] ?? 0) * 12;
    return React.createElement("tr", {
      key: c.key
    }, React.createElement("td", {
      style: {
        color: "var(--muted)",
        fontSize: "0.65rem"
      }
    }, c.label), React.createElement("td", {
      style: {
        textAlign: "right",
        fontFamily: "var(--serif)",
        fontSize: "0.78rem"
      }
    }, fmt(v)), [0.6, 1.0, 1.6].map((m, i) => React.createElement("td", {
      key: i,
      style: {
        textAlign: "right",
        fontFamily: "var(--serif)",
        fontSize: "0.78rem",
        color: ["var(--green)", "var(--gold)", "#E07B6A"][i]
      }
    }, fmt(v * m))));
  }), React.createElement("tr", null, React.createElement("td", {
    style: {
      color: "#E07B6A",
      fontSize: "0.65rem"
    }
  }, "Health (today)"), React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "var(--serif)",
      fontSize: "0.78rem"
    }
  }, fmt(currentHealthAnnual)), [0.6, 1.0, 1.6].map((m, i) => React.createElement("td", {
    key: i,
    style: {
      textAlign: "right",
      fontFamily: "var(--serif)",
      fontSize: "0.78rem",
      color: "#E07B6A",
      fontStyle: "italic"
    }
  }, "phase-adj."))), ANNUAL_CATS.map(c => {
    const v = annual[c.key] ?? 0;
    return React.createElement("tr", {
      key: c.key
    }, React.createElement("td", {
      style: {
        color: "var(--muted)",
        fontSize: "0.65rem"
      }
    }, c.label), React.createElement("td", {
      style: {
        textAlign: "right",
        fontFamily: "var(--serif)",
        fontSize: "0.78rem"
      }
    }, fmt(v)), [0.6, 1.0, 1.6].map((m, i) => React.createElement("td", {
      key: i,
      style: {
        textAlign: "right",
        fontFamily: "var(--serif)",
        fontSize: "0.78rem",
        color: ["var(--green)", "var(--gold)", "#E07B6A"][i]
      }
    }, fmt(v * m))));
  })), React.createElement("tfoot", null, React.createElement("tr", {
    style: {
      borderTop: "1px solid var(--muted2)"
    }
  }, React.createElement("td", {
    style: {
      color: "var(--muted)",
      fontSize: "0.65rem",
      textTransform: "uppercase",
      paddingTop: "0.45rem"
    }
  }, "Total/yr"), React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "var(--serif)",
      paddingTop: "0.45rem"
    }
  }, fmt(totalAnnual)), ["lean", "regular", "fat"].map(k => React.createElement("td", {
    key: k,
    style: {
      textAlign: "right",
      fontFamily: "var(--serif)",
      fontSize: "0.85rem",
      color: VARIANTS[k].color,
      paddingTop: "0.45rem"
    }
  }, fmt(totalAnnual * VARIANTS[k].spendMult)))), React.createElement("tr", null, React.createElement("td", {
    style: {
      color: "var(--muted)",
      fontSize: "0.62rem",
      textTransform: "uppercase"
    }
  }, "FIRE Target (HC-adj)"), React.createElement("td", {
    style: {
      textAlign: "right",
      fontFamily: "var(--serif)",
      fontSize: "0.78rem"
    }
  }, fmt(fireTargets.regular)), ["lean", "regular", "fat"].map(k => React.createElement("td", {
    key: k,
    style: {
      textAlign: "right",
      fontFamily: "var(--serif)",
      fontSize: "0.78rem",
      color: VARIANTS[k].color
    }
  }, fmt(fireTargets[k]))))))))), tab === "Healthcare" && React.createElement("div", {
    className: "fu",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    }
  }, React.createElement("div", {
    className: "card",
    style: {
      borderColor: "rgba(224,123,106,0.3)"
    }
  }, React.createElement("div", {
    className: "sl"
  }, "Healthcare & Your FIRE Number"), React.createElement("div", {
    style: {
      fontSize: "0.72rem",
      color: "var(--muted)",
      lineHeight: 1.6,
      marginBottom: "0.85rem"
    }
  }, "Healthcare gets more expensive as you age \u2014 and pricier once you leave an employer plan. We estimate how much your health costs rise ", React.createElement("em", null, "above"), " normal inflation across retirement, then add that extra to your FIRE number so it isn't a surprise."), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      background: "rgba(224,123,106,0.07)",
      border: "1px solid rgba(224,123,106,0.2)",
      borderRadius: 6,
      padding: "0.7rem 0.85rem"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: "0.62rem",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.09em"
    }
  }, "Added to your FIRE target"), React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted2)",
      marginTop: "0.15rem"
    }
  }, "Based on ", fmt(healthMonthly), "/mo today, set on the Inputs tab")), React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "1.5rem",
      color: "#E07B6A"
    }
  }, "+", fmt(hcAdjustment)))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "The Three Phases"), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem"
    }
  }, HC_PHASES.map(p => React.createElement("div", {
    key: p.key,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      background: "var(--surface2)",
      borderRadius: 5,
      padding: "0.55rem 0.7rem",
      borderLeft: `3px solid ${p.color}`
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: "0.72rem",
      color: p.color
    }
  }, p.label), React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted2)"
    }
  }, "Ages ", p.ageRange)), React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      color: p.color,
      fontSize: "0.9rem"
    }
  }, "~", fmt(p.baseMonthly), "/mo")))), React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted2)",
      marginTop: "0.6rem",
      lineHeight: 1.5
    }
  }, "Pre-65 you buy private ACA coverage (the priciest stretch). Medicare starts at 65 and lowers costs. After 75, long-term-care risk pushes them back up. Change the starting point with \"Health Insurance\" on the Inputs tab."))), tab === "Scenarios" && React.createElement("div", {
    className: "fu",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem"
    }
  }, React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "Pick a Retirement Age"), React.createElement(Slider, {
    label: "Target FIRE Age",
    value: targetAge,
    onChange: setTargetAge,
    min: age + 1,
    max: 70,
    step: 1,
    format: v => `${v}`,
    sub: `${targetYears} yrs from now · reach ${fmt(fireTargets.regular)} (HC-adjusted)`
  }), React.createElement("div", {
    className: "g2",
    style: {
      marginTop: "0.25rem"
    }
  }, React.createElement("div", {
    style: {
      background: "var(--surface2)",
      borderRadius: 6,
      padding: "0.7rem",
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      fontSize: "0.59rem",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.09em",
      marginBottom: "0.25rem"
    }
  }, "Savings rate needed"), React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "1.4rem",
      color: reqSR == null ? "var(--gold)" : reqSR === 0 ? "var(--green)" : reqSR <= sr ? "var(--green)" : reqSR <= 100 ? "var(--gold)" : "#E07B6A"
    }
  }, reqSR == null ? fmt(reqContribMine) + "/yr" : reqSR === 0 ? "0%" : `${Math.round(reqSR)}%`), React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted2)",
      marginTop: "0.15rem"
    }
  }, reqSR == null ? "enter income to see a rate" : reqSR === 0 ? "your savings already grow there" : reqSR > 100 ? `≈ ${fmt(reqContribMine)}/yr — more than you earn` : `≈ ${fmt(reqContribMine)}/yr · you're at ${sr}% now`)), React.createElement("div", {
    style: {
      background: "var(--surface2)",
      borderRadius: 6,
      padding: "0.7rem",
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      fontSize: "0.59rem",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.09em",
      marginBottom: "0.25rem"
    }
  }, "Return needed"), React.createElement("div", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: "1.4rem",
      color: reqReturn == null || reqReturn === Infinity ? "#E07B6A" : reqReturn <= ret ? "var(--green)" : reqReturn <= 15 ? "var(--gold)" : "#E07B6A"
    }
  }, reqReturn == null ? "—" : reqReturn === Infinity ? "none" : reqReturn >= 100 ? `${Math.round(reqReturn)}%` : `${reqReturn.toFixed(1)}%`), React.createElement("div", {
    style: {
      fontSize: "0.58rem",
      color: "var(--muted2)",
      marginTop: "0.15rem"
    }
  }, reqReturn == null ? "with $0 invested, returns can't help" : reqReturn === Infinity ? "no return is enough — must save more" : reqReturn <= 15 ? `nominal · you're at ${ret}% now` : `nominal · far above market norms`))), extraNow > 0 && isFinite(extraNow) && React.createElement("div", {
    style: {
      marginTop: "0.5rem",
      padding: "0.45rem 0.6rem",
      background: "rgba(201,169,110,0.07)",
      border: "1px solid rgba(201,169,110,0.2)",
      borderRadius: 4,
      fontSize: "0.65rem",
      color: "var(--muted)"
    }
  }, "Or invest ", React.createElement("span", {
    style: {
      color: "var(--gold)",
      fontFamily: "var(--serif)"
    }
  }, fmt(extraNow)), " more today, on top of your current ", fmt(savings), "."), React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted2)",
      marginTop: "0.6rem",
      lineHeight: 1.5
    }
  }, "Each figure is what it would take on its own to hit age ", targetAge, " \u2014 holding everything else at your current Inputs. For a year or two out, expect eye-watering numbers: that's the point.")), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "If You Change Your Savings Rate"), React.createElement("div", {
    className: "g3",
    style: {
      gap: "0.4rem"
    }
  }, [20, 25, 30, 35, 40, 50].map(s => {
    const fa = fireAgeForSR(s);
    const hits = fa != null && fa <= targetAge;
    const cur = s === sr;
    return React.createElement("div", {
      key: s,
      style: {
        background: cur ? "rgba(201,169,110,0.09)" : "var(--surface2)",
        border: cur ? "1px solid var(--gold)" : hits ? "1px solid rgba(126,184,164,0.4)" : "1px solid transparent",
        borderRadius: 6,
        padding: "0.55rem",
        textAlign: "center"
      }
    }, React.createElement("div", {
      style: {
        fontSize: "0.59rem",
        color: cur ? "var(--gold)" : "var(--muted)",
        textTransform: "uppercase",
        marginBottom: "0.15rem"
      }
    }, "SR ", s, "%"), React.createElement("div", {
      style: {
        fontFamily: "var(--serif)",
        fontSize: "1rem",
        color: hits ? "var(--green)" : "var(--text)"
      }
    }, fa == null || fa > age + 60 ? "60+" : `age ${fa}`), React.createElement("div", {
      style: {
        fontSize: "0.57rem",
        color: "var(--muted2)"
      }
    }, fa == null ? "" : fa <= targetAge ? "on time" : `${fa - targetAge}y late`));
  }))), React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "sl"
  }, "If Markets Return Differently"), React.createElement("div", {
    className: "g3",
    style: {
      gap: "0.4rem"
    }
  }, [4, 5, 6, 7, 8, 9].map(r => {
    const fa = fireAgeForRet(r);
    const hits = fa != null && fa <= targetAge;
    const cur = r === Math.round(ret);
    return React.createElement("div", {
      key: r,
      style: {
        background: cur ? "rgba(201,169,110,0.09)" : "var(--surface2)",
        border: cur ? "1px solid var(--gold)" : hits ? "1px solid rgba(126,184,164,0.4)" : "1px solid transparent",
        borderRadius: 6,
        padding: "0.55rem",
        textAlign: "center"
      }
    }, React.createElement("div", {
      style: {
        fontSize: "0.59rem",
        color: cur ? "var(--gold)" : "var(--muted)",
        textTransform: "uppercase",
        marginBottom: "0.15rem"
      }
    }, r, "% ret"), React.createElement("div", {
      style: {
        fontFamily: "var(--serif)",
        fontSize: "1rem",
        color: hits ? "var(--green)" : "var(--text)"
      }
    }, fa == null || fa > age + 60 ? "60+" : `age ${fa}`), React.createElement("div", {
      style: {
        fontSize: "0.57rem",
        color: "var(--muted2)"
      }
    }, fa == null ? "" : fa <= targetAge ? "on time" : `${fa - targetAge}y late`));
  })), React.createElement("div", {
    style: {
      fontSize: "0.6rem",
      color: "var(--muted2)",
      marginTop: "0.6rem",
      lineHeight: 1.5
    }
  }, "Green = reaches your target age of ", targetAge, ". Returns are nominal; your inflation assumption (", inf, "%) still applies."))), tab === "Cities" && React.createElement(CitiesTab, {
    savings: savings,
    swr: swr,
    fatAnnualHere: fatAnnualHere,
    fatTargetHere: fatTargetHere,
    yrsTo: yrsTo,
    filteredCities: filteredCities,
    cityRegion: cityRegion,
    setCityRegion: setCityRegion,
    citySort: citySort,
    setCitySort: setCitySort,
    totalAnnual: totalAnnual,
    age: age,
    income: income,
    sr: sr,
    geminiKey: geminiKey
  }), tab === "⚙" && React.createElement(SettingsPanel, {
    geminiKey: geminiKey,
    setGeminiKey: setGeminiKey
  })));
}
document.getElementById("loading").remove();
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));
