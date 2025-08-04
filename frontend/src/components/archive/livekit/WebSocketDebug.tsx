import React from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAuth } from '../contexts/AuthContext';

const WebSocketDebug: React.FC = () => {
  const { isConnected, socket, connectedUsers } = useWebSocket();
  const { user } = useAuth();

  const testCallInvitation = () => {
    // Send a test call invitation to yourself for debugging
    if (socket && user) {
      const testEvent = {
        type: 'livekit_call_invite',
        target_user_id: user.id, // Send to self for testing
        room_name: 'test-room',
        call_id: 'test-call-123'
      };
      
      console.log('Sending test call invitation:', testEvent);
      socket.send(JSON.stringify(testEvent));
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4 text-sm">
      <h3 className="font-semibold mb-2">WebSocket Debug Info</h3>
      <div className="space-y-1">
        <div>Connected: {isConnected ? '✅ Yes' : '❌ No'}</div>
        <div>Socket State: {socket?.readyState} (Open = 1)</div>
        <div>Current User ID: {user?.id}</div>
        <div>Connected Users: {connectedUsers.length}</div>
        <div>Connected User IDs: {JSON.stringify(connectedUsers)}</div>
      </div>
      <button 
        onClick={testCallInvitation}
        className="mt-2 bg-blue-500 text-white px-3 py-1 rounded text-xs"
      >
        Test Call (to self)
      </button>
    </div>
  );
};

export default WebSocketDebug;