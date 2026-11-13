-- StatSnipes Live Player Score Distribution Database Schema
-- Cloudflare D1 Database (SQLite)

CREATE TABLE IF NOT EXISTS daily_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,          -- YYYY-MM-DD (e.g. '2026-11-13')
  sport TEXT NOT NULL,         -- 'NBA', 'NFL', 'MLB'
  submode TEXT NOT NULL,       -- 'sniper', 'target'
  score INTEGER NOT NULL,      -- Final score or points
  target_goal INTEGER,        -- Target goal (e.g. 5000) for Target Stat mode
  busted INTEGER DEFAULT 0,    -- 1 if busted, 0 otherwise
  client_id TEXT,              -- Anonymous client token to prevent ballot stuffing
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_lookup ON daily_scores (date, sport, submode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_daily_submission ON daily_scores (date, sport, submode, client_id);
