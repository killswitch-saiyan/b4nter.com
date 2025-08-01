import React, { useState, useCallback } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  formatChatMessageLinks,
} from '@livekit/components-react';
import { Room, RoomOptions, VideoPresets } from 'livekit-client';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

// LiveKit styles are handled by the components automatically

interface LiveKitVideoCallProps {
  targetUserId: string;
  targetUsername: string;
}

const LiveKitVideoCall: React.FC<LiveKitVideoCallProps> = ({ 
  targetUserId, 
  targetUsername 
}) => {
  const { user } = useAuth();
  const [token, setToken] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInCall, setIsInCall] = useState(false);

  // Backend API URL
  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

  const startCall = useCallback(async () => {
    if (!user) {
      toast.error('User not authenticated');
      return;
    }

    setIsConnecting(true);
    
    try {
      // Generate room name based on user IDs to ensure same room
      const roomName = [user.id, targetUserId].sort().join('-');
      
      // Get token from backend
      const response = await fetch(`${API_BASE}/livekit/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          roomName,
          participantName: user.username,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get LiveKit token');
      }

      const { token: livekitToken, url: livekitServerUrl } = await response.json();
      setToken(livekitToken);
      setServerUrl(livekitServerUrl);
      setIsInCall(true);
      
      toast.success(`Starting video call with ${targetUsername}`);
      
    } catch (error) {
      console.error('Error starting LiveKit call:', error);
      toast.error('Failed to start video call');
    } finally {
      setIsConnecting(false);
    }
  }, [user, targetUserId, targetUsername]);

  const endCall = useCallback(() => {
    setIsInCall(false);
    setToken('');
    setServerUrl('');
    toast('Call ended');
  }, []);

  const onDisconnected = useCallback(() => {
    setIsInCall(false);
    setToken('');
    setServerUrl('');
  }, []);

  // Room options
  const roomOptions: RoomOptions = {
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
    },
  };

  if (!isInCall) {
    return (
      <button
        onClick={startCall}
        disabled={isConnecting}
        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
      >
        {isConnecting ? 'Connecting...' : '📹 Video Call'}
      </button>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center">
        <div className="text-sm text-gray-600">Getting ready...</div>
      </div>
    );
  }

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
            <VideoConference 
              chatMessageFormatter={formatChatMessageLinks}
            />
          </LiveKitRoom>
        </div>
      </div>
    </div>
  );
};

export default LiveKitVideoCall;