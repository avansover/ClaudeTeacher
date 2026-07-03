import { useState, useRef, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const MODES = [
  { value: 'flexible', label: '🌊 Flexible', desc: 'Claude reminds, student can redirect' },
  { value: 'strict',   label: '🔒 Strict',   desc: 'Claude stays on this page until 100% done' },
];

export default function ParentPlanChat({ studentId, studentName, parentPin, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('flexible');
  const [dueDate, setDueDate] = useState('');
  const [locking, setLocking] = useState(false);
  const [locked, setLocked] = useState(null); // { title, exerciseCount }
  const bottomRef = useRef(null);
  const headers = { 'Content-Type': 'application/json', 'x-parent-pin': parentPin };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/parent/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ studentId, messages: newMessages }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong, try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function lockPage() {
    if (messages.length < 2) return;
    setLocking(true);
    try {
      const res = await fetch(`${API}/api/parent/pages/lock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          studentId,
          messages,
          mode,
          dueDate: dueDate || null,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLocked({ title: data.page.title, exerciseCount: data.page.exerciseCount });
    } catch (err) {
      alert('Could not lock page: ' + err.message);
    } finally {
      setLocking(false);
    }
  }

  if (locked) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        background: 'var(--bg)', padding: 32,
      }}>
        <div style={{ fontSize: 56 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}>Page Locked!</div>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 15 }}>
          <strong>{locked.title}</strong><br />
          {locked.exerciseCount} exercises · {mode} mode<br />
          {studentName} will see this next time she opens the app.
        </div>
        <button onClick={onBack} style={{
          background: 'var(--primary)', color: '#fff', border: 'none',
          borderRadius: 12, padding: '12px 28px', fontSize: 15,
          fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Back to Dashboard
        </button>
      </div>
    );
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
        <span style={{ fontSize: 22 }}>✏️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Planning for {studentName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Describe the exercises you want — Claude will structure them</div>
        </div>
      </div>

      {/* Settings bar */}
      <div style={{
        padding: '10px 16px', background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {MODES.map(m => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              title={m.desc}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                background: mode === m.value ? 'var(--primary)' : 'var(--bg)',
                color: mode === m.value ? '#fff' : 'var(--text)',
                border: `2px solid ${mode === m.value ? 'var(--primary)' : 'var(--border)'}`,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          placeholder="Due date (optional)"
          style={{
            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60, lineHeight: 2 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15 }}>Describe what you want {studentName} to practice.</div>
            <div style={{ fontSize: 13 }}>e.g. "6 long multiplication exercises, mixed difficulty" or "5 English sentences in past tense"</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%', marginBottom: 12,
            padding: '10px 14px',
            background: msg.role === 'user' ? 'var(--primary)' : 'var(--bubble-ai)',
            color: msg.role === 'user' ? '#fff' : 'var(--text)',
            borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '12px 16px',
            background: 'var(--bubble-ai)', borderRadius: '16px 16px 16px 4px',
            color: 'var(--text-muted)', fontSize: 22, letterSpacing: 3,
          }}>···</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input + Lock */}
      <div style={{
        padding: '12px 16px', background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-end', gap: 8,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Describe exercises..."
          disabled={loading}
          rows={1}
          style={{
            flex: 1, resize: 'none', border: '1.5px solid var(--border)', borderRadius: 12,
            padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
            outline: 'none', background: 'var(--bg)', color: 'var(--text)',
            maxHeight: 100, overflowY: 'auto', lineHeight: 1.5,
          }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none',
            borderRadius: 12, width: 42, height: 42, fontSize: 18,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
            flexShrink: 0,
          }}
        >➤</button>
        {messages.length >= 2 && (
          <button
            onClick={lockPage}
            disabled={locking}
            style={{
              background: '#27ae60', color: '#fff', border: 'none',
              borderRadius: 12, padding: '0 16px', height: 42, fontSize: 13,
              fontWeight: 700, cursor: locking ? 'not-allowed' : 'pointer',
              opacity: locking ? 0.6 : 1, flexShrink: 0, fontFamily: 'inherit',
            }}
          >
            {locking ? '...' : '🔒 Lock Page'}
          </button>
        )}
      </div>
    </div>
  );
}
