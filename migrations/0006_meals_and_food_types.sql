-- Replaces the single fixed category list with two tag layers: MEAL (every recipe has at least
-- one) and FOOD TYPE (optional). Same shape as recipe_categories had in 0002: a join table per
-- layer, CHECK for the fixed list, composite primary key (no duplicates), cascade on recipe
-- delete, and an index on the tag column for filtering. Recipes are untouched.
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

-- Meals: Breakfast, Dessert and Baking carry over; the meat and fish categories mean Dinner.
-- "Other" gives no meal. DISTINCT, because Chicken + Fish both map to the one Dinner row.
INSERT INTO recipe_meals (recipe_id, meal)
SELECT DISTINCT recipe_id,
  CASE category WHEN 'Breakfast' THEN 'Breakfast' WHEN 'Dessert' THEN 'Dessert' WHEN 'Baking' THEN 'Baking' ELSE 'Dinner' END
FROM recipe_categories
WHERE category <> 'Other';

-- Anything still without a meal (only "Other", or no categories at all) becomes Dinner.
INSERT INTO recipe_meals (recipe_id, meal)
SELECT id, 'Dinner' FROM recipes WHERE id NOT IN (SELECT recipe_id FROM recipe_meals);

-- Food types: the five old meat and fish categories are kept as they were.
INSERT INTO recipe_food_types (recipe_id, food_type)
SELECT recipe_id, category FROM recipe_categories
WHERE category IN ('Chicken', 'Fish', 'Pork', 'Beef', 'Lamb');

-- Everything is copied; the old table (and its index) goes. "Other" rows go with it.
DROP TABLE recipe_categories;
