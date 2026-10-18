-- Recipes (stage A: no files table yet; stage B adds it). Times are epoch milliseconds.
-- Deleting a user removes their recipes (owner moderation by hand), consistent with sessions.
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  time_tag TEXT NOT NULL CHECK (time_tag IN ('Less than 30 mins', 'Around 1 hr', 'Extensive prep')),
  link TEXT CHECK (link IS NULL OR length(link) <= 2000),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Newest-first list ordering, and the per-user count / ownership lookups.
CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX idx_recipes_user_id ON recipes(user_id);

-- Categories live in a join table (one row per recipe+category) rather than a JSON or bitmask
-- column: the database itself enforces the fixed list (CHECK) and uniqueness (primary key, so
-- duplicates are impossible), "any of these categories" is a plain indexed EXISTS, and the rows
-- vanish with the recipe (ON DELETE CASCADE). Volumes are tiny, so the extra rows cost nothing.
CREATE TABLE recipe_categories (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN
    ('Breakfast', 'Chicken', 'Fish', 'Pork', 'Beef', 'Lamb', 'Dessert', 'Baking', 'Other')),
  PRIMARY KEY (recipe_id, category)
) WITHOUT ROWID;

CREATE INDEX idx_recipe_categories_category ON recipe_categories(category);

-- Write rate limit: one row per user holding a fixed one-minute window and its count.
CREATE TABLE write_rate_limits (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
