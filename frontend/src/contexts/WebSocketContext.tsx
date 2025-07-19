import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { processReceivedMessage } from '../services/e2eeService';

interface NotificationType {
  id: string;
  message: string;
  type?: string;
  [key: string]: any;
}

interface WebSocketContextType {
  isConnected: boolean;
  sendMessage: (content: string, channelId?: string, recipientId?: string, imageUrl?: string) => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  startTyping: (channelId?: string, recipientId?: string) => void;
  stopTyping: (channelId?: string, recipientId?: string) => void;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  sendCustomEvent: (event: any) => void;
  typingUsers: { [key: string]: boolean };
  userStatus: { [userId: string]: 'online' | 'offline' };
  notifications: NotificationType[];
  clearNotifications: () => void;
  connectedUsers: string[];
  socket: WebSocket | null;
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
  const [messages, setMessages] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<{ [key: string]: boolean }>({});
  const [userStatus, setUserStatus] = useState<{ [userId: string]: 'online' | 'offline' }>({});
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);

  // Get backend URL from environment variable or default to localhost
  const getBackendUrl = () => {
    const backendUrl = (import.meta as any).env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
    // Convert HTTP URL to WebSocket URL
    return backendUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  };

  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        console.log('Disconnecting WebSocket - no user');
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      // Don't clear messages when user logs out - keep them for when they log back in
      return;
    }

    console.log('Initializing WebSocket connection for user:', user.id);

    // Initialize WebSocket connection
    const backendUrl = getBackendUrl();
    const wsUrl = `${backendUrl}/ws/${user.id}`;
    console.log('Connecting to WebSocket URL:', wsUrl);
    
    const ws = new WebSocket(wsUrl);

    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected successfully');
      setIsConnected(true);
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      console.log('Close event details:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        type: event.type
      });
      setIsConnected(false);
      
      // Don't automatically reconnect if the connection was closed cleanly
      // or if there's no user (user logged out)
      if (event.code !== 1000 && user) {
        console.log('Attempting to reconnect in 3 seconds...');
        setTimeout(() => {
          if (user && !wsRef.current) {
            console.log('Reconnecting WebSocket...');
            // This will trigger the useEffect again
          }
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      console.error('WebSocket readyState:', ws.readyState);
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
            // Send a ping to keep the connection alive
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
              }
            }, 15000); // Send ping every 15 seconds instead of 30
            break;
          case 'new_channel_message':
            console.log('New channel message:', data.message);
            // Add sender information to the message
            const channelMessage = {
              ...data.message,
              sender: {
                username: user?.username || 'Unknown',
                full_name: user?.full_name || user?.username || 'Unknown',
                avatar_url: user?.avatar_url
              }
            };
            setMessages((prev) => [...prev, channelMessage]);
            break;
          case 'new_direct_message':
            console.log('New direct message:', data.message);
            // Process the message for E2EE decryption
            const processedMessage = processReceivedMessage(data.message, user?.id || '');
            // Add sender information to the message
            const directMessage = {
              ...processedMessage,
              sender: {
                username: user?.username || 'Unknown',
                full_name: user?.full_name || user?.username || 'Unknown',
                avatar_url: user?.avatar_url
              }
            };
            setMessages((prev) => [...prev, directMessage]);
            break;
          case 'channel_joined':
            console.log('Joined channel:', data.channel_id);
            break;
          case 'channel_left':
            console.log('Left channel:', data.channel_id);
            break;
          case 'user_typing': {
            // For channels: key is channel_id, for DMs: key is recipient_id
            const key = data.channel_id || data.recipient_id;
            setTypingUsers((prev) => ({ ...prev, [key]: true }));
            break;
          }
          case 'user_stopped_typing': {
            const key = data.channel_id || data.recipient_id;
            setTypingUsers((prev) => {
              const updated = { ...prev };
              delete updated[key];
              return updated;
            });
            break;
          }
          case 'user_status': {
            setUserStatus((prev) => ({ ...prev, [data.user_id]: data.status }));
            setConnectedUsers((prev) => {
              if (data.status === 'online' && !prev.includes(data.user_id)) {
                return [...prev, data.user_id];
              } else if (data.status === 'offline') {
                return prev.filter((id) => id !== data.user_id);
              }
              return prev;
            });
            break;
          }
          case 'notification': {
            setNotifications((prev) => [
              ...prev,
              { id: data.id || Date.now().toString(), ...data }
            ]);
            break;
          }
          case 'pong':
            console.log('Received pong from server');
            break;
          // Call-related messages are handled by CallControls component
          case 'call_incoming':
          case 'call_accepted':
          case 'call_rejected':
          case 'call_ended':
          case 'webrtc_offer':
          case 'webrtc_answer':
          case 'webrtc_ice_candidate':
            // These messages are handled by the CallControls component
            // We don't need to do anything here as CallControls listens to the socket directly
            console.log('Call-related message received:', data.type);
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
        ws.close(1000, 'Component unmounting');
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

  const sendMessage = (content: string, channelId?: string, recipientId?: string, imageUrl?: string) => {
    console.log('sendMessage called with:', { content, channelId, recipientId, imageUrl });
    
    if (wsRef.current && user) {
      const messageData: any = {
        type: 'send_message',
        content,
        channel_id: channelId,
        recipient_id: recipientId,
      };
      if (imageUrl) messageData.image_url = imageUrl;
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

  const sendCustomEvent = (event: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    } else {
      console.error('WebSocket is not connected');
    }
  };

  const clearNotifications = () => setNotifications([]);

  const value: WebSocketContextType = {
    isConnected,
    sendMessage,
    joinChannel,
    leaveChannel,
    startTyping,
    stopTyping,
    messages,
    setMessages,
    sendCustomEvent,
    typingUsers,
    userStatus,
    notifications,
    clearNotifications,
    connectedUsers,
    socket: wsRef.current,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}; 