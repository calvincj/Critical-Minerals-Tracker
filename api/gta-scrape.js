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

function stripHtml(str) {
  return str
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function scrapeOne(url, cookieHeader) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Cookie': cookieHeader },
      signal: AbortSignal.timeout(12000),
    });
    const html = await resp.text();

    // Authenticated page: full description in the text-[14px] paragraph
    const m = html.match(/class="text-\[14px\][^"]*"[^>]*>([\s\S]*?)<\/p>/);
    if (m) {
      const text = stripHtml(m[1]);
      if (text.length > 50 && !text.includes('Sign in')) return text;
    }

    // Fallback: meta description (truncated)
    const m2 = html.match(/name="description"[^>]+content="([^"]+)"/);
    if (m2) return stripHtml(m2[1]);
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

  // Fire all 292 requests simultaneously — Node.js event loop handles this fine
  const results = await Promise.allSettled(
    interventions.map(({ id, link }) =>
      scrapeOne(link, cookieHeader).then(desc => ({ id, desc }))
    )
  );

  const descriptions = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.desc) {
      descriptions[r.value.id] = r.value.desc;
    }
  }

  res.json({ descriptions, count: Object.keys(descriptions).length, fetchedAt: new Date().toISOString() });
};
