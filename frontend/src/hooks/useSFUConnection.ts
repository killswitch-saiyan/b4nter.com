import { useState, useRef, useCallback } from 'react';

interface Participant {
  id: string;
  name: string;
}

export const useSFUConnection = () => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const ws = useRef<WebSocket | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

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
      if (event.candidate && ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate,
          targetId: participantId,
        }));
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

  // Connect to SFU server
  const connectToSFU = useCallback(async (roomId: string, userName: string, stream: MediaStream) => {
    return new Promise<void>((resolve, reject) => {
      try {
        // Use the same WebSocket URL pattern as your existing app
        const wsUrl = `ws://localhost:8080/ws/${roomId}`;
        const websocket = new WebSocket(wsUrl);
        ws.current = websocket;

        websocket.onopen = () => {
          console.log('Connected to SFU server');
          
          // Join room
          websocket.send(JSON.stringify({
            type: 'join-room',
            roomId,
            userName,
          }));
        };

        websocket.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          console.log('Received SFU message:', message);

          switch (message.type) {
            case 'joined-room':
              console.log('Successfully joined room:', message.roomId);
              setParticipants(message.participants || []);
              resolve();
              break;

            case 'user-joined':
              console.log('User joined:', message.participant);
              setParticipants(prev => [...prev, message.participant]);
              
              // Create offer for new participant
              const peerConnection = createPeerConnection(message.participant.id);
              try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                websocket.send(JSON.stringify({
                  type: 'offer',
                  offer: offer,
                  targetId: message.participant.id,
                }));
              } catch (error) {
                console.error('Failed to create offer:', error);
              }
              break;

            case 'user-left':
              console.log('User left:', message.participantId);
              setParticipants(prev => prev.filter(p => p.id !== message.participantId));
              
              // Close peer connection
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

            case 'offer':
              console.log('Received offer from:', message.senderId);
              const peerConnectionForOffer = createPeerConnection(message.senderId);
              
              try {
                await peerConnectionForOffer.setRemoteDescription(message.offer);
                const answer = await peerConnectionForOffer.createAnswer();
                await peerConnectionForOffer.setLocalDescription(answer);
                
                websocket.send(JSON.stringify({
                  type: 'answer',
                  answer: answer,
                  targetId: message.senderId,
                }));
              } catch (error) {
                console.error('Failed to handle offer:', error);
              }
              break;

            case 'answer':
              console.log('Received answer from:', message.senderId);
              const peerConnectionForAnswer = peerConnections.current.get(message.senderId);
              if (peerConnectionForAnswer) {
                try {
                  await peerConnectionForAnswer.setRemoteDescription(message.answer);
                } catch (error) {
                  console.error('Failed to set remote description:', error);
                }
              }
              break;

            case 'ice-candidate':
              console.log('Received ICE candidate from:', message.senderId);
              const peerConnectionForCandidate = peerConnections.current.get(message.senderId);
              if (peerConnectionForCandidate && message.candidate) {
                try {
                  await peerConnectionForCandidate.addIceCandidate(message.candidate);
                } catch (error) {
                  console.error('Failed to add ICE candidate:', error);
                }
              }
              break;

            case 'error':
              console.error('SFU error:', message.message);
              reject(new Error(message.message));
              break;

            default:
              console.log('Unknown message type:', message.type);
          }
        };

        websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        websocket.onclose = () => {
          console.log('WebSocket connection closed');
        };

      } catch (error) {
        console.error('Failed to connect to SFU:', error);
        reject(error);
      }
    });
  }, [createPeerConnection]);

  // Disconnect from SFU
  const disconnect = useCallback(() => {
    console.log('Disconnecting from SFU');
    
    // Close WebSocket
    if (ws.current) {
      ws.current.close();
      ws.current = null;
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
    setIsAudioEnabled(true);
    setIsVideoEnabled(true);
  }, []);

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
    connectToSFU,
    disconnect,
    initializeMedia,
    toggleAudio,
    toggleVideo,
    peerConnections: peerConnections.current,
    ws: ws.current,
  };
};