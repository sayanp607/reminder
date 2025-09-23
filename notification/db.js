// MongoDB connection utility for notification service
const { MongoClient } = require('mongodb');
require('dotenv').config();

const client = new MongoClient(process.env.MONGODB_URI, { useUnifiedTopology: true });

async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) await client.connect();
  return client.db();
}

module.exports = connectDB;
