// MongoDB connection utility for scheduler/notification services
const { MongoClient } = require('mongodb');
require('dotenv').config();

const client = new MongoClient(process.env.DATABASE_URL, { useUnifiedTopology: true });

async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) await client.connect();
  return client.db();
}

module.exports = connectDB;
