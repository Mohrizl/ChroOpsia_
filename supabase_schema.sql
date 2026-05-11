-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Realtime for these tables
-- Go to Database -> Replication -> select 'supabase_realtime' -> Enable for 'rooms' and 'players'

-- Create Rooms Table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'public', -- 'public' or 'private'
  status TEXT DEFAULT 'waiting', -- 'waiting', 'playing', 'finished'
  game_type TEXT DEFAULT 'color-race',
  host_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  difficulty TEXT, -- 'Easy', 'Medium', 'Hard'
  ready BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_code, name)
);

-- Policies (RLS) - For testing, we can keep it open or simple
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for players" ON players FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime
-- Note: Some Supabase versions require manual enabling in the UI (Database -> Replication)
