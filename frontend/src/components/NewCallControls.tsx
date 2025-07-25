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
  acceptedCall 
}) => {
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
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [currentCallChannel, setCurrentCallChannel] = useState<string | null>(null);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

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
      console.log('✅ Received remote stream');
      setRemoteStream(event.streams[0]);
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
      handleAnswer(data.answer);
    }
    if (data.type === 'webrtc_ice_candidate' && data.candidate) {
      if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    }
  };

  // Handle WebRTC answer
  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ Answer processed');
    }
  };

  // Start call (caller)
  const startCall = async (isVideo: boolean) => {
    try {
      console.log('✅ CALLER: Starting call');
      
      // Create call channel
      const callType = isVideo ? 'video' : 'voice';
      const participants = [user?.id || ''];
      const callChannel = await createCallChannel(callType, participants);
      setCurrentCallChannel(callChannel.id);
      setActiveCallChannelId(callChannel.id);

      // Get media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });
      
      setLocalStream(stream);
      setCallState(prev => ({ 
        ...prev, 
        isOutgoing: true, 
        isVideoEnabled: isVideo,
        isAudioEnabled: true 
      }));

      // Create peer connection
      const pc = createPeerConnection();
      setPeerConnection(pc);
      
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socket) {
        socket.send(JSON.stringify({
          type: 'call_incoming',
          to: targetUserId,
          from: user?.id,
          from_name: user?.username,
          offer: offer,
          isVideo: isVideo,
          channelId: callChannel.id,
          channelName: callChannel.name,
          targetUserId: targetUserId
        }));
      }
    } catch (error) {
      console.error('❌ CALLER: Error starting call:', error);
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
      setCallState(prev => ({ 
        ...prev, 
        isVideoEnabled: isVideoCall,
        isAudioEnabled: true,
        isIncoming: false
      }));

      // Create peer connection
      const pc = createPeerConnection();
      setPeerConnection(pc);
      
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
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
      peerConnection.close();
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
    
    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnection(null);
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

  // Auto-start for caller when in call channel
  useEffect(() => {
    if (!isGlobal && activeCallChannelId && !acceptedCall && !callState.isOutgoing && !callState.isConnected && !localStream) {
      // Caller is in a call channel but hasn't started the call yet - auto-start
      const isVideoCall = currentCallChannel || activeCallChannelId; // Assume video for now
      startCall(true); // Auto-start video call
    }
  }, [isGlobal, activeCallChannelId, acceptedCall, callState.isOutgoing, callState.isConnected, localStream]);

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
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Video call UI
  if (callState.isConnected || callState.isOutgoing || localStream || remoteStream) {
    return (
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
  if (!targetUserId || targetUserId === "" || (isGlobal && acceptedCall)) {
    return null;
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

export default NewCallControls;