import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

export default function PinScreen({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!pin) return;
    setLoading(true);
    setError(false);

    try {
      // Try parent PIN first
      const parentRes = await fetch(`${API}/api/parent/auth`, {
        method: 'POST',
        headers: { 'x-parent-pin': pin },
      });
      if (parentRes.ok) return onSuccess(pin, 'parent');

      // Try student PIN
      const studentRes = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-pin': pin },
        body: JSON.stringify({ studentId: 'lielle', messages: [{ role: 'user', content: 'ping' }] }),
      });
      if (studentRes.status !== 401) return onSuccess(pin, 'student');

      setError(true);
      setPin('');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 24,
      background: 'var(--bg)',
    }}>
      <div style={{ fontSize: 56 }}>🔐</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>Enter PIN to continue</div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(false); }}
          placeholder="••••"
          maxLength={8}
          autoFocus
          disabled={loading}
          style={{
            fontSize: 28,
            letterSpacing: 8,
            textAlign: 'center',
            padding: '12px 20px',
            border: `2px solid ${error ? '#e74c3c' : 'var(--border)'}`,
            borderRadius: 12,
            width: 160,
            outline: 'none',
            background: 'var(--surface)',
          }}
        />
        {error && <div style={{ color: '#e74c3c', fontSize: 14 }}>Wrong PIN, try again</div>}
        <button
          type="submit"
          disabled={!pin || loading}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none',
            borderRadius: 12, padding: '12px 32px', fontSize: 16,
            fontWeight: 700, cursor: pin && !loading ? 'pointer' : 'not-allowed',
            opacity: pin && !loading ? 1 : 0.5,
          }}
        >
          {loading ? '...' : "Let's go!"}
        </button>
      </form>
    </div>
  );
}
