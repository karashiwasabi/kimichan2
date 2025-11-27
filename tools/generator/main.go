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

// ★修正: 原文フィールドを追加
type GeneratedRecipe struct {
	Name        string `json:"name"`
	Yield       string `json:"yield"`
	Ingredients []struct {
		Name   string `json:"name"`
		Amount string `json:"amount"`
	} `json:"ingredients"`
	Process        any    `json:"process"`
	RawIngredients string `json:"raw_ingredients"` // ★材料の原文
	RawProcess     string `json:"raw_process"`     // ★作り方の原文
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

	fmt.Println("🤖 レシピ収集ロボット (原文保存版)、起動...")

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
					saveRecipe(db, recipe, link)
					totalCollected++
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
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...")
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
	json.Unmarshal([]byte(resStr), &res)
	return &res, nil
}

func analyzeByGemini(text string) (*GeneratedRecipe, error) {
	if len(text) > 40000 {
		text = text[:40000]
	}
	// ★修正: 原文(raw_*)も出力するように指示
	prompt := `レシピ情報をJSON抽出。JSONのみ出力。
keys: 
- name
- yield
- ingredients [{name, amount}]
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
		return nil, err
	}
	return &r, nil
}

func saveRecipe(db *sql.DB, r *GeneratedRecipe, sourceURL string) {
	if r == nil || r.Name == "" {
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

	// もしAIが原文を空で返してきたら、整形済みテキストで代用する
	if r.RawProcess == "" {
		r.RawProcess = processText
	}
	// 材料原文が空なら、とりあえずJSON文字列表現を入れておく(無いよりマシ)
	if r.RawIngredients == "" {
		b, _ := json.Marshal(r.Ingredients)
		r.RawIngredients = string(b)
	}

	tx, err := db.Begin()
	if err != nil {
		log.Println(err)
		return
	}

	// ★修正: original_ingredients, original_process も保存
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
		if utf8.RuneCountInString(ing.Name) > 15 || strings.Contains(ing.Name, "味変") {
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
			recipeID, catalogID, "", ing.Amount, "")
	}
	tx.Commit()
	fmt.Printf("    ✅ 保存完了: %s\n", r.Name)
}
