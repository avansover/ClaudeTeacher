import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const STUDENT_DISPLAY = {
  lielle: { name: 'Lielle', emoji: '🌸', color: '#f4845f' },
  agam:   { name: 'Agam',   emoji: '⭐', color: '#6c9fdb' },
};

const STAGES = { RECALL: 'recall', HINT: 'hint', MULTIPLE: 'multiple', DONE: 'done' };

export default function VocabGame({ studentId, pin, onBack }) {
  const student = STUDENT_DISPLAY[studentId];
  const [phase, setPhase] = useState('loading'); // loading | playing | results
  const [words, setWords] = useState([]);
  const [current, setCurrent] = useState(0);
  const [stage, setStage] = useState(STAGES.RECALL);
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState(null);
  const [choices, setChoices] = useState(null);
  const [feedback, setFeedback] = useState(null); // { correct, message }
  const [results, setResults] = useState([]); // [{ wordId, word, translation, result }]
  const [score, setScore] = useState(null);
  const [average, setAverage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [streak, setStreak] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { startGame(); }, []);
  useEffect(() => {
    if (phase === 'playing' && !feedback) inputRef.current?.focus();
  }, [current, phase, feedback]);

  async function api(path, body) {
    const res = await fetch(`${API_URL}/api/vocab/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-pin': pin },
      body: JSON.stringify({ studentId, ...body }),
    });
    return res.json();
  }

  async function startGame() {
    setPhase('loading');
    const data = await api('start', {});
    if (data.error || !data.words?.length) { alert(data.error || 'Could not load words. Try again.'); onBack(); return; }
    setWords(data.words);
    setCurrent(0);
    setResults([]);
    setStage(STAGES.RECALL);
    setAnswer('');
    setHint(null);
    setChoices(null);
    setFeedback(null);
    setStreak(0);
    setPhase('playing');
  }

  async function submitRecall() {
    if (!answer.trim()) return;
    setBusy(true);
    const word = words[current];
    const data = await api('check', { word: word.word, translation: word.translation, answer });
    setBusy(false);

    if (data.correct) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      showFeedback(true, newStreak >= 3 ? '🔥 Streak bonus! +2' : '✅ Correct!', STAGES.RECALL);
    } else {
      setStreak(0);
      showFeedback(false, '❌ Not quite — try a hint?', null);
    }
  }

  async function requestHint() {
    setBusy(true);
    const word = words[current];
    const data = await api('hint', { word: word.word });
    setBusy(false);
    setHint(data.hint);
    setStage(STAGES.HINT);
    setAnswer('');
    setFeedback(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function submitHint() {
    if (!answer.trim()) return;
    setBusy(true);
    const word = words[current];
    const data = await api('check', { word: word.word, translation: word.translation, answer });
    setBusy(false);

    if (data.correct) {
      setStreak(0);
      showFeedback(true, '✅ Correct!', STAGES.HINT);
    } else {
      showFeedback(false, '❌ Not quite — try multiple choice?', null);
    }
  }

  async function requestMultiple() {
    setBusy(true);
    const word = words[current];
    const data = await api('choices', { word: word.word, translation: word.translation });
    setBusy(false);
    setChoices(data.choices);
    setStage(STAGES.MULTIPLE);
    setFeedback(null);
  }

  function submitChoice(choice) {
    const word = words[current];
    if (choice === word.translation) {
      setStreak(0);
      showFeedback(true, '✅ Correct!', STAGES.MULTIPLE);
    } else {
      showFeedback(false, `❌ The answer was: ${word.translation}`, STAGES.MULTIPLE, true);
    }
  }

  function showFeedback(correct, message, resultStage, force = false) {
    // If wrong and no stage yet, just show feedback without recording
    const finalStage = resultStage || (force ? STAGES.MULTIPLE : null);
    setFeedback({ correct, message, finalStage });
  }

  function recordAndNext(resultValue) {
    const word = words[current];
    setResults(prev => [...prev, { wordId: word.id, word: word.word, translation: word.translation, rank: word.rank, result: resultValue }]);

    const next = current + 1;
    if (next >= words.length) {
      finishGame([...results, { wordId: word.id, word: word.word, translation: word.translation, rank: word.rank, result: resultValue }]);
    } else {
      setCurrent(next);
      setStage(STAGES.RECALL);
      setAnswer('');
      setHint(null);
      setChoices(null);
      setFeedback(null);
    }
  }

  function skipWord() {
    recordAndNext('failed');
  }

  async function finishGame(finalResults) {
    setPhase('loading');
    const data = await api('complete', { results: finalResults });
    setScore(data.score);
    setAverage(data.average);
    setPhase('results');
  }

  function scoreColor(s) {
    if (s >= 80) return '#27ae60';
    if (s >= 50) return '#f39c12';
    return '#e74c3c';
  }

  function resultIcon(r) {
    if (r === 'recall')   return { icon: '🌟', label: 'Recalled!', color: '#27ae60' };
    if (r === 'hint')     return { icon: '💡', label: 'With hint', color: '#f39c12' };
    if (r === 'multiple') return { icon: '🔢', label: 'Multiple choice', color: '#3498db' };
    return { icon: '❌', label: 'Missed', color: '#e74c3c' };
  }

  function rankBadge(rank) {
    const styles = {
      1: { label: 'Level 1', bg: '#eafaf1', color: '#27ae60' },
      2: { label: 'Level 2', bg: '#fef9e7', color: '#f39c12' },
      3: { label: 'Level 3', bg: '#eaf2fb', color: '#2980b9' },
    };
    const s = styles[rank] || styles[1];
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px',
        borderRadius: 20, background: s.bg, color: s.color,
      }}>{s.label}</span>
    );
  }

  // ── Loading ──────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>🔤</div>
        <div style={{ fontSize: 18, color: 'var(--text-muted)' }}>Getting your words ready...</div>
      </div>
    );
  }

  // ── Results ──────────────────────────────────────────────────
  if (phase === 'results') {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: '32px 20px', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(score) }}>{score} / {words.length * 10}</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
            Rolling average: <strong style={{ color: scoreColor(average) }}>{average}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          {results.map((r, i) => {
            const { icon, label, color } = resultIcon(r.result);
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', background: 'var(--surface)',
                borderRadius: 12, borderLeft: `4px solid ${color}`,
              }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.word} {rankBadge(r.rank)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.translation}</div>
                </div>
                <div style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={startGame} style={{
            flex: 1, background: student.color, color: '#fff', border: 'none',
            borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>Play Again 🔄</button>
          <button onClick={onBack} style={{
            flex: 1, background: 'var(--surface)', color: 'var(--text)', border: '2px solid var(--border)',
            borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>Back 🏠</button>
        </div>
      </div>
    );
  }

  // ── Playing ──────────────────────────────────────────────────
  const word = words[current];
  const progress = current / words.length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 600, margin: '0 auto', width: '100%' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, opacity: 0.5 }}>←</button>
        <span style={{ fontSize: 22 }}>🔤</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Vocabulary Game</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{student.emoji} {student.name} · Word {current + 1} of {words.length}</div>
        </div>
        {streak >= 3 && <div style={{ fontSize: 13, color: '#f39c12', fontWeight: 700 }}>🔥 {streak} streak</div>}
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--border)' }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: student.color, transition: 'width 0.3s' }} />
      </div>

      {/* Word card */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div style={{ textAlign: 'center', padding: '32px 24px', background: 'var(--surface)', borderRadius: 20, border: `2px solid ${student.color}`, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>{rankBadge(word.rank)}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>What does this mean in Hebrew?</div>
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: 1 }}>{word.word}</div>
          {word.isNew && <div style={{ fontSize: 12, color: student.color, marginTop: 8, fontWeight: 600 }}>✨ New word!</div>}
        </div>

        {/* Hint sentence */}
        {hint && (
          <div style={{ padding: '16px 20px', background: 'var(--primary-light)', borderRadius: 14, borderLeft: `4px solid #f39c12` }}>
            <div style={{ fontSize: 12, color: '#f39c12', fontWeight: 700, marginBottom: 4 }}>💡 Hint</div>
            <div style={{ fontStyle: 'italic' }}>{hint}</div>
          </div>
        )}

        {/* Multiple choice */}
        {stage === STAGES.MULTIPLE && choices && !feedback && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Choose the correct translation:</div>
            {choices.map((c, i) => (
              <button key={i} onClick={() => submitChoice(c)} style={{
                padding: '14px', background: 'var(--surface)', border: '2px solid var(--border)',
                borderRadius: 12, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'center', direction: 'rtl',
              }}>{c}</button>
            ))}
          </div>
        )}

        {/* Text input for recall and hint stages */}
        {(stage === STAGES.RECALL || stage === STAGES.HINT) && !feedback && (
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              ref={inputRef}
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') stage === STAGES.RECALL ? submitRecall() : submitHint(); }}
              placeholder="Type in Hebrew..."
              disabled={busy}
              dir="rtl"
              style={{
                flex: 1, padding: '12px 16px', fontSize: 18, borderRadius: 12,
                border: '2px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
                textAlign: 'right',
              }}
            />
            <button
              onClick={stage === STAGES.RECALL ? submitRecall : submitHint}
              disabled={busy || !answer.trim()}
              style={{
                background: student.color, color: '#fff', border: 'none',
                borderRadius: 12, padding: '0 20px', fontSize: 20, cursor: 'pointer',
                opacity: busy || !answer.trim() ? 0.5 : 1,
              }}
            >➤</button>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div style={{ padding: '20px', background: feedback.correct ? '#eafaf1' : '#fdf2f2', borderRadius: 14, textAlign: 'center', border: `2px solid ${feedback.correct ? '#27ae60' : '#e74c3c'}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: feedback.correct ? '#27ae60' : '#e74c3c', marginBottom: 12 }}>
              {feedback.message}
            </div>
            {feedback.correct ? (
              <button onClick={() => recordAndNext(feedback.finalStage)} style={{
                background: student.color, color: '#fff', border: 'none',
                borderRadius: 12, padding: '12px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>Next word →</button>
            ) : (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {stage === STAGES.RECALL && (
                  <button onClick={requestHint} disabled={busy} style={{
                    background: '#f39c12', color: '#fff', border: 'none',
                    borderRadius: 12, padding: '10px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>💡 Get a hint</button>
                )}
                {(stage === STAGES.RECALL || stage === STAGES.HINT) && (
                  <button onClick={requestMultiple} disabled={busy} style={{
                    background: '#3498db', color: '#fff', border: 'none',
                    borderRadius: 12, padding: '10px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>🔢 Multiple choice</button>
                )}
                <button onClick={skipWord} disabled={busy} style={{
                  background: 'var(--surface)', color: 'var(--text-muted)', border: '2px solid var(--border)',
                  borderRadius: 12, padding: '10px 20px', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
                }}>Skip</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
