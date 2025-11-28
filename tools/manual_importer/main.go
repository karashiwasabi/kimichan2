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
	"text/tabwriter"

	"kimichan/tools/common"
)

const INPUT_FILE = "manual_input.txt"
const SUBST_FILE = "substitutions.csv"

type GeneratedRecipe struct {
	Name        string `json:"name"`
	Yield       string `json:"yield"`
	Ingredients []struct {
		Name    string `json:"name"`
		Amount  string `json:"amount"` // 単位込み
		Group   string `json:"group"`
		Details string `json:"details"` // 詳細情報
	} `json:"ingredients"`
	Process        any    `json:"process"`
	RawIngredients string `json:"raw_ingredients"`
	RawProcess     string `json:"raw_process"`
}

// AIの名寄せ結果
type NormalizeResult struct {
	StandardName string `json:"standard_name"`
	Kana         string `json:"kana"`
	Details      string `json:"details"`
}

// 強制変換ルール
type Substitution struct {
	TargetName string
	Details    string
}

var apiKey string
var nameSubstitutions map[string]Substitution

func main() {
	// 設定読み込み
	cfg, err := common.LoadConfig()
	if err != nil {
		log.Fatal(err)
	}
	apiKey = cfg.GeminiApiKey

	// 辞書読み込み
	loadSubstitutions()

	// DB接続
	db, err := common.ConnectDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("📝 手動レシピ取込ロボット (3列・辞書・ヨミガナ自動付与版)、起動...")

	// テーブルがなければ作成する
	fixDatabaseSchema(db)

	wd, _ := os.Getwd()
	inputPath := filepath.Join(wd, INPUT_FILE)
	if _, err := os.Stat(inputPath); os.IsNotExist(err) {
		inputPath = filepath.Join(wd, "..", "..", INPUT_FILE)
	}

	contentBytes, err := os.ReadFile(inputPath)
	if err != nil {
		log.Fatalf("❌ 入力ファイル(%s)が見つかりません", INPUT_FILE)
	}
	content := string(contentBytes)
	if strings.TrimSpace(content) == "" {
		log.Fatal("❌ ファイルが空っぽです")
	}

	fmt.Println("🔎 テキスト解析中...")

	recipes, rawResp, err := analyzeManualText(content, apiKey)
	if err != nil {
		log.Println("❌ AI解析エラー:", err)
		fmt.Println(rawResp)
		return
	}

	fmt.Printf("📦 %d 件のレシピを検出。\n", len(recipes))

	for i, r := range recipes {
		// 表示や保存の前に強制変換を適用する
		applySubstitutions(&r)

		fmt.Printf("\n[%d/%d] %s\n", i+1, len(recipes), r.Name)
		printComparison(&r)
		saveRecipe(db, &r, "手動入力")
	}

	fmt.Println("\n✨ 完了しました！")
	os.WriteFile(inputPath, []byte(""), 0644)
}

func loadSubstitutions() {
	nameSubstitutions = make(map[string]Substitution)

	// ★修正: 探索パスのパターンを増やしました
	// 1. カレントディレクトリ (tools/manual_importerで実行時)
	// 2. tools/manual_importer/ (プロジェクトルートで実行時)
	// 3. ../../ (念のため)
	candidates := []string{
		SUBST_FILE,
		filepath.Join("tools", "manual_importer", SUBST_FILE),
		filepath.Join("..", "..", SUBST_FILE),
	}

	var file *os.File
	var err error
	var foundPath string

	for _, path := range candidates {
		file, err = os.Open(path)
		if err == nil {
			foundPath = path
			break
		}
	}

	if file == nil {
		fmt.Println("⚠️ 誤変換辞書(CSV)が見つかりません。辞書なしで続行します。")
		// デバッグ: どこを探したか表示した方が親切な場合はコメントアウトを外してください
		// fmt.Printf("(探索パス: %v)\n", candidates)
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	_, _ = reader.Read() // ヘッダースキップ
	records, _ := reader.ReadAll()

	for _, record := range records {
		if len(record) < 2 {
			continue
		}
		nameSubstitutions[record[0]] = Substitution{
			TargetName: record[1],
			Details:    strings.TrimSpace(getAt(record, 2)),
		}
	}
	fmt.Printf("📚 誤変換辞書を読み込みました(%s): %d件\n", foundPath, len(nameSubstitutions))
}

func getAt(s []string, i int) string {
	if i < len(s) {
		return s[i]
	}
	return ""
}

// レシピデータに対して強制変換を適用する関数
func applySubstitutions(r *GeneratedRecipe) {
	for i := range r.Ingredients {
		ing := &r.Ingredients[i]
		if fix, ok := nameSubstitutions[ing.Name]; ok {
			// fmt.Printf("    🔄 変換: %s -> %s\n", ing.Name, fix.TargetName)
			ing.Name = fix.TargetName
			if ing.Details != "" && fix.Details != "" {
				ing.Details = fix.Details + " " + ing.Details
			} else if fix.Details != "" {
				ing.Details = fix.Details
			}
		}
	}
}

func saveRecipe(db *sql.DB, r *GeneratedRecipe, sourceURL string) {
	if r.Name == "" {
		return
	}
	var exists int
	db.QueryRow("SELECT count(*) FROM recipes WHERE name = ?", r.Name).Scan(&exists)
	if exists > 0 {
		fmt.Printf("    ⚠️ 登録済みのためスキップ\n")
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
		log.Println("Tx開始エラー:", err)
		return
	}

	res, err := tx.Exec("INSERT INTO recipes(name, yield, process, original_ingredients, original_process, url) VALUES(?, ?, ?, ?, ?, ?)",
		r.Name, r.Yield, processText, r.RawIngredients, r.RawProcess, sourceURL)
	if err != nil {
		tx.Rollback()
		log.Println("保存エラー:", err)
		return
	}
	recipeID, _ := res.LastInsertId()

	for _, ing := range r.Ingredients {
		if ing.Name == "" {
			continue
		}
		if len([]rune(ing.Name)) > 20 || strings.Contains(ing.Name, "味変") {
			continue
		}

		// DB検索
		var catalogID int
		db.QueryRow("SELECT id FROM item_catalog WHERE name = ?", ing.Name).Scan(&catalogID)

		detailsToSave := ing.Details

		if catalogID == 0 {
			// AI名寄せ
			fmt.Printf("    ❓ 未知: %s -> 名寄せ...", ing.Name)
			norm, err := askGeminiNormalize(ing.Name, apiKey)

			if err == nil && norm.StandardName != "" {
				// 1. 標準名で検索
				db.QueryRow("SELECT id FROM item_catalog WHERE name = ?", norm.StandardName).Scan(&catalogID)

				// 2. カナで検索 (AIが「ナス(カナ:なす)」と返した場合、DBの「なす」にヒットさせる)
				if catalogID == 0 && norm.Kana != "" {
					db.QueryRow("SELECT id FROM item_catalog WHERE name = ?", norm.Kana).Scan(&catalogID)
					if catalogID != 0 {
						norm.StandardName = norm.Kana // ヒットしたら名前をDB側に合わせる
					}
				}

				if catalogID != 0 {
					fmt.Printf(" 💡 統合: %s (詳細:%s)\n", norm.StandardName, norm.Details)
					if norm.Details != "" {
						if detailsToSave != "" {
							detailsToSave += " " + norm.Details
						} else {
							detailsToSave = norm.Details
						}
					}
				} else {
					fmt.Printf(" 🆕 新規: %s (%s)\n", norm.StandardName, norm.Kana)

					// 新規登録
					err := tx.QueryRow("SELECT id FROM item_catalog WHERE name = ?", norm.StandardName).Scan(&catalogID)
					if err == sql.ErrNoRows {
						res, err := tx.Exec("INSERT INTO item_catalog(name, kana, classification, category, default_unit) VALUES(?, ?, ?, ?, ?)",
							norm.StandardName, norm.Kana, "食材", "未分類", "")
						if err == nil {
							nid, _ := res.LastInsertId()
							catalogID = int(nid)
						} else {
							tx.QueryRow("SELECT id FROM item_catalog WHERE name = ?", norm.StandardName).Scan(&catalogID)
						}
					}

					if norm.Details != "" {
						if detailsToSave != "" {
							detailsToSave += " " + norm.Details
						} else {
							detailsToSave = norm.Details
						}
					}
				}
			} else {
				fmt.Printf(" -> そのまま登録\n")
				err := tx.QueryRow("SELECT id FROM item_catalog WHERE name = ?", ing.Name).Scan(&catalogID)
				if err == sql.ErrNoRows {
					res, err := tx.Exec("INSERT INTO item_catalog(name, kana, classification, category, default_unit) VALUES(?, ?, ?, ?, ?)",
						ing.Name, "", "食材", "未分類", "")
					if err == nil {
						nid, _ := res.LastInsertId()
						catalogID = int(nid)
					} else {
						tx.QueryRow("SELECT id FROM item_catalog WHERE name = ?", ing.Name).Scan(&catalogID)
					}
				}
			}
		}

		if catalogID != 0 {
			_, err := tx.Exec("INSERT INTO recipe_ingredients(recipe_id, catalog_id, unit, amount, group_name, details) VALUES(?, ?, ?, ?, ?, ?)",
				recipeID, catalogID, "", ing.Amount, ing.Group, detailsToSave)
			if err != nil {
				log.Printf("    ❌ 材料保存エラー(%s): %v", ing.Name, err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		log.Println("コミットエラー:", err)
		return
	}
	fmt.Printf("    ✅ 保存完了\n")
}

func askGeminiNormalize(name, apiKey string) (*NormalizeResult, error) {
	// AI指示: 野菜はひらがな優先
	prompt := fmt.Sprintf(`
食材名「%s」を正規化し、JSONで出力してください。

【重要: 表記ルール】
1. 一般的な野菜（なす、だいこん、にんじん、ピーマン等）は、生物学的なカタカナ表記ではなく、**料理データベースとして一般的な「ひらがな」または「一般的な漢字」** に統一してください。
   例: ナス -> なす, 茄子 -> なす, ニラ -> ニラ(カタカナが一般的), ピーマン -> ピーマン
2. 「standard_name」にはその統一した名称を入れてください。
3. 「kana」には全角ひらがなの読みを入れてください。
4. 「details」には形状や状態（粉末、みじん切り等）を入れてください。

JSON形式:
{"standard_name": "なす", "kana": "なす", "details": ""}
`, name)

	resStr, err := common.CallGemini(prompt, apiKey)
	if err != nil {
		return nil, err
	}
	var res NormalizeResult
	if err := json.Unmarshal([]byte(resStr), &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func fixDatabaseSchema(db *sql.DB) {
	db.Exec(`CREATE TABLE IF NOT EXISTS item_catalog (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		kana TEXT,
		classification TEXT NOT NULL,
		category TEXT,
		default_unit TEXT
	);`)

	db.Exec(`CREATE TABLE IF NOT EXISTS recipes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		yield TEXT,
		process TEXT,
		url TEXT,
		original_ingredients TEXT DEFAULT '',
		original_process TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`)

	db.Exec(`CREATE TABLE IF NOT EXISTS recipe_ingredients (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		recipe_id INTEGER NOT NULL,
		catalog_id INTEGER NOT NULL,
		unit TEXT,
		amount TEXT,
		group_name TEXT,
		details TEXT DEFAULT '',
		FOREIGN KEY (recipe_id) REFERENCES recipes (id),
		FOREIGN KEY (catalog_id) REFERENCES item_catalog (id)
	);`)

	sqls := []string{
		"ALTER TABLE recipes ADD COLUMN original_ingredients TEXT DEFAULT ''",
		"ALTER TABLE recipes ADD COLUMN original_process TEXT DEFAULT ''",
		"ALTER TABLE recipe_ingredients ADD COLUMN details TEXT DEFAULT ''",
		"ALTER TABLE item_catalog ADD COLUMN kana TEXT",
	}
	for _, q := range sqls {
		db.Exec(q)
	}
}

func analyzeManualText(text string, apiKey string) ([]GeneratedRecipe, string, error) {
	prompt := `
以下のテキストデータから、料理レシピの情報を抽出し、JSON配列で出力してください。
【抽出ルール】
- name: 料理名
- yield: 何人分か
- ingredients: 材料リスト
    - name: 材料名
      ※重要: "かき"等の同音異義語は、レシピの文脈（鍋なら"牡蠣"、デザートなら"柿"）から判断して適切な漢字に変換してください。
    - amount: 分量 (単位込みで記述。例: "1/2本", "200g", "少々")
    - group: グループ名（"A", "ソース"など。なければ空文字）
    - details: 詳細情報・補足（例: "みじん切り", "冷凍", "飾り用"など。なければ空文字）
- raw_ingredients: 材料リストの原文
- process: 作り方の手順
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

func printComparison(r *GeneratedRecipe) {
	fmt.Printf("🍳 %s\n", r.Name)
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 4, ' ', 0)
	fmt.Fprintln(w, "【 原文 】\t|\t【 AI解析 (3列形式) 】")
	fmt.Fprintln(w, "----------\t|\t-----------------------")

	rawLines := strings.Split(strings.TrimSpace(r.RawIngredients), "\n")
	var aiLines []string
	for _, ing := range r.Ingredients {
		line := fmt.Sprintf("%s : %s", ing.Name, ing.Amount)
		if ing.Details != "" {
			line += fmt.Sprintf(" (%s)", ing.Details)
		}
		if ing.Group != "" {
			line += fmt.Sprintf(" <%s>", ing.Group)
		}
		aiLines = append(aiLines, line)
	}

	maxLen := len(rawLines)
	if len(aiLines) > maxLen {
		maxLen = len(aiLines)
	}

	for i := 0; i < maxLen; i++ {
		left, right := "", ""
		if i < len(rawLines) {
			left = strings.TrimSpace(rawLines[i])
			if len([]rune(left)) > 20 {
				left = string([]rune(left)[:18]) + ".."
			}
		}
		if i < len(aiLines) {
			right = aiLines[i]
		}
		if left != "" || right != "" {
			fmt.Fprintf(w, "%s\t|\t%s\n", left, right)
		}
	}
	w.Flush()
	fmt.Println("--------------------------------------------------")
}
