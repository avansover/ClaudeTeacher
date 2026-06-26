import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STUDENTS = {
  lielle: { name: 'Lielle', promptFile: 'core_lielle.txt' },
  agam:   { name: 'Agam',   promptFile: 'core_agam.txt' },
};

function promptPath(file) {
  return path.join(__dirname, '..', 'prompts', file);
}

function buildSystemPrompt(promptFile, profile) {
  const core = fs.readFileSync(promptPath(promptFile), 'utf-8')
    .replace('{{STUDENT_NAME}}', profile.name);

  const profileSection = `
STUDENT PROFILE (you may update this as you learn more about the student):
- Name: ${profile.name}
- Subjects she struggles with: ${profile.subjects_struggling?.length ? profile.subjects_struggling.join(', ') : 'none noted yet'}
- Learning style observations: ${profile.learning_style || 'none noted yet'}
- Progress notes: ${profile.progress_notes?.length ? profile.progress_notes.join(' | ') : 'none yet'}

If you learn something new about the student during this session that would be useful to remember, include a JSON block at the very end of your response in this exact format (invisible to the student):
<profile_update>
{"subjects_struggling": [...], "learning_style": "...", "progress_notes": [...]}
</profile_update>
Only include fields you want to update. Omit fields you're not changing.`;

  return core + '\n\n' + profileSection;
}

function extractProfileUpdate(text) {
  const match = text.match(/<profile_update>([\s\S]*?)<\/profile_update>/);
  if (!match) return { cleanText: text, update: null };

  try {
    const update = JSON.parse(match[1].trim());
    const cleanText = text.replace(/<profile_update>[\s\S]*?<\/profile_update>/, '').trim();
    return { cleanText, update };
  } catch {
    return { cleanText: text, update: null };
  }
}

// POST /api/chat
// Body: { studentId, sessionId, messages, files? }
router.post('/', async (req, res) => {
  const { studentId, sessionId, messages, files } = req.body;

  const student = STUDENTS[studentId];
  if (!student) return res.status(400).json({ error: 'Invalid student.' });
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId.' });

  try {
    // Load profile from DB
    const { rows } = await pool.query('SELECT profile FROM students WHERE id = $1', [studentId]);
    if (!rows.length) return res.status(404).json({ error: 'Student not found.' });
    const profile = rows[0].profile;

    const systemPrompt = buildSystemPrompt(student.promptFile, profile);

    // On the first message of a new session, prepend the last 2 sessions for continuity
    let priorMessages = [];
    if (messages.length === 1) {
      const { rows: prior } = await pool.query(
        `SELECT m.role, m.content
         FROM messages m
         WHERE m.session_id IN (
           SELECT id FROM sessions
           WHERE student_id = $1 AND id != $2
           ORDER BY started_at DESC
           LIMIT 2
         )
         ORDER BY m.created_at ASC
         LIMIT 20`,
        [studentId, sessionId]
      );
      priorMessages = prior.map(r => ({ role: r.role, content: r.content }));
    }

    let anthropicMessages = [...priorMessages, ...messages].slice(-20);
    if (files && files.length > 0) {
      const lastMsg = anthropicMessages[anthropicMessages.length - 1];
      const contentParts = [];

      for (const file of files) {
        if (file.type === 'image') {
          contentParts.push({
            type: 'image',
            source: { type: 'base64', media_type: file.mediaType, data: file.data },
          });
        } else if (file.type === 'pdf') {
          contentParts.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: file.data },
          });
        }
      }

      if (lastMsg.content) contentParts.push({ type: 'text', text: lastMsg.content });
      anthropicMessages[anthropicMessages.length - 1] = { role: 'user', content: contentParts };
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const rawText = response.content[0].text;
    const { cleanText, update } = extractProfileUpdate(rawText);

    // Persist profile update if Claude noticed something new
    if (update) {
      const updatedProfile = { ...profile, ...update };
      await pool.query(
        'UPDATE students SET profile = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updatedProfile), studentId]
      );
    }

    // Ensure session row exists (created on first message)
    await pool.query(
      'INSERT INTO sessions (id, student_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [sessionId, studentId]
    );

    // Save the user message and assistant response
    const userMessage = messages[messages.length - 1];
    await pool.query(
      'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3), ($1, $4, $5)',
      [sessionId, 'user', userMessage.content, 'assistant', cleanText]
    );

    res.json({ message: cleanText });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
