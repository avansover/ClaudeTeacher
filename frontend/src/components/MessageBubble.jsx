// Claude's replies use light markdown (**bold**, --- dividers) — render it instead of showing raw asterisks/dashes
function renderContent(content) {
  return content.split('\n').map((line, i) => {
    if (line.trim() === '---') {
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid currentColor', opacity: 0.15, margin: '8px 0' }} />;
    }
    if (line === '') {
      return <div key={i}>&nbsp;</div>;
    }
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <div key={i}>
        {parts.map((part, j) => (
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : part
        ))}
      </div>
    );
  });
}

export default function MessageBubble({ role, content }) {
  const isUser = role === 'user';

  // Detect RTL content (Hebrew)
  const isRtl = /[֐-׿]/.test(content);

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '10px',
    }}>
      {!isUser && (
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, marginRight: 8, flexShrink: 0, alignSelf: 'flex-end',
        }}>
          🎓
        </div>
      )}
      <div style={{
        maxWidth: '72%',
        padding: '12px 16px',
        borderRadius: isUser
          ? 'var(--radius) var(--radius) 4px var(--radius)'
          : 'var(--radius) var(--radius) var(--radius) 4px',
        background: isUser ? 'var(--bubble-user)' : 'var(--bubble-ai)',
        color: isUser ? 'var(--bubble-user-text)' : 'var(--bubble-ai-text)',
        boxShadow: 'var(--shadow)',
        fontSize: '15px',
        lineHeight: '1.55',
        direction: isRtl ? 'rtl' : 'ltr',
        textAlign: isRtl ? 'right' : 'left',
        wordBreak: 'break-word',
      }}>
        {renderContent(content)}
      </div>
    </div>
  );
}
