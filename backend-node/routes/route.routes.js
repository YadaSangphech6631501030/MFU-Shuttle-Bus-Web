const router = require('express').Router();
const { getDB } = require('../db');
const tokenRequired = require('../middleware/jwt');
const adminOnly = require('../middleware/admin');
const { validateRoute } = require('../services/routes');

router.get('/routes', async (req, res) => {
  try {
    res.json(await getDB().collection('routes').find({ enabled: true, deletedAt: { $exists: false } }, { projection: { _id: 0 } }).sort({ id: 1 }).toArray());
  } catch { res.status(500).json({ error: 'Could not load routes' }); }
});

router.get('/routes/admin', tokenRequired, adminOnly, async (req, res) => {
  try {
    res.json(await getDB().collection('routes').find({ deletedAt: { $exists: false } }, { projection: { _id: 0 } }).sort({ id: 1 }).toArray());
  } catch { res.status(500).json({ error: 'Could not load routes' }); }
});

router.post('/routes', tokenRequired, adminOnly, async (req, res) => {
  let route;
  try { route = validateRoute(req.body); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    const document = { ...route, revision: 1, createdAt: new Date(), updatedAt: new Date() };
    // Reuse a deleted ID deliberately, retaining a monotonic revision for stale editors.
    const restored = await getDB().collection('routes').findOneAndUpdate(
      { id: route.id, deletedAt: { $exists: true } },
      { $set: { ...route, createdAt: document.createdAt, updatedAt: document.updatedAt }, $unset: { deletedAt: '' }, $inc: { revision: 1 } },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
    if (restored) return res.status(201).json(restored);
    await getDB().collection('routes').insertOne({ ...document });
    res.status(201).json(document);
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({ error: error.code === 11000 ? 'Route ID already exists' : 'Could not create route' });
  }
});

router.put('/routes/:id', tokenRequired, adminOnly, async (req, res) => {
  let route;
  try {
    route = validateRoute(req.body);
    if (route.id !== req.params.id) throw new Error('Route ID cannot be changed.');
    if (!Number.isSafeInteger(req.body.revision) || req.body.revision < 1) throw new Error('A valid revision is required.');
  } catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    const updated = await getDB().collection('routes').findOneAndUpdate(
      { id: req.params.id, revision: req.body.revision, deletedAt: { $exists: false } },
      { $set: { ...route, updatedAt: new Date() }, $inc: { revision: 1 } },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
    if (!updated) return res.status(409).json({ error: 'This route changed or no longer exists. Reload routes before saving.' });
    res.json(updated);
  } catch { res.status(500).json({ error: 'Could not save route' }); }
});

router.delete('/routes/:id', tokenRequired, adminOnly, async (req, res) => {
  const revision = req.body?.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) return res.status(400).json({ error: 'A valid revision is required.' });
  try {
    const db = getDB();
    const route = await db.collection('routes').findOne({ id: req.params.id, deletedAt: { $exists: false } });
    if (!route) return res.status(404).json({ error: 'Route not found.' });
    if (route.revision !== revision) return res.status(409).json({ error: 'This route changed. Reload routes before deleting.' });
    const busLines = [route.id];
    if (/^line[1-9]\d*$/.test(route.id)) busLines.push(route.id.slice(4));
    const [stations, buses] = await Promise.all([
      db.collection('stations').countDocuments({ lines: route.id }),
      db.collection('buses').countDocuments({ line: { $in: busLines } }),
    ]);
    if (stations || buses) return res.status(409).json({
      error: `Cannot delete: this line is assigned to ${stations} station(s) and ${buses} bus(es). Reassign them first or hide the line.`,
    });
    // Keep a tombstone so startup seeding cannot recreate a deleted default line.
    const result = await db.collection('routes').updateOne(
      { id: route.id, revision, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date(), enabled: false, updatedAt: new Date() }, $inc: { revision: 1 } },
    );
    if (!result.matchedCount) return res.status(409).json({ error: 'This route changed. Reload routes before deleting.' });
    res.json({ message: 'Route deleted', id: route.id });
  } catch { res.status(500).json({ error: 'Could not delete route' }); }
});

module.exports = router;
