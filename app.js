// ── Cache helpers (localStorage with TTL) ──
function cacheGet(key, ttlMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ttlMs) return null;
    return data;
  } catch (_) { return null; }
}
function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch (_) {}
}

// ── Helpers ──
function isNew(dateISO) {
  const msPerDay = 86400000;
  return (Date.now() - new Date(dateISO).getTime()) <= 7 * msPerDay;
}
function newBadge() {
  return `<span class="new-badge">NEW</span>`;
}
function truncateDesc(text, max = 400) {
  if (!text) return text;
  const clean = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.lastIndexOf(' ', max);
  return clean.slice(0, cut > 0 ? cut : max) + '…';
}

function normTitle(t) {
  return (t || '').replace(/United States of America/g, 'USA');
}

function fmtUSD(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

// ── State ──
let activeTab = "deals";
let filters = {
  dealTypes: new Set(DEAL_TYPES),
  minerals: new Set(MINERALS),
  projectTypes: new Set(PROJECT_TYPES),
  priceDirection: new Set(["up", "down"]),
  countries: new Set(COUNTRIES),
};
const sectionOpen = { dealTypes: true, minerals: true, projectTypes: true, countries: false };

function toggleSection(key) {
  sectionOpen[key] = !sectionOpen[key];
  renderSidebar();
}
let fredData = null;
let fredRange = '5Y';
const fredCharts = {};
let newsData = null;
let tradeData = null;
let gtaData = null;
let facilitiesData = null;
let facilityMap = null;
let facilityCluster = null;
let gtaLiveData = null;
let gtaDescriptions = null;
let itaData = null;
let ieaData = null;

// ── Tab switching ──
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
  document.getElementById(`nav-${tab}`).classList.add("active");
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById(`section-${tab}`).classList.add("active");
  renderSidebar();
  renderContent();
}

// ── Sidebar rendering ──
function renderSidebar() {
  const aside = document.querySelector("aside");

  if (activeTab === "deals") {
    aside.innerHTML =
      buildCheckboxGroup("Deal Type", "dealTypes", DEAL_TYPES) +
      buildMineralFilter() +
      buildCountryFilter();
  } else if (activeTab === "projects") {
    const icmmMinerals = facilitiesData
      ? [...new Set(facilitiesData.map(f => f.mineral))].filter(m => MINERALS.includes(m)).sort()
      : null;
    aside.innerHTML =
      buildCheckboxGroup("Project Type", "projectTypes", PROJECT_TYPES) +
      buildMineralFilter(icmmMinerals);
  } else if (activeTab === "prices") {
    aside.innerHTML = buildMineralFilter();
  }
}

function buildSectionHeader(title, key) {
  const open = sectionOpen[key] !== false;
  const selected = filters[key] ? filters[key].size : null;
  const total = key === "countries" ? COUNTRIES.length
    : key === "dealTypes" ? DEAL_TYPES.length
    : key === "minerals" ? MINERALS.length
    : key === "projectTypes" ? PROJECT_TYPES.length : null;
  const countLabel = (!open && selected !== null && selected < total)
    ? ` <span class="filter-count">${selected}/${total}</span>` : "";
  return `<div class="filter-header">
    <h3 class="filter-toggle" onclick="toggleSection('${key}')">
      ${title}${countLabel}
      <span class="chevron">${open ? "▼" : "▶"}</span>
    </h3>
    ${open ? `<div class="section-actions">
      <button class="btn-section" onclick="selectSection('${key}')">All</button>
      <button class="btn-section" onclick="clearSection('${key}')">None</button>
    </div>` : ""}
  </div>`;
}

function buildCheckboxGroup(title, filterKey, options, labelFn = v => v) {
  const open = sectionOpen[filterKey] !== false;
  const items = options.map(opt => {
    const checked = filters[filterKey].has(opt) ? "checked" : "";
    return `<label>
      <input type="checkbox" ${checked} onchange="toggleFilter('${filterKey}', '${opt}', this.checked)">
      ${labelFn(opt)}
    </label>`;
  }).join("");
  return `<div class="filter-group">
    ${buildSectionHeader(title, filterKey)}
    ${open ? `<div class="filter-group-body">${items}</div>` : ""}
  </div>`;
}

function buildMineralFilter(mineralList) {
  const list = mineralList || MINERALS;
  const open = sectionOpen["minerals"] !== false;
  const groupButtons = MINERAL_GROUPS
    .map((g, i) => {
      const inList = g.minerals.filter(m => list.includes(m));
      if (!inList.length) return '';
      const exactMatch = inList.length === filters.minerals.size &&
        inList.every(m => filters.minerals.has(m));
      return `<button class="group-btn${exactMatch ? " active" : ""}" onclick="selectMineralGroup(${i})">${g.label}</button>`;
    }).join("");

  const checkboxes = list.map(m => {
    const checked = filters.minerals.has(m) ? "checked" : "";
    return `<label>
      <input type="checkbox" ${checked} onchange="toggleFilter('minerals', '${m}', this.checked)">
      ${m}
    </label>`;
  }).join("");

  return `<div class="filter-group">
    ${buildSectionHeader("Mineral", "minerals")}
    ${open ? `<div class="filter-group-body">
      ${groupButtons ? `<div class="group-btns">${groupButtons}</div>` : ""}
      <div class="mineral-checks">${checkboxes}</div>
    </div>` : ""}
  </div>`;
}

function buildCountryFilter() {
  const open = sectionOpen["countries"] !== false;
  const checkboxes = COUNTRIES.map(c => {
    const checked = filters.countries.has(c) ? "checked" : "";
    const safe = c.replace(/'/g, "\\'");
    return `<label>
      <input type="checkbox" ${checked} onchange="toggleFilter('countries', '${safe}', this.checked)">
      ${c}
    </label>`;
  }).join("");

  return `<div class="filter-group">
    ${buildSectionHeader("Country", "countries")}
    ${open ? `<div class="filter-group-body">${checkboxes}</div>` : ""}
  </div>`;
}

function selectSection(key) {
  if (key === "minerals") filters.minerals = new Set(MINERALS);
  else if (key === "dealTypes") filters.dealTypes = new Set(DEAL_TYPES);
  else if (key === "countries") filters.countries = new Set(COUNTRIES);
  else if (key === "projectTypes") filters.projectTypes = new Set(PROJECT_TYPES);
  renderSidebar();
  renderContent();
}

function clearSection(key) {
  filters[key] = new Set();
  renderSidebar();
  renderContent();
}

function selectMineralGroup(i) {
  filters.minerals = new Set(MINERAL_GROUPS[i].minerals);
  renderSidebar();
  renderContent();
}

function toggleFilter(key, value, checked) {
  if (checked) filters[key].add(value);
  else filters[key].delete(value);
  renderSidebar();
  renderContent();
}

function selectAll() {
  filters.dealTypes = new Set(DEAL_TYPES);
  filters.minerals = new Set(MINERALS);
  filters.projectTypes = new Set(PROJECT_TYPES);
  filters.priceDirection = new Set(["up", "down"]);
  filters.countries = new Set(COUNTRIES);
  renderSidebar();
  renderContent();
}

// ── Content routing ──
function renderContent() {
  if (activeTab === "deals") {
    renderIEAPolicies();
  } else if (activeTab === "projects") {
    renderFacilitiesMap();
    renderProjects();
  } else if (activeTab === "prices") {
    renderFredPrices();
  }
}

// ── Static section renders ──
function renderDeals() {
  const filtered = DEALS.filter(d =>
    filters.dealTypes.has(d.type) &&
    d.minerals.some(m => filters.minerals.has(m))
  ).sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const container = document.getElementById("deals-list");
  document.getElementById("deals-count").textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty"><p>No deals match the selected filters.</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(d => `
    <div class="deal-card${isNew(d.dateISO) ? " is-new" : ""}">
      <div class="deal-meta">
        ${isNew(d.dateISO) ? newBadge() : ""}
        <span class="deal-date">${d.date}</span>
        <span class="deal-type ${typeClass(d.type)}">${d.type}</span>
        ${d.minerals.map(m => `<span class="mineral-tag">${m}</span>`).join("")}
      </div>
      <div class="project-name">${normTitle(d.name)}</div>
      <p class="deal-summary">${d.summary}</p>
      <div class="deal-footer">
        <a href="${d.link}" class="deal-link">Source →</a>
      </div>
    </div>
  `).join("");
}

// ── Country normalization ──
function normalizeCountry(name) {
  return COUNTRY_NORMALIZE[name] || name;
}

// ── IEA date parsing (handles YYYY-MM-DD, DD-MM-YYYY, and YYYY) ──
function parseIEADate(datePromulgated, year) {
  const dp = String(datePromulgated || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dp)) return dp;
  if (/^\d{2}-\d{2}-\d{4}$/.test(dp)) {
    const [d, m, y] = dp.split('-');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{4}$/.test(dp)) return `${dp}-01-01`;
  return `${year || '2000'}-01-01`;
}

function fmtIEADate(dateISO) {
  try {
    const d = new Date(dateISO + 'T00:00:00Z');
    // If year-only source, just show the year
    if (dateISO.endsWith('-01-01')) return String(new Date(dateISO).getUTCFullYear());
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch (_) { return dateISO.slice(0, 4); }
}

// ── IEA Policy data ──
async function loadIEAData() {
  if (ieaData) return;
  const cached = cacheGet("iea_policies_v5", 86400000);
  if (cached) { ieaData = cached; return; }

  for (const src of ["/api/iea", "/data/iea_policies.json"]) {
    try {
      const r = await fetch(src);
      if (!r.ok) continue;
      const json = await r.json();
      const raw = Array.isArray(json) ? json : (json.policies || []);
      ieaData = raw.map(p => ({
        ...p,
        countries: (p.countries || []).map(normalizeCountry),
        dateISO: p.dateISO || parseIEADate(p.datePromulgated, p.year),
      }));
      cacheSet("iea_policies_v5", ieaData);
      return;
    } catch (_) {}
  }
  ieaData = [];
}

const IEA_MINERAL_KEYWORDS = {
  Cobalt: ["cobalt"],
  Copper: ["copper"],
  Graphite: ["graphite"],
  Lithium: ["lithium"],
  Manganese: ["manganese"],
  Nickel: ["nickel"],
  "Rare Earths": ["rare earth", "neodymium", "dysprosium", "praseodymium", "lanthanum", "cerium"],
  Silicon: ["silicon"],
  General: ["critical mineral", "supply chain", "strategic mineral"],
};

function extractMinerals(text, aiMinerals) {
  if (aiMinerals && aiMinerals.length > 0) return aiMinerals;
  const lower = text.toLowerCase();
  const found = MINERALS.filter(m => IEA_MINERAL_KEYWORDS[m] && IEA_MINERAL_KEYWORDS[m].some(kw => lower.includes(kw)));
  return found.length > 0 ? found : ["Others"];
}

function ieaPolicyDealType(policy) {
  const names = policy.policyTypes.map(pt => pt.name);
  // Trade Control: unilateral restrictions — export/import bans and controls
  if (names.some(n => ["Export controls and restrictions", "Export and import ban",
      "Import controls and restrictions"].includes(n))) {
    return "Trade Control";
  }
  // Trade Deal: tariff and non-tariff trade policy measures
  if (names.some(n => ["Tariffs and duties", "Non-tariff measures"].includes(n))) {
    return "Trade Deal";
  }
  // Investment Agreement: FDI rules, financing, tax incentives, public investment
  if (names.some(n => ["Foreign direct investment (FDI)", "Financing",
      "Tax incentives", "Public investment"].includes(n))) {
    return "Investment Agreement";
  }
  // Statement: strategic plans or standalone prescriptive/performance rules
  if (names.some(n => ["Strategic plans", "Regulation", "Social standards",
      "Transparency norms", "Due diligence obligations", "Permitting regimes",
      "Minerals Recycling"].includes(n))) {
    return "Statement";
  }
  // Non-Investment Agreement: bilateral/multilateral arrangements
  return "Non-Investment Agreement";
}

function ieaPolicyLabel(policy) {
  const type = ieaPolicyDealType(policy);
  const clsMap = {
    "Trade Control": "type-harmful",
    "Trade Deal": "type-trade",
    "Investment Agreement": "type-mou",
    "Non-Investment Agreement": "type-non",
    "Statement": "type-statement",
  };
  return { label: type, cls: clsMap[type] };
}

async function renderIEAPolicies() {
  const container = document.getElementById("deals-list");
  if (!container) return;

  if (!ieaData || !gtaData) {
    container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading policies…</div>`;
    await Promise.all([loadIEAData(), loadGTAData(), loadGTALiveData()]);
    loadGTADescriptions(); // sets gtaDescriptions = {} instantly if no cache
    fetchGTADescriptionsInBackground(); // fires async, re-renders when done
  }

  const allGTA = mergeGTAData(gtaData || [], gtaLiveData || []);
  const allCountriesSelected = filters.countries.size === COUNTRIES.length;

  // ── IEA ──
  const ieaFiltered = (ieaData || []).filter(p => {
    if (!filters.dealTypes.has(ieaPolicyDealType(p))) return false;
    const minerals = extractMinerals(p.title + " " + p.description, p.aiMinerals);
    if (!minerals.some(m => filters.minerals.has(m))) return false;
    if (!allCountriesSelected && !p.countries.some(c => filters.countries.has(c))) return false;
    return true;
  });

  // ── GTA (static + live merged) ──
  const gtaFiltered = allGTA.filter(i => {
    if (!filters.dealTypes.has(i.dealType)) return false;
    if (!i.minerals.some(m => filters.minerals.has(m))) return false;
    if (!allCountriesSelected && !i.implementers.some(c => filters.countries.has(c))) return false;
    return true;
  });

  // ── Static DEALS ──
  const dealsFiltered = DEALS.filter(d =>
    filters.dealTypes.has(d.type) && d.minerals.some(m => filters.minerals.has(m))
  );

  const total = ieaFiltered.length + gtaFiltered.length + dealsFiltered.length;
  document.getElementById("deals-count").textContent = total;

  if (total === 0) {
    container.innerHTML = `<div class="empty"><p>No policies match the selected filters.</p></div>`;
    return;
  }

  // Build a unified list of {dateISO, html} then sort newest-first
  const cards = [];

  for (const d of dealsFiltered) {
    cards.push({ dateISO: d.dateISO, html: `
      <div class="deal-card${isNew(d.dateISO) ? " is-new" : ""}">
        <div class="deal-meta">
          ${isNew(d.dateISO) ? newBadge() : ""}
          <span class="deal-date">${d.date}</span>
          <span class="deal-type ${typeClass(d.type)}">${d.type}</span>
          ${d.minerals.map(m => `<span class="mineral-tag">${m}</span>`).join("")}
        </div>
        <div class="project-name">${normTitle(d.name)}</div>
        <p class="deal-summary">${d.summary}</p>
        <div class="deal-footer">
          <a href="${d.link}" class="deal-link">Source →</a>
        </div>
      </div>` });
  }

  for (const p of ieaFiltered) {
    const { label, cls } = ieaPolicyLabel(p);
    const minerals = extractMinerals(p.title + " " + p.description, p.aiMinerals).filter(m => filters.minerals.has(m));
    const dateStr = fmtIEADate(p.dateISO);
    const title = p.aiTitle || p.title;
    const summary = truncateDesc(p.aiSummary || p.description || "");
    cards.push({ dateISO: p.dateISO, html: `
      <div class="deal-card">
        <div class="deal-meta">
          <span class="deal-date">${dateStr}</span>
          <span class="deal-type ${cls}">${label}</span>
          ${minerals.map(m => `<span class="mineral-tag">${m}</span>`).join("")}
        </div>
        <div class="project-name">${normTitle(title)}</div>
        ${summary ? `<p class="deal-summary">${summary}</p>` : ""}
        <div class="deal-footer">
          ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener" class="deal-link">Source →</a>` : ""}
        </div>
      </div>` });
  }

  for (const i of gtaFiltered) {
    const gtaSummary = truncateDesc((gtaDescriptions && gtaDescriptions[i.id]) || i.description || "");
    cards.push({ dateISO: i.dateISO, html: `
      <div class="deal-card${isNew(i.dateISO) ? " is-new" : ""}">
        <div class="deal-meta">
          ${isNew(i.dateISO) ? newBadge() : ""}
          ${i.date ? `<span class="deal-date">${i.date}</span>` : ""}
          <span class="deal-type ${typeClass(i.dealType)}">${i.dealType}</span>
          ${i.minerals.map(m => `<span class="mineral-tag">${m}</span>`).join("")}
        </div>
        <div class="project-name">${normTitle(i.title)}</div>
        ${gtaSummary ? `<p class="deal-summary">${gtaSummary}</p>` : ""}
        <div class="deal-footer">
          <a href="${i.link}" target="_blank" rel="noopener" class="deal-link">Source →</a>
        </div>
      </div>` });
  }

  cards.sort((a, b) => (b.dateISO || "").localeCompare(a.dateISO || ""));
  container.innerHTML = cards.map(c => c.html).join("");
}

// ── ICMM Facilities Map ──────────────────────────────────────────────────
const FACILITY_COLORS = {
  Mine:     '#d97706',
  Smelter:  '#2563eb',
  Refinery: '#7c3aed',
  Other:    '#6b7280',
};

async function loadFacilitiesData() {
  if (facilitiesData) return;
  try {
    const r = await fetch('/data/icmm_facilities.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    facilitiesData = await r.json();
  } catch (err) {
    console.error('[facilities]', err.message);
    facilitiesData = [];
  }
}

async function renderFacilitiesMap() {
  const wasLoaded = !!facilitiesData;
  await loadFacilitiesData();
  if (!wasLoaded && facilitiesData) renderSidebar(); // refresh mineral list once data arrives
  const mapEl = document.getElementById('facilities-map');
  if (!mapEl) return;

  // Init map once
  if (!facilityMap) {
    facilityMap = L.map('facilities-map', {
      preferCanvas: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 80,
    }).setView([20, 0], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 18,
    }).addTo(facilityMap);
    // Use a plain LayerGroup with canvas — no cluster numbers, just dots at every zoom
    facilityCluster = L.layerGroup();
    facilityMap.addLayer(facilityCluster);
  }

  // Render legend
  const legendEl = document.getElementById('map-legend');
  if (legendEl) {
    legendEl.innerHTML = Object.entries(FACILITY_COLORS).map(([type, color]) =>
      `<div class="map-legend-item">
        <div class="map-legend-dot" style="background:${color}"></div>
        <span>${type}</span>
      </div>`
    ).join('');
  }

  facilityCluster.clearLayers();

  const activeMineral = filters.minerals;
  const activeType = filters.projectTypes;

  const filtered = (facilitiesData || []).filter(f => {
    if (!activeMineral.has(f.mineral)) return false;
    if (!activeType.has(f.type)) return false;
    return true;
  });

  const markers = filtered.map(f => {
    const color = FACILITY_COLORS[f.type] || FACILITY_COLORS.Other;
    const marker = L.circleMarker([f.lat, f.lon], {
      radius: 5,
      fillColor: color,
      color: '#fff',
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.8,
    });
    const popupContent = `
      <strong>${f.name}</strong><br>
      ${f.group ? `<span style="color:#6b7280;font-size:12px">${f.group}</span><br>` : ''}
      <span style="font-size:12px">${f.type} · ${f.commodity} · ${f.country}</span>`;
    marker.bindTooltip(popupContent, { sticky: true, opacity: 0.95 });
    return marker;
  });

  markers.forEach(m => facilityCluster.addLayer(m));
  document.getElementById('projects-count').textContent = filtered.length;
}

function renderProjects() {
  const filtered = PROJECTS.filter(p =>
    filters.projectTypes.has(p.type) &&
    filters.minerals.has(p.mineral)
  ).sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const container = document.getElementById("projects-list");
  if (filtered.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = filtered.map(p => `
    <div class="project-card${isNew(p.dateISO) ? " is-new" : ""}">
      <div class="project-meta">
        ${isNew(p.dateISO) ? newBadge() : ""}
        <span class="deal-date">${p.date}</span>
        <span class="project-type type-${p.type.toLowerCase()}">${p.type}</span>
        <span class="mineral-tag">${p.mineral}</span>
      </div>
      <div class="project-name">${normTitle(p.name)}</div>
      <p class="deal-summary">${p.summary}</p>
      <a href="${p.link}" class="deal-link">Source →</a>
    </div>
  `).join("");
}


// ── FRED Historical Prices ──
async function renderFredPrices() {
  const container = document.getElementById("fred-container");
  if (!container) return;

  if (fredData) { displayFredPrices(); return; }

  const cached = cacheGet("fred_prices_v2", 86400000); // 24h
  if (cached) { fredData = cached; displayFredPrices(); return; }

  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading historical prices…</div>`;

  try {
    const r = await fetch("/api/fred");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fredData = await r.json();
    cacheSet("fred_prices_v2", fredData);
    displayFredPrices();
  } catch (err) {
    container.innerHTML = `<div class="empty"><p>Historical prices unavailable (${err.message})</p></div>`;
  }
}

function setFredRange(range) {
  fredRange = range;
  displayFredPrices();
}

function fredCutoff() {
  const years = { "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10 }[fredRange] || 5;
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function fmtCommodityPrice(v) {
  if (v == null) return "—";
  if (v >= 10000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (v >= 100)   return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayFredPrices() {
  for (const id in fredCharts) { fredCharts[id].destroy(); delete fredCharts[id]; }

  const container = document.getElementById("fred-container");
  if (!fredData?.series?.length) {
    container.innerHTML = `<div class="empty"><p>No historical price data available.</p></div>`;
    return;
  }

  const cutoff = fredCutoff();

  const cards = fredData.series.map(s => {
    const pts = s.data.filter(d => d.date >= cutoff);
    if (pts.length < 2) return "";
    const latest = pts[pts.length - 1].value;
    const pct = ((latest - pts[0].value) / pts[0].value) * 100;
    const dir = pct >= 0 ? "up" : "down";
    const id = "fred-" + s.name.toLowerCase().replace(/\s+/g, "-");
    return `
      <div class="fred-card">
        <div class="fred-card-header">
          <span class="fred-name">${s.name}</span>
          <span class="fred-price">${fmtCommodityPrice(latest)}<span class="fred-unit"> ${s.unit}</span></span>
        </div>
        <div class="fred-pct ${dir}">${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% (${fredRange})</div>
        <div class="fred-chart-wrap"><canvas id="${id}"></canvas></div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="fred-controls">
      ${["1Y","3Y","5Y","10Y"].map(r =>
        `<button class="fred-range-btn${r === fredRange ? " active" : ""}" onclick="setFredRange('${r}')">${r}</button>`
      ).join("")}
    </div>
    <div class="fred-grid">${cards}</div>`;

  fredData.series.forEach(s => {
    const pts = s.data.filter(d => d.date >= cutoff);
    if (pts.length < 2) return;
    const id = "fred-" + s.name.toLowerCase().replace(/\s+/g, "-");
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const pct = (pts[pts.length - 1].value - pts[0].value) / pts[0].value;
    const color = pct >= 0 ? "#15803d" : "#b91c1c";
    fredCharts[id] = new Chart(canvas, {
      type: "line",
      data: {
        labels: pts.map(d => d.date),
        datasets: [{
          data: pts.map(d => d.value),
          borderColor: color,
          borderWidth: 1.5,
          fill: true,
          backgroundColor: pct >= 0 ? "rgba(21,128,61,0.08)" : "rgba(185,28,28,0.08)",
          pointRadius: 0,
          tension: 0.2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              title: ctx => ctx[0].label,
              label: ctx => `${fmtCommodityPrice(ctx.raw)} ${s.unit}`,
            },
          },
        },
        scales: {
          x: { display: false },
          y: { display: false, grace: "5%" },
        },
      },
    });
  });
}

function renderPrices() {
  const filtered = PRICES.filter(p =>
    filters.minerals.has(p.mineral)
  ).sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const container = document.getElementById("prices-grid");
  document.getElementById("prices-count").textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty"><p>No price events match the selected filters.</p></div>`;
  } else {
    container.innerHTML = filtered.map(p => `
      <div class="price-card ${p.direction}${isNew(p.dateISO) ? " is-new" : ""}">
        <div class="price-header">
          <span class="price-mineral">${p.mineral}</span>
          <div style="display:flex;align-items:center;gap:8px">
            ${isNew(p.dateISO) ? newBadge() : ""}
            <span class="price-change ${p.direction}">${p.change}</span>
          </div>
        </div>
        <div class="price-period">${p.period}</div>
        <p class="price-summary">${p.summary}</p>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="price-date">${p.date}</span>
          <a href="${p.link}" class="deal-link">Source →</a>
        </div>
      </div>
    `).join("");
  }
}

// ── Trade Flows (Comtrade) ──
async function renderTradeFlows() {
  const container = document.getElementById("trade-grid");
  const status = document.getElementById("trade-status");

  if (tradeData) {
    displayTradeFlows(tradeData);
    return;
  }

  const cached = cacheGet("comtrade_trade", 86400000); // 24h
  if (cached) {
    tradeData = cached;
    displayTradeFlows(tradeData);
    return;
  }

  try {
    const r = await fetch("/api/trade");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    tradeData = json.trade || {};
    cacheSet("comtrade_trade", tradeData);
    displayTradeFlows(tradeData);
  } catch (err) {
    container.innerHTML = `<div class="empty"><p>Trade data unavailable (${err.message}).</p></div>`;
    if (status) status.textContent = "unavailable";
  }
}

function displayTradeFlows(trade) {
  const container = document.getElementById("trade-grid");
  const status = document.getElementById("trade-status");
  const minerals = Object.keys(trade).filter(m => filters.minerals.has(m));

  if (minerals.length === 0) {
    container.innerHTML = `<div class="empty"><p>No trade data for the selected minerals.</p></div>`;
    if (status) status.textContent = "0";
    return;
  }

  if (status) status.textContent = minerals.length;

  container.innerHTML = minerals.map(mineral => {
    const { topExporters = [], totalUSD = 0, year } = trade[mineral] || {};
    const rows = topExporters.map((e, i) => `
      <div class="trade-row">
        <span class="trade-rank">${i + 1}</span>
        <span class="trade-country">${e.country}</span>
        <span class="trade-value">${fmtUSD(e.usd)}</span>
      </div>`).join("");
    return `
      <div class="trade-card">
        <div class="trade-card-header">
          <span class="trade-mineral">${mineral}</span>
          <span class="trade-total">${fmtUSD(totalUSD)} total · ${year}</span>
        </div>
        ${rows || '<div class="trade-row"><span style="color:var(--text-muted);font-size:12px">No data</span></div>'}
      </div>`;
  }).join("");
}

// ── SCMP News (shared across all tabs) ──
async function loadNewsData() {
  if (newsData) return;
  const cached = cacheGet("scmp_news", 21600000);
  if (cached) { newsData = cached; return; }
  try {
    const r = await fetch("/api/news");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    newsData = json.articles || [];
    cacheSet("scmp_news", newsData);
  } catch (err) {
    console.error("[news]", err.message);
    newsData = [];
  }
}

async function renderSCMPNews(section, containerId, countId) {
  const container = document.getElementById(containerId);
  const count = document.getElementById(countId);
  if (!container) return;

  await loadNewsData();

  const filtered = (newsData || []).filter(a =>
    a.section === section &&
    (a.minerals.length === 0 || a.minerals.some(m => filters.minerals.has(m)))
  );

  if (count) count.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty"><p>No recent articles for this section.</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(a => {
    const dateStr = a.date ? new Date(a.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
    const fresh = isNew(a.date);
    return `
      <div class="deal-card${fresh ? " is-new" : ""}">
        <div class="deal-meta">
          ${fresh ? newBadge() : ""}
          ${dateStr ? `<span class="deal-date">${dateStr}</span>` : ""}
          ${a.dealType && section === "deals" ? `<span class="deal-type ${typeClass(a.dealType)}">${a.dealType}</span>` : ""}
          ${a.minerals.map(m => `<span class="mineral-tag">${m}</span>`).join("")}
          <span class="source-badge">SCMP</span>
        </div>
        <div class="project-name">${normTitle(a.title)}</div>
        <p class="deal-summary">${truncateDesc(a.summary)}</p>
        <div class="deal-footer">
          <a href="${a.link}" target="_blank" rel="noopener" class="deal-link">Read article →</a>
        </div>
      </div>`;
  }).join("");
}

function typeClass(type) {
  if (type === "Trade Control") return "type-harmful";
  if (type === "Trade Deal") return "type-trade";
  if (type === "Statement") return "type-statement";
  if (type === "Non-Investment Agreement") return "type-non";
  if (type === "Subsidy") return "type-subsidy";
  return "";
}

// ── GTA data loaders ──
async function loadGTAData() {
  if (gtaData) return;
  const cached = cacheGet("gta_interventions_v8", 86400000);
  if (cached) { gtaData = cached; return; }

  for (const src of ["/api/gta", "/data/gta-interventions.json"]) {
    try {
      const r = await fetch(src);
      if (!r.ok) continue;
      const json = await r.json();
      gtaData = json.interventions || json;
      cacheSet("gta_interventions_v8", gtaData);
      return;
    } catch (_) {}
  }
  gtaData = [];
}

async function loadGTALiveData() {
  if (gtaLiveData) return;
  // Live data cached 1h in localStorage
  const cached = cacheGet("gta_live_v1", 3600000);
  if (cached) { gtaLiveData = cached; return; }
  try {
    const r = await fetch("/api/gta-live");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    gtaLiveData = json.interventions || [];
    cacheSet("gta_live_v1", gtaLiveData);
  } catch (_) {
    gtaLiveData = [];
  }
}

async function loadGTADescriptions() {
  if (gtaDescriptions) return;
  const cached = cacheGet("gta_descriptions_v2", 86400000);
  if (cached) { gtaDescriptions = cached; return; }
  gtaDescriptions = {}; // mark as loaded so we don't block
}

// Fetch full GTA descriptions in background after page renders
function fetchGTADescriptionsInBackground() {
  const cached = cacheGet("gta_descriptions_v2", 86400000);
  if (cached) return; // already have them

  // Fire all 6 batches — each is cached independently on CDN
  const TOTAL = 6;
  Promise.allSettled(
    Array.from({ length: TOTAL }, (_, i) =>
      fetch(`/api/gta-scrape?batch=${i}`).then(r => r.ok ? r.json() : {})
    )
  ).then(results => {
    const merged = {};
    for (const r of results) {
      if (r.status === 'fulfilled') Object.assign(merged, r.value.descriptions || {});
    }
    if (Object.keys(merged).length > 0) {
      gtaDescriptions = merged;
      cacheSet("gta_descriptions_v2", merged);
      renderContent(); // re-render with full descriptions
    }
  }).catch(() => {});
}

// Merge static + live GTA, deduplicate by id, live wins on conflict
function mergeGTAData(staticData, liveData) {
  const seen = new Set();
  const merged = [];
  for (const i of [...liveData, ...staticData]) {
    const key = String(i.id || i.title);
    if (!seen.has(key)) { seen.add(key); merged.push(i); }
  }
  return merged;
}

// ── ITA Tariff Rates ──
async function renderITATariffs() {
  const container = document.getElementById("ita-tariffs");
  if (!container) return;

  if (itaData) { displayITATariffs(itaData.tariffs || []); return; }
  const cached = cacheGet("ita_data", 86400000);
  if (cached) { itaData = cached; displayITATariffs(itaData.tariffs || []); return; }

  // Load lazily — shared with renderITAReports
  await loadITAData();
  if (itaData) displayITATariffs(itaData.tariffs || []);
}

async function loadITAData() {
  if (itaData) return;
  try {
    const r = await fetch("/api/ita");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    itaData = await r.json();
    cacheSet("ita_data", itaData);
  } catch (err) {
    console.error("[ita]", err.message);
    itaData = { reports: [], tariffs: [] };
  }
}

function displayITATariffs(tariffs) {
  const container = document.getElementById("ita-tariffs");
  const status = document.getElementById("ita-tariff-status");
  if (!container) return;

  if (!tariffs.length) {
    container.innerHTML = `<div class="empty"><p>Tariff data unavailable.</p></div>`;
    if (status) status.textContent = "unavailable";
    return;
  }

  if (status) status.textContent = `${tariffs.length} rates`;
  container.innerHTML = `<div class="trade-grid">${tariffs.map(t => `
    <div class="trade-card">
      <div class="trade-card-header">
        <span class="trade-mineral">${t.description || t.hts}</span>
        <span class="trade-total">HTS ${t.hts}</span>
      </div>
      <div class="trade-row">
        <span class="trade-country">${t.reporter}${t.partner ? ` → ${t.partner}` : ""}</span>
        <span class="trade-value">${t.rate || "—"}${t.year ? ` (${t.year})` : ""}</span>
      </div>
    </div>`).join("")}
  </div>`;
}

// ── ITA Market Intelligence Reports ──
async function renderITAReports() {
  const container = document.getElementById("ita-reports");
  if (!container) return;

  if (itaData) { displayITAReports(itaData.reports || []); return; }
  const cached = cacheGet("ita_data", 86400000);
  if (cached) { itaData = cached; displayITAReports(itaData.reports || []); return; }

  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading market intelligence…</div>`;
  await loadITAData();
  displayITAReports(itaData?.reports || []);
}

function displayITAReports(reports) {
  const container = document.getElementById("ita-reports");
  const count = document.getElementById("ita-reports-count");
  if (!container) return;

  if (!reports.length) {
    container.innerHTML = `<div class="empty"><p>No market intelligence reports available.</p></div>`;
    if (count) count.textContent = "0";
    return;
  }

  if (count) count.textContent = reports.length;
  container.innerHTML = reports.map(r => {
    const dateStr = r.date ? new Date(r.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
    return `
      <div class="deal-card">
        <div class="deal-meta">
          ${dateStr ? `<span class="deal-date">${dateStr}</span>` : ""}
          ${r.country ? `<span class="mineral-tag">${r.country}</span>` : ""}
          <span class="source-badge" style="background:#e0f2fe;color:#0369a1">ITA</span>
        </div>
        <div class="project-name">${normTitle(r.title)}</div>
        ${r.summary ? `<p class="deal-summary">${r.summary}</p>` : ""}
        <div class="deal-footer">
          <a href="${r.link}" target="_blank" rel="noopener" class="deal-link">Read report →</a>
        </div>
      </div>`;
  }).join("");
}

// ── API pre-fetch on load ──
// Kick off all background fetches in parallel so data is warm when user switches tabs
async function prefetchInBackground() {
  await Promise.allSettled([
    loadIEAData(),
    loadGTAData(),
    loadGTALiveData(),
    loadFacilitiesData(),
    loadNewsData(),
  ]);
  fetchGTADescriptionsInBackground();
}

// ── Mobile filter toggle ──
let filtersOpen = false;
function toggleFilters() {
  filtersOpen = !filtersOpen;
  document.querySelector(".body").classList.toggle("filters-open", filtersOpen);
  document.getElementById("filter-arrow").textContent = filtersOpen ? "▲" : "▼";
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  renderSidebar();
  renderContent();
  prefetchInBackground();
});
