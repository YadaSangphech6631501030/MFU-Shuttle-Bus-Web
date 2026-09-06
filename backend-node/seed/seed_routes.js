const { MongoClient } = require('mongodb');
const { MONGO_URI, DB_NAME } = require('../config');
const { initializeRoutes } = require('../services/routes');

async function seedRoutes() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    await initializeRoutes(client.db(DB_NAME));
    console.log(`Route defaults ready in ${DB_NAME}; existing routes preserved.`);
  } finally { await client.close(); }
}
seedRoutes().catch(error => { console.error(error.message); process.exitCode = 1; });
