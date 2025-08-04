import React, { useState } from 'react';
import MultiUserVideoChat from './MultiUserVideoChat';

const MultiUserVideoButton: React.FC = () => {
  const [showVideoChat, setShowVideoChat] = useState(false);

  const startMultiUserVideoCall = () => {
    setShowVideoChat(true);
  };

  const closeVideoChat = () => {
    setShowVideoChat(false);
  };

  return (
    <>
      <button
        onClick={startMultiUserVideoCall}
        className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded text-sm transition-colors"
        title="Start Multi-User Video Call"
      >
        📹 Multi Video
      </button>

      {showVideoChat && (
        <MultiUserVideoChat onClose={closeVideoChat} />
      )}
    </>
  );
};

export default MultiUserVideoButton;