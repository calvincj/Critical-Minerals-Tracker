// Base metals from FRED (IMF Primary Commodity Prices, monthly)
const FRED_SERIES = [
  { id: 'PCOPPUSDM', name: 'Copper',   unit: 'USD/metric ton' },
  { id: 'PNICKUSDM', name: 'Nickel',   unit: 'USD/metric ton' },
  { id: 'PALUMUSDM', name: 'Aluminum', unit: 'USD/metric ton' },
  { id: 'PLEADUSDM', name: 'Lead',     unit: 'USD/metric ton' },
  { id: 'PZINCUSDM', name: 'Zinc',     unit: 'USD/metric ton' },
];

// Precious metals from Yahoo Finance (monthly futures)
const YAHOO_SERIES = [
  { symbol: 'GC=F', name: 'Gold',      unit: 'USD/troy oz' },
  { symbol: 'SI=F', name: 'Silver',    unit: 'USD/troy oz' },
  { symbol: 'PL=F', name: 'Platinum',  unit: 'USD/troy oz' },
  { symbol: 'PA=F', name: 'Palladium', unit: 'USD/troy oz' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ series: [], error: 'FRED_API_KEY not configured' });

  const startStr = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    return d.toISOString().slice(0, 10);
  })();

  // FRED and Yahoo run in parallel (different hosts, no shared rate limit)
  const [fredResults, yahooResults] = await Promise.all([
    fetchAllFred(FRED_SERIES, apiKey, startStr),
    fetchAllYahoo(YAHOO_SERIES),
  ]);

  const series = [...yahooResults, ...fredResults].filter(Boolean);
  res.json({ series, fetchedAt: new Date().toISOString() });
};

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

async function fetchAllYahoo(list) {
  return Promise.all(list.map(fetchYahoo));
}

async function fetchYahoo(s) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}?interval=1mo&range=10y`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const json = await r.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const data = timestamps
      .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), value: closes[i] }))
      .filter(d => d.value != null);
    return data.length >= 2 ? { name: s.name, unit: s.unit, data } : null;
  } catch (_) { return null; }
}
