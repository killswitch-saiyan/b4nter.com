import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useSFUConnection } from '../hooks/useSFUConnection';
import { toast } from 'react-hot-toast';

interface VideoChatProps {
  targetUserId: string;
  targetUsername: string;
  roomId?: string;
  onClose: () => void;
}

interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
}

const VideoChat: React.FC<VideoChatProps> = ({ targetUserId, targetUsername, roomId: initialRoomId, onClose }) => {
  const { user } = useAuth();
  const { sendCustomEvent } = useWebSocket();
  
  const [roomId, setRoomId] = useState<string>('');
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const {
    participants,
    localStream,
    remoteStreams,
    isAudioEnabled,
    isVideoEnabled,
    isConnected,
    connectToSFU,
    disconnect,
    initializeMedia,
    toggleAudio,
    toggleVideo,
    peerConnections
  } = useSFUConnection();

  // Generate room ID from user IDs (same room for both users)
  const generateRoomId = () => {
    if (!user) return '';
    return [user.id, targetUserId].sort().join('-video-room');
  };

  // Initialize media and setup video
  useEffect(() => {
    const setupVideo = async () => {
      try {
        const stream = await initializeMedia();
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // If initialRoomId is provided, automatically join the room (for accepting calls)
        if (initialRoomId && user) {
          console.log('Auto-joining room:', initialRoomId);
          setRoomId(initialRoomId);
          try {
            await connectToSFU(initialRoomId, user.username, stream);
            console.log('Successfully auto-joined room:', initialRoomId);
          } catch (error) {
            console.error('Failed to auto-join room:', error);
            toast.error('Failed to join video call: ' + error.message);
          }
        }
      } catch (error) {
        console.error('Failed to initialize media:', error);
        toast.error('Failed to access camera/microphone');
      }
    };

    setupVideo();

    return () => {
      // Cleanup on unmount
      disconnect();
    };
  }, [initialRoomId, user]);

  // Connect to video room
  const startVideoCall = async () => {
    if (!user || !localStream) return;
    
    const room = generateRoomId();
    setRoomId(room);
    
    try {
      console.log('Starting video call with room:', room);
      console.log('Local stream tracks:', localStream.getTracks().map(t => t.kind));
      
      await connectToSFU(room, user.username, localStream);
      
      // Send invitation to target user
      sendCustomEvent({
        type: 'video_call_invite',
        target_user_id: targetUserId,
        room_id: room,
        caller_name: user.username,
        caller_id: user.id
      });
      
      toast.success(`Calling ${targetUsername}...`);
    } catch (error) {
      console.error('Failed to start video call:', error);
      toast.error('Failed to start video call: ' + error.message);
    }
  };

  // Join existing video room (when accepting call)
  const joinVideoCall = async (roomId: string) => {
    if (!user || !localStream) return;
    
    try {
      console.log('Joining video call with room:', roomId);
      console.log('Local stream tracks:', localStream.getTracks().map(t => t.kind));
      
      await connectToSFU(roomId, user.username, localStream);
      setIsConnected(true);
      setRoomId(roomId);
      
      console.log('Successfully joined video call');
    } catch (error) {
      console.error('Failed to join video call:', error);
      toast.error('Failed to join video call: ' + error.message);
    }
  };

  // End video call
  const endCall = () => {
    // Notify other user before disconnecting
    if (roomId) {
      sendCustomEvent({
        type: 'video_call_end',
        target_user_id: targetUserId,
        room_id: roomId
      });
    }
    
    // Disconnect from SFU (this will handle all cleanup)
    disconnect();
    
    onClose();
    toast('Call ended');
  };

  // Handle audio toggle
  const handleToggleAudio = () => {
    const newState = toggleAudio();
    setIsAudioEnabled(newState);
  };

  // Handle video toggle
  const handleToggleVideo = () => {
    const newState = toggleVideo();
    setIsVideoEnabled(newState);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
      <div className="w-full h-full max-w-6xl max-h-full bg-gray-900 rounded-lg overflow-hidden">
        {/* Header */}
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

        {/* Video Grid */}
        <div className="flex-1 p-4 h-full">
          {!isConnected ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-white">
                <div className="mb-8">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-64 h-48 bg-gray-800 rounded-lg mx-auto"
                  />
                </div>
                <button
                  onClick={startVideoCall}
                  className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg text-lg"
                >
                  Start Video Call
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
              {/* Local Video */}
              <div className="relative bg-gray-800 rounded-lg overflow-hidden">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  You ({user?.username})
                </div>
              </div>

              {/* Remote Videos */}
              {Array.from(remoteStreams.entries()).map(([participantId, stream]) => (
                <div key={participantId} className="relative bg-gray-800 rounded-lg overflow-hidden">
                  <video
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    ref={(video) => {
                      if (video && stream) {
                        video.srcObject = stream;
                      }
                    }}
                  />
                  <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                    {targetUsername}
                  </div>
                </div>
              ))}

              {/* Placeholder for remote user if not connected */}
              {remoteStreams.size === 0 && (
                <div className="bg-gray-800 rounded-lg flex items-center justify-center">
                  <div className="text-white text-center">
                    <div className="text-4xl mb-2">👤</div>
                    <div>Waiting for {targetUsername}...</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        {isConnected && (
          <div className="p-4 bg-gray-800 flex justify-center space-x-4">
            <button
              onClick={handleToggleAudio}
              className={`px-4 py-2 rounded-full ${
                isAudioEnabled 
                  ? 'bg-gray-600 hover:bg-gray-700' 
                  : 'bg-red-500 hover:bg-red-600'
              } text-white`}
            >
              {isAudioEnabled ? '🎤' : '🎤'} {isAudioEnabled ? 'Mute' : 'Unmute'}
            </button>
            
            <button
              onClick={handleToggleVideo}
              className={`px-4 py-2 rounded-full ${
                isVideoEnabled 
                  ? 'bg-gray-600 hover:bg-gray-700' 
                  : 'bg-red-500 hover:bg-red-600'
              } text-white`}
            >
              {isVideoEnabled ? '📹' : '📹'} {isVideoEnabled ? 'Stop Video' : 'Start Video'}
            </button>
            
            <button
              onClick={endCall}
              className="px-4 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white"
            >
              📞 End Call
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoChat;