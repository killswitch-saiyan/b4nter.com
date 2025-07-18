# YouTube Thumbnail Feature

This feature automatically detects YouTube URLs in messages and displays video thumbnails with click-to-play functionality.

## Features

### ✅ **Automatic Detection**
- Detects YouTube URLs in message content
- Supports multiple YouTube URL formats:
  - `https://www.youtube.com/watch?v=VIDEO_ID`
  - `https://youtu.be/VIDEO_ID`
  - `https://www.youtube.com/embed/VIDEO_ID`
  - `https://www.youtube.com/v/VIDEO_ID`

### ✅ **Thumbnail Display**
- Shows medium-quality thumbnails
- Fallback to default quality if medium fails
- Hover effects with play button
- Click to embed video player

### ✅ **Interactive Features**
- **Click Thumbnail**: Opens embedded video player
- **External Link**: Opens YouTube in new tab
- **Clickable URLs**: All URLs in messages are clickable

### ✅ **Works Everywhere**
- **Channels**: YouTube thumbnails in channel messages
- **Direct Messages**: YouTube thumbnails in DMs
- **Real-time**: Works with new messages and historical messages

## How It Works

### 1. **URL Detection**
```typescript
const youtubeUrls = extractYouTubeUrls(message.content);
```

### 2. **Video ID Extraction**
```typescript
const videoId = extractYouTubeVideoId(url);
```

### 3. **Thumbnail Generation**
```typescript
const thumbnailUrl = getYouTubeThumbnail(videoId, 'medium');
```

### 4. **Embed Player**
```typescript
const embedUrl = getYouTubeEmbedUrl(videoId);
```

## Components

### **YouTubeThumbnail.tsx**
- Displays video thumbnail
- Handles click-to-embed functionality
- Shows external link button
- Responsive design

### **MessageDisplay.tsx**
- Integrates YouTube thumbnails into messages
- Renders clickable URLs
- Maintains existing emoji reaction functionality

### **youtubeUtils.ts**
- URL detection and parsing
- Video ID extraction
- Thumbnail URL generation
- Embed URL generation

## Usage Examples

### **Supported URL Formats**
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/dQw4w9WgXcQ
https://www.youtube.com/embed/dQw4w9WgXcQ
https://www.youtube.com/v/dQw4w9WgXcQ
```

### **Message Examples**
```
"Check out this amazing goal: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
"Here's the highlight: https://youtu.be/abc123def45"
```

## Technical Details

### **Thumbnail Qualities**
- `default`: 120x90px
- `medium`: 320x180px (default)
- `high`: 480x360px
- `maxres`: 1280x720px

### **Performance**
- Lazy loading of thumbnails
- Error handling with fallback images
- Efficient URL regex matching
- Minimal bundle size impact

### **Security**
- External links open in new tabs
- `rel="noopener noreferrer"` for security
- No XSS vulnerabilities
- Safe iframe embedding

## Testing

Run the test file to verify URL detection:
```bash
# The test file includes various YouTube URL formats
frontend/src/utils/youtubeUtils.test.ts
```

## Future Enhancements

### **Potential Features**
- Video duration display
- Video title fetching
- Channel information
- Playlist support
- Timestamp support
- Multiple video formats (Vimeo, etc.)

### **Performance Improvements**
- Thumbnail caching
- Lazy loading optimization
- Bundle size reduction
- CDN integration

## Browser Support

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## Dependencies

- **tweetnacl**: For E2EE (existing)
- **lucide-react**: For icons (existing)
- **No additional dependencies required**

The feature is lightweight and doesn't require any external API calls or additional dependencies beyond what's already in the project. 