import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble.jsx';
import FileUpload from './FileUpload.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const STUDENT_DISPLAY = {
  lielle: { name: 'Lielle', emoji: '🌸' },
  agam:   { name: 'Agam',   emoji: '⭐' },
};

export default function ChatWindow({ studentId, pin, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const student = STUDENT_DISPLAY[studentId] || { name: studentId, emoji: '📚' };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text && pendingFiles.length === 0) return;

    const userMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setPendingFiles([]);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-pin': pin,
        },
        body: JSON.stringify({
          studentId,
          messages: newMessages,
          files: pendingFiles.length ? pendingFiles : undefined,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Oops, something went wrong. Try again in a moment!',
      }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isRtlInput = /[֐-׿]/.test(input);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      maxWidth: 720, margin: '0 auto', width: '100%',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <button
          onClick={onBack}
          title="Switch student"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, padding: '0 4px', opacity: 0.5,
            lineHeight: 1,
          }}
        >←</button>
        <span style={{ fontSize: 26 }}>🎓</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Claude Teacher</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Here to help you learn, {student.emoji} {student.name}!
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 16px',
        display: 'flex', flexDirection: 'column',
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center', color: 'var(--text-muted)',
            marginTop: 60, lineHeight: 2,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <div style={{ fontSize: 16 }}>Hi {student.name}! What are we working on today?</div>
            <div style={{ fontSize: 13 }}>You can type a question or attach a photo of your homework.</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>🎓</div>
            <div style={{
              padding: '12px 16px',
              background: 'var(--bubble-ai)',
              borderRadius: 'var(--radius) var(--radius) var(--radius) 4px',
              boxShadow: 'var(--shadow)',
              color: 'var(--text-muted)',
              fontSize: 22, letterSpacing: 3,
            }}>···</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Pending files indicator */}
      {pendingFiles.length > 0 && (
        <div style={{
          padding: '6px 16px', background: 'var(--primary-light)',
          fontSize: 13, color: 'var(--primary)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          📎 {pendingFiles.map(f => f.name).join(', ')}
          <button
            onClick={() => setPendingFiles([])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 700 }}
          >×</button>
        </div>
      )}

      {/* Input bar */}
      <div style={{
        padding: '12px 16px', background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-end', gap: 8,
      }}>
        <FileUpload
          onFiles={files => setPendingFiles(prev => [...prev, ...files])}
          disabled={loading}
        />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your question here..."
          disabled={loading}
          rows={1}
          dir={isRtlInput ? 'rtl' : 'ltr'}
          style={{
            flex: 1, resize: 'none',
            border: '1.5px solid var(--border)', borderRadius: 12,
            padding: '10px 14px', fontSize: 15, fontFamily: 'inherit',
            outline: 'none', background: 'var(--bg)', color: 'var(--text)',
            maxHeight: 120, overflowY: 'auto', lineHeight: 1.5,
            textAlign: isRtlInput ? 'right' : 'left',
          }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />

        <button
          onClick={sendMessage}
          disabled={loading || (!input.trim() && pendingFiles.length === 0)}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none',
            borderRadius: 12, width: 42, height: 42, fontSize: 20,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || (!input.trim() && pendingFiles.length === 0) ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >➤</button>
      </div>
    </div>
  );
}
