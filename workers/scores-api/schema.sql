-- Vernan scores + crashes (D1).
-- Apply: npm run db:migrate   (or db:migrate:local)

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY NOT NULL,
  player_name TEXT NOT NULL,
  seed INTEGER NOT NULL,
  floor_reached INTEGER NOT NULL,
  coins INTEGER NOT NULL,
  enemies_killed INTEGER NOT NULL,
  enemies_kill_difficulty INTEGER NOT NULL DEFAULT 0,
  duration_sec REAL NOT NULL,
  item_ids TEXT NOT NULL DEFAULT '[]',
  client TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (
  floor_reached DESC,
  coins DESC,
  enemies_killed DESC,
  enemies_kill_difficulty DESC,
  created_at ASC
);

CREATE INDEX IF NOT EXISTS idx_scores_user ON scores (user_id)
  WHERE user_id != '';

CREATE TABLE IF NOT EXISTS crashes (
  id TEXT PRIMARY KEY NOT NULL,
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'unknown',
  page_url TEXT NOT NULL DEFAULT '',
  client TEXT NOT NULL DEFAULT '',
  seed INTEGER,
  floor_reached INTEGER,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crashes_created ON crashes (created_at DESC);
