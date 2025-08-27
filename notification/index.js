require('dotenv').config();
const { Kafka } = require('kafkajs');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

console.log('Starting notification service...');
const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: [process.env.KAFKA_BROKER],
  ssl: process.env.KAFKA_SSL === 'true',
  sasl: {
    mechanism: process.env.KAFKA_SASL_MECHANISM.toLowerCase(),
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  },
});


const consumer = kafka.consumer({ groupId: 'notification-group', sessionTimeout: 60000 });

// KafkaJS event constants for consumer
const { consumer: consumerEvents } = require('kafkajs').events;

consumer.on(consumerEvents.CRASH, async (event) => {
  console.error('Kafka consumer crashed:', event);
  setTimeout(() => {
    run().catch(console.error);
  }, 5000);
});

consumer.on(consumerEvents.DISCONNECT, async (event) => {
  console.warn('Kafka consumer disconnected:', event);
  setTimeout(() => {
    run().catch(console.error);
  }, 5000);
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Configure Nodemailer transporter (using Gmail as example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendSMS(reminder) {
  try {
    console.log('Sending SMS to:', reminder.phone);
    await twilioClient.messages.create({
      body: `Reminder: ${reminder.title}\n${reminder.description}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: reminder.phone // use phone from reminder event
    });
    console.log('SMS sent:', reminder.phone);
  } catch (err) {
    console.error('Failed to send SMS:', err.message);
  }
}

async function sendEmail(reminder) {
  try {
    console.log('Sending Email to:', reminder.email);
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: reminder.email, // use email from reminder event
      subject: `Reminder: ${reminder.title}`,
      text: reminder.description,
    });
    console.log('Email sent:', reminder.email);
  } catch (err) {
    console.error('Failed to send Email:', err.message);
  }
}


async function run() {
  try {
    console.log('Connecting Kafka consumer...');
    await consumer.connect();
    console.log('Kafka consumer connected.');
    await consumer.subscribe({ topic: 'reminder-triggered', fromBeginning: true });
    console.log('Subscribed to topic: reminder-triggered');
  } catch (err) {
    console.error('Error during Kafka setup:', err);
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        console.log(`Received message on topic ${topic}, partition ${partition}`);
        console.log('Raw message value:', message.value.toString());
        let reminder;
        try {
          reminder = JSON.parse(message.value.toString());
          console.log('Parsed reminder:', reminder);
        } catch (parseErr) {
          console.error('Error parsing reminder message:', parseErr);
          return;
        }
        console.log('Processing notification for reminder ID:', reminder.id);
        await sendSMS(reminder);
        await sendEmail(reminder);
        console.log('Notification processing complete for reminder ID:', reminder.id);
      } catch (err) {
        console.error('Error processing message:', err);
      }
    },
  });
}


run().catch(console.error);


// Add a health check endpoint for Render
const http = require('http');
const PORT = process.env.PORT || 6000;
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.end('Notification service running');
  }
}).listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
