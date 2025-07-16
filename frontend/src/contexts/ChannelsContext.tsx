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
      setChannels(channelsData);

      // Set the first channel as selected if none is selected
      if (channelsData.length > 0 && !selectedChannel) {
        setSelectedChannel(channelsData[0]);
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
  };

  return (
    <ChannelsContext.Provider value={value}>
      {children}
    </ChannelsContext.Provider>
  );
}; 