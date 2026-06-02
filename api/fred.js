// One-shot probe for remaining unknowns — read the actual FRED error messages
const PROBES = [
  'GOLDAMGBD228NLBM',
  'GOLDPMGBD228NLBM',
  'XPTUSX',
  'XPTUSM',
  'PPALTM',
  'PCOBAUSDM',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'no key' });

  const out = [];
  for (let i = 0; i < PROBES.length; i++) {
    if (i > 0) await sleep(500);
    const id = PROBES[i];
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${apiKey}&file_type=json&limit=1`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const json = await r.json();
      out.push({ id, status: r.status, error: json.error_message || null, ok: r.status === 200 && !json.error_message });
    } catch (e) {
      out.push({ id, status: 'timeout', ok: false });
    }
  }
  res.json({ out });
};
