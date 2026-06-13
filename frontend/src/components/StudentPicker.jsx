const STUDENTS = [
  { id: 'lielle', name: 'Lielle', emoji: '🌸', color: '#f4845f' },
  { id: 'agam',   name: 'Agam',   emoji: '⭐', color: '#6c9fdb' },
];

export default function StudentPicker({ onSelect }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 32,
      background: 'var(--bg)',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
        Who's learning today? 📚
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {STUDENTS.map(s => (
          <div
            key={s.id}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 16, padding: '32px 40px',
              background: 'var(--surface)', border: `3px solid ${s.color}`,
              borderRadius: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            }}
          >
            <span style={{ fontSize: 56 }}>{s.emoji}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.name}</span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <button
                onClick={() => onSelect(s.id, 'chat')}
                style={{
                  background: s.color, color: '#fff', border: 'none',
                  borderRadius: 12, padding: '10px 20px', fontSize: 15,
                  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                💬 Homework Help
              </button>
              <button
                onClick={() => onSelect(s.id, 'vocab')}
                style={{
                  background: 'var(--bg)', color: s.color,
                  border: `2px solid ${s.color}`,
                  borderRadius: 12, padding: '10px 20px', fontSize: 15,
                  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                🔤 Vocabulary Game
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
