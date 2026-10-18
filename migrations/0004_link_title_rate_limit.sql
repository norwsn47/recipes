-- Link-title lookup rate limit: same shape as write_rate_limits, a separate counter per user.
CREATE TABLE link_title_rate_limits (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
