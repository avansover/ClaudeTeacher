import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db.js';

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GRADE = {
  lielle: '6th grade (age 11)',
  agam:   '4th grade (age 9-10)',
};

// Call Claude with a forced tool — guaranteed structured JSON, no parsing needed
async function callWithTool(prompt, toolName, toolDescription, schema, maxTokens = 512) {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    tools: [{
      name: toolName,
      description: toolDescription,
      input_schema: { type: 'object', ...schema },
    }],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].input;
}

// Ask Claude for plain text (hints — no schema needed)
async function askClaude(prompt) {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].text.trim();
}

// Load all vocab_words for a student, ordered by priority then overdue
async function loadWords(studentId) {
  const { rows } = await pool.query(
    `SELECT * FROM vocab_words WHERE student_id = $1 ORDER BY priority DESC, last_practiced ASC NULLS FIRST`,
    [studentId]
  );
  return rows;
}

// Calculate mastery % for a given rank (last attempt = 'recall', among practiced words)
function calcMastery(words, rank) {
  const practiced = words.filter(w => w.rank === rank && w.last_practiced);
  if (!practiced.length) return 0;
  const recalled = practiced.filter(w => {
    const attempts = w.attempts || [];
    const last = attempts[attempts.length - 1];
    return last && last.result === 'recall';
  });
  return Math.round((recalled.length / practiced.length) * 100);
}

const RANK2_MIN_WORDS = 75; // must have practiced at least this many rank-1 words before rank-2 unlocks
const RANK3_MIN_WORDS = 75; // same threshold for rank-2 → rank-3

// Determine how many slots each rank gets this round
function calcRankSlots(words) {
  const rank1Mastery = calcMastery(words, 1);
  const rank2Mastery = calcMastery(words, 2);
  const rank1Practiced = words.filter(w => w.rank === 1 && w.last_practiced).length;
  const rank2Practiced = words.filter(w => w.rank === 2 && w.last_practiced).length;

  const rank2Unlocked = rank1Practiced >= RANK2_MIN_WORDS && rank1Mastery >= 80;
  const rank3Unlocked = rank2Practiced >= RANK3_MIN_WORDS && rank2Mastery >= 80;

  const rank2Slots = rank2Unlocked ? Math.min(5, Math.max(0, Math.floor((rank1Mastery - 75) / 5))) : 0;
  const rank3Slots = rank3Unlocked ? Math.floor((rank2Mastery / 100) * rank2Slots) : 0;
  const rank1Slots = 10 - rank2Slots - rank3Slots;
  return { rank1Slots, rank2Slots, rank3Slots, rank1Mastery, rank2Mastery, rank1Practiced, rank2Practiced };
}

// Pick the best known words for a rank slot (weak/overdue first)
function pickKnownWords(words, rank, count, exclude) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const pool = words.filter(w => {
    if (w.rank !== rank) return false;
    if (exclude.find(e => e.id === w.id)) return false;
    // Don't repeat a word already answered correctly today
    const attempts = w.attempts || [];
    const last = attempts[attempts.length - 1];
    if (w.last_practiced && new Date(w.last_practiced) >= todayStart && last?.result === 'recall') return false;
    return true;
  });

  // Priority order: test → failed/multiple last → overdue → hint last → rest
  const scored = pool.map(w => {
    const attempts = w.attempts || [];
    const last = attempts[attempts.length - 1];
    let score = 0;
    if (w.priority === 'test') score += 1000;
    if (last && (last.result === 'failed' || last.result === 'multiple')) score += 100;
    if (!w.last_practiced || new Date(w.last_practiced) < weekAgo) score += 50;
    if (last && last.result === 'hint') score += 10;
    return { ...w, _score: score };
  });

  return scored.sort((a, b) => b._score - a._score).slice(0, count);
}

// Score a word given how the student answered
function wordScore(stage) {
  if (stage === 'recall')   return 10;
  if (stage === 'hint')     return 8;
  if (stage === 'multiple') return 5;
  return 0;
}

const RANK_CATEGORIES = {
  1: `Basic vocabulary ONLY — colors, animals, food, drinks, body parts, numbers, family members, school objects, simple verbs (run/eat/sleep), basic adjectives (big/small/hot/cold), common places (home/school/park). First 2 years of English. No abstract words.`,
  2: `Everyday vocabulary — school subjects, emotions, weather, more complex verbs (decide/explain/choose), common adjectives (difficult/careful/important), transport, sports, clothing. Intermediate level.`,
  3: `Grade-level vocabulary — more abstract or less common words appropriate for the student's school grade. Still useful everyday words but less frequent.`,
};

async function fetchNewWords(studentId, rank, count, existing) {
  if (count <= 0) return [];
  const prompt = `Pick exactly ${count} English vocabulary words at difficulty level: ${RANK_CATEGORIES[rank]}

Student context: Israeli student in ${GRADE[studentId]} with gaps from COVID and wartime — level is below grade.
Already known words to avoid: ${existing || 'none yet'}
Translation must be the most common simple Hebrew word for each.`;

  const result = await callWithTool(
    prompt,
    'pick_words',
    'Return a list of English words with their Hebrew translations',
    {
      properties: {
        words: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              word:        { type: 'string', description: 'English word' },
              translation: { type: 'string', description: 'Hebrew translation' },
            },
            required: ['word', 'translation'],
          },
        },
      },
      required: ['words'],
    },
    512
  );

  const inserted = [];
  for (const nw of result.words || []) {
    if (!nw.word || !nw.translation) continue;
    const { rows } = await pool.query(
      `INSERT INTO vocab_words (student_id, word, translation, rank, added_by)
       VALUES ($1, $2, $3, $4, 'claude')
       ON CONFLICT (student_id, word) DO NOTHING
       RETURNING *`,
      [studentId, nw.word.toLowerCase(), nw.translation, rank]
    );
    if (rows[0]) inserted.push(rows[0]);
  }
  return inserted;
}

// POST /api/vocab/start
router.post('/start', async (req, res) => {
  const { studentId } = req.body;
  if (!GRADE[studentId]) return res.status(400).json({ error: 'Invalid student.' });

  try {
    const words = await loadWords(studentId);
    const { rank1Slots, rank2Slots, rank3Slots } = calcRankSlots(words);
    const selected = [];
    const existing = words.map(w => w.word).join(', ');

    for (const [rank, slots] of [[1, rank1Slots], [2, rank2Slots], [3, rank3Slots]]) {
      if (slots <= 0) continue;
      const known = pickKnownWords(words, rank, slots, selected);
      selected.push(...known);
      const stillNeeded = slots - known.length;
      if (stillNeeded > 0) {
        const fresh = await fetchNewWords(studentId, rank, stillNeeded, existing);
        selected.push(...fresh);
      }
    }

    res.json({
      words: selected.slice(0, 10).map(w => ({
        id: w.id,
        word: w.word,
        translation: w.translation,
        rank: w.rank,
        isNew: !w.last_practiced,
      })),
    });
  } catch (err) {
    console.error('Vocab start error:', err);
    res.status(500).json({ error: 'Could not start game.' });
  }
});

// POST /api/vocab/hint
// Returns a simple context sentence for the word (plain text — no schema needed)
router.post('/hint', async (req, res) => {
  const { studentId, word } = req.body;
  if (!GRADE[studentId]) return res.status(400).json({ error: 'Invalid student.' });

  try {
    const prompt = `Write one hint sentence in English to help an Israeli ${GRADE[studentId]} student guess the meaning of the word "${word}".
- Maximum 10 words
- Use ONLY simple, very common English words — nothing harder than the word being tested
- Make the meaning guessable from context
- Do NOT include the Hebrew translation
- Return the sentence only, nothing else`;

    const hint = await askClaude(prompt);
    res.json({ hint });
  } catch (err) {
    console.error('Vocab hint error:', err);
    res.status(500).json({ error: 'Could not generate hint.' });
  }
});

// POST /api/vocab/choices
// Returns 4 Hebrew options (1 correct + 3 plausible distractors)
router.post('/choices', async (req, res) => {
  const { studentId, word, translation } = req.body;
  if (!GRADE[studentId]) return res.status(400).json({ error: 'Invalid student.' });

  try {
    const prompt = `The English word "${word}" means "${translation}" in Hebrew.
Generate 3 other Hebrew words that a student might confuse it with — real Hebrew words, plausible distractors, similar category.`;

    const result = await callWithTool(
      prompt,
      'pick_distractors',
      'Return 3 plausible but wrong Hebrew translations',
      {
        properties: {
          distractors: {
            type: 'array',
            items: { type: 'string' },
            description: '3 wrong Hebrew options',
          },
        },
        required: ['distractors'],
      },
      128
    );

    const choices = [translation, ...(result.distractors || [])].sort(() => Math.random() - 0.5);
    res.json({ choices });
  } catch (err) {
    console.error('Vocab choices error:', err);
    res.status(500).json({ error: 'Could not generate choices.' });
  }
});

// POST /api/vocab/check
// Evaluates a free-text recall answer leniently
router.post('/check', async (req, res) => {
  const { studentId, word, translation, answer } = req.body;
  if (!GRADE[studentId]) return res.status(400).json({ error: 'Invalid student.' });

  try {
    const prompt = `The English word "${word}" has one accepted Hebrew translation: "${translation}".
The student answered: "${answer}".

Is the student correct? Rules:
- Accept ANY valid Hebrew translation of the English word, not just the stored one
- Accept synonyms and related words with the same meaning
- Accept minor spelling mistakes
- Hebrew has many valid translations — if it means the same thing, it is correct
- Example: "assignment" → also accept "משימה", "מטלה", "תרגיל" even if stored as "הגשה"`;

    const result = await callWithTool(
      prompt,
      'check_answer',
      'Report whether the student answer is correct',
      {
        properties: {
          correct: { type: 'boolean', description: 'Whether the student answer is correct' },
        },
        required: ['correct'],
      },
      64
    );

    res.json({ correct: result.correct });
  } catch (err) {
    console.error('Vocab check error:', err);
    res.status(500).json({ error: 'Could not check answer.' });
  }
});

// POST /api/vocab/complete
// Saves game results, updates word attempts, prunes old games
router.post('/complete', async (req, res) => {
  const { studentId, results } = req.body;
  if (!GRADE[studentId]) return res.status(400).json({ error: 'Invalid student.' });

  try {
    let score = 0;
    let streak = 0;

    for (const r of results) {
      const points = wordScore(r.result);
      let bonus = 0;
      if (streak >= 3 && r.result === 'recall') bonus = 2;
      if (r.result === 'recall') streak++; else streak = 0;
      score += Math.min(10, points + bonus);

      // Update word attempts (keep last 10)
      const { rows } = await pool.query(
        'SELECT attempts FROM vocab_words WHERE id = $1',
        [r.wordId]
      );
      if (rows[0]) {
        const attempts = rows[0].attempts || [];
        attempts.push({ date: new Date().toISOString(), result: r.result });
        const trimmed = attempts.slice(-10);
        await pool.query(
          `UPDATE vocab_words SET attempts = $1, last_practiced = NOW() WHERE id = $2`,
          [JSON.stringify(trimmed), r.wordId]
        );
      }
    }

    // Save game score
    await pool.query(
      'INSERT INTO vocab_games (student_id, score, word_count) VALUES ($1, $2, $3)',
      [studentId, score, results.length]
    );

    // Keep only last 10 games per student
    await pool.query(
      `DELETE FROM vocab_games WHERE student_id = $1 AND id NOT IN (
        SELECT id FROM vocab_games WHERE student_id = $1 ORDER BY played_at DESC LIMIT 10
      )`,
      [studentId]
    );

    // Calculate rolling average
    const { rows: games } = await pool.query(
      'SELECT score FROM vocab_games WHERE student_id = $1 ORDER BY played_at DESC LIMIT 10',
      [studentId]
    );
    const average = Math.round(games.reduce((sum, g) => sum + g.score, 0) / games.length);

    res.json({ score, average });
  } catch (err) {
    console.error('Vocab complete error:', err);
    res.status(500).json({ error: 'Could not save game.' });
  }
});

export default router;
