const { Kafka } = require('kafkajs');
require('dotenv').config();

const kafka = new Kafka({
  clientId: 'reminder-backend',
  brokers: [process.env.KAFKA_BROKER],
  ssl: process.env.KAFKA_SSL === 'true',
  sasl: {
    mechanism: process.env.KAFKA_SASL_MECHANISM.toLowerCase(), // 'scram-sha-256'
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  },
});

const producer = kafka.producer();

module.exports = producer;
