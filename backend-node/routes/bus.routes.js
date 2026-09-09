const express = require("express");
const router = express.Router();
const gps = require('../services/gps-runtime');
const tokenRequired = require('../middleware/jwt');
const adminOnly = require('../middleware/admin');

router.get('/buses/gps-status', tokenRequired, adminOnly, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(gps.status());
});

// GET /api/buses
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
