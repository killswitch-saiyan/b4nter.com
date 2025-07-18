import React, { useState } from 'react';
import { Message, MessageReaction } from '../types';

interface MessageDisplayProps {
  message: Message & { pending?: boolean };
  onReact?: (messageId: string, emoji: string, reacted: boolean) => void;
  currentUserId?: string;
}

const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, onReact, currentUserId }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [clickedEmoji, setClickedEmoji] = useState<string | null>(null);
  const [lastClick, setLastClick] = useState<number>(0);
  const [tooltipEmoji, setTooltipEmoji] = useState<string | null>(null);

  const displayName = message.sender?.full_name || message.sender?.username || 'Unknown';
  const avatarInitial = message.sender?.full_name?.charAt(0) || message.sender?.username?.charAt(0) || 'U';

  // Group reactions by emoji and count, and collect user names
  const reactionMap: { [emoji: string]: { count: number; reacted: boolean; users: string[] } } = {};
  (Array.isArray(message.reactions) ? message.reactions : []).forEach((r) => {
    if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { count: 0, reacted: false, users: [] };
    reactionMap[r.emoji].count++;
    if (r.user_id === currentUserId) reactionMap[r.emoji].reacted = true;
    // For tooltip, use user_id for now (can be replaced with username if available)
    reactionMap[r.emoji].users.push(r.user_id);
  });

  // Debounce: 400ms between clicks
  const handleReactionClick = (emoji: string) => {
    const now = Date.now();
    if (now - lastClick < 400) return;
    setLastClick(now);
    setClickedEmoji(emoji);
    setTimeout(() => setClickedEmoji(null), 250);
    if (onReact) {
      // Toggle: if user has reacted, remove; else, add
      const reacted = !!reactionMap[emoji]?.reacted;
      onReact(message.id, emoji, reacted);
    }
  };

  const handleAddReaction = (emoji: string) => {
    setShowEmojiPicker(false);
    if (onReact) {
      onReact(message.id, emoji, false);
    }
  };

  return (
    <div
      className={`flex flex-col items-start space-y-1 ${message.pending ? 'opacity-60' : ''} ${hovered ? 'bg-blue-200' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTooltipEmoji(null); }}
    >
      <div className="flex items-start space-x-3 w-full">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">{avatarInitial}</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-baseline space-x-2">
            <span className="text-sm font-medium text-gray-900">{displayName}</span>
            <span className="text-xs text-gray-700">{new Date(message.created_at).toLocaleTimeString()}</span>
          </div>
          <p className="text-sm text-gray-700">{message.content}</p>
          {message.pending && <span className="ml-2 text-xs text-gray-400 animate-pulse">Sending...</span>}
        </div>
      </div>
      {/* Emoji Reactions Row */}
      <div className="flex items-center space-x-1 mt-1 ml-12 relative">
        {Object.entries(reactionMap).map(([emoji, { count, reacted, users }]) => (
          <div key={emoji} className="relative inline-block">
            <button
              className={`flex items-center px-2 py-1 rounded-full text-sm border ${reacted ? 'bg-indigo-100 border-indigo-400' : 'bg-gray-100 border-gray-300'} hover:bg-indigo-200 transition ${clickedEmoji === emoji ? 'scale-110 ring-2 ring-indigo-300' : ''}`}
              style={{ transition: 'transform 0.15s, box-shadow 0.15s' }}
              onClick={() => handleReactionClick(emoji)}
              onMouseEnter={() => setTooltipEmoji(emoji)}
              onMouseLeave={() => setTooltipEmoji(null)}
            >
              <span className="mr-1">{emoji}</span> <span>{count}</span>
            </button>
            {/* Tooltip with user IDs (replace with usernames if available) */}
            {tooltipEmoji === emoji && users.length > 0 && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow z-50 whitespace-nowrap">
                {users.length === 1
                  ? `Reacted: ${users[0]}`
                  : `Reacted: ${users.join(', ')}`}
              </div>
            )}
          </div>
        ))}
        {/* + Button for Emoji Picker */}
        <button
          className={`flex items-center justify-center w-4 h-4 rounded-full text-[10px] border bg-gray-100 border-gray-300 hover:bg-indigo-200 transition absolute left-full ml-2 ${hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'} z-10`}
          style={{ transition: 'opacity 0.2s', minWidth: '16px', minHeight: '16px', padding: 0 }}
          onClick={() => setShowEmojiPicker((v) => !v)}
          tabIndex={-1}
        >
          <span className="font-bold leading-none">+</span>
        </button>
        {showEmojiPicker && (
          <div className="absolute z-50 mt-2 left-full ml-2">
            {/* Replace this with your emoji picker component */}
            <div className="bg-white border rounded shadow p-2">
              <div className="flex flex-wrap max-w-xs">
                {["😀","😂","😍","😎","👍","🔥","🎉","🙏","⚽","🏆","🥅","🥇","🥈","🥉"].map((emoji) => (
                  <button
                    key={emoji}
                    className="text-xl m-1 hover:bg-gray-200 rounded"
                    onClick={() => handleAddReaction(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button className="mt-2 text-xs text-gray-500" onClick={() => setShowEmojiPicker(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageDisplay; 