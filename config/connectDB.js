const { MongoClient } = require("mongodb");
require("dotenv").config();

let client;
let db;

const connectToDatabase = async () => {
  if (!client || !client.isConnected()) {
    client = new MongoClient(process.env.MONGO_URI);

    try {
      await client.connect();
      db = client.db("anon");
    } catch (error) {
      console.error("Failed to connect to MongoDB", error);
      throw error;
    }
  }
  return db;
};

const roomModel = async () => {
  const database = await connectToDatabase();
  return database.collection("rooms");
};

const nameModel = async () => {
  const database = await connectToDatabase();
  return database.collection("fruit");
};

module.exports = { roomModel, nameModel };
