# Video Call Setup Guide

## 🎥 WebRTC Video Calling Integration

The LiveKit components have been archived and replaced with a custom WebRTC video calling solution based on the working GitHub project. Here's how to set it up:

## 📦 Components Created

### Frontend Components
- `VideoCallButton.tsx` - Main video call button with invitation handling
- `VideoChat.tsx` - Full-screen video call interface
- `IncomingCallModal.tsx` - Modal for accepting/rejecting calls
- `useSFUConnection.ts` - WebRTC connection hook

### Backend
- WebSocket handlers for video call invitations in `websocket_manager.py`
- WebRTC signaling integrated into existing chat WebSocket

## 🚀 Setup Instructions

### 1. Start Your Backend
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start Your Frontend
```bash
cd frontend
npm run dev
```

## 🎯 How It Works

### Call Flow:
1. **User A clicks "📹 Video Call" button** → Sends invitation via existing WebSocket
2. **User B gets incoming call modal** → Can Accept or Reject
3. **If accepted** → Both users connect to the same WebRTC room via frontend peer-to-peer signaling
4. **Video call begins** → Real-time video/audio communication

### Architecture:
- **Chat WebSocket** (port 8000) - Handles call invitations/responses AND WebRTC signaling
- **Frontend SFU Logic** - Manages WebRTC rooms and participant coordination in the browser
- **WebRTC** - Direct peer-to-peer video/audio streams

## 🔧 Features

✅ **Call Invitations** - Ring and accept/reject system
✅ **Video Calling** - Real-time video communication  
✅ **Audio Controls** - Mute/unmute microphone
✅ **Video Controls** - Enable/disable camera
✅ **Call Management** - End calls, handle disconnections
✅ **Room-based** - Multiple participants support (future)
✅ **Responsive UI** - Works on desktop and mobile

## 🧪 Testing

1. Open two browser tabs (or different users)
2. Navigate to different DM conversations
3. Click "📹 Video Call" on one tab
4. Accept the call on the other tab
5. Enjoy video calling! 🎉

## 🚨 Troubleshooting

**Call not connecting?**
- Check if backend WebSocket server is running on port 8000
- Check browser console for WebRTC errors
- Ensure camera/microphone permissions are granted

**Can't see video?**
- Check camera permissions in browser
- Try refreshing and granting permissions again
- Check browser developer tools for errors

**No incoming call notification?**
- Ensure both users are connected to WebSocket
- Check backend logs for WebSocket message delivery
- Verify user IDs match between caller and target

## 📁 Archived Components

All LiveKit components have been moved to:
- `frontend/src/components/archive/livekit/`
- `backend/archive/livekit/`

## 🎊 Ready to Go!

The video calling system is now fully integrated with your existing chat application using the working WebRTC implementation. Users can make video calls directly from DM conversations with proper invitation flow and real-time communication.