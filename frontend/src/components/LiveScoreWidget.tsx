import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

interface LiveScoreWidgetProps {
  // Match details
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  matchTime?: string;
  league?: string;
  
  // Score data
  homeScore?: number;
  awayScore?: number;
  matchStatus?: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  matchMinute?: string;
  
  // Widget configuration
  widgetUrl?: string;
  widgetProvider?: 'sofascore' | 'footystats' | 'fctables' | 'livescore' | 'custom' | 'internal';
  showFallback?: boolean;
  height?: number;
  width?: string;
  
  // Display options
  compact?: boolean;
  showHeader?: boolean;
  className?: string;
}

interface WidgetConfig {
  provider: string;
  url: string;
  height: number;
  title: string;
  allowFullscreen?: boolean;
  isExternalLink?: boolean;
}

const LiveScoreWidget: React.FC<LiveScoreWidgetProps> = ({
  homeTeam,
  awayTeam,
  matchDate,
  matchTime,
  league = 'Unknown League',
  homeScore = 0,
  awayScore = 0,
  matchStatus = 'scheduled',
  matchMinute,
  widgetUrl,
  widgetProvider = 'internal',
  showFallback = true,
  height = 400,
  width = '100%',
  compact = false,
  showHeader = true,
  className = ''
}) => {
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showWidget, setShowWidget] = useState(true);

  // Generate widget URLs based on provider
  const generateWidgetUrl = (provider: string): WidgetConfig | null => {
    const matchTitle = `${homeTeam} vs ${awayTeam}`;
    
    switch (provider) {
      case 'sofascore':
        // SofaScore widget URL generation
        // Based on research, SofaScore requires browsing their site to generate embed codes
        // For now, we'll use a placeholder structure and implement proper generation later
        if (widgetUrl && widgetUrl.includes('sofascore')) {
          return {
            provider: 'SofaScore',
            url: widgetUrl,
            height: compact ? 300 : 450,
            title: `${matchTitle} Live Scores - SofaScore`,
            allowFullscreen: false
          };
        }
        break;

      case 'footystats':
        // FootyStats widget URL structure
        // They provide APIs for team/match widgets
        const footyStatsUrl = widgetUrl || 
          `https://footystats.org/api/match?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}&date=${matchDate}`;
        return {
          provider: 'FootyStats',
          url: footyStatsUrl,
          height: compact ? 280 : 420,
          title: `${matchTitle} Live Scores - FootyStats`
        };

      case 'fctables':
        // FCTables widget for live scores
        const fcTablesUrl = widgetUrl || 
          `https://www.fctables.com/widgets/livescore/?league=${encodeURIComponent(league)}&match=${encodeURIComponent(homeTeam)}-${encodeURIComponent(awayTeam)}`;
        return {
          provider: 'FCTables',
          url: fcTablesUrl,
          height: compact ? 250 : 350,
          title: `${matchTitle} Live Scores - FCTables`
        };

      case 'livescore':
        // Generic live score widget
        const liveScoreUrl = widgetUrl || 
          `https://www.live-score-app.com/widgets/match?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`;
        return {
          provider: 'LiveScore',
          url: liveScoreUrl,
          height: compact ? 200 : 300,
          title: `${matchTitle} Live Scores`
        };

      case 'custom':
        if (widgetUrl) {
          // Check if it's a Peacock TV URL
          if (widgetUrl.includes('peacocktv.com')) {
            return {
              provider: 'Peacock TV',
              url: widgetUrl,
              height: compact ? 200 : 300,
              title: `${matchTitle} - Peacock TV Stream`,
              allowFullscreen: false,
              isExternalLink: true // Flag to indicate this should open in new tab
            };
          }
          // Generic custom widget
          return {
            provider: 'Custom Widget',
            url: widgetUrl,
            height: height,
            title: `${matchTitle} Live Stream`
          };
        }
        break;

      case 'internal':
        // Internal score display - no external URL needed
        return {
          provider: 'Live Scores',
          url: 'internal',
          height: compact ? 200 : 300,
          title: `${matchTitle} Live Scores`,
          allowFullscreen: false
        };

      default:
        return null;
    }
    
    return null;
  };

  // Initialize widget configuration
  useEffect(() => {
    setLoading(true);
    setError(null);

    // Try to generate widget configuration
    const config = generateWidgetUrl(widgetProvider);
    
    if (config) {
      setWidgetConfig(config);
    } else if (showFallback) {
      // Try fallback providers in order
      const fallbackProviders = ['footystats', 'fctables', 'livescore'];
      let fallbackConfig = null;
      
      for (const provider of fallbackProviders) {
        fallbackConfig = generateWidgetUrl(provider);
        if (fallbackConfig) break;
      }
      
      if (fallbackConfig) {
        setWidgetConfig(fallbackConfig);
        if (retryCount === 0) {
          toast.success(`Using ${fallbackConfig.provider} widget for live scores`);
        }
      } else {
        setError('No widget provider available');
      }
    } else {
      setError('Widget not available');
    }
    
    setLoading(false);
  }, [widgetProvider, widgetUrl, homeTeam, awayTeam, matchDate, showFallback, retryCount]);

  // Handle iframe load error
  const handleIframeError = () => {
    if (retryCount < 2 && showFallback) {
      setRetryCount(prev => prev + 1);
      setError('Widget failed to load, trying alternative...');
      
      // Try next fallback provider
      const fallbackProviders = ['footystats', 'fctables', 'livescore'];
      const nextProvider = fallbackProviders[retryCount] || 'livescore';
      const fallbackConfig = generateWidgetUrl(nextProvider);
      
      if (fallbackConfig) {
        setWidgetConfig(fallbackConfig);
        setError(null);
      }
    } else {
      setError('Unable to load live score widget');
      toast.error('Live score widget unavailable');
    }
  };

  // Toggle widget visibility
  const toggleWidget = () => {
    setShowWidget(!showWidget);
  };

  if (loading) {
    return (
      <div className={`live-score-widget loading ${className}`}>
        {showHeader && (
          <div className="widget-header flex items-center justify-between p-3 bg-gray-100 dark:bg-dark-700 border-b">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              📊 Live Scores
            </h3>
          </div>
        )}
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading live scores...</span>
        </div>
      </div>
    );
  }

  if (error || !widgetConfig) {
    return (
      <div className={`live-score-widget error ${className}`}>
        {showHeader && (
          <div className="widget-header flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <h3 className="text-sm font-medium text-red-900 dark:text-red-100">
              📊 Live Scores
            </h3>
            <button 
              onClick={() => setRetryCount(0)}
              className="text-xs text-red-600 hover:text-red-800 dark:text-red-400"
            >
              Retry
            </button>
          </div>
        )}
        <div className="flex items-center justify-center p-6 text-center">
          <div className="text-red-600 dark:text-red-400">
            <div className="text-2xl mb-2">⚠️</div>
            <div className="text-sm">{error}</div>
            <div className="text-xs text-gray-500 mt-2">
              {homeTeam} vs {awayTeam}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`live-score-widget ${compact ? 'compact' : ''} ${className} rounded-lg border border-gray-200 dark:border-dark-600 overflow-hidden bg-white dark:bg-dark-800`}>
      {showHeader && (
        <div className="widget-header flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700 border-b border-gray-200 dark:border-dark-600">
          <div className="flex items-center">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              📊 Live Scores
            </h3>
            <span className="ml-2 text-xs text-gray-500 bg-gray-200 dark:bg-dark-600 px-2 py-1 rounded">
              {widgetConfig.provider}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleWidget}
              className="text-xs text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              title={showWidget ? 'Hide widget' : 'Show widget'}
            >
              {showWidget ? '📐' : '📊'}
            </button>
          </div>
        </div>
      )}
      
      {showWidget && (
        <div className="widget-content">
          {widgetConfig.url === 'internal' ? (
            // Internal score display
            <div className="internal-score-widget p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-dark-800 dark:to-dark-700" style={{ height: widgetConfig.height }}>
              <div className="h-full flex flex-col justify-center items-center space-y-6">
                {/* Match Title */}
                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {homeTeam} vs {awayTeam}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {league} • {matchDate}
                  </p>
                </div>

                {/* Score Display */}
                <div className="text-center">
                  {/* Team Names and Score */}
                  <div className="flex items-center justify-center space-x-6 mb-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">{homeTeam}</div>
                      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                        {homeScore}
                      </div>
                    </div>
                    
                    <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">-</div>
                    
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">{awayTeam}</div>
                      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                        {awayScore}
                      </div>
                    </div>
                  </div>
                  
                  {/* Match Status */}
                  <div className="flex items-center justify-center space-x-2">
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {matchTime ? `Kick-off: ${matchTime}` : 'Match Today'}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      matchStatus === 'live' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : matchStatus === 'finished'
                        ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    }`}>
                      {matchStatus === 'live' 
                        ? `LIVE ${matchMinute ? matchMinute + "'" : ''}` 
                        : matchStatus === 'finished'
                        ? 'Full Time'
                        : 'Scheduled'
                      }
                    </span>
                  </div>
                </div>

                {/* Match Stats */}
                <div className="w-full max-w-md">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-white dark:bg-dark-600 rounded-lg p-3">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">0</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Shots</div>
                    </div>
                    <div className="bg-white dark:bg-dark-600 rounded-lg p-3">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">0</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Corners</div>
                    </div>
                    <div className="bg-white dark:bg-dark-600 rounded-lg p-3">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">0</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Cards</div>
                    </div>
                  </div>
                </div>

                {/* Info Message */}
                <div className="text-center max-w-md">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    📊 Live match data and scores are displayed in the channel header above. 
                    Join the discussion to follow the match!
                  </p>
                </div>

                {/* Action Button */}
                <button
                  onClick={toggleWidget}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  View Full Match Details
                </button>
              </div>
            </div>
          ) : widgetConfig.isExternalLink ? (
            // External link widget (for Peacock TV, etc.)
            <div className="external-stream-widget bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6 text-center">
              <div className="mb-4">
                <div className="text-4xl mb-2">📺</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {widgetConfig.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  This stream is available on Peacock TV. Click below to watch the live stream.
                </p>
              </div>
              
              <div className="space-y-3">
                <a
                  href={widgetConfig.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  <span className="mr-2">▶️</span>
                  Watch on Peacock TV
                </a>
                
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Opens in new tab • Requires Peacock TV subscription
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <strong>Match:</strong> {homeTeam} vs {awayTeam}<br/>
                  <strong>League:</strong> {league}<br/>
                  <strong>Date:</strong> {matchDate}
                </div>
              </div>
            </div>
          ) : (
            // External iframe widget
            <iframe
              src={widgetConfig.url}
              width={width}
              height={widgetConfig.height}
              frameBorder="0"
              scrolling="no"
              title={widgetConfig.title}
              className="w-full border-0"
              onError={handleIframeError}
              allowFullScreen={widgetConfig.allowFullscreen}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              loading="lazy"
            />
          )}
        </div>
      )}
      
      {!showWidget && (
        <div className="widget-placeholder p-4 text-center bg-gray-50 dark:bg-dark-800">
          <button
            onClick={toggleWidget}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            {widgetConfig?.isExternalLink ? 'Click to show live stream' : 'Click to show live scores widget'}
          </button>
          <div className="text-xs text-gray-500 mt-1">
            {homeTeam} vs {awayTeam} • {widgetConfig?.provider || 'Live Stream'}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveScoreWidget;