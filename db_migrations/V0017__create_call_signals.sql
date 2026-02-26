CREATE TABLE IF NOT EXISTS t_p75051746_data_analytics_initi.call_signals (
  id SERIAL PRIMARY KEY,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL,
  payload TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_signals_to ON t_p75051746_data_analytics_initi.call_signals(to_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_call_signals_from ON t_p75051746_data_analytics_initi.call_signals(from_user_id, created_at);
