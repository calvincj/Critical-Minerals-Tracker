const { interventions } = require('../data/gta-interventions.json');

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  res.json({ interventions, count: interventions.length, fetchedAt: new Date().toISOString() });
};
