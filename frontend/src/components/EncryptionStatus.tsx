import React from 'react';
import { Lock, Unlock } from 'lucide-react';

interface EncryptionStatusProps {
  isEncrypted: boolean;
  className?: string;
}

const EncryptionStatus: React.FC<EncryptionStatusProps> = ({ isEncrypted, className = '' }) => {
  if (!isEncrypted) return null;
  
  return (
    <div className={`flex items-center text-xs text-gray-500 ${className}`}>
      <Lock className="w-3 h-3 mr-1" />
      <span>End-to-end encrypted</span>
    </div>
  );
};

export default EncryptionStatus; 