-- Add archival columns to match_channels table
ALTER TABLE match_channels 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster queries on archived status
CREATE INDEX IF NOT EXISTS idx_match_channels_archived ON match_channels(is_archived, match_date);

-- Add index for better performance on channel lookups
CREATE INDEX IF NOT EXISTS idx_match_channels_channel_id ON match_channels(channel_id);

-- Update any existing match channels to not be archived by default
UPDATE match_channels SET is_archived = FALSE WHERE is_archived IS NULL;