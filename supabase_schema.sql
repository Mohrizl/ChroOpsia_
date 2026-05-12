-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Rooms Table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'public', -- 'public' or 'private'
  status TEXT DEFAULT 'waiting', -- 'waiting', 'playing', 'finished'
  game_type TEXT DEFAULT 'color-race',
  host_name TEXT NOT NULL,
  time_limit INTEGER DEFAULT 15,
  num_questions INTEGER DEFAULT 14,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Players Table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code TEXT REFERENCES rooms(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  current_question INTEGER DEFAULT 1,
  finished BOOLEAN DEFAULT FALSE,
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  is_bot BOOLEAN DEFAULT FALSE,
  difficulty TEXT, -- 'Skilled', 'Fast', etc.
  ready BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_code, name)
);

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();

-- Policies (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for players" ON players FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime (Crucial for multiplayer!)
-- IMPORTANT: You must also enable this in the Supabase Dashboard:
-- Database -> Replication -> supabase_realtime -> Enable for 'rooms' and 'players'
