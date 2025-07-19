import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { Channel } from '../types';
import { toast } from 'react-hot-toast';

interface ChannelsContextType {
  channels: Channel[];
  loading: boolean;
  selectedChannel: Channel | null;
  setSelectedChannel: (channel: Channel | null) => void;
  refreshChannels: () => Promise<void>;
  createCallChannel: (callType: 'voice' | 'video', participants: string[]) => Channel;
  createCallChannelForReceiver: (channelId: string, channelName: string, callType: 'voice' | 'video', participants: string[]) => Channel;
  removeCallChannel: (channelId: string) => void;
  joinCallChannel: (channelId: string, userId: string) => void;
  leaveCallChannel: (channelId: string, userId: string) => void;
  callDuration: number;
  setCallDuration: (duration: number) => void;
  activeCallChannelId: string | null;
  setActiveCallChannelId: (channelId: string | null) => void;
}

const ChannelsContext = createContext<ChannelsContextType | undefined>(undefined);

export const useChannels = () => {
  const context = useContext(ChannelsContext);
  if (context === undefined) {
    throw new Error('useChannels must be used within a ChannelsProvider');
  }
  return context;
};

interface ChannelsProviderProps {
  children: React.ReactNode;
}

export const ChannelsProvider: React.FC<ChannelsProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [activeCallChannelId, setActiveCallChannelId] = useState<string | null>(null);

  // Get backend URL from environment variable or default to localhost
  const getBackendUrl = () => {
    return import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
  };

  const fetchChannels = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/channels/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const channelsData = await response.json();
      console.log('Fetched channels:', channelsData);
      
      // Filter out call channels that have ended
      const activeChannels = channelsData.filter((channel: Channel) => 
        !channel.is_call_channel || !channel.call_ended_at
      );
      
      setChannels(activeChannels);

      // Set the first channel as selected if none is selected
      if (activeChannels.length > 0 && !selectedChannel) {
        setSelectedChannel(activeChannels[0]);
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const refreshChannels = async () => {
    await fetchChannels();
  };

  const createCallChannel = (callType: 'voice' | 'video', participants: string[]): Channel => {
    const callChannel: Channel = {
      id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${callType === 'voice' ? '🔊' : '📹'} ${callType.charAt(0).toUpperCase() + callType.slice(1)} Call`,
      description: `${callType} call - waiting for others to join`,
      is_private: true,
      created_by: user?.id || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 1, // Only the caller initially
      is_call_channel: true,
      call_type: callType,
      call_participants: [user?.id || ''], // Only the caller initially
      call_started_at: new Date().toISOString(),
    };

    setChannels(prev => [...prev, callChannel]);
    setSelectedChannel(callChannel);
    
    console.log(`Created ${callType} call channel:`, callChannel);
    return callChannel;
  };

  const createCallChannelForReceiver = (channelId: string, channelName: string, callType: 'voice' | 'video', participants: string[]): Channel => {
    const callChannel: Channel = {
      id: channelId,
      name: channelName,
      description: `${callType} call - click to join`,
      is_private: true,
      created_by: participants.find(p => p !== user?.id) || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: 1, // Only the caller initially
      is_call_channel: true,
      call_type: callType,
      call_participants: [participants.find(p => p !== user?.id) || ''], // Only the caller initially
      call_started_at: new Date().toISOString(),
    };

    setChannels(prev => [...prev, callChannel]);
    
    console.log(`Created ${callType} call channel for receiver:`, callChannel);
    return callChannel;
  };

  // Function to get username for a user ID
  const getUsername = async (userId: string): Promise<string> => {
    try {
      const token = localStorage.getItem('access_token');
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const userData = await response.json();
        return userData.username || userData.full_name || 'Unknown User';
      }
    } catch (error) {
      console.error('Error fetching username:', error);
    }
    return 'Unknown User';
  };

  const removeCallChannel = (channelId: string) => {
    setChannels(prev => {
      const updatedChannels = prev.filter(channel => channel.id !== channelId);
      
      // If the removed channel was selected, select the first available channel
      if (selectedChannel?.id === channelId) {
        setSelectedChannel(updatedChannels.length > 0 ? updatedChannels[0] : null);
      }
      
      return updatedChannels;
    });
    
    console.log(`Removed call channel: ${channelId}`);
  };

  const joinCallChannel = (channelId: string, userId: string) => {
    setChannels(prev => prev.map(channel => {
      if (channel.id === channelId && channel.is_call_channel) {
        const participants = channel.call_participants || [];
        if (!participants.includes(userId)) {
          return {
            ...channel,
            call_participants: [...participants, userId],
            member_count: participants.length + 1,
            updated_at: new Date().toISOString()
          };
        }
      }
      return channel;
    }));
  };

  const leaveCallChannel = (channelId: string, userId: string) => {
    setChannels(prev => {
      const channel = prev.find(ch => ch.id === channelId && ch.is_call_channel);
      if (!channel) return prev;
      
      const participants = channel.call_participants || [];
      const updatedParticipants = participants.filter(id => id !== userId);
      
      // If no participants left, remove the channel entirely
      if (updatedParticipants.length === 0) {
        console.log(`Removing call channel ${channelId} - no participants left`);
        
        // If the removed channel was selected, select the first available channel
        if (selectedChannel?.id === channelId) {
          const remainingChannels = prev.filter(ch => ch.id !== channelId);
          setSelectedChannel(remainingChannels.length > 0 ? remainingChannels[0] : null);
        }
        
        return prev.filter(ch => ch.id !== channelId);
      }
      
      // Otherwise, update the participants list
      return prev.map(ch => {
        if (ch.id === channelId && ch.is_call_channel) {
          return {
            ...ch,
            call_participants: updatedParticipants,
            member_count: updatedParticipants.length,
            updated_at: new Date().toISOString()
          };
        }
        return ch;
      });
    });
  };

  useEffect(() => {
    if (user) {
      fetchChannels();
    } else {
      setChannels([]);
      setSelectedChannel(null);
    }
  }, [user]);

  const value: ChannelsContextType = {
    channels,
    loading,
    selectedChannel,
    setSelectedChannel,
    refreshChannels,
    createCallChannel,
    createCallChannelForReceiver,
    removeCallChannel,
    joinCallChannel,
    leaveCallChannel,
    callDuration,
    setCallDuration,
    activeCallChannelId,
    setActiveCallChannelId,
  };

  return (
    <ChannelsContext.Provider value={value}>
      {children}
    </ChannelsContext.Provider>
  );
}; 