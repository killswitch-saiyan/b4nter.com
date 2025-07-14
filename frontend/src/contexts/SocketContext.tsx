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
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Initialize socket connection
    const socket = io('http://localhost:8000', {
      auth: {
        user_id: user.id,
      },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to Socket.IO server');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from Socket.IO server');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [user]);

  const sendMessage = (content: string, channelId?: string, recipientId?: string) => {
    if (socketRef.current && user) {
      socketRef.current.emit('send_message', {
        content,
        sender_id: user.id,
        channel_id: channelId,
        recipient_id: recipientId,
      });
    }
  };

  const joinChannel = (channelId: string) => {
    if (socketRef.current && user) {
      socketRef.current.emit('join_channel', {
        channel_id: channelId,
        user_id: user.id,
      });
    }
  };

  const leaveChannel = (channelId: string) => {
    if (socketRef.current && user) {
      socketRef.current.emit('leave_channel', {
        channel_id: channelId,
        user_id: user.id,
      });
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