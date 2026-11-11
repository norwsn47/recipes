-- Recently viewed: one row per (user, recipe), holding the last time that user opened the recipe.
-- Times are epoch milliseconds. Both foreign keys cascade, as in favourites: deleting a recipe
-- removes every user's view of it, and deleting a user removes theirs.
CREATE TABLE recipe_views (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, recipe_id)
) WITHOUT ROWID;

-- The primary key already serves "this user's view of one recipe" (the list's viewedAt lookup).
-- This one serves the cascade from a recipe delete without a table scan.
CREATE INDEX idx_recipe_views_recipe_id ON recipe_views(recipe_id);
