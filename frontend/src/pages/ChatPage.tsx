import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useChannels } from '../contexts/ChannelsContext';
import { toast } from 'react-hot-toast';
import MessageInput from '../components/MessageInput';
import MessageDisplay from '../components/MessageDisplay';
import { userAPI } from '../lib/api';
import { Message, MessageReaction } from '../types';
// @ts-ignore
import brandLogo from '../assets/brandlogo.png';

const ChatPage: React.FC = () => {
  const { user, logout } = useAuth();
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
      const response = await fetch(`/api/messages/channel/${channelId}`, {
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
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, []);

  // Enhanced message sending with emoji support
  const handleSendMessage = (content: string, messageType?: 'text' | 'emoji') => {
    if (!content.trim() || !user || (!selectedChannel && !selectedDMUser)) return;
    if (!isConnected) {
      toast.error('Not connected to server. Please wait for connection...');
      return;
    }
    if (selectedDMUser && isBlocked) {
      toast.error('You have blocked this user. Unblock to send messages.');
      return;
    }
    
    if (selectedDMUser) {
      const tempId = 'pending-' + Math.random().toString(36).slice(2);
      const pendingMsg: Message & { pending?: boolean } = {
        id: tempId,
        content: content,
        sender_id: user.id,
        sender: {
          id: user.id,
          username: user.username,
          full_name: user.full_name || user.username,
          avatar_url: user.avatar_url
        },
        recipient_id: selectedDMUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_type: messageType || 'text',
        pending: true,
      };
      setPendingDMMessages(prev => [...prev, pendingMsg]);
      sendMessage(content, undefined, selectedDMUser.id);
    } else if (selectedChannel) {
      sendMessage(content, selectedChannel.id);
    }
  };

  // When DM history is fetched, merge with local pending messages (deduplicate by content/timestamp)
  useEffect(() => {
    if (!selectedDMUser) return;
    setLoadingDM(true);
    const token = localStorage.getItem('access_token');
    fetch(`/api/messages/direct/${selectedDMUser.id}`, {
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
          // For each confirmed message, merge reactions with any existing DM message with the same id
          const mergedMessages = confirmed.map(confMsg => {
            const existing = pendingDMMessages.find(m => m.id === confMsg.id);
            if (existing && Array.isArray(existing.reactions)) {
              // Merge reactions, deduplicate by emoji+user_id
              const allReactions = [...(Array.isArray(confMsg.reactions) ? confMsg.reactions : []), ...existing.reactions];
              const deduped = allReactions.filter((r, idx, arr) =>
                arr.findIndex(x => x.emoji === r.emoji && x.user_id === r.user_id) === idx
              );
              return { ...confMsg, reactions: deduped };
            }
            return confMsg;
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

  // Fetch blocked users
  useEffect(() => {
    userAPI.getBlockedUsers()
      .then(setBlockedUsers)
      .catch(() => setBlockedUsers([]));
  }, []);

  const isBlocked = selectedDMUser && blockedUsers.some(u => u.id === selectedDMUser.id);

  // Block/unblock handlers
  const handleBlockUser = async () => {
    if (!selectedDMUser) return;
    setLoadingBlock(true);
    try {
      await userAPI.blockUser(selectedDMUser.id);
      setBlockedUsers(prev => [...prev, selectedDMUser]);
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
      setBlockedUsers(prev => prev.filter(u => u.id !== selectedDMUser.id));
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

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please log in to continue</h2>
        </div>
      </div>
    );
  }

  // Get display name - prefer full_name, fallback to username
  const displayName = user.full_name || user.username || 'Unknown User';

  // Filter messages for the selected channel
  const filteredMessages = messages.filter(
    (msg) => msg.channel_id === selectedChannel?.id
  );

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img src={brandLogo} alt="b4nter Logo" className="w-8 h-8 rounded-full object-contain shadow-sm" />
            <h1 className="text-2xl font-bold text-gray-900">b4nter</h1>
            <span className="text-sm text-gray-500">Where the game never stops talking</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              Welcome, {displayName}!
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Channels</h3>
            {loading ? (
              <div className="text-sm text-gray-500">Loading channels...</div>
            ) : (
              <div className="space-y-2">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedChannel(channel)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${
                      selectedChannel?.id === channel.id
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    #{channel.name}
                  </button>
                ))}
              </div>
            )}
            <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-4">Direct Messages</h3>
            {loadingUsers ? (
              <div className="text-sm text-gray-500">Loading users...</div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedDMUser(u); setSelectedChannel(null); }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${
                      selectedDMUser?.id === u.id
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {u.full_name || u.username}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Channel Header */}
          <div className="bg-white border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                {selectedDMUser ? (
                  <h2 className="text-lg font-semibold text-gray-900">
                    Direct Message with {selectedDMUser.full_name || selectedDMUser.username}
                    {isBlocked && (
                      <span className="ml-2 text-xs text-red-500 font-semibold">(Blocked)</span>
                    )}
                  </h2>
                ) : (
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedChannel ? `#${selectedChannel.name}` : 'Select a channel or user'}
                  </h2>
                )}
                {selectedChannel && !selectedDMUser && (
                  <p className="text-sm text-gray-500">{selectedChannel.description}</p>
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
                <span className="text-sm text-gray-500">
                  {isConnected ? (
                    <span className="text-green-600">● Connected</span>
                  ) : (
                    <span className="text-red-600">● Disconnected</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {selectedDMUser ? (
              loadingDM ? (
                <div className="text-center text-gray-500">Loading messages...</div>
              ) : dmMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                dmMessages.map((msg, index) => {
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
                <div className="text-center text-gray-500">Loading messages...</div>
              ) : filteredMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                filteredMessages.map((msg, index) => (
                  <MessageDisplay
                    key={msg.id}
                    message={msg}
                    onReact={handleReact}
                    currentUserId={user.id}
                  />
                ))
              )
            )}
          </div>

          {/* Enhanced Message Input with Emoji and GIF Support */}
          <MessageInput
            onSendMessage={handleSendMessage}
            placeholder={selectedDMUser ? `Message @${selectedDMUser.full_name || selectedDMUser.username}...` : selectedChannel ? `Message #${selectedChannel.name}...` : 'Select a channel or user to send a message...'}
            disabled={(!selectedChannel && !selectedDMUser) || (selectedDMUser && isBlocked)}
          />
          {selectedDMUser && isBlocked && (
            <div className="text-center text-xs text-red-500">You have blocked this user. Unblock to send messages.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage; 