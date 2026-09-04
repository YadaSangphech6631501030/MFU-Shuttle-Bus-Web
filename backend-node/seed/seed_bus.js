const { MongoClient } = require("mongodb");
const { MONGO_URI, DB_NAME } = require("../config");

const client = new MongoClient(MONGO_URI);

const buses = [
  { busNumber: "1", 
    line: "1", 
    currentStationIndex: 0,
     status: "STOPPED", 
    },
  { busNumber: "2", 
    line: "1", 
    currentStationIndex: 2, 
    status: "RUNNING", 
   },
  { busNumber: "3",
     line: "1", 
     currentStationIndex: 4, 
     status: "ARRIVING", 
     },

  { busNumber: "4", 
    line: "2", currentStationIndex: 1, 
    status: "RUNNING", 
   },
  { busNumber: "5",
     line: "2", 
     currentStationIndex: 3,
      status: "STOPPED", 
    },
  { busNumber: "6", 
    line: "2", 
    currentStationIndex: 5,
    status: "ARRIVING",
    }
];

const seedBus = async () => {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db(DB_NAME);
    const collection = db.collection("buses"); 

    // delete existing data
    await collection.deleteMany({});

    // add new data
    await collection.insertMany(buses);

    console.log("✅ Insert Seed Bus Data successful");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
  }
};

seedBus();
