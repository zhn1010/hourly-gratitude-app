CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  memory_key TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  fact TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_text TEXT NOT NULL,
  source_message_id INTEGER NOT NULL,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  last_observed_at_utc TEXT NOT NULL,
  UNIQUE (user_id, memory_key)
);

CREATE INDEX IF NOT EXISTS idx_memories_user_updated
  ON memories (user_id, updated_at_utc DESC);
