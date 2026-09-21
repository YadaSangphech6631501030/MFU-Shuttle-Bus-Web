const router = require('express').Router();
const publicData = require('../services/public-data-runtime');

router.get('/public-data', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const version = typeof req.query.catalogVersion === 'string' && /^[a-f0-9]{64}$/.test(req.query.catalogVersion)
    ? req.query.catalogVersion : undefined;
  const routesVersion = typeof req.query.routesVersion === 'string' && /^[a-f0-9]{64}$/.test(req.query.routesVersion)
    ? req.query.routesVersion : undefined;
  try { res.json(await publicData.get(version, routesVersion)); }
  catch { res.status(503).json({ error: 'Unable to load station data' }); }
});

module.exports = router;
