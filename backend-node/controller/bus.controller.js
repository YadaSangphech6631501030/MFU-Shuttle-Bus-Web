const Bus = require("../models/bus.model");

// GET /buses
exports.getBuses = async (req, res) => {
  const buses = await Bus.find();
  res.json(buses);
};