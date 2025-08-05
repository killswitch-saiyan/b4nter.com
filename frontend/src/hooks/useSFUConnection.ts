import { useState, useRef, useCallback, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

interface Participant {
  id: string;
  name: string;
}

export const useSFUConnection = () => {
  const { sendCustomEvent, onWebRTCMessage } = useWebSocket();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentRoomId = useRef<string | null>(null);
  const currentUserName = useRef<string | null>(null);

  // ICE servers configuration
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Initialize media (camera/microphone)
  const initializeMedia = useCallback(async (): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      console.error('Failed to get user media:', error);
      throw error;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback((participantId: string) => {
    console.log('🔗 Creating peer connection for:', participantId);
    console.log('🔗 Local stream available:', !!localStreamRef.current);
    
    const peerConnection = new RTCPeerConnection({ iceServers });
    
    // Add local stream to peer connection
    if (localStreamRef.current) {
      console.log('🔗 Adding local tracks to peer connection for:', participantId);
      localStreamRef.current.getTracks().forEach(track => {
        console.log('🔗 Adding track:', track.kind, 'enabled:', track.enabled);
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    } else {
      console.warn('🔗 No local stream available when creating peer connection for:', participantId);
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('🎥 Received remote stream from:', participantId, event.streams);
      const [remoteStream] = event.streams;
      if (remoteStream) {
        console.log('🎥 Remote stream tracks:', remoteStream.getTracks().map(t => ({ 
          kind: t.kind, 
          enabled: t.enabled, 
          readyState: t.readyState,
          id: t.id 
        })));
        console.log('🎥 Remote stream active:', remoteStream.active);
        console.log('🎥 Remote stream id:', remoteStream.id);
        
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(participantId, remoteStream);
          console.log('🎥 Updated remote streams map size:', newMap.size);
          console.log('🎥 Current remote streams keys:', Array.from(newMap.keys()));
          return newMap;
        });
      } else {
        console.error('🎥 No remote stream in ontrack event from:', participantId);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && currentRoomId.current) {
        console.log('🧊 Sending ICE candidate to:', participantId);
        sendCustomEvent({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate,
          roomId: currentRoomId.current,
          targetParticipantId: participantId,
        });
      } else if (!event.candidate) {
        console.log('🧊 ICE gathering completed for:', participantId);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔗 Peer connection state with ${participantId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected') {
        console.log('🔗 Peer connection established with:', participantId);
      } else if (peerConnection.connectionState === 'failed') {
        console.error('🔗 Peer connection failed with', participantId);
        peerConnection.restartIce();
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state with ${participantId}:`, peerConnection.iceConnectionState);
    };

    peerConnections.current.set(participantId, peerConnection);
    return peerConnection;
  }, [sendCustomEvent]);

  // Connect to video room (frontend-only SFU approach)
  const connectToSFU = useCallback(async (roomId: string, userName: string, stream: MediaStream) => {
    return new Promise<void>((resolve, reject) => {
      try {
        currentRoomId.current = roomId;
        currentUserName.current = userName;
        setIsConnected(true);
        
        console.log(`🎥 Joining video room: ${roomId} as ${userName}`);
        
        // First, ask existing participants to identify themselves
        sendCustomEvent({
          type: 'webrtc_room_query',
          channelId: roomId,
          participantId: userName,
          participantName: userName
        });
        
        // Wait a moment, then announce our joining
        setTimeout(() => {
          sendCustomEvent({
            type: 'webrtc_join_room', 
            channelId: roomId,
            participantId: userName,
            participantName: userName
          });
        }, 100);
        
        // Start with empty participants list - will be populated as others respond
        setParticipants([]);
        
        // Resolve immediately since this is a peer-to-peer approach
        resolve();
      } catch (error) {
        console.error('Failed to join video room:', error);
        reject(error);
      }
    });
  }, [sendCustomEvent]);

  // Handle WebRTC messages via WebSocket context
  useEffect(() => {
    const handleWebRTCMessage = async (data: any) => {
      if (!currentRoomId.current || !currentUserName.current) return;
      
      console.log('🔄 Processing WebRTC message:', data.type, data);
      
      switch (data.type) {
        case 'webrtc_participant_joined':
          // Handle messages from existing backend handlers
          if (data.channelId === currentRoomId.current && data.participantName !== currentUserName.current) {
            console.log('🔄 Processing participant joined:', data.participantName);
            const participant = { id: data.participantId, name: data.participantName };
            setParticipants(prev => {
              if (!prev.find(p => p.id === participant.id)) {
                console.log('➕ Adding participant:', participant);
                return [...prev, participant];
              }
              return prev;
            });
            
            // Only the "older" participant creates an offer to avoid conflicts
            if (localStreamRef.current && currentUserName.current && 
                currentUserName.current.localeCompare(data.participantId) < 0) {
              console.log('🎥 I am the initiator, creating offer for:', data.participantId);
              const peerConnection = createPeerConnection(data.participantId);
              try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                console.log('🎥 Created offer for:', data.participantId);
                
                sendCustomEvent({
                  type: 'webrtc_offer',
                  offer: offer,
                  channelId: currentRoomId.current,
                  participantId: currentUserName.current,
                  participantName: currentUserName.current,
                  targetParticipantId: data.participantId
                });
              } catch (error) {
                console.error('Failed to create offer:', error);
              }
            } else {
              console.log('🎥 I am the receiver, waiting for offer from:', data.participantId);
            }
          }
          break;

        case 'webrtc_room_query':
          // If someone is asking about our room and we're in it, respond
          if (data.channelId === currentRoomId.current && data.participantName !== currentUserName.current) {
            console.log('Responding to room query from:', data.participantName);
            sendCustomEvent({
              type: 'webrtc_room_response',
              channelId: currentRoomId.current,
              participantId: currentUserName.current,
              participantName: currentUserName.current,
              targetParticipantId: data.participantId
            });
          }
          break;

        case 'webrtc_room_response':
          // If someone responded to our room query, add them as a participant
          if (data.channelId === currentRoomId.current && data.targetParticipantId === currentUserName.current) {
            console.log('Received room response from:', data.participantName);
            const participant = { id: data.participantId, name: data.participantName };
            setParticipants(prev => {
              if (!prev.find(p => p.id === participant.id)) {
                return [...prev, participant];
              }
              return prev;
            });
          }
          break;

        case 'webrtc_join_room':
          // Only handle if it's for our current room and not from ourselves
          if (data.channelId === currentRoomId.current && data.participantName !== currentUserName.current) {
            console.log('Participant joined room:', data.participantName);
            const participant = { id: data.participantId, name: data.participantName };
            setParticipants(prev => {
              if (!prev.find(p => p.id === participant.id)) {
                return [...prev, participant];
              }
              return prev;
            });
            
            // Only the "older" participant creates an offer to avoid conflicts
            // Compare participant IDs to determine who should initiate
            if (localStreamRef.current && currentUserName.current && 
                currentUserName.current.localeCompare(data.participantId) < 0) {
              console.log('🎥 I am the initiator, creating offer for:', data.participantId);
              const peerConnection = createPeerConnection(data.participantId);
              try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                sendCustomEvent({
                  type: 'webrtc_offer',
                  offer: offer,
                  channelId: currentRoomId.current,
                  participantId: currentUserName.current,
                  participantName: currentUserName.current,
                  targetParticipantId: data.participantId
                });
              } catch (error) {
                console.error('Failed to create offer:', error);
              }
            } else {
              console.log('🎥 I am the receiver, waiting for offer from:', data.participantId);
            }
          }
          break;

        case 'webrtc_participant_left':
        case 'webrtc_leave_room':
          if (data.channelId === currentRoomId.current) {
            console.log('Participant left room:', data.participantId);
            setParticipants(prev => prev.filter(p => p.id !== data.participantId));
            
            // Close peer connection
            const pc = peerConnections.current.get(data.participantId);
            if (pc) {
              pc.close();
              peerConnections.current.delete(data.participantId);
            }
            
            // Remove remote stream
            setRemoteStreams(prev => {
              const newMap = new Map(prev);
              newMap.delete(data.participantId);
              return newMap;
            });
          }
          break;

        case 'webrtc_offer':
          // Only handle offers for our room and targeted at us
          if (data.channelId === currentRoomId.current && data.targetParticipantId === currentUserName.current) {
            console.log('🎥 Received WebRTC offer from:', data.participantName);
            
            // Add the participant if not already present
            const participant = { id: data.participantId, name: data.participantName };
            setParticipants(prev => {
              if (!prev.find(p => p.id === participant.id)) {
                console.log('➕ Adding participant from offer:', participant);
                return [...prev, participant];
              }
              return prev;
            });
            
            const peerConnection = createPeerConnection(data.participantId);
            
            try {
              console.log('🎥 Setting remote description and creating answer for:', data.participantId);
              await peerConnection.setRemoteDescription(data.offer);
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              
              console.log('🎥 Sending answer to:', data.participantId);
              sendCustomEvent({
                type: 'webrtc_answer',
                answer: answer,
                channelId: currentRoomId.current,
                participantId: currentUserName.current,
                targetParticipantId: data.participantId
              });
            } catch (error) {
              console.error('Failed to handle WebRTC offer:', error);
            }
          }
          break;

        case 'webrtc_answer':
          if (data.channelId === currentRoomId.current && data.targetParticipantId === currentUserName.current) {
            console.log('Received WebRTC answer from:', data.participantId);
            const peerConnection = peerConnections.current.get(data.participantId);
            if (peerConnection) {
              try {
                await peerConnection.setRemoteDescription(data.answer);
              } catch (error) {
                console.error('Failed to set remote description:', error);
              }
            }
          }
          break;

        case 'webrtc_ice_candidate':
          if (data.channelId === currentRoomId.current && data.targetParticipantId === currentUserName.current) {
            console.log('Received WebRTC ICE candidate from:', data.participantId);
            const peerConnection = peerConnections.current.get(data.participantId);
            if (peerConnection && data.candidate) {
              try {
                await peerConnection.addIceCandidate(data.candidate);
              } catch (error) {
                console.error('Failed to add ICE candidate:', error);
              }
            }
          }
          break;
      }
    };

    // Register the handler with WebSocket context
    if (onWebRTCMessage) {
      onWebRTCMessage(handleWebRTCMessage);
    }

    // Cleanup
    return () => {
      if (onWebRTCMessage) {
        onWebRTCMessage(null);
      }
    };
  }, [createPeerConnection, sendCustomEvent, onWebRTCMessage]);

  // Disconnect from video room
  const disconnect = useCallback(() => {
    console.log('Disconnecting from video room');
    
    // Notify others that we're leaving
    if (currentRoomId.current && currentUserName.current) {
      sendCustomEvent({
        type: 'webrtc_leave_room',
        channelId: currentRoomId.current,
        participantId: currentUserName.current
      });
    }
    
    setIsConnected(false);
    currentRoomId.current = null;
    currentUserName.current = null;

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
    setIsAudioEnabled(true);
    setIsVideoEnabled(true);
  }, [sendCustomEvent]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled(audioTracks[0]?.enabled || false);
      return audioTracks[0]?.enabled || false;
    }
    return false;
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(videoTracks[0]?.enabled || false);
      return videoTracks[0]?.enabled || false;
    }
    return false;
  }, []);

  return {
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
    peerConnections: peerConnections.current,
  };
};