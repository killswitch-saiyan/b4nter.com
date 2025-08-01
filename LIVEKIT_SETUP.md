# LiveKit Video Call Integration

This project now uses LiveKit for video calling instead of custom WebRTC implementation.

## ✅ What's Been Done

1. **Archived old components**: `SimpleVideoCall.tsx` and `NewCallControls.tsx` moved to `archive/` folder
2. **Installed LiveKit**: Added `@livekit/components-react` and `livekit-client` packages
3. **Created LiveKitVideoCall component**: New React component using LiveKit's pre-built UI
4. **Added backend token generation**: `/livekit/token` endpoint for secure token generation
5. **Updated ChatPage**: Now uses `LiveKitVideoCall` component

## 🚧 What You Need to Do

### 1. Set Up LiveKit Cloud

1. Go to [LiveKit Cloud](https://cloud.livekit.io/) and create an account
2. Create a new project
3. Get your API Key and API Secret from the project settings

### 2. Configure Environment Variables

Add these to your `.env` file in the `backend/` directory:

```env
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here  
LIVEKIT_URL=wss://your-project-name.livekit.cloud
```

**Important:** Make sure your `.env` file is in the `backend/` directory, not the root directory.

### 3. Alternative: Self-Hosted LiveKit Server

If you prefer to self-host:

```bash
# Using Docker
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="test: secret" \
  livekit/livekit-server:latest \
  --config /etc/livekit.yaml
```

Then set:
```env
LIVEKIT_API_KEY=test
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880
```

## 🎯 How It Works

1. **User clicks "Video Call"** button in DM or call channel
2. **Frontend requests token** from `/livekit/token` endpoint
3. **Backend generates JWT token** with room permissions
4. **LiveKit room opens** with video conference UI
5. **Both users join same room** (room name based on sorted user IDs)

## 🔧 Room Naming Convention

Rooms are named using sorted user IDs: `user1-id_user2-id`
This ensures both users always join the same room regardless of who starts the call.

## 📱 Features

- ✅ Video and audio calling
- ✅ Screen sharing
- ✅ Built-in chat
- ✅ Participant management
- ✅ Mobile responsive
- ✅ Connection quality indicators
- ✅ Automatic device selection

## 🎨 Customization

The `LiveKitVideoCall` component uses LiveKit's built-in styling. You can customize:

- Room options (resolution, adaptive streaming, etc.)
- UI components (hide/show chat, controls, etc.)
- Custom CSS overrides for styling

The component automatically includes all necessary styles. No additional CSS imports needed.

See LiveKit docs: https://docs.livekit.io/home/

## 🔒 Security

- JWT tokens are generated server-side with user authentication
- Tokens include specific room permissions
- Rooms are automatically cleaned up when empty
- No WebRTC signaling complexity - LiveKit handles it all

## 🐛 Troubleshooting

**Error: "Failed to get LiveKit token"**
1. Check the config endpoint: `GET /livekit/config-check` (no auth required)
2. Verify your `.env` file is in the `backend/` directory
3. Restart the backend server after adding env vars
4. Check backend logs for detailed error messages

**Error: "LiveKit not configured properly"**
- Make sure `.env` variables are named exactly: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`
- No quotes needed around the values in `.env`
- Ensure no extra spaces in the `.env` file

**Connection issues:**
- Verify your LiveKit server URL is correct (starts with `wss://`)
- Check firewall settings for WebRTC ports
- Test with LiveKit's example app first

**Token errors:**
- Ensure user is authenticated (JWT token in localStorage)
- Check backend logs for token generation errors
- Verify API keys are correct in LiveKit Cloud dashboard