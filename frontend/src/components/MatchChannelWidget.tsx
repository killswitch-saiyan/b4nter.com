import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import LiveScoreWidget from './LiveScoreWidget';

interface MatchData {
  // Basic match info
  match_id?: string;
  friendly_id?: string;
  group_name?: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  match_status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  match_minute?: string;
  match_date: string;
  match_time?: string;
  venue?: string;
  league?: string;
  
  // Widget-specific data
  widget_url?: string;
  widget_provider?: 'sofascore' | 'footystats' | 'fctables' | 'livescore';
  widget_enabled?: boolean;
  sofascore_match_id?: string;
  external_match_ids?: Record<string, any>;
  
  // Channel info
  is_match_channel?: boolean;
  is_friendly_channel?: boolean;
  last_updated?: string;
}

interface MatchChannelWidgetProps {
  matchData: MatchData;
  showWidget?: boolean;
  showHeader?: boolean;
  compact?: boolean;
  className?: string;
  onScoreUpdate?: (scores: any) => void;
}

const MatchChannelWidget: React.FC<MatchChannelWidgetProps> = ({
  matchData,
  showWidget = true,
  showHeader = true,
  compact = false,
  className = '',
  onScoreUpdate
}) => {
  const [widgetEnabled, setWidgetEnabled] = useState(matchData.widget_enabled !== false);
  const [currentScores, setCurrentScores] = useState({
    home_score: matchData.home_score,
    away_score: matchData.away_score,
    match_status: matchData.match_status,
    match_minute: matchData.match_minute,
  });

  // Get backend URL from environment variable or default
  const getBackendUrl = () => {
    return import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
  };

  // Update scores when matchData changes
  useEffect(() => {
    setCurrentScores({
      home_score: matchData.home_score,
      away_score: matchData.away_score,
      match_status: matchData.match_status,
      match_minute: matchData.match_minute,
    });
  }, [matchData]);

  // Update widget settings
  const updateWidgetSettings = async (enabled: boolean) => {
    try {
      const token = localStorage.getItem('access_token');
      const backendUrl = getBackendUrl();
      
      const endpoint = matchData.is_friendly_channel 
        ? `/widgets/friendly/${matchData.friendly_id}/widget`
        : `/widgets/match/${matchData.match_id}/widget`;
      
      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          widget_enabled: enabled
        })
      });

      if (response.ok) {
        setWidgetEnabled(enabled);
        toast.success(`Widget ${enabled ? 'enabled' : 'disabled'}`);
      } else {
        throw new Error('Failed to update widget settings');
      }
    } catch (error) {
      console.error('Error updating widget settings:', error);
      toast.error('Failed to update widget settings');
    }
  };

  // Generate match display text
  const getMatchStatusText = () => {
    switch (currentScores.match_status) {
      case 'live':
        return currentScores.match_minute ? `${currentScores.match_minute}'` : 'LIVE';
      case 'finished':
        return 'Full Time';
      case 'postponed':
        return 'Postponed';
      case 'cancelled':
        return 'Cancelled';
      case 'scheduled':
        return matchData.match_time ? `${matchData.match_time.slice(0, 5)}` : 'Scheduled';
      default:
        return 'Unknown';
    }
  };

  const getMatchStatusColor = () => {
    switch (currentScores.match_status) {
      case 'live':
        return 'text-green-600 dark:text-green-400';
      case 'finished':
        return 'text-gray-600 dark:text-gray-400';
      case 'postponed':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'cancelled':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-blue-600 dark:text-blue-400';
    }
  };

  const showScores = currentScores.match_status !== 'scheduled';

  return (
    <div className={`match-channel-widget ${className}`}>
      {/* Live Score Header */}
      {showHeader && (
        <div className="live-score-header bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-600 p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {/* Match Title */}
              <div className="flex items-center space-x-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {matchData.home_team} vs {matchData.away_team}
                </h2>
                <span className={`text-sm font-medium px-2 py-1 rounded-full ${getMatchStatusColor()} bg-opacity-10`}>
                  {getMatchStatusText()}
                </span>
              </div>
              
              {/* Match Details */}
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                {matchData.group_name && (
                  <span className="flex items-center">
                    🏆 {matchData.group_name}
                  </span>
                )}
                {matchData.venue && (
                  <span className="flex items-center">
                    📍 {matchData.venue}
                  </span>
                )}
                <span>📅 {matchData.match_date}</span>
                {matchData.last_updated && (
                  <span className="text-xs">
                    Updated: {new Date(matchData.last_updated).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            
            {/* Live Scores */}
            {showScores && (
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {currentScores.home_score} - {currentScores.away_score}
                </div>
                {currentScores.match_status === 'live' && (
                  <div className="text-sm text-green-600 dark:text-green-400 font-medium flex items-center justify-end mt-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    LIVE
                  </div>
                )}
              </div>
            )}
            
            {/* Widget Controls */}
            <div className="ml-4 flex items-center space-x-2">
              <button
                onClick={() => updateWidgetSettings(!widgetEnabled)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  widgetEnabled
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                }`}
                title={widgetEnabled ? 'Disable live widget' : 'Enable live widget'}
              >
                {widgetEnabled ? '📊 Widget ON' : '📊 Widget OFF'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Live Score Widget */}
      {showWidget && widgetEnabled && (
        <div className="widget-container">
          <LiveScoreWidget
            homeTeam={matchData.home_team}
            awayTeam={matchData.away_team}
            matchDate={matchData.match_date}
            matchTime={matchData.match_time}
            league={matchData.group_name || matchData.league}
            widgetUrl={matchData.widget_url}
            widgetProvider={matchData.widget_provider}
            showFallback={true}
            height={compact ? 280 : 400}
            width="100%"
            compact={compact}
            showHeader={false} // We show our own header above
            className="border-0"
          />
        </div>
      )}
      
      {/* Widget Disabled State */}
      {showWidget && !widgetEnabled && (
        <div className="widget-disabled p-8 text-center bg-gray-50 dark:bg-dark-800 border-b border-gray-200 dark:border-dark-600">
          <div className="text-gray-500 dark:text-gray-400">
            <div className="text-2xl mb-2">📊</div>
            <p className="text-sm">Live score widget is disabled</p>
            <button
              onClick={() => updateWidgetSettings(true)}
              className="mt-2 px-3 py-1 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
            >
              Enable Widget
            </button>
          </div>
        </div>
      )}
      
      {/* Fallback Message if No Widget Available */}
      {showWidget && widgetEnabled && !matchData.widget_url && !matchData.widget_provider && (
        <div className="widget-unavailable p-6 text-center bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="text-yellow-700 dark:text-yellow-400">
            <div className="text-xl mb-2">⚠️</div>
            <p className="text-sm">Live widget not available for this match</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
              Using basic score display instead
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchChannelWidget;