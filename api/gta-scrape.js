const { interventions } = require('../data/gta-interventions.json');

async function getToken() {
  const resp = await fetch('https://api.globaltradealert.org/v1/auth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://globaltradealert.org', 'Referer': 'https://globaltradealert.org/' },
    body: JSON.stringify({ username: process.env.GTA_EMAIL, password: process.env.GTA_PASSWORD, application: 'GTA_WEBSITE' }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Login failed: ${resp.status}`);
  const data = await resp.json();
  return data.access || data.token || null;
}

async function scrapeOne(url, cookieHeader) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Cookie': cookieHeader },
      signal: AbortSignal.timeout(10000),
    });
    const html = await resp.text();

    // Authenticated page: full description is in the text-[14px] paragraph
    const m = html.match(/class="text-\[14px\][^"]*"[^>]*>([\s\S]*?)<\/p>/);
    if (m) {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
      if (text.length > 50 && !text.includes('Sign in')) return text;
    }

    // Fallback: meta description (truncated, but better than nothing)
    const m2 = html.match(/name="description"[^>]+content="([^"]+)"/);
    if (m2) return m2[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim();
  } catch (_) {}
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  if (!process.env.GTA_EMAIL || !process.env.GTA_PASSWORD) {
    return res.json({ descriptions: {}, error: 'GTA credentials not configured' });
  }

  let token;
  try {
    token = await getToken();
  } catch (err) {
    return res.json({ descriptions: {}, error: err.message });
  }

  if (!token) return res.json({ descriptions: {}, error: 'No token returned' });

  const cookieHeader = `auth._token.local=${encodeURIComponent(`Bearer ${token}`)}`;
  const descriptions = {};

  // Batch into groups of 40 to avoid overwhelming GTA's servers
  const BATCH = 40;
  for (let i = 0; i < interventions.length; i += BATCH) {
    const batch = interventions.slice(i, i + BATCH);
    await Promise.all(batch.map(async ({ id, link }) => {
      const desc = await scrapeOne(link, cookieHeader);
      if (desc) descriptions[id] = desc;
    }));
  }

  res.json({ descriptions, count: Object.keys(descriptions).length, fetchedAt: new Date().toISOString() });
};
