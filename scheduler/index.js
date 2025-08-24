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

const queue = new Queue('reminder-queue', { connection: redis });

async function run() {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: 'reminder-created', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const reminder = JSON.parse(message.value.toString());
      const delay = new Date(reminder.remind_at) - Date.now();
      if (delay > 0) {
        // Use a string prefix for jobId to avoid BullMQ integer ID error
        const jobId = `reminder_${reminder.id}`;
        await queue.remove(jobId);
        await queue.add('trigger-reminder', reminder, { delay, jobId });
        console.log('Scheduled reminder:', reminder);
      }
    },
  });

  new Worker('reminder-queue', async job => {
    await producer.send({
      topic: 'reminder-created',
      messages: [{ value: JSON.stringify(job.data) }],
    });
    console.log('Triggered reminder:', job.data);
  }, { connection: redis });
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
