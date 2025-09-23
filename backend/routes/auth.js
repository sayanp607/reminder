const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connectDB = require('../db');
const { ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const JWT_EXPIRES_IN = '30d'; // 30 days

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Signup route
router.post('/signup', async (req, res) => {
  const { name, email, phone, password } = req.body;
  try {
    const db = await connectDB();
    const existing = await db.collection('users').findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({ error: 'Email or phone already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userDoc = { name, email, phone, password_hash: hashedPassword };
    const result = await db.collection('users').insertOne(userDoc);
    res.status(201).json({ _id: result.insertedId, name, email, phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const db = await connectDB();
    const user = await db.collection('users').findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: { _id: user._id, name: user.name, email: user.email, phone: user.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forgot password route
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const db = await connectDB();
    const user = await db.collection('users').findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate a reset token (JWT, short expiry)
    const resetToken = jwt.sign(
      { userId: user._id.toString() },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Save token to DB (optional, for single-use)
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { reset_token: resetToken } }
    );

    // Send email with reset link
    const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Request',
      text: `Click the link to reset your password: ${resetLink}`,
    });

    res.json({ message: 'Password reset link sent to email' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset password route
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    // Verify token
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload.userId;

    const db = await connectDB();
    // Check token matches DB (optional, for single-use)
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user || user.reset_token !== token) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Update password and clear reset token
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { password_hash: hashedPassword }, $unset: { reset_token: '' } }
    );

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
