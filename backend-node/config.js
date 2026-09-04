function numberFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

module.exports = {
  PORT: numberFromEnv("PORT", 5001),
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/",
  DB_NAME: process.env.DB_NAME || "shuttlebus_system",

  SECRET_KEY: process.env.SECRET_KEY || "super_secret_key_123",

  CAMERA_URL: process.env.CAMERA_URL || "http://192.168.110.234:4747/video",
  SAVE_INTERVAL: numberFromEnv("SAVE_INTERVAL", 5),
};
