// World Bank Pink Sheet commodity prices — monthly, no auth required
const SERIES = [
  { id: 'PCOPP.USD',  name: 'Copper',    unit: 'USD/metric ton' },
  { id: 'PNICK.USD',  name: 'Nickel',    unit: 'USD/metric ton' },
  { id: 'PCOBA.USD',  name: 'Cobalt',    unit: 'USD/metric ton' },
  { id: 'PALUM.USD',  name: 'Aluminum',  unit: 'USD/metric ton' },
  { id: 'PZINC.USD',  name: 'Zinc',      unit: 'USD/metric ton' },
  { id: 'PLEAD.USD',  name: 'Lead',      unit: 'USD/metric ton' },
  { id: 'PGOLD.USD',  name: 'Gold',      unit: 'USD/troy oz' },
  { id: 'PSILV.USD',  name: 'Silver',    unit: 'USD/troy oz' },
  { id: 'PPLAT.USD',  name: 'Platinum',  unit: 'USD/troy oz' },
];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600');

  const results = await Promise.allSettled(
    SERIES.map(async s => {
      const url = `https://api.worldbank.org/v2/country/all/indicator/${s.id}?format=json&date=2014M01:2026M12&per_page=600`;
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();

      // Commodity series have one value per date — dedupe by date, take first non-null
      const byDate = new Map();
      for (const o of (json[1] || [])) {
        if (o.value === null || o.value === undefined) continue;
        if (!byDate.has(o.date)) byDate.set(o.date, o.value);
      }

      const data = [...byDate.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (data.length < 2) throw new Error('insufficient data');
      return { name: s.name, unit: s.unit, data };
    })
  );

  const series = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean);

  res.json({ series, fetchedAt: new Date().toISOString() });
};
