import { useState, useEffect } from 'react';
import { renderRichText } from '../lib/richText.jsx';

const API = import.meta.env.VITE_API_URL || '';

const STATUS_ICON = { solved: '✅', skipped: '⏭️', attempted: '🔄', pending: '⬜' };

function isRtl(text) {
  return /[֐-׿]/.test(text || '');
}

export default function WorkPagesPanel({ studentId, pin, open, onClose }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API}/api/pages/${studentId}`, { headers: { 'x-app-pin': pin } })
      .then(res => res.json())
      .then(data => { setPages(data.pages || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open, studentId, pin]);

  if (!open) return null;

  function pct(page) {
    const total = parseInt(page.total);
    if (!total) return 0;
    return Math.round((parseInt(page.done) / total) * 100);
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(340px, 90vw)',
        background: 'var(--surface)', boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
        zIndex: 41, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>My Work</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, opacity: 0.5, lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>Loading...</div>
          ) : pages.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 13 }}>
              No work pages yet.
            </div>
          ) : pages.map(page => (
            <div key={page.id} style={{
              background: 'var(--bg)', borderRadius: 10, padding: 12,
              border: `1.5px solid ${page.status === 'active' ? 'var(--primary)' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }} dir={isRtl(page.title) ? 'rtl' : 'ltr'}>{page.title}</span>
                {page.status === 'completed' && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#27ae60', borderRadius: 6, padding: '2px 6px', flexShrink: 0 }}>DONE</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'capitalize' }}>{page.subject}</div>
              <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ width: `${pct(page)}%`, height: '100%', background: 'var(--primary)', borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                {page.done}/{page.total} solved · {pct(page)}%
              </div>
              <button
                onClick={() => setExpandedId(expandedId === page.id ? null : page.id)}
                style={{
                  fontSize: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '3px 8px', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit',
                }}
              >
                {expandedId === page.id ? 'Hide exercises' : 'Show exercises'}
              </button>
              {expandedId === page.id && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(page.exercises || []).map((ex, i) => (
                    <div key={ex.id} style={{ display: 'flex', gap: 6, fontSize: 12, alignItems: 'flex-start' }}>
                      <span style={{ flexShrink: 0 }}>{STATUS_ICON[ex.status] || '⬜'}</span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}.</span>
                      <div style={{ flex: 1 }} dir={isRtl(ex.description) ? 'rtl' : 'ltr'}>{renderRichText(ex.description)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
