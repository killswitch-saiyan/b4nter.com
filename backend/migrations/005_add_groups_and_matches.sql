-- Migration 005: Add Groups and Match Channels for Soccer Leagues Feature
-- This migration adds tables for soccer leagues (groups), match channels, and live score tracking

-- Groups/Leagues table - represents soccer leagues like "English Premier League"
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL UNIQUE, -- "English Premier League", "Bundesliga", etc.
    description TEXT,
    league_id VARCHAR UNIQUE, -- SportsDB league ID (e.g., "4328" for EPL)
    logo_url VARCHAR, -- URL to league logo/badge
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Match channels tracking - connects channels to specific soccer matches
CREATE TABLE IF NOT EXISTS match_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    match_date DATE NOT NULL,
    home_team VARCHAR NOT NULL,
    away_team VARCHAR NOT NULL,
    match_time TIME,
    sportsdb_event_id VARCHAR UNIQUE, -- SportsDB match/event ID for API calls
    auto_delete_at TIMESTAMP, -- When to auto-delete channel (2 hours after match end)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Live match data cache - stores current match scores and status
CREATE TABLE IF NOT EXISTS live_match_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_channel_id UUID REFERENCES match_channels(id) ON DELETE CASCADE UNIQUE,
    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,
    match_status VARCHAR DEFAULT 'scheduled', -- 'scheduled', 'live', 'finished'
    match_minute VARCHAR, -- Current minute like "45+2", "HT", "FT"
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_groups_league_id ON groups(league_id);
CREATE INDEX IF NOT EXISTS idx_groups_active ON groups(is_active);
CREATE INDEX IF NOT EXISTS idx_match_channels_date ON match_channels(match_date);
CREATE INDEX IF NOT EXISTS idx_match_channels_group ON match_channels(group_id);
CREATE INDEX IF NOT EXISTS idx_match_channels_auto_delete ON match_channels(auto_delete_at);
CREATE INDEX IF NOT EXISTS idx_live_match_data_status ON live_match_data(match_status);

-- Insert default soccer leagues
INSERT INTO groups (name, description, league_id, logo_url) VALUES
('English Premier League', 'The top tier of English football', '4328', NULL),
('Bundesliga', 'The top tier of German football', '4331', NULL),
('La Liga', 'The top tier of Spanish football', '4335', NULL),
('Serie A', 'The top tier of Italian football', '4332', NULL),
('Ligue 1', 'The top tier of French football', '4334', NULL)
ON CONFLICT (name) DO NOTHING;