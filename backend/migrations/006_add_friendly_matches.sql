-- Migration 006: Add Friendly Matches Support
-- This migration adds support for friendly matches that are not tied to specific leagues

-- Create friendly_matches table
CREATE TABLE IF NOT EXISTS friendly_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    match_date DATE NOT NULL,
    match_time TIME,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    home_team_logo VARCHAR(500),
    away_team_logo VARCHAR(500),
    venue VARCHAR(255),
    match_type VARCHAR(50) DEFAULT 'friendly', -- friendly, international_friendly, club_friendly, etc.
    sportsdb_event_id VARCHAR(100),
    auto_delete_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create friendly_match_scores table for live scoring
CREATE TABLE IF NOT EXISTS friendly_match_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    friendly_match_id UUID NOT NULL REFERENCES friendly_matches(id) ON DELETE CASCADE,
    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,
    match_status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, live, finished, postponed, cancelled
    match_minute VARCHAR(10), -- e.g., '45+2', 'HT', 'FT'
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_friendly_matches_date ON friendly_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_channel ON friendly_matches(channel_id);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_sportsdb ON friendly_matches(sportsdb_event_id);
CREATE INDEX IF NOT EXISTS idx_friendly_match_scores_match_id ON friendly_match_scores(friendly_match_id);
CREATE INDEX IF NOT EXISTS idx_friendly_match_scores_status ON friendly_match_scores(match_status);

-- Add triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_friendly_matches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER friendly_matches_updated_at 
    BEFORE UPDATE ON friendly_matches 
    FOR EACH ROW 
    EXECUTE FUNCTION update_friendly_matches_updated_at();

CREATE OR REPLACE FUNCTION update_friendly_match_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER friendly_match_scores_updated_at 
    BEFORE UPDATE ON friendly_match_scores 
    FOR EACH ROW 
    EXECUTE FUNCTION update_friendly_match_scores_updated_at();

-- Insert some test data for Man United vs Fiorentina (tomorrow's date)
-- Note: This will create a channel automatically through the application logic
INSERT INTO friendly_matches (match_date, match_time, home_team, away_team, match_type, venue) 
VALUES (
    CURRENT_DATE + INTERVAL '1 day', 
    '19:30:00', 
    'Manchester United', 
    'Fiorentina', 
    'club_friendly', 
    'Old Trafford'
) ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE friendly_matches IS 'Stores friendly match information separate from league matches';
COMMENT ON TABLE friendly_match_scores IS 'Stores live scoring data for friendly matches';
COMMENT ON COLUMN friendly_matches.match_type IS 'Type of friendly: friendly, international_friendly, club_friendly, etc.';
COMMENT ON COLUMN friendly_match_scores.match_status IS 'Current status: scheduled, live, finished, postponed, cancelled';
COMMENT ON COLUMN friendly_match_scores.match_minute IS 'Current match minute or phase (45+2, HT, FT, etc.)';