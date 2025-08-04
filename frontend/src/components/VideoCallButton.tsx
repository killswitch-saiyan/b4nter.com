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

interface IncomingCallData {
  caller_id: string;
  caller_name: string;
  room_id: string;
  type: string;
}

const VideoCallButton: React.FC<VideoCallButtonProps> = ({ 
  targetUserId, 
  targetUsername 
}) => {
  const { user } = useAuth();
  const { sendCustomEvent } = useWebSocket();
  
  const [isInCall, setIsInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [roomId, setRoomId] = useState<string>('');

  // Listen for video call events
  useEffect(() => {
    const handleVideoCallInvite = (event: CustomEvent) => {
      const data = event.detail;
      console.log('Received video call invite:', data);
      
      // Only show incoming call if it's for this user and from the target user
      if (data.target_user_id === user?.id && data.caller_id === targetUserId) {
        setIncomingCall({
          caller_id: data.caller_id,
          caller_name: data.caller_name,
          room_id: data.room_id,
          type: 'video_call_invite'
        });
      }
    };

    const handleVideoCallAccept = (event: CustomEvent) => {
      const data = event.detail;
      console.log('Video call accepted:', data);
      
      if (data.caller_id === user?.id) {
        setRoomId(data.room_id);
        setIsInCall(true);
        toast.success(`${targetUsername} accepted your call!`);
      }
    };

    const handleVideoCallReject = (event: CustomEvent) => {
      const data = event.detail;
      console.log('Video call rejected:', data);
      
      if (data.caller_id === user?.id) {
        toast.error(`${targetUsername} declined your call`);
      }
    };

    const handleVideoCallEnd = (event: CustomEvent) => {
      const data = event.detail;
      console.log('Video call ended:', data);
      
      if (data.room_id === roomId || data.caller_id === targetUserId || data.target_user_id === user?.id) {
        setIsInCall(false);
        setRoomId('');
        toast('Call ended');
      }
    };

    // Add event listeners
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
  }, [user?.id, targetUserId, targetUsername, roomId]);

  // Generate room ID from user IDs
  const generateRoomId = () => {
    if (!user) return '';
    return [user.id, targetUserId].sort().join('-video-room');
  };

  // Start video call
  const startVideoCall = () => {
    if (!user) {
      toast.error('User not authenticated');
      return;
    }

    const newRoomId = generateRoomId();
    setRoomId(newRoomId);

    // Send video call invitation
    sendCustomEvent({
      type: 'video_call_invite',
      target_user_id: targetUserId,
      caller_id: user.id,
      caller_name: user.username,
      room_id: newRoomId
    });

    setIsInCall(true);
    toast.success(`Calling ${targetUsername}...`);
  };

  // Accept incoming call
  const acceptCall = (roomId: string) => {
    console.log('Accepting call with room ID:', roomId);
    setRoomId(roomId);
    setIsInCall(true);
    setIncomingCall(null);
  };

  // Reject incoming call
  const rejectCall = () => {
    setIncomingCall(null);
  };

  // Close video call
  const closeVideoCall = () => {
    setIsInCall(false);
    setRoomId('');
  };

  return (
    <>
      {/* Video Call Button */}
      <button
        onClick={startVideoCall}
        disabled={isInCall}
        className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm transition-colors"
      >
        📹 {isInCall ? 'In Call' : 'Video Call'}
      </button>

      {/* Incoming Call Modal */}
      <IncomingCallModal
        callData={incomingCall}
        onAccept={acceptCall}
        onReject={rejectCall}
      />

      {/* Video Chat Component */}
      {isInCall && (
        <VideoChat
          targetUserId={targetUserId}
          targetUsername={targetUsername}
          roomId={roomId}
          onClose={closeVideoCall}
        />
      )}
    </>
  );
};

export default VideoCallButton;