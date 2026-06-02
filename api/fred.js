const SERIES = [
  { id: 'GOLDAMGBD228NLBM', name: 'Gold',      unit: 'USD/troy oz',    resample: true  },
  { id: 'SLVPRUSD',         name: 'Silver',    unit: 'USD/troy oz',    resample: false },
  { id: 'PCOPPUSDM',        name: 'Copper',    unit: 'USD/metric ton', resample: false },
  { id: 'PNICKUSDM',        name: 'Nickel',    unit: 'USD/metric ton', resample: false },
  { id: 'PALUMUSDM',        name: 'Aluminum',  unit: 'USD/metric ton', resample: false },
  { id: 'PLEADUSDM',        name: 'Lead',      unit: 'USD/metric ton', resample: false },
  { id: 'PZINCUSDM',        name: 'Zinc',      unit: 'USD/metric ton', resample: false },
  { id: 'PPLTMUSDM',        name: 'Platinum',  unit: 'USD/troy oz',    resample: false },
  { id: 'PPALAUSDM',        name: 'Palladium', unit: 'USD/troy oz',    resample: false },
  { id: 'PCOBAUSDM',        name: 'Cobalt',    unit: 'USD/metric ton', resample: false },
];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ series: [], error: 'FRED_API_KEY not configured' });

  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);
  const startStr = start.toISOString().slice(0, 10);

  const results = await Promise.all(SERIES.map(async s => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&sort_order=asc&observation_start=${startStr}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return null;
      const json = await r.json();
      if (json.error_message) return null;

      const obs = (json.observations || [])
        .filter(o => o.value !== '.')
        .map(o => ({ date: o.date, value: parseFloat(o.value) }));

      if (obs.length < 2) return null;

      const data = s.resample ? toMonthly(obs) : obs;
      return { name: s.name, unit: s.unit, data };
    } catch (_) {
      return null;
    }
  }));

  res.json({ series: results.filter(Boolean), fetchedAt: new Date().toISOString() });
};

function toMonthly(obs) {
  const byMonth = {};
  for (const o of obs) {
    byMonth[o.date.slice(0, 7)] = o.value; // last value per month
  }
  return Object.entries(byMonth).map(([ym, value]) => ({ date: ym + '-01', value }));
}
