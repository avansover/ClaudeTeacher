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
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 12, padding: '32px 40px',
              background: 'var(--surface)', border: `3px solid ${s.color}`,
              borderRadius: 24, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              transition: 'transform 0.1s',
              fontSize: 'inherit', fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span style={{ fontSize: 56 }}>{s.emoji}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
