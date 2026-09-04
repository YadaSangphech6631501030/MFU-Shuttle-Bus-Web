#!/usr/bin/env bash
set -e

DB_NAME="${MONGO_INITDB_DATABASE:-shuttlebus_system}"
BACKUP_DIR="/docker-entrypoint-initdb.d/backup"

echo "Importing MFU Shuttle Bus backup data into ${DB_NAME}"

import_collection() {
  collection="$1"
  file="${BACKUP_DIR}/shuttlebus_system.${collection}.json"

  if [ ! -f "$file" ]; then
    echo "Skipping ${collection}: ${file} not found"
    return
  fi

  if [ "$(tr -d '[:space:]' < "$file")" = "[]" ]; then
    echo "Skipping ${collection}: ${file} is empty"
    return
  fi

  echo "Importing ${collection} from ${file}"
  mongoimport \
    --db "$DB_NAME" \
    --collection "$collection" \
    --file "$file" \
    --jsonArray \
    --drop
}

import_collection buses
import_collection reports
import_collection stations
import_collection users

mongosh "$DB_NAME" --quiet <<'MONGO_EOF'
db.stations.createIndex({ id: 1 }, { unique: true });
db.stations.createIndex({ lines: 1 });
db.buses.createIndex({ busNumber: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 });

db.users.updateOne(
  { username: "admin" },
  {
    $set: {
      username: "admin",
      email: "admin@mfu.ac.th",
      password: "$2b$10$RwFtHtc8T6xpyGm5CWOrhe3KZQtwO1fCmISA2VUQDmric01dncftm",
      role: "admin",
      createdAt: new Date()
    }
  },
  { upsert: true }
);
MONGO_EOF

echo "MFU Shuttle Bus backup import completed"
