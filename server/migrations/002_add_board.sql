-- Add board column to separate datasets by shareable slug
ALTER TABLE players ADD COLUMN board TEXT NOT NULL DEFAULT 'default';

-- Optional index for queries by board
CREATE INDEX IF NOT EXISTS idx_players_board ON players(board);

