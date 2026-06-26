import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

const STUDENTS = {
  lielle: { name: 'Lielle', promptFile: 'core_lielle.txt' },
  agam:   { name: 'Agam',   promptFile: 'core_agam.txt' },
};

const SAVE_DOCUMENT_TOOL = {
  name: 'save_document',
  description: 'Save a record of an educational document you just analyzed from an uploaded image. Only call this if the image contains educational content worth saving (test, worksheet, exercise page, textbook page). Do NOT call this for non-educational images.',
  input_schema: {
    type: 'object',
    properties: {
      is_educational: {
        type: 'boolean',
        description: 'True if this image contains educational content worth saving. False for non-educational images.',
      },
      type: { type: 'string', enum: ['test', 'exercise_page', 'textbook_page', 'worksheet', 'other'] },
      subject: { type: 'string', enum: ['math', 'english', 'hebrew', 'bible', 'history', 'geography', 'science', 'other'] },
      description: { type: 'string', description: '2-4 sentence summary of what you saw in the document' },
      content: {
        type: 'string',
        description: 'Full reading of the document. For tests/exercises: transcribe each question with the student\'s answer and annotate inline with [correct], [wrong], or [skipped]. Example: "4. 3×5+4×5+2= student answered 37 [wrong]". For study pages: transcribe the main content. Omit if the image is too blurry to read reliably.',
      },
      score: { type: 'string', description: 'Score or grade as written on the paper (e.g. "77%", "18/20"). Omit if not visible.' },
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic:       { type: 'string', description: 'Specific topic covered (e.g. "long multiplication", "fractions")' },
            performance: { type: 'string', enum: ['strong', 'needs_practice', 'struggling', 'not_assessed'] },
            notes:       { type: 'string', description: 'Brief observation about this topic' },
          },
          required: ['topic', 'performance'],
        },
      },
    },
    required: ['is_educational'],
  },
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

// Build proactive context for session start — returns text to append to system prompt
// and the IDs of any unreviewed documents that should be marked reviewed after this response
async function buildProactiveContext(studentId) {
  // Step 1: unreviewed documents
  const { rows: unreviewed } = await pool.query(
    `SELECT d.id, d.type, d.subject, d.score, d.uploaded_at,
            json_agg(json_build_object('topic', ds.topic, 'performance', ds.performance)) AS topics
     FROM documents d
     LEFT JOIN document_subjects ds ON ds.document_id = d.id
     WHERE d.student_id = $1 AND d.is_reviewed = false
     GROUP BY d.id ORDER BY d.uploaded_at DESC LIMIT 1`,
    [studentId]
  );

  if (unreviewed.length > 0) {
    const d = unreviewed[0];
    const days = Math.floor((Date.now() - new Date(d.uploaded_at)) / 86400000);
    const topicStr = (d.topics || [])
      .filter(t => t.topic)
      .map(t => `${t.topic} (${t.performance})`)
      .join(', ');
    return {
      context: `\n\nPROACTIVE MENTION (bring this up naturally in one sentence at the very start of your response):\nUnreviewed ${d.type} uploaded ${days} day(s) ago. Subject: ${d.subject}.${d.score ? ` Score: ${d.score}.` : ''}${topicStr ? ` Topics: ${topicStr}.` : ''}`,
      unreviewedIds: [d.id],
    };
  }

  // Steps 2-4: fallback to historical performance
  for (const perf of ['struggling', 'not_assessed', 'needs_practice']) {
    const { rows } = await pool.query(
      `SELECT ds.topic, d.subject, d.uploaded_at
       FROM document_subjects ds JOIN documents d ON d.id = ds.document_id
       WHERE d.student_id = $1 AND ds.performance = $2
       ORDER BY d.uploaded_at DESC LIMIT 1`,
      [studentId, perf]
    );
    if (rows.length > 0) {
      const r = rows[0];
      const days = Math.floor((Date.now() - new Date(r.uploaded_at)) / 86400000);
      const msg = perf === 'struggling'    ? `has been struggling with "${r.topic}" in ${r.subject}` :
                  perf === 'not_assessed'  ? `has a ${r.subject} topic "${r.topic}" that hasn't been assessed yet` :
                                             `could use more practice with "${r.topic}" in ${r.subject}`;
      return {
        context: `\n\nPROACTIVE MENTION (bring this up naturally in one sentence at the very start of your response, last seen ${days} day(s) ago):\nThe student ${msg}.`,
        unreviewedIds: [],
      };
    }
  }

  return { context: '', unreviewedIds: [] };
}

// Save a document record + its per-topic subjects to the DB
async function saveDocument(studentId, sessionId, data) {
  const { rows } = await pool.query(
    `INSERT INTO documents (student_id, session_id, type, subject, description, content, score)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [studentId, sessionId, data.type, data.subject, data.description || '', data.content || null, data.score || null]
  );
  const docId = rows[0].id;
  for (const t of data.topics || []) {
    await pool.query(
      `INSERT INTO document_subjects (document_id, topic, performance, notes) VALUES ($1, $2, $3, $4)`,
      [docId, t.topic, t.performance, t.notes || null]
    );
  }
  console.log(`Document saved: id=${docId} student=${studentId} type=${data.type} subject=${data.subject}`);
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

    const isFirstMessage = messages.length === 1;

    // On session start: load prior sessions + build proactive context
    let priorMessages = [];
    let proactiveContext = '';
    let unreviewedIds = [];

    if (isFirstMessage) {
      const { rows: prior } = await pool.query(
        `SELECT m.role, m.content
         FROM messages m
         WHERE m.session_id IN (
           SELECT id FROM sessions
           WHERE student_id = $1 AND id != $2
           ORDER BY started_at DESC LIMIT 2
         )
         ORDER BY m.created_at ASC LIMIT 20`,
        [studentId, sessionId]
      );
      priorMessages = prior.map(r => ({ role: r.role, content: r.content }));

      const proactive = await buildProactiveContext(studentId);
      proactiveContext = proactive.context;
      unreviewedIds = proactive.unreviewedIds;
    }

    const systemPrompt = buildSystemPrompt(student.promptFile, profile) + proactiveContext;

    let anthropicMessages = [...priorMessages, ...messages]
      .filter(m => m.content && (typeof m.content === 'string' ? m.content.trim() : m.content.length > 0))
      .slice(-20);

    const hasFiles = files && files.length > 0;

    if (hasFiles) {
      const lastMsg = anthropicMessages[anthropicMessages.length - 1];
      const contentParts = [];
      for (const file of files) {
        if (file.type === 'image') {
          contentParts.push({ type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } });
        } else if (file.type === 'pdf') {
          contentParts.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } });
        }
      }
      if (lastMsg.content) contentParts.push({ type: 'text', text: lastMsg.content });
      anthropicMessages[anthropicMessages.length - 1] = { role: 'user', content: contentParts };
    }

    // Call Claude — offer save_document tool only when files are present
    const apiParams = {
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    };
    if (hasFiles) {
      apiParams.tools = [SAVE_DOCUMENT_TOOL];
      apiParams.tool_choice = { type: 'auto' };
    }

    let response = await client.messages.create(apiParams);

    // Extract text and tool call from response
    let rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const toolCall = response.content.find(b => b.type === 'tool_use' && b.name === 'save_document');

    // If Claude only returned a tool call (no text for the student), do a follow-up to get the response
    if (!rawText && toolCall) {
      const followUp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...anthropicMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: 'Saved.' }] },
        ],
      });
      rawText = followUp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    }

    const { cleanText, update } = extractProfileUpdate(rawText);

    // Save document if Claude identified educational content
    if (toolCall?.input?.is_educational) {
      // Ensure session row exists before inserting document (FK constraint)
      await pool.query(
        'INSERT INTO sessions (id, student_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [sessionId, studentId]
      );
      await saveDocument(studentId, sessionId, toolCall.input);
    }

    // Persist profile update
    if (update) {
      const updatedProfile = { ...profile, ...update };
      await pool.query(
        'UPDATE students SET profile = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updatedProfile), studentId]
      );
    }

    // Ensure session row exists
    await pool.query(
      'INSERT INTO sessions (id, student_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [sessionId, studentId]
    );

    // Save messages
    const userMessage = messages[messages.length - 1];
    await pool.query(
      'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3), ($1, $4, $5)',
      [sessionId, 'user', userMessage.content, 'assistant', cleanText]
    );

    // Mark unreviewed documents as reviewed after first response
    if (isFirstMessage && unreviewedIds.length > 0) {
      await pool.query(
        'UPDATE documents SET is_reviewed = true WHERE id = ANY($1)',
        [unreviewedIds]
      );
    }

    res.json({ message: cleanText });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
