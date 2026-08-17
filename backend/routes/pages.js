import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

const STUDENTS = ['lielle', 'agam'];

// GET /api/pages/:studentId — read-only work pages + exercises, for the student to track her own progress.
// Drafts are excluded — those are still being planned by the parent and aren't meant for the student yet.
router.get('/:studentId', async (req, res) => {
  if (!STUDENTS.includes(req.params.studentId)) return res.status(400).json({ error: 'Invalid student.' });

  try {
    const { rows } = await pool.query(`
      SELECT wp.id, wp.title, wp.subject, wp.mode, wp.status, wp.due_date,
             COUNT(e.id) AS total,
             COUNT(e.id) FILTER (WHERE e.status IN ('solved','skipped')) AS done,
             json_agg(
               json_build_object('id', e.id, 'order_index', e.order_index, 'description', e.description,
                                  'status', e.status, 'difficulty', e.difficulty)
               ORDER BY e.order_index
             ) FILTER (WHERE e.id IS NOT NULL) AS exercises
      FROM work_pages wp
      LEFT JOIN exercises e ON e.page_id = wp.id
      WHERE wp.student_id = $1 AND wp.status IN ('active', 'completed')
      GROUP BY wp.id
      ORDER BY (wp.status = 'active') DESC, wp.created_at DESC
    `, [req.params.studentId]);
    res.json({ pages: rows });
  } catch (err) {
    console.error('Pages list error:', err);
    res.status(500).json({ error: 'Could not load pages.' });
  }
});

export default router;
