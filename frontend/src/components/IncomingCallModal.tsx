import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { toast } from 'react-hot-toast';

interface IncomingCallData {
  caller_id: string;
  caller_name: string;
  room_id: string;
  type: string;
}

interface IncomingCallModalProps {
  callData: IncomingCallData | null;
  onAccept: (roomId: string) => void;
  onReject: () => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ 
  callData, 
  onAccept, 
  onReject 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const { sendCustomEvent } = useWebSocket();

  useEffect(() => {
    if (callData) {
      setIsVisible(true);
      // Auto-reject after 30 seconds
      const timeout = setTimeout(() => {
        if (isVisible) {
          // Stop ringtone on timeout
          if ((window as any).videoCallRingtone) {
            (window as any).videoCallRingtone.pause();
            (window as any).videoCallRingtone.currentTime = 0;
            (window as any).videoCallRingtone = null;
          }
          handleReject();
        }
      }, 30000);

      return () => clearTimeout(timeout);
    }
  }, [callData]);

  const handleAccept = () => {
    if (!callData) return;
    
    // Stop ringtone immediately
    if ((window as any).videoCallRingtone) {
      (window as any).videoCallRingtone.pause();
      (window as any).videoCallRingtone.currentTime = 0;
      (window as any).videoCallRingtone = null;
    }
    
    // Send acceptance via WebSocket
    sendCustomEvent({
      type: 'video_call_accept',
      caller_id: callData.caller_id,
      room_id: callData.room_id
    });

    onAccept(callData.room_id);
    setIsVisible(false);
  };

  const handleReject = () => {
    if (!callData) return;
    
    // Stop ringtone
    if ((window as any).videoCallRingtone) {
      (window as any).videoCallRingtone.pause();
      (window as any).videoCallRingtone.currentTime = 0;
      (window as any).videoCallRingtone = null;
    }
    
    // Send rejection via WebSocket
    sendCustomEvent({
      type: 'video_call_reject',
      caller_id: callData.caller_id,
      room_id: callData.room_id
    });

    onReject();
    setIsVisible(false);
  };

  if (!callData || !isVisible) return null;

  return (
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
            {callData.caller_name} is calling you
          </p>
          <div className="mt-2 text-sm text-gray-500">
            Ring ring... 📞
          </div>
        </div>
        
        <div className="flex justify-center space-x-4">
          <button
            onClick={handleReject}
            className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-colors"
          >
            <span>📞</span>
            <span>Decline</span>
          </button>
          <button
            onClick={handleAccept}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-colors"
          >
            <span>📹</span>
            <span>Accept</span>
          </button>
        </div>
        
        <div className="mt-4 text-xs text-gray-400">
          Call will auto-decline in 30 seconds
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;