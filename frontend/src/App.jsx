import { useState } from 'react';
import PinScreen from './components/PinScreen.jsx';
import StudentPicker from './components/StudentPicker.jsx';
import ChatWindow from './components/ChatWindow.jsx';

export default function App() {
  const [pin, setPin] = useState(null);
  const [studentId, setStudentId] = useState(null);

  if (!pin) {
    return <PinScreen onSuccess={setPin} />;
  }

  if (!studentId) {
    return <StudentPicker onSelect={setStudentId} />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ChatWindow
        studentId={studentId}
        pin={pin}
        onBack={() => setStudentId(null)}
      />
    </div>
  );
}
