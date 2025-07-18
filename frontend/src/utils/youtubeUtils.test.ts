import { extractYouTubeVideoId, isYouTubeUrl, extractYouTubeUrls } from './youtubeUtils';

// Test cases for YouTube URL detection
const testCases = [
  {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    expectedId: 'dQw4w9WgXcQ',
    description: 'Standard YouTube watch URL'
  },
  {
    url: 'https://youtu.be/dQw4w9WgXcQ',
    expectedId: 'dQw4w9WgXcQ',
    description: 'YouTube short URL'
  },
  {
    url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    expectedId: 'dQw4w9WgXcQ',
    description: 'YouTube embed URL'
  },
  {
    url: 'https://www.youtube.com/v/dQw4w9WgXcQ',
    expectedId: 'dQw4w9WgXcQ',
    description: 'YouTube v URL'
  },
  {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
    expectedId: 'dQw4w9WgXcQ',
    description: 'YouTube URL with timestamp'
  },
  {
    url: 'https://example.com/not-youtube',
    expectedId: null,
    description: 'Non-YouTube URL'
  }
];

// Run tests
console.log('Testing YouTube URL detection...');

testCases.forEach(({ url, expectedId, description }) => {
  const actualId = extractYouTubeVideoId(url);
  const isYouTube = isYouTubeUrl(url);
  
  console.log(`\n${description}:`);
  console.log(`  URL: ${url}`);
  console.log(`  Expected ID: ${expectedId}`);
  console.log(`  Actual ID: ${actualId}`);
  console.log(`  Is YouTube: ${isYouTube}`);
  console.log(`  ✅ ${actualId === expectedId ? 'PASS' : 'FAIL'}`);
});

// Test URL extraction from text
const testMessage = "Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ and this one: https://youtu.be/abc123def45";
const extractedUrls = extractYouTubeUrls(testMessage);
console.log(`\nURL extraction test:`);
console.log(`  Message: ${testMessage}`);
console.log(`  Extracted URLs: ${extractedUrls.join(', ')}`);
console.log(`  ✅ ${extractedUrls.length === 2 ? 'PASS' : 'FAIL'}`); 