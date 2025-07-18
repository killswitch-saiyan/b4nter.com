-- Add public_key column to users table if it doesn't exist
-- This migration ensures the public_key column exists for E2EE functionality

DO $$ 
BEGIN
    -- Check if the public_key column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'public_key'
    ) THEN
        -- Add the public_key column
        ALTER TABLE users ADD COLUMN public_key TEXT;
        
        -- Add comment for documentation
        COMMENT ON COLUMN users.public_key IS 'Public key for end-to-end encryption (E2EE)';
        
        RAISE NOTICE 'Added public_key column to users table';
    ELSE
        RAISE NOTICE 'public_key column already exists in users table';
    END IF;
END $$; 