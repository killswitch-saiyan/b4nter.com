import React from 'react';
import { Message } from '../types';

interface MessageDisplayProps {
  message: Message & { pending?: boolean };
}

const MessageDisplay: React.FC<MessageDisplayProps> = ({ message }) => {
  // Temporary debugging to see what data we're getting
  console.log('MessageDisplay - Full message:', message);
  console.log('MessageDisplay - Sender object:', message.sender);
  console.log('MessageDisplay - Sender ID:', message.sender_id);
  
  const displayName = message.sender?.full_name || message.sender?.username || 'Unknown';
  const avatarInitial = message.sender?.full_name?.charAt(0) || message.sender?.username?.charAt(0) || 'U';

  return (
    <div className={`flex items-start space-x-3 ${message.pending ? 'opacity-60' : ''}`}>
      <div className="flex-shrink-0">
        <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">   <span className="text-white text-sm font-medium">
            {avatarInitial}
          </span>
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-baseline space-x-2">   <span className="text-sm font-medium text-gray-900">
            {displayName}
          </span>
          <span className="text-xs text-gray-50">
            {new Date(message.created_at).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm text-gray-700">{message.content}</p>
        {message.pending && <span className="ml-2 text-xs text-gray-400 animate-pulse">Sending...</span>}
      </div>
    </div>
  );
};

export default MessageDisplay; 