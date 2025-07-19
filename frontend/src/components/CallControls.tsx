import React, { useState, useRef, useEffect } from 'react';
import { useChannels } from '../contexts/ChannelsContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface CallControlsProps {
  targetUserId: string;
  targetUsername: string;
  onCallEnd: () => void;
  socket: WebSocket | null;
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
  socket 
}) => {
  const { user } = useAuth();
  const { createCallChannel, removeCallChannel, joinCallChannel, leaveCallChannel } = useChannels();
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
  const [pendingOffer, setPendingOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [currentCallChannel, setCurrentCallChannel] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

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

  const handleSocketMessage = (data: any) => {
    console.log('CallControls received message:', data);
    
    switch (data.type) {
      case 'call_channel_created':
        console.log('Call channel created notification:', data);
        if (data.to === user?.id) {
          // Show notification about call channel creation
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Call Channel Created`, {
              body: `${data.callType} call channel "${data.channelName}" has been created. Join the call!`,
              icon: '/favicon.ico'
            });
          }
          // You can also show a toast notification here
          toast.success(`${data.callType} call channel created! Check the sidebar.`);
        }
        break;
        
      case 'call_incoming':
        console.log('Incoming call from:', data.from, 'to target:', targetUserId);
        if (data.from === targetUserId) {
          console.log('Setting incoming call state');
          setCallState(prev => ({ ...prev, isIncoming: true }));
          setPendingOffer(data.offer);
          setCurrentCallChannel(data.channelId);
          // Add browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Incoming call from ${targetUsername}`, {
              body: data.isVideo ? 'Video call' : 'Voice call',
              icon: '/favicon.ico'
            });
          }
        }
        break;
      
      case 'call_accepted':
        console.log('Call accepted from:', data.from, 'to target:', targetUserId);
        if (data.from === targetUserId) {
          console.log('Setting call connected state');
          setCallState(prev => ({ ...prev, isIncoming: false, isConnected: true }));
          createPeerConnection();
        }
        break;
      
      case 'call_rejected':
        console.log('Call rejected from:', data.from, 'to target:', targetUserId);
        if (data.from === targetUserId) {
          console.log('Setting call rejected state');
          setCallState(prev => ({ ...prev, isIncoming: false }));
          endCall();
        }
        break;
      
      case 'call_ended':
        console.log('Call ended from:', data.from, 'to target:', targetUserId);
        if (data.from === targetUserId) {
          console.log('Ending call');
          endCall();
        }
        break;
      
      case 'webrtc_offer':
        console.log('WebRTC offer from:', data.from, 'to target:', targetUserId);
        if (data.from === targetUserId) {
          console.log('Handling WebRTC offer');
          handleOffer(data.offer);
        }
        break;
      
      case 'webrtc_answer':
        console.log('WebRTC answer from:', data.from, 'to target:', targetUserId);
        if (data.from === targetUserId) {
          console.log('Handling WebRTC answer');
          handleAnswer(data.answer);
        }
        break;
      
      case 'webrtc_ice_candidate':
        console.log('WebRTC ICE candidate from:', data.from, 'to target:', targetUserId);
        if (data.from === targetUserId) {
          console.log('Handling WebRTC ICE candidate');
          handleIceCandidate(data.candidate);
        }
        break;
    }
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(rtcConfig);
    
    pc.ontrack = (event) => {
      console.log('Received remote stream:', event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log('Sending ICE candidate');
        socket.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          to: targetUserId,
          candidate: event.candidate
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('WebRTC connection established!');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log('WebRTC connection failed or disconnected');
        endCall();
      }
    };

    setPeerConnection(pc);
    return pc;
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    console.log('Handling offer:', offer);
    if (!peerConnection) {
      const pc = createPeerConnection();
      if (localStream) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
      }
    }
    
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      if (socket) {
        console.log('Sending answer');
        socket.send(JSON.stringify({
          type: 'webrtc_answer',
          to: targetUserId,
          answer: answer
        }));
      }
    }
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    console.log('Handling answer:', answer);
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    console.log('Handling ICE candidate:', candidate);
    if (!peerConnection) return;
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  const startCall = async (isVideo: boolean) => {
    try {
      console.log('Starting call with video:', isVideo);
      
      // Request notification permission if not granted
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      
      // Create call channel
      const callType = isVideo ? 'video' : 'voice';
      const participants = [user?.id || '', targetUserId];
      const callChannel = createCallChannel(callType, participants);
      setCurrentCallChannel(callChannel.id);
      
      // Notify target user about call channel creation
      if (socket) {
        socket.send(JSON.stringify({
          type: 'call_channel_created',
          to: targetUserId,
          channelId: callChannel.id,
          channelName: callChannel.name,
          callType: callType,
          participants: participants
        }));
      }
      
      // Request media permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });
      
      console.log('Media stream obtained:', stream.getTracks().map(t => t.kind));
      
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
          console.log('Adding track to peer connection:', track.kind);
          pc.addTrack(track, stream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (socket) {
          console.log('Sending call offer to:', targetUserId);
          socket.send(JSON.stringify({
            type: 'call_incoming',
            to: targetUserId,
            offer: offer,
            isVideo: isVideo,
            channelId: callChannel.id
          }));
        } else {
          console.error('WebSocket not connected');
          alert('Not connected to server. Please check your connection.');
        }
      }
    } catch (error) {
      console.error('Error starting call:', error);
      if (error.name === 'NotAllowedError') {
        alert('Camera/microphone access denied. Please allow permissions and try again.');
      } else if (error.name === 'NotFoundError') {
        alert('Camera or microphone not found. Please check your devices.');
      } else {
        alert(`Could not start call: ${error.message}`);
      }
    }
  };

  const acceptCall = async () => {
    try {
      console.log('Accepting call');
      setCallState(prev => ({ ...prev, isIncoming: false, isConnected: true }));
      
      // Join the call channel if it exists
      if (currentCallChannel) {
        joinCallChannel(currentCallChannel, user?.id || '');
      }
      
      // Get user media for the call
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: pendingOffer ? true : false // Assume video if we have an offer
      });
      
      setLocalStream(stream);
      setCallState(prev => ({ 
        ...prev, 
        isVideoEnabled: pendingOffer ? true : false,
        isAudioEnabled: true 
      }));

      const pc = createPeerConnection();
      
      if (pc && pendingOffer) {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        await handleOffer(pendingOffer);
        setPendingOffer(null);
      }
      
      if (socket) {
        socket.send(JSON.stringify({
          type: 'call_accepted',
          to: targetUserId
        }));
      }
    } catch (error) {
      console.error('Error accepting call:', error);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  const rejectCall = () => {
    console.log('Rejecting call');
    setCallState(prev => ({ ...prev, isIncoming: false }));
    setPendingOffer(null);
    
    // Remove call channel if it exists
    if (currentCallChannel) {
      removeCallChannel(currentCallChannel);
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
    console.log('Ending call');
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }
    
    setRemoteStream(null);
    setPendingOffer(null);
    setCallState({
      isIncoming: false,
      isOutgoing: false,
      isConnected: false,
      isVideoEnabled: false,
      isAudioEnabled: false,
      isMuted: false
    });
    
    // Remove call channel
    if (currentCallChannel) {
      removeCallChannel(currentCallChannel);
      setCurrentCallChannel(null);
    }
    
    onCallEnd();
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

  // Active call UI
  if (callState.isConnected) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="relative w-full h-full max-w-4xl max-h-[80vh]">
          {/* Remote video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover rounded-lg"
          />
          
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
                    !callState.isVideoEnabled 
                      ? 'bg-red-500 hover:bg-red-600' 
                      : 'bg-gray-600 hover:bg-gray-700'
                  } text-white`}
                  title={callState.isVideoEnabled ? 'Turn off video' : 'Turn on video'}
                >
                  {callState.isVideoEnabled ? '📹' : '📷'}
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
          <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg">
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