import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { toast } from 'react-hot-toast';
import DebugPanel from '../components/DebugPanel';

const ChatPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { isConnected, sendMessage, joinChannel, messages, setMessages } = useWebSocket();
  const [message, setMessage] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('general');
  const prevChannelRef = useRef<string | null>(null);

  // Debug: Log user data
  useEffect(() => {
    console.log('Current user data:', user);
    console.log('User ID:', user?.id);
    console.log('User full_name:', user?.full_name);
    console.log('User username:', user?.username);
  }, [user]);

  useEffect(() => {
    if (!user || !isConnected) return;
    if (prevChannelRef.current !== selectedChannel) {
      console.log('Joining channel:', selectedChannel, 'with user ID:', user.id);
      joinChannel(selectedChannel);
      setMessages([]); // Only clear when switching channels
      prevChannelRef.current = selectedChannel;
    }
  }, [isConnected, user, selectedChannel, joinChannel, setMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleSendMessage called');
    console.log('message:', message);
    console.log('user:', user);
    console.log('isConnected:', isConnected);
    
    if (!message.trim() || !user) {
      console.log('Message empty or no user, returning');
      return;
    }

    if (!isConnected) {
      console.error('Socket not connected!');
      toast.error('Not connected to server. Please wait for connection...');
      return;
    }

    console.log('Sending message via context:', message);
    sendMessage(message, selectedChannel);
    setMessage('');
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please log in to continue</h2>
        </div>
      </div>
    );
  }

  // Get display name - prefer full_name, fallback to username
  const displayName = user.full_name || user.username || 'Unknown User';

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">B4nter</h1>
            <span className="text-sm text-gray-500">Where the game never stops talking</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              Welcome, {displayName}!
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Channels</h3>
            <div className="space-y-2">
              {['general', 'premier-league', 'champions-league'].map((channel) => (
                <button
                  key={channel}
                  onClick={() => setSelectedChannel(channel)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${
                    selectedChannel === channel
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  #{channel}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Channel Header */}
          <div className="bg-white border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">#{selectedChannel}</h2>
            <p className="text-sm text-gray-500">
              {isConnected ? 'Connected' : 'Connecting...'}
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className="flex space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {msg.sender_name?.charAt(0) || 'U'}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline space-x-2">
                      <span className="text-sm font-medium text-gray-900">
                        {msg.sender_name || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Input */}
          <div className="bg-white border-t p-4">
            <form onSubmit={handleSendMessage} className="flex space-x-4">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={!message.trim()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
      <DebugPanel />
    </div>
  );
};

export default ChatPage; 