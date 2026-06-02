const WTO_HS = require('../data/wto_hs_codes.json');
const ALL_HS_CODES = Object.values(WTO_HS).flat();

module.exports = async function handler(req, res) {
  const r = await fetch('https://api.globaltradealert.org/api/v1/data/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `APIKey ${process.env.GLOBALTRADEALERT_API_KEY}` },
    body: JSON.stringify({ limit: 1, offset: 0, request_data: { affected_products: ALL_HS_CODES.slice(0, 5), announcement_period: { from: '2025-01-01', to: null } } }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await r.json();
  const item = (json.data || [])[0] || {};
  res.json({ fields: Object.keys(item), sample: item });
};
