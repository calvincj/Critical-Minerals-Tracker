const Groq = require('groq-sdk');
const { XMLParser } = require('fast-xml-parser');

// Three SCMP feeds most likely to carry critical minerals stories
const SCMP_FEEDS = [
  'https://www.scmp.com/rss/318421/feed', // China Economy
  'https://www.scmp.com/rss/12/feed',     // Global Economy
  'https://www.scmp.com/rss/318199/feed', // Diplomacy & Defence
];

const MINERALS = ['Cobalt','Copper','Graphite','Lithium','Manganese','Nickel','Rare Earths','Silicon'];
const DEAL_TYPES = ['Investment Agreement','Non-Investment Agreement','Trade Deal','Statement'];

module.exports = async function handler(req, res) {
  // Vercel CDN caches for 6 hours; stale-while-revalidate for 1 hour on top
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  try {
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
    const items = [];

    for (const feedUrl of SCMP_FEEDS) {
      try {
        const r = await fetch(feedUrl, {
          headers: { 'User-Agent': 'CriticalMineralsTracker/1.0 (RSS reader)' },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) continue;
        const xml = await r.text();
        const parsed = parser.parse(xml);
        const raw = parsed?.rss?.channel?.item || [];
        const arr = Array.isArray(raw) ? raw : [raw];
        for (const item of arr) {
          items.push({
            title: String(item.title || '').trim(),
            description: String(item.description || item['content:encoded'] || '')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 250),
            link: String(item.link || item.guid || '').trim(),
            pubDate: String(item.pubDate || '').trim(),
          });
        }
      } catch (_) {
        // skip failed individual feeds silently
      }
    }

    if (items.length === 0) {
      return res.json({ articles: [], source: 'scmp', fetchedAt: new Date().toISOString() });
    }

    // Cap at 25 items to stay well within 6k TPM free-tier limit
    // (~80 tokens/item × 25 = 2,000 tokens input; output ~800 tokens; well under limit)
    const batch = items.slice(0, 25);

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const prompt = `You are a critical minerals trade analyst. Review these South China Morning Post article titles and descriptions.
Return ONLY articles relevant to: critical minerals, mining, mineral trade deals, FDI in mining/processing, mineral supply chains, battery materials, rare earths, mineral export controls, or mineral-related policy.
Ignore all other articles (politics, sport, culture, etc.).

For each relevant article output one JSON object.
Mineral list: ${MINERALS.join(', ')}.
Deal type list: ${DEAL_TYPES.join(', ')}, Other.
Section rules — pick exactly one:
  "deals"    = trade agreements, investment deals, FDI, export controls, sanctions, policy statements
  "projects" = new mines, refineries, processing plants, exploration announcements, construction milestones
  "prices"   = price movements, supply/demand shifts, market outlooks, production cuts/increases

Articles (index | title | description | date):
${batch.map((it, i) => `[${i}] ${it.title} | ${it.description} | ${it.pubDate}`).join('\n')}

Respond ONLY with valid JSON:
{"articles":[{"index":<number>,"title":"<concise headline: use X/Y for countries, drop org names, keep key number/action, 8 words max — e.g. 'China Bans Rare Earth Exports to US' or 'US/Japan Sign Lithium Supply Deal'>","summary":"<2 sentences max>","minerals":["<mineral>"],"dealType":"<type>","section":"<deals|projects|prices>"}]}
If no articles are relevant, return {"articles":[]}.`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      temperature: 0.1,
    });

    let parsed;
    try {
      parsed = JSON.parse(completion.choices[0].message.content);
    } catch (_) {
      return res.json({ articles: [], source: 'scmp', fetchedAt: new Date().toISOString() });
    }

    const articles = (parsed.articles || [])
      .filter(a => typeof a.index === 'number' && batch[a.index])
      .map(a => ({
        title: a.title || batch[a.index].title,
        summary: a.summary || '',
        minerals: Array.isArray(a.minerals) ? a.minerals : [],
        dealType: a.dealType || 'Other',
        section: ['deals','projects','prices'].includes(a.section) ? a.section : 'deals',
        date: batch[a.index].pubDate,
        link: batch[a.index].link,
        source: 'SCMP',
      }));

    res.json({ articles, source: 'scmp', fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[news]', err.message);
    res.status(500).json({ articles: [], error: err.message });
  }
};
