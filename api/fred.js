const SERIES = [
  { id: 'PGOLDUSDM',   name: 'Gold',      unit: 'USD/troy oz'    },
  { id: 'PSILVERUSDM', name: 'Silver',    unit: 'USD/troy oz'    },
  { id: 'PCOPPUSDM',   name: 'Copper',    unit: 'USD/metric ton' },
  { id: 'PNICKUSDM',   name: 'Nickel',    unit: 'USD/metric ton' },
  { id: 'PALUMUSDM',   name: 'Aluminum',  unit: 'USD/metric ton' },
  { id: 'PLEADUSDM',   name: 'Lead',      unit: 'USD/metric ton' },
  { id: 'PZINCUSDM',   name: 'Zinc',      unit: 'USD/metric ton' },
  { id: 'PPLATUSDM',   name: 'Platinum',  unit: 'USD/troy oz'    },
  { id: 'PPALAUSDM',   name: 'Palladium', unit: 'USD/troy oz'    },
  { id: 'PCOBAUSDM',   name: 'Cobalt',    unit: 'USD/metric ton' },
];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // temp: disable cache while debugging

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ series: [], error: 'FRED_API_KEY not configured' });

  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);
  const startStr = start.toISOString().slice(0, 10);

  const debug = [];

  const results = await Promise.all(SERIES.map(async s => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&sort_order=asc&observation_start=${startStr}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) {
        debug.push({ id: s.id, status: r.status, error: 'http_error' });
        return null;
      }
      const json = await r.json();
      if (json.error_message) {
        debug.push({ id: s.id, error: json.error_message });
        return null;
      }

      const obs = (json.observations || [])
        .filter(o => o.value !== '.')
        .map(o => ({ date: o.date, value: parseFloat(o.value) }));

      if (obs.length < 2) {
        debug.push({ id: s.id, error: `only ${obs.length} obs` });
        return null;
      }
      debug.push({ id: s.id, ok: true, count: obs.length });
      return { name: s.name, unit: s.unit, data: obs };
    } catch (e) {
      debug.push({ id: s.id, error: e.message });
      return null;
    }
  }));

  res.json({ series: results.filter(Boolean), debug, fetchedAt: new Date().toISOString() });
};
