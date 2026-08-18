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
      is_educational: { type: 'boolean' },
      type:    { type: 'string', enum: ['test', 'exercise_page', 'textbook_page', 'worksheet', 'other'] },
      subject: { type: 'string', enum: ['math', 'english', 'hebrew', 'bible', 'history', 'geography', 'science', 'other'] },
      description: { type: 'string', description: '2-4 sentence summary of what you saw' },
      content: { type: 'string', description: 'Full reading with [correct]/[wrong]/[skipped] per question' },
      score:   { type: 'string', description: 'Score as written on paper. Omit if not visible.' },
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic:       { type: 'string' },
            performance: { type: 'string', enum: ['strong', 'needs_practice', 'struggling', 'not_assessed'] },
            notes:       { type: 'string' },
          },
          required: ['topic', 'performance'],
        },
      },
    },
    required: ['is_educational'],
  },
};

const MARK_EXERCISE_TOOL = {
  name: 'mark_exercise',
  description: `Record the outcome of the CURRENT work page exercise (the exercise_id given in the WORK PAGE section of your system prompt) — but ONLY after you have actually presented that exact exercise's description to the student in THIS conversation and worked through it with her. Never call this for an exercise you have not personally shown her in this session, and never guess or assume an exercise was completed.

status="solved" — use ONLY if she reached and confirmed the correct final answer to this specific exercise in this conversation. Do not use "solved" just because she says she's "done" or wants to move on — if you did not personally verify the answer with her here, it is not solved.
status="skipped" — use if she wants to stop or move past this exercise without solving it. This is the correct status for "let's skip this" or "I don't want to do this one" — do not use "solved" for that.
status="attempted" — use if she engaged with it genuinely but didn't reach the correct answer.`,
  input_schema: {
    type: 'object',
    properties: {
      exercise_id: { type: 'number', description: 'The exercise ID provided in the work page context — must match the exercise you actually discussed' },
      status: { type: 'string', enum: ['solved', 'attempted', 'skipped'] },
      notes: { type: 'string', description: 'Brief, factual note about what actually happened in this conversation — never describe a solve that did not take place' },
    },
    required: ['exercise_id', 'status'],
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
    const topicStr = (d.topics || []).filter(t => t.topic).map(t => `${t.topic} (${t.performance})`).join(', ');
    return {
      context: `\n\nPROACTIVE MENTION (bring this up naturally in one sentence at the start):\nUnreviewed ${d.type} uploaded ${days} day(s) ago. Subject: ${d.subject}.${d.score ? ` Score: ${d.score}.` : ''}${topicStr ? ` Topics: ${topicStr}.` : ''}`,
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
      const msg = perf === 'struggling'   ? `has been struggling with "${r.topic}" in ${r.subject}` :
                  perf === 'not_assessed' ? `has a ${r.subject} topic "${r.topic}" that hasn't been assessed yet` :
                                            `could use more practice with "${r.topic}" in ${r.subject}`;
      return {
        context: `\n\nPROACTIVE MENTION (bring this up naturally in one sentence at the start, last seen ${days} day(s) ago):\nThe student ${msg}.`,
        unreviewedIds: [],
      };
    }
  }

  return { context: '', unreviewedIds: [] };
}

async function buildWorkPageContext(studentId) {
  const { rows } = await pool.query(`
    SELECT wp.id, wp.title, wp.subject, wp.mode, wp.due_date,
           COUNT(e.id) AS total,
           COUNT(e.id) FILTER (WHERE e.status IN ('solved','skipped')) AS done,
           (SELECT row_to_json(e2) FROM exercises e2
            WHERE e2.page_id = wp.id AND e2.status IN ('pending','attempted')
            ORDER BY e2.order_index ASC LIMIT 1) AS next_exercise
    FROM work_pages wp
    JOIN exercises e ON e.page_id = wp.id
    WHERE wp.student_id = $1 AND wp.status = 'active'
    GROUP BY wp.id ORDER BY wp.created_at ASC LIMIT 1
  `, [studentId]);

  if (!rows.length) return { context: '', activeExerciseId: null };

  const page = rows[0];
  const pct = Math.round((parseInt(page.done) / parseInt(page.total)) * 100);
  const ex = page.next_exercise;

  if (!ex) {
    await pool.query(`UPDATE work_pages SET status = 'completed' WHERE id = $1`, [page.id]);
    return { context: '', activeExerciseId: null };
  }

  const dueStr = page.due_date
    ? ` Due: ${new Date(page.due_date).toLocaleDateString()}.`
    : '';

  const modeInstr = page.mode === 'strict'
    ? 'STRICT MODE: do not help with other subjects or homework until this work page is 100% complete. If the student asks about something else, acknowledge briefly and redirect back to the current exercise.'
    : 'FLEXIBLE MODE: open with a brief mention of the work page, then follow the student\'s lead if she wants to work on something else.';

  return {
    context: `\n\nWORK PAGE (${modeInstr})\nTitle: "${page.title}" | Subject: ${page.subject} | Progress: ${page.done}/${page.total} (${pct}%).${dueStr}\nCurrent exercise (id=${ex.id}, difficulty=${ex.difficulty}): "${ex.description}"\nYou must present THIS exact exercise to her and work through it before calling mark_exercise. Only call it with status="solved" once she has actually reached the correct final answer to it in this conversation. If she wants to skip it or stop without solving it, call status="skipped" — never "solved". Total exercises remaining on this page (including this one): ${page.total - page.done}.`,
    activeExerciseId: ex.id,
  };
}

// Full, accurate overview of every work page the student has — not just the current one.
// Runs on every message so Claude never has to guess or ask for a photo to answer "what pages do I have".
async function buildAllPagesContext(studentId) {
  const { rows } = await pool.query(`
    SELECT wp.title, wp.subject, wp.status,
           COUNT(e.id) AS total,
           COUNT(e.id) FILTER (WHERE e.status IN ('solved','skipped')) AS done
    FROM work_pages wp
    LEFT JOIN exercises e ON e.page_id = wp.id
    WHERE wp.student_id = $1 AND wp.status IN ('active', 'completed')
    GROUP BY wp.id
    ORDER BY (wp.status = 'active') DESC, wp.created_at DESC
  `, [studentId]);

  if (!rows.length) {
    return `\n\nALL WORK PAGES: she has none yet. If she asks about pages or exercises, tell her there aren't any yet — don't ask her to send a photo to find out, there is nothing to find.`;
  }

  const lines = rows.map(p => `- "${p.title}" (${p.subject}): ${p.done}/${p.total} solved${p.status === 'completed' ? ' — fully completed' : ''}`).join('\n');
  return `\n\nALL WORK PAGES (this is complete and accurate — this is every page she has, nothing is hidden from you):\n${lines}\nIf she asks what pages/exercises she has, how many are left, or for a status update, answer directly from this list. NEVER ask her to photograph or send a work page to find out what's on it or how many exercises remain — you already know. Only ask for a photo/PDF for material that is NOT one of these work pages (e.g. a worksheet she wants checked that wasn't planned through the parent). If none of these pages is active right now, don't resume or reference an old exercise from earlier in the conversation history — treat it as done and wait for her to say what she wants to work on.`;
}

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
  console.log(`Document saved: id=${docId} student=${studentId} type=${data.type}`);
}

async function markExercise(exerciseId, status, notes) {
  const { rows } = await pool.query(`SELECT attempts, page_id FROM exercises WHERE id = $1`, [exerciseId]);
  if (!rows[0]) return;

  const attempts = rows[0].attempts || [];
  attempts.push({ date: new Date().toISOString(), outcome: status, notes: notes || null });

  await pool.query(
    `UPDATE exercises SET status = $1, attempts = $2, solved_at = $3 WHERE id = $4`,
    [status, JSON.stringify(attempts.slice(-10)), status === 'solved' ? new Date() : null, exerciseId]
  );

  // Check if page is now fully complete
  const pageId = rows[0].page_id;
  const { rows: [progress] } = await pool.query(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status IN ('solved','skipped')) AS done
     FROM exercises WHERE page_id = $1`,
    [pageId]
  );
  if (parseInt(progress.done) >= parseInt(progress.total)) {
    await pool.query(`UPDATE work_pages SET status = 'completed' WHERE id = $1`, [pageId]);
    console.log(`Work page ${pageId} completed!`);
  }
}

// POST /api/chat
router.post('/', async (req, res) => {
  const { studentId, sessionId, messages, files } = req.body;

  const student = STUDENTS[studentId];
  if (!student) return res.status(400).json({ error: 'Invalid student.' });
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId.' });

  try {
    const { rows } = await pool.query('SELECT profile FROM students WHERE id = $1', [studentId]);
    if (!rows.length) return res.status(404).json({ error: 'Student not found.' });
    const profile = rows[0].profile;

    const isFirstMessage = messages.length === 1;

    let priorMessages = [];
    let proactiveContext = '';
    let unreviewedIds = [];

    if (isFirstMessage) {
      const { rows: prior } = await pool.query(
        `SELECT m.role, m.content FROM messages m
         WHERE m.session_id IN (
           SELECT id FROM sessions WHERE student_id = $1 AND id != $2
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

    // Work page context on every message (state changes as exercises are solved)
    const { context: workPageContext, activeExerciseId } = await buildWorkPageContext(studentId);
    const allPagesContext = await buildAllPagesContext(studentId);

    const systemPrompt = buildSystemPrompt(student.promptFile, profile) + proactiveContext + workPageContext + allPagesContext;

    let anthropicMessages = [...priorMessages, ...messages]
      .filter(m => m.content && (typeof m.content === 'string' ? m.content.trim() : m.content.length > 0))
      .slice(-40);

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

    // Build tools list
    const tools = [];
    if (activeExerciseId) tools.push(MARK_EXERCISE_TOOL);
    if (hasFiles) tools.push(SAVE_DOCUMENT_TOOL);

    const apiParams = {
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    };
    if (tools.length > 0) {
      apiParams.tools = tools;
      apiParams.tool_choice = { type: 'auto' };
    }

    let response = await client.messages.create(apiParams);

    let rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const markCall = response.content.find(b => b.type === 'tool_use' && b.name === 'mark_exercise');
    const docCall  = response.content.find(b => b.type === 'tool_use' && b.name === 'save_document');

    // If Claude made tool calls, follow up so it can finish its response with the tool result in hand.
    // Any text emitted alongside the tool call in the same turn is a lead-in, not the final reply —
    // Claude hasn't seen the tool result yet, so that text is often left mid-sentence.
    if (markCall || docCall) {
      const toolResults = [];
      if (markCall) toolResults.push({ type: 'tool_result', tool_use_id: markCall.id, content: 'Done.' });
      if (docCall)  toolResults.push({ type: 'tool_result', tool_use_id: docCall.id,  content: 'Saved.' });

      const followUp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...anthropicMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      });
      rawText = followUp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    }

    const { cleanText, update } = extractProfileUpdate(rawText);

    // Handle tool side effects
    if (markCall) await markExercise(markCall.input.exercise_id, markCall.input.status, markCall.input.notes);
    if (docCall?.input?.is_educational) {
      await pool.query('INSERT INTO sessions (id, student_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [sessionId, studentId]);
      await saveDocument(studentId, sessionId, docCall.input);
    }

    if (update) {
      const updatedProfile = { ...profile, ...update };
      await pool.query('UPDATE students SET profile = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(updatedProfile), studentId]);
    }

    await pool.query('INSERT INTO sessions (id, student_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [sessionId, studentId]);

    const userMessage = messages[messages.length - 1];
    await pool.query(
      'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3), ($1, $4, $5)',
      [sessionId, 'user', userMessage.content, 'assistant', cleanText]
    );

    if (isFirstMessage && unreviewedIds.length > 0) {
      await pool.query('UPDATE documents SET is_reviewed = true WHERE id = ANY($1)', [unreviewedIds]);
    }

    res.json({ message: cleanText });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
