-- Track client id to allow owners to update/delete their own entries without admin
ALTER TABLE players ADD COLUMN client_id TEXT;
CREATE INDEX IF NOT EXISTS idx_players_board_client ON players(board, client_id);

