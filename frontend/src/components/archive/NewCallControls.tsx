import React, { useState, useRef, useEffect } from 'react';
import { useChannels } from '../contexts/ChannelsContext';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { toast } from 'react-hot-toast';
// VERSION 3.0: Force deployment update

interface CallControlsProps {
  targetUserId: string;
  targetUsername: string;
  onCallEnd: () => void;
  socket: WebSocket | null;
  isGlobal?: boolean;
  currentChannelId?: string;
  acceptedCall?: {
    offer: any;
    channelId: string;
    channelName: string;
    isVideo: boolean;
    from: string;
    targetUserId?: string;
  };
}

interface CallState {
  isIncoming: boolean;
  isOutgoing: boolean;
  isConnected: boolean;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isMuted: boolean;
}

const NewCallControls: React.FC<CallControlsProps> = ({ 
  targetUserId, 
  targetUsername, 
  onCallEnd, 
  socket, 
  isGlobal, 
  currentChannelId,
  acceptedCall 
}) => {
  // Create unique component ID for debugging
  const componentId = useRef(`NewCallControls-${Math.random().toString(36).substr(2, 9)}`);
  console.log('🚨 NEW COMPONENT VERSION 2.0 RENDER:', {
    componentId: componentId.current,
    targetUserId,
    targetUsername,
    isGlobal,
    currentChannelId,
    hasAcceptedCall: !!acceptedCall
  });
  const { user } = useAuth();
  const { onWebRTCMessage } = useWebSocket();
  const { createCallChannel, setActiveCallChannelId, activeCallChannelId } = useChannels();
  
  const [callState, setCallState] = useState<CallState>({
    isIncoming: false,
    isOutgoing: false,
    isConnected: false,
    isVideoEnabled: false,
    isAudioEnabled: false,
    isMuted: false
  });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [streamUpdateCounter, setStreamUpdateCounter] = useState(0);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [currentCallChannel, setCurrentCallChannel] = useState<string | null>(null);
  
  // Persistent remote stream for track accumulation
  const persistentRemoteStreamRef = useRef<MediaStream>(new MediaStream());
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callerRingtoneRef = useRef<HTMLAudioElement>(null);

  // Caller ringtone functions
  const playCallerRingtone = () => {
    console.log('🔊 Attempting to play caller ringtone');
    if (callerRingtoneRef.current) {
      callerRingtoneRef.current.loop = true;
      callerRingtoneRef.current.volume = 0.8; // Set volume
      callerRingtoneRef.current.play().then(() => {
        console.log('✅ Caller ringtone started playing');
      }).catch(e => {
        console.error('❌ Failed to play caller ringtone:', e);
        if (e.name === 'NotAllowedError') {
          console.log('🔊 Audio blocked - need user interaction first');
        }
      });
    } else {
      console.error('❌ Caller ringtone ref is null');
    }
  };

  const stopCallerRingtone = () => {
    console.log('🔇 Stopping caller ringtone');
    if (callerRingtoneRef.current) {
      callerRingtoneRef.current.pause();
      callerRingtoneRef.current.currentTime = 0;
      callerRingtoneRef.current.loop = false;
      console.log('✅ Caller ringtone stopped');
    }
  };

  // Initialize audio context on first user interaction
  const initializeCallerAudio = () => {
    if (callerRingtoneRef.current) {
      callerRingtoneRef.current.play().then(() => {
        callerRingtoneRef.current?.pause();
        console.log('✅ Audio context initialized for caller ringtone');
      }).catch(e => {
        console.log('Caller audio initialization failed:', e);
      });
    }
  };

  // Add click listener to initialize audio on any click
  useEffect(() => {
    const handleClick = () => {
      initializeCallerAudio();
      document.removeEventListener('click', handleClick);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Test caller ringtone function (for debugging)
  const testCallerRingtone = () => {
    console.log('🧪 Testing caller ringtone manually');
    playCallerRingtone();
    setTimeout(() => {
      stopCallerRingtone();
    }, 3000); // Stop after 3 seconds
  };

  // Make test function available globally for debugging
  useEffect(() => {
    (window as any).testCallerRingtone = testCallerRingtone;
  }, []);

  // Create peer connection
  const createPeerConnection = () => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          to: targetUserId,
          candidate: event.candidate
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log('📥 TRACK ADDED:', event.track.kind, 'stream:', event.streams[0]?.id);
      console.log('🎥 Track details:', {
        kind: event.track.kind,
        enabled: event.track.enabled,
        muted: event.track.muted,
        readyState: event.track.readyState,
        label: event.track.label,
        id: event.track.id
      });
      
      // Get the persistent remote stream
      const persistentStream = persistentRemoteStreamRef.current;
      const trackKind = event.track.kind;
      
      // Remove existing track of the same kind to avoid duplicates
      const existingTrack = persistentStream.getTracks().find(t => t.kind === trackKind);
      if (existingTrack) {
        console.log('🔄 Removing existing', trackKind, 'track:', existingTrack.id);
        persistentStream.removeTrack(existingTrack);
        existingTrack.stop();
      }
      
      // Add the new track to persistent stream
      console.log('✅ Adding', trackKind, 'track to persistent stream:', event.track.id);
      persistentStream.addTrack(event.track);
      
      // Log current stream state
      console.log('📊 Persistent stream after track addition:', {
        streamId: persistentStream.id,
        active: persistentStream.active,
        totalTracks: persistentStream.getTracks().length,
        videoTracks: persistentStream.getVideoTracks().length,
        audioTracks: persistentStream.getAudioTracks().length
      });
      
      // Create a new MediaStream instance to trigger React re-render
      // React won't detect changes if we use the same object reference
      const newStream = new MediaStream(persistentStream.getTracks());
      setRemoteStream(newStream);
      setStreamUpdateCounter(prev => prev + 1);
      console.log('✅ Remote stream state updated with new instance - should trigger video element update', {
        streamId: newStream.id,
        tracks: newStream.getTracks().length,
        updateCounter: streamUpdateCounter + 1
      });
      
      // Listen for track events
      event.track.addEventListener('unmute', () => {
        console.log('🎉 TRACK UNMUTED:', event.track.kind, event.track.id);
      });
      
      event.track.addEventListener('ended', () => {
        console.log('🔚 TRACK ENDED:', event.track.kind, event.track.id);
        // Remove ended track from persistent stream
        if (persistentStream.getTracks().includes(event.track)) {
          persistentStream.removeTrack(event.track);
          console.log('🗑️ Removed ended track from persistent stream');
        }
      });
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallState(prev => ({ ...prev, isConnected: true, isOutgoing: false, isIncoming: false }));
        toast.success('Video call connected!');
      }
    };

    return pc;
  };

  // Handle WebRTC messages
  const handleSocketMessage = (data: any) => {
    if (data.type === 'webrtc_answer' && data.answer) {
      stopCallerRingtone(); // Stop caller ringtone when receiver answers
      handleAnswer(data.answer);
    }
    if (data.type === 'webrtc_ice_candidate' && data.candidate) {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    }
    if (data.type === 'call_rejected') {
      stopCallerRingtone(); // Stop caller ringtone when call is rejected
      console.log('📞 Call was rejected by receiver');
    }
  };

  // Handle WebRTC answer
  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    console.log('🔍 CALLER: handleAnswer called, checking peer connection ref:', !!peerConnectionRef.current);
    if (peerConnectionRef.current) {
      console.log('📞 CALLER: Processing WebRTC answer');
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ CALLER: Answer processed, peer connection state:', peerConnectionRef.current.connectionState);
    } else {
      console.error('❌ CALLER: No peer connection available to process answer');
    }
  };

  // Start call (caller)
  const startCall = async (isVideo: boolean) => {
    try {
      console.log('🚨 NEW CALLER FUNCTION EXECUTING - VERSION 2.0 - isVideo:', isVideo);
      console.log('🔊 Caller ringtone ref available:', !!callerRingtoneRef.current);
      console.log('🏠 Channel context:', {
        currentChannelId,
        activeCallChannelId,
        currentCallChannel,
        socket: !!socket,
        targetUserId
      });
      
      let callChannelId: string;
      
      // Check if we're already in a call channel
      if (currentChannelId || activeCallChannelId || currentCallChannel) {
        console.log('✅ CALLER: Using existing call channel:', currentChannelId || activeCallChannelId || currentCallChannel);
        callChannelId = currentChannelId || activeCallChannelId || currentCallChannel!;
        // Update tracking variables
        if (currentChannelId) {
          setCurrentCallChannel(currentChannelId);
          setActiveCallChannelId(currentChannelId);
        }
      } else {
        // Create new call channel
        const callType = isVideo ? 'video' : 'voice';
        const participants = [user?.id || ''];
        const callChannel = await createCallChannel(callType, participants);
        setCurrentCallChannel(callChannel.id);
        setActiveCallChannelId(callChannel.id);
        callChannelId = callChannel.id;
      }

      // Get media
      console.log('🎥 CALLER: Requesting media stream - video:', isVideo, 'audio: true');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });
      
      console.log('✅ CALLER: Got media stream:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        streamId: stream.id
      });
      
      setLocalStream(stream);
      console.log('✅ CALLER: Local stream set, should trigger video UI render');
      setCallState(prev => {
        const newState = { 
          ...prev, 
          isOutgoing: true, 
          isVideoEnabled: isVideo,
          isAudioEnabled: true 
        };
        console.log('📞 CALLER: Setting call state:', newState);
        return newState;
      });

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;
      console.log('✅ CALLER: Peer connection created and stored in ref');
      
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socket) {
        console.log('📤 CALLER: Sending call invitation with channel ID:', callChannelId);
        socket.send(JSON.stringify({
          type: 'call_incoming',
          to: targetUserId,
          from: user?.id,
          from_name: user?.username,
          offer: offer,
          isVideo: isVideo,
          channelId: callChannelId,
          channelName: callChannelId, // Use channel ID as fallback name
          targetUserId: targetUserId
        }));
        
        // Start caller ringtone after sending the call invitation
        playCallerRingtone();
      }
    } catch (error) {
      console.error('❌ CALLER: Error starting call:', error);
      console.error('❌ CALLER: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Stop ringtone on error
      stopCallerRingtone();
    }
  };

  // Accept call (receiver)
  const acceptCall = async (offer?: RTCSessionDescriptionInit) => {
    try {
      console.log('✅ RECEIVER: Accepting call');
      
      // Set current call channel for receiver to match caller's channel
      if (acceptedCall?.channelId) {
        setCurrentCallChannel(acceptedCall.channelId);
        setActiveCallChannelId(acceptedCall.channelId);
      }
      
      const isVideoCall = acceptedCall?.isVideo || false;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoCall
      });
      
      setLocalStream(stream);
      console.log('✅ RECEIVER: Local stream set, should trigger video UI render');
      setCallState(prev => ({ 
        ...prev, 
        isVideoEnabled: isVideoCall,
        isAudioEnabled: true,
        isIncoming: false
      }));

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;
      console.log('✅ RECEIVER: Peer connection created and stored in ref');
      
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      if (offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (socket && acceptedCall) {
          socket.send(JSON.stringify({
            type: 'webrtc_answer',
            to: acceptedCall.from,
            answer: answer
          }));
        }
      }
    } catch (error) {
      console.error('❌ RECEIVER: Error accepting call:', error);
    }
  };

  // End call
  const endCall = async () => {
    console.log('✅ Ending call');
    
    // Stop caller ringtone if it's playing
    stopCallerRingtone();
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    // Delete call channel from backend if we created it
    if (currentCallChannel) {
      try {
        const token = localStorage.getItem('access_token');
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
        
        await fetch(`${backendUrl}/channels/${currentCallChannel}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        console.log('✅ Call channel deleted from backend');
      } catch (error) {
        console.error('❌ Failed to delete call channel:', error);
      }
    }
    
    // Clean up persistent remote stream
    if (persistentRemoteStreamRef.current) {
      persistentRemoteStreamRef.current.getTracks().forEach(track => {
        persistentRemoteStreamRef.current.removeTrack(track);
        track.stop();
      });
      // Create a fresh persistent stream for next call
      persistentRemoteStreamRef.current = new MediaStream();
    }
    
    setLocalStream(null);
    setRemoteStream(null);
    peerConnectionRef.current = null;
    setCurrentCallChannel(null);
    setCallState({
      isIncoming: false,
      isOutgoing: false,
      isConnected: false,
      isVideoEnabled: false,
      isAudioEnabled: false,
      isMuted: false
    });
    
    setActiveCallChannelId(null);
    onCallEnd();
  };

  // Register WebRTC handler
  useEffect(() => {
    const shouldHandleWebRTC = !isGlobal && (currentCallChannel || acceptedCall || activeCallChannelId);
    
    if (onWebRTCMessage && shouldHandleWebRTC) {
      console.log('✅ Registering WebRTC handler');
      onWebRTCMessage(handleSocketMessage);
      return () => onWebRTCMessage(null);
    }
  }, [onWebRTCMessage, isGlobal, currentCallChannel, acceptedCall, activeCallChannelId]);

  // No auto-start - user must manually click video/voice buttons

  // Auto-accept for receiver
  useEffect(() => {
    if (acceptedCall && !callState.isConnected) {
      console.log('✅ Auto-accepting call');
      acceptCall(acceptedCall.offer);
    }
  }, [acceptedCall]);

  // Attach streams to video elements
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.error('Error playing local video:', e));
    }
  }, [localStream]);

  useEffect(() => {
    console.log('🔄 Remote video useEffect triggered - remoteStream:', !!remoteStream, 'remoteVideoRef:', !!remoteVideoRef.current);
    
    if (!remoteVideoRef.current || !remoteStream) {
      console.log('⚠️ Missing video ref or stream:', {
        hasVideoRef: !!remoteVideoRef.current,
        hasRemoteStream: !!remoteStream,
        streamId: remoteStream?.id
      });
      return;
    }
    
    const video = remoteVideoRef.current;
    
    // Debug stream contents
    console.log('🎥 Remote stream active?', remoteStream.active);
    console.log('🎤 Audio track enabled?', remoteStream.getAudioTracks()[0]?.enabled);
    console.log('📹 Video track enabled?', remoteStream.getVideoTracks()[0]?.enabled);
    
    // Clear srcObject first to force re-render
    video.srcObject = null;
    
    // Set the new stream
    video.srcObject = remoteStream;
    video.muted = false; // Allow audio
    video.autoplay = true;
    video.playsInline = true;
    
    console.log('🔄 Setting up remote video with stream:', remoteStream.id);
    
    // Play the video
    const playVideo = () => {
      if (!remoteVideoRef.current || remoteVideoRef.current !== video) {
        console.log('⚠️ Video element unmounted, skipping play');
        return;
      }
      
      video.play().then(() => {
        console.log('✅ Remote video playing successfully');
        console.log('📺 Video dimensions:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState
        });
      }).catch(error => {
        console.error('❌ Remote video play failed:', error);
        
        // Retry once after a short delay
        setTimeout(() => {
          if (remoteVideoRef.current && remoteVideoRef.current === video) {
            video.play().catch(e => console.error('❌ Retry play also failed:', e));
          }
        }, 100);
      });
    };
    
    // Small delay to ensure DOM is stable
    const timeoutId = setTimeout(playVideo, 50);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [remoteStream, streamUpdateCounter]);

  // Video call UI
  console.log('🎥 Video UI check:', {
    isConnected: callState.isConnected,
    isOutgoing: callState.isOutgoing, 
    hasLocal: !!localStream,
    hasRemote: !!remoteStream,
    shouldShow: callState.isConnected || callState.isOutgoing || localStream || remoteStream
  });

  // Render content based on state
  let content = null;
  
  if (callState.isConnected || callState.isOutgoing || localStream || remoteStream) {
    content = (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="relative w-full h-full max-w-4xl max-h-[80vh]">
          {/* Remote video (main) */}
          {callState.isVideoEnabled && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover rounded-lg"
            />
          )}
          
          {/* Voice call background */}
          {!callState.isVideoEnabled && (
            <div className="w-full h-full bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-8xl mb-8">📞</div>
                <h2 className="text-3xl font-bold mb-4">{targetUsername}</h2>
                <p className="text-xl opacity-80">Voice Call</p>
                <p className="text-sm opacity-60 mt-2">
                  {callState.isConnected ? 'Connected' : 'Connecting...'}
                </p>
              </div>
            </div>
          )}
          
          {/* Local video (picture-in-picture) */}
          {callState.isVideoEnabled && (
            <div className="absolute top-4 right-4 w-48 h-36">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover rounded-lg border-2 border-white"
              />
            </div>
          )}
          
          {/* Call controls */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
            <div className="flex gap-4 bg-black bg-opacity-50 rounded-full px-6 py-3">
              <button
                onClick={endCall}
                className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full"
                title="End call"
              >
                📞
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Call buttons (when not in call)
  else if (!targetUserId || targetUserId === "" || (isGlobal && acceptedCall)) {
    content = null; // No content to show
  }
  // Show call buttons even for 'waiting-for-receiver' in call channels
  else {
    content = (
      <div className="flex gap-2">
      <button
        onClick={() => startCall(false)}
        className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1"
        title="Voice call"
      >
        📞 Voice
      </button>
      <button
        onClick={() => startCall(true)}
        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1"
        title="Video call"
      >
        📹 Video
      </button>
      </div>
    );
  }

  // Always render with audio element
  return (
    <>
      {content}
      {/* Hidden audio element for caller ringtone - ALWAYS rendered */}
      <audio
        ref={callerRingtoneRef}
        src="/ringtone.mp3"
        preload="auto"
        style={{ display: 'none' }}
        onLoadedData={() => console.log('🚨 NEW VERSION 2.0 - Caller ringtone loaded successfully')}
        onError={(e) => console.error('❌ Failed to load caller ringtone:', e)}
      />
    </>
  );
};

export default NewCallControls;