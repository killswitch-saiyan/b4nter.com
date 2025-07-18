import React, { useState, useRef } from 'react';
import { FaSmile, FaPaperPlane, FaPaperclip, FaTimes } from 'react-icons/fa';
import EmojiPicker from './EmojiPicker';
import GifPicker from 'gif-picker-react';

interface MessageInputProps {
  onSendMessage: (message: string, messageType?: 'text' | 'emoji' | 'image', imageUrl?: string) => void;
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

const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY;

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  placeholder = 'Type a message...',
  disabled = false,
}) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((message.trim() || imageFile) && !disabled && !uploading) {
      let imageUrl = '';
      if (imageFile) {
        setUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', imageFile);
          const token = localStorage.getItem('access_token');
          const res = await fetch('/api/messages/upload-image', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            imageUrl = data.url;
          } else {
            alert('Failed to upload image');
            setUploading(false);
            return;
          }
        } catch (err) {
          alert('Failed to upload image');
          setUploading(false);
          return;
        }
        setUploading(false);
      }
      onSendMessage(message.trim(), imageFile ? 'image' : 'text', imageUrl);
      setMessage('');
      setImageFile(null);
      setImagePreview(null);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // Paste image from clipboard
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        e.preventDefault();
      }
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleGifSelect = (gif: any) => {
    // gif.url is the direct GIF URL
    onSendMessage('', 'image', gif.url);
    setShowGifPicker(false);
  };

  return (
    <div className="relative">
      {showGifPicker && (
        <div className="absolute bottom-16 left-0 z-50">
          <GifPicker
            tenorApiKey={TENOR_API_KEY}
            onGifClick={handleGifSelect}
            width={350}
            height={400}
            theme={"light" as any}
          />
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 bg-gray-50 border-t dark:bg-dark-800 dark:border-dark-700">
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
            disabled={disabled || uploading}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-dark-700 dark:border-dark-400 dark:text-white"
            rows={1}
            style={{ minHeight: 48, maxHeight: 120 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            onPaste={handlePaste}
          />
          <EmojiPicker
            isOpen={showEmojiPicker}
            onEmojiSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
          />
          {/* Image Preview */}
          {imagePreview && (
            <div className="mt-2 flex items-center gap-2">
              <img src={imagePreview} alt="preview" className="max-h-24 rounded border" />
              <button type="button" onClick={handleRemoveImage} className="text-red-500 hover:text-red-700"><FaTimes /></button>
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowGifPicker((prev) => !prev)}
            className="h-12 w-12 text-pink-500 hover:text-pink-700 hover:bg-pink-100 rounded-lg transition-colors flex items-center justify-center"
            disabled={disabled || uploading}
            title="Send GIF"
          >
            <span role="img" aria-label="GIF" style={{ fontWeight: 'bold', fontSize: 20 }}>GIF</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-12 w-12 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center"
            disabled={disabled || uploading}
            title="Attach image"
          >
            <FaPaperclip size={22} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={disabled || uploading}
          />
          <button
            type="button"
            onClick={toggleEmojiPicker}
            className="h-12 w-12 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center"
            disabled={disabled || uploading}
          >
            <FaSmile size={24} />
          </button>
          <button
            type="submit"
            disabled={(!message.trim() && !imageFile) || disabled || uploading}
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