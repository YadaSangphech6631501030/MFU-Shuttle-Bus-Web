const express = require("express");
const router = express.Router();
const gps = require('../services/gps-runtime');
const tokenRequired = require('../middleware/jwt');
const adminOnly = require('../middleware/admin');

router.get('/buses/gps-status', tokenRequired, adminOnly, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...gps.status(), realtime: gps.realtimeStatus(),
    publicDataRealtime: require('../services/public-data-runtime').realtimeStatus() });
});

// Versioned snapshot for initial loads, reconnects, and polling fallback.
router.get('/buses/snapshot', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json(await gps.snapshot());
  } catch {
    res.status(503).json({ error: 'Unable to load bus snapshot' });
  }
});

// Preserve the existing array contract for older clients.
router.get("/buses", async (req, res) => {
  try {
    const buses = await gps.buses();
    res.set('Cache-Control', 'no-store');
    res.json(buses);
  } catch (err) {
    res.status(500).json({ error: 'Unable to load bus data' });
  }
});

module.exports = router;
