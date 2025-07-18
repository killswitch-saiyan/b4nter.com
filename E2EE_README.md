# End-to-End Encryption (E2EE) for Direct Messages

This implementation adds end-to-end encryption to direct messages in the b4nter chat application. Only direct messages are encrypted; channel messages remain unencrypted for moderation purposes.

## How It Works

### Key Generation
- Each user generates a public/private key pair using the NaCl library
- Private keys are stored securely in the browser's localStorage
- Public keys are stored on the server and shared with other users

### Encryption Process
1. **Sender**: Encrypts message content using recipient's public key
2. **Server**: Stores only encrypted content (cannot read the message)
3. **Recipient**: Decrypts message using their private key

### Security Features
- **Forward Secrecy**: Each message uses a new ephemeral key
- **Perfect Forward Secrecy**: Even if keys are compromised, past messages remain secure
- **Zero-Knowledge**: Server cannot decrypt or read message contents

## Implementation Details

### Frontend
- **Encryption Library**: tweetnacl + tweetnacl-util
- **Key Storage**: localStorage (private keys), server (public keys)
- **Message Processing**: Automatic encryption/decryption for DMs

### Backend
- **Database**: Added `public_key` field to users table
- **API Endpoints**: 
  - `PUT /users/public-key` - Update user's public key
  - `GET /users/{user_id}/public-key` - Get user's public key
- **Message Storage**: Encrypted content stored as JSON string

### Key Files
- `frontend/src/utils/encryption.ts` - Core encryption utilities
- `frontend/src/services/e2eeService.ts` - E2EE service layer
- `frontend/src/contexts/AuthContext.tsx` - Key initialization
- `frontend/src/pages/ChatPage.tsx` - Message encryption/decryption
- `backend/routers/users.py` - Public key management
- `backend/database.py` - Database operations for keys

## Usage

### For Users
1. **Automatic Setup**: Keys are generated automatically on first login
2. **Transparent Encryption**: DMs are encrypted automatically
3. **Visual Indicator**: Lock icon shows when messages are encrypted

### For Developers
1. **Message Sending**: Use `prepareMessageContent()` for DMs
2. **Message Receiving**: Use `processReceivedMessage()` for decryption
3. **Key Management**: Use encryption utilities for key operations

## Security Considerations

### Key Management
- Private keys are stored in localStorage (consider more secure storage for production)
- Public keys are stored on the server (not sensitive)
- Keys are generated per user session

### Limitations
- **Key Loss**: If private key is lost, user cannot decrypt past messages
- **Device Transfer**: Keys don't transfer between devices
- **Group DMs**: Not supported (only 1-on-1 DMs)
- **Message Search**: Cannot search encrypted message content

### Future Improvements
- **Key Backup**: Implement secure key backup/recovery
- **Multi-Device**: Sync keys across user devices
- **Group E2EE**: Extend to group direct messages
- **Key Verification**: Add key verification/fingerprint display

## Testing

1. **Send DM**: Messages should be encrypted automatically
2. **Receive DM**: Messages should be decrypted automatically
3. **Key Generation**: Check browser console for key generation logs
4. **Server Storage**: Verify encrypted content in database

## Troubleshooting

### Common Issues
- **"Failed to encrypt message"**: Check if recipient has a public key
- **"Failed to decrypt message"**: Check if sender's public key is available
- **"Private key not found"**: User may need to re-login to regenerate keys

### Debug Logs
- Check browser console for encryption/decryption logs
- Check backend logs for key management operations
- Verify public key storage in database

## Dependencies

### Frontend
```json
{
  "tweetnacl": "^1.0.3",
  "tweetnacl-util": "^0.15.1"
}
```

### Backend
- No additional dependencies required
- Uses existing FastAPI and Supabase setup 