// Source for app.js. Recompile after edits:
//   npx esbuild app.jsx --loader:.jsx=jsx --jsx=transform --minify --target=es2020 --outfile=app.js
const { useState, useEffect, useCallback, useRef } = React;

const SOURCES = {
  met:    { name: "The Met",           accent: "#9B7F62" },
  va:     { name: "V&A",               accent: "#7B8F6B" },
  aic:    { name: "Art Inst. Chicago", accent: "#8B6B7B" },
  cma:    { name: "Cleveland",         accent: "#7A6A4A" },
  jpsearch: { name: "Japan Search",     accent: "#5A7A6A" },
};

const CATEGORIES = {
  "All Ceramics":    ["ceramics", "pottery", "stoneware", "porcelain"],
  "Tea Bowls":       ["tea bowl", "chawan", "tenmoku tea bowl"],
  "Vases":           ["vase ceramic", "vase porcelain", "vase stoneware"],
  "Bowls":           ["bowl ceramic", "bowl porcelain", "bowl stoneware"],
  "Jars & Bottles":  ["jar stoneware", "bottle ceramic", "jar porcelain"],
  "Plates & Dishes": ["plate ceramic", "dish porcelain", "plate stoneware"],
  "Teapots & Ewers": ["teapot", "ewer ceramic", "teapot stoneware"],
  "East Asian":      ["Song dynasty ceramics", "Japanese ceramics", "Korean celadon"],
  "Celadon":         ["celadon", "celadon glaze", "Longquan celadon"],
  "Raku & Bizen":    ["raku ware", "Bizen pottery", "Shigaraki ware"],
};

const PER_SOURCE = 10;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getMetIds(query) {
  try {
    const res = await fetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`
    );
    const data = await res.json();
    return shuffleArray(data.objectIDs || []);
  } catch { return []; }
}

async function fetchMetObjects(ids) {
  try {
    const objects = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
          const obj = await r.json();
          if (!obj.primaryImageSmall) return null;
          return {
            id: `met-${obj.objectID}`, source: "met",
            title: obj.title || "Untitled",
            artist: obj.artistDisplayName || null,
            date: obj.objectDate || null,
            culture: obj.culture || null,
            medium: obj.medium || null,
            period: obj.period || null,
            imageUrl: obj.primaryImageSmall,
            imageLarge: obj.primaryImage || obj.primaryImageSmall,
            link: obj.objectURL,
            classification: obj.classification || null,
          };
        } catch { return null; }
      })
    );
    return objects.filter(Boolean);
  } catch { return []; }
}

async function searchVA(query, page = 1) {
  try {
    const res = await fetch(
      `https://api.vam.ac.uk/v2/objects/search?q=${encodeURIComponent(query)}&page_size=${PER_SOURCE}&page=${page}&images_exist=1`
    );
    const data = await res.json();
    if (!data.records?.length) return [];
    return data.records.map((r) => {
      const imgBase = r._images?._iiif_image_base_url;
      if (!imgBase) return null;
      return {
        id: `va-${r.systemNumber}`, source: "va",
        title: r._primaryTitle || r.objectType || "Untitled",
        artist: r._primaryMaker?.name || null,
        date: r._primaryDate || null,
        culture: r._primaryPlace || null,
        medium: null, period: null,
        imageUrl: `${imgBase}full/!600,600/0/default.jpg`,
        imageLarge: `${imgBase}full/!1200,1200/0/default.jpg`,
        link: `https://collections.vam.ac.uk/item/${r.systemNumber}`,
        classification: r.objectType || null,
      };
    }).filter(Boolean);
  } catch (e) { console.error("V&A error:", e); return []; }
}

async function searchAIC(query, page = 1) {
  try {
    const fields = "id,title,artist_title,date_display,place_of_origin,medium_display,image_id,artwork_type_title,classification_title,style_title";
    const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=${PER_SOURCE}&page=${page}&fields=${fields}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.data?.length) return [];
    const iiifBase = data.config?.iiif_url || "https://www.artic.edu/iiif/2";
    return data.data.map((a) => {
      if (!a.image_id) return null;
      return {
        id: `aic-${a.id}`, source: "aic",
        title: a.title || "Untitled",
        artist: a.artist_title || null,
        date: a.date_display || null,
        culture: a.place_of_origin || null,
        medium: a.medium_display || null,
        period: a.style_title || null,
        imageUrl: `${iiifBase}/${a.image_id}/full/600,/0/default.jpg`,
        imageLarge: `${iiifBase}/${a.image_id}/full/1200,/0/default.jpg`,
        link: `https://www.artic.edu/artworks/${a.id}`,
        classification: a.classification_title || a.artwork_type_title || null,
      };
    }).filter(Boolean);
  } catch (e) { console.error("AIC error:", e); return []; }
}

async function searchCleveland(query, skip = 0) {
  try {
    const url = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query)}&has_image=1&limit=${PER_SOURCE}&skip=${skip}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.data?.length) return [];
    return data.data.map(a => {
      const img = a.images?.web?.url;
      if (!img) return null;
      return {
        id: `cma-${a.id}`, source: "cma",
        title: a.title || "Untitled",
        artist: a.creators?.[0]?.description || null,
        date: a.creation_date || null,
        culture: Array.isArray(a.culture) ? a.culture[0] : (a.culture || null),
        medium: a.technique || null,
        period: null,
        imageUrl: img,
        imageLarge: a.images?.print?.url || a.images?.full?.url || img,
        link: `https://www.clevelandart.org/art/${a.id}`,
        classification: a.type || null,
      };
    }).filter(Boolean);
  } catch (e) { console.error("CMA error:", e); return []; }
}

// Allowlist: only accept items whose type contains craft/object/ceramic vocabulary
const JPSEARCH_TYPE_ALLOW = /工芸|陶磁|陶器|磁器|焼|器|craft|ceramic|pottery|stoneware|porcelain|ware|object|artifact|sculpture|painting|print|drawing/i;
// Ceramic records on Japan Search almost always carry CJK titles; romanized/English-only
// titles tend to be text-archive documents misclassified as image items.
const JPSEARCH_CJK = /[\u3040-\u30FF\u4E00-\u9FFF]/;

// English query terms → Japanese. Japan Search ranks native-language records
// higher, and the CJK title filter above drops auto-translated English titles,
// so sending English keywords leaves very few survivors. Keys must be lowercase.
const JPSEARCH_EN_TO_JA = {
  "ceramics": "陶磁", "ceramic": "陶磁",
  "pottery": "陶器",
  "stoneware": "炻器",
  "porcelain": "磁器",
  "vase": "花瓶",
  "bowl": "鉢",
  "tea bowl": "茶碗", "chawan": "茶碗",
  "tenmoku": "天目",
  "jar": "壺",
  "bottle": "瓶",
  "plate": "皿", "dish": "皿",
  "teapot": "急須",
  "ewer": "水注",
  "celadon": "青磁", "celadon glaze": "青磁",
  "raku": "楽焼", "raku ware": "楽焼",
  "bizen": "備前", "bizen pottery": "備前焼",
  "shigaraki": "信楽", "shigaraki ware": "信楽焼",
  "song dynasty": "宋代",
  "japanese": "日本",
  "korean": "朝鮮",
  "longquan": "龍泉",
};

function jpsearchTranslateQuery(query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return query;
  const out = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let span = Math.min(3, words.length - i); span >= 1; span--) {
      const phrase = words.slice(i, i + span).join(" ");
      if (JPSEARCH_EN_TO_JA[phrase]) {
        out.push(JPSEARCH_EN_TO_JA[phrase]);
        i += span;
        matched = true;
        break;
      }
    }
    if (!matched) { out.push(words[i]); i++; }
  }
  return out.join(" ");
}

async function searchJapanSearch(query, page = 1) {
  try {
    const batchSize = PER_SOURCE * 4;
    const from = (page - 1) * batchSize;
    const jaQuery = jpsearchTranslateQuery(query);
    // mediatype=image filters at the API level — only image-type records returned
    const params = new URLSearchParams({ keyword: jaQuery, size: batchSize, mediatype: "image" });
    if (from > 0) params.set("from", from);
    const url = `https://jpsearch.go.jp/api/item/search/jps-cross?${params}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.list || [];
    if (!list.length) return [];
    const results = list.map(item => {
      const c = item.common || {};
      const imgRaw = Array.isArray(c.thumbnailUrl) ? c.thumbnailUrl[0] : c.thumbnailUrl;
      if (!imgRaw) return null;
      const itemType = Array.isArray(c.type) ? c.type.join(" ") : (c.type || "");
      // Only keep items whose type explicitly signals a physical/visual artifact
      if (itemType && !JPSEARCH_TYPE_ALLOW.test(itemType)) return null;
      const title = Array.isArray(c.title) ? c.title[0] : (c.title || "Untitled");
      if (!JPSEARCH_CJK.test(title)) return null;
      const artist = Array.isArray(c.creator) ? c.creator[0] : (c.creator || null);
      return {
        id: `jpsearch-${item.id || Math.random().toString(36).slice(2)}`,
        source: "jpsearch",
        title,
        artist,
        date: c.temporalCoverage || c.datePublished || null,
        culture: null,
        medium: null,
        period: null,
        imageUrl: imgRaw,
        imageLarge: imgRaw,
        link: item.id ? `https://jpsearch.go.jp/item/${item.id}` : "https://jpsearch.go.jp/",
        classification: Array.isArray(c.type) ? c.type[0] : (c.type || null),
      };
    }).filter(Boolean);
    return results.slice(0, PER_SOURCE);
  } catch (e) { console.error("JapanSearch error:", e); return []; }
}

// Ordered most-specific first to avoid false matches (e.g. "teapot" before "pot")
const SHAPE_KEYWORDS = ["teapot","ewer","platter","pitcher","bottle","flask","vase","bowl","jar","cup","mug","dish","plate","jug","basin"];

// Most distinctive named wares/techniques first, general materials last
const TECHNIQUE_KEYWORDS = [
  "celadon","tenmoku","raku","shino","oribe","bizen","shigaraki","hagi",
  "sancai","majolica","faience","delftware","creamware","yixing",
  "underglaze","overglaze","slip","porcelain","stoneware",
];

const CULTURE_MAP = [
  [["chinese","china"], "Chinese"],
  [["japanese","japan"], "Japanese"],
  [["korean","korea"], "Korean"],
  [["british","england","english","united kingdom"], "English"],
  [["french","france"], "French"],
  [["german","germany"], "German"],
  [["dutch","netherlands","holland"], "Dutch"],
  [["iranian","persian","persia","iran"], "Persian"],
  [["turkish","turkey","ottoman"], "Turkish"],
  [["italian","italy"], "Italian"],
];

function extractShape(item) {
  const text = [item.title, item.classification, item.medium].filter(Boolean).join(" ").toLowerCase();
  return SHAPE_KEYWORDS.find(s => new RegExp(`\\b${s}\\b`).test(text)) || null;
}

function extractTechnique(item) {
  const text = [item.title, item.medium, item.period, item.classification].filter(Boolean).join(" ");
  return TECHNIQUE_KEYWORDS.find(t => new RegExp(`\\b${t}\\b`, "i").test(text)) || null;
}

function extractCulture(item) {
  if (!item.culture) return null;
  const c = item.culture.toLowerCase();
  for (const [keys, val] of CULTURE_MAP) {
    if (keys.some(k => c.includes(k))) return val;
  }
  // Fall back to first segment before any comma/paren if short enough
  const first = item.culture.split(/[,;(]/)[0].trim();
  return first.length > 0 && first.length <= 20 ? first : null;
}

function Lightbox({ item, onClose, onToggleFav, isFav, onSimilar, onSave }) {
  const [wide, setWide] = useState(window.innerWidth >= 700);
  useEffect(() => {
    const h1 = (e) => e.key === "Escape" && onClose();
    const h2 = () => setWide(window.innerWidth >= 700);
    window.addEventListener("keydown", h1);
    window.addEventListener("resize", h2);
    return () => { window.removeEventListener("keydown", h1); window.removeEventListener("resize", h2); };
  }, [onClose]);
  if (!item) return null;
  const src = SOURCES[item.source];
  const meta = [
    ["Artist", item.artist], ["Date", item.date], ["Culture / Origin", item.culture],
    ["Period / Style", item.period], ["Medium", item.medium], ["Classification", item.classification],
  ].filter(([,v]) => v);
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:1000,background:"rgba(15,12,10,0.92)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,cursor:"zoom-out",overflowY:"auto" }}>
      <button onClick={onClose} aria-label="Close" style={{ position:"fixed",top:16,right:16,zIndex:1001,width:40,height:40,borderRadius:"50%",border:"1px solid #5A534A",background:"rgba(30,27,24,0.8)",color:"#E8E0D6",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)" }}>×</button>
      <div onClick={(e)=>e.stopPropagation()} style={{ display:"flex",gap:32,maxWidth:1100,width:"100%",maxHeight:"90vh",cursor:"default",flexDirection:wide?"row":"column",alignItems:wide?"flex-start":"center",overflowY:"auto" }}>
        <img src={item.imageLarge} alt={item.title} style={{ maxHeight:"80vh",maxWidth:wide?"55%":"100%",objectFit:"contain",borderRadius:6,flexShrink:0 }} />
        <div style={{ color:"#E8E0D6",fontFamily:"'Cormorant Garamond',Georgia,serif",minWidth:220,maxWidth:380 }}>
          <h2 style={{ fontSize:26,fontWeight:500,lineHeight:1.25,margin:"0 0 6px",letterSpacing:"-0.01em" }}>{item.title}</h2>
          <div style={{ fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",color:src.accent,marginBottom:20,fontFamily:"'DM Sans',system-ui,sans-serif" }}>{src.name}</div>
          {meta.map(([label,val]) => (
            <div key={label} style={{ marginBottom:14 }}>
              <div style={{ fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"#9B9488",marginBottom:2,fontFamily:"'DM Sans',system-ui,sans-serif" }}>{label}</div>
              <div style={{ fontSize:16,lineHeight:1.4,color:"#D4CCC2" }}>{val}</div>
            </div>
          ))}
          <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ display:"inline-block",marginTop:16,fontSize:12,fontFamily:"'DM Sans',system-ui,sans-serif",color:src.accent,textDecoration:"none",borderBottom:`1px solid ${src.accent}40`,paddingBottom:2,letterSpacing:"0.03em" }}>
            View on {src.name} →
          </a>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginTop:24 }}>
            <button onClick={() => onToggleFav(item)} style={{ background:isFav?`${src.accent}30`:"none",border:`1px solid ${isFav?src.accent:"#5A534A"}`,color:isFav?src.accent:"#9B9488",padding:"8px 14px",borderRadius:4,cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',system-ui,sans-serif",letterSpacing:"0.03em" }}>{isFav ? "♥ Saved" : "♡ Save"}</button>
            <button onClick={() => onSimilar(item)} style={{ background:"none",border:"1px solid #5A534A",color:"#9B9488",padding:"8px 14px",borderRadius:4,cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',system-ui,sans-serif",letterSpacing:"0.03em" }}>Similar period</button>
            <button onClick={() => onSave(item)} style={{ background:"none",border:"1px solid #5A534A",color:"#9B9488",padding:"8px 14px",borderRadius:4,cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',system-ui,sans-serif",letterSpacing:"0.03em" }}>↓ Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ item, onClick, onToggleFav, isFav }) {
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const src = SOURCES[item.source];
  return (
    <div
      onClick={() => onClick(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor:"zoom-in",breakInside:"avoid",marginBottom:16,borderRadius:6,overflow:"hidden",
        background:"#1E1B18",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? "0 8px 32px rgba(0,0,0,0.4)" : "none",
        transition:"transform 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      <div style={{ position:"relative",background:loaded?"transparent":"#2A2622",minHeight:loaded?0:200 }}>
        <button onClick={(e)=>{e.stopPropagation();onToggleFav(item);}} aria-label="Save" style={{ position:"absolute",top:8,right:8,zIndex:2,width:32,height:32,borderRadius:"50%",border:"none",background:"rgba(20,18,16,0.7)",color:isFav?"#E8A0A0":"#D4CCC2",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)" }}>{isFav ? "♥" : "♡"}</button>
        <img src={item.imageUrl} alt={item.title} loading="lazy" onLoad={()=>setLoaded(true)} style={{ width:"100%",display:"block",opacity:loaded?1:0,transition:"opacity 0.4s ease" }} />
      </div>
      <div style={{ padding:"12px 14px 14px" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:15,fontWeight:500,lineHeight:1.3,color:"#D4CCC2",marginBottom:6 }}>{item.title}</div>
        <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
          <span style={{ fontSize:9,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:src.accent,fontFamily:"'DM Sans',system-ui,sans-serif" }}>{src.name}</span>
          {item.date && (<><span style={{color:"#5A534A",fontSize:9}}>·</span><span style={{fontSize:10,color:"#7A7268",fontFamily:"'DM Sans',system-ui,sans-serif"}}>{item.date}</span></>)}
        </div>
        {item.culture && <div style={{ fontSize:10,color:"#6A6258",marginTop:4,fontFamily:"'DM Sans',system-ui,sans-serif" }}>{item.culture}</div>}
      </div>
    </div>
  );
}

function PotteryInspiration() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All Ceramics");
  const [activeSources, setActiveSources] = useState(() => new Set(["met","va","aic","cma","jpsearch"]));
  const [lightboxItem, setLightboxItem] = useState(null);
  const [loadedCount, setLoadedCount] = useState({});
  const [cols, setCols] = useState(3);
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("pottery-favs") || "[]")); }
    catch { return new Set(); }
  });
  const [showFavorites, setShowFavorites] = useState(false);
  const [originItem, setOriginItem] = useState(null);
  const [favItems, setFavItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pottery-fav-items") || "[]"); }
    catch { return []; }
  });

  const abortRef = useRef(null);
  const metIdsRef = useRef([]);
  const metOffsetRef = useRef(0);
  const vaPageRef = useRef(1);
  const aicPageRef = useRef(1);
  const cmaSkipRef = useRef(0);
  const jpsearchPageRef = useRef(1);
  const currentQueryRef = useRef("");
  const activeSourcesRef = useRef(activeSources);
  const loadingMoreRef = useRef(false);
  const generationRef = useRef(0);
  const sentinelRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const exhaustedSourcesRef = useRef(new Set());

  useEffect(() => { activeSourcesRef.current = activeSources; }, [activeSources]);

  const toggleFavorite = (item) => {
    setFavorites(prev => {
      const next = new Set(prev);
      let nextItems;
      if (next.has(item.id)) {
        next.delete(item.id);
        nextItems = favItems.filter(i => i.id !== item.id);
      } else {
        next.add(item.id);
        nextItems = [...favItems, item];
      }
      setFavItems(nextItems);
      localStorage.setItem("pottery-favs", JSON.stringify([...next]));
      localStorage.setItem("pottery-fav-items", JSON.stringify(nextItems));
      return next;
    });
  };

  useEffect(() => {
    const h = () => setCols(window.innerWidth > 900 ? 3 : window.innerWidth > 560 ? 2 : 1);
    h(); window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // Runs all fetchers in parallel, dedupes against seenIdsRef, marks sources that
  // returned 0 fresh items as exhausted, and returns the filtered new items.
  const runFetchers = async (entries, gen) => {
    const results = await Promise.allSettled(entries.map(e => e.fetcher));
    if (gen !== generationRef.current) return null;
    const fresh = [];
    entries.forEach((entry, i) => {
      const r = results[i];
      const got = r.status === "fulfilled" ? r.value : [];
      const uniq = got.filter(it => !seenIdsRef.current.has(it.id));
      uniq.forEach(it => seenIdsRef.current.add(it.id));
      if (uniq.length === 0) exhaustedSourcesRef.current.add(entry.key);
      fresh.push(...uniq);
    });
    return fresh;
  };

  const computeHasMore = (sources) => {
    for (const key of sources) {
      if (!exhaustedSourcesRef.current.has(key)) return true;
    }
    return false;
  };

  const fetchResults = useCallback(async (category, sources, overrideQuery) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++generationRef.current;
    loadingMoreRef.current = false;

    setLoading(true); setItems([]); setLoadedCount({}); setHasMore(false); setLoadingMore(false);
    seenIdsRef.current = new Set();
    exhaustedSourcesRef.current = new Set();

    const query = overrideQuery || (() => {
      const queries = CATEGORIES[category] || ["ceramics"];
      return queries[Math.floor(Math.random() * queries.length)];
    })();

    currentQueryRef.current = query;
    vaPageRef.current = 1;
    aicPageRef.current = 1;
    cmaSkipRef.current = PER_SOURCE;
    jpsearchPageRef.current = 1;

    const metIds = sources.has("met") ? await getMetIds(query) : [];
    if (gen !== generationRef.current) return;

    metIdsRef.current = metIds;
    metOffsetRef.current = PER_SOURCE;

    const entries = [];
    if (sources.has("met")) {
      entries.push({ key: "met", fetcher: metIds.length > 0 ? fetchMetObjects(metIds.slice(0, PER_SOURCE)) : Promise.resolve([]) });
    }
    if (sources.has("va"))       entries.push({ key: "va",       fetcher: searchVA(query, 1) });
    if (sources.has("aic"))      entries.push({ key: "aic",      fetcher: searchAIC(query, 1) });
    if (sources.has("cma"))      entries.push({ key: "cma",      fetcher: searchCleveland(query, 0) });
    if (sources.has("jpsearch")) entries.push({ key: "jpsearch", fetcher: searchJapanSearch(query, 1) });

    try {
      const fresh = await runFetchers(entries, gen);
      if (fresh === null) return;
      const counts = {};
      fresh.forEach(i => { counts[i.source] = (counts[i.source] || 0) + 1; });
      setLoadedCount(counts);
      setItems(shuffleArray(fresh));
      setHasMore(computeHasMore(sources));
    } catch {} finally {
      if (gen === generationRef.current) setLoading(false);
    }
  }, []);

  const fetchMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const gen = generationRef.current;
    const query = currentQueryRef.current;
    const sources = activeSourcesRef.current;
    const exhausted = exhaustedSourcesRef.current;

    const entries = [];
    if (sources.has("met") && !exhausted.has("met")) {
      const metStart = metOffsetRef.current;
      const nextMetIds = metIdsRef.current.slice(metStart, metStart + PER_SOURCE);
      metOffsetRef.current = metStart + PER_SOURCE;
      entries.push({ key: "met", fetcher: nextMetIds.length > 0 ? fetchMetObjects(nextMetIds) : Promise.resolve([]) });
    }
    if (sources.has("va") && !exhausted.has("va")) {
      entries.push({ key: "va", fetcher: searchVA(query, ++vaPageRef.current) });
    }
    if (sources.has("aic") && !exhausted.has("aic")) {
      entries.push({ key: "aic", fetcher: searchAIC(query, ++aicPageRef.current) });
    }
    if (sources.has("cma") && !exhausted.has("cma")) {
      const nextCMASkip = cmaSkipRef.current;
      cmaSkipRef.current = nextCMASkip + PER_SOURCE;
      entries.push({ key: "cma", fetcher: searchCleveland(query, nextCMASkip) });
    }
    if (sources.has("jpsearch") && !exhausted.has("jpsearch")) {
      entries.push({ key: "jpsearch", fetcher: searchJapanSearch(query, ++jpsearchPageRef.current) });
    }

    try {
      const fresh = await runFetchers(entries, gen);
      if (fresh === null) return;
      if (fresh.length > 0) {
        setItems(prev => [...prev, ...shuffleArray(fresh)]);
        setLoadedCount(prev => {
          const next = { ...prev };
          fresh.forEach(i => { next[i.source] = (next[i.source] || 0) + 1; });
          return next;
        });
      }
      setHasMore(computeHasMore(sources));
    } catch {} finally {
      if (gen === generationRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || showFavorites) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchMore(); },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, fetchMore, showFavorites]);

  useEffect(() => {
    if (showFavorites) return;
    if (activeSources.size > 0) fetchResults(activeCategory, activeSources);
  }, [activeCategory, activeSources, fetchResults, showFavorites]);

  const toggleSource = (key) => {
    setActiveSources(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #141210; }
        ::-webkit-scrollbar-thumb { background: #2A2622; border-radius: 3px; }
        .pills-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <div style={{ minHeight:"100vh",background:"#141210",color:"#D4CCC2",fontFamily:"'DM Sans',system-ui,sans-serif" }}>

        <button
          onClick={() => setShowFavorites(v => !v)}
          aria-label={showFavorites ? "Show all" : `Favorites (${favItems.length})`}
          style={{
            position:"fixed",top:"calc(env(safe-area-inset-top, 0px) + 12px)",right:16,zIndex:200,
            width:40,height:40,borderRadius:"50%",
            border:showFavorites?"1.5px solid #E8A0A0":"1.5px solid #3A3632",
            background:showFavorites?"rgba(232,160,160,0.15)":"rgba(20,18,16,0.85)",
            color:showFavorites?"#E8A0A0":"#7A7268",
            cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",
            backdropFilter:"blur(8px)",transition:"all 0.2s ease",
          }}
        >
          {showFavorites ? "♥" : "♡"}
          {favItems.length > 0 && (
            <span style={{
              position:"absolute",top:-3,right:-3,
              background:"#E8A0A0",color:"#141210",
              fontSize:8,fontWeight:700,lineHeight:1,
              minWidth:14,height:14,borderRadius:7,
              display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",
              fontFamily:"'DM Sans',system-ui,sans-serif",
            }}>{favItems.length}</span>
          )}
        </button>

        <header style={{ padding:`calc(env(safe-area-inset-top, 0px) + 40px) 28px 0`,maxWidth:1200,margin:"0 auto" }}>
          <div style={{ fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.2em",color:"#6A6258",marginBottom:8 }}>Pottery Inspo</div>
          <h1 style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:38,fontWeight:400,lineHeight:1.15,color:"#E8E0D6",margin:"0 0 6px",letterSpacing:"-0.02em" }}>
            Across Collections
          </h1>
          <p style={{ fontSize:13,color:"#7A7268",maxWidth:540,lineHeight:1.55,margin:"0 0 28px" }}>
            Pulling ceramics from up to five museum open-access APIs. Tap any piece to see details, medium, and provenance.
          </p>

          <div className="pills-scroll" style={{ display:"flex",gap:8,flexWrap:"nowrap",overflowX:"auto",marginBottom:20,scrollbarWidth:"none",msOverflowStyle:"none" }}>
            {Object.entries(SOURCES).map(([key,src]) => {
              const active = activeSources.has(key);
              const count = loadedCount[key] || 0;
              return (
                <button key={key} onClick={() => toggleSource(key)} style={{
                  padding:"6px 14px",borderRadius:20,flexShrink:0,
                  border: active ? `1.5px solid ${src.accent}` : "1.5px solid #2A2622",
                  background: active ? `${src.accent}18` : "transparent",
                  color: active ? src.accent : "#5A534A",
                  fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.2s ease",letterSpacing:"0.02em",
                  display:"flex",alignItems:"center",gap:6,
                }}>
                  {src.name}
                  {count > 0 && (
                    <span style={{ fontSize:9,opacity:0.7,background:active?`${src.accent}30`:"#2A2622",padding:"1px 6px",borderRadius:8 }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display:"flex",gap:10,marginBottom:16,alignItems:"center" }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  setOriginItem(null);
                  setShowFavorites(false);
                  fetchResults(activeCategory, activeSources, searchQuery.trim());
                }
              }}
              placeholder="Search — e.g. 'moon jar', 'Jun ware', 'tenmoku'"
              style={{ flex:"1 1 240px",minWidth:200,padding:"8px 12px",borderRadius:4,border:"1px solid #2A2622",background:"#1E1B18",color:"#D4CCC2",fontSize:13,fontFamily:"'DM Sans',system-ui,sans-serif",outline:"none" }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setOriginItem(null); fetchResults(activeCategory, activeSources); }} style={{ padding:"8px 12px",borderRadius:4,border:"1px solid #2A2622",background:"transparent",color:"#7A7268",fontSize:12,cursor:"pointer" }}>Clear</button>
            )}
          </div>

          <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:32,paddingBottom:24,borderBottom:"1px solid #1E1B18",alignItems:"center" }}>
            {Object.keys(CATEGORIES).map(cat => (
              <button key={cat} onClick={() => { setSearchQuery(""); setActiveCategory(cat); setOriginItem(null); }} style={{
                padding:"5px 13px",borderRadius:4,border:"none",
                background: activeCategory === cat ? "#2A2622" : "transparent",
                color: activeCategory === cat ? "#D4CCC2" : "#5A534A",
                fontSize:11,fontWeight:500,cursor:"pointer",transition:"all 0.15s ease",letterSpacing:"0.01em",
              }}>{cat}</button>
            ))}
            <button onClick={() => fetchResults(activeCategory, activeSources)} disabled={loading} style={{
              marginLeft:"auto",padding:"5px 14px",borderRadius:4,border:"1px solid #2A2622",
              background:"transparent",color:loading?"#3A3632":"#7A7268",fontSize:11,fontWeight:500,
              cursor:loading?"wait":"pointer",transition:"all 0.15s ease",letterSpacing:"0.01em",
            }}>{loading ? "Loading\u2026" : "\u21bb Refresh"}</button>
          </div>
        </header>

        <main style={{ maxWidth:1200,margin:"0 auto",padding:`0 28px calc(env(safe-area-inset-bottom, 0px) + 60px)` }}>
          {loading && items.length === 0 && (
            <div style={{ textAlign:"center",padding:"80px 20px",color:"#5A534A" }}>
              <div style={{ width:24,height:24,border:"2px solid #3A3632",borderTopColor:"#7A7268",borderRadius:"50%",margin:"0 auto 16px",animation:"spin 0.8s linear infinite" }} />
              <div style={{ fontSize:13 }}>Searching collections\u2026</div>
            </div>
          )}
          {!loading && !showFavorites && items.length === 0 && (
            <div style={{ textAlign:"center",padding:"80px 20px",color:"#5A534A",fontSize:14 }}>
              No results found. Try a different category or source.
            </div>
          )}

          {originItem && !showFavorites && (
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:20,padding:"10px 14px",borderRadius:6,background:"#1E1B18",border:"1px solid #2A2622" }}>
              <button
                onClick={() => setLightboxItem(originItem)}
                style={{ flex:1,minWidth:0,display:"flex",alignItems:"center",gap:8,background:"none",border:"none",color:"#9B9488",cursor:"pointer",padding:0,textAlign:"left",fontSize:12,fontFamily:"'DM Sans',system-ui,sans-serif",letterSpacing:"0.02em" }}
              >
                <span style={{ flexShrink:0 }}>←</span>
                <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>Back to <em style={{ fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:14,fontStyle:"italic",color:"#C4BDB4" }}>{originItem.title}</em></span>
              </button>
              <button
                onClick={() => setOriginItem(null)}
                aria-label="Dismiss"
                style={{ flexShrink:0,background:"none",border:"none",color:"#4A4640",cursor:"pointer",fontSize:16,lineHeight:1,padding:"2px 4px" }}
              >×</button>
            </div>
          )}

          <div style={{ columnCount:cols, columnGap:16 }}>
            {(showFavorites ? favItems : items).map(item => (
              <Card key={item.id} item={item} onClick={setLightboxItem} onToggleFav={toggleFavorite} isFav={favorites.has(item.id)} />
            ))}
          </div>

          {!showFavorites && <div ref={sentinelRef} style={{ height:1 }} />}

          {loadingMore && (
            <div style={{ textAlign:"center",padding:"32px 20px",color:"#5A534A" }}>
              <div style={{ width:20,height:20,border:"2px solid #3A3632",borderTopColor:"#7A7268",borderRadius:"50%",margin:"0 auto 12px",animation:"spin 0.8s linear infinite" }} />
              <div style={{ fontSize:12 }}>Loading more\u2026</div>
            </div>
          )}
          {!hasMore && !loading && !loadingMore && items.length > 0 && !showFavorites && (
            <div style={{ textAlign:"center",padding:"24px 20px",color:"#3A3632",fontSize:11,letterSpacing:"0.05em" }}>— end of results —</div>
          )}
        </main>

        <Lightbox
          item={lightboxItem}
          onClose={() => setLightboxItem(null)}
          onToggleFav={toggleFavorite}
          isFav={lightboxItem && favorites.has(lightboxItem.id)}
          onSimilar={(item) => {
            const culture = extractCulture(item);
            const period = item.period;
            const parts = [culture, period].filter(Boolean);
            const q = parts.length > 0
              ? parts.join(" ")
              : (item.classification || "ceramics");
            setOriginItem(item);
            setSearchQuery(q);
            setShowFavorites(false);
            setLightboxItem(null);
            fetchResults(activeCategory, activeSources, q);
          }}
          onSave={async (item) => {
            const filename = (item.title || "pottery").replace(/[^a-z0-9]/gi, "_").slice(0,50) + ".jpg";
            try {
              const res = await fetch(item.imageLarge);
              const blob = await res.blob();
              const file = new File([blob], filename, { type: "image/jpeg" });
              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: item.title || "Pottery" });
                return;
              }
              // Fallback: blob download (desktop)
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = filename;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              if (e?.name !== "AbortError") window.open(item.imageLarge, "_blank");
            }
          }}
        />
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PotteryInspiration />);
