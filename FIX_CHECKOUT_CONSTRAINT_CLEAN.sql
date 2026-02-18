UPDATE quick_match_lobbies SET status = 'closed' WHERE status IS NULL OR status = '' OR status NOT IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed');

ALTER TABLE quick_match_lobbies DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

ALTER TABLE quick_match_lobbies ADD CONSTRAINT quick_match_lobbies_status_check CHECK (status IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed'));
