import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import VideoChat from './VideoChat';
import { toast } from 'react-hot-toast';
import { sendCallInvite, subscribeToCallEvents, checkForCallInvite, respondToCallInvite } from '../utils/supabase';

interface VideoCallButtonProps {
  targetUserId: string;
  targetUsername: string;
}

const VideoCallButton: React.FC<VideoCallButtonProps> = ({ 
  targetUserId, 
  targetUsername 
}) => {
  const { user } = useAuth();
  const [isInCall, setIsInCall] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState<any>(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [subscriptionRef, setSubscriptionRef] = useState<any>(null);

  const startVideoCall = async () => {
    console.log('🚀 Starting video call...', { user: user?.username, target: targetUsername });
    
    if (!user) {
      toast.error('Please log in to start a video call');
      return;
    }

    if (!targetUserId || !targetUsername) {
      toast.error('Invalid user for video call');
      return;
    }

    try {
      // Generate room ID for this call
      const roomId = [user.id, targetUserId].sort().join('-video-call');
      console.log('📞 Generated room ID:', roomId);

      // Send call invitation via Supabase
      await sendCallInvite(roomId, user.username, targetUserId);
      console.log('📤 Call invitation sent');

      // Show calling state and video chat immediately
      toast.success(`Calling ${targetUsername}...`);
      setIsInCall(true);
      setCallAccepted(false); // Make sure this is false initially
      console.log('📺 Video chat should now be visible');

      // Listen for response
      const subscription = subscribeToCallEvents(roomId, (type, data) => {
        console.log('📨 Received call event:', type, data);
        if (type === 'call_response') {
          if (data.accepted) {
            toast.success(`${targetUsername} accepted your call!`);
            setCallAccepted(true);
            console.log('✅ Call accepted');
          } else {
            toast.error(`${targetUsername} declined your call`);
            setIsInCall(false);
            console.log('❌ Call declined');
          }
        }
      });
      setSubscriptionRef(subscription);
    } catch (error) {
      console.error('Failed to start call:', error);
      toast.error('Failed to start call');
      setIsInCall(false);
    }
  };

  const endVideoCall = () => {
    // Clean up subscription
    if (subscriptionRef) {
      subscriptionRef.unsubscribe();
      setSubscriptionRef(null);
    }
    setIsInCall(false);
    setCallAccepted(false);
    setIncomingCallData(null);
  };

  const handleAcceptCall = async () => {
    if (!user || !incomingCallData) return;
    
    try {
      const roomId = [user.id, targetUserId].sort().join('-video-call');
      await respondToCallInvite(roomId, true, user.username);
      
      setCallAccepted(true);
      setIncomingCallData(null);
      setIsInCall(true);
    } catch (error) {
      console.error('Failed to accept call:', error);
      toast.error('Failed to accept call');
    }
  };

  const handleRejectCall = async () => {
    if (!user || !incomingCallData) return;
    
    try {
      const roomId = [user.id, targetUserId].sort().join('-video-call');
      await respondToCallInvite(roomId, false, user.username);
      
      setIncomingCallData(null);
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  };

  // Check for incoming calls and set up subscription
  useEffect(() => {
    if (!user) return;
    
    const roomId = [user.id, targetUserId].sort().join('-video-call');
    
    // Check for existing call invite
    const checkIncomingCall = async () => {
      try {
        const callInvite = await checkForCallInvite(roomId);
        if (callInvite && callInvite.target_user_id === user.id) {
          setIncomingCallData({
            caller_name: callInvite.caller_name,
            room_id: roomId
          });
          
          // Play ringtone
          try {
            const audio = new Audio('/ringtone.mp3');
            audio.loop = true;
            audio.volume = 0.7;
            audio.play().catch(e => console.warn('Could not play ringtone:', e));
            (window as any).videoCallRingtone = audio;
          } catch (error) {
            console.warn('Could not play ringtone:', error);
          }
        }
      } catch (error) {
        console.error('Failed to check for incoming call:', error);
      }
    };
    
    checkIncomingCall();
    
    // Set up subscription for new call invites
    const subscription = subscribeToCallEvents(roomId, (type, data) => {
      if (type === 'call_invite' && data.target_user_id === user.id) {
        setIncomingCallData({
          caller_name: data.caller_name,
          room_id: roomId
        });
        
        // Play ringtone
        try {
          const audio = new Audio('/ringtone.mp3');
          audio.loop = true;
          audio.volume = 0.7;
          audio.play().catch(e => console.warn('Could not play ringtone:', e));
          (window as any).videoCallRingtone = audio;
        } catch (error) {
          console.warn('Could not play ringtone:', error);
        }
      }
    });
    
    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [user?.id, targetUserId]);
  
  // Stop ringtone when call state changes
  useEffect(() => {
    if (!incomingCallData && (window as any).videoCallRingtone) {
      (window as any).videoCallRingtone.pause();
      (window as any).videoCallRingtone.currentTime = 0;
      (window as any).videoCallRingtone = null;
    }
  }, [incomingCallData]);

  return (
    <>
      <button
        onClick={startVideoCall}
        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title={`Video call with ${targetUsername}`}
      >
        <svg 
          className="w-5 h-5" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" 
          />
        </svg>
      </button>

      {/* Incoming call modal */}
      {incomingCallData && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 text-center animate-pulse">
            <div className="mb-4">
              <div className="w-20 h-20 bg-gradient-to-r from-green-400 to-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl">
                📹
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Incoming Video Call
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                {incomingCallData.caller_name} is calling you
              </p>
              <div className="mt-2 text-sm text-gray-500">
                Ring ring... 📞
              </div>
            </div>
            
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleRejectCall}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-colors"
              >
                <span>📞</span>
                <span>Decline</span>
              </button>
              <button
                onClick={handleAcceptCall}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-colors"
              >
                <span>📹</span>
                <span>Accept</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video chat component */}
      {(() => {
        console.log('🔍 VideoChat render check:', { 
          isInCall, 
          incomingCallData: !!incomingCallData,
          isInitiator: !incomingCallData,
          shouldRender: isInCall 
        });
        return isInCall && (
          <VideoChat
            targetUserId={targetUserId}
            targetUsername={targetUsername}
            isInitiator={!incomingCallData}
            onClose={endVideoCall}
          />
        );
      })()}
    </>
  );
};

export default VideoCallButton;