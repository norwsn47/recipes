-- Personal favourites: one row per (user, recipe). Times are epoch milliseconds.
-- Both foreign keys cascade: deleting a recipe (D1 enforces foreign keys, as recipe_categories
-- already relies on) removes every user's favourite of it, and deleting a user removes theirs.
CREATE TABLE favourites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, recipe_id)
) WITHOUT ROWID;

-- The primary key already serves "this user's favourites". This one serves the cascade from a
-- recipe delete (find every user's row for one recipe) without a table scan.
CREATE INDEX idx_favourites_recipe_id ON favourites(recipe_id);
