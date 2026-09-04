function getStatus(count) {
  if (count <= 5) return "LOW";
  else if (count <= 10) return "MEDIUM";
  else return "HIGH";
}

module.exports = { getStatus };