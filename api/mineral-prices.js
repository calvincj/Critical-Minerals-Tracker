module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  try {
    const r = await fetch('https://mineralprices.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CriticalMineralsTracker/1.0; +https://github.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const prices = parseTable(html);

    if (prices.length === 0) throw new Error('No prices parsed from page');

    res.json({ prices, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[mineral-prices]', err.message);
    res.status(500).json({ prices: [], error: err.message });
  }
};

function parseTable(html) {
  const strip = s => s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/−/g, '-')   // Unicode minus sign → hyphen-minus
    .replace(/ /g, ' ')   // Non-breaking space
    .replace(/\s+/g, ' ')
    .trim();

  const tableRe = /<table[\s\S]*?<\/table>/gi;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  const prices = [];

  for (const tableMatch of html.matchAll(tableRe)) {
    const localPrices = [];

    for (const row of tableMatch[0].matchAll(rowRe)) {
      const cells = [...row[1].matchAll(cellRe)].map(m => strip(m[1]));
      if (cells.length < 8) continue;

      const [name, value, change, changePct, open, high, low, prev] = cells;
      if (!name || name.toLowerCase() === 'name') continue;

      const numVal = parseFloat(value.replace(/,/g, ''));
      if (isNaN(numVal) || numVal <= 0) continue;

      // Normalise change sign
      const normChange = change.replace(/\s/g, '');
      const dir = normChange.startsWith('-') ? 'down' : 'up';

      localPrices.push({ name, value, change, changePct, open, high, low, prev, dir });
    }

    if (localPrices.length >= 5) {
      prices.push(...localPrices);
      break;
    }
  }

  return prices;
}
