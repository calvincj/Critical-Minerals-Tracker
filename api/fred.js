// Debug Silver + Palladium; also try PSILVUSDM as IMF silver alternative
const SERIES = [
  { id: 'SLVPRUSD',   name: 'Silver-SLVPRUSD',    noFreq: true  },
  { id: 'PSILVUSDM',  name: 'Silver-PSILVUSDM',   noFreq: false },
  { id: 'PPALAUSDM',  name: 'Palladium-PPALAUSDM', noFreq: false },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'no key' });

  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);
  const startStr = start.toISOString().slice(0, 10);

  const out = [];
  for (let i = 0; i < SERIES.length; i++) {
    if (i > 0) await sleep(500);
    const s = SERIES[i];
    const freqParam = s.noFreq ? '' : '&frequency=m';
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&sort_order=asc&observation_start=${startStr}${freqParam}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const json = await r.json();
      const obs = (json.observations || []).filter(o => o.value !== '.');
      out.push({ id: s.id, name: s.name, status: r.status, error: json.error_message || null, count: obs.length, latest: obs[obs.length-1] });
    } catch (e) {
      out.push({ id: s.id, name: s.name, error: e.message });
    }
  }
  res.json({ out });
};
