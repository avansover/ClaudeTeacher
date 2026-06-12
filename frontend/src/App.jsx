import ChatWindow from './components/ChatWindow.jsx';

const STUDENT_NAME = import.meta.env.VITE_STUDENT_NAME || 'Friend';

export default function App() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ChatWindow studentName={STUDENT_NAME} />
    </div>
  );
}
