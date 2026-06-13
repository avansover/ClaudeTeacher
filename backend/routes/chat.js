import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STUDENTS = {
  lielle: {
    name: 'Lielle',
    profileFile: 'daughter1.json',
    promptFile: 'core_lielle.txt',
  },
  agam: {
    name: 'Agam',
    profileFile: 'daughter2.json',
    promptFile: 'core_agam.txt',
  },
};

function profilePath(file) {
  return path.join(__dirname, '..', 'profiles', file);
}

function promptPath(file) {
  return path.join(__dirname, '..', 'prompts', file);
}

function loadProfile(file) {
  return JSON.parse(fs.readFileSync(profilePath(file), 'utf-8'));
}

function saveProfile(file, profile) {
  profile.last_updated = new Date().toISOString();
  fs.writeFileSync(profilePath(file), JSON.stringify(profile, null, 2));
}

function buildSystemPrompt(promptFile, profile) {
  const core = fs.readFileSync(promptPath(promptFile), 'utf-8')
    .replace('{{STUDENT_NAME}}', profile.name);

  const profileSection = `
STUDENT PROFILE (you may update this as you learn more about the student):
- Name: ${profile.name}
- Subjects she struggles with: ${profile.subjects_struggling.length ? profile.subjects_struggling.join(', ') : 'none noted yet'}
- Learning style observations: ${profile.learning_style || 'none noted yet'}
- Progress notes: ${profile.progress_notes.length ? profile.progress_notes.join(' | ') : 'none yet'}

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

// POST /api/chat
// Body: { studentId, messages, files? }
router.post('/', async (req, res) => {
  const { studentId, messages, files } = req.body;

  const student = STUDENTS[studentId];
  if (!student) {
    return res.status(400).json({ error: 'Invalid student.' });
  }

  try {
    const profile = loadProfile(student.profileFile);
    const systemPrompt = buildSystemPrompt(student.promptFile, profile);

    let anthropicMessages = messages.slice(-20);
    if (files && files.length > 0) {
      const lastMsg = anthropicMessages[anthropicMessages.length - 1];
      const contentParts = [];

      for (const file of files) {
        if (file.type === 'image') {
          contentParts.push({
            type: 'image',
            source: { type: 'base64', media_type: file.mediaType, data: file.data },
          });
        } else if (file.type === 'pdf') {
          contentParts.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: file.data },
          });
        }
      }

      contentParts.push({ type: 'text', text: lastMsg.content });
      anthropicMessages[anthropicMessages.length - 1] = {
        role: 'user',
        content: contentParts,
      };
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const rawText = response.content[0].text;
    const { cleanText, update } = extractProfileUpdate(rawText);

    if (update) {
      const updatedProfile = { ...profile, ...update };
      saveProfile(student.profileFile, updatedProfile);
    }

    res.json({ message: cleanText });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
