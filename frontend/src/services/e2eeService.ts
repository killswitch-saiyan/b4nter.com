import { encryptMessage, decryptMessage, getPrivateKey, getPublicKey } from '../utils/encryption';

export interface EncryptedMessageData {
  encryptedContent: string;
  nonce: string;
}

/**
 * Fetch a user's public key from the server
 */
export async function fetchUserPublicKey(userId: string): Promise<string | null> {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    
    const response = await fetch(`/api/users/${userId}/public-key`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.public_key;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching public key:', error);
    return null;
  }
}

/**
 * Encrypt a message for a specific recipient
 */
export async function encryptMessageForUser(
  message: string,
  recipientId: string,
  senderId: string
): Promise<EncryptedMessageData | null> {
  try {
    // Get recipient's public key
    const recipientPublicKey = await fetchUserPublicKey(recipientId);
    if (!recipientPublicKey) {
      console.error('Could not fetch recipient public key');
      return null;
    }
    
    // Get sender's private key
    const senderPrivateKey = getPrivateKey(senderId);
    if (!senderPrivateKey) {
      console.error('Sender private key not found');
      return null;
    }
    
    // Encrypt the message
    const encrypted = encryptMessage(message, recipientPublicKey, senderPrivateKey);
    return encrypted;
  } catch (error) {
    console.error('Error encrypting message:', error);
    return null;
  }
}

/**
 * Decrypt a message using the recipient's private key
 */
export function decryptMessageForUser(
  encryptedMessage: EncryptedMessageData,
  senderId: string,
  recipientId: string
): string | null {
  try {
    // Get sender's public key (from local storage or server)
    const senderPublicKey = getPublicKey(senderId);
    if (!senderPublicKey) {
      console.error('Sender public key not found');
      return null;
    }
    
    // Get recipient's private key
    const recipientPrivateKey = getPrivateKey(recipientId);
    if (!recipientPrivateKey) {
      console.error('Recipient private key not found');
      return null;
    }
    
    // Decrypt the message
    const decrypted = decryptMessage(encryptedMessage, senderPublicKey, recipientPrivateKey);
    return decrypted;
  } catch (error) {
    console.error('Error decrypting message:', error);
    return null;
  }
}

/**
 * Check if a message should be encrypted (direct message)
 */
export function shouldEncryptMessage(channelId?: string, recipientId?: string): boolean {
  return !channelId && !!recipientId; // Only encrypt DMs, not channel messages
}

/**
 * Prepare message content for sending (encrypt if needed)
 */
export async function prepareMessageContent(
  content: string,
  channelId?: string,
  recipientId?: string,
  senderId?: string
): Promise<{ content: string; is_encrypted: boolean }> {
  if (!shouldEncryptMessage(channelId, recipientId) || !senderId || !recipientId) {
    return { content, is_encrypted: false };
  }
  
  const encrypted = await encryptMessageForUser(content, recipientId, senderId);
  if (!encrypted) {
    console.warn('Failed to encrypt message, sending as plaintext');
    return { content, is_encrypted: false };
  }
  
  // Store encrypted content as JSON string
  const encryptedContent = JSON.stringify(encrypted);
  return { content: encryptedContent, is_encrypted: true };
}

/**
 * Process received message content (decrypt if needed)
 */
export function processReceivedMessage(
  message: any,
  currentUserId: string
): any {
  if (!message.is_encrypted || !message.recipient_id) {
    return message;
  }
  
  try {
    // Parse encrypted content
    const encryptedData: EncryptedMessageData = JSON.parse(message.content);
    
    // Decrypt the message
    const decryptedContent = decryptMessageForUser(
      encryptedData,
      message.sender_id,
      currentUserId
    );
    
    if (decryptedContent) {
      return {
        ...message,
        content: decryptedContent,
        is_encrypted: false
      };
    } else {
      console.error('Failed to decrypt message');
      return {
        ...message,
        content: '[Encrypted message - unable to decrypt]',
        is_encrypted: false
      };
    }
  } catch (error) {
    console.error('Error processing encrypted message:', error);
    return {
      ...message,
      content: '[Encrypted message - error processing]',
      is_encrypted: false
    };
  }
} 