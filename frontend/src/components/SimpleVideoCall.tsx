import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { toast } from 'react-hot-toast';

interface SimpleVideoCallProps {
  targetUserId: string;
  targetUsername: string;
}

interface CallState {
  isInCall: boolean;
  isIncoming: boolean;
  isConnecting: boolean;
}

const SimpleVideoCall: React.FC<SimpleVideoCallProps> = ({ targetUserId, targetUsername }) => {
  const { user } = useAuth();
  const { sendCustomEvent } = useWebSocket();
  
  // Call state
  const [callState, setCallState] = useState<CallState>({
    isInCall: false,
    isIncoming: false,
    isConnecting: false
  });
  
  // Media streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  // WebRTC
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendCustomEvent({
          type: 'webrtc_ice_candidate',
          to: targetUserId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('📺 Received remote stream');
      setRemoteStream(event.streams[0]);
    };

    return pc;
  };

  // Handle incoming WebSocket messages
  useEffect(() => {
    const handleWebSocketMessage = (event: CustomEvent) => {
      const data = event.detail;
      if (data.sender_id === targetUserId) {
        switch (data.type) {
          case 'video_call_offer':
            handleIncomingCall(data.offer);
            break;
          case 'video_call_answer':
            handleCallAnswer(data.answer);
            break;
          case 'webrtc_ice_candidate':
            if (peerConnectionRef.current && data.candidate) {
              peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
            break;
          case 'call_ended':
            handleCallEnded();
            break;
        }
      }
    };

    // Add event listener for WebRTC messages
    window.addEventListener('webrtc-message', handleWebSocketMessage as EventListener);
    
    return () => {
      window.removeEventListener('webrtc-message', handleWebSocketMessage as EventListener);
    };
  }, [targetUserId]);

  // Update video elements when streams change
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const startCall = async () => {
    try {
      console.log('🚀 Starting video call to:', targetUsername);
      setCallState({ isInCall: false, isIncoming: false, isConnecting: true });

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      setLocalStream(stream);

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendCustomEvent({
        type: 'video_call_offer',
        target_user_id: targetUserId,
        caller_name: user?.username || 'Unknown',
        offer: offer
      });

      toast.success(`Calling ${targetUsername}...`);
    } catch (error) {
      console.error('❌ Error starting call:', error);
      toast.error('Failed to start call');
      setCallState({ isInCall: false, isIncoming: false, isConnecting: false });
    }
  };

  const handleIncomingCall = async (offer: RTCSessionDescriptionInit) => {
    console.log('📞 Incoming call from:', targetUsername);
    setCallState({ isInCall: false, isIncoming: true, isConnecting: false });
    
    // Store the offer for when user accepts
    (window as any).pendingOffer = offer;
    
    toast.custom((t) => (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border">
        <div className="text-center">
          <p className="font-semibold mb-2">Incoming video call from {targetUsername}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                acceptCall();
                toast.dismiss(t.id);
              }}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Accept
            </button>
            <button
              onClick={() => {
                rejectCall();
                toast.dismiss(t.id);
              }}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    ), { duration: 30000 });
  };

  const acceptCall = async () => {
    try {
      console.log('✅ Accepting call from:', targetUsername);
      setCallState({ isInCall: false, isIncoming: false, isConnecting: true });

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      setLocalStream(stream);

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add local stream
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Set remote description from stored offer
      const offer = (window as any).pendingOffer;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendCustomEvent({
        type: 'video_call_answer',
        target_user_id: targetUserId,
        answer: answer
      });

      setCallState({ isInCall: true, isIncoming: false, isConnecting: false });
      toast.success('Call connected!');
    } catch (error) {
      console.error('❌ Error accepting call:', error);
      toast.error('Failed to accept call');
      setCallState({ isInCall: false, isIncoming: false, isConnecting: false });
    }
  };

  const rejectCall = () => {
    console.log('❌ Rejecting call from:', targetUsername);
    setCallState({ isInCall: false, isIncoming: false, isConnecting: false });
    
    sendCustomEvent({
      type: 'call_ended',
      target_user_id: targetUserId
    });
    
    toast('Call declined');
  };

  const handleCallAnswer = async (answer: RTCSessionDescriptionInit) => {
    try {
      console.log('📞 Call answered by:', targetUsername);
      
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState({ isInCall: true, isIncoming: false, isConnecting: false });
        toast.success('Call connected!');
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
      toast.error('Call connection failed');
    }
  };

  const endCall = () => {
    console.log('📴 Ending call with:', targetUsername);
    
    // Clean up streams
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    if (remoteStream) {
      setRemoteStream(null);
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Send end call signal
    sendCustomEvent({
      type: 'call_ended',
      target_user_id: targetUserId
    });
    
    setCallState({ isInCall: false, isIncoming: false, isConnecting: false });
    toast('Call ended');
  };

  const handleCallEnded = () => {
    console.log('📴 Call ended by:', targetUsername);
    
    // Clean up everything
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    if (remoteStream) {
      setRemoteStream(null);
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    setCallState({ isInCall: false, isIncoming: false, isConnecting: false });
    toast('Call ended');
  };

  // Don't render anything if not in a call
  if (!callState.isInCall && !callState.isConnecting) {
    return (
      <div className="flex gap-2">
        <button
          onClick={startCall}
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
          disabled={callState.isConnecting}
        >
          📹 Video Call
        </button>
      </div>
    );
  }

  // Render video call interface
  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-4xl w-full max-h-full overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Video Call with {targetUsername}
          </h3>
          <button
            onClick={endCall}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            End Call
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-96">
          {/* Local video */}
          <div className="relative bg-gray-900 rounded overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
              You
            </div>
          </div>
          
          {/* Remote video */}
          <div className="relative bg-gray-900 rounded overflow-hidden">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white">
                {callState.isConnecting ? 'Connecting...' : 'Waiting for video...'}
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
              {targetUsername}
            </div>
          </div>
        </div>
        
        {callState.isConnecting && (
          <div className="text-center mt-4 text-gray-600 dark:text-gray-400">
            Connecting to {targetUsername}...
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleVideoCall;