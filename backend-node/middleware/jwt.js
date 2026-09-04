const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../config");

function tokenRequired(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ error: "Token missing" });
  }

  try {
    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, SECRET_KEY);

    // 🔥 สำคัญมาก (ของคุณขาดตรงนี้)
    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = tokenRequired;