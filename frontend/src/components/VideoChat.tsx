import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { 
  storeSignalingData, 
  getSignalingData, 
  getAllIceCandidates, 
  subscribeToSignaling 
} from '../utils/supabase';

interface VideoChatProps {
  targetUserId: string;
  targetUsername: string;
  isInitiator?: boolean;
  onClose: () => void;
}

const VideoChat: React.FC<VideoChatProps> = ({ targetUserId, targetUsername, isInitiator = false, onClose }) => {
  console.log('📺 VideoChat component mounted!', { targetUserId, targetUsername, isInitiator });
  const { user } = useAuth();
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('new');

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const subscriptionRef = useRef<any>(null);

  // Generate room ID from user IDs (consistent for both users)
  const generateRoomId = () => {
    if (!user) return '';
    return [user.id, targetUserId].sort().join('-video-call');
  };

  // Get user media
  const getUserMedia = async () => {
    console.log('🎥 Requesting media access...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      console.log('🎥 Media stream obtained:', stream);
      console.log('🎥 Local stream tracks:', {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
        active: stream.active
      });
      
      setLocalStream(stream);
      
      // Use setTimeout to ensure the video element is rendered
      setTimeout(() => {
        if (localVideoRef.current) {
          console.log('🎥 Setting srcObject on local video element');
          localVideoRef.current.srcObject = stream;
          console.log('🎥 Local video element updated successfully');
        } else {
          console.error('❌ Local video ref is null!');
        }
      }, 100);
      
      return stream;
    } catch (error) {
      console.error('❌ Failed to get user media:', error);
      toast.error('Failed to access camera/microphone');
      throw error;
    }
  };

  // Create peer connection
  const createPeerConnection = (currentRoomId: string) => {
    console.log('🔗 Creating new peer connection...');
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      console.log('🧊 ICE candidate generated:', event.candidate);
      if (event.candidate) {
        console.log(`🧊 [ICE] Storing ICE candidate for room ${currentRoomId}`);
        storeSignalingData(currentRoomId, 'ice_candidate', event.candidate);
      } else {
        console.log('🧊 [ICE] ICE gathering complete');
      }
    };

    pc.ontrack = (event) => {
      console.log('🎥 Remote track received:', event.streams);
      console.log('🎥 Remote track details:', {
        streamCount: event.streams.length,
        trackKind: event.track.kind,
        trackEnabled: event.track.enabled,
        trackReadyState: event.track.readyState
      });
      
      const stream = event.streams[0];
      if (stream) {
        console.log('🎥 Stream tracks:', {
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
          active: stream.active
        });
        
        setRemoteStream(stream);
        
        // Use setTimeout to ensure the video element is rendered
        setTimeout(() => {
          if (remoteVideoRef.current) {
            console.log('🎥 Setting srcObject on remote video element');
            remoteVideoRef.current.srcObject = stream;
            
            // Force play the remote video
            remoteVideoRef.current.play().catch(error => {
              console.log('🎥 Autoplay failed, user interaction required:', error);
            });
            
            console.log('🎥 Remote video element updated successfully');
          } else {
            console.error('❌ Remote video ref is null!');
          }
        }, 100);
      } else {
        console.error('❌ No stream received in ontrack event!');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`🔗 ICE connection state: ${pc.iceConnectionState}`);
      setConnectionState(pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log(`🔗 Peer connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        console.log('🎉 WebRTC connection successfully established!');
        toast.success('Video call connected!');
      } else if (pc.connectionState === 'failed') {
        console.error('💥 WebRTC connection failed!');
        toast.error('Connection failed');
      }
    };

    return pc;
  };

  // Start call as initiator
  const startCall = async () => {
    console.log('🚀 Starting call as initiator...');

    const currentRoomId = generateRoomId();
    setRoomId(currentRoomId);
    console.log(`🆔 Using room ID: ${currentRoomId}`);

    const stream = await getUserMedia();
    if (!stream) {
      console.error('❌ Failed to get media stream');
      return;
    }

    setIsInitiating(true);
    setIsConnected(true);

    // Create peer connection
    const pc = createPeerConnection(currentRoomId);
    peerConnectionRef.current = pc;

    // Add local stream to peer connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
      console.log(`📤 Added ${track.kind} track to peer connection`);
    });

    // Create and set offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Store offer for the other peer using Supabase
    await storeSignalingData(currentRoomId, 'offer', offer);
    console.log('📞 Offer created and stored for room:', currentRoomId);

    // Set up real-time subscription for signaling (caller waits for receiver's answer)
    const subscription = subscribeToSignaling(currentRoomId, async (type, data) => {
      console.log(`📨 Caller received signaling:`, type);
      
      if (type === 'answer' && peerConnectionRef.current) {
        console.log('📞 Processing receiver\'s answer...');
        try {
          await peerConnectionRef.current.setRemoteDescription(data as unknown as RTCSessionDescriptionInit);
          console.log('✅ Remote description set from receiver\'s answer');
        } catch (error) {
          console.error('❌ Error processing answer:', error);
        }
      } else if (type === 'ice_candidate' && peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(data as unknown as RTCIceCandidateInit);
          console.log('🧊 Caller added ICE candidate from receiver');
        } catch (error) {
          console.error('❌ Error adding ICE candidate:', error);
        }
      }
    });
    subscriptionRef.current = subscription;

    toast.success(`Call started with ${targetUsername}!`);
  };

  // Join existing call (receiver - waits for caller's offer and responds with answer)
  const joinCall = async () => {
    const currentRoomId = generateRoomId();
    setRoomId(currentRoomId);
    console.log('🔗 Receiver joining call in room:', currentRoomId);

    const stream = await getUserMedia();
    if (!stream) return;

    setIsConnected(true);

    // Create peer connection
    const pc = createPeerConnection(currentRoomId);
    peerConnectionRef.current = pc;

    // Add local stream
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
      console.log(`📤 Receiver added ${track.kind} track to peer connection`);
    });

    // Set up subscription to wait for caller's offer
    const subscription = subscribeToSignaling(currentRoomId, async (type, data) => {
      console.log(`📨 Receiver received signaling:`, type);
      
      if (type === 'offer' && peerConnectionRef.current) {
        console.log('📞 Processing caller\'s offer...');
        try {
          // Set the caller's offer as remote description
          await peerConnectionRef.current.setRemoteDescription(data as unknown as RTCSessionDescriptionInit);
          console.log('✅ Remote description set from caller\'s offer');
          
          // Create answer in response
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          console.log('📝 Answer created');
          
          // Send answer back to caller
          await storeSignalingData(currentRoomId, 'answer', answer);
          console.log('📤 Answer sent to caller');
        } catch (error) {
          console.error('❌ Error processing offer:', error);
        }
      } else if (type === 'ice_candidate' && peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(data as unknown as RTCIceCandidateInit);
          console.log('🧊 Receiver added ICE candidate from caller');
        } catch (error) {
          console.error('❌ Error adding ICE candidate:', error);
        }
      }
    });
    subscriptionRef.current = subscription;

    // Check if there's already an offer waiting
    const existingOffer = await getSignalingData(currentRoomId, 'offer');
    if (existingOffer && peerConnectionRef.current) {
      console.log('📞 Found existing offer, processing...');
      try {
        await peerConnectionRef.current.setRemoteDescription(existingOffer as unknown as RTCSessionDescriptionInit);
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        await storeSignalingData(currentRoomId, 'answer', answer);
        console.log('📤 Answer sent in response to existing offer');
      } catch (error) {
        console.error('❌ Error processing existing offer:', error);
      }
    }

    toast.success(`Joined call with ${targetUsername}!`);
  };

  // End call
  const endCall = () => {
    console.log('📞 Ending call...');
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    // Clean up Supabase subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }

    setRemoteStream(null);
    setIsConnected(false);
    setIsInitiating(false);
    setConnectionState('new');

    toast('Call ended');
    onClose();
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        toast(audioTrack.enabled ? 'Microphone on' : 'Microphone off');
      }
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        toast(videoTrack.enabled ? 'Camera on' : 'Camera off');
      }
    }
  };

  // Auto-setup when component mounts
  useEffect(() => {
    console.log('🎬 VideoChat useEffect triggered', { isInitiator, user: user?.username });
    
    // Automatically start or join call based on role
    const initializeCall = async () => {
      try {
        if (isInitiator) {
          console.log('🚀 Initiating call...');
          await startCall();
        } else {
          console.log('🔗 Joining call...');
          await joinCall();
        }
      } catch (error) {
        console.error('❌ Failed to initialize call:', error);
        toast.error('Failed to initialize video call');
        onClose();
      }
    };

    // Small delay to ensure proper initialization
    const timer = setTimeout(() => {
      console.log('⏰ Timer fired, initializing call...');
      initializeCall();
    }, 500);

    return () => {
      console.log('🧹 VideoChat cleanup');
      clearTimeout(timer);
      endCall();
    };
  }, [isInitiator]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center">
      <div className="w-full h-full max-w-7xl max-h-full bg-gray-900 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-gray-800 text-white border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold">
              {isConnected ? `Video Call with ${targetUsername} (${connectionState})` : `Video Call with ${targetUsername}`}
            </h3>
            {user && (
              <div className="text-sm text-gray-300">
                You: {user.username}
              </div>
            )}
          </div>
          <button
            onClick={endCall}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {isConnected ? 'End Call' : 'Close'}
          </button>
        </div>

        {/* Connecting state */}
        {!isConnected && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full text-center">
              <h4 className="text-xl font-semibold text-white mb-6">
                {isInitiator ? 'Connecting...' : 'Joining call...'}
              </h4>
              
              <div className="space-y-4">
                <div className="text-center text-gray-300 mb-6">
                  {isInitiator 
                    ? `Calling ${targetUsername}...` 
                    : `Connecting to ${targetUsername}'s call...`
                  }
                </div>
                
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Call Interface */}
        {isConnected && (
          <>
            {/* Video Grid */}
            <div className="flex-1 p-4 h-full overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-full">
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

                {/* Remote Video */}
                <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
                  {remoteStream ? (
                    <>
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                        style={{ backgroundColor: '#000' }}
                      />
                      <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-sm">
                        {targetUsername}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <div className="text-center">
                        <div className="text-4xl mb-4">👤</div>
                        <div className="text-lg">Waiting for {targetUsername}...</div>
                        <div className="text-sm mt-2">
                          {isInitiating 
                            ? 'Call started, waiting for them to join' 
                            : 'Connecting to video call...'
                          }
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="p-4 bg-gray-800 border-t border-gray-700">
              <div className="flex justify-center space-x-4">
                <button
                  onClick={toggleAudio}
                  className={`px-6 py-3 rounded-full font-medium transition-colors ${
                    isAudioEnabled 
                      ? 'bg-gray-600 hover:bg-gray-500 text-white' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {isAudioEnabled ? '🎤 Mute' : '🎤 Unmute'}
                </button>
                
                <button
                  onClick={toggleVideo}
                  className={`px-6 py-3 rounded-full font-medium transition-colors ${
                    isVideoEnabled 
                      ? 'bg-gray-600 hover:bg-gray-500 text-white' 
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {isVideoEnabled ? '📹 Stop Video' : '📹 Start Video'}
                </button>
                
                <button
                  onClick={endCall}
                  className="px-6 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                >
                  📞 End Call
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoChat;