# Feature Specification: Database & Persistence Layer

**Feature Branch**: `002-database`
**Created**: 2026-06-13
**Status**: Draft

---

## Background & Motivation

ClaudeTeacher MVP stores student profiles in JSON files on the Railway filesystem.
This has one critical problem: **every redeploy wipes the files**, which means Claude loses everything it learned about Lielle and Agam — their preferred language, subjects they struggle with, progress notes.

The second motivation is enabling future features that require persistent conversation history:
- Nightly summaries sent to the parent
- Progress reports ("Agam worked on fractions 3 times this week")
- Spotting recurring struggles automatically

A proper database solves both.

---

## User Scenarios

### Story 1 — Profiles Survive Redeployment (Priority: P1)

Lielle had a long session last week. Claude learned she prefers Hebrew and struggles with fractions. Amir deploys a bug fix to Railway. When Lielle opens ClaudeTeacher again, Claude still remembers everything about her.

**Why this priority**: The whole point of the profile system is long-term memory. If a deploy wipes it, the feature doesn't work at all.

**Acceptance Scenarios**:

1. **Given** Claude updated Lielle's profile during a session, **When** Amir pushes a new Railway deployment, **Then** Lielle's profile is unchanged and Claude greets her with full context on the next visit.
2. **Given** a student profile exists in the database, **When** the backend reads it to build the system prompt, **Then** the content is identical to what was last written.

---

### Story 2 — Conversation History is Saved (Priority: P2)

Amir wants to know what his daughters worked on this week. He checks ClaudeTeacher and sees a log of sessions per student — date, messages exchanged, topics.

**Why this priority**: Prerequisite for nightly summaries and all future parent-visibility features. Without stored history, there's nothing to summarize.

**Acceptance Scenarios**:

1. **Given** Agam sends 5 messages in a chat session, **When** the session ends (new session started or browser closed), **Then** all 5 messages are stored in the database linked to Agam and that session.
2. **Given** multiple sessions exist for a student, **When** querying sessions, **Then** each session is a distinct record with its own timestamp and messages.
3. **Given** Lielle starts a new chat, **When** the frontend sends messages, **Then** a session record is created on first message and reused for the rest of that conversation.

---

### Story 3 — Parent Can Browse Data in DBeaver (Priority: P3)

Amir connects DBeaver to the Railway Postgres instance and runs a simple SELECT to see what Claude has noted about his daughters.

**Why this priority**: Operational visibility. Amir needs to verify the system is working as expected without reading Railway logs.

**Acceptance Scenarios**:

1. **Given** Railway Postgres credentials, **When** Amir connects DBeaver with those credentials, **Then** he can browse `students`, `sessions`, and `messages` tables without errors.
2. **Given** a completed chat session, **When** Amir queries `SELECT * FROM messages WHERE session_id = X`, **Then** he sees all messages from that session in order.

---

## Requirements

### Functional Requirements

- **FR-001**: Student profiles MUST be stored in and read from the database, not JSON files.
- **FR-002**: Claude's autonomous profile updates (`<profile_update>` blocks) MUST persist to the database.
- **FR-003**: Every chat message (both user and assistant) MUST be saved to the database with a timestamp.
- **FR-004**: Messages MUST be grouped into sessions — a session starts when a student begins a new chat (fresh browser visit or page reload) and ends implicitly.
- **FR-005**: The schema MUST be initialized automatically on first startup if tables do not exist (no manual migration step needed to run the app).
- **FR-006**: Profile data shape MUST remain flexible — stored as JSONB — so Claude can add new fields without a schema migration.
- **FR-007**: The backend MUST fall back gracefully if the database is unreachable — return a 500 with a clear error, don't crash the process.

### Non-Functional Requirements

- **NFR-001**: Database queries MUST NOT add more than 100ms to a chat response (profiles are small, this should be <5ms in practice).
- **NFR-002**: The connection MUST use the `DATABASE_URL` environment variable injected by Railway — no hardcoded credentials anywhere.
- **NFR-003**: The Postgres instance MUST be reachable from DBeaver using the public Railway credentials.

---

## Data Model

### Table: `students`

Stores one row per student. The `profile` column holds the flexible JSON blob Claude reads and updates.

| Column | Type | Notes |
|---|---|---|
| `id` | `VARCHAR(50)` PK | Student key — `'lielle'` or `'agam'`. Matches the `studentId` the frontend sends. |
| `name` | `VARCHAR(100)` | Display name — `'Lielle'` or `'Agam'`. |
| `profile` | `JSONB` | Flexible blob: `subjects_struggling`, `learning_style`, `progress_notes`, etc. |
| `updated_at` | `TIMESTAMPTZ` | Updated every time Claude writes a `<profile_update>`. |

**Why JSONB for profile**: Claude can add new observations (e.g. `"preferred_explanation_style"`) without a schema migration. The fields are Claude-driven, not application-driven — treating them as a structured blob is the right call.

**Why VARCHAR id instead of SERIAL**: The student id is already a meaningful string (`'lielle'`, `'agam'`). A surrogate integer key would add indirection with no benefit here.

---

### Table: `sessions`

One row per chat visit. A session starts on first message and has no explicit end — it's bounded by `started_at` and the next session's `started_at`.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | Generated server-side (`crypto.randomUUID()`). Sent to the frontend on session start so it can attach subsequent messages. |
| `student_id` | `VARCHAR(50)` FK → `students.id` | Which student this session belongs to. |
| `started_at` | `TIMESTAMPTZ` | When the first message was sent. |

**Why UUID**: Sessions are created on the frontend side of a stateless API — UUID avoids the need for a round-trip to get a serial ID before writing the first message.

---

### Table: `messages`

Every message in every session, in order.

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL` PK | Auto-increment. Ordering by `id` gives reliable message order within a session. |
| `session_id` | `UUID` FK → `sessions.id` | Which session this message belongs to. |
| `role` | `VARCHAR(20)` | `'user'` or `'assistant'`. Matches Anthropic message format. |
| `content` | `TEXT` | Message text. For assistant messages, the `<profile_update>` block is already stripped before saving. |
| `created_at` | `TIMESTAMPTZ` | Message timestamp. |

---

## Architecture Decisions

### Why PostgreSQL on Railway (not SQLite, not an external service)

SQLite on Railway has the same problem as JSON files — it lives on the ephemeral filesystem and is wiped on redeploy. It could work with a Railway Volume, but that adds complexity for no benefit.

PostgreSQL on Railway is a first-class plugin: one click to add, Railway injects `DATABASE_URL` automatically, same dashboard, same billing. No external accounts needed. DBeaver connects to it like any remote Postgres.

Supabase was considered — it adds a nice web UI — but it's an external dependency and a separate account. Railway Postgres is simpler for this scale.

### Why no ORM (raw `pg` driver)

The schema is 3 small tables. An ORM (Drizzle, Prisma) would add a build step, a migration runner, and a layer of abstraction over 6 queries. The raw `pg` driver is sufficient and keeps the stack simple.

### Why JSONB for the profile

The profile is Claude-driven, not application-driven. Application code never reads individual fields from it — it serializes the whole thing into the system prompt as a string. Storing it as JSONB preserves queryability (Amir can filter in DBeaver with `profile->>'learning_style'`) while avoiding a rigid column-per-field schema that would need a migration every time Claude gains a new type of observation.

### Session ID on the frontend

The frontend generates a UUID when the student picker is opened and sends it with every message. The backend creates the session row on first message if it doesn't exist yet. This avoids a separate "start session" API call and makes the frontend stateless — a page reload creates a new UUID and therefore a new session automatically.

---

## What Changes in the Code

| File | Change |
|---|---|
| `backend/db.js` | New file — pg Pool, `initSchema()` to create tables if not exists |
| `backend/routes/chat.js` | Replace `loadProfile` / `saveProfile` (file I/O) with DB reads/writes. Accept `sessionId` from request body. Save each message pair after Claude responds. |
| `backend/server.js` | Call `initSchema()` on startup before the server starts listening |
| `frontend/src/components/ChatWindow.jsx` | Generate `sessionId` (UUID) on mount, send it in every request body |
| `frontend/src/components/StudentPicker.jsx` | No change — session starts in ChatWindow, not here |

**JSON files (`daughter1.json`, `daughter2.json`)**: Kept in the repo as the initial seed data for profiles. On first startup, `initSchema()` runs a seed step after creating the tables: for each student defined in `STUDENTS`, if no row exists in `students` with that id, it inserts one using the data from the corresponding JSON file. This is an `INSERT ... WHERE NOT EXISTS` — it never overwrites. After the first deploy the JSON files are frozen in place and the DB is the source of truth.

---

## Out of Scope for This Feature

- Nightly summary emails/WhatsApp — that's a separate feature that reads from the `sessions` + `messages` tables built here.
- Admin UI — DBeaver is sufficient for now.
- Profile history / audit log — overwriting the JSONB blob is fine for now.
- Authentication / row-level security — the app uses PIN auth, not per-user DB credentials.
- Message search or full-text indexing.

---

## Success Criteria

- **SC-001**: After a Railway redeploy, both students' profiles are intact and Claude uses them correctly on the next session.
- **SC-002**: After a chat session, all messages appear in the `messages` table with correct `role` and `session_id`.
- **SC-003**: Amir can connect DBeaver to the Railway Postgres and run a SELECT query on all three tables without errors.
- **SC-004**: The backend starts cleanly on a fresh Railway instance (empty DB) without manual SQL — `initSchema()` creates the tables automatically.
- **SC-005**: Chat response latency is not measurably worse than before the DB was added.
