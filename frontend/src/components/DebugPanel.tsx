import React from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAuth } from '../contexts/AuthContext';

const DebugPanel: React.FC = () => {
  const { isConnected } = useWebSocket();
  const { user } = useAuth();

  return (
    <div className="fixed top-4 right-4 bg-black bg-opacity-75 text-white p-4 rounded-lg text-xs max-w-sm z-50">
      <h3 className="font-bold mb-2">Debug Info</h3>
      <div className="space-y-1">
        <div>User: {user?.username || 'Not logged in'}</div>
        <div>User ID: {user?.id || 'N/A'}</div>
        <div>Socket Connected: <span className={isConnected ? 'text-green-400' : 'text-red-400'}>{isConnected ? 'Yes' : 'No'}</span></div>
        <div>WebSocket Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
        <div>Backend URL: http://127.0.0.1:8000</div>
      </div>
    </div>
  );
};

export default DebugPanel; 