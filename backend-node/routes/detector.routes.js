const express = require("express");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const router = express.Router();

const { SECRET_KEY } = require("../config");
const { getDB } = require("../db");
const tokenRequired = require("../middleware/jwt");
const adminOnly = require("../middleware/admin");
const {
  startDetector,
  stopDetector,
  getDetectorStatus,
  getFramePath,
} = require("../services/detector");

function streamTokenRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : "";
  const queryToken = String(req.query.token || "");
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: "Token missing" });
  }

  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

router.get("/detector/:stationId/status", tokenRequired, adminOnly, (req, res) => {
  res.json(getDetectorStatus(req.params.stationId));
});

router.post("/detector/:stationId/start", tokenRequired, adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const station = await db.collection("stations").findOne({ id: req.params.stationId });

    if (!station) {
      return res.status(404).json({ error: "Station not found" });
    }

    const cameraUrl = String(station.cameraUrl || "").trim();
    if (!cameraUrl) {
      return res.status(400).json({ error: "Station has no cameraUrl" });
    }

    res.json(startDetector({
      stationId: station.id,
      cameraUrl,
      detectionRoi: station.detectionRoi || [],
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Detector start failed" });
  }
});

router.post("/detector/:stationId/stop", tokenRequired, adminOnly, (req, res) => {
  res.json(stopDetector(req.params.stationId));
});

router.get("/detector/:stationId/frame", tokenRequired, adminOnly, (req, res) => {
  const framePath = getFramePath(req.params.stationId);

  if (!fs.existsSync(framePath)) {
    return res.status(404).json({ error: "Frame not ready" });
  }

  res.setHeader("Cache-Control", "no-store");
  res.sendFile(framePath);
});

router.get("/detector/:stationId/stream", streamTokenRequired, adminOnly, (req, res) => {
  const stationId = req.params.stationId;
  let closed = false;

  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-store",
    Connection: "close",
  });

  const sendFrame = () => {
    if (closed) return;

    const framePath = getFramePath(stationId);
    if (!fs.existsSync(framePath)) return;

    fs.readFile(framePath, (err, frame) => {
      if (err || closed) return;
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
      res.write(frame);
      res.write("\r\n");
    });
  };

  const timer = setInterval(sendFrame, 180);
  sendFrame();

  req.on("close", () => {
    closed = true;
    clearInterval(timer);
  });
});

module.exports = router;
