import React, { useState, useCallback, useEffect } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ParticipantTile,
  useTracks,
  useParticipants,
  ControlBar,
} from '@livekit/components-react';
import { Room, RoomOptions, VideoPresets, Track } from 'livekit-client';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { toast } from 'react-hot-toast';

interface LiveKitVideoCallProps {
  targetUserId: string;
  targetUsername: string;
}

type CallState = 'idle' | 'calling' | 'receiving' | 'in-call';

interface IncomingCallData {
  caller_id: string;
  caller_name: string;
  caller_full_name: string;
  caller_avatar?: string;
  room_name: string;
  call_id: string;
}

// Custom video layout component
const VideoCallLayout: React.FC = () => {
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  console.log('VideoCallLayout - Participants:', participants.length, 'Tracks:', tracks.length);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Video area with responsive grid */}
      <div className="flex-1 p-4">
        <div className={`
          h-full gap-4 
          ${tracks.length === 1 ? 'flex justify-center items-center' : ''}
          ${tracks.length === 2 ? 'grid grid-cols-1 lg:grid-cols-2' : ''}
          ${tracks.length > 2 ? 'grid grid-cols-2' : ''}
        `}>
          {tracks.map((track, index) => {
            return (
              <ParticipantTile
                key={`${track.participant.identity}-${track.source}`}
                participant={track.participant}
                source={track.source}
                className="rounded-lg overflow-hidden bg-gray-900 w-full h-full"
                style={{ 
                  minHeight: tracks.length === 1 ? '400px' : '300px',
                  aspectRatio: '16/9'
                }}
              />
            );
          })}
          
          {/* Show placeholder only if no tracks at all */}
          {tracks.length === 0 && (
            <div className="rounded-lg bg-gray-800 flex items-center justify-center h-full">
              <div className="text-white text-center">
                <div className="text-6xl mb-4">📹</div>
                <div className="text-xl">Connecting to video call...</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls at bottom */}
      <div className="p-4 bg-gray-900 border-t border-gray-700">
        <div className="flex justify-center">
          <ControlBar />
        </div>
      </div>

      {/* Audio renderer for audio-only participants */}
      <RoomAudioRenderer />
    </div>
  );
};

// Incoming call modal component
const IncomingCallModal: React.FC<{
  callData: IncomingCallData;
  onAccept: () => void;
  onReject: () => void;
}> = ({ callData, onAccept, onReject }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 text-center">
        <div className="mb-4">
          {callData.caller_avatar ? (
            <img 
              src={callData.caller_avatar} 
              alt={callData.caller_name}
              className="w-20 h-20 rounded-full mx-auto mb-4"
            />
          ) : (
            <div className="w-20 h-20 bg-gray-300 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl">
              👤
            </div>
          )}
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Incoming Video Call
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            {callData.caller_full_name || callData.caller_name} is calling you
          </p>
        </div>
        
        <div className="flex justify-center space-x-4">
          <button
            onClick={onReject}
            className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full flex items-center space-x-2"
          >
            <span>📞</span>
            <span>Decline</span>
          </button>
          <button
            onClick={onAccept}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-full flex items-center space-x-2"
          >
            <span>📹</span>
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const LiveKitVideoCall: React.FC<LiveKitVideoCallProps> = ({ 
  targetUserId, 
  targetUsername 
}) => {
  const { user } = useAuth();
  const { sendCustomEvent } = useWebSocket();
  
  const [callState, setCallState] = useState<CallState>('idle');
  const [token, setToken] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('');
  const [roomName, setRoomName] = useState<string>('');
  const [callId, setCallId] = useState<string>('');
  const [incomingCallData, setIncomingCallData] = useState<IncomingCallData | null>(null);

  // Backend API URL
  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

  // Listen for LiveKit call events
  useEffect(() => {
    const handleCallInvite = (event: CustomEvent) => {
      const data = event.detail as IncomingCallData;
      console.log('Received call invite:', data);
      setIncomingCallData(data);
      setCallState('receiving');
    };

    const handleCallAccepted = (event: CustomEvent) => {
      const data = event.detail;
      console.log('Call accepted:', data);
      if (data.call_id === callId) {
        // The other person accepted our call, start the call
        startLiveKitRoom(data.room_name);
      }
    };

    const handleCallRejected = (event: CustomEvent) => {
      const data = event.detail;
      console.log('Call rejected:', data);
      if (data.call_id === callId) {
        setCallState('idle');
        setCallId('');
        toast.error(`${data.rejecter_name} declined your call`);
      }
    };

    const handleCallEnded = (event: CustomEvent) => {
      const data = event.detail;
      console.log('Call ended:', data);
      if (data.call_id === callId) {
        endCall();
      }
    };

    window.addEventListener('livekit-call-invite', handleCallInvite as EventListener);
    window.addEventListener('livekit-call-accepted', handleCallAccepted as EventListener);
    window.addEventListener('livekit-call-rejected', handleCallRejected as EventListener);
    window.addEventListener('livekit-call-ended', handleCallEnded as EventListener);

    return () => {
      window.removeEventListener('livekit-call-invite', handleCallInvite as EventListener);
      window.removeEventListener('livekit-call-accepted', handleCallAccepted as EventListener);
      window.removeEventListener('livekit-call-rejected', handleCallRejected as EventListener);
      window.removeEventListener('livekit-call-ended', handleCallEnded as EventListener);
    };
  }, [callId]);

  const generateRoomName = useCallback(() => {
    if (!user) return '';
    return [user.id, targetUserId].sort().join('-');
  }, [user, targetUserId]);

  const generateCallId = useCallback(() => {
    return `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const getLiveKitToken = async (roomName: string) => {
    const response = await fetch(`${API_BASE}/livekit/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({
        roomName,
        participantName: user?.username || '',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get LiveKit token');
    }

    const data = await response.json();
    return data;
  };

  const startLiveKitRoom = async (roomName: string) => {
    try {
      const { token: livekitToken, url: livekitServerUrl } = await getLiveKitToken(roomName);
      setToken(livekitToken);
      setServerUrl(livekitServerUrl);
      setRoomName(roomName);
      setCallState('in-call');
    } catch (error) {
      console.error('Error starting LiveKit room:', error);
      toast.error('Failed to start video call');
      setCallState('idle');
    }
  };

  const initiateCall = useCallback(async () => {
    if (!user) {
      toast.error('User not authenticated');
      return;
    }

    const newCallId = generateCallId();
    const newRoomName = generateRoomName();
    
    console.log('Initiating call:', {
      callId: newCallId,
      roomName: newRoomName,
      targetUserId,
      targetUsername,
      currentUserId: user.id
    });
    
    setCallId(newCallId);
    setRoomName(newRoomName);
    setCallState('calling');

    // Send call invitation via WebSocket
    const callInvitation = {
      type: 'livekit_call_invite',
      target_user_id: targetUserId,
      room_name: newRoomName,
      call_id: newCallId
    };
    
    console.log('Sending call invitation via WebSocket:', callInvitation);
    sendCustomEvent(callInvitation);

    toast.success(`Calling ${targetUsername}...`);
  }, [user, targetUserId, targetUsername, generateCallId, generateRoomName, sendCustomEvent]);

  const acceptCall = useCallback(async () => {
    if (!incomingCallData) return;

    // Send acceptance via WebSocket
    sendCustomEvent({
      type: 'livekit_call_accept',
      caller_id: incomingCallData.caller_id,
      call_id: incomingCallData.call_id,
      room_name: incomingCallData.room_name
    });

    // Start the LiveKit room
    setCallId(incomingCallData.call_id);
    await startLiveKitRoom(incomingCallData.room_name);
    setIncomingCallData(null);
  }, [incomingCallData, sendCustomEvent]);

  const rejectCall = useCallback(() => {
    if (!incomingCallData) return;

    // Send rejection via WebSocket
    sendCustomEvent({
      type: 'livekit_call_reject',
      caller_id: incomingCallData.caller_id,
      call_id: incomingCallData.call_id
    });

    setIncomingCallData(null);
    setCallState('idle');
  }, [incomingCallData, sendCustomEvent]);

  const endCall = useCallback(() => {
    // Send call end notification if we're in a call
    if (callState === 'in-call' && callId) {
      sendCustomEvent({
        type: 'livekit_call_end',
        target_user_id: targetUserId,
        call_id: callId
      });
    }

    setCallState('idle');
    setToken('');
    setServerUrl('');
    setRoomName('');
    setCallId('');
    setIncomingCallData(null);
    toast('Call ended');
  }, [callState, callId, targetUserId, sendCustomEvent]);

  const cancelCall = useCallback(() => {
    if (callState === 'calling' && callId) {
      // Send call end to cancel the outgoing call
      sendCustomEvent({
        type: 'livekit_call_end',
        target_user_id: targetUserId,
        call_id: callId
      });
    }
    
    setCallState('idle');
    setCallId('');
    toast('Call cancelled');
  }, [callState, callId, targetUserId, sendCustomEvent]);

  // Room options
  const roomOptions: RoomOptions = {
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
    },
  };

  const onDisconnected = useCallback(() => {
    endCall();
  }, [endCall]);

  // Render incoming call modal
  if (incomingCallData && callState === 'receiving') {
    return (
      <IncomingCallModal
        callData={incomingCallData}
        onAccept={acceptCall}
        onReject={rejectCall}
      />
    );
  }

  // Render calling state
  if (callState === 'calling') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-6xl mb-4">📹</div>
          <h3 className="text-2xl font-semibold mb-2">Calling {targetUsername}...</h3>
          <p className="text-gray-300 mb-6">Waiting for them to answer</p>
          <button
            onClick={cancelCall}
            className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full"
          >
            Cancel Call
          </button>
        </div>
      </div>
    );
  }

  // Render in-call state
  if (callState === 'in-call' && token) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
        <div className="w-full h-full max-w-6xl max-h-full">
          <div className="flex justify-between items-center p-4 bg-gray-800 text-white">
            <h3 className="text-lg font-semibold">
              Video Call with {targetUsername}
            </h3>
            <button
              onClick={endCall}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            >
              End Call
            </button>
          </div>
          
          <div className="h-full">
            <LiveKitRoom
              video={true}
              audio={true}
              token={token}
              serverUrl={serverUrl}
              data-lk-theme="default"
              style={{ height: 'calc(100vh - 80px)' }}
              options={roomOptions}
              onDisconnected={onDisconnected}
            >
              <VideoCallLayout />
            </LiveKitRoom>
          </div>
        </div>
      </div>
    );
  }

  // Render idle state (video call button)
  return (
    <button
      onClick={initiateCall}
      disabled={callState !== 'idle'}
      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
    >
      📹 Video Call
    </button>
  );
};

export default LiveKitVideoCall;