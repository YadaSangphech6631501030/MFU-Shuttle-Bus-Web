const express = require("express");
const router = express.Router();
const { getDB } = require("../db");

// GET /api/buses
router.get("/buses", async (req, res) => {
  try {
    const db = getDB();
    const buses = await db.collection("buses").find().toArray();
    res.json(buses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;