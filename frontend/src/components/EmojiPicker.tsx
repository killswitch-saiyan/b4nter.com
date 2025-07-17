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
    <div className="absolute bottom-full mb-2 z-50">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200">
        <Picker
          data={data}
          onEmojiSelect={handleEmojiSelect}
          theme="light"
          set="native"
          previewPosition="none"
          skinTonePosition="none"
        />
      </div>
    </div>
  );
};

export default EmojiPicker; 