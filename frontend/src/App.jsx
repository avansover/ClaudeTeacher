import { useState } from 'react';
import PinScreen from './components/PinScreen.jsx';
import StudentPicker from './components/StudentPicker.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import VocabGame from './components/VocabGame.jsx';

export default function App() {
  const [pin, setPin] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [mode, setMode] = useState(null); // 'chat' | 'vocab'

  if (!pin) return <PinScreen onSuccess={setPin} />;

  if (!studentId || !mode) {
    return (
      <StudentPicker
        onSelect={(id, selectedMode) => {
          setStudentId(id);
          setMode(selectedMode);
        }}
      />
    );
  }

  const handleBack = () => {
    setStudentId(null);
    setMode(null);
  };

  if (mode === 'vocab') {
    return <VocabGame studentId={studentId} pin={pin} onBack={handleBack} />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ChatWindow studentId={studentId} pin={pin} onBack={handleBack} />
    </div>
  );
}
