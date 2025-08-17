export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  public_key?: string;  // Add public key for E2EE
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  is_private: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  // Call channel properties
  is_call_channel?: boolean;
  call_type?: 'voice' | 'video';
  call_participants?: string[];
  call_started_at?: string;
  call_ended_at?: string;
  // Match channel properties
  is_match_channel?: boolean;
  match_id?: string;
  home_team?: string;
  away_team?: string;
  home_score?: number;
  away_score?: number;
  match_status?: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  match_minute?: string;
  match_date?: string;
  match_time?: string;
  group_id?: string;
  group_name?: string;
  group_description?: string;
  widget_url?: string;
  widget_provider?: 'sofascore' | 'footystats' | 'fctables' | 'livescore' | 'custom';
  widget_enabled?: boolean;
}

export interface MessageReaction {
  emoji: string;
  user_id: string;
}

export interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  channel_id?: string;
  recipient_id?: string;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
  reactions?: MessageReaction[];
  is_encrypted?: boolean;  // Add flag to indicate if message is encrypted
  image_url?: string;      // Add image_url for image/meme sharing
}

export interface ChannelMember {
  user_id: string;
  channel_id: string;
  role: 'user' | 'admin';
  joined_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

export interface CreateChannelData {
  name: string;
  description?: string;
  is_private?: boolean;
}

export interface CreateMessageData {
  content: string;
  channel_id?: string;
  recipient_id?: string;
}

export interface SocketEvent {
  event: string;
  data: any;
}

// Groups and Soccer Leagues Types
export interface Group {
  id: string;
  name: string;
  description?: string;
  league_id?: string;
  logo_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  today_matches_count?: number;
}

export interface MatchChannel extends Channel {
  // Match channel specific fields
  group_id: string;
  group_name: string;
  match_date: string;
  home_team: string;
  away_team: string;
  match_time?: string;
  sportsdb_event_id?: string;
  auto_delete_at?: string;
  
  // Live score data
  home_score: number;
  away_score: number;
  match_status: 'scheduled' | 'live' | 'finished';
  match_minute?: string;
  last_updated?: string;
  
  // Channel metadata
  is_match_channel: boolean;
  
  // Widget data
  widget_url?: string;
  widget_provider?: 'sofascore' | 'footystats' | 'fctables' | 'livescore' | 'custom';
  widget_enabled?: boolean;
  sofascore_match_id?: string;
  external_match_ids?: Record<string, any>;
}

export interface LiveScoreUpdate {
  type: 'live_score_update';
  match_id: string;
  channel_id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  match_status: 'scheduled' | 'live' | 'finished';
  match_minute?: string;
  last_updated: string;
}

export interface GroupWithMatches extends Group {
  matches: MatchChannel[];
}

// API Response types
export interface TodayMatchesResponse {
  group: Group;
  matches: MatchChannel[];
}

export interface LiveScoresResponse {
  live_matches: MatchChannel[];
  last_updated: string;
}

export interface MatchSyncResult {
  message: string;
  synced_matches: number;
  errors: string[];
}

// Friendly Match types
export interface FriendlyMatch {
  id: string;
  channel_id: string;
  match_date: string; // YYYY-MM-DD format
  match_time?: string; // HH:MM:SS format
  home_team: string;
  away_team: string;
  home_team_logo?: string;
  away_team_logo?: string;
  venue?: string;
  match_type: 'friendly' | 'club_friendly' | 'international_friendly' | 'pre-season' | 'testimonial' | 'charity_match';
  sportsdb_event_id?: string;
  auto_delete_at?: string;
  created_at: string;
  updated_at: string;
  
  // Live score data (from friendly_match_scores table)
  home_score: number;
  away_score: number;
  match_status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  match_minute?: string;
  last_updated?: string;
  
  // Widget data
  widget_url?: string;
  widget_provider?: 'sofascore' | 'footystats' | 'fctables' | 'livescore' | 'custom';
  widget_enabled?: boolean;
  sofascore_match_id?: string;
  external_match_ids?: Record<string, any>;
}

export interface FriendlyMatchChannel extends Channel {
  // Friendly-specific channel properties
  is_friendly_channel: boolean;
  friendly_id: string;
  home_team: string;
  away_team: string;
  home_team_logo?: string;
  away_team_logo?: string;
  venue?: string;
  match_type: string;
  match_date: string;
  match_time?: string;
  
  // Live score data
  home_score: number;
  away_score: number;
  match_status: string;
  match_minute?: string;
}

export interface FriendlyScoreData {
  home_score: number;
  away_score: number;
  match_status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  match_minute?: string;
}

export interface FriendlySyncResult {
  synced_count: number;
  created_channels: string[];
  errors: string[];
  updated_count: number;
  found?: boolean;
} 