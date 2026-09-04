const express = require("express");
const router = express.Router();

const { getDB } = require("../db");
const tokenRequired = require("../middleware/jwt");
const adminOnly = require("../middleware/admin");

const allowedLines = ["line1", "line2"];
const allowedStatuses = ["LOW", "MEDIUM", "HIGH"];

function firstText(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null) continue;

    const text = String(value).trim();
    if (text) return text;
  }

  return "";
}

function publicStationFrom(station) {
  const { cameraUrl, ...publicStation } = station;
  const englishName = firstText(station, [
    "name",
    "nameEN",
    "nameEn",
    "name_en",
    "englishName",
    "en",
  ]);
  const thaiName = firstText(station, [
    "nameTH",
    "nameTh",
    "name_th",
    "thaiName",
    "nameThai",
    "th",
  ]);

  return {
    ...publicStation,
    name: englishName || thaiName,
    nameTH: thaiName,
  };
}

function normalizeStationBody(body, { partial = false } = {}) {
  const station = {};

  if (!partial || body.id !== undefined) {
    station.id = String(body.id ?? "").trim();
    if (!station.id) return { error: "Station id is required" };
  }

  if (!partial || body.name !== undefined) {
    station.name = String(body.name ?? "").trim();
    if (!station.name) return { error: "Station name is required" };
  }

  if (body.nameTH !== undefined) {
    station.nameTH = String(body.nameTH ?? "").trim();
  } else if (!partial) {
    station.nameTH = "";
  }

  if (!partial || body.lat !== undefined) {
    const lat = Number(body.lat);
    if (!Number.isFinite(lat)) return { error: "Latitude is invalid" };
    station.lat = lat;
  }

  if (!partial || body.lng !== undefined) {
    const lng = Number(body.lng);
    if (!Number.isFinite(lng)) return { error: "Longitude is invalid" };
    station.lng = lng;
  }

  if (!partial || body.lines !== undefined) {
    const lines = Array.isArray(body.lines) ? body.lines : [];
    station.lines = lines.filter((line) => allowedLines.includes(line));
    if (station.lines.length === 0) {
      return { error: "Select at least one line" };
    }
  }

  if (body.waiting !== undefined) {
    const waiting = Number(body.waiting);
    if (!Number.isFinite(waiting) || waiting < 0) {
      return { error: "Waiting must be 0 or more" };
    }
    station.waiting = Math.floor(waiting);
  } else if (!partial) {
    station.waiting = 0;
  }

  if (body.status !== undefined) {
    const status = String(body.status).trim().toUpperCase();
    if (!allowedStatuses.includes(status)) {
      return { error: "Status must be LOW, MEDIUM, or HIGH" };
    }
    station.status = status;
  } else if (!partial) {
    station.status = "LOW";
  }

  if (body.cameraUrl !== undefined) {
    station.cameraUrl = String(body.cameraUrl ?? "").trim();
  } else if (!partial) {
    station.cameraUrl = "";
  }

  if (body.detectionRoi !== undefined) {
    const roi = body.detectionRoi;
    const isValidRoi = Array.isArray(roi) && roi.every((point) => (
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1])) &&
      Number(point[0]) >= 0 &&
      Number(point[0]) <= 1 &&
      Number(point[1]) >= 0 &&
      Number(point[1]) <= 1
    ));

    if (!isValidRoi && roi !== null) {
      return { error: "Detection ROI must be an array of [x, y] values from 0 to 1" };
    }

    station.detectionRoi = roi === null ? [] : roi.map((point) => [Number(point[0]), Number(point[1])]);
  } else if (!partial) {
    station.detectionRoi = [];
  }

  return { station };
}

router.get("/admin/all", tokenRequired, adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const col = db.collection("stations");
    const stations = await col.find({}).sort({ id: 1 }).toArray();

    res.json(stations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

router.post("/admin", tokenRequired, adminOnly, async (req, res) => {
  try {
    const parsed = normalizeStationBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const db = getDB();
    const col = db.collection("stations");
    const existingStation = await col.findOne({ id: parsed.station.id });

    if (existingStation) {
      return res.status(400).json({ error: "Station id already exists" });
    }

    await col.insertOne(parsed.station);

    res.status(201).json({ message: "Station created" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Station id already exists" });
    }

    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

router.put("/admin/:id", tokenRequired, adminOnly, async (req, res) => {
  try {
    const parsed = normalizeStationBody(req.body, { partial: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const db = getDB();
    const col = db.collection("stations");

    if (parsed.station.id && parsed.station.id !== req.params.id) {
      const existingStation = await col.findOne({ id: parsed.station.id });

      if (existingStation) {
        return res.status(400).json({ error: "Station id already exists" });
      }
    }

    const result = await col.updateOne(
      { id: req.params.id },
      { $set: parsed.station },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Station not found" });
    }

    res.json({ message: "Station updated" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Station id already exists" });
    }

    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

router.delete("/admin/:id", tokenRequired, adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const col = db.collection("stations");
    const result = await col.deleteOne({ id: req.params.id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Station not found" });
    }

    res.json({ message: "Station deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

router.get("/:line", async (req, res) => {
  try {
    const line = req.params.line;

    const db = getDB();
    const col = db.collection("stations");

    const data = await col.find({
      lines: line
    }).toArray();

   const updatedStations = data.map((s) => {
    const publicStation = publicStationFrom(s);
    let waiting = s.waiting ?? 0;

  let status = "LOW";
  if (waiting >= 10) status = "HIGH";
  else if (waiting >= 5) status = "MEDIUM";

  let eta = Math.floor(Math.random() * 6) + 3;

  return { ...publicStation, waiting, status, eta };
});

    res.json(updatedStations);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

module.exports = router;
