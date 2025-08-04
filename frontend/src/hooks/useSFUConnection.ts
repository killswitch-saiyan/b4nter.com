import { useState, useRef, useCallback, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

interface Participant {
  id: string;
  name: string;
}

export const useSFUConnection = () => {
  const { sendCustomEvent, socket } = useWebSocket();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentRoomId = useRef<string | null>(null);

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
      if (event.candidate && socket?.readyState === WebSocket.OPEN) {
        sendCustomEvent({
          type: 'ice-candidate',
          candidate: event.candidate,
          targetId: participantId,
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

  // Connect to SFU via existing WebSocket
  const connectToSFU = useCallback(async (roomId: string, userName: string, stream: MediaStream) => {
    return new Promise<void>((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      currentRoomId.current = roomId;
      setIsConnected(true);
      
      // Join room via existing WebSocket
      const joinMessage = {
        type: 'join-room',
        roomId,
        userName,
      };
      console.log('📤 Sending join-room message via existing WebSocket:', joinMessage);
      sendCustomEvent(joinMessage);
      
      // Set up a temporary resolver for the joined-room response
      const handleJoinedRoom = (event: any) => {
        const data = event.detail;
        if (data.roomId === roomId) {
          console.log('Successfully joined room:', data.roomId);
          setParticipants(data.participants || []);
          window.removeEventListener('sfu-joined-room', handleJoinedRoom);
          resolve();
        }
      };
      
      const handleError = (event: any) => {
        const data = event.detail;
        console.error('SFU error:', data.message);
        window.removeEventListener('sfu-error', handleError);
        window.removeEventListener('sfu-joined-room', handleJoinedRoom);
        reject(new Error(data.message));
      };

      window.addEventListener('sfu-joined-room', handleJoinedRoom);
      window.addEventListener('sfu-error', handleError);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('sfu-joined-room', handleJoinedRoom);
        window.removeEventListener('sfu-error', handleError);
        reject(new Error('Connection timeout'));
      }, 10000);
    });
  }, [socket, sendCustomEvent]);

  // Event listeners for SFU messages
  useEffect(() => {
    const handleUserJoined = async (event: any) => {
      const data = event.detail;
      console.log('User joined:', data.participant);
      setParticipants(prev => [...prev, data.participant]);
      
      // Create offer for new participant
      if (localStreamRef.current) {
        const peerConnection = createPeerConnection(data.participant.id);
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          
          sendCustomEvent({
            type: 'offer',
            offer: offer,
            targetId: data.participant.id,
          });
        } catch (error) {
          console.error('Failed to create offer:', error);
        }
      }
    };

    const handleUserLeft = (event: any) => {
      const data = event.detail;
      console.log('User left:', data.participantId);
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
    };

    const handleOffer = async (event: any) => {
      const data = event.detail;
      console.log('Received offer from:', data.senderId);
      const peerConnection = createPeerConnection(data.senderId);
      
      try {
        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        sendCustomEvent({
          type: 'answer',
          answer: answer,
          targetId: data.senderId,
        });
      } catch (error) {
        console.error('Failed to handle offer:', error);
      }
    };

    const handleAnswer = async (event: any) => {
      const data = event.detail;
      console.log('Received answer from:', data.senderId);
      const peerConnection = peerConnections.current.get(data.senderId);
      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(data.answer);
        } catch (error) {
          console.error('Failed to set remote description:', error);
        }
      }
    };

    const handleIceCandidate = async (event: any) => {
      const data = event.detail;
      console.log('Received ICE candidate from:', data.senderId);
      const peerConnection = peerConnections.current.get(data.senderId);
      if (peerConnection && data.candidate) {
        try {
          await peerConnection.addIceCandidate(data.candidate);
        } catch (error) {
          console.error('Failed to add ICE candidate:', error);
        }
      }
    };

    // Add event listeners
    window.addEventListener('sfu-user-joined', handleUserJoined);
    window.addEventListener('sfu-user-left', handleUserLeft);
    window.addEventListener('sfu-offer', handleOffer);
    window.addEventListener('sfu-answer', handleAnswer);
    window.addEventListener('sfu-ice-candidate', handleIceCandidate);

    // Cleanup
    return () => {
      window.removeEventListener('sfu-user-joined', handleUserJoined);
      window.removeEventListener('sfu-user-left', handleUserLeft);
      window.removeEventListener('sfu-offer', handleOffer);
      window.removeEventListener('sfu-answer', handleAnswer);
      window.removeEventListener('sfu-ice-candidate', handleIceCandidate);
    };
  }, [createPeerConnection, sendCustomEvent]);

  // Disconnect from SFU
  const disconnect = useCallback(() => {
    console.log('Disconnecting from SFU');
    
    setIsConnected(false);
    currentRoomId.current = null;

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
    isConnected,
    connectToSFU,
    disconnect,
    initializeMedia,
    toggleAudio,
    toggleVideo,
    peerConnections: peerConnections.current,
  };
};