import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { 
  storeSignalingData, 
  getSignalingData, 
  getAllIceCandidates, 
  subscribeToSignaling 
} from '../utils/supabase';

interface WorkingVideoChatProps {
  onClose: () => void;
}

const WorkingVideoChat: React.FC<WorkingVideoChatProps> = ({ onClose }) => {
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

  // Generate random room ID
  const generateRoomId = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(id);
    return id;
  };

  // Copy room ID to clipboard
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success('Room ID copied! Share with your friend.');
    } catch (err) {
      toast.error('Failed to copy room ID');
    }
  };

  // Initialize media stream
  const initializeMedia = async () => {
    try {
      console.log('🎥 Requesting media access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('🎥 Media stream obtained:', stream);
      setLocalStream(stream);

      // Set local video immediately
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('🎥 Local video element updated');
      }

      return stream;
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      toast.error('Please allow access to camera and microphone');
      return null;
    }
  };

  // Create peer connection
  const createPeerConnection = () => {
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
        console.log(`🧊 [ICE] Storing ICE candidate for room ${roomId}`);
        storeSignalingData(roomId, 'ice_candidate', event.candidate);
      } else {
        console.log('🧊 [ICE] ICE gathering complete');
      }
    };

    pc.ontrack = (event) => {
      console.log('🎥 Remote track received:', event.streams);
      const stream = event.streams[0];
      setRemoteStream(stream);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        console.log('🎥 Remote video element updated successfully');
        
        // Force play the remote video
        remoteVideoRef.current.play().catch(error => {
          console.log('🎥 Autoplay failed, user interaction required:', error);
        });
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

    let currentRoomId = roomId;
    if (!currentRoomId) {
      currentRoomId = generateRoomId();
      console.log(`🆔 Generated new room ID: ${currentRoomId}`);
    }

    const stream = await initializeMedia();
    if (!stream) {
      console.error('❌ Failed to get media stream');
      return;
    }

    setIsInitiating(true);
    setIsConnected(true);

    // Create peer connection
    const pc = createPeerConnection();
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

    // Set up real-time subscription for signaling
    const subscription = subscribeToSignaling(currentRoomId, async (type, data) => {
      if (type === 'answer' && peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(data as unknown as RTCSessionDescriptionInit);
        console.log('📞 Answer received via real-time');

        // After setting remote description, get all existing ICE candidates from joiner
        const existingCandidates = await getAllIceCandidates(currentRoomId);
        const joinersCandidate = existingCandidates.filter((_, index) => index > 0); // Skip initiator's candidates
        console.log(`Found ${joinersCandidate.length} joiner ICE candidates`);

        for (const candidate of joinersCandidate) {
          try {
            await peerConnectionRef.current.addIceCandidate(candidate as unknown as RTCIceCandidateInit);
            console.log('Added joiner ICE candidate');
          } catch (error) {
            console.error('Error adding joiner ICE candidate:', error);
          }
        }
      } else if (type === 'ice_candidate' && peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(data as unknown as RTCIceCandidateInit);
        console.log('🧊 ICE candidate received via real-time');
      }
    });
    subscriptionRef.current = subscription;

    toast.success(`Call started! Room ID: ${currentRoomId}`);
  };

  // Join existing call
  const joinCall = async () => {
    if (!roomId) {
      toast.error('Please enter a room ID to join');
      return;
    }

    console.log('🔗 Joining call in room:', roomId);

    const stream = await initializeMedia();
    if (!stream) return;

    setIsConnected(true);

    // Create peer connection
    const pc = createPeerConnection();
    peerConnectionRef.current = pc;

    // Add local stream
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
      console.log(`📤 Added ${track.kind} track to peer connection`);
    });

    // Get stored offer from Supabase
    const storedOffer = await getSignalingData(roomId, 'offer');
    if (!storedOffer) {
      toast.error('Room not found or no active call');
      setIsConnected(false);
      return;
    }

    // Set remote description and create answer
    await pc.setRemoteDescription(storedOffer as unknown as RTCSessionDescriptionInit);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Store answer using Supabase
    await storeSignalingData(roomId, 'answer', answer);
    console.log('📞 Answer created and stored for room:', roomId);

    // Get and add all existing ICE candidates from the initiator
    const existingCandidates = await getAllIceCandidates(roomId);
    console.log(`Found ${existingCandidates.length} existing ICE candidates`);

    for (const candidate of existingCandidates) {
      try {
        await pc.addIceCandidate(candidate as unknown as RTCIceCandidateInit);
        console.log('Added existing ICE candidate');
      } catch (error) {
        console.error('Error adding existing ICE candidate:', error);
      }
    }

    // Set up real-time subscription for new ICE candidates
    const subscription = subscribeToSignaling(roomId, async (type, data) => {
      if (type === 'ice_candidate' && peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(data as unknown as RTCIceCandidateInit);
        console.log('🧊 ICE candidate received via real-time');
      }
    });
    subscriptionRef.current = subscription;

    toast.success('Joined call successfully!');
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center">
      <div className="w-full h-full max-w-7xl max-h-full bg-gray-900 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-gray-800 text-white border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold">
              {isConnected ? `Room: ${roomId} (${connectionState})` : 'Working Video Chat'}
            </h3>
            {user && (
              <div className="text-sm text-gray-300">
                User: {user.username}
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

        {/* Room Setup */}
        {!isConnected && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full">
              <h4 className="text-xl font-semibold text-white mb-6 text-center">
                Start or Join a Video Call
              </h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Room ID:
                  </label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="Enter room ID or generate new"
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={generateRoomId}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Generate Room
                  </button>
                  {roomId && (
                    <button
                      onClick={copyRoomId}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                    >
                      Copy
                    </button>
                  )}
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={startCall}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Start Call
                  </button>
                  <button
                    onClick={joinCall}
                    disabled={!roomId.trim()}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Join Call
                  </button>
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
                        Remote User
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <div className="text-center">
                        <div className="text-4xl mb-4">👤</div>
                        <div className="text-lg">Waiting for remote user...</div>
                        <div className="text-sm mt-2">Share room ID: <strong>{roomId}</strong></div>
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
                  onClick={copyRoomId}
                  className="px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                >
                  📋 Share Room
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

export default WorkingVideoChat;
