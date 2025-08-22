const { Kafka } = require('kafkajs');
require('dotenv').config();

const kafka = new Kafka({
  clientId: 'reminder-backend',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();

module.exports = producer;
