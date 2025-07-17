import React, { useState, useRef } from 'react';
import { FaSmile, FaPaperPlane } from 'react-icons/fa';
import EmojiPicker from './EmojiPicker';

interface MessageInputProps {
  onSendMessage: (message: string, messageType?: 'text' | 'emoji') => void;
  placeholder?: string;
  disabled?: boolean;
}

const SPORTS_EMOJIS = [
  '⚽', // Soccer Ball
  '🏆', // Trophy
  '🟥', // Red Card (Red Square)
  '🟨', // Yellow Card (Yellow Square)
  '🥅', // Goal Net
  '🧤', // Goalkeeper Glove
  '🏟️', // Stadium
  '👟', // Soccer Shoe
];

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  placeholder = 'Type a message...',
  disabled = false,
}) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      setShowEmojiPicker(false);
    }
  };

  const insertEmoji = (emojiChar: string) => {
    const cursorPos = inputRef.current?.selectionStart || 0;
    const newMessage = message.slice(0, cursorPos) + emojiChar + message.slice(cursorPos);
    setMessage(newMessage);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = cursorPos + emojiChar.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleEmojiSelect = (emoji: any) => {
    insertEmoji(emoji.native);
  };

  const handleSportsEmojiClick = (emojiChar: string) => {
    insertEmoji(emojiChar);
    setShowEmojiPicker(false);
  };

  const toggleEmojiPicker = () => setShowEmojiPicker((prev) => !prev);

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 bg-gray-50 border-t">
        <div className="flex-1 relative max-w-8xl">
          {/* Sports Emoji Row */}
          {showEmojiPicker && (
            <div className="flex gap-2 mb-2 px-1">
              {SPORTS_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="text-2xl hover:scale-110 transition-transform"
                  onClick={() => handleSportsEmojiClick(emoji)}
                  tabIndex={-1}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={1}
            style={{ minHeight: 48, maxHeight: 120 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <EmojiPicker
            isOpen={showEmojiPicker}
            onEmojiSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={toggleEmojiPicker}
            className="h-12 w-12 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center"
            disabled={disabled}
          >
            <FaSmile size={24} />
          </button>
          <button
            type="submit"
            disabled={!message.trim() || disabled}
            className="h-12 w-12 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center -mt-1"
          >
            <FaPaperPlane size={20} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default MessageInput; 