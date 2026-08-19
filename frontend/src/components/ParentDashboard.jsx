import { useState, useEffect } from 'react';
import ParentPlanChat from './ParentPlanChat.jsx';
import ParentVocabWords from './ParentVocabWords.jsx';
import { renderRichText } from '../lib/richText.jsx';

const API = import.meta.env.VITE_API_URL || '';

const STUDENT_COLORS = { lielle: '#f4845f', agam: '#6c9fdb' };
const STUDENT_EMOJI  = { lielle: '🌸', agam: '⭐' };

export default function ParentDashboard({ parentPin, onLogout }) {
  const [students, setStudents] = useState([]);
  const [planning, setPlanning] = useState(null); // { studentId, studentName }
  const [viewingPages, setViewingPages] = useState(null); // { studentId, pages }
  const [vocabView, setVocabView] = useState(null); // { studentId, studentName }
  const [loading, setLoading] = useState(true);

  const headers = { 'x-parent-pin': parentPin };

  async function loadStudents() {
    setLoading(true);
    const res = await fetch(`${API}/api/parent/students`, { headers });
    const data = await res.json();
    setStudents(data.students || []);
    setLoading(false);
  }

  async function loadPages(studentId) {
    const res = await fetch(`${API}/api/parent/pages/${studentId}`, { headers });
    const data = await res.json();
    setViewingPages({ studentId, pages: data.pages || [] });
  }

  async function unlockPage(pageId, studentId) {
    await fetch(`${API}/api/parent/pages/${pageId}/unlock`, { method: 'POST', headers });
    loadPages(studentId);
    loadStudents();
  }

  async function deletePage(pageId, studentId) {
    if (!window.confirm('Delete this page and all its exercises? This cannot be undone.')) return;
    await fetch(`${API}/api/parent/pages/${pageId}`, { method: 'DELETE', headers });
    loadPages(studentId);
    loadStudents();
  }

  useEffect(() => { loadStudents(); }, []);

  if (planning) {
    return (
      <ParentPlanChat
        studentId={planning.studentId}
        studentName={planning.studentName}
        parentPin={parentPin}
        onBack={() => { setPlanning(null); loadStudents(); }}
      />
    );
  }

  if (vocabView) {
    return (
      <ParentVocabWords
        studentId={vocabView.studentId}
        studentName={vocabView.studentName}
        parentPin={parentPin}
        onBack={() => setVocabView(null)}
      />
    );
  }

  function pct(page) {
    const total = parseInt(page.total);
    if (!total) return 0;
    return Math.round((parseInt(page.done) / total) * 100);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 26 }}>👨‍👧</span>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 18 }}>Parent Dashboard</div>
        <button
          onClick={onLogout}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', opacity: 0.7 }}
        >
          Logout
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60 }}>Loading...</div>
        ) : students.map(s => (
          <div key={s.id} style={{
            background: 'var(--surface)', borderRadius: 16, padding: 20,
            border: `2px solid ${STUDENT_COLORS[s.id] || '#ccc'}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            {/* Student header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>{STUDENT_EMOJI[s.id]}</span>
              <span style={{ fontWeight: 700, fontSize: 18, color: STUDENT_COLORS[s.id] }}>{s.name}</span>
            </div>

            {/* Active page summary */}
            {s.activePage ? (
              <div style={{
                background: 'var(--bg)', borderRadius: 10, padding: '10px 14px', marginBottom: 14,
                fontSize: 14, borderLeft: `4px solid ${STUDENT_COLORS[s.id]}`,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.activePage.title}</div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
                  {s.activePage.subject} · {s.activePage.mode} mode
                </div>
                <ProgressBar value={pct(s.activePage)} color={STUDENT_COLORS[s.id]} />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {s.activePage.done}/{s.activePage.total} exercises · {pct(s.activePage)}%
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>No active work page</div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setPlanning({ studentId: s.id, studentName: s.name })}
                style={btnStyle(STUDENT_COLORS[s.id])}
              >
                ✏️ Plan New Page
              </button>
              <button
                onClick={() => viewingPages?.studentId === s.id ? setViewingPages(null) : loadPages(s.id)}
                style={outlineBtnStyle(STUDENT_COLORS[s.id])}
              >
                📋 {viewingPages?.studentId === s.id ? 'Hide Pages' : 'View Pages'}
              </button>
              <button
                onClick={() => setVocabView({ studentId: s.id, studentName: s.name })}
                style={outlineBtnStyle(STUDENT_COLORS[s.id])}
              >
                📖 Words
              </button>
            </div>

            {/* Pages list */}
            {viewingPages?.studentId === s.id && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {viewingPages.pages.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No pages yet.</div>
                )}
                {viewingPages.pages.map(page => (
                  <div key={page.id} style={{
                    background: 'var(--bg)', borderRadius: 10, padding: '10px 14px',
                    border: '1px solid var(--border)', fontSize: 13,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700 }}>{page.title}</span>
                      <StatusBadge status={page.status} />
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 6, fontSize: 12 }}>
                      {page.subject} · {page.mode}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <ProgressBar value={pct(page)} color={STUDENT_COLORS[s.id]} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: STUDENT_COLORS[s.id], flexShrink: 0 }}>
                        {page.done}/{page.total} solved · {pct(page)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      {page.status === 'active' && (
                        <button
                          onClick={() => unlockPage(page.id, s.id)}
                          title="Hides the page from the student — exercises are preserved as draft"
                          style={{ fontSize: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--text-muted)' }}
                        >
                          ⏸ Deactivate
                        </button>
                      )}
                      <button
                        onClick={() => deletePage(page.id, s.id)}
                        style={{ fontSize: 12, background: 'none', border: '1px solid #e74c3c', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: '#e74c3c' }}
                      >
                        🗑 Delete
                      </button>
                    </div>
                    {page.exercises && page.exercises.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {page.exercises.map((ex, i) => (
                          <div key={ex.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
                            <span>{statusIcon(ex.status)}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                            <div style={{ flex: 1 }}>{renderRichText(ex.description)}</div>
                            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{ex.difficulty}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ value, color }) {
  return (
    <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = { draft: '#aaa', active: '#27ae60', completed: '#3498db' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: colors[status] || '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
      {status}
    </span>
  );
}

function statusIcon(status) {
  return status === 'solved' ? '✅' : status === 'skipped' ? '⏭️' : status === 'attempted' ? '🔄' : '⬜';
}

function btnStyle(color) {
  return {
    background: color, color: '#fff', border: 'none',
    borderRadius: 10, padding: '8px 16px', fontSize: 13,
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  };
}

function outlineBtnStyle(color) {
  return {
    background: 'var(--bg)', color, border: `2px solid ${color}`,
    borderRadius: 10, padding: '8px 16px', fontSize: 13,
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  };
}
