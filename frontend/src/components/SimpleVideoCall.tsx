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
      
      // Handle the case where there might not be a stream but we have a track
      let stream;
      if (event.streams && event.streams[0]) {
        stream = event.streams[0];
        console.log('📺 Using stream from event.streams[0]');
      } else {
        // Create a new MediaStream with the track
        console.log('📺 No stream in event, creating new MediaStream with track');
        stream = new MediaStream([event.track]);
      }
      
      if (stream) {
        console.log('📺 Received remote stream:', stream);
        console.log('📺 Remote stream ID:', stream.id);
        console.log('📺 Remote stream tracks:', stream.getTracks());
        
        // Detailed track analysis
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        
        console.log('📺 Video tracks detailed:', videoTracks.map(t => ({ 
          id: t.id, 
          kind: t.kind, 
          enabled: t.enabled, 
          readyState: t.readyState,
          muted: t.muted,
          label: t.label
        })));
        
        console.log('📺 Audio tracks detailed:', audioTracks.map(t => ({ 
          id: t.id, 
          kind: t.kind, 
          enabled: t.enabled, 
          readyState: t.readyState,
          muted: t.muted,
          label: t.label
        })));
        
        // Analyze track states and try to fix muted tracks
        videoTracks.forEach((track, index) => {
          console.log(`📺 Video track ${index} detailed analysis:`, {
            id: track.id,
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted,
            label: track.label,
            constraints: track.getConstraints(),
            settings: track.getSettings()
          });
          
          if (track.muted) {
            console.log('⚠️ Video track is muted, this means no video data is flowing!');
            console.log('📺 Attempting to debug muted track...');
            
            // Try to listen for unmute event
            track.addEventListener('unmute', () => {
              console.log('🎉 Video track unmuted!');
            }, { once: true });
            
            // Try to monitor track state changes
            track.addEventListener('ended', () => {
              console.log('❌ Video track ended');
            });
          } else {
            console.log('✅ Video track is active and unmuted');
          }
        });
        
        audioTracks.forEach((track, index) => {
          console.log(`🎵 Audio track ${index} detailed analysis:`, {
            id: track.id,
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted,
            label: track.label,
            constraints: track.getConstraints(),
            settings: track.getSettings()
          });
          
          if (track.muted) {
            console.log('⚠️ Audio track is muted, this means no audio data is flowing!');
            
            // Try to listen for unmute event
            track.addEventListener('unmute', () => {
              console.log('🎉 Audio track unmuted!');
            }, { once: true });
            
            // Try to monitor track state changes
            track.addEventListener('ended', () => {
              console.log('❌ Audio track ended');
            });
          } else {
            console.log('✅ Audio track is active and unmuted');
          }
        });
        
        // Update the remote stream, or add tracks to existing stream
        setRemoteStream(prevStream => {
          if (prevStream) {
            // Add the new track to existing stream
            console.log('📺 Adding track to existing remote stream');
            prevStream.addTrack(event.track);
            return new MediaStream(prevStream.getTracks()); // Create new stream to trigger re-render
          } else {
            console.log('📺 Setting new remote stream');
            return stream;
          }
        });
      } else {
        console.error('❌ No stream could be created from ontrack event');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('🔗 Connection state changed:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('🎉 Peer connection fully established!');
        // Debug the connection further
        pc.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'track' && report.kind === 'video') {
              console.log('📊 Video track stats:', report);
            }
            if (report.type === 'track' && report.kind === 'audio') {
              console.log('📊 Audio track stats:', report);
            }
          });
        }).catch(e => console.error('Stats error:', e));
      }
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
      
      // Add track event listeners for local stream
      localStream.getTracks().forEach(track => {
        track.addEventListener('unmute', () => {
          console.log('🎉 Local track unmuted:', track.kind);
        });
        track.addEventListener('mute', () => {
          console.log('⚠️ Local track muted:', track.kind);
        });
      });
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('📺 Setting remote video srcObject:', remoteStream);
      console.log('📺 Remote stream active tracks:', remoteStream.getVideoTracks().length, 'video,', remoteStream.getAudioTracks().length, 'audio');
      
      const video = remoteVideoRef.current;
      
      // Clean up previous event listeners and stream
      video.srcObject = null;
      video.load(); // Reset video element state
      
      // Set up comprehensive autoplay handling
      const setupVideoPlayback = async () => {
        if (!remoteVideoRef.current || !remoteStream) return;
        
        const videoElement = remoteVideoRef.current;
        videoElement.srcObject = remoteStream;
        
        // Critical: Start muted for autoplay policy compliance
        videoElement.muted = true;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        
        console.log('📺 Starting muted autoplay for browser policy compliance');
        
        try {
          await videoElement.play();
          console.log('✅ Video started playing (muted)');
          
          // Wait for video to actually start showing content
          const waitForVideoContent = () => {
            return new Promise((resolve) => {
              const checkContent = () => {
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                  console.log('✅ Video content loaded:', {
                    width: videoElement.videoWidth,
                    height: videoElement.videoHeight
                  });
                  resolve(true);
                } else if (videoElement.readyState >= 2) {
                  // Try again in a bit
                  setTimeout(checkContent, 100);
                } else {
                  setTimeout(checkContent, 100);
                }
              };
              checkContent();
              
              // Timeout after 5 seconds
              setTimeout(() => resolve(false), 5000);
            });
          };
          
          const hasContent = await waitForVideoContent();
          
          if (hasContent) {
            // Now we can safely unmute the video
            console.log('📺 Video content confirmed, unmuting...');
            videoElement.muted = false;
            console.log('🔊 Video unmuted successfully');
          } else {
            console.log('⚠️ Video content timeout - keeping muted');
          }
          
        } catch (error) {
          console.error('❌ Autoplay failed:', error);
          console.log('📺 Trying alternative playback methods...');
          
          // Fallback: Try user interaction
          const playOnInteraction = async () => {
            try {
              console.log('📺 Attempting play on user interaction');
              await videoElement.play();
              videoElement.muted = false;
              console.log('✅ Video playing after user interaction');
              
              // Remove the event listener after successful play
              document.removeEventListener('click', playOnInteraction);
              document.removeEventListener('touchstart', playOnInteraction);
            } catch (e) {
              console.error('❌ Play on interaction failed:', e);
            }
          };
          
          // Add event listeners for user interaction
          document.addEventListener('click', playOnInteraction, { once: true });
          document.addEventListener('touchstart', playOnInteraction, { once: true });
          
          console.log('📺 Video will play on next user interaction');
        }
      };
      
      // Add track event listeners for remote stream
      remoteStream.getTracks().forEach(track => {
        track.addEventListener('unmute', () => {
          console.log('🎉 Remote track unmuted:', track.kind);
          
          if (track.kind === 'video') {
            // When video track unmutes, restart playback
            console.log('📺 Video track unmuted - restarting playback');
            setTimeout(() => setupVideoPlayback(), 100);
          }
        }, { once: true }); // Only listen once per track
        
        track.addEventListener('mute', () => {
          console.log('⚠️ Remote track muted:', track.kind);
        });
      });
      
      // Start the video setup
      setupVideoPlayback();
      
      // Also listen for metadata load as backup
      video.addEventListener('loadedmetadata', () => {
        console.log('📺 Metadata loaded event');
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          console.log('📺 No video dimensions yet, waiting...');
          setTimeout(() => setupVideoPlayback(), 200);
        }
      }, { once: true });
      
      // Debug state periodically
      const debugInterval = setInterval(() => {
        if (remoteVideoRef.current) {
          const state = {
            srcObject: !!remoteVideoRef.current.srcObject,
            videoWidth: remoteVideoRef.current.videoWidth,
            videoHeight: remoteVideoRef.current.videoHeight,
            readyState: remoteVideoRef.current.readyState,
            paused: remoteVideoRef.current.paused,
            muted: remoteVideoRef.current.muted,
            tracks: remoteStream.getTracks().map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              muted: t.muted,
              readyState: t.readyState
            }))
          };
          console.log('📺 Video debug state:', state);
          
          // Stop debugging after 10 seconds
          if (Date.now() - Date.now() > 10000) {
            clearInterval(debugInterval);
          }
        } else {
          clearInterval(debugInterval);
        }
      }, 2000);
      
      // Cleanup on unmount
      return () => {
        clearInterval(debugInterval);
      };
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

      // Add local stream to peer connection with proper transceivers
      console.log('➕ Adding local tracks to peer connection...');
      stream.getTracks().forEach(track => {
        console.log('🎵 Adding track:', track.kind, {
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          label: track.label
        });
        
        // Make sure track is enabled and not muted
        track.enabled = true;
        if (track.muted) {
          console.log('⚠️ Local track is muted on creation - this might cause issues!');
        }
        
        // Add track with explicit transceiver to ensure bidirectional communication
        const transceiver = pc.addTransceiver(track, {
          direction: 'sendrecv',
          streams: [stream]
        });
        
        console.log('📡 Added transceiver for', track.kind, {
          direction: transceiver.direction,
          mid: transceiver.mid
        });
      });

      // Verify transceiver directions before creating offer
      pc.getTransceivers().forEach((transceiver, index) => {
        console.log(`📡 Caller transceiver ${index}:`, {
          direction: transceiver.direction,
          mid: transceiver.mid,
          kind: transceiver.sender.track?.kind,
          currentDirection: transceiver.currentDirection
        });
        
        // Ensure sendrecv direction
        if (transceiver.direction !== 'sendrecv') {
          console.log(`📡 Fixing caller transceiver ${index} direction from ${transceiver.direction} to sendrecv`);
          transceiver.direction = 'sendrecv';
        }
      });

      // Create and send offer with explicit constraints
      console.log('📝 Creating offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('✅ Offer created and set as local description');
      console.log('📄 Full Offer SDP:', offer.sdp);
      console.log('📄 Offer SDP contains:', {
        hasVideo: offer.sdp?.includes('m=video'),
        hasAudio: offer.sdp?.includes('m=audio'),
        sendRecv: offer.sdp?.includes('sendrecv'),
        sendonly: offer.sdp?.includes('sendonly'),
        recvonly: offer.sdp?.includes('recvonly'),
        inactive: offer.sdp?.includes('inactive')
      });

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

      // Set remote description FIRST to get the offer transceivers
      const offer = (window as any).pendingOffer;
      console.log('📝 Setting remote description (offer) FIRST:', offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Now add our local tracks to the existing transceivers
      console.log('➕ Adding receiver tracks to existing transceivers...');
      const transceivers = pc.getTransceivers();
      
      for (const track of stream.getTracks()) {
        console.log('🎵 Processing receiver track:', track.kind, {
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          label: track.label
        });
        
        // Make sure track is enabled and not muted
        track.enabled = true;
        if (track.muted) {
          console.log('⚠️ Local receiver track is muted on creation!');
        }
        
        // Find matching transceiver for this track kind
        const transceiver = transceivers.find(t => 
          t.receiver.track?.kind === track.kind && !t.sender.track
        );
        
        if (transceiver) {
          console.log(`📡 Found matching transceiver for ${track.kind}`);
          console.log(`📡 Before replace - direction: ${transceiver.direction}, sender track: ${!!transceiver.sender.track}`);
          
          // Try replaceTrack first
          try {
            await transceiver.sender.replaceTrack(track);
            transceiver.direction = 'sendrecv';
            console.log(`📡 Successfully replaced track - direction: ${transceiver.direction}, sender track: ${!!transceiver.sender.track}`);
          } catch (error) {
            console.log(`📡 replaceTrack failed for ${track.kind}:`, error);
            console.log(`📡 Will create new transceiver instead`);
            
            // If replaceTrack fails, create a new transceiver
            const newTransceiver = pc.addTransceiver(track, {
              direction: 'sendrecv',
              streams: [stream]
            });
            console.log('📡 Added fallback transceiver for', track.kind, {
              direction: newTransceiver.direction,
              mid: newTransceiver.mid
            });
          }
        } else {
          console.log(`📡 No matching transceiver found for ${track.kind}, adding new one`);
          const newTransceiver = pc.addTransceiver(track, {
            direction: 'sendrecv',
            streams: [stream]
          });
          console.log('📡 Added new transceiver for', track.kind, {
            direction: newTransceiver.direction,
            mid: newTransceiver.mid
          });
        }
      }

      // Final verification of all transceivers
      console.log('📡 Final transceiver verification before answer:');
      pc.getTransceivers().forEach((transceiver, index) => {
        console.log(`📡 Transceiver ${index}:`, {
          direction: transceiver.direction,
          mid: transceiver.mid,
          kind: transceiver.receiver.track?.kind,
          currentDirection: transceiver.currentDirection,
          hasSenderTrack: !!transceiver.sender.track,
          hasReceiverTrack: !!transceiver.receiver.track
        });
        
        // Final enforcement of sendrecv
        if (transceiver.direction !== 'sendrecv') {
          console.log(`📡 FINAL FIX: Setting transceiver ${index} to sendrecv`);
          transceiver.direction = 'sendrecv';
        }
      });

      // Create and send answer
      console.log('📝 Creating answer...');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('✅ Answer created and set as local description');
      console.log('📄 Full Answer SDP:', answer.sdp);
      console.log('📄 Answer SDP contains:', {
        hasVideo: answer.sdp?.includes('m=video'),
        hasAudio: answer.sdp?.includes('m=audio'),
        sendRecv: answer.sdp?.includes('sendrecv'),
        sendonly: answer.sdp?.includes('sendonly'),
        recvonly: answer.sdp?.includes('recvonly'),
        inactive: answer.sdp?.includes('inactive')
      });

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