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
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
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
      console.log('📨 RECEIVED TRACK:', event.track.kind, 'from stream:', event.streams[0]?.id);
      console.log('🎥 Track details:', {
        kind: event.track.kind,
        enabled: event.track.enabled,
        muted: event.track.muted,
        readyState: event.track.readyState,
        label: event.track.label
      });
      
      // Use the stream from the event if available, otherwise accumulate tracks
      if (event.streams && event.streams[0]) {
        const incomingStream = event.streams[0];
        console.log('📺 USING COMPLETE STREAM:', incomingStream.id, 'tracks:', incomingStream.getTracks().length);
        
        // Log all tracks in the incoming stream
        incomingStream.getTracks().forEach((track, index) => {
          console.log(`📹 Stream track ${index}:`, {
            kind: track.kind,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            label: track.label
          });
        });
        
        setRemoteStream(incomingStream);
        console.log('✅ REMOTE STREAM SET - should trigger video display');
      } else {
        console.log('🔄 ACCUMULATING INDIVIDUAL TRACKS');
        // Accumulate tracks into a single stream
        setRemoteStream(prevStream => {
          let tracks = prevStream ? [...prevStream.getTracks()] : [];
          
          // Add the new track if it's not already in the stream
          const existingTrack = tracks.find(t => t.kind === event.track.kind);
          if (!existingTrack) {
            tracks.push(event.track);
            console.log('🔄 Added', event.track.kind, 'track to stream. Total tracks:', tracks.length);
          } else {
            console.log('⚠️ Track already exists in stream:', event.track.kind);
          }
          
          const newStream = new MediaStream(tracks);
          console.log('📺 UPDATED ACCUMULATED STREAM:', newStream.id, 'with', newStream.getTracks().length, 'tracks');
          return newStream;
        });
      }
      
      // Listen for track events
      event.track.addEventListener('unmute', () => {
        console.log('🎉 TRACK UNMUTED:', event.track.kind, '- refreshing video');
        // Force refresh the video element
        setRemoteStream(prevStream => {
          if (prevStream) {
            const refreshedStream = new MediaStream(prevStream.getTracks());
            console.log('🔄 Refreshed stream after unmute:', refreshedStream.id);
            return refreshedStream;
          }
          return prevStream;
        });
      }, { once: true });
      
      event.track.addEventListener('ended', () => {
        console.log('🔚 TRACK ENDED:', event.track.kind);
      });
    };

    pc.onconnectionstatechange = () => {
      console.log('🔗 Connection state changed:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('✅ Call connected successfully');
        console.log('📊 Connection stats:', {
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState
        });
      }
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log('🧊 ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log('🎉 ICE connection established successfully');
        setCallState(prev => ({ ...prev, isConnected: true }));
      } else if (pc.iceConnectionState === 'disconnected') {
        console.log('⚠️ ICE connection disconnected');
      } else if (pc.iceConnectionState === 'failed') {
        console.error('❌ ICE connection failed');
        toast.error('Connection failed');
      }
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
    if (!localVideoRef.current || !localStream) return;
    
    const video = localVideoRef.current;
    video.srcObject = localStream;
    
    // Small delay to ensure DOM is stable before playing
    const playLocal = () => {
      if (localVideoRef.current && localVideoRef.current === video) {
        video.play().catch(e => console.error('Error playing local video:', e));
      }
    };
    
    const timeoutId = setTimeout(playLocal, 50);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [localStream]);

  useEffect(() => {
    if (!remoteVideoRef.current || !remoteStream) return;
    
    const video = remoteVideoRef.current;
    console.log('🔄 Setting up remote video with stream:', remoteStream.id);
    console.log('📊 Stream tracks:', remoteStream.getTracks().map(t => ({
      kind: t.kind,
      enabled: t.enabled,
      muted: t.muted,
      readyState: t.readyState
    })));
    
    // Set stream immediately
    video.srcObject = remoteStream;
    video.muted = true; // Start muted to avoid audio feedback
    video.autoplay = true;
    video.playsInline = true;
    
    // Force load the video
    video.load();
    
    // Use a slight delay to ensure DOM is stable
    const playVideo = () => {
      // Double-check video element is still mounted
      if (!remoteVideoRef.current || remoteVideoRef.current !== video) {
        console.log('⚠️ Video element unmounted, skipping play');
        return;
      }
      
      video.play().then(() => {
        console.log('✅ Remote video playing successfully');
        console.log('📺 Video dimensions:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState
        });
        
        // Check if we actually have video tracks
        const videoTracks = remoteStream.getVideoTracks();
        console.log('📹 Video tracks in stream:', videoTracks.length);
        videoTracks.forEach((track, index) => {
          console.log(`📹 Video track ${index}:`, {
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            label: track.label
          });
        });
      }).catch(error => {
        console.error('❌ Remote video play failed:', error);
        
        // Only retry if element is still mounted
        if (remoteVideoRef.current && remoteVideoRef.current === video) {
          setTimeout(() => {
            if (remoteVideoRef.current && remoteVideoRef.current === video) {
              video.play().catch(e => console.error('❌ Retry play also failed:', e));
            }
          }, 100);
        }
      });
    };
    
    // Small delay to ensure DOM is stable
    const timeoutId = setTimeout(playVideo, 50);
    
    // Monitor for track changes
    const trackListeners: (() => void)[] = [];
    remoteStream.getTracks().forEach(track => {
      const unmutedHandler = () => {
        console.log('🎉 Track unmuted, refreshing video:', track.kind);
        
        // Check if video is still mounted before refreshing
        if (remoteVideoRef.current && remoteVideoRef.current === video) {
          const currentTime = video.currentTime;
          video.load();
          video.srcObject = remoteStream;
          video.currentTime = currentTime;
          
          if (remoteVideoRef.current === video) {
            video.play().catch(e => console.error('❌ Play after unmute failed:', e));
          }
        }
      };
      
      track.addEventListener('unmute', unmutedHandler);
      trackListeners.push(() => track.removeEventListener('unmute', unmutedHandler));
    });
    
    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
      trackListeners.forEach(cleanup => cleanup());
    };
  }, [remoteStream]);

  const startCall = async () => {
    try {
      console.log('🔵 CALLER: Starting call to', targetUsername);
      setCallState({ isInCall: false, isIncoming: false, isConnecting: true });

      console.log('🎥 CALLER: Requesting media stream');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      console.log('✅ CALLER: Got media stream:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        streamId: stream.id
      });
      setLocalStream(stream);

      console.log('🔗 CALLER: Creating peer connection');
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add local tracks - use simple addTrack method
      console.log('📤 CALLER: Adding local tracks to peer connection');
      stream.getTracks().forEach(track => {
        track.enabled = true;
        console.log('📤 CALLER: Adding track:', track.kind, track.enabled);
        pc.addTrack(track, stream);
      });

      console.log('📞 CALLER: Creating offer');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('📤 CALLER: Sending offer to receiver');

      sendCustomEvent({
        type: 'video_call_offer',
        target_user_id: targetUserId,
        caller_name: user?.username || 'Unknown',
        offer: offer
      });

      console.log('✅ CALLER: Call initiated, waiting for answer');
      toast.success(`Calling ${targetUsername}...`);
    } catch (error) {
      console.error('❌ CALLER: Error starting call:', error);
      toast.error('Failed to start call');
      setCallState({ isInCall: false, isIncoming: false, isConnecting: false });
    }
  };

  const handleIncomingCall = async (offer: RTCSessionDescriptionInit) => {
    setCallState({ isInCall: false, isIncoming: true, isConnecting: false });
    
    // Play ringtone
    if (ringtoneRef.current) {
      ringtoneRef.current.loop = true;
      ringtoneRef.current.play().catch(() => {});
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
      console.log('🟢 RECEIVER: Starting acceptCall process');
      
      // Stop ringtone
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
      }
      
      setCallState({ isInCall: false, isIncoming: false, isConnecting: true });

      console.log('🎥 RECEIVER: Requesting media stream');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      console.log('✅ RECEIVER: Got media stream:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        streamId: stream.id
      });
      setLocalStream(stream);

      console.log('🔗 RECEIVER: Creating peer connection');
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Set remote description first
      const offer = (window as any).pendingOffer;
      console.log('📝 RECEIVER: Setting remote description with offer:', offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Add local tracks - use simple addTrack method
      console.log('📤 RECEIVER: Adding local tracks to peer connection');
      stream.getTracks().forEach(track => {
        console.log('📤 RECEIVER: Adding track:', track.kind, track.enabled);
        pc.addTrack(track, stream);
      });

      console.log('📞 RECEIVER: Creating answer');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('📤 RECEIVER: Sending answer back to caller');
      
      // Check connection state and transceivers after answer
      console.log('📊 RECEIVER: Connection state after answer:', pc.connectionState);
      console.log('📊 RECEIVER: ICE connection state:', pc.iceConnectionState);
      console.log('📊 RECEIVER: Signaling state:', pc.signalingState);
      
      const transceivers = pc.getTransceivers();
      console.log('📡 RECEIVER: Transceivers after answer:', transceivers.length);
      transceivers.forEach((transceiver, index) => {
        console.log(`📡 RECEIVER: Transceiver ${index}:`, {
          direction: transceiver.direction,
          currentDirection: transceiver.currentDirection,
          mid: transceiver.mid,
          sender: {
            track: transceiver.sender.track ? {
              kind: transceiver.sender.track.kind,
              enabled: transceiver.sender.track.enabled,
              readyState: transceiver.sender.track.readyState
            } : null
          },
          receiver: {
            track: transceiver.receiver.track ? {
              kind: transceiver.receiver.track.kind,
              enabled: transceiver.receiver.track.enabled,
              readyState: transceiver.receiver.track.readyState
            } : null
          }
        });
      });

      sendCustomEvent({
        type: 'video_call_answer',
        target_user_id: targetUserId,
        answer: answer
      });

      setCallState({ isInCall: true, isIncoming: false, isConnecting: false });
      console.log('✅ RECEIVER: Call setup complete, waiting for remote stream');
      
      // Add a timeout to check if we receive tracks
      setTimeout(() => {
        if (peerConnectionRef.current) {
          const receivers = peerConnectionRef.current.getReceivers();
          console.log('⏰ RECEIVER: 5-second check - Receivers:', receivers.length);
          receivers.forEach((receiver, index) => {
            console.log(`📡 RECEIVER: Receiver ${index}:`, {
              track: receiver.track ? {
                kind: receiver.track.kind,
                enabled: receiver.track.enabled,
                muted: receiver.track.muted,
                readyState: receiver.track.readyState
              } : 'No track'
            });
          });
          
          if (!remoteStream) {
            console.log('⚠️ RECEIVER: Still no remote stream after 5 seconds');
          } else {
            console.log('✅ RECEIVER: Remote stream received!', remoteStream.id);
          }
        }
      }, 5000);
      
      toast.success('Call connected!');
    } catch (error) {
      console.error('❌ RECEIVER: Error accepting call:', error);
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
      console.log('📞 CALLER: Call answered by:', targetUsername);
      console.log('📝 CALLER: Received answer:', answer);
      
      if (peerConnectionRef.current) {
        console.log('🔗 CALLER: Setting remote description (answer)...');
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ CALLER: Remote description set successfully');
        
        // Check connection state and transceivers
        console.log('📊 CALLER: Connection state after answer:', peerConnectionRef.current.connectionState);
        console.log('📊 CALLER: ICE connection state:', peerConnectionRef.current.iceConnectionState);
        console.log('📊 CALLER: Signaling state:', peerConnectionRef.current.signalingState);
        
        const transceivers = peerConnectionRef.current.getTransceivers();
        console.log('📡 CALLER: Transceivers after answer:', transceivers.length);
        transceivers.forEach((transceiver, index) => {
          console.log(`📡 CALLER: Transceiver ${index}:`, {
            direction: transceiver.direction,
            currentDirection: transceiver.currentDirection,
            mid: transceiver.mid,
            sender: {
              track: transceiver.sender.track ? {
                kind: transceiver.sender.track.kind,
                enabled: transceiver.sender.track.enabled,
                readyState: transceiver.sender.track.readyState
              } : null
            },
            receiver: {
              track: transceiver.receiver.track ? {
                kind: transceiver.receiver.track.kind,
                enabled: transceiver.receiver.track.enabled,
                readyState: transceiver.receiver.track.readyState
              } : null
            }
          });
        });
        
        setCallState({ isInCall: true, isIncoming: false, isConnecting: false });
        
        // Add a timeout to check if caller receives remote tracks from receiver
        setTimeout(() => {
          if (peerConnectionRef.current) {
            const receivers = peerConnectionRef.current.getReceivers();
            console.log('⏰ CALLER: 5-second check - Receivers:', receivers.length);
            receivers.forEach((receiver, index) => {
              console.log(`📡 CALLER: Receiver ${index}:`, {
                track: receiver.track ? {
                  kind: receiver.track.kind,
                  enabled: receiver.track.enabled,
                  muted: receiver.track.muted,
                  readyState: receiver.track.readyState
                } : 'No track'
              });
            });
            
            if (!remoteStream) {
              console.log('⚠️ CALLER: Still no remote stream after 5 seconds');
            } else {
              console.log('✅ CALLER: Remote stream received!', remoteStream.id);
            }
          }
        }, 5000);
        
        toast.success('Call connected!');
      } else {
        console.error('❌ CALLER: No peer connection available to handle answer');
      }
    } catch (error) {
      console.error('❌ CALLER: Error handling answer:', error);
      toast.error('Call connection failed');
    }
  };

  const endCall = () => {
    console.log('📴 Ending call with:', targetUsername);
    
    // Clean up video elements first to prevent play errors
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
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
    
    // Clean up video elements first to prevent play errors
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
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
                  muted={true}
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
                  onPlay={() => console.log('📺 JSX: Video play event triggered')}
                  onPause={() => console.log('📺 JSX: Video pause event triggered')}
                  onWaiting={() => console.log('📺 JSX: Video waiting for data')}
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
                
                {/* Unmute button for user interaction */}
                <div className="absolute bottom-2 right-2">
                  <button
                    onClick={() => {
                      if (remoteVideoRef.current) {
                        const video = remoteVideoRef.current;
                        if (video.muted) {
                          video.muted = false;
                          console.log('🔊 Video unmuted via user button');
                        }
                        if (video.paused) {
                          video.play().then(() => {
                            console.log('▶️ Video playing via user button');
                          }).catch(e => {
                            console.error('❌ Play failed via user button:', e);
                          });
                        }
                      }
                    }}
                    className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full text-xs opacity-75 hover:opacity-100"
                    title="Click to unmute/play video"
                  >
                    🔊
                  </button>
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