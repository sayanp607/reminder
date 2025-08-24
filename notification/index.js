require('dotenv').config();
const { Kafka } = require('kafkajs');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

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
    await twilioClient.messages.create({
      body: `Reminder: ${reminder.title}\n${reminder.description}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: reminder.phone // use phone from reminder event
    });
    console.log('SMS sent:', reminder);
  } catch (err) {
    console.error('Failed to send SMS:', err.message);
  }
}

async function sendEmail(reminder) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: reminder.email, // use email from reminder event
      subject: `Reminder: ${reminder.title}`,
      text: reminder.description,
    });
    console.log('Email sent:', reminder);
  } catch (err) {
    console.error('Failed to send Email:', err.message);
  }
}

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'reminder-triggered', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const reminder = JSON.parse(message.value.toString());
      await sendSMS(reminder);
      await sendEmail(reminder);
    },
  });
}

run().catch(console.error);

// Add a simple HTTP server to bind to a port for Render
const http = require('http');
const PORT = process.env.PORT || 6000;
http.createServer((req, res) => {
  res.end('Notification service running');
}).listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
