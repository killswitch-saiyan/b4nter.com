import React from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: any) => void;
  isOpen: boolean;
  onClose: () => void;
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onEmojiSelect, isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleEmojiSelect = (emoji: any) => {
    onEmojiSelect(emoji);
    onClose();
  };

  return (
    <div className="w-full h-full">
      <Picker
        data={data}
        onEmojiSelect={handleEmojiSelect}
        theme="light"
        set="native"
        previewPosition="none"
        skinTonePosition="none"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default EmojiPicker; 