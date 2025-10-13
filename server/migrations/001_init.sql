-- Create players table
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  timezone TEXT NOT NULL,
  availability TEXT NOT NULL, -- JSON
  notes TEXT,
  created_at INTEGER NOT NULL
);

