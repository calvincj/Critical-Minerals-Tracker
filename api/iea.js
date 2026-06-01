const Groq = require('groq-sdk');
const rawPolicies = require('../data/iea_policies.json');

const COUNTRY_NORMALIZE = {
  "People's Republic of China": "China",
  "Democratic Republic of the Congo": "DR Congo",
  "United Republic of Tanzania": "Tanzania",
  "United States of America": "USA",
  "United States": "USA",
  "Korea": "South Korea",
};

const TRACKED_MINERALS = ["Cobalt","Copper","Graphite","Lithium","Manganese","Nickel","Rare Earths","Silicon"];

function normalizeCountry(name) {
  return COUNTRY_NORMALIZE[name] || name;
}

function parseDate(datePromulgated, year) {
  const dp = String(datePromulgated || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dp)) return dp;
  if (/^\d{2}-\d{2}-\d{4}$/.test(dp)) {
    const [d, m, y] = dp.split('-');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{4}$/.test(dp)) return `${dp}-01-01`;
  return `${year}-01-01`;
}

const BATCH_SIZE = 25;

async function enrichBatch(groq, policies, startIdx) {
  const lines = policies.map((p, i) => {
    const countries = p.countries.map(normalizeCountry).join(', ') || 'Unknown';
    const desc = (p.description || '').slice(0, 300).replace(/\n/g, ' ');
    return `[${startIdx + i}] ${countries} | ${p.title} | ${desc}`;
  }).join('\n');

  const prompt = `You are a critical minerals policy analyst enriching a tracker dashboard.

For each policy entry, return:
1. "title": a clear 8-12 word title showing WHAT country did WHAT action to WHICH mineral. Drop bureaucratic identifiers (decision numbers, regulation codes, act names). Lead with the country. Example: "China Imposes Licensing Requirement on Graphite Exports" or "US and Australia Sign Critical Minerals Supply Agreement".
2. "summary": one sentence under 25 words. Start with country, use active verbs (imposed, signed, launched, enacted, banned, required). Include dollar amount only if explicitly stated.
3. "minerals": list of minerals this policy covers, chosen ONLY from: ["Cobalt","Copper","Graphite","Lithium","Manganese","Nickel","Rare Earths","Silicon","General","Others"]. Use "General" if the policy covers critical minerals broadly without naming one specifically. Use "Others" if it covers a specific mineral NOT in that list (e.g. chromium, tungsten, aluminium). Use multiple if applicable.

Entries (index | countries | title | description):
${lines}

Return ONLY valid JSON: {"items":[{"i":<index>,"title":"...","summary":"...","minerals":[...]},...]}`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
    temperature: 0.1,
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return parsed.items || [];
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const enrichMap = {};
    for (let i = 0; i < rawPolicies.length; i += BATCH_SIZE) {
      const batch = rawPolicies.slice(i, i + BATCH_SIZE);
      try {
        const results = await enrichBatch(groq, batch, i);
        for (const { i: idx, title, summary, minerals } of results) {
          enrichMap[idx] = { title, summary, minerals };
        }
      } catch (_) {}
    }

    const policies = rawPolicies.map((p, idx) => {
      const enriched = enrichMap[idx] || {};
      return {
        ...p,
        countries: (p.countries || []).map(normalizeCountry),
        dateISO: parseDate(p.datePromulgated, p.year),
        aiTitle: enriched.title || null,
        aiSummary: enriched.summary || null,
        aiMinerals: enriched.minerals || null,
      };
    });

    res.json({ policies, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[iea]', err.message);
    const policies = rawPolicies.map(p => ({
      ...p,
      countries: (p.countries || []).map(normalizeCountry),
      dateISO: parseDate(p.datePromulgated, p.year),
      aiTitle: null,
      aiSummary: null,
      aiMinerals: null,
    }));
    res.json({ policies, fetchedAt: new Date().toISOString() });
  }
};
