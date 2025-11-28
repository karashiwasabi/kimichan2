package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kimichan/tools/common"
)

type MasterCleanResult struct {
	RealName       string `json:"real_name"`
	Kana           string `json:"kana"`
	Classification string `json:"classification"`
	Category       string `json:"category"`
	Details        string `json:"details"`
}

type MasterRecord struct {
	Classification string
	Category       string
}

func main() {
	wd, _ := os.Getwd()
	cfg, err := common.LoadConfig()
	if err != nil {
		log.Fatal(err)
	}

	db, err := common.ConnectDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("🧹 スーパーお掃除ロボット (カテゴリ厳守版)、起動します...")

	// 1. マスタCSV読み込み & カテゴリリスト作成
	masterMap := make(map[string]MasterRecord)
	// 重複しないカテゴリリストを作るためのセット
	categorySet := make(map[string]bool)
	categorySet["その他"] = true // デフォルトで入れておく

	csvPath := filepath.Join(wd, "seeds", "master_data.csv")
	if _, err := os.Stat(csvPath); os.IsNotExist(err) {
		csvPath = filepath.Join(wd, "..", "..", "seeds", "master_data.csv")
	}
	file, err := os.Open(csvPath)
	if err == nil {
		reader := csv.NewReader(file)
		_, _ = reader.Read()
		records, _ := reader.ReadAll()
		for _, r := range records {
			masterMap[r[0]] = MasterRecord{Classification: r[1], Category: r[2]}
			if r[2] != "" {
				categorySet[r[2]] = true
			}
		}
		file.Close()
		fmt.Printf("📚 マスタデータ %d 件を読み込みました。\n", len(masterMap))
	}

	// カテゴリリストを文字列化（AIへの指示用）
	var validCategories []string
	for cat := range categorySet {
		validCategories = append(validCategories, cat)
	}
	validCategoriesStr := strings.Join(validCategories, ", ")
	fmt.Printf("📋 有効カテゴリ: [%s]\n", validCategoriesStr)

	// 2. DBチェック
	rows, err := db.Query("SELECT id, name, kana, classification, category FROM item_catalog")
	if err != nil {
		log.Fatal(err)
	}

	type Target struct {
		ID   int
		Name string
		Kana string
		Cls  string
		Cat  string
	}
	var targets []Target
	for rows.Next() {
		var t Target
		var k sql.NullString
		rows.Scan(&t.ID, &t.Name, &k, &t.Cls, &t.Cat)
		t.Kana = k.String
		targets = append(targets, t)
	}
	rows.Close()

	fmt.Printf("📦 全 %d 件の食材を検査します。\n", len(targets))

	for i, t := range targets {
		// マスタ一致チェック
		master, inMaster := masterMap[t.Name]

		if inMaster && t.Cls == master.Classification && t.Cat == master.Category && t.Kana != "" {
			continue
		}

		fmt.Printf("[%d/%d] 補完中: %s ... ", i+1, len(targets), t.Name)

		// ★修正: AIに有効カテゴリリストを渡す
		res, err := askGeminiMaster(t.Name, validCategoriesStr, cfg.GeminiApiKey)
		if err != nil {
			fmt.Printf("❌ AIエラー: %v\n", err)
			continue
		}

		// マスタ優先（ハイブリッド）
		if inMaster {
			res.Classification = master.Classification
			res.Category = master.Category
			res.RealName = t.Name
		}

		// 変更があるかチェック
		needsUpdate := false
		if res.RealName != t.Name {
			needsUpdate = true
		}
		if t.Cls == "" && res.Classification != "" {
			needsUpdate = true
		}
		// カテゴリが変わるか、または今のカテゴリが無効なもの（リストにない）だった場合も更新
		if (t.Cat == "" && res.Category != "") || (t.Cat != res.Category) {
			needsUpdate = true
		}
		if t.Kana == "" && res.Kana != "" {
			needsUpdate = true
		}
		if res.Details != "" {
			needsUpdate = true
		} // 詳細が分離されたら更新必須

		if !needsUpdate {
			fmt.Println("🆗 変更なし")
			continue
		}

		fmt.Printf("\n    👉 修正: [%s(%s)] 分類:%s / カテゴリ:%s\n",
			res.RealName, res.Kana, res.Classification, res.Category)
		if res.Details != "" {
			fmt.Printf("       詳細分離: %s\n", res.Details)
		}

		if err := executeMasterClean(db, t.ID, res); err != nil {
			fmt.Printf("    ❌ DB更新エラー: %v\n", err)
		} else {
			fmt.Println("    ✅ 完了！")
		}

		time.Sleep(1500 * time.Millisecond)
	}
	fmt.Println("\n✨ 全てのお掃除が完了しました！")
}

// ★修正: validCategoriesを受け取るように変更
func askGeminiMaster(name, validCategories, apiKey string) (*MasterCleanResult, error) {
	prompt := fmt.Sprintf(`
食材名「%s」のデータを正規化してJSONで出力してください。

【ルール】
1. real_name: 一般名称（「玉ねぎ(みじん切り)」→「玉ねぎ」）。
2. kana: 全角ひらがなの読み（例: たまねぎ）。必須。
3. classification: 「食材」か「調味料」。
4. category: 以下のリストから最も適切なものを選択してください。これ以外の言葉は禁止です。
   [ %s ]
5. details: 補足情報（みじん切り、ソース用、Aなど）。なければ空文字。
`, name, validCategories)

	txt, err := common.CallGemini(prompt, apiKey)
	if err != nil {
		return nil, err
	}

	var res MasterCleanResult
	if err := json.Unmarshal([]byte(txt), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func executeMasterClean(db *sql.DB, oldID int, res *MasterCleanResult) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	var masterID int
	err = tx.QueryRow("SELECT id FROM item_catalog WHERE name = ?", res.RealName).Scan(&masterID)

	if err == sql.ErrNoRows {
		query := `UPDATE item_catalog SET name=?, kana=?, classification=?, category=? WHERE id=?`
		_, err = tx.Exec(query, res.RealName, res.Kana, res.Classification, res.Category, oldID)
		if err != nil {
			tx.Rollback()
			return err
		}
		masterID = oldID
	} else {
		if res.Kana != "" {
			tx.Exec("UPDATE item_catalog SET kana = ? WHERE id = ? AND (kana IS NULL OR kana = '')", res.Kana, masterID)
		}
	}

	if res.Details != "" {
		query := `UPDATE recipe_ingredients SET catalog_id = ?, details = CASE WHEN details = '' THEN ? ELSE details || ' ' || ? END WHERE catalog_id = ?`
		_, err = tx.Exec(query, masterID, res.Details, res.Details, oldID)
		if err != nil {
			tx.Rollback()
			return err
		}
	} else if masterID != oldID {
		_, err = tx.Exec("UPDATE recipe_ingredients SET catalog_id = ? WHERE catalog_id = ?", masterID, oldID)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	if masterID != oldID {
		_, err = tx.Exec("DELETE FROM item_catalog WHERE id = ?", oldID)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}
