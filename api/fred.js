// Base metals: FRED (IMF Primary Commodity Prices, monthly)
const FRED_SERIES = [
  { id: 'PCOPPUSDM', name: 'Copper',   unit: 'USD/metric ton' },
  { id: 'PNICKUSDM', name: 'Nickel',   unit: 'USD/metric ton' },
  { id: 'PALUMUSDM', name: 'Aluminum', unit: 'USD/metric ton' },
  { id: 'PLEADUSDM', name: 'Lead',     unit: 'USD/metric ton' },
  { id: 'PZINCUSDM', name: 'Zinc',     unit: 'USD/metric ton' },
];

// Precious metals: Stooq.com (monthly futures CSV, no auth)
const STOOQ_SERIES = [
  { symbol: 'gc.f', name: 'Gold',      unit: 'USD/troy oz' },
  { symbol: 'si.f', name: 'Silver',    unit: 'USD/troy oz' },
  { symbol: 'pl.f', name: 'Platinum',  unit: 'USD/troy oz' },
  { symbol: 'pa.f', name: 'Palladium', unit: 'USD/troy oz' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ series: [], error: 'FRED_API_KEY not configured' });

  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);
  const startStr = start.toISOString().slice(0, 10);

  const [fredResults, stooqResults] = await Promise.all([
    fetchAllFred(FRED_SERIES, apiKey, startStr),
    fetchAllStooq(STOOQ_SERIES, startStr),
  ]);

  const series = [...stooqResults, ...fredResults].filter(Boolean);
  res.json({ series, fetchedAt: new Date().toISOString() });
};

// ── FRED ──
async function fetchAllFred(list, apiKey, startStr) {
  const results = [];
  for (let i = 0; i < list.length; i++) {
    if (i > 0) await sleep(400);
    results.push(await fetchFred(list[i], apiKey, startStr));
  }
  return results;
}

async function fetchFred(s, apiKey, startStr) {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&sort_order=asc&observation_start=${startStr}&frequency=m`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const json = await r.json();
    if (json.error_message) return null;
    const obs = (json.observations || [])
      .filter(o => o.value !== '.')
      .map(o => ({ date: o.date, value: parseFloat(o.value) }));
    return obs.length >= 2 ? { name: s.name, unit: s.unit, data: obs } : null;
  } catch (_) { return null; }
}

// ── Stooq ──
async function fetchAllStooq(list, startStr) {
  return Promise.all(list.map(s => fetchStooq(s, startStr)));
}

async function fetchStooq(s, startStr) {
  try {
    const d1 = startStr.replace(/-/g, '');
    const d2 = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://stooq.com/q/d/l/?s=${s.symbol}&d1=${d1}&d2=${d2}&i=m`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const csv = await r.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return null;

    // CSV: Date,Open,High,Low,Close,Volume
    const data = lines.slice(1)
      .map(line => {
        const cols = line.split(',');
        const date = cols[0]?.trim();
        const close = parseFloat(cols[4]);
        return date && !isNaN(close) ? { date, value: close } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));

    return data.length >= 2 ? { name: s.name, unit: s.unit, data } : null;
  } catch (_) { return null; }
}
