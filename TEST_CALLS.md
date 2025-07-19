# Voice and Video Calling Test Guide

## Prerequisites

1. **Two User Accounts**: You need at least two registered users to test calls
2. **Modern Browser**: Chrome, Firefox, Safari, or Edge with WebRTC support
3. **Camera & Microphone**: Both users need camera and microphone access
4. **HTTPS or Localhost**: WebRTC requires secure context (HTTPS or localhost)

## Test Setup

### 1. Start the Backend
```bash
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start the Frontend
```bash
cd frontend
npm run dev
```

### 3. Create Test Users
- Register two different users with different email addresses
- Note down their usernames for testing

## Test Scenarios

### Test 1: Voice Call
1. **User A**: Log in and navigate to a direct message with User B
2. **User A**: Click the "Voice" button in the DM header
3. **User A**: Grant microphone permissions when prompted
4. **User B**: Should see an incoming call notification
5. **User B**: Click "Accept" and grant microphone permissions
6. **Both Users**: Should be connected in a voice call
7. **Test Controls**: Try mute/unmute functionality
8. **End Call**: Click the red phone button to end the call

### Test 2: Video Call
1. **User A**: Log in and navigate to a direct message with User B
2. **User A**: Click the "Video" button in the DM header
3. **User A**: Grant camera and microphone permissions when prompted
4. **User B**: Should see an incoming call notification
5. **User B**: Click "Accept" and grant camera and microphone permissions
6. **Both Users**: Should see each other's video feeds
7. **Test Controls**: 
   - Try mute/unmute functionality
   - Try video toggle (turn camera on/off)
   - Check picture-in-picture local video
8. **End Call**: Click the red phone button to end the call

### Test 3: Call Rejection
1. **User A**: Start a call with User B
2. **User B**: Click "Decline" instead of "Accept"
3. **User A**: Should see the call end immediately
4. **User B**: Should return to normal chat interface

### Test 4: Network Testing
1. **Start a call** between two users
2. **Test Network Changes**:
   - Switch between WiFi and mobile data
   - Temporarily disable network
   - Re-enable network
3. **Expected Behavior**: Call should reconnect automatically or end gracefully

## Expected Behaviors

### ✅ Success Indicators
- **Call Initiation**: Voice/Video buttons appear in DM headers
- **Permissions**: Browser requests camera/microphone access
- **Incoming Call**: Clear notification with Accept/Decline options
- **Connection**: WebRTC connection establishes successfully
- **Audio/Video**: Both users can hear/see each other
- **Controls**: Mute, video toggle, and end call work properly
- **Call End**: Clean disconnection and return to chat

### ❌ Common Issues & Solutions

#### "Could not access camera/microphone"
- **Cause**: Browser permissions denied
- **Solution**: Check browser settings, refresh page, try again

#### "Call not connecting"
- **Cause**: WebRTC connection issues
- **Solution**: Check network, ensure both users are online

#### "No incoming call notification"
- **Cause**: WebSocket connection issues
- **Solution**: Check backend is running, refresh page

#### "Poor call quality"
- **Cause**: Network bandwidth issues
- **Solution**: Close other applications, check internet speed

## Browser Console Logs

### Expected Logs During Call
```
CallControls received message: {type: "call_incoming", ...}
Starting call with video: true
Sending call offer
Handling offer: {...}
WebRTC connection established!
Received remote stream: MediaStream {...}
```

### Debug Information
- Check browser console for WebRTC connection states
- Monitor WebSocket messages for signaling
- Verify STUN server connectivity

## Performance Metrics

### Call Quality
- **Audio Latency**: Should be < 200ms
- **Video Quality**: Should be clear and smooth
- **Connection Time**: Should establish within 5-10 seconds

### Resource Usage
- **CPU**: Moderate increase during video calls
- **Memory**: ~50-100MB additional for video streams
- **Bandwidth**: ~1-2 Mbps for video, ~50-100 Kbps for voice

## Troubleshooting

### If Calls Don't Work
1. **Check Backend Logs**: Look for WebSocket errors
2. **Browser Console**: Check for JavaScript errors
3. **Network**: Ensure STUN servers are accessible
4. **Permissions**: Verify camera/microphone access
5. **HTTPS**: Ensure running on HTTPS or localhost

### Advanced Debugging
1. **WebRTC Stats**: Use `peerConnection.getStats()` for connection info
2. **ICE Candidates**: Monitor ICE candidate exchange
3. **Media Streams**: Check if local/remote streams are created
4. **Signaling**: Verify WebSocket message exchange

## Success Criteria

✅ **Voice calls work** between two users  
✅ **Video calls work** with clear video feeds  
✅ **Call controls function** (mute, video toggle, end)  
✅ **Incoming call notifications** appear correctly  
✅ **Call rejection** works properly  
✅ **Clean disconnection** when calls end  
✅ **No memory leaks** after multiple calls  
✅ **Cross-browser compatibility** (Chrome, Firefox, Safari, Edge)  

## Next Steps

After successful testing:
1. **Performance Optimization**: Implement adaptive bitrate
2. **Group Calls**: Add support for multiple participants
3. **Screen Sharing**: Add screen sharing functionality
4. **Call Recording**: Implement call recording (with consent)
5. **Call History**: Store call logs and statistics 