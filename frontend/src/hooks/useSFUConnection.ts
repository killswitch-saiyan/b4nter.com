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
    const peerConnection = new RTCPeerConnection({ iceServers });
    
    // Add local stream to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote stream from:', participantId);
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.set(participantId, remoteStream);
        return newMap;
      });
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && currentRoomId.current) {
        sendCustomEvent({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate,
          roomId: currentRoomId.current,
          targetParticipantId: participantId,
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Peer connection state with ${participantId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'failed') {
        console.error('Peer connection failed with', participantId);
        peerConnection.restartIce();
      }
    };

    peerConnections.current.set(participantId, peerConnection);
    return peerConnection;
  }, []);

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
            
            // Create offer for new participant if we have local stream
            if (localStreamRef.current) {
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
            
            // Create offer for new participant if we have local stream
            if (localStreamRef.current) {
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
            console.log('Received WebRTC offer from:', data.participantName);
            const peerConnection = createPeerConnection(data.participantId);
            
            try {
              await peerConnection.setRemoteDescription(data.offer);
              const answer = await peerConnection.createAnswer();
              await peerConnection.setLocalDescription(answer);
              
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