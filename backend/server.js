import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import chatRouter from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '20mb' })); // large enough for base64 images/PDFs

app.use('/api/chat', chatRouter);

app.listen(PORT, () => {
  console.log(`ClaudeTeacher backend running on http://localhost:${PORT}`);
  console.log(`Student: ${process.env.STUDENT_NAME || 'Not set — check .env'}`);
});
