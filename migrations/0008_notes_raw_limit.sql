-- Rich-text notes: the notes CHECK on recipes moves from length(notes) <= 2000 to <= 8000. The
-- 2,000 visible-character limit stays in the API; 8,000 is the cap on the stored string with its
-- markup. SQLite cannot alter a CHECK in place, so recipes is rebuilt. Nothing else changes.
--
-- Why not the usual create-new, copy, drop-old, rename: DROP TABLE recipes with foreign keys on
-- runs an implicit DELETE, and ON DELETE CASCADE would wipe every child row (D1 enforces foreign
-- keys, and PRAGMA foreign_keys cannot be changed inside its migration transaction). Renaming
-- can also leave child tables pointing at a renamed table. So instead every child table is
-- emptied first (copied aside, dropped), recipes is rebuilt under its final name, and the
-- children are recreated exactly as before and refilled. Children are leaf tables, so dropping
-- them cascades nowhere, and each foreign key still names "recipes" throughout.

-- 1. Copy aside. These plain tables have no foreign keys, so nothing here can cascade.
CREATE TABLE tmp_recipes AS SELECT * FROM recipes;
CREATE TABLE tmp_recipe_files AS SELECT * FROM recipe_files;
CREATE TABLE tmp_favourites AS SELECT * FROM favourites;
CREATE TABLE tmp_recipe_meals AS SELECT * FROM recipe_meals;
CREATE TABLE tmp_recipe_food_types AS SELECT * FROM recipe_food_types;
CREATE TABLE tmp_recipe_views AS SELECT * FROM recipe_views;

-- 2. Drop the children (their indexes go with them), then recipes (its indexes go with it).
DROP TABLE recipe_files;
DROP TABLE favourites;
DROP TABLE recipe_meals;
DROP TABLE recipe_food_types;
DROP TABLE recipe_views;
DROP TABLE recipes;

-- 3. recipes as in 0002, with the notes limit raised.
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  time_tag TEXT NOT NULL CHECK (time_tag IN ('Less than 30 mins', 'Around 1 hr', 'Extensive prep')),
  link TEXT CHECK (link IS NULL OR length(link) <= 2000),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 8000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX idx_recipes_user_id ON recipes(user_id);

INSERT INTO recipes (id, user_id, title, time_tag, link, notes, created_at, updated_at)
SELECT id, user_id, title, time_tag, link, notes, created_at, updated_at FROM tmp_recipes;

-- 4. Children, exactly as in 0003, 0005, 0006 and 0007.
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
CREATE INDEX idx_recipe_files_recipe ON recipe_files(recipe_id, size);
CREATE INDEX idx_recipe_files_user ON recipe_files(user_id, size);

CREATE TABLE favourites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, recipe_id)
) WITHOUT ROWID;
CREATE INDEX idx_favourites_recipe_id ON favourites(recipe_id);

CREATE TABLE recipe_meals (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  meal TEXT NOT NULL CHECK (meal IN ('Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Baking')),
  PRIMARY KEY (recipe_id, meal)
) WITHOUT ROWID;
CREATE INDEX idx_recipe_meals_meal ON recipe_meals(meal);

CREATE TABLE recipe_food_types (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_type TEXT NOT NULL CHECK (food_type IN ('Chicken', 'Fish', 'Pork', 'Beef', 'Lamb', 'Vegetarian')),
  PRIMARY KEY (recipe_id, food_type)
) WITHOUT ROWID;
CREATE INDEX idx_recipe_food_types_food_type ON recipe_food_types(food_type);

CREATE TABLE recipe_views (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, recipe_id)
) WITHOUT ROWID;
CREATE INDEX idx_recipe_views_recipe_id ON recipe_views(recipe_id);

-- 5. Refill the children (explicit columns), then remove the copies.
INSERT INTO recipe_files (id, recipe_id, user_id, r2_key, original_name, content_type, size, created_at)
SELECT id, recipe_id, user_id, r2_key, original_name, content_type, size, created_at FROM tmp_recipe_files;
INSERT INTO favourites (user_id, recipe_id, created_at)
SELECT user_id, recipe_id, created_at FROM tmp_favourites;
INSERT INTO recipe_meals (recipe_id, meal) SELECT recipe_id, meal FROM tmp_recipe_meals;
INSERT INTO recipe_food_types (recipe_id, food_type) SELECT recipe_id, food_type FROM tmp_recipe_food_types;
INSERT INTO recipe_views (user_id, recipe_id, viewed_at)
SELECT user_id, recipe_id, viewed_at FROM tmp_recipe_views;

DROP TABLE tmp_recipe_files;
DROP TABLE tmp_favourites;
DROP TABLE tmp_recipe_meals;
DROP TABLE tmp_recipe_food_types;
DROP TABLE tmp_recipe_views;
DROP TABLE tmp_recipes;
