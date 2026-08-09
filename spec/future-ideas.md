# Future Ideas

Deferred features and improvements — not scheduled, just captured so they aren't lost.

---

## Parent vocabulary chat (discuss, not just add)

**Came up while building**: parent-added vocabulary words (see `parent.js` — `/vocab/classify`, `/vocab/add`, `/vocab/:studentId`, and `ParentVocabWords.jsx`).

The current flow is one-shot: parent types a word or list, Claude classifies (translation + rank), parent reviews/edits, saves. That covers "just add this word."

The deferred idea is a real back-and-forth chat for cases where the parent wants to *discuss* a word before deciding, e.g.:

> Parent: "Is 'stubborn' too hard for Agam?"
> Claude: "It's borderline — she's mastered most rank-1 words but hasn't unlocked rank-2 yet. I'd suggest holding off, or adding it now as a test-prep word if it's for something specific."
> Parent: "It's for her test Thursday, add it."
> Claude: adds it with `priority: test`.

**Why deferred**: strictly more work than the one-shot form (a full chat UI, session state, multi-turn context) and the one-shot flow already covers the described use case (parent adds words, Claude determines difficulty). Worth building only if it turns out parents actually want to discuss words rather than just add them.

**If built**: mirror `ParentPlanChat.jsx` + the chat → lock pattern already used for work pages (`POST /api/parent/chat` → `POST /api/parent/pages/lock`) — same shape, a `classify_words`-style tool instead of `save_work_page`.

---

## Computer help for Lielle, no Socratic leading questions

Lielle got a new computer. When she asks Claude something about the computer itself (not homework), Claude should answer directly and helpfully — not apply the Socratic/leading-question method used for schoolwork. That method fits pedagogy, not "how do I connect to wifi."

**Likely implementation**: a carve-out in `backend/prompts/core_lielle.txt` (or `core.txt` if it should apply to both girls) — detect computer/tech questions and answer plainly instead of with guided questions.

Not yet implemented.
