import React, { useState, useEffect } from 'react';
import { MatchChannel, LiveScoreUpdate } from '../types';

interface LiveScoreHeaderProps {
  matchData: {
    match_id?: string;
    group_name: string;
    home_team: string;
    away_team: string;
    home_score: number;
    away_score: number;
    match_status: 'scheduled' | 'live' | 'finished';
    match_minute?: string;
    match_date: string;
    match_time?: string;
    last_updated?: string;
  };
  onScoreUpdate?: (scores: LiveScoreUpdate) => void;
}

const LiveScoreHeader: React.FC<LiveScoreHeaderProps> = ({ 
  matchData, 
  onScoreUpdate 
}) => {
  const [currentScores, setCurrentScores] = useState({
    home_score: matchData.home_score,
    away_score: matchData.away_score,
    match_status: matchData.match_status,
    match_minute: matchData.match_minute,
  });

  // Update scores when props change
  useEffect(() => {
    setCurrentScores({
      home_score: matchData.home_score,
      away_score: matchData.away_score,
      match_status: matchData.match_status,
      match_minute: matchData.match_minute,
    });
  }, [matchData.home_score, matchData.away_score, matchData.match_status, matchData.match_minute]);

  // Listen for WebSocket score updates
  useEffect(() => {
    const handleScoreUpdate = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'live_score_update' && data.match_id === matchData.match_id) {
          const newScores = {
            home_score: data.home_score,
            away_score: data.away_score,
            match_status: data.match_status,
            match_minute: data.match_minute,
          };
          
          setCurrentScores(newScores);
          
          // Notify parent component
          if (onScoreUpdate) {
            onScoreUpdate(data);
          }
        }
      } catch (error) {
        // Ignore parsing errors
      }
    };

    // Listen to WebSocket messages
    const ws = (window as any).wsRef?.current;
    if (ws) {
      ws.addEventListener('message', handleScoreUpdate);
      return () => ws.removeEventListener('message', handleScoreUpdate);
    }
  }, [matchData.match_id, onScoreUpdate]);

  const getStatusDisplay = () => {
    switch (currentScores.match_status) {
      case 'live':
        return (
          <div className="flex items-center space-x-2">
            <span className="text-green-600 dark:text-green-400 font-bold">
              {currentScores.match_minute ? `${currentScores.match_minute}'` : 'LIVE'}
            </span>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          </div>
        );
      case 'finished':
        return <span className="text-gray-600 dark:text-gray-400 font-medium">Full Time</span>;
      case 'scheduled':
        return (
          <span className="text-gray-600 dark:text-gray-400">
            {matchData.match_time ? 
              `Kickoff: ${matchData.match_time.slice(0, 5)}` : 
              'Scheduled'
            }
          </span>
        );
      default:
        return null;
    }
  };

  const getMatchIcon = () => {
    switch (currentScores.match_status) {
      case 'live':
        return '⚽';
      case 'finished':
        return '🏆';
      case 'scheduled':
        return '📅';
      default:
        return '⚽';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 border-b dark:from-green-700 dark:to-green-800">
      <div className="flex items-center justify-between">
        {/* League Info */}
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{getMatchIcon()}</span>
          <div>
            <h2 className="text-lg font-bold">{matchData.group_name}</h2>
            <p className="text-sm text-green-100">
              {formatDate(matchData.match_date)}
            </p>
          </div>
        </div>

        {/* Match Status */}
        <div className="text-center">
          {getStatusDisplay()}
        </div>
      </div>

      {/* Teams and Score */}
      <div className="mt-4 flex items-center justify-center">
        <div className="flex items-center space-x-8">
          {/* Home Team */}
          <div className="text-center flex-1">
            <div className="text-xl font-bold truncate max-w-32">
              {matchData.home_team}
            </div>
            <div className="text-sm text-green-100">Home</div>
          </div>

          {/* Score */}
          <div className="text-center">
            {currentScores.match_status !== 'scheduled' ? (
              <div className="text-4xl font-bold">
                <span className="mx-2">{currentScores.home_score}</span>
                <span className="text-green-200">-</span>
                <span className="mx-2">{currentScores.away_score}</span>
              </div>
            ) : (
              <div className="text-2xl text-green-200">
                VS
              </div>
            )}
          </div>

          {/* Away Team */}
          <div className="text-center flex-1">
            <div className="text-xl font-bold truncate max-w-32">
              {matchData.away_team}
            </div>
            <div className="text-sm text-green-100">Away</div>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      {matchData.last_updated && currentScores.match_status === 'live' && (
        <div className="mt-3 text-center">
          <span className="text-xs text-green-200">
            Last updated: {new Date(matchData.last_updated).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
};

export default LiveScoreHeader;