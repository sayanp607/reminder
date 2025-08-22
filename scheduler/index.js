require('dotenv').config();
const { Kafka } = require('kafkajs');
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const kafka = new Kafka({
  clientId: 'reminder-scheduler',
  brokers: [process.env.KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: 'scheduler-group', sessionTimeout: 60000 });
const producer = kafka.producer();

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
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
      topic: 'reminder-triggered',
      messages: [{ value: JSON.stringify(job.data) }],
    });
    console.log('Triggered reminder:', job.data);
  }, { connection: redis });
}

run().catch(console.error);
