import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db.js';

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

const STUDENTS = {
  lielle: { name: 'Lielle', grade: '6th grade (age 11)' },
  agam:   { name: 'Agam',   grade: '4th grade (age 9-10)' },
};

const SUBJECTS = ['math', 'english', 'hebrew', 'bible', 'history', 'geography', 'science', 'other'];

function requireParentPin(req, res, next) {
  const pin = req.headers['x-parent-pin'];
  if (!process.env.PARENT_PIN || pin !== process.env.PARENT_PIN) {
    return res.status(401).json({ error: 'Invalid parent PIN.' });
  }
  next();
}
router.use(requireParentPin);

// POST /api/parent/auth — validate parent PIN (middleware does the work)
router.post('/auth', (req, res) => res.json({ ok: true }));

// GET /api/parent/students — each student with their active page summary
router.get('/students', async (req, res) => {
  try {
    const students = await Promise.all(Object.entries(STUDENTS).map(async ([id, info]) => {
      const { rows } = await pool.query(`
        SELECT wp.id, wp.title, wp.subject, wp.mode,
               COUNT(e.id) AS total,
               COUNT(e.id) FILTER (WHERE e.status IN ('solved','skipped')) AS done
        FROM work_pages wp
        JOIN exercises e ON e.page_id = wp.id
        WHERE wp.student_id = $1 AND wp.status = 'active'
        GROUP BY wp.id ORDER BY wp.created_at ASC LIMIT 1
      `, [id]);
      return { id, name: info.name, activePage: rows[0] || null };
    }));
    res.json({ students });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load students.' });
  }
});

// GET /api/parent/pages/:studentId — all pages for a student
router.get('/pages/:studentId', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wp.*,
             COUNT(e.id) AS total,
             COUNT(e.id) FILTER (WHERE e.status IN ('solved','skipped')) AS done,
             json_agg(e ORDER BY e.order_index) FILTER (WHERE e.id IS NOT NULL) AS exercises
      FROM work_pages wp
      LEFT JOIN exercises e ON e.page_id = wp.id
      WHERE wp.student_id = $1
      GROUP BY wp.id
      ORDER BY (wp.status = 'active') DESC, wp.created_at DESC
    `, [req.params.studentId]);
    res.json({ pages: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pages.' });
  }
});

// POST /api/parent/chat — planning conversation with Claude
router.post('/chat', async (req, res) => {
  const { studentId, subject, messages } = req.body;
  const student = STUDENTS[studentId];
  if (!student) return res.status(400).json({ error: 'Invalid student.' });

  const subjectLabel = subject || 'general';
  const system = `You are a teaching assistant helping Amir plan a ${subjectLabel} work page for his daughter ${student.name} (${student.grade}). ${student.name} is a girl.
This page is for ${subjectLabel} ONLY — all exercises must be ${subjectLabel} exercises. Do not mix in other subjects.
Help him design clear, practical exercises. Ask about number of exercises, difficulty level, and specific topics if not specified.
Once you have enough information, propose a concrete numbered list of exercises so Amir can review and lock them in.
Be concise. Respond in whatever language Amir uses (Hebrew or English).`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: messages.slice(-20),
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    res.json({ message: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get response.' });
  }
});

// POST /api/parent/pages/lock — extract structured exercises from chat history and save as active page
router.post('/pages/lock', async (req, res) => {
  const { studentId, subject, messages, mode, dueDate } = req.body;
  const student = STUDENTS[studentId];
  if (!student) return res.status(400).json({ error: 'Invalid student.' });
  const lockedSubject = (subject && SUBJECTS.includes(subject)) ? subject : 'other';

  try {
    const result = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: `You are extracting structured exercise data from a planning conversation. The conversation may be in Hebrew or English. All exercises are for the subject: ${lockedSubject}. Your job is to identify every exercise that was discussed and agreed upon, and save them using the save_work_page tool. Write each exercise description clearly so the student can understand what to do — in the same language used in the conversation.`,
      tools: [{
        name: 'save_work_page',
        description: 'Extract and save the agreed work page and exercises from the conversation',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short descriptive title for this work page' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string', description: 'The exercise as the student will see it' },
                  difficulty:  { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
                required: ['description', 'difficulty'],
              },
            },
          },
          required: ['title', 'exercises'],
        },
      }],
      tool_choice: { type: 'tool', name: 'save_work_page' },
      messages: [
        ...messages.slice(-20),
        { role: 'user', content: 'Extract ALL the exercises from this conversation and call save_work_page. Include every exercise that was discussed — do not skip any. Write each description clearly.' },
      ],
    });

    const data = result.content[0].input;
    if (!data.exercises?.length) return res.status(400).json({ error: 'No exercises found in conversation.' });

    const { rows: [page] } = await pool.query(
      `INSERT INTO work_pages (student_id, title, subject, mode, status, locked_at, due_date)
       VALUES ($1, $2, $3, $4, 'active', NOW(), $5) RETURNING *`,
      [studentId, data.title, lockedSubject, mode || 'flexible', dueDate || null]
    );

    for (let i = 0; i < data.exercises.length; i++) {
      const ex = data.exercises[i];
      await pool.query(
        `INSERT INTO exercises (page_id, order_index, description, subject, difficulty)
         VALUES ($1, $2, $3, $4, $5)`,
        [page.id, i, ex.description, data.subject, ex.difficulty]
      );
    }

    res.json({ page: { ...page, exerciseCount: data.exercises.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to lock page.' });
  }
});

// POST /api/parent/pages/:id/unlock — revert active page to draft
router.post('/pages/:id/unlock', async (req, res) => {
  try {
    await pool.query(
      `UPDATE work_pages SET status = 'draft', locked_at = NULL WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlock page.' });
  }
});

export default router;
