import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebRTCVideoChat } from '../hooks/useWebRTCVideoChat';
import { toast } from 'react-hot-toast';

interface MultiUserVideoChatProps {
  onClose: () => void;
}

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
                    <div key={participantId} className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
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
                      <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-sm">
                        {participant?.name || `User ${participantId.slice(0, 8)}`}
                      </div>
                    </div>
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