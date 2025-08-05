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

interface RemoteVideoElementProps {
  participantId: string;
  stream: MediaStream;
  participantName: string;
}

const RemoteVideoElement: React.FC<RemoteVideoElementProps> = ({ participantId, stream, participantName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStatus, setVideoStatus] = useState<string>('loading');
  const [streamInfo, setStreamInfo] = useState<string>('');

  useEffect(() => {
    if (!videoRef.current || !stream) {
      setVideoStatus('no-stream');
      setStreamInfo('No stream available');
      return;
    }

    const video = videoRef.current;
    console.log('🎥 Setting remote video stream for:', participantId, stream);
    console.log('🎥 Stream active:', stream.active);
    console.log('🎥 Stream tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
    
    // Update stream info for debugging
    const tracks = stream.getTracks();
    const videoTracks = tracks.filter(t => t.kind === 'video');
    const audioTracks = tracks.filter(t => t.kind === 'audio');
    setStreamInfo(`V:${videoTracks.length}(${videoTracks.map(t => t.enabled ? 'on' : 'off').join(',')}) A:${audioTracks.length}(${audioTracks.map(t => t.enabled ? 'on' : 'off').join(',')})`);
    
    // Clear any existing srcObject first
    video.srcObject = null;
    
    // Small delay to ensure clean state
    setTimeout(() => {
      if (video && stream) {
        console.log('🎥 Assigning stream to video element');
        video.srcObject = stream;
        setVideoStatus('assigned');
        
        // Force load the video
        video.load();
      }
    }, 100);
    
    // Add comprehensive event listeners
    video.onloadstart = () => {
      console.log('🎥 Video load started for:', participantId);
      setVideoStatus('load-started');
    };
    
    video.onloadeddata = () => {
      console.log('🎥 Video data loaded for:', participantId);
      setVideoStatus('data-loaded');
    };
    
    video.onloadedmetadata = () => {
      console.log('🎥 Video metadata loaded for:', participantId);
      console.log('🎥 Video dimensions:', video.videoWidth, 'x', video.videoHeight);
      console.log('🎥 Video duration:', video.duration);
      setVideoStatus(`metadata-${video.videoWidth}x${video.videoHeight}`);
    };
    
    video.oncanplay = () => {
      console.log('🎥 Video can play for:', participantId);
      setVideoStatus('can-play');
      // Try to play as soon as we can
      video.play().catch(e => {
        console.warn('🎥 Could not autoplay video for:', participantId, e);
        setVideoStatus('play-blocked');
      });
    };
    
    video.onplay = () => {
      console.log('🎥 Video started playing for:', participantId);
      setVideoStatus('playing');
    };
    
    video.onplaying = () => {
      console.log('🎥 Video is playing for:', participantId);
      setVideoStatus('playing-active');
    };
    
    video.onstalled = () => {
      console.warn('🎥 Video stalled for:', participantId);
      setVideoStatus('stalled');
    };
    
    video.onsuspend = () => {
      console.warn('🎥 Video suspended for:', participantId);
      setVideoStatus('suspended');
    };
    
    video.onwaiting = () => {
      console.warn('🎥 Video waiting for:', participantId);
      setVideoStatus('waiting');
    };
    
    video.onerror = (e) => {
      console.error('🎥 Video error for:', participantId, e);
      console.error('🎥 Video error details:', video.error);
      setVideoStatus(`error-${video.error?.code || 'unknown'}`);
    };
    
    video.onabort = () => {
      console.warn('🎥 Video aborted for:', participantId);
      setVideoStatus('aborted');
    };

    // Cleanup function
    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream, participantId]);

  // Manual play button for debugging
  const handleManualPlay = () => {
    if (videoRef.current) {
      console.log('🎥 Manual play attempt for:', participantId);
      videoRef.current.play().then(() => {
        console.log('🎥 Manual play succeeded for:', participantId);
        setVideoStatus('manual-playing');
      }).catch(e => {
        console.error('🎥 Manual play failed for:', participantId, e);
        setVideoStatus('manual-failed');
      });
    }
  };

  return (
    <div className="relative bg-gray-800 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        controls={false}
        className="w-full h-full object-cover"
        style={{ 
          backgroundColor: '#1f2937',
          minHeight: '200px',
          minWidth: '300px',
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          zIndex: 1
        }}
      />
      
      {/* Debug overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
          <div>Status: {videoStatus}</div>
          <div>Stream: {streamInfo}</div>
          <div>Participant: {participantId}</div>
        </div>
        
        {/* Manual play button for debugging */}
        <button
          onClick={handleManualPlay}
          className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs pointer-events-auto"
        >
          ▶ Play
        </button>
      </div>
      
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
        {participantName}
      </div>
    </div>
  );
};

const VideoChat: React.FC<VideoChatProps> = ({ targetUserId, targetUsername, roomId: initialRoomId, onClose }) => {
  const { user } = useAuth();
  const { sendCustomEvent, onWebRTCMessage } = useWebSocket();
  
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

  // Sync localStream to video element whenever it changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log('🎥 Setting local video stream:', localStream);
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Sync remoteStreams to video elements
  useEffect(() => {
    console.log('🎥 Remote streams updated:', remoteStreams.size);
    console.log('🎥 Remote streams entries:', Array.from(remoteStreams.entries()));
  }, [remoteStreams]);

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
  };

  // Handle video toggle
  const handleToggleVideo = () => {
    const newState = toggleVideo();
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
                  style={{ 
                    backgroundColor: '#1f2937',
                    minHeight: '200px',
                    minWidth: '300px',
                    display: 'block',
                    visibility: 'visible',
                    opacity: 1
                  }}
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  You ({user?.username})
                </div>
                <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
                  LOCAL: {localStream ? 'STREAM OK' : 'NO STREAM'}
                </div>
              </div>

              {/* Remote Videos */}
              {(() => {
                const entries = Array.from(remoteStreams.entries());
                console.log('🎥 About to render remote videos. Map size:', remoteStreams.size);
                console.log('🎥 Map entries:', entries);
                console.log('🎥 Current user name for filtering:', user?.username);
                
                return entries.map(([participantId, stream]) => {
                  console.log('🎥 Rendering remote video for:', participantId, stream);
                  console.log('🎥 Stream is MediaStream?', stream instanceof MediaStream);
                  console.log('🎥 Stream active?', stream?.active);
                  
                  return (
                    <RemoteVideoElement 
                      key={participantId}
                      participantId={participantId}
                      stream={stream}
                      participantName={targetUsername}
                    />
                  );
                });
              })()}

              {/* Placeholder for remote user if not connected */}
              {remoteStreams.size === 0 && (
                <div className="bg-gray-800 rounded-lg flex items-center justify-center border-2 border-yellow-500">
                  <div className="text-white text-center">
                    <div className="text-4xl mb-2">👤</div>
                    <div>Waiting for {targetUsername}...</div>
                    <div className="text-xs text-gray-400 mt-2">
                      Participants: {participants.length} | Streams: {remoteStreams.size}
                    </div>
                    <div className="text-xs text-red-400 mt-1">
                      Connected: {isConnected ? 'YES' : 'NO'}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Debug info when we have streams */}
              {remoteStreams.size > 0 && (
                <div className="absolute top-4 left-4 bg-green-500 text-white p-2 rounded text-xs z-10">
                  DEBUG: {remoteStreams.size} stream(s) detected
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