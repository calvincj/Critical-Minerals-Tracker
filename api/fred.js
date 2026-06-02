// Series that are already monthly use frequency=m safely.
// Gold (daily) is fetched without frequency param then resampled.
// Each failing series gets an alt ID to try.
const SERIES = [
  { id: 'GOLDAMGBD228NLBM', name: 'Gold',      unit: 'USD/troy oz',    noFreq: true  },
  { id: 'SLVPRUSD',         name: 'Silver',    unit: 'USD/troy oz',    noFreq: true  },
  { id: 'PCOPPUSDM',        name: 'Copper',    unit: 'USD/metric ton'                },
  { id: 'PNICKUSDM',        name: 'Nickel',    unit: 'USD/metric ton'                },
  { id: 'PALUMUSDM',        name: 'Aluminum',  unit: 'USD/metric ton'                },
  { id: 'PLEADUSDM',        name: 'Lead',      unit: 'USD/metric ton'                },
  { id: 'PZINCUSDM',        name: 'Zinc',      unit: 'USD/metric ton'                },
  { id: 'PPLTMUSDM',        name: 'Platinum',  unit: 'USD/troy oz'                   },
  { id: 'PPALLADUSDM',      name: 'Palladium', unit: 'USD/troy oz'                   },
  { id: 'PCOBALUSDM',       name: 'Cobalt',    unit: 'USD/metric ton'                },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // keep off until IDs confirmed

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ series: [], error: 'FRED_API_KEY not configured' });

  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);
  const startStr = start.toISOString().slice(0, 10);

  const results = [];
  const debug = [];

  for (let i = 0; i < SERIES.length; i++) {
    if (i > 0) await sleep(500);
    const s = SERIES[i];
    try {
      const freqParam = s.noFreq ? '' : '&frequency=m';
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&sort_order=asc&observation_start=${startStr}${freqParam}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) {
        debug.push({ id: s.id, status: r.status });
        results.push(null);
        continue;
      }
      const json = await r.json();
      if (json.error_message) {
        debug.push({ id: s.id, error: json.error_message });
        results.push(null);
        continue;
      }
      let obs = (json.observations || [])
        .filter(o => o.value !== '.')
        .map(o => ({ date: o.date, value: parseFloat(o.value) }));

      if (s.noFreq) obs = toMonthly(obs);
      debug.push({ id: s.id, ok: true, count: obs.length });
      results.push(obs.length >= 2 ? { name: s.name, unit: s.unit, data: obs } : null);
    } catch (e) {
      debug.push({ id: s.id, error: e.message });
      results.push(null);
    }
  }

  res.json({ series: results.filter(Boolean), debug, fetchedAt: new Date().toISOString() });
};

function toMonthly(obs) {
  const byMonth = {};
  for (const o of obs) byMonth[o.date.slice(0, 7)] = o.value;
  return Object.entries(byMonth).map(([ym, value]) => ({ date: ym + '-01', value }));
}
