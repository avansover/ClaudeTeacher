import { useState } from 'react';
import PinScreen from './components/PinScreen.jsx';
import StudentPicker from './components/StudentPicker.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import VocabGame from './components/VocabGame.jsx';
import ParentDashboard from './components/ParentDashboard.jsx';

export default function App() {
  const [auth, setAuth] = useState(null); // { pin, mode: 'student' | 'parent' }
  const [studentId, setStudentId] = useState(null);
  const [mode, setMode] = useState(null); // 'chat' | 'vocab'

  if (!auth) {
    return <PinScreen onSuccess={(pin, authMode) => setAuth({ pin, mode: authMode })} />;
  }

  if (auth.mode === 'parent') {
    return <ParentDashboard parentPin={auth.pin} onLogout={() => setAuth(null)} />;
  }

  // Student flow
  if (!studentId || !mode) {
    return (
      <StudentPicker
        onSelect={(id, selectedMode) => { setStudentId(id); setMode(selectedMode); }}
      />
    );
  }

  const handleBack = () => { setStudentId(null); setMode(null); };

  if (mode === 'vocab') {
    return <VocabGame studentId={studentId} pin={auth.pin} onBack={handleBack} />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ChatWindow studentId={studentId} pin={auth.pin} onBack={handleBack} />
    </div>
  );
}
