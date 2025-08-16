-- Migration 007: Add Widget Support for Live Score Embeds
-- This migration adds support for live score widgets (SofaScore, FootyStats, etc.) in match channels

-- Add widget columns to match_channels table
ALTER TABLE match_channels 
ADD COLUMN IF NOT EXISTS widget_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS widget_provider VARCHAR(50) DEFAULT 'sofascore',
ADD COLUMN IF NOT EXISTS widget_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sofascore_match_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS external_match_ids JSONB DEFAULT '{}'; -- Store multiple external IDs

-- Add widget columns to friendly_matches table
ALTER TABLE friendly_matches 
ADD COLUMN IF NOT EXISTS widget_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS widget_provider VARCHAR(50) DEFAULT 'sofascore',
ADD COLUMN IF NOT EXISTS widget_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sofascore_match_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS external_match_ids JSONB DEFAULT '{}'; -- Store multiple external IDs

-- Create table for team name mappings (to handle different naming conventions)
CREATE TABLE IF NOT EXISTS team_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name VARCHAR(255) NOT NULL, -- Our standard team name
    provider VARCHAR(50) NOT NULL, -- 'sofascore', 'footystats', etc.
    provider_name VARCHAR(255) NOT NULL, -- Team name as used by the provider
    provider_id VARCHAR(100), -- Team ID in the provider's system
    confidence_score DECIMAL(3,2) DEFAULT 1.0, -- How confident we are in this mapping (0.0-1.0)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique mapping per provider
    UNIQUE(canonical_name, provider),
    UNIQUE(provider, provider_id)
);

-- Create table for widget configurations and fallback options
CREATE TABLE IF NOT EXISTS widget_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE, -- 'default', 'compact', 'mobile', etc.
    provider_priority TEXT[] DEFAULT ARRAY['sofascore', 'footystats', 'fctables', 'livescore'], -- Fallback order
    default_height INTEGER DEFAULT 400,
    compact_height INTEGER DEFAULT 280,
    mobile_height INTEGER DEFAULT 250,
    settings JSONB DEFAULT '{}', -- Provider-specific settings
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_channels_widget_provider ON match_channels(widget_provider);
CREATE INDEX IF NOT EXISTS idx_match_channels_sofascore_id ON match_channels(sofascore_match_id);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_widget_provider ON friendly_matches(widget_provider);
CREATE INDEX IF NOT EXISTS idx_friendly_matches_sofascore_id ON friendly_matches(sofascore_match_id);
CREATE INDEX IF NOT EXISTS idx_team_mappings_canonical ON team_mappings(canonical_name);
CREATE INDEX IF NOT EXISTS idx_team_mappings_provider ON team_mappings(provider, provider_name);
CREATE INDEX IF NOT EXISTS idx_widget_configurations_active ON widget_configurations(is_active);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_team_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER team_mappings_updated_at 
    BEFORE UPDATE ON team_mappings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_team_mappings_updated_at();

CREATE OR REPLACE FUNCTION update_widget_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER widget_configurations_updated_at 
    BEFORE UPDATE ON widget_configurations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_widget_configurations_updated_at();

-- Insert default widget configuration
INSERT INTO widget_configurations (name, provider_priority, default_height, compact_height, mobile_height, settings) 
VALUES (
    'default',
    ARRAY['sofascore', 'footystats', 'fctables', 'livescore'],
    400,
    280,
    250,
    '{
        "sofascore": {
            "theme": "light",
            "showHeader": true,
            "autoUpdate": true
        },
        "footystats": {
            "showStats": true,
            "showLineups": false
        },
        "fctables": {
            "showTable": false,
            "liveOnly": true
        },
        "livescore": {
            "minimal": false
        }
    }'
) ON CONFLICT (name) DO NOTHING;

-- Insert some common team name mappings for major clubs
-- These are examples - you'd expand this based on actual provider data
INSERT INTO team_mappings (canonical_name, provider, provider_name, provider_id, confidence_score) VALUES
-- Manchester United mappings
('Manchester United', 'sofascore', 'Manchester United', 'man-utd', 1.0),
('Manchester United', 'footystats', 'Manchester United', '35', 1.0),
('Manchester United', 'fctables', 'Man United', 'manutd', 0.9),

-- Chelsea mappings
('Chelsea', 'sofascore', 'Chelsea', 'chelsea', 1.0),
('Chelsea', 'footystats', 'Chelsea FC', '38', 1.0),
('Chelsea', 'fctables', 'Chelsea', 'chelsea', 1.0),

-- Arsenal mappings
('Arsenal', 'sofascore', 'Arsenal', 'arsenal', 1.0),
('Arsenal', 'footystats', 'Arsenal FC', '42', 1.0),
('Arsenal', 'fctables', 'Arsenal', 'arsenal', 1.0),

-- Liverpool mappings
('Liverpool', 'sofascore', 'Liverpool', 'liverpool', 1.0),
('Liverpool', 'footystats', 'Liverpool FC', '40', 1.0),
('Liverpool', 'fctables', 'Liverpool', 'liverpool', 1.0),

-- Manchester City mappings
('Manchester City', 'sofascore', 'Manchester City', 'man-city', 1.0),
('Manchester City', 'footystats', 'Manchester City', '43', 1.0),
('Manchester City', 'fctables', 'Man City', 'mancity', 0.9),

-- Tottenham mappings
('Tottenham', 'sofascore', 'Tottenham', 'tottenham', 1.0),
('Tottenham', 'footystats', 'Tottenham Hotspur', '47', 1.0),
('Tottenham', 'fctables', 'Spurs', 'spurs', 0.8),

-- Fiorentina mappings (for friendly test)
('Fiorentina', 'sofascore', 'Fiorentina', 'fiorentina', 1.0),
('Fiorentina', 'footystats', 'ACF Fiorentina', '99', 1.0),
('Fiorentina', 'fctables', 'Fiorentina', 'fiorentina', 1.0)

ON CONFLICT (canonical_name, provider) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE team_mappings IS 'Maps team names between our system and external widget providers';
COMMENT ON TABLE widget_configurations IS 'Stores widget configuration profiles and fallback settings';
COMMENT ON COLUMN match_channels.widget_url IS 'Direct URL to embedded widget iframe';
COMMENT ON COLUMN match_channels.widget_provider IS 'Which provider to use: sofascore, footystats, fctables, livescore';
COMMENT ON COLUMN match_channels.sofascore_match_id IS 'SofaScore-specific match identifier';
COMMENT ON COLUMN match_channels.external_match_ids IS 'JSON object storing IDs for multiple providers';
COMMENT ON COLUMN team_mappings.confidence_score IS 'How confident we are in this team name mapping (0.0-1.0)';
COMMENT ON COLUMN widget_configurations.provider_priority IS 'Array of providers in fallback order';