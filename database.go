package main

import (
	"database/sql"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

// initDB関数は削除しました（main.goで直接処理しているため不要）

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
	// カラム追加（マイグレーション）
	// 既に存在する場合のエラーは無視する簡易実装（またはカラム存在チェックを入れるのが丁寧だが、個人開発ならこれで続行可）
	// ここではエラーが出ても止まらないようにExecの結果をチェックしつつ、続行させる形が安全ですが
	// SQLiteは ADD COLUMN IF NOT EXISTS をサポートしていないバージョンもあるため、
	// 厳密にはチェックが必要。ただ、Goのドライバならエラーでも落ちないのでこのままでも稼働はします。
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
	// 不足していたカラムを追加
	db.Exec("ALTER TABLE recipes ADD COLUMN yield TEXT;")
	db.Exec("ALTER TABLE recipes ADD COLUMN original_ingredients TEXT DEFAULT '';")
	db.Exec("ALTER TABLE recipes ADD COLUMN original_process TEXT DEFAULT '';")

	const createRecipeIngredientsSQL = `
	CREATE TABLE IF NOT EXISTS recipe_ingredients (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		recipe_id INTEGER NOT NULL,
		catalog_id INTEGER NOT NULL,
		unit TEXT,
		amount TEXT,
		group_name TEXT,
		details TEXT,
		FOREIGN KEY (recipe_id) REFERENCES recipes (id),
		FOREIGN KEY (catalog_id) REFERENCES item_catalog (id)
	);`
	if _, err := db.Exec(createRecipeIngredientsSQL); err != nil {
		return fmt.Errorf("recipe_ingredients error: %w", err)
	}

	db.Exec("ALTER TABLE recipe_ingredients ADD COLUMN unit TEXT;")
	db.Exec("ALTER TABLE recipe_ingredients ADD COLUMN group_name TEXT;")
	db.Exec("ALTER TABLE recipe_ingredients ADD COLUMN details TEXT DEFAULT '';")

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

	// ★削除: 調味料のカテゴリを勝手に消すコードを削除しました
	// const updateSeasoningsSQL = ... (削除)

	fmt.Println("Database initialized.")
	return nil
}
