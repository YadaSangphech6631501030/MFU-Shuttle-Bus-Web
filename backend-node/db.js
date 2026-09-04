const { MongoClient } = require("mongodb");
const { MONGO_URI, DB_NAME } = require("./config");

const client = new MongoClient(MONGO_URI);

let db;

async function connectDB() {
  await client.connect();
  db = client.db(DB_NAME);
  console.log("✅ MongoDB connected");
}

function getDB() {
  return db;
}

module.exports = { connectDB, getDB };