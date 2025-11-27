package common

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// 設定ファイル
const CONFIG_FILE = "config.json"

type Config struct {
	GeminiApiKey string `json:"gemini_api_key"`
}

// Geminiのリクエスト構造体
type GeminiRequest struct {
	Contents []Content `json:"contents"`
}
type Content struct {
	Parts []Part `json:"parts"`
}
type Part struct {
	Text string `json:"text"`
}
type GeminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

// --- 共通関数 ---

// 設定を読み込む
func LoadConfig() (*Config, error) {
	// 親フォルダなども探す
	wd, _ := os.Getwd()
	paths := []string{
		filepath.Join(wd, CONFIG_FILE),
		filepath.Join(wd, "..", CONFIG_FILE),
		filepath.Join(wd, "..", "..", CONFIG_FILE),
	}

	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			file, err := os.Open(p)
			if err != nil {
				return nil, err
			}
			defer file.Close()
			var cfg Config
			if err := json.NewDecoder(file).Decode(&cfg); err == nil {
				return &cfg, nil
			}
		}
	}
	return nil, fmt.Errorf("config.json が見つかりません")
}

// DBに接続する
func ConnectDB() (*sql.DB, error) {
	wd, _ := os.Getwd()

	// ★変更: dataフォルダの中を優先的に探すように変更
	paths := []string{
		filepath.Join(wd, "data", "kimichan.db"),             // tools/common/data/kimichan.db (稀)
		filepath.Join(wd, "kimichan.db"),                     // カレント (旧)
		filepath.Join(wd, "..", "data", "kimichan.db"),       // tools/data/kimichan.db
		filepath.Join(wd, "..", "..", "data", "kimichan.db"), // kimichan2/data/kimichan.db (★本命)
	}

	var dbPath string
	for _, p := range paths {
		// フォルダが存在するかチェック（ファイルがなくてもフォルダがあればOKとする）
		dir := filepath.Dir(p)
		if _, err := os.Stat(dir); err == nil {
			dbPath = p
			break
		}
	}

	if dbPath == "" {
		// 見つからなければカレントのdataフォルダを指定
		dbPath = filepath.Join("data", "kimichan.db")
		os.MkdirAll("data", 0755) // 念のため作成
	}

	return sql.Open("sqlite3", dbPath)
}

// Geminiを呼び出す
func CallGemini(prompt string, apiKey string) (string, error) {
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey
	reqBody, _ := json.Marshal(GeminiRequest{Contents: []Content{{Parts: []Part{{Text: prompt}}}}})

	for i := 0; i < 3; i++ {
		resp, err := http.Post(url, "application/json", bytes.NewBuffer(reqBody))
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode == 200 {
			var geminiResp GeminiResponse
			json.Unmarshal(body, &geminiResp)
			if len(geminiResp.Candidates) == 0 {
				return "", fmt.Errorf("応答なし")
			}
			txt := geminiResp.Candidates[0].Content.Parts[0].Text

			// JSON切り出し
			start := strings.Index(txt, "{")
			if start == -1 {
				start = strings.Index(txt, "[")
			} // 配列の場合も考慮

			end := strings.LastIndex(txt, "}")
			if end == -1 {
				end = strings.LastIndex(txt, "]")
			}

			if start != -1 && end != -1 {
				return txt[start : end+1], nil
			}
			return "", fmt.Errorf("JSONが見つかりません")
		}
		if resp.StatusCode == 503 {
			time.Sleep(3 * time.Second)
			continue
		}
		return "", fmt.Errorf("API Error: %s", resp.Status)
	}
	return "", fmt.Errorf("リトライ上限")
}
