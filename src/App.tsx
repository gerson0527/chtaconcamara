import React from 'react';
import Chat from './components/Chat';
import './App.css';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen">
      <Chat />
    </div>
  );
};

export default App;