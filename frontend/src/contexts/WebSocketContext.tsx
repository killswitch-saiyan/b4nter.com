import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

interface WebSocketContextType {
  isConnected: boolean;
  sendMessage: (content: string, channelId?: string, recipientId?: string) => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  startTyping: (channelId?: string, recipientId?: string) => void;
  stopTyping: (channelId?: string, recipientId?: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        console.log('Disconnecting WebSocket - no user');
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    console.log('Initializing WebSocket connection for user:', user.id);

    // Initialize WebSocket connection
    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${user.id}`);

    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected successfully');
      setIsConnected(true);
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);
        
        // Handle different message types
        switch (data.type) {
          case 'connection_established':
            console.log('Connection established for user:', data.user_id);
            break;
          case 'new_channel_message':
            console.log('New channel message:', data.message);
            // You can emit a custom event here if needed
            break;
          case 'new_direct_message':
            console.log('New direct message:', data.message);
            break;
          case 'channel_joined':
            console.log('Joined channel:', data.channel_id);
            break;
          case 'channel_left':
            console.log('Left channel:', data.channel_id);
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    // Cleanup function
    return () => {
      console.log('Cleaning up WebSocket connection');
      if (ws) {
        ws.close();
        wsRef.current = null;
        setIsConnected(false);
      }
    };
  }, [user]);

  const sendWebSocketMessage = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  };

  const sendMessage = (content: string, channelId?: string, recipientId?: string) => {
    console.log('sendMessage called with:', { content, channelId, recipientId });
    
    if (wsRef.current && user) {
      const messageData = {
        type: 'send_message',
        content,
        channel_id: channelId,
        recipient_id: recipientId,
      };
      console.log('Sending message via WebSocket:', messageData);
      sendWebSocketMessage(messageData);
    } else {
      console.error('Cannot send message: WebSocket not connected or user not available');
    }
  };

  const joinChannel = (channelId: string) => {
    if (wsRef.current && user) {
      const joinData = {
        type: 'join_channel',
        channel_id: channelId,
      };
      console.log('Joining channel via WebSocket:', joinData);
      sendWebSocketMessage(joinData);
    } else {
      console.error('Cannot join channel: WebSocket not connected or user not available');
    }
  };

  const leaveChannel = (channelId: string) => {
    if (wsRef.current && user) {
      const leaveData = {
        type: 'leave_channel',
        channel_id: channelId,
      };
      console.log('Leaving channel via WebSocket:', leaveData);
      sendWebSocketMessage(leaveData);
    } else {
      console.error('Cannot leave channel: WebSocket not connected or user not available');
    }
  };

  const startTyping = (channelId?: string, recipientId?: string) => {
    if (wsRef.current && user) {
      sendWebSocketMessage({
        type: 'typing_start',
        channel_id: channelId,
        recipient_id: recipientId,
      });
    }
  };

  const stopTyping = (channelId?: string, recipientId?: string) => {
    if (wsRef.current && user) {
      sendWebSocketMessage({
        type: 'typing_stop',
        channel_id: channelId,
        recipient_id: recipientId,
      });
    }
  };

  const value: WebSocketContextType = {
    isConnected,
    sendMessage,
    joinChannel,
    leaveChannel,
    startTyping,
    stopTyping,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}; 