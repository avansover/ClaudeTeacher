# Feature Specification: Work Pages & Parent Dashboard

**Feature Branch**: `005-work-pages`
**Created**: 2026-07-03
**Status**: Draft

---

## Background & Motivation

ClaudeTeacher currently reacts to what students bring to it — homework questions, uploaded tests, vocabulary practice. This feature adds a proactive planning layer: Amir (parent/teacher) can sit down with ClaudeTeacher, plan a set of exercises for a student, and lock them in. ClaudeTeacher then prioritizes those exercises in every student session until they're completed.

This is especially important during summer vacation when there is no school structure. A locked work page in strict mode means ClaudeTeacher does not move on to other topics until the page is 100% done.

The parent accesses this mode through the same app but with a separate PIN — students don't know parent mode exists.

---

## User Scenarios

### Story 1 — Parent Plans a Work Page (P1)

Amir enters the parent PIN, selects Agam, and opens a planning chat. He tells ClaudeTeacher "I want to make a practice page on long multiplication — 6 exercises, mixed difficulty." ClaudeTeacher suggests the exercises. They discuss and adjust. Amir confirms and locks the page. From that point, every time Agam opens the app, ClaudeTeacher works through those exercises with her.

**Acceptance Scenarios:**

1. **Given** Amir enters the parent PIN, **When** the app loads, **Then** a parent dashboard is shown instead of the student picker.
2. **Given** Amir selects a student and opens planning mode, **When** he describes what he wants, **Then** ClaudeTeacher suggests a set of exercises with descriptions, subject, and difficulty.
3. **Given** Amir and Claude agree on the exercises, **When** Amir clicks "Lock Page", **Then** the work page and its exercises are saved to the DB with status `active` and `locked_at` timestamp.
4. **Given** a work page is locked, **When** Amir tries to edit exercises, **Then** the page must be unlocked first (status back to `draft`).

---

### Story 2 — Student Works Through a Page (P1)

Agam opens the app and starts a chat. ClaudeTeacher sees an active work page and opens with the first unsolved exercise. She works through it with Claude's help. When she solves it, Claude marks it done and moves to the next one.

**Acceptance Scenarios:**

1. **Given** an active work page exists with pending exercises, **When** a student session starts, **Then** ClaudeTeacher opens with the next unsolved exercise (not a generic greeting).
2. **Given** a student solves an exercise, **When** Claude confirms it's correct, **Then** the exercise status is updated to `solved` and `solved_at` is recorded.
3. **Given** a work page is in `strict` mode, **When** exercises remain unsolved, **Then** Claude does not engage with unrelated topics — it redirects to the work page.
4. **Given** a work page is in `flexible` mode, **When** exercises remain unsolved, **Then** Claude opens with a reminder about the work page but follows the student's lead if she wants to do something else.
5. **Given** all exercises on a page are solved, **When** the last one is marked done, **Then** the page status is updated to `completed`.

---

### Story 3 — Parent Monitors Progress (P2)

Amir opens the parent dashboard and sees each student's active work pages with completion percentages.

**Acceptance Scenarios:**

1. **Given** active work pages exist, **When** Amir opens the parent dashboard, **Then** he sees each page with its title, subject, mode, due date, and completion % (solved / total exercises).
2. **Given** a page is completed, **When** Amir views it, **Then** it shows the completion date and is archived from the active view.
3. **Given** Amir wants to assign a new page, **When** he opens planning mode for a student, **Then** he can start a new planning chat.

---

## Data Model

### Table: `work_pages`

One row per planned set of exercises for a student.

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL` PK | |
| `student_id` | `VARCHAR(50)` FK → `students.id` | |
| `title` | `VARCHAR(200)` | e.g. "Long multiplication practice — week 1" |
| `subject` | `VARCHAR(50)` | `math` / `english` / `hebrew` / `bible` / `history` / `geography` / `science` / `other` |
| `mode` | `VARCHAR(20)` | `strict` — don't work on other topics until 100% complete; `flexible` — remind but follow student's lead |
| `status` | `VARCHAR(20)` | `draft` — being planned; `active` — locked and in use; `completed` — all exercises solved |
| `locked_at` | `TIMESTAMPTZ` | When Amir confirmed and locked the page (null while draft) |
| `due_date` | `TIMESTAMPTZ` | Optional deadline — shown to Claude as context |
| `created_at` | `TIMESTAMPTZ` | Default NOW() |

**Why `mode` matters:** In strict mode, Claude's system prompt instructs it to stay on the work page and not help with unrelated homework until the page is done. In flexible mode, Claude opens with a nudge but then follows the student. Summer vacation → strict. School year → flexible.

**Completion %** is always computed at query time: `COUNT(*) FILTER (WHERE status = 'solved') * 100 / COUNT(*)`. Never stored — always accurate.

---

### Table: `exercises`

One row per exercise within a work page.

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL` PK | |
| `page_id` | `INTEGER` FK → `work_pages.id` | |
| `order_index` | `INTEGER` | Display and work-through order |
| `description` | `TEXT` | The exercise as written — e.g. "Solve: 48 × 23" or "Write 3 sentences about your summer using past tense" |
| `subject` | `VARCHAR(50)` | Usually same as page subject, but can differ for mixed pages |
| `difficulty` | `VARCHAR(20)` | `easy` / `medium` / `hard` — helps Claude calibrate scaffolding |
| `status` | `VARCHAR(20)` | `pending` / `attempted` / `solved` / `skipped` |
| `attempts` | `JSONB` | Array of attempt records: `{ date, outcome, notes }`. Same cap-at-10 pattern as vocab_words. |
| `solved_at` | `TIMESTAMPTZ` | When marked solved |
| `created_at` | `TIMESTAMPTZ` | Default NOW() |

**Status flow:** `pending` → `attempted` (student tried but didn't solve) → `solved` or `skipped` (parent/Claude explicitly skips). `skipped` counts as done for completion %.

---

## Parent Authentication

The existing PIN screen is reused. No new UI component needed.

- **Student PIN** (`APP_PIN` env var) → student picker → normal student flow
- **Parent PIN** (`PARENT_PIN` env var) → parent dashboard

Both PINs are checked against the entered value. If neither matches, the existing "wrong PIN" error shows. Students don't know the parent option exists.

Backend: the existing PIN middleware checks `x-app-pin` header. Parent API routes use a separate `x-parent-pin` header checked against `PARENT_PIN`.

---

## Parent Dashboard UI

A new top-level screen, shown when parent PIN is entered. Minimal — this is a planning tool, not a student-facing product.

```
Parent Dashboard
├── [Lielle] ──── 1 active page (67% complete)
│     └── [Plan New Page] [View Pages]
└── [Agam] ────── 1 active page (25% complete)
      └── [Plan New Page] [View Pages]
```

### Planning Chat

When Amir clicks "Plan New Page" for a student, a chat opens with a different system prompt: Claude acts as a teaching assistant helping Amir plan exercises, not as a tutor to the student. Once they agree on the exercises, a "Lock Page" button appears. Clicking it saves the page and exercises to the DB.

### View Pages

Lists all work pages for the student (active first, then completed). Shows title, subject, mode, due date, and completion %. Allows unlocking an active page to edit it (sets `locked_at = null`, status back to `draft`).

---

## How ClaudeTeacher Uses Work Pages

### On student session start

After loading prior sessions and proactive documents, the backend also checks for active work pages:

```sql
SELECT wp.id, wp.title, wp.subject, wp.mode, wp.due_date,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE e.status = 'solved' OR e.status = 'skipped') AS done,
       json_agg(e ORDER BY e.order_index) FILTER (WHERE e.status = 'pending' OR e.status = 'attempted') AS pending_exercises
FROM work_pages wp
JOIN exercises e ON e.page_id = wp.id
WHERE wp.student_id = $1 AND wp.status = 'active'
GROUP BY wp.id
ORDER BY wp.created_at ASC
LIMIT 1
```

If a page exists, its context is injected into the system prompt:

**Strict mode:**
```
WORK PAGE (strict — do not help with other topics until this is complete):
Title: Long multiplication practice — week 1. Subject: math. 6/8 exercises done.
Next exercise: "Solve: 48 × 23" (medium difficulty).
Do not move on to other subjects or homework until all exercises are solved. If the student asks about something else, acknowledge briefly and redirect to the work page.
```

**Flexible mode:**
```
WORK PAGE (flexible — remind the student, then follow her lead):
Title: Reading comprehension — week 2. Subject: english. 2/5 exercises done.
Next exercise: "Read the paragraph and answer: what is the main idea?" (hard difficulty).
Open with a brief mention of this work page, then follow the student's lead if she wants to work on something else.
```

### Marking exercises as solved

When Claude determines a student has correctly solved an exercise, it calls a `mark_exercise` tool (similar to `save_document`). The backend updates the exercise status and checks if the page is now complete.

---

## API Endpoints

### Parent endpoints (require `x-parent-pin` header)

- `GET /api/parent/students` — list students with active page summaries
- `GET /api/parent/pages/:studentId` — list all work pages for a student
- `POST /api/parent/pages` — create a new draft work page
- `PUT /api/parent/pages/:id` — update page (title, mode, due_date, status)
- `POST /api/parent/exercises` — add an exercise to a draft page
- `PUT /api/parent/exercises/:id` — edit an exercise
- `POST /api/parent/lock/:pageId` — lock a page (draft → active)
- `POST /api/parent/unlock/:pageId` — unlock a page (active → draft)
- `POST /api/parent/chat` — planning chat with Claude (separate from student chat)

### Student-side (existing `/api/chat`)

- The `mark_exercise` tool is added to the student chat alongside `save_document`.

---

## Priority in Proactive Context

Work pages slot into the existing proactive priority chain:

1. Unreviewed documents (as today)
2. **Active work page — strict mode** ← new, highest student priority
3. **Active work page — flexible mode** ← new
4. Struggling topic from documents
5. Not-assessed topic
6. Needs-practice topic

---

## Out of Scope

- Students seeing the work page list in the UI — they experience it through Claude's behavior, not a visual list
- Multiple simultaneous active pages per student — one active page at a time keeps it focused
- Amir adding exercises during an active page — unlock first, then edit
- Parent chat history saved to DB (planning chats are ephemeral for now)

---

## Success Criteria

- **SC-001**: Amir can enter parent PIN and reach the parent dashboard without students being able to access it.
- **SC-002**: Amir can plan a work page via chat and lock it. The page and exercises appear in the DB.
- **SC-003**: When Agam opens the app and a strict work page is active, Claude opens with the first unsolved exercise — not a generic greeting.
- **SC-004**: When Agam solves an exercise, the exercise status updates to `solved` in the DB.
- **SC-005**: When all exercises are solved, the work page status updates to `completed`.
- **SC-006**: In strict mode, Claude redirects off-topic questions back to the work page.
- **SC-007**: In flexible mode, Claude mentions the work page but follows the student if she redirects.
- **SC-008**: Completion % shown in parent dashboard is always accurate (computed, not stored).
