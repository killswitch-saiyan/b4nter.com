import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import VideoChat from './VideoChat';
import IncomingCallModal from './IncomingCallModal';
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
  const { sendCustomEvent } = useWebSocket();
  const [isInCall, setIsInCall] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState<any>(null);
  const [callAccepted, setCallAccepted] = useState(false);

  const startVideoCall = async () => {
    if (!user) {
      toast.error('Please log in to start a video call');
      return;
    }

    if (!targetUserId || !targetUsername) {
      toast.error('Invalid user for video call');
      return;
    }

    // Generate room ID for this call
    const roomId = [user.id, targetUserId].sort().join('-video-call');

    // Send video call invitation via WebSocket
    sendCustomEvent({
      type: 'video_call_invite',
      caller_id: user.id,
      caller_name: user.username,
      target_user_id: targetUserId,
      room_id: roomId
    });

    // Show calling state
    toast.success(`Calling ${targetUsername}...`);
    setIsInCall(true);
  };

  const endVideoCall = () => {
    // Send call end event if in call
    if (isInCall && user) {
      const roomId = [user.id, targetUserId].sort().join('-video-call');
      sendCustomEvent({
        type: 'video_call_end',
        caller_id: user.id,
        target_user_id: targetUserId,
        room_id: roomId
      });
    }
    setIsInCall(false);
    setCallAccepted(false);
    setIncomingCallData(null);
  };

  const handleAcceptCall = (roomId: string) => {
    setCallAccepted(true);
    setIncomingCallData(null);
    setIsInCall(true);
  };

  const handleRejectCall = () => {
    setIncomingCallData(null);
  };

  // Listen for video call events
  useEffect(() => {
    const handleVideoCallInvite = (event: CustomEvent) => {
      const data = event.detail;
      if (data.target_user_id === user?.id) {
        setIncomingCallData(data);
      }
    };

    const handleVideoCallAccept = (event: CustomEvent) => {
      const data = event.detail;
      if (data.caller_id === user?.id) {
        toast.success(`${targetUsername} accepted your call!`);
        setCallAccepted(true);
      }
    };

    const handleVideoCallReject = (event: CustomEvent) => {
      const data = event.detail;
      if (data.caller_id === user?.id) {
        toast.error(`${targetUsername} declined your call`);
        setIsInCall(false);
      }
    };

    const handleVideoCallEnd = (event: CustomEvent) => {
      toast('Call ended');
      setIsInCall(false);
      setCallAccepted(false);
      setIncomingCallData(null);
    };

    window.addEventListener('video-call-invite', handleVideoCallInvite as EventListener);
    window.addEventListener('video-call-accept', handleVideoCallAccept as EventListener);
    window.addEventListener('video-call-reject', handleVideoCallReject as EventListener);
    window.addEventListener('video-call-end', handleVideoCallEnd as EventListener);

    return () => {
      window.removeEventListener('video-call-invite', handleVideoCallInvite as EventListener);
      window.removeEventListener('video-call-accept', handleVideoCallAccept as EventListener);
      window.removeEventListener('video-call-reject', handleVideoCallReject as EventListener);
      window.removeEventListener('video-call-end', handleVideoCallEnd as EventListener);
    };
  }, [user?.id, targetUsername]);

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

      {/* Incoming call modal */}
      <IncomingCallModal
        callData={incomingCallData}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
      />

      {/* Video chat component */}
      {isInCall && (callAccepted || incomingCallData) && (
        <VideoChat
          targetUserId={targetUserId}
          targetUsername={targetUsername}
          isInitiator={!incomingCallData}
          onClose={endVideoCall}
        />
      )}
    </>
  );
};

export default VideoCallButton;