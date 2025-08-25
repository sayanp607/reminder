const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;
const cors = require('cors');


app.use(express.json());

app.get('/', (req, res) => {
  res.send('Reminder backend is running!');
});

app.use(cors({
  origin: [
    'https://reminder-ui-zts6.vercel.app', // Vercel frontend
    'http://localhost:3000',
    'http://192.168.43.1:3000',
    '*'
  ],
  credentials: true
}));

const remindersRouter = require('./routes/reminders');
app.use('/reminders', remindersRouter);

const authRouter = require('./routes/auth');
app.use('/auth', authRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT} and accessible on your network.`);
});