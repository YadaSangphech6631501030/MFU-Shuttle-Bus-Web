const express = require("express");
const cors = require("cors");

const { connectDB } = require("./db");
const { PORT } = require("./config");

const authRoutes = require("./routes/auth");
const stationRoutes = require("./routes/station");
const busRoutes = require("./routes/bus.routes");
const gps = require('./services/gps-runtime');
const reportRoutes = require("./routes/report.routes");
const detectorRoutes = require("./routes/detector.routes");

const app = express();

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use("/auth", authRoutes);
app.use("/station", stationRoutes);
app.use("/api", busRoutes);
app.use("/api", require('./routes/route.routes'));
app.use("/api", reportRoutes);
app.use("/api", detectorRoutes);

app.get("/", (req, res) => {
  res.send("Shuttle Bus API is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

async function start() {
  try {
    await connectDB();
    gps.start();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Server failed to start:", err);
  }
}

start();
