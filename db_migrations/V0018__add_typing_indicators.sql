CREATE TABLE IF NOT EXISTS typing_indicators (
  user_id INTEGER NOT NULL,
  username VARCHAR(50) NOT NULL,
  channel VARCHAR(100),
  dm_with INTEGER,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_typing_channel ON typing_indicators(channel, updated_at);
CREATE INDEX IF NOT EXISTS idx_typing_dm ON typing_indicators(dm_with, updated_at);
