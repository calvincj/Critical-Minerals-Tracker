const Groq = require('groq-sdk');
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
    aiTitle: null,
    aiSummary: null,
  };
}

// ── Groq enrichment ────────────────────────────────────────────────────────
async function enrichWithGroq(groq, records) {
  if (!records.length) return;
  const lines = records.map((r, i) =>
    `[${i}] ${r.implementers.slice(0,3).join(', ')||'Unknown'} | ${r.minerals.join(', ')} | ${r.interventionType} | ${r.title}`
  ).join('\n');

  const resp = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: `You are a critical minerals policy analyst. For each entry generate a clear title and summary.

TITLE: 8-12 words, must include (1) country, (2) action verb, (3) mineral. Format: "[Country] [verb] [action] on [mineral]"
SUMMARY: 2-3 sentences, 40-70 words. Cover: what country did, which mineral, what mechanism, key details. No "This policy" opener.

Entries (index | implementers | minerals | type | original title):
${lines}

Return ONLY JSON: {"items":[{"i":<n>,"title":"...","summary":"..."}]}` }],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
    temperature: 0.1,
  });

  const parsed = JSON.parse(resp.choices[0].message.content);
  for (const { i, title, summary } of (parsed.items || [])) {
    if (i >= 0 && i < records.length) {
      records[i].aiTitle = title || null;
      records[i].aiSummary = summary || null;
    }
  }
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

    // Groq-enrich all live records (small batch, fast)
    if (process.env.GROQ_API_KEY && interventions.length) {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      // Process in chunks of 25 to stay safe
      for (let i = 0; i < interventions.length; i += 25) {
        try { await enrichWithGroq(groq, interventions.slice(i, i + 25)); } catch (_) {}
      }
    }

    res.json({ interventions, count: interventions.length, from, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[gta-live]', err.message);
    res.json({ interventions: [], error: err.message });
  }
};
