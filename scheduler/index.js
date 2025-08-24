require('dotenv').config();
const { Kafka } = require('kafkajs');
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
redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

const queue = new Queue('reminder-queue', { connection: redis });

// Test Redis connection at startup
redis.ping().then((res) => {
  console.log('Redis ping response:', res);
}).catch((err) => {
  console.error('Redis ping failed:', err);
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

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        console.log(`Received message on topic ${topic}, partition ${partition}`);
        const reminder = JSON.parse(message.value.toString());
        console.log('Parsed reminder:', reminder);
        const delay = new Date(reminder.remind_at) - Date.now();
        if (delay > 0) {
          const jobId = `reminder_${reminder.id}`;
          await queue.remove(jobId);
          await queue.add('trigger-reminder', reminder, { delay, jobId });
          console.log('Scheduled reminder:', reminder);
        } else {
          console.log('Reminder time is in the past, not scheduling:', reminder);
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    },
  });

  const worker = new Worker('reminder-queue', async job => {
    try {
      console.log('=== BullMQ Worker START ===');
      console.log('Job received:', {
        id: job.id,
        name: job.name,
        data: job.data,
        opts: job.opts,
        timestamp: new Date().toISOString()
      });
      const kafkaMessage = JSON.stringify(job.data);
      console.log('Kafka message to send:', kafkaMessage);
      const result = await producer.send({
        topic: 'reminder-triggered',
        messages: [{ value: kafkaMessage }],
      });
      console.log('Kafka send result:', result);
      console.log('=== BullMQ Worker END ===');
    } catch (err) {
      console.error('Error in BullMQ worker:', err);
    }
  }, { connection: redis });

  worker.on('completed', (job) => {
    console.log(`BullMQ job completed: ${job.id}`);
  });
  worker.on('failed', (job, err) => {
    console.error(`BullMQ job failed: ${job ? job.id : 'unknown'}, error:`, err);
  });
  worker.on('error', (err) => {
    console.error('BullMQ worker error:', err);
  });
}

run().catch(console.error);

// Add a simple HTTP server to bind to a port for Render
const http = require('http');
const PORT = process.env.PORT || 9000;
http.createServer((req, res) => {
  res.end('Scheduler service running');
}).listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
