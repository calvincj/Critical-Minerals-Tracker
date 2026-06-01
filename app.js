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
let newsData = null;
let tradeData = null;
let gtaData = null;
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
    aside.innerHTML =
      buildCheckboxGroup("Project Type", "projectTypes", PROJECT_TYPES) +
      buildMineralFilter();
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

function buildMineralFilter() {
  const open = sectionOpen["minerals"] !== false;
  const groupButtons = MINERAL_GROUPS.map((g, i) => {
    const exactMatch = g.minerals.length === filters.minerals.size &&
      g.minerals.every(m => filters.minerals.has(m));
    return `<button class="group-btn${exactMatch ? " active" : ""}" onclick="selectMineralGroup(${i})">${g.label}</button>`;
  }).join("");

  const checkboxes = MINERALS.map(m => {
    const checked = filters.minerals.has(m) ? "checked" : "";
    return `<label>
      <input type="checkbox" ${checked} onchange="toggleFilter('minerals', '${m}', this.checked)">
      ${m}
    </label>`;
  }).join("");

  return `<div class="filter-group">
    ${buildSectionHeader("Mineral", "minerals")}
    ${open ? `<div class="filter-group-body">
      <div class="group-btns">${groupButtons}</div>
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
    renderProjects();
  } else if (activeTab === "prices") {
    renderPrices();
    renderITATariffs();
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
      <div class="project-name">${d.name}</div>
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
  const cached = cacheGet("iea_policies_v3", 86400000);
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
      cacheSet("iea_policies_v3", ieaData);
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
    await Promise.all([loadIEAData(), loadGTAData()]);
  }

  const allCountriesSelected = filters.countries.size === COUNTRIES.length;

  // ── IEA ──
  const ieaFiltered = (ieaData || []).filter(p => {
    if (!filters.dealTypes.has(ieaPolicyDealType(p))) return false;
    const minerals = extractMinerals(p.title + " " + p.description, p.aiMinerals);
    if (!minerals.some(m => filters.minerals.has(m))) return false;
    if (!allCountriesSelected && !p.countries.some(c => filters.countries.has(c))) return false;
    return true;
  });

  // ── GTA ──
  const gtaFiltered = (gtaData || []).filter(i => {
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
        <div class="project-name">${d.name}</div>
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
    const summary = p.aiSummary || p.description || "";
    cards.push({ dateISO: p.dateISO, html: `
      <div class="deal-card">
        <div class="deal-meta">
          <span class="deal-date">${dateStr}</span>
          <span class="deal-type ${cls}">${label}</span>
          ${minerals.map(m => `<span class="mineral-tag">${m}</span>`).join("")}
        </div>
        <div class="project-name">${title}</div>
        ${summary ? `<p class="deal-summary">${summary}</p>` : ""}
        <div class="deal-footer">
          ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener" class="deal-link">Source →</a>` : ""}
        </div>
      </div>` });
  }

  for (const i of gtaFiltered) {
    cards.push({ dateISO: i.dateISO, html: `
      <div class="deal-card${isNew(i.dateISO) ? " is-new" : ""}">
        <div class="deal-meta">
          ${isNew(i.dateISO) ? newBadge() : ""}
          ${i.date ? `<span class="deal-date">${i.date}</span>` : ""}
          <span class="deal-type ${typeClass(i.dealType)}">${i.dealType}</span>
          ${i.minerals.map(m => `<span class="mineral-tag">${m}</span>`).join("")}
        </div>
        <div class="project-name">${i.title}</div>
        ${i.interventionType || i.implementers.length ? `<p class="deal-summary">${[i.interventionType, i.implementers.slice(0,3).join(", ")].filter(Boolean).join(" · ")}</p>` : ""}
        <div class="deal-footer">
          <a href="${i.link}" target="_blank" rel="noopener" class="deal-link">Source →</a>
        </div>
      </div>` });
  }

  cards.sort((a, b) => (b.dateISO || "").localeCompare(a.dateISO || ""));
  container.innerHTML = cards.map(c => c.html).join("");
}

function renderProjects() {
  const filtered = PROJECTS.filter(p =>
    filters.projectTypes.has(p.type) &&
    filters.minerals.has(p.mineral)
  ).sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const container = document.getElementById("projects-list");
  document.getElementById("projects-count").textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty"><p>No projects match the selected filters.</p></div>`;
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
      <div class="project-name">${p.name}</div>
      <p class="deal-summary">${p.summary}</p>
      <a href="${p.link}" class="deal-link">Source →</a>
    </div>
  `).join("");
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
        <div class="project-name">${a.title}</div>
        <p class="deal-summary">${a.summary}</p>
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

// ── GTA data loader ──
async function loadGTAData() {
  if (gtaData) return;
  const cached = cacheGet("gta_interventions_v2", 86400000);
  if (cached) { gtaData = cached; return; }

  for (const src of ["/api/gta", "/data/gta-interventions.json"]) {
    try {
      const r = await fetch(src);
      if (!r.ok) continue;
      const json = await r.json();
      gtaData = json.interventions || json;
      cacheSet("gta_interventions_v2", gtaData);
      return;
    } catch (_) {}
  }
  gtaData = [];
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
        <div class="project-name">${r.title}</div>
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
    loadNewsData(),
  ]);
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
