// Test multiple candidate IDs per metal to find what FRED actually accepts
const CANDIDATES = [
  { name: 'Gold',      unit: 'USD/troy oz',    ids: ['GOLDPMGBD228NLBM','GOLDAMGBD228NLBM','XAUUSD','PGOLDUSDM'], noFreq: true },
  { name: 'Silver',    unit: 'USD/troy oz',    ids: ['SLVPRUSD','XAGUSD','PSILVUSDM','PSILVERUSDM'],             noFreq: true },
  { name: 'Platinum',  unit: 'USD/troy oz',    ids: ['PPLTMUSDM','PPLATUSDM','XPTUSX','XPTUSM']                              },
  { name: 'Palladium', unit: 'USD/troy oz',    ids: ['PPALAUSDM','XPDUSM','PPALLADUSDM','PPALADUSDM']                        },
  { name: 'Cobalt',    unit: 'USD/metric ton', ids: ['PCOBAUSDM','PCOBALUSDM','COBALT']                                      },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ results: [], error: 'FRED_API_KEY not configured' });

  const results = [];
  let i = 0;
  for (const c of CANDIDATES) {
    for (const id of c.ids) {
      if (i++ > 0) await sleep(400);
      const freqParam = c.noFreq ? '' : '&frequency=m';
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${apiKey}&file_type=json&sort_order=asc&observation_start=2020-01-01${freqParam}`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const body = await r.text();
        const ok = r.status === 200 && !body.includes('"error_message"');
        results.push({ metal: c.name, id, status: r.status, ok });
        if (ok) break; // found a working ID for this metal, skip rest
      } catch (e) {
        results.push({ metal: c.name, id, status: 'timeout', ok: false });
      }
    }
  }

  res.json({ results });
};
