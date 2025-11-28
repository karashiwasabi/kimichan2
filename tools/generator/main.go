package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"kimichan/tools/common"

	"github.com/PuerkitoBio/goquery"
	_ "github.com/mattn/go-sqlite3"
)

const TARGET_URL = "https://bazurecipe.com/"
const LIMIT_TOTAL = 100
const LIMIT_PER_PAGE = 10
const STATE_FILE = "generator_state.txt"

type LinkAnalysisResult struct {
	RecipeLinks []string `json:"recipe_links"`
	NextPageURL string   `json:"next_page_url"`
}

type GeneratedRecipe struct {
	Name        string `json:"name"`
	Yield       string `json:"yield"`
	Ingredients []struct {
		Name    string `json:"name"`
		Amount  string `json:"amount"`  // 単位込み
		Details string `json:"details"` // 追加: 詳細情報
	} `json:"ingredients"`
	Process        any    `json:"process"`
	RawIngredients string `json:"raw_ingredients"`
	RawProcess     string `json:"raw_process"`
}

var apiKey string

func main() {
	cfg, err := common.LoadConfig()
	if err != nil {
		log.Fatal(err)
	}
	apiKey = cfg.GeminiApiKey

	db, err := common.ConnectDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("🤖 レシピ収集ロボット (3列フォーマット対応版)、起動...")

	currentURL := TARGET_URL
	totalCollected := 0

	for {
		if totalCollected >= LIMIT_TOTAL {
			break
		}
		fmt.Printf("\n📄 ページ解析中... [%s]\n", currentURL)

		htmlText, err := fetchHTML(currentURL)
		if err != nil {
			log.Println("取得エラー:", err)
			break
		}

		analysis, err := askGeminiForLinksAndNext(htmlText, currentURL)
		if err != nil {
			log.Println("解析エラー:", err)
			break
		}

		links := analysis.RecipeLinks
		if len(links) > LIMIT_PER_PAGE {
			links = links[:LIMIT_PER_PAGE]
		}
		fmt.Printf("📦 発見: %d 件 / 次へ: %s\n", len(links), analysis.NextPageURL)

		for _, link := range links {
			if totalCollected >= LIMIT_TOTAL {
				break
			}
			fmt.Printf("  🍳 解析中: %s ...\n", link)

			detailHTML, err := fetchHTML(link)
			if err == nil {
				recipe, err := analyzeByGemini(detailHTML)
				if err == nil {
					// 保存
					if err := saveRecipe(db, recipe, link); err != nil {
						fmt.Printf("    ❌ 保存エラー: %v\n", err)
					} else {
						totalCollected++
					}
				} else {
					fmt.Printf("    ❌ AI解析失敗: %v\n", err)
				}
			}
			time.Sleep(2 * time.Second)
		}

		if analysis.NextPageURL != "" && analysis.NextPageURL != currentURL {
			currentURL = analysis.NextPageURL
		} else {
			break
		}
	}
	fmt.Println("\n✨ 完了しました！")
}

func fetchHTML(url string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return "", err
	}
	doc.Find("script, style, nav, footer, iframe, svg").Remove()
	return doc.Find("body").Text(), nil
}

func askGeminiForLinksAndNext(text, baseURL string) (*LinkAnalysisResult, error) {
	if len(text) > 50000 {
		text = text[:50000]
	}
	prompt := fmt.Sprintf(`以下からレシピ詳細URLと次ページURLをJSON抽出。JSONのみ出力。
1. "recipe_links": URLリスト
2. "next_page_url": 次ページURL(なければ空文字)
BaseURL: %s
Text: %s`, baseURL, text)

	resStr, err := common.CallGemini(prompt, apiKey)
	if err != nil {
		return nil, err
	}
	var res LinkAnalysisResult
	if err := json.Unmarshal([]byte(resStr), &res); err != nil {
		return nil, fmt.Errorf("json解析失敗: %v", err)
	}
	return &res, nil
}

func analyzeByGemini(text string) (*GeneratedRecipe, error) {
	if len(text) > 40000 {
		text = text[:40000]
	}
	// ★修正: amountに単位を含めること、detailsを抽出することを指示
	prompt := `レシピ情報をJSON抽出。JSONのみ出力。
keys: 
- name
- yield
- ingredients [{name, amount(単位込みの分量文字列), details(補足情報)}]
- raw_ingredients (材料リストの原文そのままのテキスト)
- process (手順の配列)
- raw_process (手順の原文そのままのテキスト)

Text: ` + text

	resStr, err := common.CallGemini(prompt, apiKey)
	if err != nil {
		return nil, err
	}
	var r GeneratedRecipe
	if err := json.Unmarshal([]byte(resStr), &r); err != nil {
		return nil, fmt.Errorf("json解析失敗: %v", err)
	}
	return &r, nil
}

func saveRecipe(db *sql.DB, r *GeneratedRecipe, sourceURL string) error {
	if r == nil || r.Name == "" {
		return fmt.Errorf("レシピデータが空です")
	}

	var exists int
	err := db.QueryRow("SELECT count(*) FROM recipes WHERE name = ?", r.Name).Scan(&exists)
	if err != nil {
		return fmt.Errorf("db検索エラー: %v", err)
	}
	if exists > 0 {
		fmt.Printf("    ⚠️ 登録済み: %s\n", r.Name)
		return nil
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
		return fmt.Errorf("tx開始エラー: %v", err)
	}

	res, err := tx.Exec("INSERT INTO recipes(name, yield, process, original_ingredients, original_process, url) VALUES(?, ?, ?, ?, ?, ?)",
		r.Name, r.Yield, processText, r.RawIngredients, r.RawProcess, sourceURL)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("レシピ保存エラー: %v", err)
	}
	recipeID, _ := res.LastInsertId()

	for _, ing := range r.Ingredients {
		if ing.Name == "" {
			continue
		}
		if utf8.RuneCountInString(ing.Name) > 15 || strings.Contains(ing.Name, "味変") || strings.Contains(ing.Name, "お好み") {
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

		// ★修正: unitは空文字、amountに単位込みの分量、detailsを保存
		tx.Exec("INSERT INTO recipe_ingredients(recipe_id, catalog_id, unit, amount, group_name, details) VALUES(?, ?, ?, ?, ?, ?)",
			recipeID, catalogID, "", ing.Amount, "", ing.Details)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("コミットエラー: %v", err)
	}
	fmt.Printf("    ✅ 保存完了: %s\n", r.Name)
	return nil
}
