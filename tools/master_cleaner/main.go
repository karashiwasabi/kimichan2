package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
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

	fmt.Println("🧹 スーパーお掃除ロボット (よみがな絶対埋める版)、起動します...")

	// 1. マスタCSV読み込み
	masterMap := make(map[string]MasterRecord)
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
		}
		file.Close()
		fmt.Printf("📚 マスタデータ %d 件をメモリに読み込みました。\n", len(masterMap))
	}

	// 2. DBチェック（kanaも取得！）
	rows, err := db.Query("SELECT id, name, kana, classification, category FROM item_catalog")
	if err != nil {
		log.Fatal(err)
	}

	type Target struct {
		ID   int
		Name string
		Kana string // DBの現状のカナ
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
		// マスタにあるか？
		master, inMaster := masterMap[t.Name]

		// ★スキップ判定（ここを厳しくした）
		// 「マスタにあって、かつ情報が一致していて、かつカナも埋まっている」ならスキップ
		if inMaster && t.Cls == master.Classification && t.Cat == master.Category && t.Kana != "" {
			continue
		}

		fmt.Printf("[%d/%d] 補完中: %s ... ", i+1, len(targets), t.Name)

		// AIに聞く（マスタにあっても、カナを知りたいから聞く）
		res, err := askGeminiMaster(t.Name, cfg.GeminiApiKey)
		if err != nil {
			fmt.Printf("❌ AIエラー: %v\n", err)
			continue
		}

		// ★ハイブリッド判定
		// マスタにあるなら、分類とカテゴリはマスタを優先（強制上書き）
		if inMaster {
			res.Classification = master.Classification
			res.Category = master.Category
			// 名前もマスタ通りに（表記ゆれ防止）
			res.RealName = t.Name
		}

		// よみがなが空ならスキップしないように、変更フラグを立てる
		needsUpdate := false
		if res.RealName != t.Name {
			needsUpdate = true
		}
		if t.Cls == "" && res.Classification != "" {
			needsUpdate = true
		}
		if t.Cat == "" && res.Category != "" {
			needsUpdate = true
		}
		if t.Kana == "" && res.Kana != "" {
			needsUpdate = true
		} // カナが埋まるなら更新！

		if !needsUpdate {
			fmt.Println("🆗 変更なし")
			continue
		}

		fmt.Printf("\n    👉 修正: [%s(%s)] 分類:%s / カテゴリ:%s\n",
			res.RealName, res.Kana, res.Classification, res.Category)

		if err := executeMasterClean(db, t.ID, res); err != nil {
			fmt.Printf("    ❌ DB更新エラー: %v\n", err)
		} else {
			fmt.Println("    ✅ 完了！")
		}

		time.Sleep(1500 * time.Millisecond)
	}
	fmt.Println("\n✨ 全てのお掃除が完了しました！")
}

func askGeminiMaster(name, apiKey string) (*MasterCleanResult, error) {
	prompt := fmt.Sprintf(`
食材名「%s」のデータを正規化してJSONで出力してください。

【ルール】
1. real_name: 一般名称（「玉ねぎ(みじん切り)」→「玉ねぎ」）。
2. kana: 全角ひらがなの読み（例: たまねぎ）。必須。
3. classification: 「食材」か「調味料」。
4. category: 「野菜」「肉」「魚介」「乾物」など。
5. details: 補足情報（みじん切り、ソース用、Aなど）。なければ空文字。
`, name)

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

	// 1. 名寄せ先（正しい名前）があるか探す
	var masterID int
	err = tx.QueryRow("SELECT id FROM item_catalog WHERE name = ?", res.RealName).Scan(&masterID)

	if err == sql.ErrNoRows {
		// ない -> 今のIDのまま、情報を更新する
		query := `UPDATE item_catalog SET name=?, kana=?, classification=?, category=? WHERE id=?`
		_, err = tx.Exec(query, res.RealName, res.Kana, res.Classification, res.Category, oldID)
		if err != nil {
			tx.Rollback()
			return err
		}
		masterID = oldID
	} else {
		// ある -> 既存のほう(masterID)のカナが空なら、埋めてあげる
		if res.Kana != "" {
			tx.Exec("UPDATE item_catalog SET kana = ? WHERE id = ? AND (kana IS NULL OR kana = '')", res.Kana, masterID)
		}
	}

	// 2. 詳細情報の退避（レシピ側）
	if res.Details != "" {
		query := `UPDATE recipe_ingredients SET catalog_id = ?, details = CASE WHEN details = '' THEN ? ELSE details || ' ' || ? END WHERE catalog_id = ?`
		_, err = tx.Exec(query, masterID, res.Details, res.Details, oldID)
		if err != nil {
			tx.Rollback()
			return err
		}
	} else if masterID != oldID {
		// 詳細はないが、ID統合が必要な場合
		_, err = tx.Exec("UPDATE recipe_ingredients SET catalog_id = ? WHERE catalog_id = ?", masterID, oldID)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	// 3. 古いIDの削除（統合された場合）
	if masterID != oldID {
		_, err = tx.Exec("DELETE FROM item_catalog WHERE id = ?", oldID)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}
