const express = require('express');
const pool = require('../db');
const producer = require('../kafka');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Create a reminder (requires JWT)
router.post('/', authenticateToken, async (req, res) => {
  const { title, description, remind_at } = req.body;
  const userId = req.user.userId;
  try {
    // Get user info
    const userResult = await pool.query('SELECT email, phone FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    const result = await pool.query(
      'INSERT INTO reminders (title, description, remind_at, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, remind_at, userId]
    );

    // Add user contact info to reminder object
    const reminderWithContact = {
      ...result.rows[0],
      email: user.email,
      phone: user.phone
    };

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
    const result = await pool.query(
      'SELECT * FROM reminders WHERE user_id = $1 ORDER BY remind_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a reminder (requires JWT)
router.delete('/:id', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const reminderId = req.params.id;
  try {
    const result = await pool.query(
      'DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING *',
      [reminderId, userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reminder not found or not authorized' });
    }
    res.json({ message: 'Reminder deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
