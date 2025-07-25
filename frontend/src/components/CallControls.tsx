import React, { useState, useRef, useEffect } from 'react';
import { useChannels } from '../contexts/ChannelsContext';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { toast } from 'react-hot-toast';

interface CallControlsProps {
  targetUserId: string;
  targetUsername: string;
  onCallEnd: () => void;
  socket: WebSocket | null;
  isGlobal?: boolean;
  acceptedCall?: {
    offer: any;
    channelId: string;
    channelName: string;
    isVideo: boolean;
    from: string;
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

const CallControls: React.FC<CallControlsProps> = ({ 
  targetUserId, 
  targetUsername, 
  onCallEnd, 
  socket, 
  isGlobal, 
  acceptedCall 
}) => {
  const componentId = React.useRef(Math.random().toString(36).substr(2, 9));
  console.log('🔍 CallControls component', componentId.current, 'rendered for target:', targetUserId, 'isGlobal:', isGlobal);
  const { user } = useAuth();
  const { onWebRTCMessage } = useWebSocket();
  const { createCallChannel, createCallChannelForReceiver, removeCallChannel, deleteCallChannel, joinCallChannel, leaveCallChannel, callDuration, setCallDuration, setActiveCallChannelId, activeCallChannelId, channels, setSelectedChannel, refreshChannels } = useChannels();
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
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  
  // Debug: Track peer connection state changes
  useEffect(() => {
    console.log('🔍 Component', componentId.current, 'peerConnection state changed:', !!peerConnection, peerConnection?.signalingState);
  }, [peerConnection]);
  const [pendingIceCandidates, setPendingIceCandidates] = useState<RTCIceCandidateInit[]>([]);
  const [pendingOffer, setPendingOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [currentCallChannel, setCurrentCallChannel] = useState<string | null>(null);
  const [isAcceptingCall, setIsAcceptingCall] = useState(false);
  const [hasAutoAccepted, setHasAutoAccepted] = useState(false);
  
  // Call timer and voice activity detection
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [isLocalTalking, setIsLocalTalking] = useState(false);
  const [isRemoteTalking, setIsRemoteTalking] = useState(false);
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localAudioContextRef = useRef<AudioContext | null>(null);
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const audioLevelIntervalRef = useRef<number | null>(null);

  // Enhanced WebRTC configuration with multiple STUN servers and TURN servers
  const [rtcConfig, setRtcConfig] = useState<RTCConfiguration>({
    iceServers: [
      // Google STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Additional STUN servers for better connectivity
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voiparound.com:3478' },
      { urls: 'stun:stun.voipbuster.com:3478' },
      { urls: 'stun:stun.voipstunt.com:3478' },
      { urls: 'stun:stun.voxgratia.org:3478' },
      // Free TURN servers (for NAT traversal when STUN fails)
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10
  });

  // Fetch WebRTC configuration from backend
  useEffect(() => {
    const fetchWebRTCConfig = async () => {
      try {
        // Get the backend URL from the current environment
        const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8000';
        const response = await fetch(`${backendUrl}/webrtc-config`);
        if (response.ok) {
          const config = await response.json();
          console.log('🔊 Fetched WebRTC config from backend:', config);
          setRtcConfig(config);
        } else {
          console.warn('🔊 Failed to fetch WebRTC config, using fallback');
        }
      } catch (error) {
        console.error('🔊 Error fetching WebRTC config:', error);
        console.log('🔊 Using fallback WebRTC configuration');
      }
    };

    fetchWebRTCConfig();
  }, []);

  // --- Ensure handleSocketMessage is defined before usage ---
  const handleSocketMessage = React.useCallback((data: any) => {
    // Filter messages - only process if this CallControls is for the right user
    // For answers: we are the caller, so we should receive messages FROM our target
    // For offers: we are the receiver, so we should receive messages TO us
    const isForThisInstance = 
      (data.type === 'webrtc_answer' && data.from === targetUserId) ||
      (data.type === 'webrtc_offer' && data.to === user?.id) ||
      (data.type === 'call_incoming' && data.to === user?.id) ||
      (data.type === 'webrtc_ice_candidate' && (data.from === targetUserId || data.to === user?.id)) ||
      (data.type === 'call_channel_created' && data.to === user?.id);
    
    if (!isForThisInstance) {
      return;
    }
    
    if (data.type === 'call_channel_created' && data.to === user?.id) {
      let callChannel = channels.find(ch => ch.id === data.channelId);
      if (!callChannel) {
        // Use the exact name and ID from the caller!
        callChannel = createCallChannelForReceiver(
          data.channelId,
          data.channelName,
          data.callType,
          data.participants
        );
      }
      setCurrentCallChannel(data.channelId);
      setSelectedChannel(callChannel);
      joinCallChannel(data.channelId, user?.id || ''); // Ensure receiver is added as participant
      return;
    }
    if (data.type === 'call_accepted' && data.accepterId) {
      if (data.channelId) {
        joinCallChannel(data.channelId, data.accepterId);
      }
      return;
    }
    // --- Handle WebRTC signaling messages ---
    if (data.type === 'webrtc_offer' && data.offer) {
      setPendingOffer(data.offer);
      return;
    }
    // Handle call_incoming which contains the offer
    if (data.type === 'call_incoming' && data.offer) {
      setPendingOffer(data.offer);
      return;
    }
    if (data.type === 'webrtc_answer' && data.answer) {
      console.log('🔍 Component', componentId.current, 'processing webrtc_answer');
      handleAnswer(data.answer);
      return;
    }
    if (data.type === 'webrtc_ice_candidate' && data.candidate) {
      if (peerConnection && peerConnection.remoteDescription) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => {
          console.error('❌ Error adding ICE candidate:', e);
        });
      } else {
        setPendingIceCandidates(prev => [...prev, data.candidate]);
      }
      return;
    }
  }, [user?.id, channels, peerConnection]);
  // --- End patch ---
  // Now, the handleMessage function can safely call handleSocketMessage

  // Register WebRTC message handler with WebSocket context
  useEffect(() => {
    // SIMPLIFIED: Register WebRTC handler if:
    // 1. This is NOT a global (DM) CallControls component (isGlobal=false)
    // 2. AND this component has either currentCallChannel OR acceptedCall set OR is embedded in active call channel
    const isEmbeddedInCallChannel = !isGlobal && activeCallChannelId && activeCallChannelId !== null;
    const shouldHandleWebRTC = !isGlobal && (currentCallChannel || acceptedCall || isEmbeddedInCallChannel);
    
    if (onWebRTCMessage && shouldHandleWebRTC) { 
      console.log('🔍 Component', componentId.current, 'registering WebRTC handler for channel:', currentCallChannel || acceptedCall?.channelId || activeCallChannelId, 'reason:', currentCallChannel ? 'currentCallChannel' : acceptedCall ? 'acceptedCall' : 'isEmbeddedInCallChannel');
      onWebRTCMessage(handleSocketMessage);
      return () => {
        console.log('🔍 Component', componentId.current, 'unregistering WebRTC handler');
        onWebRTCMessage(null);
      };
    } else {
      console.log('🔍 Component', componentId.current, 'NOT registering WebRTC handler - isGlobal:', isGlobal, 'currentCallChannel:', currentCallChannel, 'acceptedCall:', !!acceptedCall, 'activeCallChannelId:', activeCallChannelId);
    }
  }, [onWebRTCMessage, handleSocketMessage, isGlobal, currentCallChannel, acceptedCall, activeCallChannelId]);

  // Auto-start call for embedded CallControls (with guards to prevent multiple calls)
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    // For embedded CallControls in active call channel
    const isEmbeddedInCallChannel = !isGlobal && activeCallChannelId && activeCallChannelId !== null;
    
    if (isEmbeddedInCallChannel && !callState.isOutgoing && !callState.isIncoming && !callState.isConnected && !hasAutoStarted.current) {
      // Check if this is the caller (user created the channel) or receiver (acceptedCall exists)
      if (acceptedCall) {
        console.log('🔍 Embedded CallControls auto-accepting call for receiver');
        hasAutoStarted.current = true;
        acceptCall(acceptedCall.offer);
      } else {
        // This might be the caller's embedded CallControls - check if user is channel creator
        const currentChannel = channels.find(ch => ch.id === activeCallChannelId);
        if (currentChannel && currentChannel.created_by === user?.id && !currentCallChannel) {
          console.log('🔍 Embedded CallControls auto-starting call for caller');
          hasAutoStarted.current = true;
          const isVideo = currentChannel.call_type === 'video';
          startCall(isVideo);
        }
      }
    }
    
    // Reset the flag when call ends
    if (!activeCallChannelId) {
      hasAutoStarted.current = false;
    }
  }, [activeCallChannelId, isGlobal, acceptedCall, callState, channels, user?.id, currentCallChannel]);

  // Keep original socket listener for backward compatibility
  useEffect(() => {
    if (socket) {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          handleSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      socket.addEventListener('message', handleMessage);
      return () => socket.removeEventListener('message', handleMessage);
    }
  }, [socket]);

  // Request notification permission on component mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Voice Activity Detection for local audio
  const setupVoiceActivityDetection = (stream: MediaStream, isLocal: boolean = true) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      
      microphone.connect(analyser);
      
      if (isLocal) {
        localAudioContextRef.current = audioContext;
        localAnalyserRef.current = analyser;
      } else {
        remoteAudioContextRef.current = audioContext;
        remoteAnalyserRef.current = analyser;
      }
      
      // Start monitoring audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average audio level
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalizedLevel = average / 255; // Normalize to 0-1
        
        if (isLocal) {
          setLocalAudioLevel(normalizedLevel);
          setIsLocalTalking(normalizedLevel > 0.1); // Threshold for talking
        } else {
          setRemoteAudioLevel(normalizedLevel);
          setIsRemoteTalking(normalizedLevel > 0.1); // Threshold for talking
        }
      };
      
      // Check audio levels every 100ms
      const interval = setInterval(checkAudioLevel, 100);
      
      if (isLocal) {
        audioLevelIntervalRef.current = interval;
      }
      
      return () => {
        clearInterval(interval);
        audioContext.close();
      };
    } catch (error) {
      console.error('Error setting up voice activity detection:', error);
    }
  };

  // Call timer effect
  useEffect(() => {
    if (callState.isConnected && !callStartTime) {
      setCallStartTime(new Date());
    }
    
    if (callStartTime) {
      timerIntervalRef.current = setInterval(() => {
        const now = new Date();
        const duration = Math.floor((now.getTime() - callStartTime.getTime()) / 1000);
        setCallDuration(duration); // Use shared state from context
      }, 1000);
    }
    
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [callState.isConnected, callStartTime, setCallDuration]);

  // Cleanup audio contexts on unmount
  useEffect(() => {
    return () => {
      if (localAudioContextRef.current) {
        localAudioContextRef.current.close();
      }
      if (remoteAudioContextRef.current) {
        remoteAudioContextRef.current.close();
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Handle pending ICE candidates when peer connection becomes available
  useEffect(() => {
    if (peerConnection && peerConnection.remoteDescription && pendingIceCandidates.length > 0) {
      console.log('🔊 Processing pending ICE candidates:', pendingIceCandidates.length);
      console.log('🔊 Peer connection state:', {
        signalingState: peerConnection.signalingState,
        iceConnectionState: peerConnection.iceConnectionState,
        connectionState: peerConnection.connectionState
      });
      
      const processCandidates = async () => {
        const candidatesToProcess = [...pendingIceCandidates];
        setPendingIceCandidates([]); // Clear immediately to prevent duplicates
        
        for (const candidate of candidatesToProcess) {
          try {
            console.log('🔊 Adding pending ICE candidate:', candidate);
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('🔊 Pending ICE candidate added successfully');
          } catch (error) {
            console.error('🔊 Error adding pending ICE candidate:', error);
            // Re-add failed candidates to try again later
            setPendingIceCandidates(prev => [...prev, candidate]);
          }
        }
      };
      processCandidates();
    }
  }, [peerConnection, pendingIceCandidates]);

  // Additional effect to process candidates when remote description is set
  useEffect(() => {
    if (peerConnection && peerConnection.remoteDescription && pendingIceCandidates.length > 0) {
      console.log('🔊 Remote description set, processing pending candidates:', pendingIceCandidates.length);
      const processCandidates = async () => {
        const candidatesToProcess = [...pendingIceCandidates];
        setPendingIceCandidates([]);
        
        for (const candidate of candidatesToProcess) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('🔊 Pending ICE candidate processed after remote description');
          } catch (error) {
            console.error('🔊 Error processing pending ICE candidate:', error);
            setPendingIceCandidates(prev => [...prev, candidate]);
          }
        }
      };
      processCandidates();
    }
  }, [peerConnection?.remoteDescription, pendingIceCandidates]);

  // Format call duration
  const formatCallDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Robust Video Call UI Patch ---
  // 1. When a call is active, ensure the call channel is always present in the sidebar (handled by ChannelsContext)
  // 2. Always attach local video stream to localVideoRef
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      console.log('✅ Local video attached');
    }
  }, [localStream]);
  // 3. Always attach remote video stream to remoteVideoRef
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      console.log('✅ Remote video attached');
      
      // Force play
      remoteVideoRef.current.onloadedmetadata = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play();
        }
      };
      
      if (remoteVideoRef.current.readyState >= 1) {
        remoteVideoRef.current.play();
      }
    }
  }, [remoteStream]);
  // 4. Ensure the call UI is visible for both users when callState.isConnected is true (already handled in render)
  // --- End Patch ---

  // --- Robust Video Call Logic Patch ---

  const ensurePeerConnection = (stream: MediaStream | null) => {
    if (!peerConnection) {
      console.log('🔄 Creating new peer connection');
      const pc = createPeerConnection();
      if (pc && stream) {
        stream.getTracks().forEach(track => {
          console.log('🔄 Adding track to new peer connection:', track.kind);
          pc.addTrack(track, stream);
        });
      }
      setPeerConnection(pc);
      return pc;
    } else {
      console.log('🔄 Using existing peer connection, state:', peerConnection.signalingState);
      if (peerConnection && stream) {
        const existingTracks = peerConnection.getSenders().map(sender => sender.track);
        const streamTracks = stream.getTracks();
        
        for (const track of streamTracks) {
          const trackExists = existingTracks.some(existingTrack => 
            existingTrack && existingTrack.kind === track.kind
          );
          if (!trackExists) {
            console.log('🔄 Adding missing track to existing peer connection:', track.kind);
            peerConnection.addTrack(track, stream);
          }
        }
      }
    }
    return peerConnection;
  };

  const createPeerConnection = () => {
    console.log('Creating peer connection');
    try {
      const pc = new RTCPeerConnection(rtcConfig);
      
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log('🔊 Sending ICE candidate to:', targetUserId);
          socket.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            to: targetUserId,
            candidate: event.candidate
          }));
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('🔊 ICE state changed:', pc.iceConnectionState);
        
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          console.log('✅ Connected!');
          setCallState(prev => ({ ...prev, isConnected: true, isOutgoing: false, isIncoming: false }));
          setIsAcceptingCall(false);
          toast.success('Connection established!');
          
          if (currentCallChannel) {
            joinCallChannel(currentCallChannel, user?.id || '');
          }
        } else if (pc.iceConnectionState === 'failed') {
          console.error('❌ Connection failed');
          setIsAcceptingCall(false);
          setHasAutoAccepted(false);
          toast.error('Connection failed - please try again');
        } else if (pc.iceConnectionState === 'disconnected') {
          toast.error('Connection lost');
        }
      };

      pc.ontrack = (event) => {
        console.log('✅ Received remote', event.track.kind);
        
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else {
          const newStream = new MediaStream([event.track]);
          setRemoteStream(newStream);
        }
      };

      setPeerConnection(pc);
      return pc;
    } catch (error) {
      console.error('[WebRTC] Error creating peer connection:', error);
      return null;
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    console.log('Handling offer');
    
    try {
      let pc = peerConnection;
      if (!pc) {
        pc = ensurePeerConnection(localStream);
      }
      
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        if (socket) {
          socket.send(JSON.stringify({
            type: 'webrtc_answer',
            to: targetUserId,
            answer: answer
          }));
          console.log('✅ Answer sent');
        }
      }
    } catch (error) {
      console.error('❌ Error handling offer:', error);
      toast.error('Error establishing connection');
    }
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    console.log('🔍 handleAnswer called - peerConnection exists:', !!peerConnection);
    console.log('🔍 peerConnection state:', peerConnection?.signalingState);
    
    try {
      // DO NOT create a new peer connection here - use the existing one that sent the offer
      if (!peerConnection) {
        console.error('❌ No peer connection available for answer');
        console.error('❌ This means the peer connection was lost between offer and answer');
        return;
      }
      
      console.log('🔊 Peer connection signaling state:', peerConnection.signalingState);
      
      // Only process answer if we're in the right state
      if (peerConnection.signalingState === 'have-local-offer') {
        console.log('🔊 Setting remote description with answer');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Answer processed successfully');
        
        // Update call state to indicate connection is being established
        setCallState(prev => ({ ...prev, isConnected: false, isOutgoing: true }));
      } else {
        console.log('🔊 Ignoring answer - peer connection not in correct state:', peerConnection.signalingState);
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
      toast.error('Error completing connection');
    }
  };

  // 4. In startCall and acceptCall, always attach local video stream
  const startCall = async (isVideo: boolean) => {
    // Prevent multiple calls and prevent global CallControls from starting calls
    if (isGlobal) {
      console.log('🚫 Global CallControls cannot start calls - this should be handled by embedded CallControls');
      return;
    }
    
    if (callState.isOutgoing || callState.isIncoming || callState.isConnected || currentCallChannel) {
      console.log('🚫 Call already in progress, ignoring startCall');
      return;
    }
    
    try {
      console.log('📞 Starting', isVideo ? 'video' : 'voice', 'call');
      
      // Request notification permission if not granted
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      
      // Create call channel in backend with updated schema - only caller initially
      const callType = isVideo ? 'video' : 'voice';
      const participants = [user?.id || '']; // Only caller initially, receiver added when they accept
      const callChannel = await createCallChannel(callType, participants);
      setCurrentCallChannel(callChannel.id);
      setActiveCallChannelId(callChannel.id); // Set active call channel in context
      
      // CRITICAL FIX: Immediately switch caller to the call channel
      setSelectedChannel(callChannel);
      
      // Immediately join the call channel as the caller
      joinCallChannel(callChannel.id, user?.id || '');
      
      // Notify target user about call channel creation
      if (socket) {
        const channelMessage = {
          type: 'call_channel_created',
          to: targetUserId,
          channelId: callChannel.id,
          channelName: callChannel.name,
          callType: callType,
          participants: participants
        };
        socket.send(JSON.stringify(channelMessage));
      }
      
      // Request media permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });
      
      console.log('✅ Media obtained for', isVideo ? 'video' : 'voice', 'call');
      
      // Set up voice activity detection for local audio
      setupVoiceActivityDetection(stream, true);
      
      setLocalStream(stream);
      setCallState(prev => ({ 
        ...prev, 
        isOutgoing: true, 
        isVideoEnabled: isVideo,
        isAudioEnabled: true 
      }));

      const pc = createPeerConnection();
      console.log('🔍 CALLER: Created peer connection, setting to state');
      setPeerConnection(pc); // CRITICAL FIX: Save peer connection to state
      console.log('🔍 CALLER: Peer connection set to state');
      
      if (pc) {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (socket) {
          const callMessage = {
            type: 'call_incoming',
            to: targetUserId,
            offer: offer,
            isVideo: isVideo,
            channelId: callChannel.id,
            channelName: callChannel.name
          };
          socket.send(JSON.stringify(callMessage));
        } else {
          console.error('🚀 WebSocket not connected');
          alert('Not connected to server. Please check your connection.');
        }
      }
    } catch (error) {
      console.error('🚀 Error starting call:', error);
      if (error.name === 'NotAllowedError') {
        alert('Camera/microphone access denied. Please allow permissions and try again.');
      } else if (error.name === 'NotFoundError') {
        alert('Camera or microphone not found. Please check your devices.');
      } else {
        alert(`Could not start call: ${error.message}`);
      }
    }
  };

  // --- Fix call accept and ringtone logic ---
  const acceptCall = async (offer?: RTCSessionDescriptionInit) => {
    try {
      console.log('[CallControls] Starting call acceptance process');
      stopRingtone();
      setCallState(prev => ({ ...prev, isIncoming: false })); // Don't set connected yet
      
      if (currentCallChannel) {
        console.log('[CallControls] Looking for call channel:', currentCallChannel);
        
        // First try to find the channel locally
        let callChannel = channels.find(ch => ch.id === currentCallChannel);
        
        // If not found locally, fetch directly from backend (the caller created it there)
        if (!callChannel) {
          console.log('[CallControls] Channel not found locally, fetching from backend...');
          try {
            const token = localStorage.getItem('access_token');
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
            const response = await fetch(`${backendUrl}/channels/${currentCallChannel}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (response.ok) {
              const channelData = await response.json();
              console.log('[CallControls] Fetched channel from backend:', channelData);
              
              // Parse the channel data properly
              callChannel = {
                ...channelData,
                is_call_channel: channelData.is_call_channel === "true" || channelData.is_call_channel === true,
                call_type: channelData.call_type,
                call_participants: typeof channelData.call_participants === 'string' 
                  ? JSON.parse(channelData.call_participants) 
                  : (channelData.call_participants || [acceptedCall?.from || '', user?.id || ''])
              };
              
              // Refresh channels to make sure the fetched channel is available in local state
              // This ensures the UI can see the call channel properties
              await refreshChannels();
            } else {
              console.error('[CallControls] Failed to fetch channel from backend:', response.status);
            }
          } catch (error) {
            console.error('[CallControls] Error fetching channel from backend:', error);
          }
        }
        
        // If still not found, create local representation as fallback
        if (!callChannel) {
          console.log('[CallControls] Channel not found in backend, creating fallback');
          callChannel = createCallChannelForReceiver(
            currentCallChannel,
            acceptedCall?.channelName || 'call-channel',
            acceptedCall?.isVideo ? 'video' : 'voice',
            [acceptedCall?.from || '', user?.id || '']
          );
          console.log('[CallControls] Created fallback channel:', callChannel);
        } else {
          console.log('[CallControls] Found call channel from backend:', callChannel);
        }

        // ALWAYS ensure call channel properties are properly formatted, regardless of source
        console.log('[CallControls] Raw channel before parsing:', {
          is_call_channel: callChannel.is_call_channel,
          call_type: callChannel.call_type,
          call_participants: callChannel.call_participants,
          call_participants_type: typeof callChannel.call_participants
        });

        // Force proper formatting of all call channel properties
        callChannel = {
          ...callChannel,
          is_call_channel: true, // Force true since this is definitely a call channel
          call_type: callChannel.call_type || (acceptedCall?.isVideo ? 'video' : 'voice'),
          call_participants: (() => {
            if (Array.isArray(callChannel.call_participants)) {
              return callChannel.call_participants;
            }
            if (typeof callChannel.call_participants === 'string') {
              try {
                return JSON.parse(callChannel.call_participants);
              } catch (e) {
                console.error('[CallControls] Failed to parse call_participants JSON:', e);
                return [acceptedCall?.from || '', user?.id || ''];
              }
            }
            // Fallback if call_participants is null/undefined
            return [acceptedCall?.from || '', user?.id || ''];
          })(),
          call_started_at: callChannel.call_started_at || new Date().toISOString()
        };

        console.log('[CallControls] Channel after parsing:', {
          is_call_channel: callChannel.is_call_channel,
          call_type: callChannel.call_type,
          call_participants: callChannel.call_participants,
          call_participants_length: callChannel.call_participants?.length
        });
        
        // Join the channel and switch to it
        joinCallChannel(currentCallChannel, user?.id || '');
        setActiveCallChannelId(currentCallChannel);
        
        // Set the selected channel with the properly parsed call channel
        setSelectedChannel(callChannel);
        console.log('[CallControls] ✅ Successfully switched to call channel:', callChannel.name);
        console.log('[CallControls] ✅ Final selected channel properties:', {
          id: callChannel.id,
          name: callChannel.name,
          is_call_channel: callChannel.is_call_channel,
          call_type: callChannel.call_type,
          call_participants: callChannel.call_participants,
          call_participants_length: callChannel.call_participants?.length
        });
        
        // CRITICAL: Also refresh channels to ensure this channel is in the global state
        console.log('[CallControls] Refreshing channels to ensure call channel is in global state...');
        refreshChannels().then(() => {
          console.log('[CallControls] ✅ Channels refreshed after call acceptance');
        }).catch(error => {
          console.error('[CallControls] ❌ Failed to refresh channels:', error);
        });
      }
      
      // Get user media for the call
      const isVideoCall = acceptedCall?.isVideo || false;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoCall
      });
      
      console.log('✅ Media obtained for call accept');
      
      // Set up voice activity detection for local audio
      setupVoiceActivityDetection(stream, true);
      
      setLocalStream(stream);
      setCallState(prev => ({ 
        ...prev, 
        isVideoEnabled: isVideoCall,
        isAudioEnabled: true 
      }));

      // Create peer connection and handle the offer
      const offerToProcess = offer || pendingOffer;
      if (offerToProcess) {
        
        const pc = createPeerConnection();
        setPeerConnection(pc); // CRITICAL FIX: Save peer connection to state
        
        if (pc) {
          // Add local tracks to peer connection
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });

          // Handle the incoming offer
          await handleOffer(offerToProcess);
          setPendingOffer(null);
          console.log('✅ Video call accepted');
        }
      }
      
      // Send call accepted message with channel info
      if (socket) {
        socket.send(JSON.stringify({
          type: 'call_accepted',
          to: targetUserId,
          channelId: currentCallChannel,
          accepterId: user?.id
        }));
      }
    } catch (error) {
      console.error('[CallControls] Error accepting call:', error);
      setIsAcceptingCall(false);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };
  // --- End patch ---

  // Auto-accept logic for receiver - single execution only
  const autoAcceptExecuted = useRef(false);
  const acceptedCallRef = useRef(acceptedCall);
  
  // Update ref when acceptedCall changes
  useEffect(() => {
    acceptedCallRef.current = acceptedCall;
  }, [acceptedCall]);
  
  // Reset auto-accept flag only when component unmounts
  useEffect(() => {
    return () => {
      autoAcceptExecuted.current = false;
    };
  }, []);
  
  // Auto-accept effect with minimal dependencies to prevent multiple triggers
  useEffect(() => {
    const acceptedCallData = acceptedCallRef.current;
    
    // Only execute ONCE when all conditions are met
    if (
      acceptedCallData &&
      acceptedCallData.offer &&
      !autoAcceptExecuted.current &&
      !isAcceptingCall &&
      !hasAutoAccepted &&
      !peerConnection &&
      !localStream
    ) {
      console.log('📞 Auto-accepting incoming call');
      
      // Mark as executed immediately to prevent any re-execution
      autoAcceptExecuted.current = true;
      
      // Set all flags immediately to prevent re-triggers
      setIsAcceptingCall(true);
      setHasAutoAccepted(true);
      setPendingOffer(acceptedCallData.offer);
      setCurrentCallChannel(acceptedCallData.channelId);
      setActiveCallChannelId(acceptedCallData.channelId); // CRITICAL FIX: Set active call channel
      
      // Execute accept call immediately
      acceptCall(acceptedCallData.offer);
    }
  }, []); // NO dependencies to prevent any re-triggers

  const rejectCall = () => {
    stopRingtone();
    console.log('Rejecting call');
    setCallState(prev => ({ ...prev, isIncoming: false }));
    setPendingOffer(null);
    
    // Only delete the call channel when explicitly rejecting (not during auto-accept)
    if (currentCallChannel && !hasAutoAccepted) {
      console.log('🔚 Deleting call channel due to rejection');
      deleteCallChannel(currentCallChannel);
      setCurrentCallChannel(null);
    }
    
    if (socket) {
      socket.send(JSON.stringify({
        type: 'call_rejected',
        to: targetUserId
      }));
    }
  };

  const endCall = () => {
    stopRingtone();
    console.log('🔚 Ending call');
    
    // Stop local media streams
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('🔚 Stopping local track:', track.kind);
        track.stop();
      });
      setLocalStream(null);
    }
    
    // Close peer connection
    if (peerConnection) {
      console.log('🔚 Closing peer connection');
      peerConnection.close();
      setPeerConnection(null);
    }
    
    // Clear remote stream
    setRemoteStream(null);
    setPendingOffer(null);
    
    // Reset call state
    setCallState({
      isIncoming: false,
      isOutgoing: false,
      isConnected: false,
      isVideoEnabled: false,
      isAudioEnabled: false,
      isMuted: false
    });
    
    // Reset flags
    setIsAcceptingCall(false);
    setHasAutoAccepted(false);
    
    // Clear call timer and active channel
    setCallDuration(0);
    setActiveCallChannelId(null);
    
    // Leave the call channel and delete it from backend
    if (currentCallChannel) {
      console.log('🔚 Ending call and deleting call channel:', currentCallChannel);
      
      // Notify other participants that the call is ending
      if (socket) {
        socket.send(JSON.stringify({
          type: 'call_ended',
          to: targetUserId,
          channelId: currentCallChannel,
          userId: user?.id,
          username: user?.username || user?.full_name || 'Unknown User'
        }));
      }
      
      // Delete the call channel from backend and local state
      deleteCallChannel(currentCallChannel);
      setCurrentCallChannel(null);
    }
    
    // Call the onCallEnd callback
    onCallEnd();
    
    console.log('🔚 Call ended successfully');
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setCallState(prev => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCallState(prev => ({ ...prev, isVideoEnabled: videoTrack.enabled }));
      }
    }
  };

  // Debug function to log peer connection state
  const logPeerConnectionState = () => {
    if (peerConnection) {
      console.log('🔊 Peer Connection State:', {
        signalingState: peerConnection.signalingState,
        iceConnectionState: peerConnection.iceConnectionState,
        connectionState: peerConnection.connectionState,
        iceGatheringState: peerConnection.iceGatheringState,
        hasRemoteDescription: !!peerConnection.remoteDescription,
        hasLocalDescription: !!peerConnection.localDescription,
        pendingCandidates: pendingIceCandidates.length
      });
    } else {
      console.log('🔊 No peer connection available');
    }
  };

  // Log peer connection state changes
  useEffect(() => {
    if (peerConnection) {
      const logState = () => {
        console.log('🔊 Peer connection state changed:', {
          signalingState: peerConnection.signalingState,
          iceConnectionState: peerConnection.iceConnectionState,
          connectionState: peerConnection.connectionState
        });
      };
      
      peerConnection.onsignalingstatechange = logState;
      peerConnection.oniceconnectionstatechange = logState;
      peerConnection.onconnectionstatechange = logState;
      
      return () => {
        peerConnection.onsignalingstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onconnectionstatechange = null;
      };
    }
  }, [peerConnection]);

  // Test audio function to help debug
  const testAudio = () => {
    console.log('🔊 Testing audio setup...');
    console.log('🔊 Remote stream:', remoteStream);
    console.log('🔊 Remote stream tracks:', remoteStream?.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })));
    console.log('🔊 Audio element:', remoteVideoRef.current);
    
    if (remoteVideoRef.current && !callState.isVideoEnabled) {
      const audioElement = remoteVideoRef.current as HTMLAudioElement;
      console.log('🔊 Audio element properties:', {
        muted: audioElement.muted,
        volume: audioElement.volume,
        autoplay: audioElement.autoplay,
        srcObject: !!audioElement.srcObject,
        readyState: audioElement.readyState,
        paused: audioElement.paused
      });
      
      // Try to play audio
      audioElement.play().then(() => {
        console.log('🔊 Audio test successful - audio is playing');
      }).catch(error => {
        console.error('🔊 Audio test failed:', error);
      });
    }
  };

  // Test STUN/TURN connectivity
  const testStunTurnConnectivity = () => {
    console.log('🔊 Testing STUN/TURN connectivity...');
    
    if (peerConnection) {
      console.log('🔊 Current ICE connection state:', peerConnection.iceConnectionState);
      console.log('🔊 Current ICE gathering state:', peerConnection.iceGatheringState);
      console.log('🔊 Current connection state:', peerConnection.connectionState);
      
      // Get local and remote descriptions
      console.log('🔊 Local description:', peerConnection.localDescription);
      console.log('🔊 Remote description:', peerConnection.remoteDescription);
      
      // Log ICE candidates info
      console.log('🔊 ICE gathering state:', peerConnection.iceGatheringState);
      console.log('🔊 ICE connection state:', peerConnection.iceConnectionState);
    } else {
      console.log('🔊 No peer connection available for testing');
    }
  };

  // Add test button to UI for debugging
  const renderTestButton = () => {
    if (callState.isConnected && !callState.isVideoEnabled) {
      return (
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={testAudio}
            className="bg-blue-500 text-white px-3 py-1 rounded text-sm z-10"
          >
            Test Audio
          </button>
          <button
            onClick={testStunTurnConnectivity}
            className="bg-green-500 text-white px-3 py-1 rounded text-sm z-10"
          >
            Test STUN/TURN
          </button>
        </div>
      );
    }
    return null;
  };

  // Ringtone audio element
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const [showEnableSound, setShowEnableSound] = useState(false);

  // Play ringtone
  const playRingtone = () => {
    console.log("Playing ringtone"); // Add this
    if (!ringtoneRef.current) {
      ringtoneRef.current = new Audio('/ringtone.mp3');
      ringtoneRef.current.loop = true;
    }
    ringtoneRef.current.volume = 1.0;
    ringtoneRef.current.currentTime = 0;
    ringtoneRef.current.play().catch((err) => {
      setShowEnableSound(true);
      console.warn('Ringtone autoplay failed:', err);
    });
  };

  // Stop ringtone
  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  };

  // Play ringtone on incoming call, stop on accept/decline/end
  useEffect(() => {
    if (callState.isIncoming) {
      playRingtone();
    } else {
      stopRingtone();
    }
    // Stop on unmount
    return () => stopRingtone();
  }, [callState.isIncoming]);

  // 6. Ensure voice activity indicator is always visible (already present)
  // --- End Patch ---

  // Incoming call UI
  if (callState.isIncoming) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-800 rounded-lg p-8 max-w-md w-full mx-4 animate-pulse">
          <div className="text-center">
            <div className="text-4xl mb-6 animate-bounce">📞</div>
            <h3 className="text-xl font-bold mb-3 dark:text-white">Incoming Call</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-8 text-lg">
              <strong>{targetUsername}</strong> is calling you...
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={acceptCall}
                className="bg-green-500 hover:bg-green-600 text-white px-8 py-3 rounded-full flex items-center gap-2 text-lg font-semibold transition-colors"
              >
                <span className="text-2xl">✓</span> Accept
              </button>
              <button
                onClick={rejectCall}
                className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full flex items-center gap-2 text-lg font-semibold transition-colors"
              >
                <span className="text-2xl">✕</span> Decline
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active call UI - show when connected OR when we have local/remote streams
  if (callState.isConnected || localStream || remoteStream || isAcceptingCall) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="relative w-full h-full max-w-4xl max-h-[80vh]">
          {renderTestButton()}
          
          {/* Hidden audio element for voice calls */}
          {!callState.isVideoEnabled && remoteStream && (
            <audio
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              style={{ display: 'none' }}
              onLoadedMetadata={() => {
                console.log('🔊 Voice call audio element loaded');
                console.log('🔊 Remote stream tracks:', remoteStream.getTracks().map(t => ({kind: t.kind, enabled: t.enabled})));
                if (remoteVideoRef.current) {
                  const audioElement = remoteVideoRef.current as HTMLAudioElement;
                  audioElement.volume = 1.0;
                  console.log('🔊 Audio element volume set to:', audioElement.volume);
                  audioElement.play().catch(e => {
                    console.error('🔊 Error playing voice call audio:', e);
                    console.error('🔊 Error name:', e.name);
                    console.error('🔊 Error message:', e.message);
                  });
                }
              }}
              onCanPlay={() => {
                console.log('🔊 Voice call audio can play');
                if (remoteVideoRef.current) {
                  const audioElement = remoteVideoRef.current as HTMLAudioElement;
                  audioElement.play().catch(e => {
                    console.error('🔊 Error playing voice call audio on canplay:', e);
                  });
                }
              }}
              onPlay={() => {
                console.log('🔊 ✅ Voice call audio started playing successfully!');
              }}
              onError={(e) => {
                console.error('🔊 Voice call audio error:', e);
              }}
              onVolumeChange={() => {
                console.log('🔊 Audio volume changed:', remoteVideoRef.current?.volume);
              }}
            />
          )}
          
          {/* Remote video for video calls */}
          {callState.isVideoEnabled && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover rounded-lg"
              onLoadedMetadata={() => {
                console.log('📹 Video call element loaded');
                console.log('📹 Remote stream tracks:', remoteStream?.getTracks().map(t => ({kind: t.kind, enabled: t.enabled})));
              }}
              onCanPlay={() => {
                console.log('📹 Video call can play');
              }}
              onPlay={() => {
                console.log('📹 ✅ Video call started playing successfully!');
              }}
              onError={(e) => {
                console.error('📹 Video call error:', e);
              }}
            />
          )}
          
          {/* Voice call background for voice-only calls */}
          {!callState.isVideoEnabled && (
            <div className="w-full h-full bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-8xl mb-8">📞</div>
                <h2 className="text-3xl font-bold mb-4">{targetUsername}</h2>
                <p className="text-xl opacity-80">Voice Call</p>
                <p className="text-sm opacity-60 mt-2">
                  {callState.isConnected ? 'Connected' :
                   remoteStream ? 'Audio connected' : 
                   localStream ? 'Connecting to peer...' :
                   isAcceptingCall ? 'Setting up audio...' : 'Connecting audio...'}
                </p>
                {callState.isConnected && (
                  <p className="text-xs opacity-50 mt-1 text-green-300">
                    ✅ You should be able to hear each other now
                  </p>
                )}
                {!callState.isConnected && peerConnection && (
                  <p className="text-xs opacity-50 mt-1">
                    ICE: {peerConnection.iceConnectionState}
                  </p>
                )}
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
                className={`w-full h-full object-cover rounded-lg border-2 transition-all duration-200 ${
                  isLocalTalking ? 'border-green-400 shadow-lg shadow-green-400/50' : 'border-white'
                }`}
              />
              {/* Local audio level indicator */}
              <div className="absolute bottom-2 left-2 right-2 h-1 bg-black bg-opacity-50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-400 transition-all duration-100"
                  style={{ width: `${localAudioLevel * 100}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {/* Call timer and connection status */}
          <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg">
            {callState.isConnected ? (
              <div className="font-mono text-lg">{formatCallDuration(callDuration)}</div>
            ) : (
              <div className="text-sm">
                {isAcceptingCall ? 'Connecting...' : 
                 peerConnection ? `Connection: ${peerConnection.iceConnectionState}` : 
                 'Setting up call...'}
              </div>
            )}
          </div>
          
          {/* Voice activity indicators */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">You</span>
                <div className={`w-3 h-3 rounded-full transition-all duration-200 ${
                  isLocalTalking ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
                }`}></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{targetUsername}</span>
                <div className={`w-3 h-3 rounded-full transition-all duration-200 ${
                  isRemoteTalking ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
                }`}></div>
              </div>
            </div>
          </div>
          
          {/* Call controls */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
            <div className="flex gap-4 bg-black bg-opacity-50 rounded-full px-6 py-3">
              <button
                onClick={toggleMute}
                className={`p-3 rounded-full ${
                  callState.isMuted 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-gray-600 hover:bg-gray-700'
                } text-white`}
                title={callState.isMuted ? 'Unmute' : 'Mute'}
              >
                {callState.isMuted ? '🔇' : '🎤'}
              </button>
              
              {callState.isVideoEnabled && (
                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-full ${
                    callState.isVideoEnabled 
                      ? 'bg-gray-600 hover:bg-gray-700' 
                      : 'bg-red-500 hover:bg-red-600'
                  } text-white`}
                  title={callState.isVideoEnabled ? 'Turn off video' : 'Turn on video'}
                >
                  {callState.isVideoEnabled ? '📹' : '📹'}
                </button>
              )}
              
              <button
                onClick={endCall}
                className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full"
                title="End call"
              >
                📞
              </button>
            </div>
          </div>
          
          {/* Call info */}
          <div className="absolute bottom-20 left-4 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg">
            <div className="font-semibold">{targetUsername}</div>
            <div className="text-sm text-gray-300">
              {callState.isVideoEnabled ? 'Video call' : 'Voice call'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Call buttons (when not in call)
  if (!targetUserId || targetUserId === "" || isGlobal) {
    return null; // Don't render anything for global/invalid components
  }
  
  return (
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
};

export default CallControls; 