# ClaudeTeacher — Plan B Deployment Spec

**Status:** Approved  
**Date:** 2026-06-12

---

## Goal

Move ClaudeTeacher from "runs locally on a single PC" to "always-on server with a desktop shortcut that any family PC can open."

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | Railway | Auto-deploy from GitHub, simple env vars, good free tier |
| Instances | One deployment | No reason to pay double or maintain two |
| Student separation | Splash screen picker | Kid-friendly, one URL, no routing confusion |
| Profile storage | JSON files on server | Same as current, simplest migration |
| Frontend delivery | Served statically by Express | No separate Vite dev server in production |

---

## How It Works

```
[Railway Server]
  └── Express (one process)
        ├── Serves built React frontend (static)
        ├── POST /api/chat?student=lielle  → loads core_lielle.txt + daughter1.json
        └── POST /api/chat?student=agam   → loads core_agam.txt + daughter2.json

[Desktop shortcut on any PC]
  └── .url file → opens https://claudeteacher.up.railway.app in browser
```

---

## User Flow

1. Girl double-clicks desktop icon → browser opens to the app
2. Splash screen: two big buttons — **Lielle** and **Agam**
3. She taps her name → enters her chat session
4. All API calls include `studentId` so the backend loads the right profile and prompt
5. "Back" button on the chat screen returns to the splash (in case wrong name was picked)

---

## What Changes in the Code

### Backend
- `chat.js` — accept `studentId` in request body, use it to select profile file and prompt file
- `server.js` — serve `frontend/dist` as static files
- Remove hardcoded `STUDENT_NAME` / `PROFILE_FILE` / `CORE_PROMPT_FILE` env vars (replaced by `studentId` per request)
- Keep `ANTHROPIC_API_KEY` as the only required env var on Railway

### Frontend
- New `StudentPicker` component — splash screen with two buttons
- `App.jsx` — show picker first, pass selected student into `ChatWindow`
- `ChatWindow.jsx` — send `studentId` with every API request, show back button
- `VITE_API_URL` env var stays for pointing at Railway vs localhost

### Deployment
- `npm run build` in frontend → outputs to `frontend/dist`
- Express serves `frontend/dist` as static
- Railway deploys from GitHub main branch on every push

### Desktop shortcut
- A `.url` file (Windows internet shortcut) pointing to the Railway URL
- One file to copy to any PC — no Node, no npm, no terminal

---

## Profile persistence risk

Railway resets the filesystem on every redeploy — JSON files will be wiped.

**Accepted for now.** Profiles are soft data (learning style notes, progress observations). Losing them occasionally is tolerable. Migration to a DB is the right fix and will happen when nightly summaries are added (they need a DB anyway).

---

## Out of scope (this phase)

- Conversation logging
- Nightly summaries
- Authentication / PIN protection
- Database

---

## Implementation order

1. Refactor backend to accept `studentId` per request  
2. Add static file serving to Express  
3. Build `StudentPicker` splash screen  
4. Wire `studentId` through `ChatWindow`  
5. Test locally end-to-end  
6. Deploy to Railway  
7. Create desktop shortcut file  
