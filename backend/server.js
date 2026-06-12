import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import chatRouter from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '20mb' }));

// PIN validation — all /api routes require the correct PIN
app.use('/api', (req, res, next) => {
  const pin = req.headers['x-app-pin'];
  if (!process.env.APP_PIN || pin === process.env.APP_PIN) {
    return next();
  }
  res.status(401).json({ error: 'Invalid PIN.' });
});

app.use('/api/chat', chatRouter);

// Serve built React frontend in production
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ClaudeTeacher running on http://localhost:${PORT}`);
});
