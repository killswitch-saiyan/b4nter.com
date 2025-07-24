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
  const { user } = useAuth();
  const { onWebRTCMessage } = useWebSocket();
  const { createCallChannel, createCallChannelForReceiver, removeCallChannel, joinCallChannel, leaveCallChannel, callDuration, setCallDuration, setActiveCallChannelId, channels, setSelectedChannel } = useChannels();
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
    console.log('🔊 CallControls processing message:', data.type);
    
    if (data.type === 'call_channel_created' && data.to === user?.id) {
      let callChannel = channels.find(ch => ch.id === data.channelId);
      if (!callChannel) {
        // Use the exact name from the caller!
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
      console.log('🔊 CallControls processing WebRTC offer');
      setPendingOffer(data.offer);
      return;
    }
    // Handle call_incoming which contains the offer
    if (data.type === 'call_incoming' && data.offer) {
      console.log('🔊 CallControls processing call_incoming with offer');
      setPendingOffer(data.offer);
      return;
    }
    if (data.type === 'webrtc_answer' && data.answer) {
      console.log('🔊 CallControls processing WebRTC answer');
      handleAnswer(data.answer);
      return;
    }
    if (data.type === 'webrtc_ice_candidate' && data.candidate) {
      console.log('🔊 CallControls processing ICE candidate');
      if (peerConnection && peerConnection.remoteDescription) {
        console.log('🔊 Adding ICE candidate to peer connection');
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => {
          console.error('Error adding ICE candidate:', e);
        });
      } else {
        console.log('🔊 Peer connection not ready, queuing ICE candidate');
        setPendingIceCandidates(prev => [...prev, data.candidate]);
      }
      return;
    }
  }, [user?.id, channels, peerConnection, handleAnswer, createCallChannelForReceiver, setCurrentCallChannel, setSelectedChannel, joinCallChannel]);
  // --- End patch ---
  // Now, the handleMessage function can safely call handleSocketMessage

  // Register WebRTC message handler with WebSocket context
  useEffect(() => {
    if (onWebRTCMessage) {
      onWebRTCMessage(handleSocketMessage);
      return () => {
        onWebRTCMessage(null);
      };
    }
  }, [onWebRTCMessage, targetUserId]);

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

  const ensurePeerConnection = React.useCallback((stream: MediaStream | null) => {
    if (!peerConnection) {
      const pc = createPeerConnection();
      if (pc && stream) {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
      }
      setPeerConnection(pc);
      return pc;
    } else if (peerConnection && stream) {
      const existingTracks = peerConnection.getSenders().map(sender => sender.track);
      const streamTracks = stream.getTracks();
      
      for (const track of streamTracks) {
        const trackExists = existingTracks.some(existingTrack => 
          existingTrack && existingTrack.kind === track.kind
        );
        if (!trackExists) {
          peerConnection.addTrack(track, stream);
        }
      }
    }
    return peerConnection;
  }, [peerConnection, createPeerConnection]);

  const createPeerConnection = React.useCallback(() => {
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
        console.log('✅ Received remote track:', event.track.kind);
        
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
  }, [rtcConfig, socket, targetUserId, currentCallChannel, joinCallChannel, user?.id]);

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

  const handleAnswer = React.useCallback(async (answer: RTCSessionDescriptionInit) => {
    console.log('🔊 CallControls handling answer');
    
    try {
      let pc = peerConnection;
      if (!pc) {
        console.log('🔊 No peer connection, creating one');
        pc = ensurePeerConnection(localStream);
      }
      
      if (pc) {
        console.log('🔊 Peer connection signaling state:', pc.signalingState);
        
        // Only process answer if we're in the right state
        if (pc.signalingState === 'have-local-offer') {
          console.log('🔊 Setting remote description with answer');
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('✅ Answer processed successfully');
        } else {
          console.log('🔊 Ignoring answer - peer connection not in correct state:', pc.signalingState);
        }
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
      toast.error('Error completing connection');
    }
  }, [peerConnection, localStream, ensurePeerConnection]);

  // 4. In startCall and acceptCall, always attach local video stream
  const startCall = async (isVideo: boolean) => {
    try {
      console.log('🚀 Starting call with video:', isVideo);
      console.log('🚀 Target user ID:', targetUserId);
      console.log('🚀 Current user ID:', user?.id);
      console.log('🚀 Socket connected:', !!socket);
      
      // Request notification permission if not granted
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      
      // Create call channel
      const callType = isVideo ? 'video' : 'voice';
      const participants = [user?.id || '', targetUserId];
      const callChannel = createCallChannel(callType, participants);
      setCurrentCallChannel(callChannel.id);
      setActiveCallChannelId(callChannel.id); // Set active call channel in context
      
      console.log('🚀 Created call channel:', callChannel);
      
      // Immediately join the call channel as the caller
      joinCallChannel(callChannel.id, user?.id || '');
      console.log('🚀 Caller joined their own call channel');
      
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
        console.log('🚀 Sending call channel created message:', channelMessage);
        socket.send(JSON.stringify(channelMessage));
      }
      
      // Request media permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });
      
      console.log('✅ Media obtained:', stream.getTracks().map(t => t.kind));
      
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
      
      if (pc) {
        stream.getTracks().forEach(track => {
          console.log('🚀 Adding track to peer connection:', track.kind);
          pc.addTrack(track, stream);
        });

        console.log('🚀 Creating offer...');
        const offer = await pc.createOffer();
        console.log('🚀 Offer created:', offer);
        
        await pc.setLocalDescription(offer);
        console.log('🚀 Local description set with offer');

        if (socket) {
          const callMessage = {
            type: 'call_incoming',
            to: targetUserId,
            offer: offer,
            isVideo: isVideo,
            channelId: callChannel.id
          };
          console.log('🚀 Sending call incoming message:', callMessage);
          console.log('🚀 Call type being sent:', isVideo ? 'VIDEO' : 'VOICE');
          console.log('🚀 Local stream tracks:', stream.getTracks().map(t => ({kind: t.kind, enabled: t.enabled})));
          console.log('🚀 Peer connection state after offer:', pc.signalingState);
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
        // Wait for the call channel to appear in the channels list and for the user to be a participant
        let callChannel = channels.find(ch => ch.id === currentCallChannel);
        for (let i = 0; i < 30; i++) { // Try for up to 3 seconds
          await new Promise(res => setTimeout(res, 100));
          callChannel = channels.find(ch => ch.id === currentCallChannel);
          if (callChannel && callChannel.call_participants?.includes(user?.id || '')) break;
        }
        if (!callChannel || !callChannel.call_participants?.includes(user?.id || '')) {
          toast.error("Call channel not ready yet. Please wait a moment and try again.");
          return;
        }
        joinCallChannel(currentCallChannel, user?.id || '');
        setActiveCallChannelId(currentCallChannel);
        setSelectedChannel(callChannel); // Always set selected channel after accepting
        console.log('[CallControls] Joined call channel and participant list updated:', callChannel.call_participants);
      }
      
      // Get user media for the call
      const isVideoCall = acceptedCall?.isVideo || false;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoCall
      });
      
      console.log('✅ Media obtained for accept:', stream.getTracks().map(t => t.kind));
      
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
        console.log('Creating peer connection for incoming call');
        
        const pc = createPeerConnection();
        
        if (pc) {
          // Add local tracks to peer connection
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });

          // Handle the incoming offer
          await handleOffer(offerToProcess);
          setPendingOffer(null);
          console.log('✅ Call accepted');
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
  
  // Reset auto-accept flag when call ends
  useEffect(() => {
    if (!acceptedCall) {
      autoAcceptExecuted.current = false;
    }
  }, [acceptedCall]);
  
  useEffect(() => {
    console.log('🔊 Auto-accept effect triggered:', {
      acceptedCall: !!acceptedCall,
      hasOffer: !!acceptedCall?.offer,
      isConnected: callState.isConnected,
      isIncoming: callState.isIncoming,
      isOutgoing: callState.isOutgoing,
      isAcceptingCall,
      hasAutoAccepted,
      hasPeerConnection: !!peerConnection,
      hasLocalStream: !!localStream,
      autoAcceptExecuted: autoAcceptExecuted.current,
      currentCallChannel,
      acceptedCallChannelId: acceptedCall?.channelId
    });
    
    if (
      acceptedCall &&
      acceptedCall.offer &&
      !callState.isConnected &&
      !callState.isIncoming &&
      !callState.isOutgoing &&
      !isAcceptingCall &&
      !hasAutoAccepted &&
      !peerConnection &&
      !localStream &&
      !autoAcceptExecuted.current &&
      (currentCallChannel === acceptedCall.channelId || !currentCallChannel)
    ) {
      console.log('🔊 Auto-accepting call - executing once only');
      
      // Mark as executed immediately
      autoAcceptExecuted.current = true;
      
      // Set all flags immediately to prevent re-triggers
      setIsAcceptingCall(true);
      setHasAutoAccepted(true);
      setPendingOffer(acceptedCall.offer);
      setCurrentCallChannel(acceptedCall.channelId);
      
      // Execute accept call immediately
      acceptCall(acceptedCall.offer);
    }
  }, [acceptedCall?.channelId, acceptedCall?.offer, callState.isConnected, isAcceptingCall, hasAutoAccepted, peerConnection, localStream]);

  const rejectCall = () => {
    stopRingtone();
    console.log('Rejecting call');
    setCallState(prev => ({ ...prev, isIncoming: false }));
    setPendingOffer(null);
    
    // Leave the call channel when rejecting
    if (currentCallChannel) {
      leaveCallChannel(currentCallChannel, user?.id || '');
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
    
    // Leave the call channel and notify other participants
    if (currentCallChannel) {
      console.log('🔚 Leaving call channel:', currentCallChannel);
      leaveCallChannel(currentCallChannel, user?.id || '');
      
      // Notify other participants that you're leaving
      if (socket) {
        socket.send(JSON.stringify({
          type: 'call_channel_left',
          to: targetUserId,
          channelId: currentCallChannel,
          userId: user?.id,
          username: user?.username || user?.full_name || 'Unknown User'
        }));
      }
      
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
  if (!targetUserId || targetUserId === "") {
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