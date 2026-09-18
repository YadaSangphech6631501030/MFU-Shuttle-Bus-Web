const router = require('express').Router();
const { getDB } = require('../db');
const tokenRequired = require('../middleware/jwt');
const adminOnly = require('../middleware/admin');
const { getCrowdThresholds, saveCrowdThresholds } = require('../services/settings');

router.get('/settings/crowd-thresholds', tokenRequired, adminOnly, async (req, res) => {
  try { res.json(await getCrowdThresholds(getDB())); }
  catch (error) { console.error(error); res.status(500).json({ error: 'Could not load crowd thresholds' }); }
});

router.put('/settings/crowd-thresholds', tokenRequired, adminOnly, async (req, res) => {
  try { res.json(await saveCrowdThresholds(getDB(), req.body)); }
  catch (error) { res.status(400).json({ error: error.message || 'Invalid crowd thresholds' }); }
});

module.exports = router;
