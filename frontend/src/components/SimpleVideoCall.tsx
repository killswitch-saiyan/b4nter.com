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
  
  // Ringtone audio
  const ringtoneRef = useRef<HTMLAudioElement>(null);

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      console.log('🧊 ICE candidate generated:', event.candidate);
      if (event.candidate) {
        sendCustomEvent({
          type: 'webrtc_ice_candidate',
          to: targetUserId,
          candidate: event.candidate
        });
      } else {
        console.log('🧊 ICE gathering completed');
      }
    };

    pc.ontrack = (event) => {
      console.log('📺 ontrack event triggered:', event);
      console.log('📺 Event streams:', event.streams);
      console.log('📺 Event track:', event.track);
      
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        console.log('📺 Received remote stream:', stream);
        console.log('📺 Remote stream ID:', stream.id);
        console.log('📺 Remote stream tracks:', stream.getTracks());
        console.log('📺 Video tracks:', stream.getVideoTracks().map(t => ({ id: t.id, kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
        console.log('📺 Audio tracks:', stream.getAudioTracks().map(t => ({ id: t.id, kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
        
        setRemoteStream(stream);
      } else {
        console.error('❌ No stream in ontrack event');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('🔗 Connection state changed:', pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('🧊 ICE connection state changed:', pc.iceConnectionState);
    };

    pc.onsignalingstatechange = () => {
      console.log('📡 Signaling state changed:', pc.signalingState);
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
            console.log('🧊 Received ICE candidate:', data.candidate);
            if (peerConnectionRef.current && data.candidate) {
              peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
                .then(() => console.log('✅ ICE candidate added successfully'))
                .catch(error => console.error('❌ Error adding ICE candidate:', error));
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
      console.log('🎬 Setting local video srcObject:', localStream);
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.error('Error playing local video:', e));
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('📺 Setting remote video srcObject:', remoteStream);
      console.log('📺 Remote stream active tracks:', remoteStream.getVideoTracks().length, 'video,', remoteStream.getAudioTracks().length, 'audio');
      
      const video = remoteVideoRef.current;
      
      // Force a clean slate
      video.srcObject = null;
      
      // Small delay to ensure cleanup, then set the stream
      setTimeout(() => {
        if (remoteVideoRef.current && remoteStream) {
          console.log('📺 Setting srcObject after cleanup');
          remoteVideoRef.current.srcObject = remoteStream;
          
          // Force autoplay
          remoteVideoRef.current.autoplay = true;
          remoteVideoRef.current.muted = false;
          
          // Multiple approaches to start playback
          const tryPlay = () => {
            if (remoteVideoRef.current) {
              console.log('📺 Attempting to play video...');
              remoteVideoRef.current.play()
                .then(() => console.log('✅ Video playing successfully'))
                .catch(e => {
                  console.error('❌ Play failed:', e);
                  // Try once more with muted (some browsers require this)
                  if (remoteVideoRef.current) {
                    remoteVideoRef.current.muted = true;
                    remoteVideoRef.current.play()
                      .then(() => {
                        console.log('✅ Video playing muted');
                        // Unmute after it starts playing
                        setTimeout(() => {
                          if (remoteVideoRef.current) {
                            remoteVideoRef.current.muted = false;
                          }
                        }, 1000);
                      })
                      .catch(e2 => console.error('❌ Muted play also failed:', e2));
                  }
                });
            }
          };
          
          // Try immediately
          tryPlay();
          
          // Also try when metadata loads
          remoteVideoRef.current.addEventListener('loadedmetadata', () => {
            console.log('📺 Metadata loaded, trying play again');
            tryPlay();
          }, { once: true });
          
          // Debug the video element state
          setTimeout(() => {
            if (remoteVideoRef.current) {
              console.log('📺 Video element state:', {
                srcObject: !!remoteVideoRef.current.srcObject,
                videoWidth: remoteVideoRef.current.videoWidth,
                videoHeight: remoteVideoRef.current.videoHeight,
                readyState: remoteVideoRef.current.readyState,
                paused: remoteVideoRef.current.paused,
                autoplay: remoteVideoRef.current.autoplay,
                muted: remoteVideoRef.current.muted
              });
            }
          }, 1000);
        }
      }, 100);
    }
  }, [remoteStream]);

  const startCall = async () => {
    try {
      console.log('🚀 Starting video call to:', targetUsername);
      setCallState({ isInCall: false, isIncoming: false, isConnecting: true });

      // Get user media
      console.log('🎥 Requesting user media...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      console.log('✅ Got local stream:', stream);
      console.log('🎬 Local stream tracks:', stream.getTracks());
      setLocalStream(stream);

      // Create peer connection
      console.log('🔗 Creating peer connection...');
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add local stream to peer connection
      console.log('➕ Adding local tracks to peer connection...');
      stream.getTracks().forEach(track => {
        console.log('🎵 Adding track:', track.kind, track);
        pc.addTrack(track, stream);
      });

      // Create and send offer
      console.log('📝 Creating offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('✅ Offer created and set as local description:', offer);

      console.log('📡 Sending offer to:', targetUserId);
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
    
    // Play ringtone
    if (ringtoneRef.current) {
      ringtoneRef.current.loop = true;
      ringtoneRef.current.play().catch(e => console.error('Error playing ringtone:', e));
    }
    
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
      
      // Stop ringtone
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
      }
      
      setCallState({ isInCall: false, isIncoming: false, isConnecting: true });

      // Get user media
      console.log('🎥 Requesting user media for receiver...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      console.log('✅ Got local stream for receiver:', stream);
      console.log('🎬 Receiver local stream tracks:', stream.getTracks());
      setLocalStream(stream);

      // Create peer connection
      console.log('🔗 Creating peer connection for receiver...');
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add local stream - THIS IS CRITICAL
      console.log('➕ Adding receiver tracks to peer connection...');
      stream.getTracks().forEach(track => {
        console.log('🎵 Adding receiver track:', track.kind, track);
        pc.addTrack(track, stream);
      });

      // Set remote description from stored offer
      const offer = (window as any).pendingOffer;
      console.log('📝 Setting remote description (offer):', offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create and send answer
      console.log('📝 Creating answer...');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('✅ Answer created and set as local description:', answer);

      console.log('📡 Sending answer to:', targetUserId);
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
    
    // Stop ringtone
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
    
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
      console.log('📝 Received answer:', answer);
      
      if (peerConnectionRef.current) {
        console.log('🔗 Setting remote description (answer)...');
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Remote description set successfully');
        setCallState({ isInCall: true, isIncoming: false, isConnecting: false });
        toast.success('Call connected!');
      } else {
        console.error('❌ No peer connection available to handle answer');
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
    
    // Stop ringtone if playing
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
    
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
      <>
        <div className="flex gap-2">
          <button
            onClick={startCall}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
            disabled={callState.isConnecting}
          >
            📹 Video Call
          </button>
        </div>
        {/* Hidden ringtone audio element */}
        <audio
          ref={ringtoneRef}
          src="/ringtone.mp3"
          preload="auto"
          className="hidden"
        />
      </>
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
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  controls={false}
                  className="w-full h-full object-cover"
                  style={{ 
                    minWidth: '100%', 
                    minHeight: '100%',
                    backgroundColor: '#1f2937'
                  }}
                  onLoadedMetadata={() => {
                    console.log('📺 JSX: Remote video metadata loaded - dimensions:', {
                      videoWidth: remoteVideoRef.current?.videoWidth,
                      videoHeight: remoteVideoRef.current?.videoHeight
                    });
                  }}
                  onCanPlay={() => console.log('📺 JSX: Remote video can play')}
                  onPlaying={() => console.log('📺 JSX: Remote video started playing')}
                  onLoadedData={() => console.log('📺 JSX: Remote video data loaded')}
                  onTimeUpdate={() => {
                    // Only log once when video actually starts
                    if (remoteVideoRef.current && remoteVideoRef.current.currentTime > 0) {
                      console.log('📺 JSX: Video is actually playing - currentTime:', remoteVideoRef.current.currentTime);
                      remoteVideoRef.current.ontimeupdate = null; // Remove this listener
                    }
                  }}
                  onError={(e) => console.error('❌ JSX: Remote video error:', e)}
                />
                <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
                  Stream Active
                </div>
              </>
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
        
        {/* Hidden ringtone audio element */}
        <audio
          ref={ringtoneRef}
          src="/ringtone.mp3"
          preload="auto"
          className="hidden"
        />
      </div>
    </div>
  );
};

export default SimpleVideoCall;