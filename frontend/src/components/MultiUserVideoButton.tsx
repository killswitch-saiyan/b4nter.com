import React, { useState } from 'react';
import MultiUserVideoChat from './MultiUserVideoChat';
import WorkingVideoChat from './WorkingVideoChat';

const MultiUserVideoButton: React.FC = () => {
  const [showVideoChat, setShowVideoChat] = useState(false);
  const [showWorkingVideoChat, setShowWorkingVideoChat] = useState(false);

  const startMultiUserVideoCall = () => {
    setShowVideoChat(true);
  };

  const startWorkingVideoCall = () => {
    setShowWorkingVideoChat(true);
  };

  const closeVideoChat = () => {
    setShowVideoChat(false);
  };

  const closeWorkingVideoChat = () => {
    setShowWorkingVideoChat(false);
  };

  return (
    <>
      <div className="flex space-x-2">
        <button
          onClick={startMultiUserVideoCall}
          className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded text-sm transition-colors"
          title="Current Multi-User Video Call (Broken)"
        >
          📹 Multi Video (Old)
        </button>
        
        <button
          onClick={startWorkingVideoCall}
          className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm transition-colors"
          title="Working Video Call (Based on friend-face-connect)"
        >
          ✅ Working Video
        </button>
      </div>

      {showVideoChat && (
        <MultiUserVideoChat onClose={closeVideoChat} />
      )}
      
      {showWorkingVideoChat && (
        <WorkingVideoChat onClose={closeWorkingVideoChat} />
      )}
    </>
  );
};

export default MultiUserVideoButton;