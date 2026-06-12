import { useState } from 'react';

export default function PinScreen({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    // Validate PIN against backend by attempting a ping
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-pin': pin },
      body: JSON.stringify({ studentId: 'lielle', messages: [{ role: 'user', content: 'ping' }] }),
    })
      .then(res => {
        if (res.status === 401) {
          setError(true);
          setPin('');
        } else {
          onSuccess(pin);
        }
      })
      .catch(() => setError(true));
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
        {error && (
          <div style={{ color: '#e74c3c', fontSize: 14 }}>Wrong PIN, try again</div>
        )}
        <button
          type="submit"
          disabled={!pin}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none',
            borderRadius: 12, padding: '12px 32px', fontSize: 16,
            fontWeight: 700, cursor: pin ? 'pointer' : 'not-allowed',
            opacity: pin ? 1 : 0.5,
          }}
        >
          Let's go!
        </button>
      </form>
    </div>
  );
}
