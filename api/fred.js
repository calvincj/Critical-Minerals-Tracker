// Quick probe: one candidate per unknown metal, minimal params
const PROBES = [
  { id: 'GOLDAMGBD228NLBM', note: 'gold-lbma-am'     },
  { id: 'XAUUSD',           note: 'gold-xauusd'       },
  { id: 'SLVPRUSD',         note: 'silver-lbma'       },
  { id: 'XAGUSD',           note: 'silver-xagusd'     },
  { id: 'PPLTMUSDM',        note: 'platinum-pltm'     },
  { id: 'PPALAUSDM',        note: 'palladium-pala'    },
  { id: 'PPALLADUSDM',      note: 'palladium-pallad'  },
  { id: 'PCOBAUSDM',        note: 'cobalt-coba'       },
  { id: 'PCOBALUSDM',       note: 'cobalt-cobal'      },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'no key' });

  const out = [];
  for (let i = 0; i < PROBES.length; i++) {
    if (i > 0) await sleep(300);
    const { id, note } = PROBES[i];
    try {
      // minimal params — no observation_start, no sort_order, no frequency
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${apiKey}&file_type=json&limit=1`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const text = await r.text();
      const hasError = text.includes('"error_message"');
      out.push({ id, note, status: r.status, ok: r.status === 200 && !hasError });
    } catch (e) {
      out.push({ id, note, status: 'timeout', ok: false });
    }
  }
  res.json({ out });
};
