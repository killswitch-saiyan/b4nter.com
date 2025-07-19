# Voice and Video Calling Feature

## Overview

The chat application now supports voice and video calling between users using WebRTC (Web Real-Time Communication). This feature allows users to make peer-to-peer calls directly from the chat interface.

## Features

### Current Implementation
- **Call Controls UI**: Voice and video call buttons appear in direct message headers
- **WebRTC Signaling**: Backend WebSocket handlers for call signaling
- **Call States**: Incoming call notifications, call acceptance/rejection, and call management

### Planned Features
- **Peer-to-Peer Audio/Video**: Real-time audio and video streaming
- **Call Controls**: Mute, video toggle, and call end functionality
- **Call Quality**: Optimized for different network conditions
- **Group Calls**: Support for multiple participants

## Technical Implementation

### Frontend Components

#### `CallControls.tsx`
- Handles call initiation and UI
- Manages call states (incoming, outgoing, connected)
- WebRTC peer connection management
- Media stream handling (audio/video)

#### Integration in `ChatPage.tsx`
- Call controls appear in DM headers
- Only available for non-blocked users
- Proper state management for call status

### Backend WebSocket Handlers

#### New Message Types
- `call_incoming`: Notify user of incoming call
- `call_accepted`: Handle call acceptance
- `call_rejected`: Handle call rejection
- `call_ended`: Handle call termination
- `webrtc_offer`: WebRTC session description offer
- `webrtc_answer`: WebRTC session description answer
- `webrtc_ice_candidate`: WebRTC ICE candidate exchange

#### WebSocket Manager Updates
- Added handlers for all call-related message types
- Proper user-to-user message routing
- Error handling and logging

## WebRTC Configuration

### STUN Servers
Currently using Google's public STUN servers:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

### Future Enhancements
- TURN server support for NAT traversal
- Custom STUN/TURN server configuration
- Call quality monitoring and adaptation

## Usage

### Making a Call
1. Navigate to a direct message with another user
2. Click the "Voice" or "Video" button in the DM header
3. Grant camera/microphone permissions when prompted
4. Wait for the other user to accept the call

### Receiving a Call
1. When a call comes in, a notification appears
2. Click "Accept" to join the call or "Decline" to reject
3. Grant camera/microphone permissions if needed

### During a Call
- **Mute/Unmute**: Toggle microphone
- **Video Toggle**: Turn camera on/off (video calls only)
- **End Call**: Hang up the call

## Security Considerations

### Media Permissions
- Users must explicitly grant camera/microphone access
- Permissions are requested only when needed
- Clear indication of active media streams

### WebRTC Security
- Peer-to-peer connections are encrypted
- No media data passes through the server
- Signaling data is transmitted via secure WebSocket

## Browser Compatibility

### Supported Browsers
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

### Required Features
- WebRTC API support
- MediaDevices API
- WebSocket support

## Future Roadmap

### Phase 1 (Current)
- ✅ Basic call UI and signaling
- ✅ WebRTC peer connection setup
- 🔄 Audio/video stream handling

### Phase 2
- 📋 Call quality optimization
- 📋 Screen sharing
- 📋 Call recording (with consent)

### Phase 3
- 📋 Group video calls
- 📋 Call scheduling
- 📋 Call history and analytics

## Troubleshooting

### Common Issues

#### "Could not access camera/microphone"
- Check browser permissions
- Ensure no other applications are using the camera/microphone
- Try refreshing the page

#### "Call not connecting"
- Check network connectivity
- Ensure both users are online
- Verify WebSocket connection is active

#### "Poor call quality"
- Check internet connection speed
- Close other bandwidth-intensive applications
- Consider using voice-only calls on slower connections

## Development Notes

### Testing
- Test with multiple browsers
- Test on different network conditions
- Test with various camera/microphone configurations

### Performance
- Monitor WebRTC connection quality
- Implement adaptive bitrate for video
- Optimize for mobile devices

### Accessibility
- Ensure call controls are keyboard accessible
- Provide visual indicators for call states
- Support screen readers for call notifications 