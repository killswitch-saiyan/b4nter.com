import React, { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import { extractYouTubeVideoId, getYouTubeThumbnail, getYouTubeEmbedUrl } from '../utils/youtubeUtils';

interface YouTubeThumbnailProps {
  url: string;
  className?: string;
}

const YouTubeThumbnail: React.FC<YouTubeThumbnailProps> = ({ url, className = '' }) => {
  const [showEmbed, setShowEmbed] = useState(false);
  const videoId = extractYouTubeVideoId(url);
  
  if (!videoId) {
    return null;
  }

  const thumbnailUrl = getYouTubeThumbnail(videoId, 'medium');
  const embedUrl = getYouTubeEmbedUrl(videoId);

  if (showEmbed) {
    return (
      <div className={`rounded-lg overflow-hidden bg-black ${className}`}>
        <iframe
          src={embedUrl}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-64"
        />
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer shadow-sm ${className}`}>
      <div className="relative group" onClick={() => setShowEmbed(true)}>
        <img
          src={thumbnailUrl}
          alt="YouTube video thumbnail"
          className="w-full h-32 object-cover"
          onError={(e) => {
            // Fallback to default thumbnail if the medium quality fails
            const target = e.target as HTMLImageElement;
            target.src = getYouTubeThumbnail(videoId, 'default');
          }}
        />
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
          <div className="bg-red-600 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg">
            <Play className="w-4 h-4 text-white fill-current" />
          </div>
        </div>
      </div>
      <div className="p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600 font-medium">YouTube Video</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default YouTubeThumbnail; 