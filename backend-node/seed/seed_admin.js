const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");
const { MONGO_URI, DB_NAME } = require("../config");

const username = process.env.ADMIN_USERNAME || "admin";
const email = process.env.ADMIN_EMAIL || "admin@mfu.ac.th";
const password = process.env.ADMIN_PASSWORD || "12345678";

async function seedAdmin() {
  if (password.length < 6) {
    throw new Error("ADMIN_PASSWORD must contain at least 6 characters");
  }

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const users = client.db(DB_NAME).collection("users");
    const passwordHash = await bcrypt.hash(password, 10);

    await users.updateOne(
      { username },
      {
        $set: {
          username,
          email,
          password: passwordHash,
          role: "admin",
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    console.log(`Admin seed completed for "${username}" in ${DB_NAME}`);
  } finally {
    await client.close();
  }
}

seedAdmin().catch((error) => {
  console.error("Admin seed failed:", error.message);
  process.exitCode = 1;
});
