import nacl from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedMessage {
  encryptedContent: string;
  nonce: string;
}

/**
 * Generate a new key pair for a user
 */
export function generateKeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey)
  };
}

/**
 * Encrypt a message for a specific recipient
 */
export function encryptMessage(
  message: string,
  recipientPublicKey: string,
  senderPrivateKey: string
): EncryptedMessage {
  const ephemeralKeyPair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  const encrypted = nacl.box(
    decodeUTF8(message),
    nonce,
    decodeBase64(recipientPublicKey),
    ephemeralKeyPair.secretKey
  );
  
  // Combine ephemeral public key with encrypted data
  const combined = new Uint8Array(ephemeralKeyPair.publicKey.length + encrypted.length);
  combined.set(ephemeralKeyPair.publicKey);
  combined.set(encrypted, ephemeralKeyPair.publicKey.length);
  
  return {
    encryptedContent: encodeBase64(combined),
    nonce: encodeBase64(nonce)
  };
}

/**
 * Decrypt a message using the recipient's private key
 */
export function decryptMessage(
  encryptedMessage: EncryptedMessage,
  senderPublicKey: string,
  recipientPrivateKey: string
): string {
  const combined = decodeBase64(encryptedMessage.encryptedContent);
  const nonce = decodeBase64(encryptedMessage.nonce);
  
  // Extract ephemeral public key and encrypted data
  const ephemeralPublicKey = combined.slice(0, nacl.box.publicKeyLength);
  const encrypted = combined.slice(nacl.box.publicKeyLength);
  
  const decrypted = nacl.box.open(
    encrypted,
    nonce,
    ephemeralPublicKey,
    decodeBase64(recipientPrivateKey)
  );
  
  if (!decrypted) {
    throw new Error('Failed to decrypt message');
  }
  
  return encodeUTF8(decrypted);
}

/**
 * Store user's private key securely in localStorage
 */
export function storePrivateKey(userId: string, privateKey: string): void {
  localStorage.setItem(`e2ee_private_key_${userId}`, privateKey);
}

/**
 * Retrieve user's private key from localStorage
 */
export function getPrivateKey(userId: string): string | null {
  return localStorage.getItem(`e2ee_private_key_${userId}`);
}

/**
 * Store user's public key (can be stored on server)
 */
export function storePublicKey(userId: string, publicKey: string): void {
  localStorage.setItem(`e2ee_public_key_${userId}`, publicKey);
}

/**
 * Retrieve user's public key from localStorage
 */
export function getPublicKey(userId: string): string | null {
  return localStorage.getItem(`e2ee_public_key_${userId}`);
}

/**
 * Check if a user has encryption keys set up
 */
export function hasEncryptionKeys(userId: string): boolean {
  return !!(getPrivateKey(userId) && getPublicKey(userId));
}

/**
 * Initialize encryption keys for a user if they don't exist
 */
export function initializeEncryptionKeys(userId: string): KeyPair {
  const existingPrivateKey = getPrivateKey(userId);
  const existingPublicKey = getPublicKey(userId);
  
  if (existingPrivateKey && existingPublicKey) {
    return {
      publicKey: existingPublicKey,
      privateKey: existingPrivateKey
    };
  }
  
  const keyPair = generateKeyPair();
  storePrivateKey(userId, keyPair.privateKey);
  storePublicKey(userId, keyPair.publicKey);
  
  return keyPair;
} 