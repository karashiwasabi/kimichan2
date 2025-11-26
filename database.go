package main

import (
	"database/sql"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

func initDatabase() error {
	const createCatalogSQL = `
	CREATE TABLE IF NOT EXISTS item_catalog (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		kana TEXT,
		classification TEXT NOT NULL,
		category TEXT,
		default_unit TEXT
	);`
	if _, err := db.Exec(createCatalogSQL); err != nil {
		return fmt.Errorf("item_catalog error: %w", err)
	}

	db.Exec("ALTER TABLE item_catalog ADD COLUMN kana TEXT;")

	const createIngredientsSQL = `
	CREATE TABLE IF NOT EXISTS refrigerator_ingredients (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		catalog_id INTEGER NOT NULL,
		amount REAL,
		unit TEXT,
		expiration_date TEXT,
		location TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (catalog_id) REFERENCES item_catalog (id)
	);`
	if _, err := db.Exec(createIngredientsSQL); err != nil {
		return fmt.Errorf("refrigerator_ingredients error: %w", err)
	}
	db.Exec("ALTER TABLE refrigerator_ingredients ADD COLUMN location TEXT;")

	db.Exec("PRAGMA foreign_keys = OFF;")
	db.Exec("CREATE TEMPORARY TABLE temp_table(id, catalog_id, amount, unit, expiration_date, location, created_at, updated_at);")
	db.Exec("INSERT INTO temp_table SELECT id, catalog_id, amount, unit, expiration_date, location, created_at, updated_at FROM refrigerator_ingredients;")
	db.Exec("DROP TABLE refrigerator_ingredients;")
	db.Exec(createIngredientsSQL)
	db.Exec("INSERT INTO refrigerator_ingredients SELECT * FROM temp_table;")
	db.Exec("DROP TABLE temp_table;")
	db.Exec("PRAGMA foreign_keys = ON;")

	const createSeasoningsSQL = `
	CREATE TABLE IF NOT EXISTS refrigerator_seasonings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		catalog_id INTEGER NOT NULL,
		status TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (catalog_id) REFERENCES item_catalog (id)
	);`
	if _, err := db.Exec(createSeasoningsSQL); err != nil {
		return fmt.Errorf("refrigerator_seasonings error: %w", err)
	}

	const createRecipesSQL = `
	CREATE TABLE IF NOT EXISTS recipes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		yield TEXT,
		process TEXT,
		url TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`
	if _, err := db.Exec(createRecipesSQL); err != nil {
		return fmt.Errorf("recipes error: %w", err)
	}
	db.Exec("ALTER TABLE recipes ADD COLUMN yield TEXT;")

	const createRecipeIngredientsSQL = `
	CREATE TABLE IF NOT EXISTS recipe_ingredients (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		recipe_id INTEGER NOT NULL,
		catalog_id INTEGER NOT NULL,
		unit TEXT,
		amount TEXT,
		group_name TEXT,
		FOREIGN KEY (recipe_id) REFERENCES recipes (id),
		FOREIGN KEY (catalog_id) REFERENCES item_catalog (id)
	);`
	if _, err := db.Exec(createRecipeIngredientsSQL); err != nil {
		return fmt.Errorf("recipe_ingredients error: %w", err)
	}

	db.Exec("ALTER TABLE recipe_ingredients ADD COLUMN unit TEXT;")
	db.Exec("ALTER TABLE recipe_ingredients ADD COLUMN group_name TEXT;")

	const createLocationsSQL = `
	CREATE TABLE IF NOT EXISTS locations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		priority INTEGER
	);`
	if _, err := db.Exec(createLocationsSQL); err != nil {
		return fmt.Errorf("locations error: %w", err)
	}

	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM locations").Scan(&count)
	if err == nil && count == 0 {
		defaults := []string{"冷蔵庫", "野菜室", "冷凍庫", "チルド", "常温", "その他"}
		for i, name := range defaults {
			db.Exec("INSERT INTO locations(name, priority) VALUES(?, ?)", name, i+1)
		}
	}

	const createFridgePhotosSQL = `
	CREATE TABLE IF NOT EXISTS fridge_photos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		image_path TEXT NOT NULL,
		location TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`
	if _, err := db.Exec(createFridgePhotosSQL); err != nil {
		return fmt.Errorf("fridge_photos error: %w", err)
	}
	db.Exec("ALTER TABLE fridge_photos ADD COLUMN location TEXT;")

	const updateSeasoningsSQL = `
	UPDATE item_catalog
	SET category = '', default_unit = 'g'
	WHERE classification = '調味料';`
	db.Exec(updateSeasoningsSQL)

	fmt.Println("Database initialized.")
	return nil
}
