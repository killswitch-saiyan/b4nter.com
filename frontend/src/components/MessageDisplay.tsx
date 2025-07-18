import React, { useState, useEffect, useRef } from 'react';
import { Message, MessageReaction } from '../types';
import { extractYouTubeUrls } from '../utils/youtubeUtils';
import YouTubeThumbnail from './YouTubeThumbnail';

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
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Handle clicking outside emoji picker to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Use username only for displayName
  const displayName = message.sender?.username || 'Unknown';
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

  // Function to render message content with clickable links
  const renderMessageContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div
      className={`flex flex-col items-start space-y-1 ${message.pending ? 'opacity-60' : ''} ${hovered ? 'bg-blue-200 dark:bg-dark-600' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTooltipEmoji(null); }}
    >
      <div className="flex items-start space-x-3 w-full">
        <div className="flex-shrink-0">
          {message.sender?.avatar_url ? (
            <img
              src={message.sender.avatar_url}
              alt={`${displayName}'s avatar`}
              className="w-8 h-8 rounded-full object-cover"
              onError={(e) => {
                // Fallback to initials if image fails to load
                console.error('Avatar image failed to load:', message.sender?.avatar_url);
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
              onLoad={() => {
                console.log('Avatar image loaded successfully:', message.sender?.avatar_url);
              }}
            />
          ) : null}
          <div className={`w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center ${message.sender?.avatar_url ? 'hidden' : ''}`}>
            <span className="text-white text-sm font-medium">{avatarInitial}</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-baseline space-x-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">{new Date(message.created_at).toLocaleTimeString()}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-white">{renderMessageContent(message.content)}</p>
          {message.image_url && (
            <div className="mt-2">
              <a href={message.image_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={message.image_url}
                  alt="attachment"
                  className="max-h-64 rounded-lg border shadow-sm hover:shadow-lg transition-all duration-200"
                  style={{ maxWidth: '320px', objectFit: 'contain' }}
                />
              </a>
            </div>
          )}
          {message.pending && <span className="ml-2 text-xs text-gray-400 animate-pulse">Sending...</span>}
          
          {/* YouTube Thumbnails */}
          {(() => {
            const youtubeUrls = extractYouTubeUrls(message.content);
            if (youtubeUrls.length > 0) {
              return (
                <div className="mt-2 space-y-2">
                  {youtubeUrls.map((url, index) => (
                    <YouTubeThumbnail key={index} url={url} className="max-w-sm" />
                  ))}
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
      {/* Emoji Reactions Row */}
      <div className="flex items-center space-x-1 mt-1 ml-12 relative">
        {Object.entries(reactionMap).map(([emoji, { count, reacted, users }]) => (
          <div key={emoji} className="relative inline-block">
            <button
              className={`flex items-center px-2 py-1 rounded-full text-sm border ${reacted ? 'bg-indigo-100 border-indigo-400 dark:bg-dark-600 dark:border-dark-400' : 'bg-gray-100 border-gray-300 dark:bg-dark-700 dark:border-dark-400'} hover:bg-indigo-200 dark:hover:bg-dark-500 transition ${clickedEmoji === emoji ? 'scale-110 ring-2 ring-indigo-300' : ''}`}
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
          className={`flex items-center justify-center w-6 h-6 rounded-full text-xs border bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400 dark:bg-dark-700 dark:border-dark-400 dark:text-white dark:hover:bg-dark-600 transition-all duration-200 shadow-sm ${hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'} z-10`}
          onClick={() => setShowEmojiPicker((v) => !v)}
          tabIndex={-1}
        >
          <span className="font-bold text-gray-600">+</span>
        </button>
        {showEmojiPicker && (
          <div className="absolute z-50 bottom-full left-0 mb-2 animate-in fade-in-0 zoom-in-95 duration-200" ref={emojiPickerRef}>
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 relative">
              {/* Arrow pointer */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-200" style={{ marginTop: '-1px' }}></div>
              
              <div className="flex items-center space-x-1">
                {["👍","❤️","😂","😮","😢","😡","🎉","👏","🔥","💯","⚽","🏆"].map((emoji) => (
                  <button
                    key={emoji}
                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded transition-colors"
                    onClick={() => handleAddReaction(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageDisplay; 