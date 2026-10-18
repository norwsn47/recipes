-- Uploaded files (stage B). One row per file; the bytes live in R2 under r2_key.
-- Quotas are computed from SUM(size) over these rows, so there is no separate counter to drift.
-- Why no counter for the global total: rows are bounded by users x 50 recipes x 5 files (about
-- 1,000 for the 3-5 intended users), so the global SUM reads about 1,000 index entries, far under
-- D1's 5 million daily row reads. A counter would add a write per upload and a way to disagree
-- with reality. Revisit only if the user count grows by orders of magnitude.
-- content_type comes from sniffing the file's first bytes, never from the client.
CREATE TABLE recipe_files (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL CHECK (length(original_name) BETWEEN 1 AND 100),
  content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/heic')),
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  created_at INTEGER NOT NULL
);

-- Covering indexes (the column order ends in size) so per-recipe and per-user SUMs and the file
-- count never touch the table. The global SUM scans the smaller of these.
CREATE INDEX idx_recipe_files_recipe ON recipe_files(recipe_id, size);
CREATE INDEX idx_recipe_files_user ON recipe_files(user_id, size);
