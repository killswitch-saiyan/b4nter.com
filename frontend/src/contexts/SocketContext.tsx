import React, { createContext, useContext, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { Message } from '../types';
import { useState } from 'react';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  sendMessage: (content: string, channelId?: string, recipientId?: string) => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  startTyping: (channelId?: string, recipientId?: string) => void;
  stopTyping: (channelId?: string, recipientId?: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        console.log('Disconnecting socket - no user');
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    console.log('Initializing socket connection for user:', user.id);

    // Initialize socket connection
    const socket = io('http://127.0.0.1:8000', {
      auth: {
        user_id: user.id,
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected successfully');
      console.log('Socket ID:', socket.id);
      console.log('Socket connected:', socket.connected);
      setIsConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      setIsConnected(false);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Cleanup function
    return () => {
      console.log('Cleaning up socket connection');
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [user]);

  const sendMessage = (content: string, channelId?: string, recipientId?: string) => {
    console.log('sendMessage called with:', { content, channelId, recipientId });
    console.log('socketRef.current:', socketRef.current);
    console.log('user:', user);
    console.log('isConnected:', isConnected);
    
    if (socketRef.current && user) {
      const messageData = {
        content,
        sender_id: user.id,
        channel_id: channelId,
        recipient_id: recipientId,
      };
      console.log('Sending message via context:', messageData);
      socketRef.current.emit('send_message', messageData);
    } else {
      console.error('Cannot send message: socket not connected or user not available');
      console.error('socketRef.current:', socketRef.current);
      console.error('user:', user);
    }
  };

  const joinChannel = (channelId: string) => {
    if (socketRef.current && user) {
      const joinData = {
        channel_id: channelId,
        user_id: user.id,
      };
      console.log('Joining channel via context:', joinData);
      socketRef.current.emit('join_channel', joinData);
    } else {
      console.error('Cannot join channel: socket not connected or user not available');
    }
  };

  const leaveChannel = (channelId: string) => {
    if (socketRef.current && user) {
      const leaveData = {
        channel_id: channelId,
        user_id: user.id,
      };
      console.log('Leaving channel via context:', leaveData);
      socketRef.current.emit('leave_channel', leaveData);
    } else {
      console.error('Cannot leave channel: socket not connected or user not available');
    }
  };

  const startTyping = (channelId?: string, recipientId?: string) => {
    if (socketRef.current && user) {
      socketRef.current.emit('typing_start', {
        user_id: user.id,
        channel_id: channelId,
        recipient_id: recipientId,
      });
    }
  };

  const stopTyping = (channelId?: string, recipientId?: string) => {
    if (socketRef.current && user) {
      socketRef.current.emit('typing_stop', {
        user_id: user.id,
        channel_id: channelId,
        recipient_id: recipientId,
      });
    }
  };

  const value: SocketContextType = {
    socket: socketRef.current,
    isConnected,
    sendMessage,
    joinChannel,
    leaveChannel,
    startTyping,
    stopTyping,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}; 