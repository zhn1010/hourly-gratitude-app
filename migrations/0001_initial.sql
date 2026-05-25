CREATE TABLE IF NOT EXISTS processed_updates (
  update_id INTEGER PRIMARY KEY,
  processed_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gratitude_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_update_id INTEGER NOT NULL,
  telegram_message_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  received_at_utc TEXT NOT NULL,
  local_date TEXT NOT NULL,
  local_hour INTEGER NOT NULL,
  reaction_emoji TEXT,
  created_at_utc TEXT NOT NULL,
  UNIQUE (chat_id, telegram_message_id)
);

CREATE INDEX IF NOT EXISTS idx_gratitude_entries_day_hour
  ON gratitude_entries (local_date, local_hour);

CREATE TABLE IF NOT EXISTS nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_date TEXT NOT NULL,
  local_hour INTEGER NOT NULL,
  local_minute INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  message_text TEXT NOT NULL,
  telegram_message_id INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at_utc TEXT NOT NULL,
  UNIQUE (local_date, local_hour, local_minute, chat_id)
);

CREATE TABLE IF NOT EXISTS daily_posters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_date TEXT NOT NULL,
  chat_id INTEGER NOT NULL,
  summary TEXT NOT NULL,
  image_prompt TEXT NOT NULL,
  r2_key TEXT,
  telegram_message_id INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at_utc TEXT NOT NULL,
  UNIQUE (local_date, chat_id)
);
