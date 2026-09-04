const { getDB } = require("../db");

const totalStations = 16;

const updateBus = (bus) => {
  if (bus.status === "STOPPED") {
    bus.status = "RUNNING";
  } else if (bus.status === "RUNNING") {
    bus.status = "ARRIVING";
  } else {
    bus.status = "STOPPED";
    bus.currentStationIndex =
      (bus.currentStationIndex + 1) % totalStations;
  }
};

const startEngine = () => {
  setInterval(async () => {
    const db = getDB();

    // ✅ กัน db ยังไม่พร้อม
    if (!db) {
      console.log("⏳ Waiting for DB...");
      return;
    }

    try {
      const buses = await db.collection("buses").find().toArray();

      for (let bus of buses) {
        updateBus(bus);

        await db.collection("buses").updateOne(
          { _id: bus._id },
          { $set: bus }
        );
      }

      console.log("🚌 buses updated");
    } catch (err) {
      console.error("❌ Engine error:", err.message);
    }
  }, 5000);
};

module.exports = startEngine;