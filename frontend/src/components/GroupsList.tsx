import React, { useState, useEffect } from 'react';
import { Group, MatchChannel, TodayMatchesResponse } from '../types';
import { toast } from 'react-hot-toast';

interface GroupsListProps {
  selectedChannel: any;
  onChannelSelect: (channel: any) => void;
  onGroupToggle?: (groupId: string, expanded: boolean) => void;
}

const GroupsList: React.FC<GroupsListProps> = ({ 
  selectedChannel, 
  onChannelSelect, 
  onGroupToggle 
}) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupMatches, setGroupMatches] = useState<{ [groupId: string]: MatchChannel[] }>({});
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState<Set<string>>(new Set());

  // Get backend URL from environment variable or default
  const getBackendUrl = () => {
    return import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
  };

  // Fetch all groups on component mount
  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const backendUrl = getBackendUrl();
      
      const response = await fetch(`${backendUrl}/groups/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch groups: ${response.status}`);
      }

      const groupsData: Group[] = await response.json();
      setGroups(groupsData);
      
      // Auto-expand groups that have today's matches
      const hasMatchesToday = new Set<string>();
      for (const group of groupsData) {
        if (group.today_matches_count && group.today_matches_count > 0) {
          hasMatchesToday.add(group.id);
        }
      }
      setExpandedGroups(hasMatchesToday);
      
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast.error('Failed to load soccer leagues');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupMatches = async (groupId: string) => {
    if (groupMatches[groupId] || loadingMatches.has(groupId)) {
      return; // Already loaded or loading
    }

    try {
      setLoadingMatches(prev => new Set(prev).add(groupId));
      const token = localStorage.getItem('access_token');
      const backendUrl = getBackendUrl();
      
      const response = await fetch(`${backendUrl}/groups/${groupId}/matches/today`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch matches: ${response.status}`);
      }

      const data: TodayMatchesResponse = await response.json();
      setGroupMatches(prev => ({
        ...prev,
        [groupId]: data.matches || []
      }));
      
    } catch (error) {
      console.error(`Error fetching matches for group ${groupId}:`, error);
      toast.error('Failed to load matches for league');
    } finally {
      setLoadingMatches(prev => {
        const newSet = new Set(prev);
        newSet.delete(groupId);
        return newSet;
      });
    }
  };

  const toggleGroup = (groupId: string) => {
    const isExpanded = expandedGroups.has(groupId);
    
    if (isExpanded) {
      // Collapse group
      setExpandedGroups(prev => {
        const newSet = new Set(prev);
        newSet.delete(groupId);
        return newSet;
      });
    } else {
      // Expand group and fetch matches
      setExpandedGroups(prev => new Set(prev).add(groupId));
      fetchGroupMatches(groupId);
    }

    // Notify parent component
    if (onGroupToggle) {
      onGroupToggle(groupId, !isExpanded);
    }
  };

  const handleMatchChannelSelect = (match: MatchChannel) => {
    // Convert match channel to channel format expected by parent
    const channelData = {
      id: match.channel_id,
      name: `${match.home_team} vs ${match.away_team}`,
      description: `${match.group_name} match`,
      is_private: false,
      created_by: 'system',
      created_at: match.created_at,
      updated_at: match.updated_at,
      member_count: 0,
      
      // Match-specific data
      is_match_channel: true,
      match_id: match.id,
      group_id: match.group_id,
      group_name: match.group_name,
      home_team: match.home_team,
      away_team: match.away_team,
      home_score: match.home_score,
      away_score: match.away_score,
      match_status: match.match_status,
      match_minute: match.match_minute,
      match_date: match.match_date,
      match_time: match.match_time,
    };
    
    onChannelSelect(channelData);
  };

  const getMatchStatusDisplay = (match: MatchChannel) => {
    switch (match.match_status) {
      case 'live':
        return (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
            {match.match_minute ? `${match.match_minute}'` : 'LIVE'} ⚡
          </span>
        );
      case 'finished':
        return <span className="text-xs text-gray-500">FT</span>;
      case 'scheduled':
        return match.match_time ? (
          <span className="text-xs text-gray-500">{match.match_time.slice(0, 5)}</span>
        ) : null;
      default:
        return null;
    }
  };

  const getScoreDisplay = (match: MatchChannel) => {
    if (match.match_status === 'scheduled') {
      return null; // Don't show scores for scheduled matches
    }
    
    return (
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
        {match.home_score} - {match.away_score}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 dark:text-white">Leagues</h3>
        <div className="text-sm text-gray-500">Loading leagues...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 dark:text-white">Leagues</h3>
      
      {groups.length === 0 ? (
        <div className="text-sm text-gray-500">No leagues available</div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.id} className="space-y-1">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-white dark:hover:bg-dark-600 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-lg">
                    {expandedGroups.has(group.id) ? '▼' : '▶'}
                  </span>
                  <span className="truncate">{group.name}</span>
                  {group.logo_url && (
                    <img 
                      src={group.logo_url} 
                      alt={group.name} 
                      className="w-4 h-4 rounded"
                    />
                  )}
                </div>
                
                {/* Show today's match count if available */}
                {group.today_matches_count && group.today_matches_count > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    {group.today_matches_count}
                  </span>
                )}
              </button>

              {/* Expanded Group - Today's Matches */}
              {expandedGroups.has(group.id) && (
                <div className="ml-6 space-y-1">
                  {loadingMatches.has(group.id) ? (
                    <div className="text-xs text-gray-500 px-3 py-2">
                      Loading matches...
                    </div>
                  ) : groupMatches[group.id]?.length > 0 ? (
                    groupMatches[group.id].map((match) => (
                      <button
                        key={match.id}
                        onClick={() => handleMatchChannelSelect(match)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors border-l-4 ${
                          match.match_status === 'live' 
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                            : match.match_status === 'finished'
                            ? 'border-gray-400 bg-gray-50 dark:bg-gray-800/20'
                            : 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        } ${
                          selectedChannel?.id === match.channel_id
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-dark-600 dark:text-white' 
                            : 'text-gray-700 hover:bg-gray-100 dark:text-white dark:hover:bg-dark-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {match.home_team} vs {match.away_team}
                            </div>
                            <div className="flex items-center space-x-2 mt-1">
                              {getMatchStatusDisplay(match)}
                              {getScoreDisplay(match)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-xs text-gray-500 px-3 py-2">
                      No matches today
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupsList;