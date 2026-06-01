const Groq = require('groq-sdk');
const { interventions: raw } = require('../data/gta-interventions.json');

const BATCH_SIZE = 40;

const SYSTEM_PROMPT = `You are a critical minerals policy analyst writing for a trade tracker dashboard.
Rewrite each GTA policy intervention with a clear title and summary.

TITLE rules (strictly follow):
- 8-12 words maximum
- Must include ALL THREE: (1) country name, (2) action verb, (3) mineral name
- Format: "[Country] [verb] [action] on [mineral]"
- Use active verbs: imposes, bans, grants, enacts, restricts, exempts, awards, extends, requires, launches
- Examples: "China Imposes Export Licensing Requirement on Graphite" / "Indonesia Bans Export of Unprocessed Nickel Ore" / "USA Awards $117M Grant for Synthetic Graphite Development"

SUMMARY rules:
- 2-3 sentences, 40-70 words total
- Sentence 1: What country did what specific action, on which mineral
- Sentence 2: Key details — scope, amount, mechanism, or who is affected
- Sentence 3 (optional): Why it matters or notable context
- Do NOT start with "This policy" or "The government"
- Include currency amount if explicitly mentioned in the original title`;

async function enrichBatch(groq, records) {
  const lines = records.map((r, i) => {
    const implementers = r.implementers.slice(0, 3).join(', ') || 'Unknown';
    const minerals = r.minerals.join(', ') || 'Unknown';
    return `[${i}] ${implementers} | ${minerals} | ${r.interventionType} | ${r.title}`;
  }).join('\n');

  const resp = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\nEntries (index | implementers | minerals | intervention type | original title):\n${lines}\n\nReturn ONLY valid JSON:\n{"items":[{"i":<index>,"title":"...","summary":"..."}]}` }],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
    temperature: 0.1,
  });

  const parsed = JSON.parse(resp.choices[0].message.content);
  return parsed.items || [];
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const enrichMap = {};

    for (let i = 0; i < raw.length; i += BATCH_SIZE) {
      const batch = raw.slice(i, i + BATCH_SIZE);
      try {
        const results = await enrichBatch(groq, batch);
        for (const { i: j, title, summary } of results) {
          if (j >= 0 && j < batch.length) enrichMap[i + j] = { title, summary };
        }
      } catch (_) {}
    }

    const interventions = raw.map((r, idx) => ({
      ...r,
      aiTitle: enrichMap[idx]?.title || null,
      aiSummary: enrichMap[idx]?.summary || null,
    }));

    res.json({ interventions, count: interventions.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[gta]', err.message);
    // Fallback: serve raw data without AI enrichment
    res.json({ interventions: raw, count: raw.length, fetchedAt: new Date().toISOString() });
  }
};
