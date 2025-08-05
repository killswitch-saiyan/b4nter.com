import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebRTCVideoChat } from '../hooks/useWebRTCVideoChat';
import { toast } from 'react-hot-toast';

interface MultiUserVideoChatProps {
  onClose: () => void;
}

interface RemoteVideoPlayerProps {
  participantId: string;
  stream: MediaStream;
  participantName: string;
}

const RemoteVideoPlayer: React.FC<RemoteVideoPlayerProps> = ({ participantId, stream, participantName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    console.log(`🎥 Current user name: ${participantName}`);
    console.log(`🎥 *** ABOUT TO RENDER REMOTE VIDEO ***`);
    console.log(`🎥 Participant ID: ${participantId}`);
    console.log(`🎥 Stream object:`, stream);
    console.log(`🎥 Stream is MediaStream?`, stream instanceof MediaStream);
    console.log(`🎥 Stream active?`, stream.active);
    console.log(`🎥 Stream tracks:`, stream.getTracks().map(t => t.kind));
    
    // Detailed track analysis
    const tracks = stream.getTracks();
    console.log(`🎥 *** DETAILED TRACK ANALYSIS ***`);
    tracks.forEach((track, index) => {
      console.log(`🎥 Track ${index}:`, {
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        id: track.id,
        label: track.label
      });
    });
    
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    console.log(`🎥 Video tracks count: ${videoTracks.length}`);
    console.log(`🎥 Audio tracks count: ${audioTracks.length}`);
    
    if (videoTracks.length > 0) {
      const videoTrack = videoTracks[0];
      console.log(`🎥 Video track details:`, {
        enabled: videoTrack.enabled,
        muted: videoTrack.muted,
        readyState: videoTrack.readyState,
        settings: videoTrack.getSettings ? videoTrack.getSettings() : 'getSettings not available'
      });
    } else {
      console.error(`🎥 ❌ NO VIDEO TRACKS FOUND in stream for ${participantId}`);
    }

    // Set the stream
    video.srcObject = stream;
    setHasError(false);

    // Handle video events
    const handleLoadedMetadata = () => {
      console.log(`🎥 *** RENDERING REMOTE VIDEOS ***`);
      console.log(`🎥 Video metadata loaded for ${participantId}`);
      video.play().then(() => {
        console.log(`🎥 Video playing successfully for ${participantId}`);
        setIsPlaying(true);
      }).catch(error => {
        console.error(`🎥 Failed to play video for ${participantId}:`, error);
        setHasError(true);
      });
    };

    const handleError = (error: Event) => {
      console.error(`🎥 Video error for ${participantId}:`, error);
      setHasError(true);
    };

    const handlePlay = () => {
      console.log(`🎥 Video started playing for ${participantId}`);
      setIsPlaying(true);
    };

    const handlePause = () => {
      console.log(`🎥 Video paused for ${participantId}`);
      setIsPlaying(false);
    };

    // Add event listeners
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    // Cleanup
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [stream, participantId, participantName]);

  const handlePlayClick = () => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(error => {
        console.error(`🎥 Manual play failed for ${participantId}:`, error);
        setHasError(true);
      });
    }
  };

  return (
    <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-sm">
        {participantName}
      </div>
      {!isPlaying && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={handlePlayClick}
            className="bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-full transition-colors"
          >
            ▶️ Play
          </button>
        </div>
      )}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-50">
          <div className="text-center text-white">
            <div className="text-2xl mb-2">⚠️</div>
            <div className="text-sm">Video Error</div>
            <button
              onClick={handlePlayClick}
              className="mt-2 bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {/* Debug info overlay */}
      <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white p-2 rounded text-xs max-w-xs">
        <div>Stream Active: {stream?.active ? '✅' : '❌'}</div>
        <div>Video Tracks: {stream?.getVideoTracks().length || 0}</div>
        <div>Audio Tracks: {stream?.getAudioTracks().length || 0}</div>
        <div>Playing: {isPlaying ? '✅' : '❌'}</div>
        <div>Error: {hasError ? '❌' : '✅'}</div>
        <button
          onClick={() => {
            console.log('🔍 MANUAL DEBUG - Stream details:', {
              stream,
              active: stream?.active,
              videoTracks: stream?.getVideoTracks(),
              audioTracks: stream?.getAudioTracks(),
              videoElement: videoRef.current,
              videoSrcObject: videoRef.current?.srcObject
            });
          }}
          className="mt-1 bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs"
        >
          Debug Log
        </button>
      </div>
    </div>
  );
};

const MultiUserVideoChat: React.FC<MultiUserVideoChatProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [channelId, setChannelId] = useState<string>('');
  const [showChannelInput, setShowChannelInput] = useState(true);
  const [availableChannels] = useState(['Video-Channel 1', 'Video-Channel 2', 'Video-Channel 3', 'Video-Channel 4', 'Video-Channel 5']);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  const {
    participants,
    localStream,
    remoteStreams,
    isConnected,
    isAudioEnabled,
    isVideoEnabled,
    connectToChannel,
    disconnect,
    toggleAudio,
    toggleVideo,
    participantId
  } = useWebRTCVideoChat();

  // Set up local video when stream is available
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Generate a random channel ID
  const generateChannelId = () => {
    const randomChannel = availableChannels[Math.floor(Math.random() * availableChannels.length)];
    setChannelId(randomChannel);
  };

  // Copy channel ID to clipboard
  const copyChannelId = async () => {
    if (channelId) {
      try {
        await navigator.clipboard.writeText(channelId);
        toast.success('Channel ID copied to clipboard!');
      } catch (error) {
        toast.error('Failed to copy channel ID');
      }
    }
  };

  // Start or join video call
  const startVideoCall = async () => {
    if (!channelId.trim()) {
      toast.error('Please enter or generate a channel ID');
      return;
    }

    if (!user) {
      toast.error('User not authenticated');
      return;
    }

    try {
      await connectToChannel(channelId.trim());
      setShowChannelInput(false);
      toast.success(`Connected to ${channelId}`);
    } catch (error) {
      console.error('Failed to start video call:', error);
      toast.error(`Failed to connect: ${error.message}`);
    }
  };

  // End video call
  const endCall = () => {
    disconnect();
    setShowChannelInput(true);
    setChannelId('');
    toast('Call ended');
    onClose();
  };

  // Handle audio toggle
  const handleToggleAudio = () => {
    const newState = toggleAudio();
    toast(newState ? 'Microphone on' : 'Microphone off');
  };

  // Handle video toggle
  const handleToggleVideo = () => {
    const newState = toggleVideo();
    toast(newState ? 'Camera on' : 'Camera off');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center">
      <div className="w-full h-full max-w-7xl max-h-full bg-gray-900 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-gray-800 text-white border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold">
              {isConnected ? `${channelId} (${participants.length + 1} participants)` : 'Multi-User Video Chat'}
            </h3>
            {isConnected && (
              <div className="text-sm text-gray-300">
                Participant ID: {participantId.slice(0, 8)}...
              </div>
            )}
          </div>
          <button
            onClick={endCall}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {isConnected ? 'Leave Call' : 'Close'}
          </button>
        </div>

        {/* Channel Selection */}
        {showChannelInput && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full">
              <h4 className="text-xl font-semibold text-white mb-6 text-center">
                Join a Video Channel
              </h4>
              
              <div className="space-y-4">
                {/* Quick Channel Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Quick Select:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {availableChannels.slice(0, 4).map((channel) => (
                      <button
                        key={channel}
                        onClick={() => setChannelId(channel)}
                        className={`px-3 py-2 rounded text-sm transition-colors ${
                          channelId === channel
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Manual Channel Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Or enter channel name:
                  </label>
                  <input
                    type="text"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    placeholder="Enter channel name..."
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    onKeyPress={(e) => e.key === 'Enter' && startVideoCall()}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={generateChannelId}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Random Channel
                  </button>
                  {channelId && (
                    <button
                      onClick={copyChannelId}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                      Copy
                    </button>
                  )}
                </div>

                <button
                  onClick={startVideoCall}
                  disabled={!channelId.trim()}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition-colors"
                >
                  Join Channel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Video Call Interface */}
        {isConnected && (
          <>
            {/* Video Grid */}
            <div className="flex-1 p-4 h-full overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 min-h-full">
                {/* Local Video */}
                <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-sm">
                    You ({user?.username})
                  </div>
                  <div className="absolute top-2 right-2 flex space-x-1">
                    {!isAudioEnabled && (
                      <div className="bg-red-500 text-white p-1 rounded text-xs">
                        🎤
                      </div>
                    )}
                    {!isVideoEnabled && (
                      <div className="bg-red-500 text-white p-1 rounded text-xs">
                        📹
                      </div>
                    )}
                  </div>
                </div>

                {/* Remote Videos */}
                {Array.from(remoteStreams.entries()).map(([participantId, stream]) => {
                  const participant = participants.find(p => p.id === participantId);
                  return (
                    <RemoteVideoPlayer
                      key={participantId}
                      participantId={participantId}
                      stream={stream}
                      participantName={participant?.name || `User ${participantId.slice(0, 8)}`}
                    />
                  );
                })}

                {/* Placeholder for empty slots */}
                {participants.length === 0 && (
                  <div className="col-span-full flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <div className="text-4xl mb-4">👥</div>
                      <div className="text-lg">Waiting for other participants...</div>
                      <div className="text-sm mt-2">Share the channel name: <strong>{channelId}</strong></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="p-4 bg-gray-800 border-t border-gray-700">
              <div className="flex justify-center space-x-4">
                <button
                  onClick={handleToggleAudio}
                  className={`px-6 py-3 rounded-full font-medium transition-colors ${
                    isAudioEnabled 
                      ? 'bg-gray-600 hover:bg-gray-500 text-white' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {isAudioEnabled ? '🎤 Mute' : '🎤 Unmute'}
                </button>
                
                <button
                  onClick={handleToggleVideo}
                  className={`px-6 py-3 rounded-full font-medium transition-colors ${
                    isVideoEnabled 
                      ? 'bg-gray-600 hover:bg-gray-500 text-white' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {isVideoEnabled ? '📹 Stop Video' : '📹 Start Video'}
                </button>
                
                <button
                  onClick={copyChannelId}
                  className="px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                >
                  📋 Share Channel
                </button>
                
                <button
                  onClick={endCall}
                  className="px-6 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                >
                  📞 Leave Call
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MultiUserVideoChat;
