import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import VideoChat from './VideoChat';
import { toast } from 'react-hot-toast';

interface VideoCallButtonProps {
  targetUserId: string;
  targetUsername: string;
}

const VideoCallButton: React.FC<VideoCallButtonProps> = ({ 
  targetUserId, 
  targetUsername 
}) => {
  const { user } = useAuth();
  const [isInCall, setIsInCall] = useState(false);

  const startVideoCall = async () => {
    if (!user) {
      toast.error('Please log in to start a video call');
      return;
    }

    if (!targetUserId || !targetUsername) {
      toast.error('Invalid user for video call');
      return;
    }

    setIsInCall(true);
  };

  const endVideoCall = () => {
    setIsInCall(false);
  };

  return (
    <>
      <button
        onClick={startVideoCall}
        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title={`Video call with ${targetUsername}`}
      >
        <svg 
          className="w-5 h-5" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" 
          />
        </svg>
      </button>

      {isInCall && (
        <VideoChat
          targetUserId={targetUserId}
          targetUsername={targetUsername}
          onClose={endVideoCall}
        />
      )}
    </>
  );
};

export default VideoCallButton;