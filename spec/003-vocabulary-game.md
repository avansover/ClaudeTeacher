# Feature Specification: Vocabulary Game

**Feature Branch**: `003-vocabulary-game`
**Created**: 2026-06-13
**Status**: Draft

---

## Background & Motivation

Lielle (11) and Agam (9.5) have a significant English vocabulary gap — a result of disrupted schooling during COVID and wartime. The regular homework chat uses the Socratic method, which breaks down when the student doesn't have enough base vocabulary to benefit from contextual hints.

This feature adds a dedicated vocabulary game that:
- Builds vocabulary through active recall (not passive recognition)
- Tracks every word each student has encountered and how well she knows it
- Lets Claude make smart decisions about which words to practice based on history
- Supports test-prep mode — student can add words from an upcoming test and give them priority
- Is completely separate from the homework chat — its own UI, its own API, its own DB tables

---

## User Scenarios

### Story 1 — Regular Vocabulary Session (Priority: P1)

Lielle opens ClaudeTeacher, clicks "Vocabulary Game", and starts a round. Claude picks 10 words — 8 from her weak or overdue words, 2 it decides freely based on her grade level. She works through them one by one: tries to recall, asks for a hint if stuck, falls back to multiple choice if needed. At the end she sees her score and how it compares to her rolling average.

**Why this priority**: Core feature — nothing else works without this.

**Acceptance Scenarios**:

1. **Given** a student opens the game, **When** a round starts, **Then** Claude selects 10 words using the 8+2 strategy and the round begins.
2. **Given** a word is presented, **When** the student types her answer, **Then** Claude evaluates leniently (synonyms and close answers count) and awards full points for correct recall.
3. **Given** a student is stuck, **When** she requests a hint, **Then** Claude provides a sentence with the word in context and the score cap for that word drops to 75%.
4. **Given** a student is still stuck after a hint, **When** she requests multiple choice, **Then** Claude provides 4 Hebrew options and the score cap drops to 50%.
5. **Given** a round is complete, **When** the score is shown, **Then** it displays: round score, rolling average of last 10 games, and a breakdown per word.

---

### Story 2 — Test Prep Mode (Priority: P2)

Lielle has a vocabulary test on Thursday. She tells Claude "I have a test, here are my words: [list]". Claude adds those words to her word table with high priority. For the next few sessions those words appear in every round until the test date passes or she marks them as done.

**Why this priority**: This is the feature that will make her actually open the app before a test. High real-world value.

**Acceptance Scenarios**:

1. **Given** a student submits a list of words for an upcoming test, **When** Claude processes them, **Then** those words are added to her word table with `priority: test` and appear in every round until cleared.
2. **Given** test-prep words exist, **When** a round starts, **Then** test-prep words fill slots before the regular 8+2 selection.
3. **Given** a student wants to lower priority on a word, **When** she tells Claude, **Then** the priority is updated and the word returns to normal rotation.
4. **Given** a test has passed, **When** the student says so, **Then** all test-prep words are demoted back to normal priority.

---

### Story 3 — Claude Makes Smart Word Choices (Priority: P1)

Claude doesn't pick words randomly. It looks at each word's attempt history — how recently it was practiced, whether she recalled it, needed a hint, used multiple choice, or failed — and picks the words that need the most attention.

**Acceptance Scenarios**:

1. **Given** a word was failed or answered via multiple choice in the last session, **When** a new round starts, **Then** that word is prioritized in the 8-slot selection.
2. **Given** a word hasn't been practiced in over 7 days, **When** a new round starts, **Then** it is treated as overdue and prioritized.
3. **Given** a word has been recalled correctly 3 sessions in a row, **When** a new round starts, **Then** its priority is lowered — it moves to the back of the queue.
4. **Given** Claude adds 2 free-choice words, **When** selecting them, **Then** it picks words appropriate for the student's grade level — common, useful words, not obscure or technical vocabulary.

---

### Story 4 — Parent Views Progress (Priority: P3)

Amir connects DBeaver and can see each girl's word table — which words they know, which they struggle with, when they last practiced, and their rolling game average.

**Acceptance Scenarios**:

1. **Given** a completed game session, **When** Amir queries the `vocab_words` table, **Then** he sees each word with its full attempt history.
2. **Given** multiple game sessions, **When** Amir queries `vocab_games`, **Then** he sees the last 10 scores per student with timestamps.

---

## Data Model

### Table: `vocab_words`

One row per word per student. This is the core of the feature — Claude reads this table to decide which words to pick, and writes to it after every attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL` PK | |
| `student_id` | `VARCHAR(50)` FK → `students.id` | |
| `word` | `VARCHAR(100)` | The English word |
| `translation` | `VARCHAR(200)` | Correct Hebrew translation(s) — comma separated if multiple valid answers |
| `priority` | `VARCHAR(20)` | `normal` / `test` — test words appear in every round |
| `attempts` | `JSONB` | Array of last 10 attempts. Each attempt: `{ date, result }` where result is `recall` / `hint` / `multiple` / `failed` |
| `last_practiced` | `TIMESTAMPTZ` | Updated after every attempt — used to detect overdue words |
| `added_by` | `VARCHAR(20)` | `claude` / `student` — tracks whether Claude added it or the student added it for a test |
| `created_at` | `TIMESTAMPTZ` | |

**Why JSONB for attempts:** The attempt history is always read and written as a whole array (last 10). Storing it as JSONB avoids a separate `vocab_attempts` table and a JOIN on every word fetch. 10 attempts per word is small enough that this is never a performance concern.

**Why cap at 10 attempts:** Older attempts are not useful for scheduling decisions. Keeping only the last 10 saves space and keeps the data fresh. When a new attempt is added, the oldest is dropped.

---

### Table: `vocab_games`

One row per completed game session. Stores the score so the rolling average can be calculated.

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL` PK | |
| `student_id` | `VARCHAR(50)` FK → `students.id` | |
| `score` | `INTEGER` | 0–100, percentage score for this game |
| `word_count` | `INTEGER` | Number of words in the round (normally 10) |
| `played_at` | `TIMESTAMPTZ` | |

**Rolling average:** Always calculated from the last 10 rows for a student. Old rows beyond 10 are deleted after each game to keep the table small. The average is computed at query time — no stored field needed.

---

## Scoring Rules

| How she answered | Points awarded |
|---|---|
| Correct on first recall | 10 |
| Correct after hint | 8 |
| Correct after multiple choice | 5 |
| Wrong / skipped | 0 |

**Streak bonus:** 3 correct recalls in a row within a single round awards +2 bonus points on the next word (capped at 10). Resets on any non-recall answer.

**Round score:** Sum of points earned. Maximum possible is 100 (10 words × 10 points).

**Rolling average:** Mean of scores from last 10 completed games, expressed as 0–100.

---

## Word Ranks

Each word in `vocab_words` has a `rank` (1, 2, or 3):

- **Rank 1** — Basic vocabulary: colors, animals, food, body parts, numbers, family, simple verbs, basic adjectives, common places. First 2 years of English.
- **Rank 2** — Everyday vocabulary: school subjects, emotions, weather, more complex verbs, common adjectives.
- **Rank 3** — Grade-level vocabulary: more abstract, less common words appropriate for the student's school grade.

---

## Word Selection Strategy

Each round is 10 words. The split between ranks is determined by the student's mastery of each rank.

**Mastery** = percentage of words practiced at least once where the last attempt was `recall`, calculated per rank.

### Rank unlock conditions

Before a higher rank can appear, two conditions must both be true:

| Unlock | Min words practiced | Min mastery |
|---|---|---|
| Rank-1 → Rank-2 | 75 rank-1 words | 80% |
| Rank-2 → Rank-3 | 75 rank-2 words | 80% |

The word count threshold (75) ensures the student has a broad enough vocabulary base before harder words are introduced. A student who practiced only 10 words at 100% mastery is not ready for rank-2.

### Rank slot formula

```
rank2Unlocked = rank1Practiced >= 75 AND rank1Mastery >= 80%
rank3Unlocked = rank2Practiced >= 75 AND rank2Mastery >= 80%

rank2Slots = rank2Unlocked ? clamp(floor((rank1Mastery - 75) / 5), 0, 5) : 0
rank3Slots = rank3Unlocked ? floor(rank2Mastery / 100 × rank2Slots) : 0
rank1Slots = 10 - rank2Slots - rank3Slots
```

| rank1Mastery | rank2Mastery | rank-1 | rank-2 | rank-3 |
|---|---|---|---|---|
| < 80% | any | 10 | 0 | 0 |
| 80% | 0% | 9 | 1 | 0 |
| 85% | 0% | 8 | 2 | 0 |
| 90% | 0% | 7 | 3 | 0 |
| 95% | 0% | 6 | 4 | 0 |
| 100% | 0% | 5 | 5 | 0 |
| 100% | 50% | 3 | 5 | 2 |
| 100% | 100% | 0 | 5 | 5 |

Once rank-1 is fully replaced by rank-3, it means rank-1 is mastered — no floor enforced.

### Within each rank, word priority order

1. **Test-prep words** (`priority = 'test'`) — always fill first
2. **Failed or multiple-choice in last attempt** — highest need
3. **Not practiced in 7+ days** — overdue
4. **Hint/multiple in recent attempts** — needs strengthening
5. **Remaining known words** — weakest first

If slots remain unfilled after known words, Claude introduces new words at that rank.

If the student has fewer known words than slots require, Claude fills with new words at the appropriate rank.

---

## Architecture

### Separate from the chat

The vocabulary game is a completely separate flow:
- **New UI route:** "Vocabulary Game" button on the chat header (or student picker screen)
- **New API endpoint:** `POST /api/vocab/start` — starts a round, returns 10 words
- **New API endpoint:** `POST /api/vocab/answer` — submits an answer, returns evaluation + next state
- **New API endpoint:** `POST /api/vocab/complete` — saves game score, updates word attempts

Claude is used for:
- Evaluating free-text recall answers (lenient matching — synonyms count)
- Generating the multiple choice options (3 wrong + 1 right, plausible distractors)
- Selecting the 2 free-choice words based on grade level and profile
- Processing test-prep word lists submitted in natural language

Claude is **not** used for:
- Tracking scores — pure DB logic

**Hint generation rules:** When a student requests a hint, Claude generates a context sentence on the spot. The sentence must follow strict constraints:
- Use only simple, common words the student is likely to already know
- The sentence should make the meaning guessable from context alone
- Never use a word harder than the word being tested
- Keep it short — one sentence, max 10 words
- Bad hint: *"Interpolate how many cakes are needed to solve starvation in Africa"*
- Good hint: *"She wanted to eat the sweet cake at the party"*

### Word introduction flow

When Claude introduces a new word (free-choice slot), it:
1. Picks the word based on grade level
2. Writes a `vocab_words` row with the word, translation, and `added_by: 'claude'`
3. Presents it to the student as a "new word" round — shows it with translation first, then tests it at the end of the session

---

## UI Flow

```
Student Picker
    └── [Chat] button  →  ChatWindow (existing)
    └── [Vocabulary Game] button  →  VocabGame

VocabGame
    ├── Round in progress
    │     ├── Show English word
    │     ├── Student types Hebrew answer
    │     ├── [Hint] button → show context sentence, cap at 75%
    │     ├── [Multiple Choice] button → show 4 options, cap at 50%
    │     └── Feedback → next word
    └── Round complete
          ├── Score this round
          ├── Rolling average
          └── Word breakdown (recall / hint / multiple / failed per word)
```

---

## Out of Scope for This Feature

- Audio pronunciation
- English → Hebrew and Hebrew → English (both directions) — start with English → Hebrew only
- Leaderboard between sisters — fun idea, later
- Parent dashboard UI — DBeaver is sufficient for now
- Spaced repetition algorithm (SM-2 etc.) — the 8+2 heuristic is good enough for now; can upgrade later if needed

---

## Success Criteria

- **SC-001**: A complete round of 10 words can be played from start to finish with scores saved correctly.
- **SC-002**: Words failed in round N appear in round N+1.
- **SC-003**: Test-prep words added via natural language appear in the next round with `priority = 'test'`.
- **SC-004**: Rolling average updates correctly after each completed game and old games beyond 10 are discarded.
- **SC-005**: Claude's free-choice words are appropriate for a 6th grader (Lielle) or 4th grader (Agam) — no obscure or technical vocabulary.
- **SC-006**: The vocabulary game is fully accessible without touching the homework chat.
- **SC-007**: Rank-2 words do not appear until the student has practiced at least 75 rank-1 words at 80%+ mastery.
- **SC-008**: Word rank is visible to the student during the game and in the results screen (Level 1 / Level 2 / Level 3 badge).
