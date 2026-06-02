const SERIES = [
  { id: 'SLVPRUSD',  name: 'Silver',    unit: 'USD/troy oz',    noFreq: true },
  { id: 'PCOPPUSDM', name: 'Copper',    unit: 'USD/metric ton'               },
  { id: 'PNICKUSDM', name: 'Nickel',    unit: 'USD/metric ton'               },
  { id: 'PALUMUSDM', name: 'Aluminum',  unit: 'USD/metric ton'               },
  { id: 'PLEADUSDM', name: 'Lead',      unit: 'USD/metric ton'               },
  { id: 'PZINCUSDM', name: 'Zinc',      unit: 'USD/metric ton'               },
  { id: 'PPALAUSDM', name: 'Palladium', unit: 'USD/troy oz'                  },
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
    results.push(await fetchSeries(SERIES[i], apiKey, startStr));
  }

  res.json({ series: results.filter(Boolean), fetchedAt: new Date().toISOString() });
};

async function fetchSeries(s, apiKey, startStr) {
  try {
    const freqParam = s.noFreq ? '' : '&frequency=m';
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&sort_order=asc&observation_start=${startStr}${freqParam}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const json = await r.json();
    if (json.error_message) return null;

    let obs = (json.observations || [])
      .filter(o => o.value !== '.')
      .map(o => ({ date: o.date, value: parseFloat(o.value) }));

    if (s.noFreq) obs = toMonthly(obs);
    return obs.length >= 2 ? { name: s.name, unit: s.unit, data: obs } : null;
  } catch (_) {
    return null;
  }
}

function toMonthly(obs) {
  const byMonth = {};
  for (const o of obs) byMonth[o.date.slice(0, 7)] = o.value;
  return Object.entries(byMonth).map(([ym, value]) => ({ date: ym + '-01', value }));
}
