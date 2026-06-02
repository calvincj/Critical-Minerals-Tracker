const WTO_HS = require('../data/wto_hs_codes.json');

// ── Lookups ────────────────────────────────────────────────────────────────
const CODE_TO_MINERAL = {};
for (const [mineral, codes] of Object.entries(WTO_HS)) {
  for (const code of codes) CODE_TO_MINERAL[code] = mineral;
}
const ALL_HS_CODES = Object.values(WTO_HS).flat();

const KEYWORDS = [
  'cobalt','copper','graphite','lithium','manganese','nickel','rare earth','silicon',
  'chromium','chrome ore','tungsten','molybdenum','vanadium','platinum','palladium',
  'mine ','mining','miner','refinery','refining','smelting','smelter','metallurg',
  'battery','batteries','critical mineral',
];

const COUNTRY_NORMALIZE = {
  'United States of America': 'United States',
  'Republic of Korea': 'South Korea',
  "People's Republic of China": 'China',
  'Democratic Republic of the Congo': 'DR Congo',
  'United Republic of Tanzania': 'Tanzania',
  'Korea': 'South Korea',
};

function normCountry(c) { return COUNTRY_NORMALIZE[c.trim()] || c.trim(); }
function isRelevant(title) { return KEYWORDS.some(kw => title.toLowerCase().includes(kw)); }

function nDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Map GTA API item → our internal format ─────────────────────────────────
function mapItem(item) {
  const minerals = [...new Set(
    (item.affected_products || [])
      .map(p => CODE_TO_MINERAL[String(p.hs_code ?? p)])
      .filter(Boolean)
  )].sort();

  if (!minerals.length) return null;

  const title = (item.title || '').trim();
  if (!isRelevant(title)) return null;

  const evalRaw = item.gta_evaluation || 'murky';
  const evaluation = { harmful: 'harmful', liberalising: 'liberalising', murky: 'murky' }[evalRaw] || 'murky';
  const types = (item.intervention_types || []).map(t => t.name || '');
  const isSubsidy = types.some(n => /subsid|loan|grant|tax relief|state aid/i.test(n));
  const dealType = isSubsidy ? 'Subsidy' : (evaluation === 'liberalising' ? 'Trade Deal' : 'Trade Control');

  const dateRaw = item.date_implemented || item.date_announced || '';
  const dateISO = dateRaw ? dateRaw.slice(0, 10) : '';
  const date = dateISO
    ? new Date(dateISO + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : '';

  return {
    id: String(item.intervention_id),
    title,
    evaluation,
    dealType,
    interventionType: types.join(', '),
    minerals,
    implementers: (item.implementing_jurisdictions || []).map(j => normCountry(j.name || j.iso_code || '')).filter(Boolean),
    date,
    dateISO,
    link: item.source_url || `https://www.globaltradealert.org/intervention/${item.intervention_id}`,
    description: null,
  };
}

// ── Scrape description from GTA intervention page ──────────────────────────
async function fetchDescription(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CriticalMineralsTracker/1.0 (research)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    const m = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/);
    if (m) return m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
  } catch (_) {}
  return null;
}

async function scrapeDescriptions(records) {
  await Promise.all(records.map(async r => {
    r.description = await fetchDescription(r.link);
  }));
}

// ── Handler ────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Cache 1 hour — fresh enough to catch daily GTA updates
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  if (!process.env.GLOBALTRADEALERT_API_KEY) {
    return res.json({ interventions: [], note: 'GTA API key not configured' });
  }

  try {
    const from = nDaysAgo(60); // last 60 days — catches recent updates

    const body = {
      limit: 200,
      offset: 0,
      sorting: '-date_implemented',
      request_data: {
        affected_products: ALL_HS_CODES,
        announcement_period: { from, to: null },
        gta_evaluation: ['harmful', 'liberalising', 'murky'],
      },
    };

    const gtar = await fetch('https://api.globaltradealert.org/api/v1/data/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `APIKey ${process.env.GLOBALTRADEALERT_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });

    if (!gtar.ok) throw new Error(`GTA ${gtar.status}`);

    const { data = [] } = await gtar.json();
    const interventions = data.map(mapItem).filter(Boolean);

    // Scrape descriptions in parallel (capped at 20 concurrent to be polite)
    const CONCURRENCY = 20;
    for (let i = 0; i < interventions.length; i += CONCURRENCY) {
      await scrapeDescriptions(interventions.slice(i, i + CONCURRENCY));
    }

    res.json({ interventions, count: interventions.length, from, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[gta-live]', err.message);
    res.json({ interventions: [], error: err.message });
  }
};
