import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useChannels } from '../contexts/ChannelsContext';
import { toast } from 'react-hot-toast';
import MessageInput from '../components/MessageInput';
import MessageDisplay from '../components/MessageDisplay';
import EncryptionStatus from '../components/EncryptionStatus';
import UserProfileDropdown from '../components/UserProfileDropdown';
import { userAPI } from '../lib/api';
import { Message, MessageReaction } from '../types';
import { prepareMessageContent, processReceivedMessage } from '../services/e2eeService';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
// @ts-ignore
import brandLogo from '../assets/brandlogo.png';

const ChatPage: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const { isConnected, sendMessage, joinChannel, messages, setMessages, sendCustomEvent } = useWebSocket();
  const { channels, loading, selectedChannel, setSelectedChannel } = useChannels();
  const [message, setMessage] = useState('');
  const prevChannelRef = useRef<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedDMUser, setSelectedDMUser] = useState<any | null>(null);
  const [dmMessages, setDMMessages] = useState<Message[]>([]);
  const [loadingDM, setLoadingDM] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loadingBlock, setLoadingBlock] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pendingDMMessages, setPendingDMMessages] = useState<Message[]>([]);
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
        toast.error(`Failed to load message history: ${response.status}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('Request timed out after 10 seconds');
        toast.error('Request timed out - server may be unresponsive');
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

    // Load historical messages when channel changes or when no messages exist for current channel
    const channelMessages = messages.filter(msg => msg.channel_id === selectedChannel.id);
    if (selectedChannel.id !== prevChannelRef.current || channelMessages.length === 0) {
      console.log('Loading messages for channel:', selectedChannel.name, 'with ID:', selectedChannel.id);
      loadChannelMessages(selectedChannel.id);
      prevChannelRef.current = selectedChannel.id;
    }

    // Join the selected channel
    if (isConnected) {
      console.log('Joining channel:', selectedChannel.name, 'with ID:', selectedChannel.id);
      joinChannel(selectedChannel.id);
    }
  }, [isConnected, user, selectedChannel, joinChannel, messages]);

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
    if (!selectedDMUser) return;
    setLoadingDM(true);
    const token = localStorage.getItem('access_token');
    fetch(`${API_BASE}/messages/direct/${selectedDMUser.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        // Remove pending messages that are now confirmed by the server
        const confirmed = Array.isArray(data) ? data : [];
        setDMMessages(() => {
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
          return mergedMessages;
        });
      })
      .catch(() => setDMMessages([]))
      .finally(() => setLoadingDM(false));
  }, [selectedDMUser]);

  // Listen for real-time DM messages from WebSocket
  useEffect(() => {
    if (!selectedDMUser) return;
    
    // Check if any new messages in the WebSocket context are DMs for the selected user
    const newDMMessages = messages.filter(msg => 
      msg.recipient_id === selectedDMUser.id || 
      (msg.recipient_id === user?.id && msg.sender_id === selectedDMUser.id)
    );
    
    if (newDMMessages.length > 0) {
      setDMMessages(prev => {
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
          setDMMessages(() => {
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
          setDMMessages(() => {
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
    const message = messages.find(m => m.id === messageId) || dmMessages.find(m => m.id === messageId);
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
    setDMMessages(prevDMMessages => {
      const updated = prevDMMessages.map(msg => {
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
          setDMMessages(prevDMMessages => {
            const updated = prevDMMessages.map(msg => {
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
  }, [setMessages, setDMMessages]);

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
          setDMMessages(() => {
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
  }, [filteredMessages, dmMessages, autoScroll]);

  // Always scroll to bottom when switching channels or loading new channel messages (smooth)
  useEffect(() => {
    if (selectedChannel && messagesAreaRef.current) {
      messagesAreaRef.current.scrollTo({ top: messagesAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [selectedChannel, filteredMessages.length]);

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
  }, [selectedDMUser, dmMessages.length]);

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
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${selectedChannel?.id === channel.id ? 'bg-indigo-100 text-indigo-700 dark:bg-dark-600 dark:text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-white dark:hover:bg-dark-600'}`}
                  >
                    # {channel.name}
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
                ) : (
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedChannel ? `# ${selectedChannel.name}` : 'Select a channel or user'}
                  </h2>
                )}
                {selectedChannel && !selectedDMUser && (
                  <p className="text-sm text-gray-500 dark:text-gray-300">{selectedChannel.description}</p>
                )}
              </div>
              <div className="flex items-center space-x-4">
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
            {selectedDMUser ? (
              loadingDM ? (
                <div className="text-center text-gray-500 dark:text-gray-300">Loading messages...</div>
              ) : dmMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8 dark:text-gray-300">
                  {dmMessages.length === 0 ? (
                    <p>No messages yet. Start the conversation!</p>
                  ) : (
                    <p>Messages from this user are hidden because they are blocked.</p>
                  )}
                </div>
              ) : (
                user && dmMessages.map((msg, index) => {
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
              ) : filteredMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                user && filteredMessages.map((msg, index) => (
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
            {user && (
              <MessageInput
                onSendMessage={handleSendMessage}
                placeholder={selectedDMUser ? `Message @${selectedDMUser.username}...` : selectedChannel ? `Message # ${selectedChannel.name}...` : 'Select a channel or user to send a message...'}
                disabled={(!selectedChannel && !selectedDMUser) || (selectedDMUser && isBlocked)}
              />
            )}
            {selectedDMUser && isBlocked && (
              <div className="text-center text-xs text-red-500 mt-2">You have blocked this user. Unblock to send messages.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage; 