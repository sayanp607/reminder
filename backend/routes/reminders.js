const express = require('express');
const connectDB = require('../db');
const producer = require('../kafka');
const authenticateToken = require('../middleware/auth');
const { ObjectId } = require('mongodb');
const router = express.Router();

// Create a reminder (requires JWT)
router.post('/', authenticateToken, async (req, res) => {
  const { title, description, remind_at } = req.body;
  const userId = req.user.userId;
  try {
    const db = await connectDB();
    // Get user info
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const reminderDoc = {
      title,
      description,
      remind_at: new Date(remind_at),
      user_id: new ObjectId(userId),
      triggered: false,
      created_at: new Date(),
      email: user.email,
      phone: user.phone
    };
    const result = await db.collection('reminders').insertOne(reminderDoc);
    const reminderWithContact = { ...reminderDoc, _id: result.insertedId };

    // Publish event to Kafka
    await producer.connect();
    await producer.send({
      topic: 'reminder-created',
      messages: [
        { value: JSON.stringify(reminderWithContact) }
      ],
    });
    await producer.disconnect();
    res.status(201).json(reminderWithContact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all reminders for the logged-in user (requires JWT)
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    const db = await connectDB();
    const reminders = await db.collection('reminders')
      .find({ user_id: new ObjectId(userId) })
      .sort({ remind_at: -1 })
      .toArray();
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a reminder (requires JWT)
router.delete('/:id', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const reminderId = req.params.id;
  try {
    const db = await connectDB();
    const result = await db.collection('reminders').deleteOne({
      _id: new ObjectId(reminderId),
      user_id: new ObjectId(userId)
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Reminder not found or not authorized' });
    }
    res.json({ message: 'Reminder deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
