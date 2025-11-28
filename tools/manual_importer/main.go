package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"text/tabwriter" // ★追加: 整形表示用

	"kimichan/tools/common"
)

const INPUT_FILE = "manual_input.txt"

// 生成されるレシピの構造
type GeneratedRecipe struct {
	Name        string `json:"name"`
	Yield       string `json:"yield"`
	Ingredients []struct {
		Name   string `json:"name"`
		Amount string `json:"amount"`
		Group  string `json:"group"`
	} `json:"ingredients"`
	Process        any    `json:"process"`
	RawIngredients string `json:"raw_ingredients"`
	RawProcess     string `json:"raw_process"`
}

func main() {
	// 1. 設定読み込み
	cfg, err := common.LoadConfig()
	if err != nil {
		log.Fatal(err)
	}

	// 2. DB接続
	db, err := common.ConnectDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("📝 手動レシピ取込ロボット (比較表示版)、起動します...")

	// 自動修復
	fixDatabaseSchema(db)

	// 3. ファイル読み込み
	wd, _ := os.Getwd()
	inputPath := filepath.Join(wd, INPUT_FILE)
	if _, err := os.Stat(inputPath); os.IsNotExist(err) {
		inputPath = filepath.Join(wd, "..", "..", INPUT_FILE)
	}

	contentBytes, err := os.ReadFile(inputPath)
	if err != nil {
		log.Fatalf("❌ 入力ファイル(%s)が見つかりません: %v", INPUT_FILE, err)
	}
	content := string(contentBytes)

	if strings.TrimSpace(content) == "" {
		log.Fatal("❌ ファイルが空っぽです。レシピのテキストを貼り付けてください。")
	}

	fmt.Println("🔎 テキストを解析中...")

	// 4. AI解析
	recipes, rawResponse, err := analyzeManualText(content, cfg.GeminiApiKey)
	if err != nil {
		log.Println("❌ AI解析エラー:", err)
		fmt.Println("--- AIの生応答 ---")
		fmt.Println(rawResponse)
		return
	}

	fmt.Printf("📦 %d 件のレシピを検出しました。\n", len(recipes))

	// 5. 比較表示と保存
	for i, r := range recipes {
		fmt.Printf("\n[%d/%d] 解析結果の確認:\n", i+1, len(recipes))

		// ★ここで左右に並べて表示
		printComparison(&r)

		if r.Name == "" {
			fmt.Println("  ⚠️ エラー: レシピ名が空です。スキップします。")
			continue
		}

		// 保存
		saveRecipe(db, &r, "手動入力")
	}

	fmt.Println("\n✨ 完了しました！")
	os.WriteFile(inputPath, []byte(""), 0644)
}

// ★追加: 左右比較表示関数
func printComparison(r *GeneratedRecipe) {
	fmt.Printf("🍳 レシピ名: %s (%s)\n", r.Name, r.Yield)

	// タブ区切りライターを作成 (minwidth, tabwidth, padding, padchar, flags)
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 4, ' ', 0)

	// ヘッダー
	fmt.Fprintln(w, "【 原文 (あなたの入力) 】\t|\t【 AI解析 (DB登録データ) 】")
	fmt.Fprintln(w, "------------------------------\t|\t------------------------------")

	// 原文を行に分解
	rawLines := strings.Split(strings.TrimSpace(r.RawIngredients), "\n")

	// 解析結果を行に分解
	var aiLines []string
	for _, ing := range r.Ingredients {
		line := fmt.Sprintf("%s : %s", ing.Name, ing.Amount)
		if ing.Group != "" {
			line += fmt.Sprintf(" <%s>", ing.Group)
		}
		aiLines = append(aiLines, line)
	}

	// 行数が多い方に合わせる
	maxLen := len(rawLines)
	if len(aiLines) > maxLen {
		maxLen = len(aiLines)
	}

	// 左右に出力
	for i := 0; i < maxLen; i++ {
		left := ""
		if i < len(rawLines) {
			left = strings.TrimSpace(rawLines[i])
			// 長すぎるとレイアウト崩れるのでカット
			if len([]rune(left)) > 30 {
				left = string([]rune(left)[:28]) + ".."
			}
		}

		right := ""
		if i < len(aiLines) {
			right = aiLines[i]
		}

		if left != "" || right != "" {
			fmt.Fprintf(w, "%s\t|\t%s\n", left, right)
		}
	}

	w.Flush() // 出力実行
	fmt.Println("------------------------------------------------------------")
}

func fixDatabaseSchema(db *sql.DB) {
	sqls := []string{
		"ALTER TABLE recipes ADD COLUMN original_ingredients TEXT DEFAULT ''",
		"ALTER TABLE recipes ADD COLUMN original_process TEXT DEFAULT ''",
	}
	for _, q := range sqls {
		db.Exec(q)
	}
}

func analyzeManualText(text string, apiKey string) ([]GeneratedRecipe, string, error) {
	// プロンプト微調整: 原文もしっかり取るように指示
	prompt := `
以下のテキストデータから、料理レシピの情報を抽出し、JSON配列で出力してください。

【抽出ルール】
- name: 料理名 (必須)
- yield: 何人分か
- ingredients: 材料リスト
    - name: 材料名
    - amount: 分量
    - group: グループ名（例: "A", "ソース"など。なければ空文字）
- raw_ingredients: 材料リストの原文（コピペされたテキストそのまま）
- process: 作り方の手順（配列または文字列）
- raw_process: 作り方の原文

【データ】
` + text

	resStr, err := common.CallGemini(prompt, apiKey)
	if err != nil {
		return nil, "", err
	}

	var recipes []GeneratedRecipe
	if err := json.Unmarshal([]byte(resStr), &recipes); err != nil {
		var single GeneratedRecipe
		if err2 := json.Unmarshal([]byte(resStr), &single); err2 == nil {
			return []GeneratedRecipe{single}, resStr, nil
		}
		return nil, resStr, fmt.Errorf("JSON解析失敗: %v", err)
	}
	return recipes, resStr, nil
}

func saveRecipe(db *sql.DB, r *GeneratedRecipe, sourceURL string) {
	if r.Name == "" {
		return
	}

	var exists int
	db.QueryRow("SELECT count(*) FROM recipes WHERE name = ?", r.Name).Scan(&exists)
	if exists > 0 {
		fmt.Printf("    ⚠️ 登録済み: %s\n", r.Name)
		return
	}

	var processText string
	if r.Process != nil {
		switch v := r.Process.(type) {
		case string:
			processText = v
		case []interface{}:
			var lines []string
			for _, line := range v {
				if str, ok := line.(string); ok {
					lines = append(lines, str)
				}
			}
			processText = strings.Join(lines, "\n")
		default:
			processText = fmt.Sprintf("%v", v)
		}
	}
	if r.RawProcess == "" {
		r.RawProcess = processText
	}
	if r.RawIngredients == "" {
		b, _ := json.Marshal(r.Ingredients)
		r.RawIngredients = string(b)
	}

	tx, err := db.Begin()
	if err != nil {
		log.Println("TXエラー:", err)
		return
	}

	res, err := tx.Exec("INSERT INTO recipes(name, yield, process, original_ingredients, original_process, url) VALUES(?, ?, ?, ?, ?, ?)",
		r.Name, r.Yield, processText, r.RawIngredients, r.RawProcess, sourceURL)
	if err != nil {
		tx.Rollback()
		log.Println("レシピ保存エラー:", err)
		return
	}
	recipeID, _ := res.LastInsertId()

	for _, ing := range r.Ingredients {
		if ing.Name == "" {
			continue
		}
		// 除外フィルタ
		if len([]rune(ing.Name)) > 15 || strings.Contains(ing.Name, "味変") {
			continue
		}

		var catalogID int
		db.QueryRow("SELECT id FROM item_catalog WHERE name = ?", ing.Name).Scan(&catalogID)
		if catalogID == 0 {
			res, err := tx.Exec("INSERT INTO item_catalog(name, classification, category, default_unit) VALUES(?, ?, ?, ?)",
				ing.Name, "食材", "未分類", "")
			if err != nil {
				continue
			}
			newID, _ := res.LastInsertId()
			catalogID = int(newID)
		}
		tx.Exec("INSERT INTO recipe_ingredients(recipe_id, catalog_id, unit, amount, group_name) VALUES(?, ?, ?, ?, ?)",
			recipeID, catalogID, "", ing.Amount, ing.Group) // Groupも保存
	}
	tx.Commit()
	fmt.Printf("    ✅ 保存完了\n")
}
