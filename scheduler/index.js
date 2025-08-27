require('dotenv').config();
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const kafka = new Kafka({
  clientId: 'reminder-scheduler',
  brokers: [process.env.KAFKA_BROKER],
  ssl: process.env.KAFKA_SSL === 'true',
  sasl: {
    mechanism: process.env.KAFKA_SASL_MECHANISM.toLowerCase(),
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  },
});

const consumer = kafka.consumer({ groupId: 'scheduler-group', sessionTimeout: 60000 });
const producer = kafka.producer();

// Setup Postgres connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

console.log('Attempting to connect to Redis...');
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: {}, // Upstash requires TLS
  maxRetriesPerRequest: null
});

redis.on('connect', () => {
  console.log('Redis connection established.');
});
redis.on('ready', () => {
  console.log('Redis connection ready.');
});
redis.on('close', () => {
  console.log('Redis connection closed.');
});
redis.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});
redis.on('end', () => {
  console.log('Redis connection ended.');
});
redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

console.log('Creating BullMQ queue...');
const queue = new Queue('reminder-queue', { connection: redis });
console.log('BullMQ queue created.');

// Test Redis connection at startup
redis.ping().then((res) => {
  console.log('Redis ping response:', res);
}).catch((err) => {
  console.error('Redis ping failed:', err);
});

async function pollDueReminders() {
  try {
    const now = new Date().toISOString();
    console.log(`[POLL] Checking for due reminders at ${now}`);
    // Query reminders that are due and not triggered
    const result = await pool.query(
      `SELECT * FROM reminders WHERE remind_at <= $1 AND (triggered IS NULL OR triggered = false)`,
      [now]
    );
    console.log(`[POLL] Found ${result.rows.length} due reminders.`);
    for (const reminder of result.rows) {
      try {
        // Fetch user contact info
        const userResult = await pool.query(
          'SELECT email, phone FROM users WHERE id = $1',
          [reminder.user_id]
        );
        const user = userResult.rows[0] || {};
        const reminderWithContact = {
          ...reminder,
          email: user.email,
          phone: user.phone
        };
        console.log(`[POLL] Attempting to send reminder ID ${reminder.id} to Kafka with contact info.`);
        await producer.send({
          topic: 'reminder-triggered',
          messages: [{ value: JSON.stringify(reminderWithContact) }],
        });
        console.log(`[POLL] Successfully sent reminder ID ${reminder.id} to Kafka.`);
        await pool.query(
          `UPDATE reminders SET triggered = true WHERE id = $1`,
          [reminder.id]
        );
        console.log(`[POLL] Marked reminder ID ${reminder.id} as triggered.`);
      } catch (reminderErr) {
        console.error(`[POLL] Error processing reminder ID ${reminder.id}:`, reminderErr);
      }
    }
  } catch (err) {
    console.error('[POLL] Error polling due reminders:', err);
  }
}

// Add auto-reconnect and crash handling for Kafka consumer
consumer.on('crash', async (event) => {
  console.error('Kafka consumer crashed:', event);
  setTimeout(() => {
    run().catch(console.error);
  }, 5000);
});

consumer.on('disconnect', async (event) => {
  console.warn('Kafka consumer disconnected:', event);
  setTimeout(() => {
    run().catch(console.error);
  }, 5000);
});

async function run() {
  try {
    console.log('Connecting Kafka consumer...');
    await consumer.connect();
    console.log('Kafka consumer connected.');
    await producer.connect();
    console.log('Kafka producer connected.');
    await consumer.subscribe({ topic: 'reminder-created', fromBeginning: true });
    console.log('Subscribed to topic: reminder-created');
  } catch (err) {
    console.error('Error during Kafka setup:', err);
  }

  // Remove BullMQ logic, only use polling


  // Start polling loop
  setInterval(pollDueReminders, 60 * 1000); // every minute
  console.log('Started periodic polling for due reminders.');
}

run().catch(console.error);


// Add a health check endpoint for Render
const http = require('http');
const PORT = process.env.PORT || 9000;
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.end('Scheduler service running');
  }
}).listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
