package main

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"kimichan/tools/common"
)

func main() {
	// DB接続
	db, err := common.ConnectDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("🌱 マスタデータ取込ツール、起動します...")

	// CSVファイルのパス
	wd, _ := os.Getwd()
	csvPath := filepath.Join(wd, "seeds", "master_data.csv")
	// ルート以外から実行された場合用
	if _, err := os.Stat(csvPath); os.IsNotExist(err) {
		csvPath = filepath.Join(wd, "..", "..", "seeds", "master_data.csv")
	}

	file, err := os.Open(csvPath)
	if err != nil {
		log.Fatalf("❌ CSVファイルが見つかりません: %s", csvPath)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	// ヘッダーをスキップ
	_, _ = reader.Read()

	records, err := reader.ReadAll()
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("📦 %d 件のマスタデータを処理します。\n", len(records))

	tx, err := db.Begin()
	if err != nil {
		log.Fatal(err)
	}

	updated := 0
	inserted := 0

	for _, record := range records {
		name := record[0]
		classification := record[1]
		category := record[2]

		// 既存チェック
		var id int
		err := tx.QueryRow("SELECT id FROM item_catalog WHERE name = ?", name).Scan(&id)

		if err == sql.ErrNoRows {
			// 新規登録
			_, err = tx.Exec("INSERT INTO item_catalog(name, classification, category, default_unit) VALUES(?, ?, ?, '')",
				name, classification, category)
			if err != nil {
				log.Println("登録エラー:", err)
				continue
			}
			inserted++
		} else {
			// 既存あり -> 正しい分類・カテゴリで上書き（修正）
			_, err = tx.Exec("UPDATE item_catalog SET classification = ?, category = ? WHERE id = ?",
				classification, category, id)
			if err != nil {
				log.Println("更新エラー:", err)
				continue
			}
			updated++
		}
	}

	tx.Commit()
	fmt.Printf("✨ 完了しました！ (新規: %d 件 / 更新: %d 件)\n", inserted, updated)
}
