// Base metal price data from FRED (IMF Primary Commodity Prices, monthly)
// Note: front-end now uses TradingView widgets; this endpoint is kept for
// potential future server-side use.
const SERIES = [
  { id: 'PCOPPUSDM', name: 'Copper',   unit: 'USD/metric ton' },
  { id: 'PNICKUSDM', name: 'Nickel',   unit: 'USD/metric ton' },
  { id: 'PALUMUSDM', name: 'Aluminum', unit: 'USD/metric ton' },
  { id: 'PLEADUSDM', name: 'Lead',     unit: 'USD/metric ton' },
  { id: 'PZINCUSDM', name: 'Zinc',     unit: 'USD/metric ton' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ series: [], error: 'FRED_API_KEY not configured' });

  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);
  const startStr = start.toISOString().slice(0, 10);

  const results = [];
  for (let i = 0; i < SERIES.length; i++) {
    if (i > 0) await sleep(400);
    const s = SERIES[i];
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&sort_order=asc&observation_start=${startStr}&frequency=m`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) { results.push(null); continue; }
      const json = await r.json();
      if (json.error_message) { results.push(null); continue; }
      const obs = (json.observations || []).filter(o => o.value !== '.').map(o => ({ date: o.date, value: parseFloat(o.value) }));
      results.push(obs.length >= 2 ? { name: s.name, unit: s.unit, data: obs } : null);
    } catch (_) { results.push(null); }
  }

  res.json({ series: results.filter(Boolean), fetchedAt: new Date().toISOString() });
};
