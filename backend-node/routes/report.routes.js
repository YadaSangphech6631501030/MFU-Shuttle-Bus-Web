const express = require("express");
const router = express.Router();
const { getDB } = require("../db");
const { ObjectId } = require("mongodb");

// =========================
// 📤 CREATE REPORT
// =========================
router.post("/report", async (req, res) => {
  try {
    const db = getDB();

    const { type, detail, location, feedbackRatings } = req.body;
    const normalizedType = String(type || "").trim();
    const sanitizedFeedbackRatings = sanitizeFeedbackRatings(feedbackRatings);
    const isFeedback = normalizedType.toLowerCase() === "feedback";

    const newReport = {
      type: normalizedType,
      detail,
      location,
      reporterType: "guest",
      time: new Date(),
    };

    if (!isFeedback) {
      newReport.status = "pending";
    }

    if (isFeedback && sanitizedFeedbackRatings.length) {
      newReport.feedbackRatings = sanitizedFeedbackRatings;
      newReport.feedbackAverage = averageFeedbackScore(sanitizedFeedbackRatings);
    }

    await db.collection("reports").insertOne(newReport);

    res.status(201).json(newReport);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sanitizeFeedbackRatings(feedbackRatings) {
  if (!feedbackRatings || typeof feedbackRatings !== "object" || Array.isArray(feedbackRatings)) {
    return [];
  }

  return Object.entries(feedbackRatings)
    .map(([key, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;

      const score = Number(value.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) return null;

      return {
        key,
        label: String(value.label || key).trim(),
        score,
        description: String(value.description || "").trim(),
      };
    })
    .filter(Boolean);
}

function averageFeedbackScore(feedbackRatings) {
  if (!feedbackRatings.length) return null;

  const sum = feedbackRatings.reduce((total, item) => total + item.score, 0);
  return Math.round((sum / feedbackRatings.length) * 10) / 10;
}

// =========================
// 📥 GET ALL REPORTS
// =========================
router.get("/report", async (req, res) => {
  try {
    const db = getDB();

    const reports = await db
      .collection("reports")
      .find({}, {
        projection: {
          UserId: 0,
          userId: 0,
          user: 0,
          username: 0,
        },
      })
      .sort({ time: -1 })
      .toArray();

    res.json(reports);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// ✏️ UPDATE REPORT STATUS
// =========================
router.put("/report/:id", async (req, res) => {
  try {
    const db = getDB();

    const id = req.params.id;
    const { status } = req.body;

    console.log("🔥 ID:", id);
    console.log("🔥 STATUS:", status);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const result = await db.collection("reports").updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    console.log("🔥 RESULT:", result);

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json({ message: "updated" });

  } catch (err) {
    console.log("❌ ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// =========================
// 🗑️ DELETE REPORT
// =========================
router.delete("/report/:id", async (req, res) => {
  try {
    const db = getDB();

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const result = await db.collection("reports").deleteOne(
      { _id: new ObjectId(id) }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json({ message: "deleted" });

  } catch (err) {
    console.log("❌ DELETE REPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
