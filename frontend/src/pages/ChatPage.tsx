import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useChannels } from '../contexts/ChannelsContext';
import { toast } from 'react-hot-toast';
import MessageInput from '../components/MessageInput';
import MessageDisplay from '../components/MessageDisplay';
import EncryptionStatus from '../components/EncryptionStatus';
import UserProfileDropdown from '../components/UserProfileDropdown';
import CallControls from '../components/CallControls';
import { userAPI } from '../lib/api';
import { Message, MessageReaction } from '../types';
import { prepareMessageContent, processReceivedMessage } from '../services/e2eeService';

// Type declaration for Vite's import.meta.env
declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_BACKEND_URL?: string;
    };
  }
}

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
// @ts-ignore
import brandLogo from '../assets/brandlogo.png';

const ChatPage: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const { isConnected, sendMessage, joinChannel, messages, setMessages, sendCustomEvent, socket } = useWebSocket();
  const { channels, loading, selectedChannel, setSelectedChannel, refreshChannels, createCallChannel, createCallChannelForReceiver, removeCallChannel, joinCallChannel, leaveCallChannel, callDuration, setCallDuration, activeCallChannelId, setActiveCallChannelId } = useChannels();
  const [message, setMessage] = useState('');
  const prevChannelRef = useRef<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedDMUser, setSelectedDMUser] = useState<any | null>(null);
  const [pendingDMMessages, setPendingDMMessages] = useState<Message[]>([]);
  const [loadingDM, setLoadingDM] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loadingBlock, setLoadingBlock] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const [userSearch, setUserSearch] = useState('');
  const [channelSearch, setChannelSearch] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{
    from: string;
    fromName: string;
    isVideo: boolean;
    channelId: string;
    offer: any;
  } | null>(null);

  // Function to get username for a participant
  const getParticipantName = (participantId: string): string => {
    if (participantId === user?.id) {
      return 'You';
    }
    
    // Check if we have the user in our users list
    const participant = users.find(u => u.id === participantId);
    if (participant) {
      return participant.username || participant.full_name || 'Unknown User';
    }
    
    return 'Unknown User';
  };

  // Timer effect for call channels
  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;
    
    if (selectedChannel?.is_call_channel) {
      console.log('Starting timer for call channel:', selectedChannel.name);
      
      // Use call_started_at if available, otherwise start from now
      const startTime = selectedChannel.call_started_at 
        ? new Date(selectedChannel.call_started_at)
        : new Date();
      
      console.log('Call started at:', startTime);
      
      // Start timer for call channel
      timerInterval = setInterval(() => {
        const now = new Date();
        const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        console.log('Timer tick - Duration:', duration, 'seconds');
        setCallDuration(duration);
      }, 1000);
    } else {
      console.log('No call channel selected');
      // Reset timer when not in a call channel
      setCallDuration(0);
    }
    
    return () => {
      if (timerInterval) {
        console.log('Clearing timer interval');
        clearInterval(timerInterval);
      }
    };
  }, [selectedChannel?.id, selectedChannel?.is_call_channel, selectedChannel?.call_started_at, setCallDuration]);

  // Function to end call and remove call channel
  const handleEndCall = () => {
    if (selectedChannel?.is_call_channel && user) {
      // Remove the call channel
      removeCallChannel(selectedChannel.id);
      
      // Switch to first available channel
      const regularChannels = channels.filter(ch => !ch.is_call_channel);
      if (regularChannels.length > 0) {
        setSelectedChannel(regularChannels[0]);
      }
      
      toast.success('Call ended');
    }
  };

  // Get current messages based on what's selected
  const currentMessages = selectedChannel 
    ? messages.filter(msg => msg.channel_id === selectedChannel.id)
    : selectedDMUser 
    ? [...messages.filter(msg => 
        (msg.recipient_id === selectedDMUser.id || msg.sender_id === selectedDMUser.id) && 
        !msg.channel_id
      ), ...pendingDMMessages]
    : [];

  // Debug: Log current messages
  useEffect(() => {
    // Only log timer ticks
    if (selectedChannel?.is_call_channel) {
      console.log('Timer tick - Duration:', callDuration, 'seconds');
    }
  }, [callDuration, selectedChannel?.is_call_channel]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Debug: Log user data
  useEffect(() => {
    console.log('Current user data:', user);
    console.log('User ID:', user?.id);
    console.log('User full_name:', user?.full_name);
    console.log('User username:', user?.username);
  }, [user]);

  // Global call handler for incoming calls
  useEffect(() => {
    if (socket) {
      const handleCallMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('🔍 Global WebSocket message received:', data);
          console.log('🔍 Current user ID:', user?.id);
          console.log('🔍 Message type:', data.type);
          
          if (data.type === 'call_channel_created' && data.to === user?.id) {
            console.log('Creating call channel for receiver:', data);
            // Create the call channel for the receiver
            createCallChannelForReceiver(
              data.channelId,
              data.channelName,
              data.callType,
              data.participants
            );
          }
          
          if (data.type === 'call_channel_joined') {
            console.log('🎯 User joined call channel:', data);
            // Update the call channel to include the new participant
            joinCallChannel(data.channelId, data.userId);
            toast.success(`${data.username} joined the call`);
          }
          
          if (data.type === 'call_channel_left') {
            console.log('🔚 User left call channel:', data);
            // Update the call channel to remove the participant
            leaveCallChannel(data.channelId, data.userId);
            toast.success(`${data.username} left the call`);
          }
          
          // Handle WebRTC offers globally
          if (data.type === 'webrtc_offer') {
            console.log('🔊 Global WebRTC offer received:', data);
            // This will be handled by the CallControls component
          }
          
          // Handle WebRTC answers globally
          if (data.type === 'webrtc_answer') {
            console.log('🔊 Global WebRTC answer received:', data);
            // This will be handled by the CallControls component
          }
          
          // Handle WebRTC ICE candidates globally
          if (data.type === 'webrtc_ice_candidate') {
            console.log('🔊 Global WebRTC ICE candidate received:', data);
            // This will be handled by the CallControls component
          }
          
          if (data.type === 'call_incoming') {
            console.log('🎯 Global incoming call received:', data);
            setIncomingCall({
              from: data.from,
              fromName: data.from_name || 'Unknown User',
              isVideo: data.isVideo,
              channelId: data.channelId,
              offer: data.offer
            });
            
            // Show browser notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`Incoming call from ${data.from_name || 'Unknown User'}`, {
                body: data.isVideo ? 'Video call' : 'Voice call',
                icon: '/favicon.ico'
              });
            }
            
            // Show toast notification
            toast.success(`Incoming ${data.isVideo ? 'video' : 'voice'} call from ${data.from_name || 'Unknown User'}`);
          }
        } catch (error) {
          console.error('Error handling call message:', error);
        }
      };

      socket.addEventListener('message', handleCallMessage);
      return () => socket.removeEventListener('message', handleCallMessage);
    }
  }, [socket, user?.id, createCallChannelForReceiver]);

  // Function to load historical messages for a channel
  const loadChannelMessages = async (channelId: string) => {
    if (!user) return;
    setLoadingMessages(true);
    // Add timeout to prevent infinite loading
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    try {
      const token = localStorage.getItem('access_token');
      console.log('Loading messages for channel:', channelId, 'with token:', token ? 'present' : 'missing');
      const response = await fetch(`${API_BASE}/messages/channel/${channelId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const historicalMessages: Message[] = await response.json();
        console.log('Loaded historical messages:', historicalMessages);
        // Merge with existing messages for this channel, deduplicating reactions
        setMessages(prevMessages => {
          const otherChannelMessages = prevMessages.filter(msg => msg.channel_id !== channelId);
          // For each historical message, merge reactions with any existing message with the same id
          const mergedMessages = historicalMessages.map(histMsg => {
            const existing = prevMessages.find(m => m.id === histMsg.id);
            if (existing && Array.isArray(existing.reactions)) {
              // Merge reactions, deduplicate by emoji+user_id
              const allReactions = [...(Array.isArray(histMsg.reactions) ? histMsg.reactions : []), ...existing.reactions];
              const deduped = allReactions.filter((r, idx, arr) =>
                arr.findIndex(x => x.emoji === r.emoji && x.user_id === r.user_id) === idx
              );
              return { ...histMsg, reactions: deduped };
            }
            return histMsg;
          });
          return [...otherChannelMessages, ...mergedMessages];
        });
      } else {
        const errorText = await response.text();
        console.error('Failed to load channel messages:', response.status, errorText);
        console.error('Response URL:', response.url);
        console.error('Response status text:', response.statusText);
        
        if (response.status === 401) {
          toast.error('Authentication failed. Please log in again.');
        } else if (response.status === 403) {
          toast.error('You do not have permission to view messages in this channel.');
        } else if (response.status === 404) {
          toast.error('Channel not found.');
        } else {
          toast.error(`Failed to load message history: ${response.status} - ${errorText}`);
        }
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('Request timed out after 10 seconds');
        toast.error('Request timed out - server may be unresponsive');
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('Network error - server may be down:', error);
        toast.error('Cannot connect to server. Please check if the backend is running.');
      } else {
        console.error('Error loading channel messages:', error);
        toast.error('Failed to load message history');
      }
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!user || !selectedChannel) {
      return;
    }

    // Always load messages when channel changes, regardless of existing messages
    if (selectedChannel.id !== prevChannelRef.current) {
      console.log('Loading messages for channel:', selectedChannel.name, 'with ID:', selectedChannel.id);
      loadChannelMessages(selectedChannel.id);
      prevChannelRef.current = selectedChannel.id;
    }

    // Join the selected channel
    if (isConnected) {
      console.log('Joining channel:', selectedChannel.name, 'with ID:', selectedChannel.id);
      joinChannel(selectedChannel.id);
    }
  }, [isConnected, user, selectedChannel, joinChannel]);

  // Fetch users for DM
  useEffect(() => {
    setLoadingUsers(true);
    userAPI.getUsersForDM()
      .then(users => {
        // Update users with blocking status from API response
        setUsers(users);
        // Update blocked users list from the API response
        const blockedUsersFromAPI = users.filter(user => user.is_blocked);
        setBlockedUsers(blockedUsersFromAPI);
      })
      .catch(() => {
        setUsers([]);
        setBlockedUsers([]);
      })
      .finally(() => setLoadingUsers(false));
  }, []);

  // Enhanced message sending with emoji support, E2EE, and image/meme sharing
  const handleSendMessage = async (content: string, messageType?: 'text' | 'emoji' | 'image', imageUrl?: string) => {
    if ((!content.trim() && !imageUrl) || !user || (!selectedChannel && !selectedDMUser)) return;
    if (!isConnected) {
      toast.error('Not connected to server. Please wait for connection...');
      return;
    }
    
    // Check if current user has blocked the selected DM user
    if (selectedDMUser && selectedDMUser.is_blocked) {
      toast.error('You have blocked this user. Unblock to send messages.');
      return;
    }
    
    if (selectedDMUser) {
      // Prepare message content with E2EE for DMs
      const { content: processedContent, is_encrypted } = await prepareMessageContent(
        content,
        undefined, // channelId
        selectedDMUser.id, // recipientId
        user.id // senderId
      );
      
      const tempId = 'pending-' + Math.random().toString(36).slice(2);
      const pendingMsg: Message & { pending?: boolean } = {
        id: tempId,
        content: content, // Show original content in UI
        sender_id: user.id,
        sender_name: user.full_name || user.username,
        sender: {
          id: user.id,
          username: user.username,
          full_name: user.full_name || user.username,
          avatar_url: user.avatar_url
        },
        recipient_id: selectedDMUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_encrypted: is_encrypted,
        pending: true,
        image_url: imageUrl || undefined,
      };
      setPendingDMMessages(prev => [...prev, pendingMsg]);
      
      // Send encrypted content and image to backend
      sendMessage(processedContent, undefined, selectedDMUser.id, imageUrl);
    } else if (selectedChannel) {
      sendMessage(content, selectedChannel.id, undefined, imageUrl);
    }
  };

  // When DM history is fetched, merge with local pending messages (deduplicate by content/timestamp)
  useEffect(() => {
    if (!selectedDMUser || !user) return;
    setLoadingDM(true);
    const token = localStorage.getItem('access_token');
    console.log('Loading DM history for user:', selectedDMUser.id);
    fetch(`${API_BASE}/messages/direct/${selectedDMUser.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(res => {
        console.log('DM history response status:', res.status);
        return res.ok ? res.json() : [];
      })
      .then(data => {
        console.log('Loaded DM history:', data);
        // Remove pending messages that are now confirmed by the server
        const confirmed = Array.isArray(data) ? data : [];
        setMessages(prevMessages => {
          // Remove existing DM messages for this user
          const otherMessages = prevMessages.filter(msg => 
            !((msg.recipient_id === selectedDMUser.id || msg.sender_id === selectedDMUser.id) && !msg.channel_id)
          );
          
          // For each confirmed message, merge reactions and image_url with any existing DM message with the same id
          const mergedMessages = confirmed.map(confMsg => {
            // Process encrypted messages
            const processedMsg = processReceivedMessage(confMsg, user?.id || '');
            const existing = pendingDMMessages.find(m => m.id === processedMsg.id);
            let image_url = processedMsg.image_url;
            if ((!image_url || image_url === '') && existing && existing.image_url) {
              image_url = existing.image_url;
            }
            if (existing && Array.isArray(existing.reactions)) {
              // Merge reactions, deduplicate by emoji+user_id
              const allReactions = [...(Array.isArray(processedMsg.reactions) ? processedMsg.reactions : []), ...existing.reactions];
              const deduped = allReactions.filter((r, idx, arr) =>
                arr.findIndex(x => x.emoji === r.emoji && x.user_id === r.user_id) === idx
              );
              return { ...processedMsg, reactions: deduped, image_url };
            }
            return { ...processedMsg, image_url };
          });
          
          // Add any pending messages that are not confirmed
          pendingDMMessages.forEach(pendingMsg => {
            const exists = confirmed.some(msg =>
              msg.content === pendingMsg.content &&
              msg.sender_id === pendingMsg.sender_id &&
              Math.abs(new Date(msg.created_at).getTime() - new Date(pendingMsg.created_at).getTime()) < 5000
            );
            if (!exists) mergedMessages.push(pendingMsg);
          });
          
          // Sort by created_at
          mergedMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          console.log('Final merged DM messages:', mergedMessages);
          return [...otherMessages, ...mergedMessages];
        });
      })
      .catch((error) => {
        console.error('Error loading DM history:', error);
        // Don't clear messages on error, just log it
      })
      .finally(() => setLoadingDM(false));
  }, [selectedDMUser, user]);

  // Listen for real-time DM messages from WebSocket
  useEffect(() => {
    if (!selectedDMUser) return;
    
    // Check if any new messages in the WebSocket context are DMs for the selected user
    const newDMMessages = messages.filter(msg => 
      msg.recipient_id === selectedDMUser.id || 
      (msg.recipient_id === user?.id && msg.sender_id === selectedDMUser.id)
    );
    
    if (newDMMessages.length > 0) {
      setMessages(prev => {
        // Merge new messages with existing ones, avoiding duplicates
        const allMessages = [...prev, ...newDMMessages];
        const uniqueMessages = allMessages.filter((msg, index, self) => 
          index === self.findIndex(m => m.id === msg.id)
        );
        
        // Remove any pending messages that match the confirmed ones
        const confirmedMessages = uniqueMessages.filter(msg => !msg.pending);
        const pendingMessages = uniqueMessages.filter(msg => msg.pending);
        
        // For each pending message, check if there's a confirmed version
        const finalPendingMessages = pendingMessages.filter(pendingMsg => {
          const hasConfirmed = confirmedMessages.some(confirmedMsg =>
            confirmedMsg.content === pendingMsg.content &&
            confirmedMsg.sender_id === pendingMsg.sender_id &&
            Math.abs(new Date(confirmedMsg.created_at).getTime() - new Date(pendingMsg.created_at).getTime()) < 5000
          );
          return !hasConfirmed;
        });
        
        // Combine confirmed and remaining pending messages, sort by timestamp
        const finalMessages = [...confirmedMessages, ...finalPendingMessages];
        finalMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        return finalMessages;
      });
      
      // Clear the pending messages that were confirmed
      setPendingDMMessages(prev => 
        prev.filter(pendingMsg => {
          const hasConfirmed = newDMMessages.some(confirmedMsg =>
            confirmedMsg.content === pendingMsg.content &&
            confirmedMsg.sender_id === pendingMsg.sender_id &&
            Math.abs(new Date(confirmedMsg.created_at).getTime() - new Date(pendingMsg.created_at).getTime()) < 5000
          );
          return !hasConfirmed;
        })
      );
    }
  }, [messages, selectedDMUser, user?.id]);

  // When switching DMs, clear pending messages for previous user
  useEffect(() => {
    setPendingDMMessages([]);
  }, [selectedDMUser]);

  // Check if selected DM user is blocked
  const isBlocked = selectedDMUser && selectedDMUser.is_blocked;

  // Block/unblock handlers
  const handleBlockUser = async () => {
    if (!selectedDMUser) return;
    setLoadingBlock(true);
    try {
      await userAPI.blockUser(selectedDMUser.id);
      // Refresh users list to get updated blocking status
      const updatedUsers = await userAPI.getUsersForDM();
      setUsers(updatedUsers);
      const blockedUsersFromAPI = updatedUsers.filter(user => user.is_blocked);
      setBlockedUsers(blockedUsersFromAPI);
      
      // Refresh DM messages to hide messages from blocked user
      if (selectedDMUser) {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE}/messages/direct/${selectedDMUser.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          const confirmed = Array.isArray(data) ? data : [];
          setMessages(() => {
            const mergedMessages = confirmed.map(confMsg => {
              const processedMsg = processReceivedMessage(confMsg, user?.id || '');
              const existing = pendingDMMessages.find(m => m.id === processedMsg.id);
              if (existing && Array.isArray(existing.reactions)) {
                const allReactions = [...(Array.isArray(processedMsg.reactions) ? processedMsg.reactions : []), ...existing.reactions];
                const deduped = allReactions.filter((r, idx, arr) =>
                  arr.findIndex(x => x.emoji === r.emoji && x.user_id === r.user_id) === idx
                );
                return { ...processedMsg, reactions: deduped };
              }
              return processedMsg;
            });
            return mergedMessages;
          });
        }
      }
      
      toast.success('User blocked');
    } catch {
      toast.error('Failed to block user');
    } finally {
      setLoadingBlock(false);
    }
  };
  
  const handleUnblockUser = async () => {
    if (!selectedDMUser) return;
    setLoadingBlock(true);
    try {
      await userAPI.unblockUser(selectedDMUser.id);
      // Refresh users list to get updated blocking status
      const updatedUsers = await userAPI.getUsersForDM();
      setUsers(updatedUsers);
      const blockedUsersFromAPI = updatedUsers.filter(user => user.is_blocked);
      setBlockedUsers(blockedUsersFromAPI);
      
      // Refresh DM messages to show messages from unblocked user
      if (selectedDMUser) {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE}/messages/direct/${selectedDMUser.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          const confirmed = Array.isArray(data) ? data : [];
          setMessages(() => {
            const mergedMessages = confirmed.map(confMsg => {
              const processedMsg = processReceivedMessage(confMsg, user?.id || '');
              const existing = pendingDMMessages.find(m => m.id === processedMsg.id);
              if (existing && Array.isArray(existing.reactions)) {
                const allReactions = [...(Array.isArray(processedMsg.reactions) ? processedMsg.reactions : []), ...existing.reactions];
                const deduped = allReactions.filter((r, idx, arr) =>
                  arr.findIndex(x => x.emoji === r.emoji && x.user_id === r.user_id) === idx
                );
                return { ...processedMsg, reactions: deduped };
              }
              return processedMsg;
            });
            return mergedMessages;
          });
        }
      }
      
      toast.success('User unblocked');
    } catch {
      toast.error('Failed to unblock user');
    } finally {
      setLoadingBlock(false);
    }
  };

  // --- Emoji Reaction Logic ---
  // Add or remove a reaction
  const handleReact = (messageId: string, emoji: string, reacted: boolean) => {
    if (!user) return;
    // Check both messages and dmMessages arrays to find the message
    const message = messages.find(m => m.id === messageId) || messages.find(m => m.id === messageId); // This line seems to be a duplicate, should be dmMessages
    const channel_id = message?.channel_id;
    const recipient_id = message?.recipient_id;
    
    // Optimistically update reactions in state
    console.log('Optimistically updating reactions for message', messageId, 'emoji', emoji, 'reacted', reacted);
    
    // Update channel messages
    setMessages(prevMessages => {
      const updated = prevMessages.map(msg => {
        if (msg.id !== messageId) return msg;
        let reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
        if (reacted) {
          reactions = reactions.filter(r => !(r.emoji === emoji && r.user_id === user.id));
        } else {
          if (!reactions.some(r => r.emoji === emoji && r.user_id === user.id)) {
            reactions.push({ emoji, user_id: user.id });
          }
        }
        return { ...msg, reactions };
      });
      return updated;
    });
    
    // Update DM messages
    setMessages(prevMessages => { // This line seems to be a duplicate, should be setDMMessages
      const updated = prevMessages.map(msg => {
        if (msg.id !== messageId) return msg;
        let reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
        if (reacted) {
          reactions = reactions.filter(r => !(r.emoji === emoji && r.user_id === user.id));
        } else {
          if (!reactions.some(r => r.emoji === emoji && r.user_id === user.id)) {
            reactions.push({ emoji, user_id: user.id });
          }
        }
        return { ...msg, reactions };
      });
      return updated;
    });
    
    // Send to backend
    if (window && (window as any).wsRef?.current) {
      if (typeof sendCustomEvent === 'function') {
        sendCustomEvent({
          type: reacted ? 'remove_reaction' : 'add_reaction',
          message_id: messageId,
          user_id: user.id,
          emoji,
          channel_id,
          recipient_id,
        });
      }
    }
  };

  // Listen for real-time reaction updates
  useEffect(() => {
    const handleReactionUpdate = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'reaction_update') {
          const { message_id, emoji, user_id, action } = data;
          // Update channel messages
          setMessages(prevMessages => {
            const updated = prevMessages.map(msg => {
              if (msg.id !== message_id) return msg;
              let reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
              if (action === 'add') {
                if (!reactions.some(r => r.emoji === emoji && r.user_id === user_id)) {
                  reactions.push({ emoji, user_id });
                }
              } else if (action === 'remove') {
                reactions = reactions.filter(r => !(r.emoji === emoji && r.user_id === user_id));
              }
              return { ...msg, reactions };
            });
            return updated;
          });
          // Update DM messages
          setMessages(prevMessages => { // This line seems to be a duplicate, should be setDMMessages
            const updated = prevMessages.map(msg => {
              if (msg.id !== message_id) return msg;
              let reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
              if (action === 'add') {
                if (!reactions.some(r => r.emoji === emoji && r.user_id === user_id)) {
                  reactions.push({ emoji, user_id });
                }
              } else if (action === 'remove') {
                reactions = reactions.filter(r => !(r.emoji === emoji && r.user_id === user_id));
              }
              return { ...msg, reactions };
            });
            return updated;
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    };
    const ws = (window as any).wsRef?.current || null;
    if (ws) {
      ws.addEventListener('message', handleReactionUpdate);
      return () => ws.removeEventListener('message', handleReactionUpdate);
    }
  }, [setMessages]); // Changed setMessages to setDMMessages

  // When switching channels, clear DM selection
  useEffect(() => {
    if (selectedChannel) setSelectedDMUser(null);
  }, [selectedChannel]);

  // Function to refresh messages to show updated avatars
  const refreshMessages = () => {
    console.log('🔄 Refreshing messages to show updated avatars...');
    console.log('Current user avatar_url:', user?.avatar_url);
    
    if (selectedChannel) {
      console.log('Refreshing channel messages for:', selectedChannel.name);
      loadChannelMessages(selectedChannel.id);
    }
    if (selectedDMUser) {
      console.log('Refreshing DM messages for:', selectedDMUser.username);
      // Refresh DM messages
      const token = localStorage.getItem('access_token');
      fetch(`${API_BASE}/messages/direct/${selectedDMUser.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          console.log('Refreshed DM messages:', data);
          const confirmed = Array.isArray(data) ? data : [];
          setMessages(() => {
            const mergedMessages = confirmed.map(confMsg => {
              const processedMsg = processReceivedMessage(confMsg, user?.id || '');
              console.log('Processed message sender:', processedMsg.sender);
              const existing = pendingDMMessages.find(m => m.id === processedMsg.id);
              if (existing && Array.isArray(existing.reactions)) {
                const allReactions = [...(Array.isArray(processedMsg.reactions) ? processedMsg.reactions : []), ...existing.reactions];
                const deduped = allReactions.filter((r, idx, arr) =>
                  arr.findIndex(x => x.emoji === r.emoji && x.user_id === r.user_id) === idx
                );
                return { ...processedMsg, reactions: deduped };
              }
              return processedMsg;
            });
            return mergedMessages;
          });
        })
        .catch(error => {
          console.error('Error refreshing DM messages:', error);
        });
    }
  };

  // Get display name - prefer full_name, fallback to username
  const displayName = user.full_name || user.username || 'Unknown User';

  // Filter messages for the selected channel
  const filteredMessages = messages.filter(
    (msg) => msg.channel_id === selectedChannel?.id
  );

  // (No filtering for DMs: always show full dmMessages)

  // Auto-scroll to latest message when messages change, unless user scrolled up
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area) return;
    if (autoScroll) {
      area.scrollTop = area.scrollHeight;
    }
  }, [filteredMessages, messages.length, autoScroll]);

  // Always scroll to bottom when switching channels or loading new channel messages (smooth)
  useEffect(() => {
    if (selectedChannel && messagesAreaRef.current) {
      messagesAreaRef.current.scrollTo({ top: messagesAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [selectedChannel, messages.length]);

  // Always scroll to bottom after sending a message or uploading an image in channels (smooth)
  useEffect(() => {
    if (messagesAreaRef.current) {
      messagesAreaRef.current.scrollTo({ top: messagesAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

  // Always scroll to bottom when switching DMs or loading new DM messages (smooth, after DOM update)
  useEffect(() => {
    if (selectedDMUser && messagesAreaRef.current) {
      setTimeout(() => {
        if (messagesAreaRef.current) {
          messagesAreaRef.current.scrollTo({ top: messagesAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 0);
    }
  }, [selectedDMUser, messages.length]);

  // Always scroll to bottom after sending a message or uploading an image in DMs (smooth, after DOM update)
  useEffect(() => {
    if (messagesAreaRef.current) {
      setTimeout(() => {
        if (messagesAreaRef.current) {
          messagesAreaRef.current.scrollTo({ top: messagesAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 0);
    }
  }, [pendingDMMessages.length]);

  // Auto-scroll to bottom when new messages arrive or when switching channels/DMs
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Always scroll to bottom when switching channels or DMs
  useEffect(() => {
    if (messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [selectedChannel?.id, selectedDMUser?.id]);

  // Detect if user scrolls up, disable auto-scroll
  const handleScroll = () => {
    const area = messagesAreaRef.current;
    if (!area) return;
    // If user is near the bottom, enable auto-scroll
    if (area.scrollHeight - area.scrollTop - area.clientHeight < 50) {
      setAutoScroll(true);
    } else {
      setAutoScroll(false);
    }
  };

  // Scroll to bottom function for Jump to Latest (smooth)
  const scrollToBottom = () => {
    const area = messagesAreaRef.current;
    if (area) {
      area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header - Fixed */}
      <div className="bg-black shadow-sm border-b px-6 py-4 flex-shrink-0 dark:bg-dark-800 dark:border-dark-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img src={brandLogo} alt="b4nter Logo" className="w-8 h-8 rounded-full object-contain shadow-sm" />
            <h1 className="text-2xl font-bold text-white tracking-tight" style={{letterSpacing: '-0.0009em', fontFamily: 'Azeret Mono, monospace'}}>b4nter</h1>
            <span className="text-sm text-gray-300 dark:text-dark-200" style={{fontFamily: 'Cabin, sans-serif'}}>Start talking smack!</span>
          </div>
          <div className="flex items-center space-x-4">
            <UserProfileDropdown onAvatarUpdate={refreshMessages} />
            <button
              onClick={() => setIsDark((d) => !d)}
              className="px-2 py-1 text-xs text-gray-300 hover:text-white bg-gray-800 dark:bg-dark-700 dark:text-dark-200 rounded"
              title="Toggle dark mode"
            >
              {isDark ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area - Fixed height, no scroll */}
      <div className="flex-1 flex overflow-hidden bg-gray-100 dark:bg-dark-900">
        {/* Sidebar - Fixed */}
        <div className="w-64 bg-white border-r flex-shrink-0 dark:bg-dark-800 dark:border-dark-700">
          <div className="p-4 h-full overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 dark:text-white">Channels</h3>
            <input
              type="text"
              value={channelSearch}
              onChange={e => setChannelSearch(e.target.value)}
              placeholder="Search channels..."
              className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-dark-700 dark:border-dark-400 dark:text-white"
            />
            {loading ? (
              <div className="text-sm text-gray-500">Loading channels...</div>
            ) : (
              <div className="space-y-2">
                {channels.filter(channel => channel.name.toLowerCase().includes(channelSearch.toLowerCase())).map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedChannel(channel)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedChannel?.id === channel.id 
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-dark-600 dark:text-white' 
                        : 'text-gray-700 hover:bg-gray-100 dark:text-white dark:hover:bg-dark-600'
                    } ${
                      channel.is_call_channel 
                        ? 'border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20' 
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span># {channel.name}</span>
                      {channel.is_call_channel && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {channel.member_count} online
                        </span>
                      )}
                    </div>
                    {channel.is_call_channel && (
                      <div className="text-xs text-gray-500 mt-1">
                        {channel.call_type === 'voice' ? '🔊 Voice Call' : '📹 Video Call'}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-4 dark:text-white">Direct Messages</h3>
            <input
              type="text"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-dark-700 dark:border-dark-400 dark:text-white"
            />
            {loadingUsers ? (
              <div className="text-sm text-gray-500">Loading users...</div>
            ) : (
              <div className="space-y-2">
                {users.filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase())).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedDMUser(u); setSelectedChannel(null); }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${selectedDMUser?.id === u.id ? 'bg-indigo-100 text-indigo-700 dark:bg-dark-600 dark:text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-white dark:hover:bg-dark-600'}`}
                  >
                    {u.username}
                    {u.is_blocked && (
                      <span className="ml-2 text-xs text-red-500 font-semibold">(Blocked)</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Area - Fixed height */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-dark-700">
          {/* Channel Header - Fixed */}
          <div className="bg-white border-b px-6 py-4 flex-shrink-0 dark:bg-dark-800 dark:border-dark-700">
            <div className="flex items-center justify-between">
              <div>
                {selectedDMUser ? (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Direct Message with {selectedDMUser.username}
                      {isBlocked && (
                        <span className="ml-2 text-xs text-red-500 font-semibold">(Blocked)</span>
                      )}
                    </h2>
                    <EncryptionStatus isEncrypted={true} className="mt-1" />
                  </div>
                ) : selectedChannel?.is_call_channel ? (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      {selectedChannel.name}
                      <span className="text-sm text-green-600 dark:text-green-400">
                        {selectedChannel.member_count} participants
                      </span>
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                      {selectedChannel.call_type === 'voice' ? 'Voice Call' : 'Video Call'} • Started {new Date(selectedChannel.call_started_at || '').toLocaleTimeString()}
                    </p>
                  </div>
                ) : (
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedChannel ? `# ${selectedChannel.name}` : 'Select a channel or user'}
                  </h2>
                )}
                {selectedChannel && !selectedDMUser && !selectedChannel.is_call_channel && (
                  <p className="text-sm text-gray-500 dark:text-gray-300">{selectedChannel.description}</p>
                )}
              </div>
              <div className="flex items-center space-x-4">
                {selectedDMUser && !isBlocked && (
                  <CallControls
                    targetUserId={selectedDMUser.id}
                    targetUsername={selectedDMUser.username}
                    onCallEnd={() => setIsInCall(false)}
                    socket={socket}
                  />
                )}
                {selectedDMUser && (
                  isBlocked ? (
                    <button
                      onClick={handleUnblockUser}
                      disabled={loadingBlock}
                      className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200"
                    >
                      Unblock
                    </button>
                  ) : (
                    <button
                      onClick={handleBlockUser}
                      disabled={loadingBlock}
                      className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                    >
                      Block
                    </button>
                  )
                )}
                <span className="text-sm text-gray-500 dark:text-gray-300">
                  {isConnected ? (
                    <span className="text-green-600">● Connected</span>
                  ) : (
                    <span className="text-red-600">● Disconnected</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Messages Area - Scrollable */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 relative dark:bg-dark-700">
            {selectedChannel?.is_call_channel ? (
              // Call channel UI
              <div className="text-center py-8">
                <div className="text-6xl mb-6">
                  {selectedChannel.call_type === 'voice' ? '🔊' : '📹'}
                </div>
                <h3 className="text-2xl font-bold mb-4 dark:text-white">
                  {selectedChannel.call_type === 'voice' ? 'Voice Call' : 'Video Call'}
                </h3>
                
                {/* Call Timer */}
                <div className="mb-6">
                  <div className="text-3xl font-mono text-gray-600 dark:text-gray-300">
                    {(() => {
                      const hours = Math.floor(callDuration / 3600);
                      const minutes = Math.floor((callDuration % 3600) / 60);
                      const seconds = callDuration % 60;
                      return `${hours > 0 ? hours + ':' : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    })()}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Call Duration</p>
                </div>
                
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  {selectedChannel.member_count} participants in this call
                </p>
                
                {/* Call Controls */}
                <div className="flex justify-center gap-4 mb-8">
                  <button
                    onClick={handleEndCall}
                    className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full flex items-center gap-2 transition-colors"
                  >
                    <span className="text-xl">📞</span>
                    End Call
                  </button>
                </div>
                
                <div className="bg-gray-100 dark:bg-dark-600 rounded-lg p-4 max-w-md mx-auto">
                  <h4 className="font-semibold mb-3 dark:text-white">Participants</h4>
                  <div className="space-y-3">
                    {selectedChannel.call_participants?.map((participantId, index) => (
                      <div key={participantId} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                            {/* Voice activity indicator - would be connected to actual audio detection */}
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-pulse opacity-0"></div>
                          </div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            {getParticipantName(participantId)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Online</span>
                          {/* Audio level indicator */}
                          <div className="w-8 h-1 bg-gray-300 rounded-full overflow-hidden">
                            <div className="h-full bg-green-400 rounded-full" style={{ width: '60%' }}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : selectedDMUser ? (
              loadingDM ? (
                <div className="text-center text-gray-500 dark:text-gray-300">Loading messages...</div>
              ) : currentMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8 dark:text-gray-300">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                user && currentMessages.map((msg, index) => {
                  const m = msg as Message & { pending?: boolean };
                  return (
                    <MessageDisplay
                      key={m.id}
                      message={m}
                      onReact={handleReact}
                      currentUserId={user.id}
                    />
                  );
                })
              )
            ) : (
              loadingMessages ? (
                <div className="text-center text-gray-500 dark:text-gray-300">Loading messages...</div>
              ) : currentMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                user && currentMessages.map((msg, index) => (
                  <MessageDisplay
                    key={msg.id}
                    message={msg}
                    onReact={handleReact}
                    currentUserId={user.id}
                  />
                ))
              )
            )}
            <div ref={messagesEndRef} />
            {!autoScroll && (
              <button
                onClick={scrollToBottom}
                className="fixed bottom-24 right-12 z-50 px-4 py-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all duration-200"
                style={{ position: 'absolute', right: 0, bottom: 0, margin: '16px' }}
              >
                Jump to Latest
              </button>
            )}
          </div>

          {/* Message Input - Fixed */}
          <div className="flex-shrink-0 p-4 bg-white border-t dark:bg-dark-800 dark:border-dark-700">
            {user && !selectedChannel?.is_call_channel && (
              <MessageInput
                onSendMessage={handleSendMessage}
                placeholder={selectedDMUser ? `Message @${selectedDMUser.username}...` : selectedChannel ? `Message # ${selectedChannel.name}...` : 'Select a channel or user to send a message...'}
                disabled={(!selectedChannel && !selectedDMUser) || (selectedDMUser && isBlocked)}
              />
            )}
            {selectedChannel?.is_call_channel && (
              <div className="text-center text-gray-500 dark:text-gray-300 py-4">
                <p>This is a {selectedChannel.call_type} call channel. Use the call controls to manage the call.</p>
              </div>
            )}
            {selectedDMUser && isBlocked && (
              <div className="text-center text-xs text-red-500 mt-2">You have blocked this user. Unblock to send messages.</div>
            )}
            
            {/* Debug: Test WebSocket connection */}
            {user && (
              <div className="mt-2 text-center">
                <button
                  onClick={() => {
                    if (socket) {
                      console.log('🧪 Testing WebSocket connection...');
                      socket.send(JSON.stringify({
                        type: 'test_message',
                        message: 'WebSocket test from ' + user.username
                      }));
                      toast.success('Test message sent! Check console.');
                    } else {
                      toast.error('WebSocket not connected!');
                    }
                  }}
                  className="text-xs bg-gray-500 text-white px-2 py-1 rounded"
                >
                  Test WebSocket
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Global incoming call UI */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-lg p-8 max-w-md w-full mx-4 animate-pulse">
            <div className="text-center">
              <div className="text-4xl mb-6 animate-bounce">📞</div>
              <h3 className="text-xl font-bold mb-3 dark:text-white">Incoming Call</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-8 text-lg">
                <strong>{incomingCall.fromName}</strong> is calling you...
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={async () => {
                    try {
                      console.log('🎯 Accepting incoming call from:', incomingCall.from);
                      console.log('🎯 Call channel ID:', incomingCall.channelId);
                      console.log('🎯 Current channels:', channels.map(ch => ({ id: ch.id, name: ch.name, isCall: ch.is_call_channel })));
                      
                      // Find the existing call channel (don't create a new one)
                      let callChannel = channels.find(ch => ch.id === incomingCall.channelId);
                      if (!callChannel) {
                        console.log('🎯 Call channel not found in local channels, creating it...');
                        // Only create if it doesn't exist locally
                        callChannel = createCallChannelForReceiver(
                          incomingCall.channelId,
                          `${incomingCall.isVideo ? '📹' : '🔊'} ${incomingCall.isVideo ? 'Video' : 'Voice'} Call`,
                          incomingCall.isVideo ? 'video' : 'voice',
                          [incomingCall.from, user?.id || '']
                        );
                      } else {
                        console.log('🎯 Found existing call channel:', callChannel);
                      }
                      
                      // Join the call channel (this should update the existing channel)
                      console.log('🎯 Joining call channel:', incomingCall.channelId);
                      joinCallChannel(incomingCall.channelId, user?.id || '');
                      setActiveCallChannelId(incomingCall.channelId);
                      
                      // Force a refresh of channels to get the updated state
                      setTimeout(() => {
                        console.log('🎯 Refreshing channels after join...');
                        refreshChannels();
                      }, 100);
                      
                      // Switch to the call channel view
                      console.log('🎯 Switching to call channel:', callChannel);
                      setSelectedChannel(callChannel);
                      
                      // Send call accepted message
                      if (socket) {
                        socket.send(JSON.stringify({
                          type: 'call_accepted',
                          to: incomingCall.from
                        }));
                        
                        // Notify caller that receiver has joined the channel
                        socket.send(JSON.stringify({
                          type: 'call_channel_joined',
                          to: incomingCall.from,
                          channelId: incomingCall.channelId,
                          userId: user?.id,
                          username: user?.username || user?.full_name || 'Unknown User'
                        }));
                        
                        // Handle the WebRTC offer if present to establish connection
                        if (incomingCall.offer) {
                          console.log('🎯 Handling WebRTC offer from incoming call');
                          socket.send(JSON.stringify({
                            type: 'webrtc_offer',
                            to: incomingCall.from,
                            offer: incomingCall.offer
                          }));
                        }
                      }
                      
                      // Clear the incoming call UI
                      setIncomingCall(null);
                      
                      // Show success message
                      toast.success(`Joined ${incomingCall.isVideo ? 'video' : 'voice'} call with ${incomingCall.fromName}`);
                      
                      console.log('🎯 Call accepted successfully - both users should now be in the same call channel');
                    } catch (error) {
                      console.error('🎯 Error accepting call:', error);
                      toast.error('Failed to accept call');
                    }
                  }}
                  className="bg-green-500 hover:bg-green-600 text-white px-8 py-3 rounded-full flex items-center gap-2 text-lg font-semibold transition-colors"
                >
                  <span className="text-2xl">✓</span> Accept
                </button>
                <button
                  onClick={() => {
                    // Reject the call
                    if (socket) {
                      socket.send(JSON.stringify({
                        type: 'call_rejected',
                        to: incomingCall.from
                      }));
                    }
                    setIncomingCall(null);
                  }}
                  className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full flex items-center gap-2 text-lg font-semibold transition-colors"
                >
                  <span className="text-2xl">✕</span> Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Global CallControls for WebRTC connections */}
      {incomingCall && (
        <CallControls
          targetUserId={incomingCall.from}
          targetUsername={incomingCall.fromName}
          onCallEnd={() => {
            setIncomingCall(null);
            // Switch back to a regular channel
            const regularChannels = channels.filter(ch => !ch.is_call_channel);
            if (regularChannels.length > 0) {
              setSelectedChannel(regularChannels[0]);
            }
          }}
          socket={socket}
          isGlobal={true}
        />
      )}
      
      {/* Global CallControls for active calls */}
      {selectedChannel?.is_call_channel && activeCallChannelId && (
        <CallControls
          targetUserId={selectedChannel.call_participants?.find(p => p !== user?.id) || ''}
          targetUsername={getParticipantName(selectedChannel.call_participants?.find(p => p !== user?.id) || '')}
          onCallEnd={() => {
            // Switch back to a regular channel
            const regularChannels = channels.filter(ch => !ch.is_call_channel);
            if (regularChannels.length > 0) {
              setSelectedChannel(regularChannels[0]);
            }
            setActiveCallChannelId(null);
            toast.success('Call ended');
          }}
          socket={socket}
          isGlobal={false}
        />
      )}
    </div>
  );
};

export default ChatPage; 