-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    password_hash VARCHAR(255),
    public_key TEXT,  -- Add public key for E2EE
    auth_provider VARCHAR(20) DEFAULT 'email',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create channels table
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_private BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create channel_members table
CREATE TABLE IF NOT EXISTS channel_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, channel_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT, -- Add image_url for image/meme sharing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure message is either to channel or user, not both
    CONSTRAINT message_target_check CHECK (
        (channel_id IS NOT NULL AND recipient_id IS NULL) OR
        (channel_id IS NULL AND recipient_id IS NOT NULL)
    )
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON channels(created_by);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can read their own data and other users' public data
CREATE POLICY "Users can view their own data" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can view other users' public data" ON users
    FOR SELECT USING (true);

-- Users can update their own data
CREATE POLICY "Users can update their own data" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Channel policies
CREATE POLICY "Users can view channels they are members of" ON channels
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM channel_members 
            WHERE channel_id = channels.id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Channel creators can update their channels" ON channels
    FOR UPDATE USING (created_by = auth.uid());

-- Channel members policies
CREATE POLICY "Users can view channel members" ON channel_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM channel_members cm
            WHERE cm.channel_id = channel_members.channel_id AND cm.user_id = auth.uid()
        )
    );

-- Messages policies
CREATE POLICY "Users can view channel messages" ON messages
    FOR SELECT USING (
        channel_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM channel_members 
            WHERE channel_id = messages.channel_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view direct messages" ON messages
    FOR SELECT USING (
        recipient_id = auth.uid() OR sender_id = auth.uid()
    );

CREATE POLICY "Users can create messages" ON messages
    FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Insert some sample data for testing
INSERT INTO users (username, email, full_name, password_hash, auth_provider) VALUES
    ('admin', 'admin@b4nter.com', 'Admin User', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK2.', 'email'),
    ('user1', 'user1@b4nter.com', 'John Doe', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK2.', 'email'),
    ('user2', 'user2@b4nter.com', 'Jane Smith', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK2.', 'email')
ON CONFLICT (email) DO NOTHING;

-- Insert sample channels
INSERT INTO channels (name, description, created_by) VALUES
    ('general', 'General soccer discussion', (SELECT id FROM users WHERE username = 'admin')),
    ('premier-league', 'Premier League discussions', (SELECT id FROM users WHERE username = 'admin')),
    ('champions-league', 'Champions League discussions', (SELECT id FROM users WHERE username = 'user1'))
ON CONFLICT DO NOTHING;

-- Insert sample channel members
INSERT INTO channel_members (user_id, channel_id, role) VALUES
    ((SELECT id FROM users WHERE username = 'admin'), (SELECT id FROM channels WHERE name = 'general'), 'admin'),
    ((SELECT id FROM users WHERE username = 'user1'), (SELECT id FROM channels WHERE name = 'general'), 'user'),
    ((SELECT id FROM users WHERE username = 'user2'), (SELECT id FROM channels WHERE name = 'general'), 'user'),
    ((SELECT id FROM users WHERE username = 'admin'), (SELECT id FROM channels WHERE name = 'premier-league'), 'admin'),
    ((SELECT id FROM users WHERE username = 'user1'), (SELECT id FROM channels WHERE name = 'premier-league'), 'user'),
    ((SELECT id FROM users WHERE username = 'user1'), (SELECT id FROM channels WHERE name = 'champions-league'), 'admin'),
    ((SELECT id FROM users WHERE username = 'user2'), (SELECT id FROM channels WHERE name = 'champions-league'), 'user')
ON CONFLICT DO NOTHING;

-- Insert sample messages
INSERT INTO messages (content, sender_id, channel_id) VALUES
    ('Welcome to B4nter!', (SELECT id FROM users WHERE username = 'admin'), (SELECT id FROM channels WHERE name = 'general')),
    ('Great to be here!', (SELECT id FROM users WHERE username = 'user1'), (SELECT id FROM channels WHERE name = 'general')),
    ('Who do you think will win the Premier League this season?', (SELECT id FROM users WHERE username = 'user2'), (SELECT id FROM channels WHERE name = 'premier-league'))
ON CONFLICT DO NOTHING; 