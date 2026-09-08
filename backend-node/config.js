const path = require('node:path');
const fs = require('node:fs');
const gpsEnvPath = path.join(__dirname, '.env.gps');
if (fs.existsSync(gpsEnvPath)) process.loadEnvFile(gpsEnvPath);

function numberFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

module.exports = {
  GPS: {
    enabled: process.env.GPS_ENABLED !== 'false',
    baseUrl: process.env.GPS_BASE_URL || 'http://ww.ppgps171.com',
    username: process.env.GPS_USERNAME || '',
    password: process.env.GPS_PASSWORD || '',
    pollMs: Math.max(5000, numberFromEnv('GPS_POLL_SECONDS', 5) * 1000),
    timeoutMs: Math.max(1000, numberFromEnv('GPS_TIMEOUT_SECONDS', 15) * 1000),
    staleMs: Math.max(10000, numberFromEnv('GPS_STALE_SECONDS', 120) * 1000),
    speedUnit: process.env.GPS_SPEED_UNIT || 'unknown',
  },
  PORT: numberFromEnv("PORT", 5101),
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/",
  DB_NAME: process.env.DB_NAME || "shuttlebus_web_system",

  SECRET_KEY: process.env.SECRET_KEY || "super_secret_key_123",

  CAMERA_URL: process.env.CAMERA_URL || "http://192.168.110.234:4747/video",
  SAVE_INTERVAL: numberFromEnv("SAVE_INTERVAL", 5),
};
