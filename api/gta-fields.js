const WTO_HS = require('../data/wto_hs_codes.json');
const ALL_HS_CODES = Object.values(WTO_HS).flat();

module.exports = async function handler(req, res) {
  try {
    const r = await fetch('https://api.globaltradealert.org/api/v1/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `APIKey ${process.env.GLOBALTRADEALERT_API_KEY}` },
      body: JSON.stringify({ limit: 1, offset: 0, request_data: { affected_products: ALL_HS_CODES.slice(0, 5), announcement_period: { from: '2025-01-01', to: null } } }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
    const item = (parsed?.data || [])[0] || {};
    res.json({ status: r.status, hasKey: !!process.env.GLOBALTRADEALERT_API_KEY, fields: Object.keys(item), rawPreview: text.slice(0, 500) });
  } catch (err) {
    res.json({ error: err.message });
  }
};
