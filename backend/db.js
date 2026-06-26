import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SEED_STUDENTS = [
  { id: 'lielle', profileFile: 'daughter1.json' },
  { id: 'agam',   profileFile: 'daughter2.json' },
];

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id         VARCHAR(50)  PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      profile    JSONB        NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         UUID         PRIMARY KEY,
      student_id VARCHAR(50)  NOT NULL REFERENCES students(id),
      started_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         SERIAL       PRIMARY KEY,
      session_id UUID         NOT NULL REFERENCES sessions(id),
      role       VARCHAR(20)  NOT NULL,
      content    TEXT         NOT NULL,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vocab_words (
      id             SERIAL       PRIMARY KEY,
      student_id     VARCHAR(50)  NOT NULL REFERENCES students(id),
      word           VARCHAR(100) NOT NULL,
      translation    VARCHAR(200) NOT NULL,
      rank           INTEGER      NOT NULL DEFAULT 1,
      priority       VARCHAR(20)  NOT NULL DEFAULT 'normal',
      attempts       JSONB        NOT NULL DEFAULT '[]',
      last_practiced TIMESTAMPTZ,
      added_by       VARCHAR(20)  NOT NULL DEFAULT 'claude',
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, word)
    );

    -- Add rank column if upgrading from earlier schema
    ALTER TABLE vocab_words ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS vocab_games (
      id         SERIAL       PRIMARY KEY,
      student_id VARCHAR(50)  NOT NULL REFERENCES students(id),
      score      INTEGER      NOT NULL,
      word_count INTEGER      NOT NULL,
      played_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id          SERIAL       PRIMARY KEY,
      student_id  VARCHAR(50)  NOT NULL REFERENCES students(id),
      session_id  UUID         NOT NULL REFERENCES sessions(id),
      type        VARCHAR(30)  NOT NULL,
      subject     VARCHAR(50)  NOT NULL,
      description TEXT         NOT NULL,
      content     TEXT,
      score       VARCHAR(20),
      is_reviewed BOOLEAN      NOT NULL DEFAULT false,
      uploaded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS document_subjects (
      id          SERIAL       PRIMARY KEY,
      document_id INTEGER      NOT NULL REFERENCES documents(id),
      topic       VARCHAR(100) NOT NULL,
      performance VARCHAR(20)  NOT NULL,
      notes       TEXT,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);

  for (const { id, profileFile } of SEED_STUDENTS) {
    const filePath = path.join(__dirname, 'profiles', profileFile);
    const seed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    await pool.query(
      `INSERT INTO students (id, name, profile)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, seed.name, JSON.stringify(seed)]
    );
  }

  console.log('DB schema ready.');
}
