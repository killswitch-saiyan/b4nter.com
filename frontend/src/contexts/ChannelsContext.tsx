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
  
  // Debug: Track selected channel changes
  const setSelectedChannelWithLogging = (channel: Channel | null) => {
    console.log('📍 Selected channel changing from:', selectedChannel?.name, 'to:', channel?.name, 'isCall:', channel?.is_call_channel);
    console.trace('📍 Channel selection stack trace');
    setSelectedChannel(channel);
  };
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
      // --- Merge local call channels not present in backend response ---
      setChannels(prev => {
        // Find local call channels not in backend response
        const localCallChannels = prev.filter(
          ch => ch.is_call_channel && !activeChannels.some(bch => bch.id === ch.id)
        );
        const merged = [...activeChannels, ...localCallChannels];
        
        // CRITICAL FIX: Never change selectedChannel if it's a call channel
        // The fetchChannels refresh should NEVER override an active call
        if (selectedChannel?.is_call_channel) {
          console.log('📞 Preserving active call channel');
          // Don't change the selected channel at all during a call
        } else if (merged.length > 0 && !selectedChannel) {
          // Only set to first channel if no channel is selected and it's not a call
          setSelectedChannelWithLogging(merged[0]);
        }
        return merged;
      });
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

  // --- Sequential Video Channel Naming with Daily Reset ---
  function getTodayString() {
    const today = new Date();
    return today.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function getNextVideoChannelName() {
    const today = getTodayString();
    const key = 'videoChannelIndex';
    const dateKey = 'videoChannelDate';
    let index = 1;
    let lastDate = localStorage.getItem(dateKey);
    if (lastDate !== today) {
      localStorage.setItem(dateKey, today);
      localStorage.setItem(key, '1');
      return 'video-channel-1';
    }
    let lastIndex = parseInt(localStorage.getItem(key) || '1', 10);
    index = lastIndex + 1;
    localStorage.setItem(key, index.toString());
    return `video-channel-${index}`;
  }

  const createCallChannel = (callType: 'voice' | 'video', participants: string[]): Channel => {
    let channelName = '';
    if (callType === 'video') {
      channelName = getNextVideoChannelName();
    } else {
      channelName = `${callType === 'voice' ? 'voice-channel' : 'call'}-${Date.now()}`;
    }
    const callChannel: Channel = {
      id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: channelName, // Remove '#' here
      description: `${callType} call - waiting for others to join`,
      is_private: true,
      created_by: user?.id || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: participants.length, // Use actual participant count
      is_call_channel: true,
      call_type: callType,
      call_participants: participants, // Include all participants from the start
      call_started_at: new Date().toISOString(),
    };
    setChannels(prev => [...prev, callChannel]);
    setSelectedChannelWithLogging(callChannel);
    return callChannel;
  };
  // --- End Patch ---

  const createCallChannelForReceiver = (
    channelId: string,
    channelName: string,
    callType: 'voice' | 'video',
    participants: string[]
  ): Channel => {
    // Check if the channel already exists
    const existingChannel = channels.find(ch => ch.id === channelId);
    if (existingChannel) {
      // Always update the name to match the incoming channelName
      if (existingChannel.name !== channelName) {
        const updatedChannel = { ...existingChannel, name: channelName };
        setChannels(prev => prev.map(ch => ch.id === channelId ? updatedChannel : ch));
        return updatedChannel;
      }
      return existingChannel;
    }
    // Never use a fallback name, always use channelName
    const callChannel: Channel = {
      id: channelId,
      name: channelName,
      description: `${callType} call - click to join`,
      is_private: true,
      created_by: participants.find(p => p !== user?.id) || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member_count: participants.length, // Use actual participant count
      is_call_channel: true,
      call_type: callType,
      call_participants: participants, // Include all participants
      call_started_at: new Date().toISOString(),
    };
    setChannels(prev => [...prev, callChannel]);
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
        setSelectedChannelWithLogging(updatedChannels.length > 0 ? updatedChannels[0] : null);
      }
      
      return updatedChannels;
    });
    
  };

  const joinCallChannel = (channelId: string, userId: string) => {
    
    setChannels(prev => {
      const updatedChannels = prev.map(channel => {
        if (channel.id === channelId && channel.is_call_channel) {
          const participants = channel.call_participants || [];
          
          if (!participants.includes(userId)) {
            const updatedChannel = {
              ...channel,
              call_participants: [...participants, userId],
              member_count: participants.length + 1,
              updated_at: new Date().toISOString()
            };
            
            // Force immediate re-render by updating selected channel if it's the current one
            if (selectedChannel?.id === channelId) {
              setTimeout(() => {
                setSelectedChannelWithLogging(updatedChannel);
              }, 0);
            }
            
            return updatedChannel;
          }
        }
        return channel;
      });
      
      return updatedChannels;
    });
    
    // Force a re-render of the channels list
    // DISABLED: This was causing call channels to be overridden
    // setTimeout(() => {
    //   fetchChannels();
    // }, 200);
  };

  // --- Fix call channel removal and selection logic ---
  const leaveCallChannel = (channelId: string, userId: string) => {
    setChannels(prev => {
      const channel = prev.find(ch => ch.id === channelId && ch.is_call_channel);
      if (!channel) return prev;
      const participants = channel.call_participants || [];
      const updatedParticipants = participants.filter(id => id !== userId);
      // Only remove the channel if there are truly no participants left
      if (updatedParticipants.length === 0) {
        // If the removed channel was selected, select the first available channel
        setTimeout(() => {
          const remainingChannels = prev.filter(ch => ch.id !== channelId);
          setSelectedChannelWithLogging(remainingChannels.length > 0 ? remainingChannels[0] : null);
        }, 0);
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
  // --- End patch ---

  useEffect(() => {
    if (user) {
      fetchChannels();
    } else {
      setChannels([]);
      setSelectedChannelWithLogging(null);
    }
  }, [user]);

  const value: ChannelsContextType = {
    channels,
    loading,
    selectedChannel,
    setSelectedChannel: setSelectedChannelWithLogging,
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