const defaults = require('../seed/route_defaults.json');

function validateRoute(body = {}) {
  const { id, name, nameTH = '', color, enabled, geometry } = body;
  if (typeof id !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(id) || ['all', 'admin'].includes(id)) {
    throw new Error('Route ID must start with a lowercase letter and contain only letters, numbers, _ or - (max 40).');
  }
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof nameTH !== 'string' || nameTH.length > 100) {
    throw new Error('Route name is required (max 100 characters).');
  }
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color) || typeof enabled !== 'boolean') {
    throw new Error('A hex color and enabled status are required.');
  }
  const points = geometry?.coordinates;
  if (geometry?.type !== 'LineString' || !Array.isArray(points) || points.length < 2 || points.length > 5000 || !points.every(point =>
    Array.isArray(point) && point.length === 2 && point.every(value => typeof value === 'number' && Number.isFinite(value)) &&
    Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 85
  ) || !points.some(point => point[0] !== points[0][0] || point[1] !== points[0][1])) {
    throw new Error('Route must have 2–5000 valid [longitude, latitude] points, including two different positions (latitude -85 to 85).');
  }
  return { id, name: name.trim(), nameTH: nameTH.trim(), color, enabled, geometry: { type: 'LineString', coordinates: points } };
}

async function initializeRoutes(db) {
  const collection = db.collection('routes');
  await collection.createIndex({ id: 1 }, { unique: true });
  for (const route of defaults) {
    await collection.updateOne({ id: route.id }, { $setOnInsert: {
      ...validateRoute(route), revision: 1, createdAt: new Date(), updatedAt: new Date(),
    } }, { upsert: true });
  }
}

module.exports = { validateRoute, initializeRoutes };
