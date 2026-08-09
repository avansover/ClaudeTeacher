import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const RANK_LABELS = { 1: 'Rank 1', 2: 'Rank 2', 3: 'Rank 3' };
const RANK_COLORS = { 1: '#27ae60', 2: '#e67e22', 3: '#c0392b' };

export default function ParentVocabWords({ studentId, studentName, parentPin, onBack }) {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [proposed, setProposed] = useState(null); // words returned by /classify, editable before save
  const [classifying, setClassifying] = useState(false);
  const [saving, setSaving] = useState(false);

  const headers = { 'Content-Type': 'application/json', 'x-parent-pin': parentPin };

  async function loadWords() {
    setLoading(true);
    const res = await fetch(`${API}/api/parent/vocab/${studentId}`, { headers });
    const data = await res.json();
    setWords(data.words || []);
    setLoading(false);
  }

  useEffect(() => { loadWords(); }, [studentId]);

  async function classify() {
    const text = input.trim();
    if (!text) return;
    setClassifying(true);
    try {
      const res = await fetch(`${API}/api/parent/vocab/classify`, {
        method: 'POST', headers, body: JSON.stringify({ studentId, text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProposed(data.words);
    } catch (err) {
      alert('Could not classify: ' + err.message);
    } finally {
      setClassifying(false);
    }
  }

  function updateProposed(i, field, value) {
    setProposed(prev => prev.map((w, idx) => idx === i ? { ...w, [field]: value } : w));
  }

  function removeProposed(i) {
    setProposed(prev => prev.filter((_, idx) => idx !== i));
  }

  async function saveProposed() {
    if (!proposed?.length) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/parent/vocab/add`, {
        method: 'POST', headers, body: JSON.stringify({ studentId, words: proposed }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProposed(null);
      setInput('');
      loadWords();
    } catch (err) {
      alert('Could not save: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function lastResult(w) {
    const attempts = w.attempts || [];
    return attempts[attempts.length - 1]?.result || null;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, opacity: 0.5 }}>←</button>
        <span style={{ fontSize: 22 }}>📖</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{studentName}'s Vocabulary</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Type a word or list — Claude fills in translation & difficulty</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Add words */}
        {!proposed ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder='e.g. "stubborn, generous" or "words for her test Thursday: photosynthesis, ecosystem"'
              rows={2}
              disabled={classifying}
              style={{
                flex: 1, resize: 'none', border: '1.5px solid var(--border)', borderRadius: 12,
                padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
                outline: 'none', background: 'var(--bg)', color: 'var(--text)',
              }}
            />
            <button
              onClick={classify}
              disabled={classifying || !input.trim()}
              style={{
                background: 'var(--primary)', color: '#fff', border: 'none',
                borderRadius: 12, padding: '0 18px', fontSize: 13, fontWeight: 700,
                cursor: classifying || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: classifying || !input.trim() ? 0.5 : 1, flexShrink: 0, fontFamily: 'inherit',
              }}
            >
              {classifying ? '...' : '✨ Classify'}
            </button>
          </div>
        ) : (
          <div style={{
            background: 'var(--surface)', border: '2px solid var(--primary)', borderRadius: 12, padding: 14,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Review before saving:</div>
            {proposed.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input
                  value={w.word}
                  onChange={e => updateProposed(i, 'word', e.target.value)}
                  style={inputStyle(90)}
                />
                <input
                  value={w.translation}
                  onChange={e => updateProposed(i, 'translation', e.target.value)}
                  style={inputStyle(90)}
                  dir="rtl"
                />
                <select value={w.rank} onChange={e => updateProposed(i, 'rank', Number(e.target.value))} style={selectStyle}>
                  <option value={1}>Rank 1</option>
                  <option value={2}>Rank 2</option>
                  <option value={3}>Rank 3</option>
                </select>
                <select value={w.priority} onChange={e => updateProposed(i, 'priority', e.target.value)} style={selectStyle}>
                  <option value="normal">Normal</option>
                  <option value="test">Test-prep</option>
                </select>
                <button onClick={() => removeProposed(i)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 15 }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                onClick={saveProposed}
                disabled={saving || !proposed.length}
                style={{
                  background: '#27ae60', color: '#fff', border: 'none', borderRadius: 10,
                  padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving...' : `💾 Save ${proposed.length} word${proposed.length === 1 ? '' : 's'}`}
              </button>
              <button
                onClick={() => setProposed(null)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing words */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
            {loading ? 'Loading...' : `${words.length} word${words.length === 1 ? '' : 's'}`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {words.map(w => (
              <div key={w.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}>
                <span style={{ fontWeight: 700, minWidth: 90 }}>{w.word}</span>
                <span style={{ color: 'var(--text-muted)', minWidth: 80 }} dir="rtl">{w.translation}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: '#fff', background: RANK_COLORS[w.rank] || '#999',
                  borderRadius: 6, padding: '2px 8px',
                }}>{RANK_LABELS[w.rank] || `Rank ${w.rank}`}</span>
                {w.priority === 'test' && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#8e44ad', borderRadius: 6, padding: '2px 8px' }}>TEST</span>
                )}
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
                  {w.last_practiced ? `last: ${lastResult(w) || '—'}` : 'not practiced yet'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>{w.added_by}</span>
              </div>
            ))}
            {!loading && words.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No words yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function inputStyle(width) {
  return {
    width, border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px',
    fontSize: 13, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)',
  };
}

const selectStyle = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '5px 6px',
  fontSize: 12, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)',
};
