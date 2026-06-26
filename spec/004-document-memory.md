# Feature Specification: Document Memory

**Feature Branch**: `004-document-memory`
**Created**: 2026-06-26
**Status**: Draft

---

## Background & Motivation

When a student uploads a homework photo or test scan, Claude can see and analyze it — but the image is ephemeral. Once the API call ends, the image is gone. Claude has no memory that the document ever existed.

This feature gives Claude a persistent memory of every educational document it sees. When Claude processes an image and judges it to be educationally significant (a test, worksheet, exercise page, or study material), it saves a structured record: what the document was, what subjects it covered, and how well the student performed on each topic.

Over time this builds a longitudinal academic profile per student — not just vocabulary, but the full picture across all subjects. Claude can then be proactive: *"I see you got a new math test two days ago — want to go over it?"* instead of waiting for the student to bring it up.

A secondary benefit: Amir can upload a high-quality photo from his own phone when Agam's camera is blurry. The insights are saved permanently, so it doesn't matter which device took the photo.

---

## User Scenarios

### Story 1 — Claude Saves a Test (P1)

Amir uploads a photo of Agam's math test. Claude analyzes it, identifies it as a test, extracts the score, and saves a structured record with per-topic performance.

**Acceptance Scenarios:**

1. **Given** an image is uploaded and Claude identifies it as a test, **When** Claude responds, **Then** a document row is saved with type, subject, score, and description.
2. **Given** a test covers multiple topics, **When** Claude saves the document, **Then** one `document_subjects` row is saved per topic with a performance rating.
3. **Given** an image is not educational (e.g. a random photo), **When** Claude responds, **Then** nothing is saved to `documents`.
4. **Given** Claude cannot read the score clearly, **When** saving, **Then** `score` is left null rather than guessing.

---

### Story 2 — Claude Mentions an Unreviewed Document (P1)

Agam opens the chat two days after Amir uploaded her math test. Claude proactively brings it up at the start of the session.

**Acceptance Scenarios:**

1. **Given** there are unreviewed documents for the student, **When** a new session starts, **Then** Claude receives a summary of those documents in its context and brings them up naturally.
2. **Given** Claude mentions an unreviewed document during a session, **When** the session ends (or the document is acknowledged), **Then** `is_reviewed` is set to true so it is not repeated.
3. **Given** the student says she wants to work on something else, **When** she redirects the conversation, **Then** Claude follows her lead (the proactive mention is one-time, not forced).
4. **Given** there are no unreviewed documents, **When** a session starts, **Then** Claude behaves normally with no proactive mention.

---

### Story 3 — Parent Sees Academic Overview (P2)

Amir queries the database to see which subjects each daughter struggles with most, across all uploaded documents.

**Acceptance Scenarios:**

1. **Given** multiple documents have been saved, **When** Amir queries `document_subjects` grouped by topic and performance, **Then** he sees a clear picture of which topics are strong vs. struggling.
2. **Given** a test was uploaded, **When** Amir queries `documents`, **Then** he sees the score, subject, date, and type.

---

### Story 4 — Study Material Logged (P2)

Agam uploads a page from her history textbook. Claude saves it as a reference with `not_assessed` performance since there's no grade to evaluate.

**Acceptance Scenarios:**

1. **Given** the uploaded image is a textbook page or study sheet, **When** Claude processes it, **Then** it is saved with type `textbook_page` and performance `not_assessed`.
2. **Given** a study page was logged, **When** the next session starts, **Then** Claude can reference it: *"I see you've been studying the French Revolution — want to talk about it?"*

---

## Data Model

### Table: `documents`

One row per uploaded educational document. Claude decides whether to create this row.

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL` PK | |
| `student_id` | `VARCHAR(50)` FK → `students.id` | |
| `session_id` | `UUID` FK → `sessions.id` | The session where the image was uploaded |
| `type` | `VARCHAR(30)` | `test` / `exercise_page` / `textbook_page` / `worksheet` / `other` |
| `subject` | `VARCHAR(50)` | Main subject: `math` / `english` / `history` / `science` / `other` |
| `description` | `TEXT` | Claude's summary of what it saw — 2-4 sentences |
| `score` | `VARCHAR(20)` | Nullable. Raw score as seen on paper: `"77%"`, `"18/20"`, `"6/10"`. String because formats vary. |
| `is_reviewed` | `BOOLEAN` | Default `false`. Set to `true` after Claude proactively mentions it to the student. |
| `uploaded_at` | `TIMESTAMPTZ` | Default `NOW()` |

**Why `score` as VARCHAR:** Scores appear in many formats on Israeli school papers (%, fractions, points). Storing as-seen avoids lossy normalization and lets Claude quote the exact number naturally.

---

### Table: `document_subjects`

One row per topic per document. A math test covering multiplication, division, and fractions → 3 rows.

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL` PK | |
| `document_id` | `INTEGER` FK → `documents.id` | |
| `topic` | `VARCHAR(100)` | Specific topic within the subject: `"long multiplication"`, `"fractions"`, `"French Revolution"` |
| `performance` | `VARCHAR(20)` | `strong` / `needs_practice` / `struggling` / `not_assessed` |
| `notes` | `TEXT` | Claude's brief observation: `"Got all correct"`, `"3 mistakes in carry operations"` |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` |

**Performance definitions:**
- `strong` — student got this right with no or minimal errors
- `needs_practice` — student showed understanding but made some mistakes
- `struggling` — student made many mistakes or showed fundamental gaps
- `not_assessed` — document didn't include a grade or attempt for this topic (e.g. a study page)

---

## How Claude Saves a Document

Claude uses **tool use** to save documents — same pattern as the vocabulary game. After processing an educational image, Claude is offered a `save_document` tool. It calls the tool only when the image is worth saving; for non-educational images it does not call the tool at all.

### Tool schema

```json
{
  "name": "save_document",
  "description": "Save a record of an educational document you just analyzed from an image",
  "input_schema": {
    "type": "object",
    "properties": {
      "is_educational": {
        "type": "boolean",
        "description": "True if this image contains educational content worth saving. False for non-educational images."
      },
      "type": {
        "type": "string",
        "enum": ["test", "exercise_page", "textbook_page", "worksheet", "other"]
      },
      "subject": {
        "type": "string",
        "enum": ["math", "english", "history", "science", "other"]
      },
      "description": {
        "type": "string",
        "description": "2-4 sentence summary of what you saw in the document"
      },
      "score": {
        "type": "string",
        "description": "The score or grade as written on the paper (e.g. '77%', '18/20'). Omit if not visible."
      },
      "topics": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "topic":       { "type": "string" },
            "performance": { "type": "string", "enum": ["strong", "needs_practice", "struggling", "not_assessed"] },
            "notes":       { "type": "string" }
          },
          "required": ["topic", "performance"]
        }
      }
    },
    "required": ["is_educational"]
  }
}
```

### When the tool is offered

The tool is only offered when the request includes image content. On text-only messages, the tool is not in the tools list — no overhead.

### Flow

1. User uploads image(s) → backend detects `files` in request
2. Backend adds `save_document` to the tools list for this call (alongside the normal `allow_any` tool_choice, meaning Claude can call it or not — `tool_choice: { type: "auto" }`)
3. If Claude calls the tool: backend saves `documents` + `document_subjects` rows, then continues with a follow-up message using Claude's text response
4. If Claude doesn't call the tool: nothing saved, conversation continues normally

**Important:** Claude still produces a normal text response for the student. The tool call is a side effect, not the response. This requires handling the case where Claude calls a tool AND returns text — use `tool_choice: auto` and extract both the text content and any tool call from `response.content`.

---

## Proactive Mentions

On every new session start (first message), the backend checks for unreviewed documents:

```sql
SELECT d.type, d.subject, d.score, d.description, d.uploaded_at,
       json_agg(json_build_object('topic', ds.topic, 'performance', ds.performance, 'notes', ds.notes)) AS topics
FROM documents d
LEFT JOIN document_subjects ds ON ds.document_id = d.id
WHERE d.student_id = $1 AND d.is_reviewed = false
GROUP BY d.id
ORDER BY d.uploaded_at DESC
LIMIT 3
```

If rows are returned, a context block is prepended to the system prompt for this session only:

```
UNREVIEWED DOCUMENTS (mention these naturally at the start of the conversation):
- Math test uploaded 2 days ago. Score: 77%. Topics: long multiplication (needs_practice), fractions (struggling), addition (strong).
- Exercise page uploaded 5 days ago. Subject: English.
```

After the student acknowledges or Claude mentions a document, the backend marks it reviewed:
```sql
UPDATE documents SET is_reviewed = true WHERE id = $1
```

This requires a new endpoint: `POST /api/documents/mark-reviewed` — called by the frontend when Claude's response includes a reference to a specific document (or simply after the first session where it was mentioned).

Simpler alternative: mark all unreviewed documents as reviewed automatically after the session's first response. The student has been told; that's enough.

---

## Architecture

### New files
- `backend/routes/documents.js` — `POST /api/documents/mark-reviewed`

### Modified files
- `backend/db.js` — add `documents` and `document_subjects` tables to `initSchema()`
- `backend/routes/chat.js` — add `save_document` tool when files are present; inject unreviewed docs on first message; mark reviewed after first response

### No frontend changes needed
The save happens transparently. Proactive mentions come through Claude's normal text response. The student sees no difference in the UI.

---

## Out of Scope

- Parent dashboard UI — DBeaver is sufficient for now
- Editing or deleting saved documents
- Linking a document to a vocab game session
- OCR or structured extraction of specific questions — Claude's summary is enough
- Automatic test-prep word injection from a document (future: if Claude saves a test, it could add vocabulary words automatically)

---

## Success Criteria

- **SC-001**: When Amir uploads a math test, a `documents` row and at least one `document_subjects` row are saved correctly.
- **SC-002**: When Agam starts a new chat session after an unreviewed document exists, Claude proactively mentions it in the first response.
- **SC-003**: After Claude mentions a document, `is_reviewed` is set to `true` and the document does not appear again in the next session.
- **SC-004**: When a non-educational image is uploaded (e.g. a selfie), nothing is saved to `documents`.
- **SC-005**: The chat response to the student is unaffected — tool use is invisible to her.
- **SC-006**: Amir can query `document_subjects` to see a per-topic performance history across all uploaded documents.
