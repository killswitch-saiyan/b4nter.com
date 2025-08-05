import { useState, useRef, useCallback, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-hot-toast';

interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
}

interface WebRTCMessage {
  type: 'webrtc_offer' | 'webrtc_answer' | 'webrtc_ice_candidate' | 'webrtc_join_room' | 'webrtc_leave_room' | 'webrtc_participant_joined' | 'webrtc_participant_left';
  channelId: string;
  participantId: string;
  participantName?: string;
  targetParticipantId?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export const useWebRTCVideoChat = () => {
  const { user } = useAuth();
  const { sendCustomEvent } = useWebSocket();
  
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [channelId, setChannelId] = useState<string>('');
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const participantId = useRef<string>(uuidv4());

  // ICE servers configuration - using your backend's WebRTC config
  const [iceServers, setIceServers] = useState([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  // Fetch WebRTC configuration from backend
  useEffect(() => {
    const fetchWebRTCConfig = async () => {
      try {
        const response = await fetch('/api/webrtc-config');
        const config = await response.json();
        setIceServers(config.iceServers);
      } catch (error) {
        console.warn('Failed to fetch WebRTC config, using default STUN servers');
      }
    };
    fetchWebRTCConfig();
  }, []);

  // Initialize media
  const initializeMedia = useCallback(async (): Promise<MediaStream> => {
    try {
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
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      console.log('✅ Media initialized successfully');
      return stream;
    } catch (error) {
      console.error('❌ Failed to get user media:', error);
      throw new Error('Failed to access camera/microphone. Please check permissions.');
    }
  }, []);

  // Create peer connection for a participant
  const createPeerConnection = useCallback((targetParticipantId: string) => {
    console.log(`🔗 Creating peer connection for participant: ${targetParticipantId}`);
    
    const peerConnection = new RTCPeerConnection({ 
      iceServers,
      iceCandidatePoolSize: 10
    });
    
    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`📤 Adding local track: ${track.kind} to peer connection for ${targetParticipantId}`);
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    } else {
      console.warn(`⚠️ localStreamRef.current is null when creating peer connection for ${targetParticipantId}. No local tracks added.`);
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`📥 Received remote track from: ${targetParticipantId}. Event:`, event);
      console.log(`📥 Track details:`, {
        kind: event.track.kind,
        enabled: event.track.enabled,
        muted: event.track.muted,
        readyState: event.track.readyState,
        id: event.track.id,
        label: event.track.label
      });
      
      // Check if event.streams is not empty and contains a MediaStream
      if (event.streams && event.streams.length > 0) {
        const remoteStream = event.streams[0]; // Access the first stream
        console.log(`📺 Remote stream received:`, remoteStream);
        console.log(`📺 Remote stream details:`, {
          id: remoteStream.id,
          active: remoteStream.active,
          tracks: remoteStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState,
            id: t.id
          }))
        });
        
        // Check specifically for video tracks
        const videoTracks = remoteStream.getVideoTracks();
        const audioTracks = remoteStream.getAudioTracks();
        console.log(`📺 Remote stream has ${videoTracks.length} video tracks and ${audioTracks.length} audio tracks`);
        
        if (videoTracks.length === 0) {
          console.error(`❌ CRITICAL: Remote stream has NO VIDEO TRACKS for ${targetParticipantId}`);
        }
        
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(targetParticipantId, remoteStream);
          console.log(`📺 Added remote stream for participant: ${targetParticipantId}. Current remoteStreams size: ${newMap.size}`);
          console.log(`📺 Map size: ${newMap.size}`);
          console.log(`📺 Map entries:`, Array.from(newMap.entries()).map(([id, stream]) => [id, {
            streamId: stream.id,
            active: stream.active,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length
          }]));
          return newMap;
        });
      } else {
        console.warn(`⚠️ ontrack event received but no streams found for ${targetParticipantId}`, event);
        console.log(`⚠️ Creating manual stream from track...`);
        
        // Try to create a stream from the track
        const manualStream = new MediaStream([event.track]);
        console.log(`📺 Manual stream created:`, manualStream);
        
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(targetParticipantId, manualStream);
          console.log(`📺 Added manual remote stream for participant: ${targetParticipantId}`);
          return newMap;
        });
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 Sending ICE candidate to: ${targetParticipantId}`);
        sendCustomEvent({
          type: 'webrtc_ice_candidate',
          channelId,
          participantId: participantId.current,
          targetParticipantId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔄 Peer connection state with ${targetParticipantId}: ${peerConnection.connectionState}`);
      
      if (peerConnection.connectionState === 'connected') {
        console.log(`✅ Successfully connected to ${targetParticipantId}`);
      } else if (peerConnection.connectionState === 'failed') {
        console.error(`❌ Peer connection failed with ${targetParticipantId}`);
        peerConnection.restartIce();
      } else if (peerConnection.connectionState === 'disconnected') {
        console.log(`🔌 Disconnected from ${targetParticipantId}`);
      }
    };

    peerConnections.current.set(targetParticipantId, peerConnection);
    return peerConnection;
  }, [channelId, iceServers, sendCustomEvent]);

  // Create offer for a participant
  const createOfferForParticipant = useCallback(async (targetParticipantId: string) => {
    console.log(`📞 Creating offer for: ${targetParticipantId}`);
    
    const peerConnection = createPeerConnection(targetParticipantId);
    
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.setLocalDescription(offer);
      
      sendCustomEvent({
        type: 'webrtc_offer',
        channelId,
        participantId: participantId.current,
        participantName: user?.username,
        targetParticipantId,
        offer: (offer as RTCSessionDescription).toJSON()
      });
      
      console.log(`✅ Offer sent to: ${targetParticipantId}`);
    } catch (error) {
      console.error(`❌ Failed to create offer for ${targetParticipantId}:`, error);
    }
  }, [channelId, createPeerConnection, sendCustomEvent, user?.username]);

  // Handle WebRTC messages
  const handleWebRTCMessage = useCallback(async (message: WebRTCMessage) => {
    if (message.channelId !== channelId) return;
    
    console.log(`📨 Received WebRTC message: ${message.type} from ${message.participantId}`);

    switch (message.type) {
      case 'webrtc_participant_joined':
        if (message.participantId !== participantId.current) {
          console.log(`👋 Participant joined: ${message.participantName}`);
          setParticipants(prev => [
            ...prev.filter(p => p.id !== message.participantId),
            { id: message.participantId, name: message.participantName || 'Unknown' }
          ]);
          
          // Create offer for new participant
          await createOfferForParticipant(message.participantId);
        }
        break;

      case 'webrtc_participant_left':
        console.log(`👋 Participant left: ${message.participantId}`);
        setParticipants(prev => prev.filter(p => p.id !== message.participantId));
        
        // Clean up peer connection
        const pc = peerConnections.current.get(message.participantId);
        if (pc) {
          pc.close();
          peerConnections.current.delete(message.participantId);
        }
        
        // Remove remote stream
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.delete(message.participantId);
          return newMap;
        });
        break;

      case 'webrtc_offer':
        if (message.targetParticipantId === participantId.current && message.offer) {
          console.log(`📞 Received offer from: ${message.participantId}`);
          
          const peerConnection = createPeerConnection(message.participantId);
          
          try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            sendCustomEvent({
              type: 'webrtc_answer',
              channelId,
              participantId: participantId.current,
              targetParticipantId: message.participantId,
              answer: (answer as RTCSessionDescription).toJSON()
            });
            
            console.log(`✅ Answer sent to: ${message.participantId}`);
          } catch (error) {
            console.error(`❌ Failed to handle offer from ${message.participantId}:`, error);
          }
        }
        break;

      case 'webrtc_answer':
        if (message.targetParticipantId === participantId.current && message.answer) {
          console.log(`📞 Received answer from: ${message.participantId}`);
          
          const peerConnection = peerConnections.current.get(message.participantId);
          if (peerConnection) {
            try {
              await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
              console.log(`✅ Remote description set for: ${message.participantId}`);
            } catch (error) {
              console.error(`❌ Failed to set remote description from ${message.participantId}:`, error);
            }
          }
        }
        break;

      case 'webrtc_ice_candidate':
        if (message.targetParticipantId === participantId.current && message.candidate) {
          console.log(`🧊 Received ICE candidate from: ${message.participantId}`);
          
          const peerConnection = peerConnections.current.get(message.participantId);
          if (peerConnection) {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
              console.log(`✅ ICE candidate added for: ${message.participantId}`);
            } catch (error) {
              console.error(`❌ Failed to add ICE candidate from ${message.participantId}:`, error);
            }
          }
        }
        break;
    }
  }, [channelId, createOfferForParticipant, createPeerConnection, sendCustomEvent]);

  // Listen for WebRTC messages via global events
  useEffect(() => {
    const handleWebRTCEvent = (event: CustomEvent) => {
      handleWebRTCMessage(event.detail);
    };

    const events = [
      'webrtc-offer',
      'webrtc-answer', 
      'webrtc-ice-candidate',
      'webrtc-participant-joined',
      'webrtc-participant-left'
    ];

    events.forEach(eventType => {
      window.addEventListener(eventType, handleWebRTCEvent as EventListener);
    });

    return () => {
      events.forEach(eventType => {
        window.removeEventListener(eventType, handleWebRTCEvent as EventListener);
      });
    };
  }, [handleWebRTCMessage]);

  // Connect to video channel
  const connectToChannel = useCallback(async (videoChannelId: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      console.log(`🔗 Connecting to video channel: ${videoChannelId}`);
      
      // Initialize media first
      const stream = await initializeMedia();
      
      setChannelId(videoChannelId);
      setIsConnected(true);
      
      // Announce joining the channel
      sendCustomEvent({
        type: 'webrtc_join_room',
        channelId: videoChannelId,
        participantId: participantId.current,
        participantName: user.username
      });
      
      console.log(`✅ Successfully connected to video channel: ${videoChannelId}`);
      toast.success(`Joined Video-Channel ${videoChannelId}`);
      
    } catch (error) {
      console.error('❌ Failed to connect to video channel:', error);
      setIsConnected(false);
      throw error;
    }
  }, [user, initializeMedia, sendCustomEvent]);

  // Disconnect from video channel
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting from video channel');
    
    if (channelId) {
      sendCustomEvent({
        type: 'webrtc_leave_room',
        channelId,
        participantId: participantId.current
      });
    }
    
    // Close all peer connections
    peerConnections.current.forEach((pc) => {
      pc.close();
    });
    peerConnections.current.clear();

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    // Reset state
    setParticipants([]);
    setRemoteStreams(new Map());
    setLocalStream(null);
    setIsConnected(false);
    setChannelId('');
    setIsAudioEnabled(true);
    setIsVideoEnabled(true);
    
    console.log('✅ Disconnected from video channel');
  }, [channelId, sendCustomEvent]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      const newState = !isAudioEnabled;
      
      audioTracks.forEach(track => {
        track.enabled = newState;
      });
      
      setIsAudioEnabled(newState);
      console.log(`🎤 Audio ${newState ? 'enabled' : 'disabled'}`);
      return newState;
    }
    return false;
  }, [isAudioEnabled]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      const newState = !isVideoEnabled;
      
      videoTracks.forEach(track => {
        track.enabled = newState;
      });
      
      setIsVideoEnabled(newState);
      console.log(`📹 Video ${newState ? 'enabled' : 'disabled'}`);
      return newState;
    }
    return false;
  }, [isVideoEnabled]);

  return {
    // State
    participants,
    localStream,
    remoteStreams,
    isConnected,
    isAudioEnabled,
    isVideoEnabled,
    channelId,
    participantId: participantId.current,
    
    // Methods
    connectToChannel,
    disconnect,
    initializeMedia,
    toggleAudio,
    toggleVideo,
    
    // For debugging
    peerConnections: peerConnections.current
  };
};
