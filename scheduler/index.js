require('dotenv').config();
const { Kafka } = require('kafkajs');
const connectDB = require('./db');
// ...existing code...

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



// ...existing code...

async function pollDueReminders() {
  try {
    const now = new Date();
    console.log(`[POLL] Checking for due reminders at ${now.toISOString()}`);
    const db = await connectDB();
    // Find reminders that are due and not triggered
    const dueReminders = await db.collection('reminders').find({
      remind_at: { $lte: now },
      $or: [ { triggered: false }, { triggered: { $exists: false } } ]
    }).toArray();
    console.log(`[POLL] Found ${dueReminders.length} due reminders.`);
    for (const reminder of dueReminders) {
      try {
        // Fetch user contact info
        const user = await db.collection('users').findOne({ _id: reminder.user_id });
        const reminderWithContact = {
          ...reminder,
          _id: reminder._id.toString(),
          user_id: reminder.user_id?.toString?.() || reminder.user_id,
          email: user?.email,
          phone: user?.phone
        };
        console.log(`[POLL] Attempting to send reminder ID ${reminder._id} to Kafka with contact info.`);
        await producer.send({
          topic: 'reminder-triggered',
          messages: [{ value: JSON.stringify(reminderWithContact) }],
        });
        console.log(`[POLL] Successfully sent reminder ID ${reminder._id} to Kafka.`);
        await db.collection('reminders').updateOne(
          { _id: reminder._id },
          { $set: { triggered: true } }
        );
        console.log(`[POLL] Marked reminder ID ${reminder._id} as triggered.`);
      } catch (reminderErr) {
        console.error(`[POLL] Error processing reminder ID ${reminder._id}:`, reminderErr);
      }
    }
  } catch (err) {
    console.error('[POLL] Error polling due reminders:', err);
  }
}


// ...existing code...

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
