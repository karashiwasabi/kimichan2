package main

import (
	"fmt"
	"log"

	"kimichan/tools/common"
)

func main() {
	db, err := common.ConnectDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("🗑️ ゴミ捨てロボット（未使用食材の削除）、起動します...")

	// どのレシピにも、どの在庫にも使われていない食材を探して削除
	// (SQLiteは DELETE JOIN が使えないのでサブクエリで)
	query := `
		DELETE FROM item_catalog 
		WHERE id NOT IN (SELECT DISTINCT catalog_id FROM recipe_ingredients) 
		  AND id NOT IN (SELECT DISTINCT catalog_id FROM refrigerator_ingredients)
		  AND id NOT IN (SELECT DISTINCT catalog_id FROM refrigerator_seasonings)
	`

	res, err := db.Exec(query)
	if err != nil {
		log.Fatal("削除エラー:", err)
	}

	count, _ := res.RowsAffected()
	fmt.Printf("✨ スッキリ！ %d 件の未使用食材を削除しました。\n", count)
}
